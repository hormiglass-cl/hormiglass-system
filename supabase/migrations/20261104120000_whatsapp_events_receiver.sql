-- Development-only receiver. Apply only after the documented schema preflight.
-- No legacy ingestion RPC, shared domain schema or shared folio generator changes.
BEGIN;
CREATE TABLE public.whatsapp_event_inbox (
  event_id text PRIMARY KEY,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  event_type text NOT NULL,
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_lead_links (
  external_lead_id text PRIMARY KEY,
  conversation_id text NOT NULL UNIQUE,
  phone text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.clientes(id),
  opportunity_id uuid NOT NULL UNIQUE REFERENCES public.oportunidades(id),
  revision integer NOT NULL CHECK (revision > 0),
  bot_requirement jsonb NOT NULL,
  requirement_hash text NOT NULL CHECK (requirement_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_message_id text NOT NULL UNIQUE,
  conversation_id text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_handoffs (
  external_handoff_id text PRIMARY KEY,
  conversation_id text NOT NULL,
  content jsonb NOT NULL,
  kind text NOT NULL CHECK (kind IN ('complaint','operational')),
  opportunity_id uuid REFERENCES public.oportunidades(id),
  case_id uuid UNIQUE REFERENCES public.postventa_casos(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_ownership (
  conversation_id text PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  owner text NOT NULL CHECK (owner='bot'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_event_inbox','whatsapp_lead_links','whatsapp_messages','whatsapp_handoffs','whatsapp_ownership'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role',t);
  END LOOP;
END $$;

-- One controlled association path reused by ingestion and later human service tooling.
-- SECURITY INVOKER: never expose privileged writes through a public definer.
CREATE FUNCTION public.whatsapp_associate_handoff(p_handoff_id text, p_opportunity_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE h public.whatsapp_handoffs%ROWTYPE; o public.oportunidades%ROWTYPE; c uuid;
BEGIN
  -- Integration-local serialization, also used by receive; no shared generator changes.
  PERFORM pg_advisory_xact_lock(174931, 1);
  SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=p_handoff_id FOR UPDATE;
  IF NOT FOUND OR h.kind <> 'complaint' THEN RAISE EXCEPTION 'invalid_event'; END IF;
  IF h.case_id IS NOT NULL THEN
    IF h.opportunity_id IS DISTINCT FROM p_opportunity_id THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    RETURN jsonb_build_object('crm_case_id',h.case_id,'crm_opportunity_id',h.opportunity_id,'status','associated');
  END IF;
  SELECT * INTO o FROM public.oportunidades WHERE id=p_opportunity_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_opportunity'; END IF;
  c := gen_random_uuid();
  INSERT INTO public.postventa_casos(id,oportunidad_id,tipo,estado,descripcion,folio,vendedor_id,cliente_id)
    VALUES(c,o.id,coalesce(h.content->>'postventa_type','otro'),'recibido',h.content->>'description','PV-WA-'||c::text,o.asignado_a,o.cliente_id);
  UPDATE public.whatsapp_handoffs SET opportunity_id=o.id,case_id=c WHERE external_handoff_id=p_handoff_id;
  RETURN jsonb_build_object('crm_case_id',c,'crm_opportunity_id',o.id,'status','associated');
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_associate_handoff(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_associate_handoff(text,uuid) TO service_role;

CREATE FUNCTION public.whatsapp_receive_event(p_event jsonb, p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  eid text := p_event->>'event_id'; typ text := p_event->>'type'; conv text := p_event->>'conversation_id';
  d jsonb := p_event->'data'; old_event public.whatsapp_event_inbox%ROWTYPE;
  l public.whatsapp_lead_links%ROWTYPE; h public.whatsapp_handoffs%ROWTYPE; m public.whatsapp_messages%ROWTYPE;
  customer uuid; opportunity uuid; seller uuid; matches integer; rev integer; stored_version integer;
  requirement jsonb; result jsonb; association jsonb;
BEGIN
  IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR p_event->'schema_version' IS DISTINCT FROM '1'::jsonb
    OR eid IS NULL OR eid !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    OR conv IS NULL OR conv !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR typ IS NULL OR typ NOT IN ('lead.qualified','handoff.created','message.new','ownership.released')
  THEN RAISE EXCEPTION 'invalid_event'; END IF;
  -- Bounded integration traffic is serialized to cover event, lead, phone, message,
  -- handoff and association identities in one lock order. Does not lock other writers.
  -- External domain writers must not create customers on behalf of this integration.
  PERFORM pg_advisory_xact_lock(174931, 1);
  SELECT * INTO old_event FROM public.whatsapp_event_inbox WHERE event_id=eid;
  IF FOUND THEN
    IF old_event.payload_hash <> p_hash THEN RAISE EXCEPTION 'event_conflict'; END IF;
    RETURN old_event.result;
  END IF;
  result := jsonb_build_object('event_id',eid);
  IF typ='lead.qualified' THEN
    IF d->>'lead_id' IS NULL OR d->>'lead_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      OR d->>'phone' IS NULL OR d->>'phone' !~ '^\+[1-9][0-9]{7,14}$'
      OR coalesce(length(trim(d->>'name')),0) NOT BETWEEN 1 AND 200
      OR coalesce(length(trim(d->>'title')),0) NOT BETWEEN 1 AND 200
      OR coalesce(length(trim(d->>'requirement')),0) NOT BETWEEN 1 AND 16000
      OR jsonb_typeof(d->'revision') IS DISTINCT FROM 'number' OR d->>'revision' !~ '^[0-9]{1,10}$'
      OR (d->>'revision')::numeric NOT BETWEEN 1 AND 2147483647
      OR d->>'crm_seller_id' IS NULL OR d->>'crm_seller_id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
    THEN RAISE EXCEPTION 'invalid_event'; END IF;
    seller := (d->>'crm_seller_id')::uuid; rev := (d->>'revision')::integer;
    PERFORM 1 FROM public.usuarios WHERE id=seller AND activo AND rol IN ('user','admin') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_seller'; END IF;
    requirement := d - 'revision';
    SELECT * INTO l FROM public.whatsapp_lead_links WHERE external_lead_id=d->>'lead_id';
    IF FOUND THEN
      IF l.conversation_id<>conv OR l.phone<>d->>'phone' THEN RAISE EXCEPTION 'identity_conflict'; END IF;
      customer := l.customer_id; opportunity := l.opportunity_id;
      IF rev=l.revision AND requirement<>l.bot_requirement THEN RAISE EXCEPTION 'revision_conflict'; END IF;
      IF rev>l.revision THEN
        -- Corrections are stored separately; never overwrite pipeline/assignment/notes/money.
        UPDATE public.whatsapp_lead_links SET revision=rev,bot_requirement=requirement,
          requirement_hash=encode(sha256(convert_to(requirement::text,'UTF8')),'hex') WHERE external_lead_id=l.external_lead_id;
        INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
          SELECT asignado_a,'Requerimiento WhatsApp corregido; revisar antecedentes de integración.','sistema','oportunidad','/ventas/'||id::text FROM public.oportunidades WHERE id=opportunity;
      END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.whatsapp_lead_links WHERE conversation_id=conv) THEN RAISE EXCEPTION 'identity_conflict'; END IF;
      -- Match normalized phone, not email/RUT ORs or arbitrary LIMIT 1.
      PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp-phone:'||(d->>'phone'),0));
      SELECT count(*), (array_agg(id))[1] INTO matches,customer FROM public.clientes
        WHERE regexp_replace(telefono,'[^0-9]','','g')=substring(d->>'phone' FROM 2);
      IF matches>1 THEN RAISE EXCEPTION 'ambiguous_customer'; END IF;
      IF customer IS NULL THEN
        IF nullif(trim(d->>'rut'),'') IS NULL AND EXISTS(
          SELECT 1 FROM pg_attribute WHERE attrelid='public.clientes'::regclass AND attname='rut' AND attnotnull AND NOT attisdropped
        ) THEN RAISE EXCEPTION 'rut_required'; END IF;
        INSERT INTO public.clientes(nombre,apellido_razon_social,rut,telefono,tipo_cliente)
          VALUES(d->>'name',d->>'name',nullif(trim(d->>'rut'),''),d->>'phone','natural') RETURNING id INTO customer;
      END IF;
      opportunity := gen_random_uuid();
      INSERT INTO public.oportunidades(id,codigo,titulo,cliente_id,asignado_a,estado_pipeline,origen)
        VALUES(opportunity,'OP-WA-'||opportunity::text,d->>'title',customer,seller,'nueva','WhatsApp Bot');
      INSERT INTO public.whatsapp_lead_links(external_lead_id,conversation_id,phone,customer_id,opportunity_id,revision,bot_requirement,requirement_hash)
        VALUES(d->>'lead_id',conv,d->>'phone',customer,opportunity,rev,requirement,encode(sha256(convert_to(requirement::text,'UTF8')),'hex'));
      INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
        VALUES(seller,'Nuevo requerimiento WhatsApp.','sistema','oportunidad','/ventas/'||opportunity::text);
    END IF;
    result := result || jsonb_build_object('crm_customer_id',customer,'crm_opportunity_id',opportunity);
  ELSIF typ='handoff.created' THEN
    IF d->>'handoff_id' IS NULL OR d->>'handoff_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      OR coalesce(d->>'kind','') NOT IN ('complaint','operational')
      OR coalesce(length(trim(d->>'description')),0) NOT BETWEEN 1 AND 16000
      OR (d ? 'postventa_type' AND coalesce(d->>'postventa_type','') NOT IN ('producto_defectuoso','problema_fabricacion','problema_instalacion','dano_transporte','uso_incorrecto','movimiento_terreno','trabajo_adicional','dano_terceros','faltante','defecto','cantidad_adicional','otro'))
      OR (d ? 'crm_opportunity_id' AND coalesce(d->>'crm_opportunity_id','') !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
      OR (d->>'kind'='operational' AND (d ? 'postventa_type' OR d ? 'crm_opportunity_id'))
    THEN RAISE EXCEPTION 'invalid_event'; END IF;
    SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=d->>'handoff_id';
    IF FOUND THEN
      IF h.conversation_id<>conv OR h.content<>d THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    ELSE
      INSERT INTO public.whatsapp_handoffs(external_handoff_id,conversation_id,content,kind)
        VALUES(d->>'handoff_id',conv,d,d->>'kind');
      IF d->>'kind'='complaint' THEN
        SELECT opportunity_id INTO opportunity FROM public.whatsapp_lead_links WHERE conversation_id=conv;
        IF d ? 'crm_opportunity_id' THEN
          IF opportunity IS NOT NULL AND opportunity<>(d->>'crm_opportunity_id')::uuid THEN RAISE EXCEPTION 'identity_conflict'; END IF;
          opportunity := (d->>'crm_opportunity_id')::uuid;
          PERFORM 1 FROM public.oportunidades WHERE id=opportunity;
          IF NOT FOUND THEN opportunity := NULL; END IF;
        END IF;
        IF opportunity IS NOT NULL THEN association := public.whatsapp_associate_handoff(d->>'handoff_id',opportunity); END IF;
      END IF;
      SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=d->>'handoff_id';
    END IF;
    result := result || jsonb_build_object('external_handoff_id',h.external_handoff_id,'crm_case_id',h.case_id,'crm_opportunity_id',h.opportunity_id,'status',CASE WHEN h.kind='operational' THEN 'operational' WHEN h.case_id IS NULL THEN 'pending_association' ELSE 'associated' END);
  ELSIF typ='message.new' THEN
    IF d->>'message_id' IS NULL OR d->>'message_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      OR coalesce(d->>'direction','') NOT IN ('inbound','outbound')
      OR coalesce(length(trim(d->>'text')),0) NOT BETWEEN 1 AND 16000
      OR coalesce(d->>'sent_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
    THEN RAISE EXCEPTION 'invalid_event'; END IF;
    PERFORM (d->>'sent_at')::timestamptz;
    SELECT * INTO m FROM public.whatsapp_messages WHERE external_message_id=d->>'message_id';
    IF FOUND THEN
      IF m.conversation_id<>conv OR m.content<>d THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    ELSE
      INSERT INTO public.whatsapp_messages(external_message_id,conversation_id,content) VALUES(d->>'message_id',conv,d) RETURNING * INTO m;
    END IF;
    result := result || jsonb_build_object('crm_message_id',m.id);
  ELSE
    IF jsonb_typeof(d->'version') IS DISTINCT FROM 'number' OR d->>'version' !~ '^[0-9]{1,10}$' OR (d->>'version')::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION 'invalid_event'; END IF;
    INSERT INTO public.whatsapp_ownership(conversation_id,version,owner) VALUES(conv,(d->>'version')::integer,'bot')
      ON CONFLICT(conversation_id) DO UPDATE SET version=excluded.version,updated_at=now() WHERE whatsapp_ownership.version<excluded.version;
    SELECT version INTO stored_version FROM public.whatsapp_ownership WHERE conversation_id=conv;
    result := result || jsonb_build_object('ownership_version',stored_version,'owner','bot');
  END IF;
  -- Insert only after every domain effect succeeded; exceptions roll everything back.
  INSERT INTO public.whatsapp_event_inbox(event_id,payload_hash,event_type,result) VALUES(eid,p_hash,typ,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_receive_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_receive_event(jsonb,text) TO service_role;
COMMIT;
