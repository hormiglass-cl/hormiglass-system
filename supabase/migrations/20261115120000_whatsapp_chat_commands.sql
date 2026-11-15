-- Revision 1.2b: CRM -> bot chat.take / chat.release through a service-only outbox.
-- The CRM never changes ownership optimistically: only a confirmed `200 applied` with a
-- higher ownership_version moves whatsapp_ownership forward, and it stores exactly the state
-- the bot echoes back (ownership.taken source crm / ownership.released seller_released), so
-- the echo at the same version is an identical no-op in whatsapp_receive_event.
BEGIN;
CREATE TABLE public.whatsapp_crm_outbox (
  event_id text PRIMARY KEY CHECK (event_id ~ '^crm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  type text NOT NULL CHECK (type IN ('chat.take','chat.release')),
  opportunity_id uuid NOT NULL REFERENCES public.oportunidades(id),
  conversation_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.usuarios(id),
  crm_seller_id uuid NOT NULL REFERENCES public.usuarios(id),
  base_version integer NOT NULL CHECK (base_version>=0),
  -- Exact bytes sent on every attempt; the same event_id is never sent with other bytes.
  body text NOT NULL CHECK (octet_length(body)<=65536),
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending','retryable','applied','ignored_stale','rejected','abandoned')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  last_http_status integer,
  error_code text,
  last_response jsonb CHECK (last_response IS NULL OR jsonb_typeof(last_response)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX whatsapp_crm_outbox_conversation_idx ON public.whatsapp_crm_outbox(conversation_id,created_at DESC);
ALTER TABLE public.whatsapp_crm_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_crm_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.whatsapp_crm_outbox TO service_role;

-- Panel state: ownership as last confirmed, what the caller may do, and the last command.
CREATE FUNCTION public.whatsapp_chat_state(p_opportunity_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.whatsapp_lead_links%ROWTYPE; st public.whatsapp_ownership%ROWTYPE;
  c public.whatsapp_crm_outbox%ROWTYPE; actor uuid := public.current_usuario_id();
  is_admin boolean := public.current_rol()='admin'; assigned uuid; holder uuid; last_command jsonb;
BEGIN
  IF NOT public.is_active_user() OR actor IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO l FROM public.whatsapp_lead_links WHERE opportunity_id=p_opportunity_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT asignado_a INTO assigned FROM public.oportunidades WHERE id=l.opportunity_id;
  SELECT * INTO st FROM public.whatsapp_ownership WHERE conversation_id=l.conversation_id;
  SELECT * INTO c FROM public.whatsapp_crm_outbox WHERE conversation_id=l.conversation_id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF c.last_response->>'holder_crm_seller_id' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN
      holder := (c.last_response->>'holder_crm_seller_id')::uuid;
    END IF;
    last_command := jsonb_build_object('type',c.type,'status',c.status,'http_status',c.last_http_status,
      'error_code',c.error_code,'holder_crm_seller_id',holder,
      'holder_name',(SELECT nombre FROM public.usuarios WHERE id=holder),'updated_at',c.updated_at);
  END IF;
  RETURN jsonb_build_object('ownership_version',coalesce(st.version,0),'owner',coalesce(st.owner,'bot'),
    'source',st.source,'holder_crm_seller_id',st.crm_seller_id,
    'holder_name',(SELECT nombre FROM public.usuarios WHERE id=st.crm_seller_id),
    'can_take',public.has_role('user') AND (is_admin OR assigned=actor)
      AND NOT (st.owner IS NOT DISTINCT FROM 'human' AND st.crm_seller_id IS NOT DISTINCT FROM actor),
    'can_release',public.has_role('user') AND st.owner IS NOT DISTINCT FROM 'human' AND st.crm_seller_id IS NOT NULL
      AND (is_admin OR st.crm_seller_id=actor),
    'last_command',last_command);
END $$;

-- Writes the outbox row in the same transaction as the decision (S2). The link row lock
-- serializes commands per conversation. Returns the exact bytes the route must send.
CREATE FUNCTION public.whatsapp_chat_command(p_opportunity_id uuid, p_type text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l public.whatsapp_lead_links%ROWTYPE; st public.whatsapp_ownership%ROWTYPE;
  c public.whatsapp_crm_outbox%ROWTYPE; actor uuid := public.current_usuario_id();
  is_admin boolean := public.current_rol()='admin'; assigned uuid; seller uuid; base integer; eid text; payload text;
BEGIN
  IF NOT public.is_active_user() OR actor IS NULL OR NOT public.has_role('user') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('chat.take','chat.release') THEN RAISE EXCEPTION 'invalid_command'; END IF;
  SELECT * INTO l FROM public.whatsapp_lead_links WHERE opportunity_id=p_opportunity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'chat_not_linked'; END IF;
  SELECT * INTO st FROM public.whatsapp_ownership WHERE conversation_id=l.conversation_id;
  base := coalesce(st.version,0);
  IF p_type='chat.take' THEN
    -- S9: assigned seller or admin; an admin take is sent as the admin.
    SELECT asignado_a INTO assigned FROM public.oportunidades WHERE id=l.opportunity_id;
    IF NOT (is_admin OR assigned IS NOT DISTINCT FROM actor) THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF st.owner IS NOT DISTINCT FROM 'human' AND st.crm_seller_id IS NOT DISTINCT FROM actor THEN RAISE EXCEPTION 'already_holder'; END IF;
    seller := actor;
  ELSE
    -- S5/S9: only the current holder, or an admin on the holder's behalf.
    IF st.owner IS DISTINCT FROM 'human' OR st.crm_seller_id IS NULL THEN RAISE EXCEPTION 'chat_not_taken'; END IF;
    IF NOT (is_admin OR st.crm_seller_id=actor) THEN RAISE EXCEPTION 'not_holder'; END IF;
    seller := st.crm_seller_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.whatsapp_crm_outbox WHERE conversation_id=l.conversation_id
      AND status='sending' AND updated_at>clock_timestamp()-interval '60 seconds') THEN
    RAISE EXCEPTION 'command_in_progress';
  END IF;
  -- A retry of the same command resends the same event_id and bytes (an interrupted send
  -- older than 60 seconds counts as a retry); anything else supersedes older unsent events.
  SELECT * INTO c FROM public.whatsapp_crm_outbox WHERE conversation_id=l.conversation_id
    AND status IN ('retryable','sending') AND type=p_type AND crm_seller_id=seller AND base_version=base
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.whatsapp_crm_outbox SET status='sending',actor_id=actor,updated_at=clock_timestamp() WHERE event_id=c.event_id;
    RETURN jsonb_build_object('event_id',c.event_id,'body',c.body,'reused',true);
  END IF;
  UPDATE public.whatsapp_crm_outbox SET status='abandoned',updated_at=clock_timestamp()
    WHERE conversation_id=l.conversation_id AND status IN ('retryable','sending');
  eid := 'crm-'||gen_random_uuid()::text;
  -- Built as text so key order and bytes are fixed; every value is a uuid, integer or literal.
  payload := format('{"schema_version":1,"protocol_revision":"1.2","event_id":"%s","type":"%s","occurred_at":"%s","data":{"crm_opportunity_id":"%s","crm_seller_id":"%s","ownership_version":%s}}',
    eid,p_type,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),l.opportunity_id,seller,base);
  INSERT INTO public.whatsapp_crm_outbox(event_id,type,opportunity_id,conversation_id,actor_id,crm_seller_id,base_version,body)
    VALUES(eid,p_type,l.opportunity_id,l.conversation_id,actor,seller,base,payload);
  RETURN jsonb_build_object('event_id',eid,'body',payload,'reused',false);
END $$;

-- Service-only outcome recording (S4). Same integration lock as the receiver, so a bot echo
-- and this confirmation are applied one after the other in either order.
CREATE FUNCTION public.whatsapp_chat_command_result(p_event_id text, p_http_status integer, p_response jsonb, p_attempts integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE c public.whatsapp_crm_outbox%ROWTYPE; st public.whatsapp_ownership%ROWTYPE;
  kept jsonb; new_status text; code text; v integer; holder text;
BEGIN
  IF p_attempts IS NULL OR p_attempts NOT BETWEEN 1 AND 10
    OR (p_response IS NOT NULL AND jsonb_typeof(p_response) IS DISTINCT FROM 'object') THEN RAISE EXCEPTION 'invalid_result'; END IF;
  PERFORM pg_advisory_xact_lock(174931,1);
  SELECT * INTO c FROM public.whatsapp_crm_outbox WHERE event_id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'command_not_found'; END IF;
  IF c.status<>'sending' THEN RAISE EXCEPTION 'command_not_sending'; END IF;
  -- Keep only bounded known fields; never store raw upstream bodies.
  SELECT jsonb_object_agg(e.key,e.value) INTO kept FROM jsonb_each(coalesce(p_response,'{}')) e
    WHERE e.key IN ('result','error','ownership_version','holder_crm_seller_id','owner')
      AND jsonb_typeof(e.value) IN ('string','number','null') AND length(e.value::text)<=130;
  IF kept->>'error' ~ '^[a-z][a-z0-9_]{0,63}$' THEN code := kept->>'error'; END IF;
  IF p_http_status=200 THEN
    IF jsonb_typeof(kept->'ownership_version')='number' AND kept->>'ownership_version' ~ '^[0-9]{1,10}$'
      AND (kept->>'ownership_version')::numeric BETWEEN 1 AND 2147483647 THEN v := (kept->>'ownership_version')::integer; END IF;
    IF kept->>'result'='applied' AND v IS NOT NULL THEN new_status := 'applied';
    ELSIF kept->>'result'='ignored_stale' THEN new_status := 'ignored_stale';
    ELSE new_status := 'rejected'; code := 'invalid_response'; END IF;
  ELSIF p_http_status IS NULL OR p_http_status=503 THEN new_status := 'retryable';
  ELSE new_status := 'rejected'; END IF;
  IF new_status='applied' THEN
    SELECT * INTO st FROM public.whatsapp_ownership WHERE conversation_id=c.conversation_id FOR UPDATE;
    IF NOT FOUND OR st.version<v THEN
      INSERT INTO public.whatsapp_ownership(conversation_id,version,owner,crm_seller_id,source,release_reason)
        VALUES(c.conversation_id,v,
          CASE WHEN c.type='chat.take' THEN 'human' ELSE 'bot' END,
          CASE WHEN c.type='chat.take' THEN c.crm_seller_id END,
          CASE WHEN c.type='chat.take' THEN 'crm' END,
          CASE WHEN c.type='chat.release' THEN 'seller_released' END)
        ON CONFLICT(conversation_id) DO UPDATE SET version=excluded.version,owner=excluded.owner,
          crm_seller_id=excluded.crm_seller_id,source=excluded.source,release_reason=excluded.release_reason,updated_at=now()
        WHERE whatsapp_ownership.version<excluded.version;
    END IF;
  END IF;
  UPDATE public.whatsapp_crm_outbox SET status=new_status,attempts=attempts+p_attempts,last_http_status=p_http_status,
    error_code=code,last_response=kept,updated_at=clock_timestamp() WHERE event_id=c.event_id;
  SELECT * INTO st FROM public.whatsapp_ownership WHERE conversation_id=c.conversation_id;
  IF kept->>'holder_crm_seller_id' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN holder := lower(kept->>'holder_crm_seller_id'); END IF;
  RETURN jsonb_build_object('event_id',c.event_id,'type',c.type,'status',new_status,'http_status',p_http_status,
    'error_code',code,'holder_crm_seller_id',holder,'ownership_version',coalesce(st.version,0),'owner',coalesce(st.owner,'bot'));
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_chat_state(uuid),public.whatsapp_chat_command(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_chat_state(uuid),public.whatsapp_chat_command(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_chat_command_result(text,integer,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_chat_command_result(text,integer,jsonb,integer) TO service_role;
COMMIT;
