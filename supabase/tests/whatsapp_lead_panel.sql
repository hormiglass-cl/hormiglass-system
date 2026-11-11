\set ON_ERROR_STOP on
-- S9 "Ficha WhatsApp": read the stored bot record and resolve pending corrections through RPCs.
CREATE FUNCTION pg_temp.ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.lead(eid text, data jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.whatsapp_receive_event(jsonb_build_object('schema_version',1,'protocol_revision','1.2','event_id',eid,'type','lead.qualified','conversation_id','panel-chat','data',data),repeat(md5(eid),2)) $$;
INSERT INTO usuarios(id,nombre,email,rol,activo,auth_id) VALUES
  ('20000000-0000-4000-8000-000000000001','Panel seller','panel-seller@example.invalid','user',true,'30000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','Panel finance','panel-finance@example.invalid','finanzas',true,'30000000-0000-4000-8000-000000000002'),
  ('20000000-0000-4000-8000-000000000003','Panel inactive','panel-inactive@example.invalid','user',false,'30000000-0000-4000-8000-000000000003');

-- Lead created by the bot, then a human edits title and priority, then the bot corrects them.
SET ROLE service_role;
SELECT (pg_temp.lead('panel-1','{"lead_id":"panel-lead","revision":1,"phone":"+56977777781","name":"Panel Buyer","rut":"panel-rut","crm_seller_id":"20000000-0000-4000-8000-000000000001","title":"Patio","requirement":"Pavers","urgency":"alta","tax_document":"factura","site":{"truck_access":true}}')->>'crm_opportunity_id') AS op \gset
RESET ROLE;
SELECT cliente_id AS customer FROM oportunidades WHERE id=:'op' \gset
UPDATE oportunidades SET titulo='Patio (human)', prioridad='urgente' WHERE id=:'op';
SET ROLE service_role;
SELECT pg_temp.lead('panel-2','{"lead_id":"panel-lead","revision":2,"phone":"+56977777781","name":"Panel Buyer","rut":"panel-rut","crm_seller_id":"20000000-0000-4000-8000-000000000001","title":"Patio grande","requirement":"Pavers","urgency":"baja","customer_type":"company","tax_document":"factura","site":{"truck_access":true}}');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=3 FROM whatsapp_pending_corrections WHERE external_lead_id='panel-lead'),'setup: titulo, prioridad and tipo_cliente pending');

-- Browsers never read WhatsApp tables directly; anonymous callers cannot execute the RPCs.
SET ROLE authenticated;
DO $$ BEGIN PERFORM 1 FROM public.whatsapp_lead_links; RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM 1 FROM public.whatsapp_pending_corrections; RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN PERFORM public.whatsapp_lead_panel(gen_random_uuid()); RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.as_user(auth_id text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub',auth_id,false); $$;
CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_array((SELECT to_jsonb(o) FROM oportunidades o WHERE o.id=(SELECT opportunity_id FROM whatsapp_lead_links WHERE external_lead_id='panel-lead')),
    (SELECT to_jsonb(c) FROM clientes c WHERE c.id=(SELECT customer_id FROM whatsapp_lead_links WHERE external_lead_id='panel-lead')),
    (SELECT to_jsonb(l) FROM whatsapp_lead_links l WHERE external_lead_id='panel-lead'),
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY entity,field) FROM whatsapp_pending_corrections p))::text $$;
CREATE FUNCTION pg_temp.refuse(op uuid, entity text, field text, expected jsonb, accept boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state text;
BEGIN
  SET LOCAL ROLE NONE; before_state := pg_temp.state(); SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.whatsapp_resolve_correction(op,entity,field,expected,accept); RAISE EXCEPTION 'expected %',message;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>message THEN RAISE EXCEPTION 'expected %, got %',message,SQLERRM; END IF; END;
  SET LOCAL ROLE NONE;
  PERFORM pg_temp.ok(before_state=pg_temp.state(),'refused resolution leaves no change: '||message);
END $$;

-- Missing or inactive CRM users are refused; any active user reads; only user/admin resolve.
SET ROLE authenticated;
DO $$ BEGIN PERFORM public.whatsapp_lead_panel(gen_random_uuid()); RAISE EXCEPTION 'expected forbidden'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'forbidden' THEN RAISE; END IF; END $$;
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000003');
SELECT pg_temp.refuse(:'op','opportunity','titulo','"Patio grande"',true,'forbidden');
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000002');
SELECT public.whatsapp_lead_panel(:'op') AS finance_view \gset
SELECT pg_temp.ok((:'finance_view'::jsonb->>'can_resolve')::boolean=false,'S9 finance reads without resolving');
SELECT pg_temp.refuse(:'op','opportunity','titulo','"Patio grande"',true,'forbidden');

-- Seller view: record, revision and before -> after corrections (opportunity fields first).
SELECT pg_temp.as_user('30000000-0000-4000-8000-000000000001');
SELECT public.whatsapp_lead_panel(:'op') AS view \gset
SELECT pg_temp.ok(:'view'::jsonb->>'lead_id'='panel-lead' AND (:'view'::jsonb->>'revision')::int=2 AND (:'view'::jsonb->>'can_resolve')::boolean,'S9 seller view header');
SELECT pg_temp.ok(:'view'::jsonb->'record'->>'tax_document'='factura' AND :'view'::jsonb->'record'->'site'='{"truck_access":true}' AND NOT (:'view'::jsonb->'record' ? 'revision'),'S9 stored bot record');
SELECT pg_temp.ok((SELECT jsonb_agg(jsonb_build_array(e->>'entity',e->>'field',e->'before',e->'after')) FROM jsonb_array_elements(:'view'::jsonb->'corrections') e)
  ='[["opportunity","prioridad","urgente","normal"],["opportunity","titulo","Patio (human)","Patio grande"],["customer","tipo_cliente","natural","juridica"]]'::jsonb,'S9 corrections before -> after');
SELECT pg_temp.ok(public.whatsapp_lead_panel(gen_random_uuid()) IS NULL,'S9 no lead link means no panel');

-- Stale or unknown corrections are refused without changes.
SELECT pg_temp.refuse(:'op','opportunity','titulo','"Patio"',true,'correction_changed');
SELECT pg_temp.refuse(:'op','opportunity','forma_entrega','null',true,'correction_not_found');
SELECT pg_temp.refuse(gen_random_uuid(),'opportunity','titulo','"Patio grande"',true,'correction_not_found');
SELECT pg_temp.refuse(:'op','opportunity','titulo','"Patio grande"',NULL,'invalid_resolution');

-- Accept writes the value and the snapshot; discard keeps the current value.
SELECT public.whatsapp_resolve_correction(:'op','opportunity','titulo','"Patio grande"',true) AS after_accept \gset
SELECT pg_temp.ok(jsonb_array_length(:'after_accept'::jsonb->'corrections')=2,'S9 accept returns refreshed panel');
SELECT pg_temp.ok(public.whatsapp_resolve_correction(:'op','opportunity','prioridad','"normal"',false) IS NOT NULL,'S9 discard opportunity field');
SELECT pg_temp.ok(jsonb_array_length(public.whatsapp_resolve_correction(:'op','customer','tipo_cliente','"juridica"',false)->'corrections')=0,'S9 discard customer field');
RESET ROLE;
SELECT pg_temp.ok((SELECT titulo='Patio grande' AND prioridad='urgente' FROM oportunidades WHERE id=:'op'),'S9 accepted written, discarded kept');
SELECT pg_temp.ok((SELECT tipo_cliente='natural' FROM clientes WHERE id=:'customer'),'S9 discarded customer value kept');
SELECT pg_temp.ok((SELECT last_applied->>'titulo'='Patio grande' AND last_applied->>'prioridad'='normal' FROM whatsapp_lead_links WHERE external_lead_id='panel-lead'),'S9 snapshot updated');

-- Next bot revision: accepted field follows the bot again; a discarded value is not proposed again.
SET ROLE service_role;
SELECT pg_temp.lead('panel-3','{"lead_id":"panel-lead","revision":3,"phone":"+56977777781","name":"Panel Buyer","rut":"panel-rut","crm_seller_id":"20000000-0000-4000-8000-000000000001","title":"Patio final","requirement":"Pavers","urgency":"baja","tax_document":"factura","site":{"truck_access":true}}');
RESET ROLE;
SELECT pg_temp.ok((SELECT titulo='Patio final' AND prioridad='urgente' FROM oportunidades WHERE id=:'op'),'S4 after accept the bot applies; discarded value stays human');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM whatsapp_pending_corrections WHERE external_lead_id='panel-lead' AND entity='opportunity'),'S4 discarded value not re-proposed');

-- Accepting a customer correction writes the customer; null bot values round-trip as JSON null.
SET ROLE service_role;
SELECT pg_temp.lead('panel-4','{"lead_id":"panel-lead","revision":4,"phone":"+56977777781","name":"Panel Buyer","rut":"panel-rut","crm_seller_id":"20000000-0000-4000-8000-000000000001","title":"Patio final","requirement":"Pavers","urgency":"baja","customer_type":"company","fulfillment":"install","tax_document":"factura","site":{"truck_access":true}}');
RESET ROLE;
UPDATE oportunidades SET forma_entrega='retiro_cliente' WHERE id=:'op';
UPDATE whatsapp_lead_links SET last_applied=last_applied||'{"forma_entrega":"despacho_propio"}' WHERE external_lead_id='panel-lead';
SET ROLE service_role;
SELECT pg_temp.lead('panel-5','{"lead_id":"panel-lead","revision":5,"phone":"+56977777781","name":"Panel Buyer","rut":"panel-rut","crm_seller_id":"20000000-0000-4000-8000-000000000001","title":"Patio final","requirement":"Pavers","urgency":"baja","customer_type":"company","fulfillment":"install","tax_document":"factura","site":{"truck_access":false}}');
RESET ROLE;
SET ROLE authenticated;
SELECT public.whatsapp_resolve_correction(:'op','customer','tipo_cliente','"juridica"',true) IS NOT NULL AS accepted_customer;
SELECT public.whatsapp_resolve_correction(:'op','opportunity','forma_entrega',NULL,true) IS NOT NULL AS accepted_null;
RESET ROLE;
SELECT pg_temp.ok((SELECT tipo_cliente='juridica' FROM clientes WHERE id=:'customer'),'S9 accepted customer value written');
SELECT pg_temp.ok((SELECT forma_entrega IS NULL FROM oportunidades WHERE id=:'op'),'S9 accepted null value written');
SELECT set_config('request.jwt.claim.sub','',false);
