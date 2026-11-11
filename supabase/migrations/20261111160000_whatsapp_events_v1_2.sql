-- Forward-only revision 1.2a. No inferred provenance for existing customer/opportunity values.
BEGIN;
ALTER TABLE public.whatsapp_lead_links ADD COLUMN last_applied jsonb NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(last_applied)='object');
-- Last known bot components, independent of raw revision identity and applied display value.
ALTER TABLE public.whatsapp_lead_links ADD COLUMN address_components jsonb NOT NULL DEFAULT '{}'
  CHECK (jsonb_typeof(address_components)='object'
    AND address_components-ARRAY['address','commune','city']='{}'::jsonb);
CREATE TABLE public.whatsapp_pending_corrections (
  external_lead_id text NOT NULL REFERENCES public.whatsapp_lead_links(external_lead_id),
  entity text NOT NULL CHECK (entity IN ('opportunity','customer')),
  field text NOT NULL,
  before_value jsonb NOT NULL,
  after_value jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(external_lead_id,entity,field),
  CHECK ((entity='opportunity' AND field IN ('titulo','direccion_obra','tipo_venta','modalidad_requerimiento','forma_entrega','prioridad','productos'))
    OR (entity='customer' AND field IN ('tipo_cliente','apellido_razon_social','rut')))
);
ALTER TABLE public.whatsapp_pending_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_pending_corrections FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.whatsapp_pending_corrections TO service_role;
ALTER TABLE public.whatsapp_ownership ADD COLUMN release_reason text
  CHECK (release_reason IN ('seller_released','sla_expired','customer_new_quote','opportunity_closed'));
ALTER TABLE public.whatsapp_ownership DROP CONSTRAINT whatsapp_ownership_state_check;
ALTER TABLE public.whatsapp_ownership ADD CONSTRAINT whatsapp_ownership_state_check CHECK (
  (owner='bot' AND crm_seller_id IS NULL AND source IS NULL)
  OR (owner='human' AND source IN ('clickup','crm') AND source IS NOT NULL AND release_reason IS NULL)
);
ALTER TABLE public.whatsapp_handoffs DROP CONSTRAINT whatsapp_handoffs_protocol_revision_check;
ALTER TABLE public.whatsapp_handoffs ADD CONSTRAINT whatsapp_handoffs_protocol_revision_check CHECK (protocol_revision IN ('1.1','1.2'));

-- SQL ingress is independently strict, including nested objects: service callers need not use TS.
CREATE FUNCTION public.whatsapp_validate_lead12(d jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE k text; value jsonb; item jsonb; bound integer;
BEGIN
  IF length(d->>'name')>200 OR length(d->>'title')>200 OR length(d->>'requirement')>16000 THEN RAISE EXCEPTION 'invalid_event'; END IF;
  IF d ? 'rut' AND (jsonb_typeof(d->'rut') IS DISTINCT FROM 'string' OR coalesce(length(trim(d->>'rut')),0) NOT BETWEEN 1 AND 32 OR length(d->>'rut')>32) THEN RAISE EXCEPTION 'invalid_event'; END IF;
  FOR k,value IN SELECT * FROM jsonb_each(d - ARRAY['lead_id','revision','phone','name','rut','crm_seller_id','title','requirement']) LOOP
    IF k IN ('site','items','ai_summary') THEN CONTINUE; END IF;
    bound := CASE k WHEN 'company' THEN 200 WHEN 'address' THEN 300 WHEN 'use_case' THEN 200 ELSE 100 END;
    IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}'))=0 OR length(value#>>'{}')>bound
      OR (k='customer_type' AND value#>>'{}' NOT IN ('natural','company'))
      OR (k='tax_document' AND value#>>'{}' NOT IN ('boleta','factura'))
      OR (k='fulfillment' AND value#>>'{}' NOT IN ('delivery','install','pickup'))
      OR (k='urgency' AND value#>>'{}' NOT IN ('urgente','alta','media','baja'))
      OR (k='source_number' AND value#>>'{}' !~ '^\+[1-9][0-9]{7,14}$')
    THEN RAISE EXCEPTION 'invalid_event'; END IF;
    IF k='desired_date' THEN
      BEGIN
        IF value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' OR to_char((value#>>'{}')::date,'YYYY-MM-DD')<>value#>>'{}' THEN RAISE EXCEPTION 'invalid_event'; END IF;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'invalid_event'; END;
    END IF;
  END LOOP;
  IF d ? 'site' THEN
    IF jsonb_typeof(d->'site') IS DISTINCT FROM 'object' OR (d->'site')-ARRAY['terrain','truck_access','debris_removal','access_restrictions']<>'{}' THEN RAISE EXCEPTION 'invalid_event'; END IF;
    FOR k,value IN SELECT * FROM jsonb_each(d->'site') LOOP
      IF k IN ('truck_access','debris_removal') THEN
        IF jsonb_typeof(value) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_event'; END IF;
      ELSIF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}'))=0
        OR length(value#>>'{}')>(CASE WHEN k='terrain' THEN 100 ELSE 500 END) THEN RAISE EXCEPTION 'invalid_event'; END IF;
    END LOOP;
  END IF;
  IF d ? 'ai_summary' THEN
    IF jsonb_typeof(d->'ai_summary') IS DISTINCT FROM 'object' OR (d->'ai_summary')-ARRAY['lead_class','next_best_action','executive_summary','pain','scope','timing','obstacle']<>'{}' THEN RAISE EXCEPTION 'invalid_event'; END IF;
    FOR value IN SELECT v FROM jsonb_each(d->'ai_summary') AS e(k,v) LOOP
      IF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}'))=0 OR length(value#>>'{}')>4000 THEN RAISE EXCEPTION 'invalid_event'; END IF;
    END LOOP;
  END IF;
  IF d ? 'items' THEN
    IF jsonb_typeof(d->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_event'; END IF;
    IF jsonb_array_length(d->'items')>50 THEN RAISE EXCEPTION 'invalid_event'; END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(d->'items') LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['product','variant','quantity','unit','measurements']<>'{}'
        OR jsonb_typeof(item->'product') IS DISTINCT FROM 'string' OR coalesce(length(trim(item->>'product')),0) NOT BETWEEN 1 AND 200 OR length(item->>'product')>200
      THEN RAISE EXCEPTION 'invalid_event'; END IF;
      FOR k,value IN SELECT * FROM jsonb_each(item-'product') LOOP
        IF value='null'::jsonb THEN CONTINUE; END IF;
        IF k='quantity' THEN
          IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid_event'; END IF;
          IF (value#>>'{}')::numeric<=0 THEN RAISE EXCEPTION 'invalid_event'; END IF;
        ELSIF jsonb_typeof(value) IS DISTINCT FROM 'string' OR length(trim(value#>>'{}'))=0
          OR length(value#>>'{}')>(CASE WHEN k='unit' THEN 20 ELSE 200 END) THEN RAISE EXCEPTION 'invalid_event'; END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- Only sent keys produce proposals. JSON null is a real mapped value (install clears forma_entrega).
CREATE FUNCTION public.whatsapp_lead_values(d jsonb, entity text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE mapped jsonb := '{}'; products jsonb;
BEGIN
  IF entity='customer' THEN
    IF d ? 'customer_type' THEN mapped := mapped || jsonb_build_object('tipo_cliente',CASE WHEN d->>'customer_type'='company' THEN 'juridica' ELSE 'natural' END); END IF;
    IF d ? 'company' THEN mapped := mapped || jsonb_build_object('apellido_razon_social',d->>'company'); END IF;
    IF d ? 'rut' THEN mapped := mapped || jsonb_build_object('rut',d->>'rut'); END IF;
    RETURN mapped;
  END IF;
  mapped := jsonb_build_object('titulo',d->>'title');
  IF d ?| ARRAY['address','commune','city'] THEN
    mapped := mapped || jsonb_build_object('direccion_obra',concat_ws(', ',d->>'address',d->>'commune',CASE WHEN d->>'city' IS DISTINCT FROM d->>'commune' THEN d->>'city' END));
  END IF;
  IF d ? 'fulfillment' THEN
    mapped := mapped || jsonb_build_object('tipo_venta',CASE WHEN d->>'fulfillment'='install' THEN 'Instalación' ELSE 'Suministro' END,
      'modalidad_requerimiento',CASE WHEN d->>'fulfillment'='install' THEN 'instalacion' ELSE 'solo_material' END,
      'forma_entrega',CASE d->>'fulfillment' WHEN 'delivery' THEN 'despacho_propio' WHEN 'pickup' THEN 'retiro_cliente' END);
  END IF;
  IF d ? 'urgency' THEN mapped := mapped || jsonb_build_object('prioridad',CASE WHEN d->>'urgency' IN ('urgente','alta') THEN d->>'urgency' ELSE 'normal' END); END IF;
  IF d ? 'items' THEN
    SELECT coalesce(jsonb_agg(concat_ws(' ',i->>'product',i->>'variant',i->>'quantity',i->>'unit') ||
      CASE WHEN i->>'measurements' IS NOT NULL THEN ' ('||(i->>'measurements')||')' ELSE '' END ORDER BY n),'[]')
      INTO products FROM jsonb_array_elements(d->'items') WITH ORDINALITY AS e(i,n);
    mapped := mapped || jsonb_build_object('productos',products);
  END IF;
  RETURN mapped;
END $$;

-- One bounded queue entry per lead/entity/field, reused on every correction. Lock domain rows
-- before comparing provenance so human edits cannot race the compare-and-apply decision.
CREATE FUNCTION public.whatsapp_apply_lead_fields(lead text, d jsonb, is_new boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE l public.whatsapp_lead_links%ROWTYPE; o public.oportunidades%ROWTYPE; c public.clientes%ROWTYPE;
  entity_name text; proposals jsonb; current_values jsonb; applied jsonb; k text; value jsonb;
  components jsonb; mapping_data jsonb := d;
  applied_count integer := 0; pending_count integer := 0;
BEGIN
  SELECT * INTO STRICT l FROM public.whatsapp_lead_links WHERE external_lead_id=lead FOR UPDATE;
  SELECT * INTO STRICT o FROM public.oportunidades WHERE id=l.opportunity_id FOR UPDATE;
  SELECT * INTO STRICT c FROM public.clientes WHERE id=l.customer_id FOR UPDATE;
  applied := l.last_applied;
  SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) INTO components
    FROM jsonb_each(d) e WHERE e.key IN ('address','commune','city');
  components := l.address_components || components;
  IF d ?| ARRAY['address','commune','city'] THEN
    -- Merge only mapping input: keep raw bot_requirement/hash unchanged, and propose nothing
    -- for direccion_obra when this revision supplies no address component at all.
    mapping_data := d || components;
  END IF;
  FOREACH entity_name IN ARRAY ARRAY['opportunity','customer'] LOOP
    proposals := public.whatsapp_lead_values(mapping_data,entity_name);
    current_values := CASE WHEN entity_name='opportunity' THEN to_jsonb(o) ELSE to_jsonb(c) END;
    FOR k,value IN SELECT * FROM jsonb_each(proposals) LOOP
      IF entity_name='opportunity' AND (is_new OR (applied ? k AND value=applied->k)) THEN
        IF NOT is_new THEN
          DELETE FROM public.whatsapp_pending_corrections WHERE external_lead_id=lead AND entity=entity_name AND field=k;
          CONTINUE;
        END IF;
      END IF;
      IF entity_name='opportunity' AND (is_new OR (applied ? k AND current_values->k=applied->k)) THEN
        -- Whitelist above bounds identifiers; row hydration preserves native JSONB products.
        EXECUTE format('UPDATE public.oportunidades SET %1$I=(jsonb_populate_record(NULL::public.oportunidades,$1)).%1$I WHERE id=$2',k)
          USING jsonb_build_object(k,value),o.id;
        applied := applied || jsonb_build_object(k,value);
        DELETE FROM public.whatsapp_pending_corrections WHERE external_lead_id=lead AND entity=entity_name AND field=k;
        applied_count := applied_count+1;
      ELSIF NOT is_new AND value IS DISTINCT FROM current_values->k THEN
        INSERT INTO public.whatsapp_pending_corrections(external_lead_id,entity,field,before_value,after_value,revision)
          VALUES(lead,entity_name,k,current_values->k,value,l.revision)
          ON CONFLICT(external_lead_id,entity,field) DO UPDATE SET before_value=excluded.before_value,
            after_value=excluded.after_value,revision=excluded.revision,updated_at=now();
        pending_count := pending_count+1;
      ELSIF NOT is_new THEN
        -- New information agrees with the human value: an older proposal is no longer current.
        DELETE FROM public.whatsapp_pending_corrections WHERE external_lead_id=lead AND entity=entity_name AND field=k;
      END IF;
    END LOOP;
  END LOOP;
  IF is_new THEN
    -- Defaults on rows we just created are known; migration-era rows keep the empty snapshot.
    SELECT jsonb_object_agg(e.key,e.value) INTO applied
      FROM public.oportunidades current_op CROSS JOIN LATERAL jsonb_each(to_jsonb(current_op)) e
      WHERE current_op.id=o.id AND e.key IN ('titulo','direccion_obra','tipo_venta','modalidad_requerimiento','forma_entrega','prioridad','productos');
  END IF;
  UPDATE public.whatsapp_lead_links SET last_applied=applied,address_components=components WHERE external_lead_id=lead;
  SELECT count(*) INTO pending_count FROM public.whatsapp_pending_corrections WHERE external_lead_id=lead;
  IF NOT is_new AND o.asignado_a IS NOT NULL THEN
    INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
      VALUES(o.asignado_a,format('Corrección WhatsApp: %s cambios aplicados; %s pendientes de revisión.',applied_count,pending_count),'sistema','oportunidad','/ventas/'||o.id::text);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.whatsapp_validate_lead12(jsonb),public.whatsapp_lead_values(jsonb,text),public.whatsapp_apply_lead_fields(text,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_validate_lead12(jsonb),public.whatsapp_lead_values(jsonb,text),public.whatsapp_apply_lead_fields(text,jsonb,boolean) TO service_role;

-- Amend the sole installed ingress, not a callable compatibility alias. Exact, single-match
-- patches fail closed if the prerequisite function has drifted. Unchanged branches retain
-- their original validation, result shape, identity checks, lock order and replay hashing.
CREATE FUNCTION pg_temp.patch(source text, old_text text, new_text text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF position(old_text IN source)=0 OR position(old_text IN substring(source FROM position(old_text IN source)+length(old_text)))>0 THEN
    RAISE EXCEPTION 'whatsapp 1.2 prerequisite function drift';
  END IF;
  RETURN replace(source,old_text,new_text);
END $$;
DO $migration$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef('public.whatsapp_complete_handoff(text,uuid)'::regprocedure) INTO body;
  body := pg_temp.patch(body,'h.protocol_revision IS DISTINCT FROM ''1.1''','coalesce(h.protocol_revision,'''') NOT IN (''1.1'',''1.2'')');
  EXECUTE body;
  SELECT pg_get_functiondef('public.whatsapp_receive_event(jsonb,text)'::regprocedure) INTO body;
  body := pg_temp.patch(body,$old$revision boolean := p_event->>'protocol_revision'='1.1';$old$,
    $new$revision boolean := p_event->>'protocol_revision' IN ('1.1','1.2');
  revision12 boolean := p_event->>'protocol_revision'='1.2';
  release_reason text; previous_seller uuid; previous_version integer; lead_status text; message_status text;$new$);
  body := pg_temp.patch(body,$old$p_event->'protocol_revision' IS DISTINCT FROM '"1.1"'::jsonb$old$,
    $new$(jsonb_typeof(p_event->'protocol_revision') IS DISTINCT FROM 'string' OR coalesce(p_event->>'protocol_revision','') NOT IN ('1.1','1.2'))$new$);
  body := pg_temp.patch(body,$old$IF d-keys <> '{}'::jsonb THEN$old$,$new$IF revision12 THEN
    keys := keys || CASE typ
      WHEN 'lead.qualified' THEN ARRAY['customer_type','company','tax_document','purchase_order','service','fulfillment','city','commune','address','use_case','urgency','desired_date','source_number','site','items','ai_summary']
      WHEN 'message.new' THEN ARRAY['sender','crm_seller_id']
      WHEN 'ownership.released' THEN ARRAY['reason'] ELSE ARRAY[]::text[] END;
  END IF;
  IF d-keys <> '{}'::jsonb THEN$new$);
  body := pg_temp.patch(body,$old$IF field NOT IN ('version','revision') AND NOT$old$,
    $new$IF NOT (revision12 AND typ='lead.qualified' AND field IN ('site','items','ai_summary')) AND field NOT IN ('version','revision') AND NOT$new$);
  body := pg_temp.patch(body,$old$-- Same integration lock and order$old$,$new$IF revision12 AND typ='lead.qualified' THEN PERFORM public.whatsapp_validate_lead12(d); END IF;
  IF revision12 AND typ='ownership.released' THEN
    IF coalesce(d->>'reason','') NOT IN ('seller_released','sla_expired','customer_new_quote','opportunity_closed') THEN RAISE EXCEPTION 'invalid_event'; END IF;
    release_reason := d->>'reason';
  END IF;
  IF revision12 AND typ='message.new' THEN
    IF coalesce(d->>'sender','') NOT IN ('customer','bot','seller','system')
      OR (d->>'direction'='inbound') IS DISTINCT FROM (d->>'sender'='customer')
      OR ((d->>'sender'='seller') IS DISTINCT FROM (d ? 'crm_seller_id'))
      OR (d ? 'crm_seller_id' AND d->>'crm_seller_id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'invalid_event'; END IF;
  END IF;
  -- Same integration lock and order$new$);
  body := pg_temp.patch(body,$old$IF typ IN ('ownership.taken','ownership.released') THEN$old$,
    $new$IF revision12 AND typ='message.new' AND d->>'sender'='seller' THEN
    PERFORM 1 FROM public.usuarios WHERE id=(d->>'crm_seller_id')::uuid AND activo AND rol IN ('user','admin') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid_seller'; END IF;
  END IF;
  IF typ IN ('ownership.taken','ownership.released') THEN$new$);
  body := pg_temp.patch(body,$old$RETURN old_event.result;$old$,$new$IF revision12 AND typ IN ('lead.qualified','message.new') THEN
      RETURN old_event.result || '{"status":"duplicate"}'::jsonb;
    END IF;
    RETURN old_event.result;$new$);
  body := pg_temp.patch(body,$old$d->>'source' IS DISTINCT FROM 'clickup'$old$,
    $new$(coalesce(d->>'source','') NOT IN ('clickup','crm') OR (d->>'source'='crm' AND revision12 IS DISTINCT FROM true))$new$);
  body := pg_temp.patch(body,$old$desired_source := 'clickup';$old$,$new$desired_source := d->>'source';$new$);
  body := pg_temp.patch(body,$old$IF FOUND THEN
      IF revision IS DISTINCT FROM true AND state.owner=$old$,
    $new$previous_version := state.version; previous_seller := state.crm_seller_id;
    IF FOUND THEN
      IF revision IS DISTINCT FROM true AND state.owner=$new$);
  body := pg_temp.patch(body,$old$state.source IS DISTINCT FROM desired_source)$old$,
    $new$state.source IS DISTINCT FROM desired_source OR (revision12 AND state.release_reason IS DISTINCT FROM release_reason))$new$);
  body := pg_temp.patch(body,$old$INSERT INTO public.whatsapp_ownership(conversation_id,version,owner,crm_seller_id,source) VALUES(conv,v,desired_owner,desired_seller,desired_source)$old$,
    $new$INSERT INTO public.whatsapp_ownership(conversation_id,version,owner,crm_seller_id,source,release_reason) VALUES(conv,v,desired_owner,desired_seller,desired_source,release_reason)$new$);
  body := pg_temp.patch(body,$old$source=excluded.source,updated_at=now()$old$,
    $new$source=excluded.source,release_reason=excluded.release_reason,updated_at=now()$new$);
  body := pg_temp.patch(body,$old$result := jsonb_build_object('event_id',eid,'ownership_version',state.version,'owner',state.owner);$old$,
    $new$IF revision12 AND typ='ownership.released' AND release_reason='sla_expired' AND previous_seller IS NOT NULL AND v>previous_version THEN
      INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada)
        VALUES(previous_seller,'WhatsApp: SLA vencido; conversación liberada.','sistema','oportunidad');
    END IF;
    result := jsonb_build_object('event_id',eid,'ownership_version',state.version,'owner',state.owner);$new$);
  body := pg_temp.patch(body,$old$h.protocol_revision IS DISTINCT FROM '1.1'$old$,
    $new$h.protocol_revision IS DISTINCT FROM p_event->>'protocol_revision'$new$);
  body := pg_temp.patch(body,$old$VALUES(d->>'handoff_id',conv,d,d->>'kind','1.1')$old$,
    $new$VALUES(d->>'handoff_id',conv,d,d->>'kind',p_event->>'protocol_revision')$new$);
  body := pg_temp.patch(body,$old$customer := l.customer_id; opportunity := l.opportunity_id;$old$,
    $new$customer := l.customer_id; opportunity := l.opportunity_id; lead_status := 'ignored_stale';$new$);
  body := pg_temp.patch(body,$old$-- Corrections are stored separately; never overwrite pipeline/assignment/notes/money.$old$,
    $new$lead_status := 'updated';
          -- Store bot record first; apply only mapped values with proven provenance.$new$);
  body := pg_temp.patch(body,$old$INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
            SELECT asignado_a,'Requerimiento WhatsApp corregido; revisar antecedentes de integración.','sistema','oportunidad','/ventas/'||id::text FROM public.oportunidades WHERE id=opportunity;$old$,
    $new$PERFORM public.whatsapp_apply_lead_fields(l.external_lead_id,d,false);$new$);
  body := pg_temp.patch(body,$old$VALUES(d->>'name',d->>'name',nullif(trim(d->>'rut'),''),d->>'phone','natural')$old$,
    $new$VALUES(d->>'name',coalesce(d->>'company',d->>'name'),nullif(trim(d->>'rut'),''),d->>'phone',CASE WHEN d->>'customer_type'='company' THEN 'juridica' ELSE 'natural' END)$new$);
  body := pg_temp.patch(body,$old$INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
          VALUES(seller,'Nuevo requerimiento WhatsApp.',$old$,
    $new$PERFORM public.whatsapp_apply_lead_fields(d->>'lead_id',d,true);
        lead_status := 'created';
        INSERT INTO public.notificaciones(usuario_id,mensaje,tipo,entidad_relacionada,link_url)
          VALUES(seller,'Nuevo requerimiento WhatsApp.',$new$);
  body := pg_temp.patch(body,$old$result := result || jsonb_build_object('crm_customer_id',customer,'crm_opportunity_id',opportunity);$old$,
    $new$result := result || jsonb_build_object('crm_customer_id',customer,'crm_opportunity_id',opportunity);
      IF revision12 THEN result := result || jsonb_build_object('status',lead_status); END IF;$new$);
  body := pg_temp.patch(body,$old$SELECT * INTO m FROM public.whatsapp_messages WHERE external_message_id=d->>'message_id';$old$,
    $new$message_status := 'duplicate';
      SELECT * INTO m FROM public.whatsapp_messages WHERE external_message_id=d->>'message_id';$new$);
  body := pg_temp.patch(body,$old$INSERT INTO public.whatsapp_messages(external_message_id,conversation_id,content) VALUES$old$,
    $new$message_status := 'created';
        INSERT INTO public.whatsapp_messages(external_message_id,conversation_id,content) VALUES$new$);
  body := pg_temp.patch(body,$old$result := result || jsonb_build_object('crm_message_id',m.id);$old$,
    $new$result := result || jsonb_build_object('crm_message_id',m.id);
      IF revision12 THEN result := result || jsonb_build_object('status',message_status); END IF;$new$);
  EXECUTE body;
END $migration$;
COMMIT;
