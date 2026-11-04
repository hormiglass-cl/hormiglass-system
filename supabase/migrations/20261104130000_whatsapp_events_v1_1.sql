-- Proposed protocol revision 1.1. Integration-only changes; no recipient identities seeded.
BEGIN;
ALTER TABLE public.whatsapp_handoffs DROP CONSTRAINT whatsapp_handoffs_kind_check;
ALTER TABLE public.whatsapp_handoffs ADD CONSTRAINT whatsapp_handoffs_kind_check CHECK (kind IN ('complaint','operational','commercial'));
ALTER TABLE public.whatsapp_handoffs ADD COLUMN protocol_revision text CHECK (protocol_revision='1.1');
ALTER TABLE public.whatsapp_ownership DROP CONSTRAINT whatsapp_ownership_owner_check;
ALTER TABLE public.whatsapp_ownership ADD COLUMN crm_seller_id uuid REFERENCES public.usuarios(id), ADD COLUMN source text;
ALTER TABLE public.whatsapp_ownership ADD CONSTRAINT whatsapp_ownership_state_check CHECK (
  (owner='bot' AND crm_seller_id IS NULL AND source IS NULL)
  OR (owner='human' AND source IS NOT NULL AND source='clickup')
);
CREATE TABLE public.whatsapp_area_recipients (
  area text NOT NULL CHECK (area IN ('sales','management','finance','scheduling','claims')),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  PRIMARY KEY(area,usuario_id)
);
-- Durable delivery receipt: notification and receipt are written in the same transaction.
CREATE TABLE public.whatsapp_handoff_notifications (
  external_handoff_id text NOT NULL REFERENCES public.whatsapp_handoffs(external_handoff_id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notificaciones(id),
  PRIMARY KEY(external_handoff_id,usuario_id)
);
ALTER TABLE public.whatsapp_area_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_handoff_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_area_recipients,public.whatsapp_handoff_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.whatsapp_area_recipients TO service_role;
GRANT SELECT,INSERT ON public.whatsapp_handoff_notifications TO service_role;

-- Replace the original ingress in place below, preserving its domain branches.
-- No callable legacy alias may bypass ownership guards or poison stored results.

-- Explicit service completion, no inferred finance/admin/calendar recipient selection.
-- Existing complaint association remains the single Postventa creation path.
CREATE FUNCTION public.whatsapp_complete_handoff(p_handoff_id text, p_opportunity_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  h public.whatsapp_handoffs%ROWTYPE; opportunity uuid; linked uuid; seller uuid;
  target_area text; recipient uuid; notification uuid; recipients uuid[] := '{}'; needs_mapping boolean;
  mapping_ready boolean := false; seller_ready boolean := false; routing text := 'pending_routing';
BEGIN
  PERFORM pg_advisory_xact_lock(174931,1);
  SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=p_handoff_id FOR UPDATE;
  IF NOT FOUND OR h.protocol_revision IS DISTINCT FROM '1.1' THEN RAISE EXCEPTION 'invalid_event'; END IF;
  target_area := CASE WHEN h.kind='complaint' THEN 'claims' ELSE h.content->>'area' END;
  IF h.kind='operational' THEN
    IF p_opportunity_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_event'; END IF;
  ELSE
    SELECT opportunity_id INTO linked FROM public.whatsapp_lead_links WHERE conversation_id=h.conversation_id;
    opportunity := coalesce(p_opportunity_id,h.opportunity_id,(h.content->>'crm_opportunity_id')::uuid,linked);
    IF linked IS NOT NULL AND opportunity IS DISTINCT FROM linked THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    IF h.opportunity_id IS NOT NULL AND opportunity IS DISTINCT FROM h.opportunity_id THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    IF opportunity IS NOT NULL THEN
      PERFORM 1 FROM public.oportunidades WHERE id=opportunity FOR KEY SHARE;
      IF NOT FOUND THEN
        IF p_opportunity_id IS NOT NULL THEN RAISE EXCEPTION 'invalid_opportunity'; END IF;
        opportunity := NULL;
      END IF;
    END IF;
    IF opportunity IS NOT NULL THEN
      IF h.kind='complaint' THEN
        PERFORM public.whatsapp_associate_handoff(p_handoff_id,opportunity);
      ELSE
        UPDATE public.whatsapp_handoffs SET opportunity_id=opportunity WHERE external_handoff_id=p_handoff_id;
      END IF;
    END IF;
  END IF;
  SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=p_handoff_id;
  -- Association is required before commercial/claim notifications; operational never attaches a sale.
  IF h.kind='operational' OR h.opportunity_id IS NOT NULL THEN
    IF h.kind='commercial' THEN
      SELECT u.id INTO seller FROM public.oportunidades o JOIN public.usuarios u ON u.id=o.asignado_a
        WHERE o.id=h.opportunity_id AND u.activo AND u.rol IN ('user','admin') FOR SHARE OF o,u;
      seller_ready := seller IS NOT NULL;
      IF seller_ready THEN recipients := array_append(recipients,seller); END IF;
    END IF;
    needs_mapping := target_area<>'sales';
    IF needs_mapping THEN
      FOR recipient IN SELECT u.id FROM public.whatsapp_area_recipients a JOIN public.usuarios u ON u.id=a.usuario_id
        WHERE a.area=target_area AND u.activo ORDER BY u.id FOR SHARE OF a,u LOOP
        recipients := array_append(recipients,recipient); mapping_ready := true;
      END LOOP;
    END IF;
    FOREACH recipient IN ARRAY recipients LOOP
      IF NOT EXISTS(SELECT 1 FROM public.whatsapp_handoff_notifications WHERE external_handoff_id=p_handoff_id AND usuario_id=recipient) THEN
        notification := gen_random_uuid();
        INSERT INTO public.notificaciones(id,usuario_id,mensaje,tipo,entidad_relacionada,link_url)
          VALUES(notification,recipient,'Derivación WhatsApp: '||(h.content->>'reason'),'sistema',
            CASE WHEN h.kind='complaint' THEN 'postventa' ELSE 'oportunidad' END,
            CASE WHEN h.opportunity_id IS NOT NULL THEN '/ventas/'||h.opportunity_id::text ELSE NULL END);
        INSERT INTO public.whatsapp_handoff_notifications(external_handoff_id,usuario_id,notification_id) VALUES(p_handoff_id,recipient,notification);
      END IF;
    END LOOP;
    IF (h.kind<>'commercial' OR seller_ready) AND (NOT needs_mapping OR mapping_ready) THEN routing := 'routed'; END IF;
  END IF;
  RETURN jsonb_build_object('external_handoff_id',h.external_handoff_id,'crm_case_id',h.case_id,'crm_opportunity_id',h.opportunity_id,
    'status',CASE WHEN h.kind='operational' THEN 'operational' WHEN h.opportunity_id IS NULL THEN 'pending_association' ELSE 'associated' END,'routing_status',routing);
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_complete_handoff(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_complete_handoff(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_receive_event(p_event jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  eid text := p_event->>'event_id'; conv text := p_event->>'conversation_id'; typ text := p_event->>'type';
  d jsonb := p_event->'data'; revision boolean := p_event->>'protocol_revision'='1.1';
  old_event public.whatsapp_event_inbox%ROWTYPE; h public.whatsapp_handoffs%ROWTYPE;
  state public.whatsapp_ownership%ROWTYPE; desired_owner text; desired_seller uuid; desired_source text;
  result jsonb; keys text[]; field text; v integer;
  l public.whatsapp_lead_links%ROWTYPE; m public.whatsapp_messages%ROWTYPE;
  customer uuid; opportunity uuid; seller uuid; matches integer; rev integer;
  requirement jsonb; association jsonb;
BEGIN
  IF jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR p_event->'schema_version' IS DISTINCT FROM '1'::jsonb
    OR p_event - ARRAY['schema_version','protocol_revision','event_id','conversation_id','type','data'] <> '{}'::jsonb
    OR (p_event ? 'protocol_revision' AND p_event->'protocol_revision' IS DISTINCT FROM '"1.1"'::jsonb)
    OR jsonb_typeof(p_event->'event_id') IS DISTINCT FROM 'string' OR eid !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    OR jsonb_typeof(p_event->'conversation_id') IS DISTINCT FROM 'string' OR conv !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR typ IS NULL OR typ NOT IN ('lead.qualified','message.new','handoff.created','ownership.taken','ownership.released')
    OR (typ='ownership.taken' AND revision IS DISTINCT FROM true)
  THEN RAISE EXCEPTION 'invalid_event'; END IF;
  keys := CASE typ
    WHEN 'lead.qualified' THEN ARRAY['lead_id','revision','phone','name','rut','crm_seller_id','title','requirement']
    WHEN 'message.new' THEN ARRAY['message_id','direction','text','sent_at']
    WHEN 'ownership.taken' THEN ARRAY['version','crm_seller_id','source']
    WHEN 'ownership.released' THEN ARRAY['version']
    ELSE CASE WHEN revision THEN ARRAY['handoff_id','kind','area','reason','priority','description','crm_opportunity_id','postventa_type']
      ELSE ARRAY['handoff_id','kind','description','crm_opportunity_id','postventa_type'] END END;
  IF d-keys <> '{}'::jsonb THEN RAISE EXCEPTION 'invalid_event'; END IF;
  FOR field IN SELECT jsonb_object_keys(d) LOOP
    IF field NOT IN ('version','revision') AND NOT (typ='ownership.taken' AND field='crm_seller_id' AND d->field='null'::jsonb)
      AND jsonb_typeof(d->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid_event'; END IF;
  END LOOP;
  -- Same integration lock and order as the original receiver/association, including replay.
  PERFORM pg_advisory_xact_lock(174931,1);
  SELECT * INTO old_event FROM public.whatsapp_event_inbox WHERE event_id=eid;
  IF FOUND THEN
    IF old_event.payload_hash<>p_hash THEN RAISE EXCEPTION 'event_conflict'; END IF;
    RETURN old_event.result;
  END IF;
  IF typ IN ('ownership.taken','ownership.released') THEN
    IF jsonb_typeof(d->'version') IS DISTINCT FROM 'number' OR d->>'version' !~ '^[0-9]{1,10}$'
      OR (d->>'version')::numeric NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION 'invalid_event'; END IF;
    v := (d->>'version')::integer;
    desired_owner := CASE WHEN typ='ownership.taken' THEN 'human' ELSE 'bot' END;
    IF typ='ownership.taken' THEN
      IF NOT (d ? 'crm_seller_id') OR d->>'source' IS DISTINCT FROM 'clickup'
        OR (d->'crm_seller_id'<>'null'::jsonb AND d->>'crm_seller_id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'invalid_event'; END IF;
      desired_seller := (d->>'crm_seller_id')::uuid; desired_source := 'clickup';
      IF desired_seller IS NOT NULL THEN
        PERFORM 1 FROM public.usuarios WHERE id=desired_seller AND activo AND rol IN ('user','admin') FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'invalid_seller'; END IF;
      END IF;
    END IF;
    SELECT * INTO state FROM public.whatsapp_ownership WHERE conversation_id=conv FOR UPDATE;
    IF FOUND THEN
      IF revision IS DISTINCT FROM true AND state.owner='human' AND state.version>=v THEN RAISE EXCEPTION 'protocol_revision_required'; END IF;
      IF state.version=v AND (state.owner IS DISTINCT FROM desired_owner OR state.crm_seller_id IS DISTINCT FROM desired_seller OR state.source IS DISTINCT FROM desired_source) THEN RAISE EXCEPTION 'ownership_conflict'; END IF;
    END IF;
    INSERT INTO public.whatsapp_ownership(conversation_id,version,owner,crm_seller_id,source) VALUES(conv,v,desired_owner,desired_seller,desired_source)
      ON CONFLICT(conversation_id) DO UPDATE SET version=excluded.version,owner=excluded.owner,crm_seller_id=excluded.crm_seller_id,source=excluded.source,updated_at=now()
      WHERE whatsapp_ownership.version<excluded.version;
    SELECT * INTO state FROM public.whatsapp_ownership WHERE conversation_id=conv;
    result := jsonb_build_object('event_id',eid,'ownership_version',state.version,'owner',state.owner);
    IF revision THEN result := result || jsonb_build_object('crm_seller_id',state.crm_seller_id,'source',state.source); END IF;
  ELSIF typ='handoff.created' AND revision THEN
    IF d->>'handoff_id' IS NULL OR d->>'handoff_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      OR coalesce(length(trim(d->>'description')),0) NOT BETWEEN 1 AND 16000
      OR coalesce(length(d->>'reason'),0) NOT BETWEEN 1 AND 64 OR d->>'reason' !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
      OR coalesce(d->>'priority','') NOT IN ('urgente','alta','media','baja')
      OR NOT ((d->>'kind'='commercial' AND coalesce(d->>'area','') IN ('sales','management'))
        OR (d->>'kind'='operational' AND coalesce(d->>'area','') IN ('finance','scheduling') AND NOT (d ? 'crm_opportunity_id'))
        OR (d->>'kind'='complaint' AND (NOT (d ? 'area') OR d->>'area'='claims')))
      OR d->>'kind' IS NULL
      OR (d ? 'crm_opportunity_id' AND d->>'crm_opportunity_id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
      OR (d ? 'postventa_type' AND (d->>'kind'<>'complaint' OR d->>'postventa_type' NOT IN ('producto_defectuoso','problema_fabricacion','problema_instalacion','dano_transporte','uso_incorrecto','movimiento_terreno','trabajo_adicional','dano_terceros','faltante','defecto','cantidad_adicional','otro')))
    THEN RAISE EXCEPTION 'invalid_event'; END IF;
    SELECT * INTO h FROM public.whatsapp_handoffs WHERE external_handoff_id=d->>'handoff_id';
    IF FOUND THEN
      IF h.conversation_id<>conv OR h.content<>d OR h.protocol_revision IS DISTINCT FROM '1.1' THEN RAISE EXCEPTION 'identity_conflict'; END IF;
    ELSE
      INSERT INTO public.whatsapp_handoffs(external_handoff_id,conversation_id,content,kind,protocol_revision) VALUES(d->>'handoff_id',conv,d,d->>'kind','1.1');
    END IF;
    result := jsonb_build_object('event_id',eid) || public.whatsapp_complete_handoff(d->>'handoff_id');
  ELSE
    -- Original v1 domain branches, now behind the sole ingress's validation/lock/replay.
    -- Postventa creation still reuses whatsapp_associate_handoff; ownership never
    -- enters the original release branch. Original migration history is unchanged.
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
    END IF;
  END IF;
  INSERT INTO public.whatsapp_event_inbox(event_id,payload_hash,event_type,result) VALUES(eid,p_hash,typ,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_receive_event(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_receive_event(jsonb,text) TO service_role;
COMMIT;
