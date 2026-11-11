\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.receive(e jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.whatsapp_receive_event(e,repeat(md5(e::text),2)) $$;
CREATE FUNCTION pg_temp.ev(eid text, typ text, data jsonb, conv text DEFAULT 'extension-chat') RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema_version',1,'protocol_revision','1.1','event_id',eid,'type',typ,'conversation_id',conv,'data',data) $$;
CREATE OR REPLACE FUNCTION pg_temp.ev12(eid text, typ text, data jsonb, conv text DEFAULT 'v12-chat') RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema_version',1,'protocol_revision','1.2','event_id',eid,'type',typ,'conversation_id',conv,'data',data) $$;
-- First public probe deliberately precedes schema-dependent assertions (RED on 1.1).
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('v12-probe','message.new','{"message_id":"v12-probe","direction":"inbound","sender":"customer","text":"Hello","sent_at":"2026-11-11T12:00:00Z"}'))->>'status'='created','S1/S6 accepts 1.2');
RESET ROLE;
-- Rejections must leave integration receipts, domain values and notification counters unchanged.
CREATE OR REPLACE FUNCTION pg_temp.snapshot12() RETURNS text LANGUAGE sql AS $$
 SELECT jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM clientes t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM oportunidades t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM notificaciones t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id) FROM whatsapp_event_inbox t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY external_lead_id) FROM whatsapp_lead_links t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM whatsapp_messages t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY external_handoff_id) FROM whatsapp_handoffs t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY conversation_id) FROM whatsapp_ownership t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY external_lead_id,entity,field) FROM whatsapp_pending_corrections t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY external_handoff_id,usuario_id) FROM whatsapp_handoff_notifications t),
 (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM postventa_casos t))::text
$$;
CREATE OR REPLACE FUNCTION pg_temp.reject12(e jsonb, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_value text := pg_temp.snapshot12();
BEGIN
 BEGIN PERFORM pg_temp.receive(e); RAISE EXCEPTION 'expected rejection';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>expected THEN RAISE EXCEPTION 'expected %, got %',expected,SQLERRM; END IF; END;
 PERFORM pg_temp.assert_true(before_value IS NOT DISTINCT FROM pg_temp.snapshot12(),'rejection unchanged including receipts');
END $$;
SET ROLE service_role;
SELECT pg_temp.ev12('v12-create','lead.qualified','{"lead_id":"v12-lead","revision":1,"phone":"+56977777771","name":"Buyer","rut":"v12-rut","crm_seller_id":"10000000-0000-4000-8000-000000000001","title":"Paving","requirement":"Materials","customer_type":"company","company":"Company","fulfillment":"delivery","address":"Street 1","commune":"Santiago","city":"Santiago","urgency":"media","items":[{"product":"Adoquín","variant":"Piedra","quantity":40,"unit":"m2"},{"product":"Panel","measurements":"2 x 3"}],"site":{"truck_access":false},"ai_summary":{"pain":"Timing"},"desired_date":"2028-02-29"}') AS lead_event \gset
SELECT pg_temp.receive(:'lead_event') AS created \gset
SELECT pg_temp.assert_true(:'created'::jsonb->>'status'='created','S1/S5 1.2 creation');
SELECT (:'created'::jsonb->>'crm_opportunity_id') AS v12_op, (:'created'::jsonb->>'crm_customer_id') AS v12_customer \gset
SELECT pg_temp.assert_true((SELECT tipo_cliente='juridica' AND apellido_razon_social='Company' FROM clientes WHERE id=:'v12_customer'),'S3 customer mapping');
SELECT pg_temp.assert_true((SELECT titulo='Paving' AND direccion_obra='Street 1, Santiago' AND tipo_venta='Suministro' AND modalidad_requerimiento='solo_material' AND forma_entrega='despacho_propio' AND prioridad='normal' AND productos='["Adoquín Piedra 40 m2","Panel (2 x 3)"]'::jsonb FROM oportunidades WHERE id=:'v12_op'),'S3 opportunity mapping');
SELECT pg_temp.assert_true(pg_temp.receive(:'lead_event')->>'status'='duplicate','S5 replay duplicate');
SELECT pg_temp.assert_true(pg_temp.receive(:'lead_event'::jsonb || '{"event_id":"v12-equal"}')->>'status'='ignored_stale','S5 equal identical');
SELECT pg_temp.reject12(jsonb_set(:'lead_event'::jsonb || '{"event_id":"v12-conflict"}','{data,title}','"Different"'),'revision_conflict');
SELECT pg_temp.reject12(:'lead_event'::jsonb || '{"data":{}}','event_conflict');
-- A human owns these values now. Corrections may only change mapped fields still at the applied snapshot.
UPDATE oportunidades SET titulo='Human title',asignado_a='10000000-0000-4000-8000-000000000003',estado_pipeline='cotizada',monto_abonado=123,notas_venta='["keep"]' WHERE id=:'v12_op';
SELECT jsonb_set(:'lead_event'::jsonb || '{"event_id":"v12-update"}','{data}',(:'lead_event'::jsonb->'data') || '{"revision":2,"title":"Bot title","fulfillment":"install","company":"New company","rut":"new-rut","urgency":"alta"}') AS correction \gset
SELECT pg_temp.assert_true(pg_temp.receive(:'correction')->>'status'='updated','S4/S5 higher revision');
SELECT pg_temp.assert_true((SELECT titulo='Human title' AND tipo_venta='Instalación' AND modalidad_requerimiento='instalacion' AND forma_entrega IS NULL AND prioridad='alta' AND asignado_a='10000000-0000-4000-8000-000000000003' AND estado_pipeline='cotizada' AND monto_abonado=123 AND notas_venta='["keep"]'::jsonb FROM oportunidades WHERE id=:'v12_op'),'S4 safe writes and invariants');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM whatsapp_pending_corrections WHERE external_lead_id='v12-lead'),'S4 title/company/rut pending');
SELECT pg_temp.assert_true((SELECT before_value='"Human title"' AND after_value='"Bot title"' FROM whatsapp_pending_corrections WHERE external_lead_id='v12-lead' AND field='titulo'),'S4 before and after');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notificaciones WHERE usuario_id='10000000-0000-4000-8000-000000000003' AND mensaje='Corrección WhatsApp: 4 cambios aplicados; 3 pendientes de revisión.'),'S4 notification counts');
SELECT pg_temp.assert_true((SELECT apellido_razon_social='Company' AND rut='v12-rut' FROM clientes WHERE id=:'v12_customer'),'S4 customer never auto applied');
-- Newer same-field proposals replace older entries; omitted optional values never clear.
SELECT jsonb_set(:'correction'::jsonb || '{"event_id":"v12-replace"}','{data}',(:'correction'::jsonb->'data') || '{"revision":3,"title":"Newest title"}') AS replacement \gset
SELECT pg_temp.receive(:'replacement');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(after_value='"Newest title"' AND revision=3) FROM whatsapp_pending_corrections WHERE external_lead_id='v12-lead' AND field='titulo'),'S4 bounded replacement');
SELECT pg_temp.receive(jsonb_set(:'replacement'::jsonb || '{"event_id":"v12-omit"}','{data}',((:'lead_event'::jsonb->'data') - ARRAY['fulfillment','address','commune','city','urgency','items','company','customer_type','rut']) || '{"revision":4}'));
SELECT pg_temp.assert_true((SELECT direccion_obra='Street 1, Santiago' AND prioridad='alta' AND tipo_venta='Instalación' AND productos='["Adoquín Piedra 40 m2","Panel (2 x 3)"]'::jsonb FROM oportunidades WHERE id=:'v12_op'),'S2 absent does not clear');
SELECT pg_temp.assert_true(pg_temp.receive(:'lead_event'::jsonb || '{"event_id":"v12-lower"}')->>'status'='ignored_stale','S5 lower revision');
-- Every protocol applies S4, without adding status to old results.
SELECT pg_temp.receive(jsonb_set((:'lead_event'::jsonb || '{"event_id":"v11-correction","protocol_revision":"1.1"}'),'{data}',((:'lead_event'::jsonb->'data') - ARRAY['fulfillment','address','commune','city','urgency','items','company','customer_type','site','ai_summary','desired_date']) || '{"revision":5,"title":"Legacy correction"}')) AS compat \gset
SELECT pg_temp.assert_true(NOT (:'compat'::jsonb ? 'status'),'S1 legacy result shape');
-- Conservative pre-migration links have no bot provenance, even if their current title happens to match.
SELECT pg_temp.receive(pg_temp.ev('old-correction','lead.qualified','{"lead_id":"lead-1","revision":99,"phone":"+56912345678","name":"Buyer","rut":"old-rut","crm_seller_id":"10000000-0000-4000-8000-000000000001","title":"Do not auto apply","requirement":"Changed"}','chat-1'));
SELECT pg_temp.assert_true((SELECT titulo<>'Do not auto apply' FROM oportunidades WHERE id=(SELECT opportunity_id FROM whatsapp_lead_links WHERE external_lead_id='lead-1')),'S4 no backfilled provenance');
DO $$ DECLARE base jsonb := '{"lead_id":"invalid12","revision":1,"phone":"+56977777772","name":"Buyer","rut":"x","crm_seller_id":"10000000-0000-4000-8000-000000000001","title":"T","requirement":"R"}'; x jsonb; BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements('[{"extra":1},{"customer_type":"juridica"},{"company":""},{"tax_document":"invoice"},{"fulfillment":"other"},{"urgency":"normal"},{"desired_date":"2026-02-30"},{"source_number":"123"},{"site":{"truck_access":"yes"}},{"site":{"unknown":true}},{"items":[{"product":"P","quantity":0}]},{"items":[{"product":"P","quantity":"1"}]},{"items":[{"variant":"V"}]},{"items":[{"product":"P","unknown":1}]},{"ai_summary":{"pain":null}},{"ai_summary":{"unknown":"x"}}]') LOOP
  PERFORM pg_temp.reject12(pg_temp.ev12('invalid12','lead.qualified',base||x),'invalid_event');
 END LOOP;
 PERFORM pg_temp.reject12(pg_temp.ev12('too-long','lead.qualified',base||jsonb_build_object('address',repeat('x',301))),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('too-many','lead.qualified',base||jsonb_build_object('items',(SELECT jsonb_agg('{"product":"P"}'::jsonb) FROM generate_series(1,51)))),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev('v11-extra','lead.qualified',base||'{"company":"X"}'),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('bad-revision12','lead.qualified',base)||'{"protocol_revision":"1.3"}','invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('numeric-revision12','lead.qualified',base)||'{"protocol_revision":1.2}','invalid_event');
END $$;
SELECT pg_temp.ev12('message12','message.new','{"message_id":"message12","direction":"outbound","sender":"seller","crm_seller_id":"10000000-0000-4000-8000-000000000001","text":"Hello","sent_at":"2026-11-11T12:00:00Z"}') AS message_event \gset
SELECT pg_temp.assert_true(pg_temp.receive(:'message_event')->>'status'='created','S6 message created');
SELECT pg_temp.assert_true(pg_temp.receive(:'message_event')->>'status'='duplicate','S6 message replay');
SELECT pg_temp.assert_true(pg_temp.receive(:'message_event'::jsonb||'{"event_id":"message12-other"}')->>'status'='duplicate','S6 message identity duplicate');
SELECT pg_temp.reject12(jsonb_set(:'message_event'::jsonb||'{"event_id":"bad-message-seller"}','{data,crm_seller_id}','"10000000-0000-4000-8000-000000000002"'),'invalid_seller');
SELECT pg_temp.reject12(jsonb_set(:'message_event'::jsonb||'{"event_id":"bad-direction"}','{data,direction}','"inbound"'),'invalid_event');
SELECT pg_temp.reject12(jsonb_set(:'message_event'::jsonb||'{"event_id":"bad-sender"}','{data,sender}','"bot"'),'invalid_event');
SELECT pg_temp.receive(pg_temp.ev12('take12','ownership.taken','{"version":1,"crm_seller_id":"10000000-0000-4000-8000-000000000001","source":"crm"}','ownership12'));
SELECT pg_temp.ev12('release12','ownership.released','{"version":2,"reason":"sla_expired"}','ownership12') AS release_event \gset
SELECT pg_temp.receive(:'release_event');
SELECT pg_temp.receive(:'release_event');
SELECT pg_temp.receive(:'release_event'::jsonb||'{"event_id":"release12-equal"}');
SELECT pg_temp.receive(jsonb_set(:'release_event'::jsonb||'{"event_id":"release12-stale"}','{data,version}','1'));
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notificaciones WHERE mensaje='WhatsApp: SLA vencido; conversación liberada.'),'S7 release exactly once');
SELECT pg_temp.assert_true((SELECT release_reason='sla_expired' AND owner='bot' FROM whatsapp_ownership WHERE conversation_id='ownership12'),'S7 reason durable');
SELECT pg_temp.reject12(jsonb_set(:'release_event'::jsonb||'{"event_id":"release12-conflict"}','{data,reason}','"seller_released"'),'ownership_conflict');
SELECT pg_temp.reject12(:'release_event'::jsonb||'{"event_id":"release11-reason","protocol_revision":"1.1"}','invalid_event');
SELECT pg_temp.receive(pg_temp.ev12('handoff12','handoff.created','{"handoff_id":"handoff12","kind":"commercial","area":"sales","reason":"human_requested","priority":"alta","description":"Quote"}')) AS handoff12 \gset
SELECT pg_temp.assert_true(:'handoff12'::jsonb->>'routing_status'='routed' AND :'handoff12'::jsonb->>'crm_opportunity_id'=:'v12_op','S8 identical linked handoff');
SELECT whatsapp_complete_handoff('handoff12');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM whatsapp_handoff_notifications WHERE external_handoff_id='handoff12'),'S8 dedup completion');
-- S2/S4: partial address revisions preserve raw components, not parsed display strings.
DO $$
DECLARE
 base jsonb := '{"lead_id":"partial-address12","phone":"+56977777775","name":"Buyer","rut":"address-rut","crm_seller_id":"10000000-0000-4000-8000-000000000001","title":"Address","requirement":"Materials"}';
 result jsonb; opportunity uuid; latest jsonb; before_replay text;
BEGIN
 result := pg_temp.receive(pg_temp.ev12('address12-create','lead.qualified',base || '{"revision":1,"address":"Old street","commune":"Old commune","city":"Old city"}','partial-address12'));
 opportunity := (result->>'crm_opportunity_id')::uuid;
 PERFORM pg_temp.assert_true(result->>'status'='created','partial address creation');
 PERFORM pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('address12-city','lead.qualified',base || '{"revision":2,"city":"New city"}','partial-address12'))->>'status'='updated','partial city revision applied');
 PERFORM pg_temp.assert_true((SELECT direccion_obra='Old street, Old commune, New city' FROM oportunidades WHERE id=opportunity),'S2/S4 city-only revision preserves omitted street and commune');
 PERFORM pg_temp.receive(pg_temp.ev12('address12-omitted','lead.qualified',base || '{"revision":3}','partial-address12'));
 PERFORM pg_temp.assert_true((SELECT direccion_obra='Old street, Old commune, New city' FROM oportunidades WHERE id=opportunity),'intermediate revision without components keeps address');
 PERFORM pg_temp.receive(pg_temp.ev12('address12-commune','lead.qualified',base || '{"revision":4,"commune":"New city"}','partial-address12'));
 PERFORM pg_temp.assert_true((SELECT direccion_obra='Old street, New city' FROM oportunidades WHERE id=opportunity),'remembered city deduplicates with updated commune');
 PERFORM pg_temp.receive(pg_temp.ev12('address12-street','lead.qualified',base || '{"revision":5,"address":"New street"}','partial-address12'));
 PERFORM pg_temp.assert_true((SELECT direccion_obra='New street, New city' FROM oportunidades WHERE id=opportunity),'street-only revision retains components across intermediate omissions');
 UPDATE oportunidades SET direccion_obra='Human address' WHERE id=opportunity;
 PERFORM pg_temp.receive(pg_temp.ev12('address12-human-conflict','lead.qualified',base || '{"revision":6,"city":"Latest city"}','partial-address12'));
 PERFORM pg_temp.assert_true((SELECT direccion_obra='Human address' FROM oportunidades WHERE id=opportunity),'partial bot address never overwrites human edit');
 PERFORM pg_temp.assert_true((SELECT before_value='"Human address"' AND after_value='"New street, New city, Latest city"' AND revision=6 FROM whatsapp_pending_corrections WHERE external_lead_id='partial-address12' AND entity='opportunity' AND field='direccion_obra'),'pending address uses preserved components and exact human before');
 PERFORM pg_temp.receive(pg_temp.ev12('address12-pending-omitted','lead.qualified',base || '{"revision":7}','partial-address12'));
 PERFORM pg_temp.assert_true((SELECT after_value='"New street, New city, Latest city"' AND revision=6 FROM whatsapp_pending_corrections WHERE external_lead_id='partial-address12' AND field='direccion_obra'),'omitted components do not replace pending address');
 latest := base || '{"revision":8,"commune":"Latest city"}';
 PERFORM pg_temp.receive(pg_temp.ev12('address12-pending-replace','lead.qualified',latest,'partial-address12'));
 PERFORM pg_temp.assert_true((SELECT count(*)=1 AND bool_and(before_value='"Human address"' AND after_value='"New street, Latest city"' AND revision=8) FROM whatsapp_pending_corrections WHERE external_lead_id='partial-address12'),'new partial proposal replaces pending field and deduplicates remembered city');
 PERFORM pg_temp.assert_true((SELECT direccion_obra='Human address' FROM oportunidades WHERE id=opportunity),'pending replacement preserves human address');
 PERFORM pg_temp.assert_true((SELECT count(*)=8 FROM notificaciones WHERE link_url='/ventas/'||opportunity::text),'each accepted correction notifies once');
 PERFORM pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('address12-equal-raw','lead.qualified',latest,'partial-address12'))->>'status'='ignored_stale','equal revision compares unchanged raw payload');
 before_replay := pg_temp.snapshot12();
 PERFORM pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('address12-pending-replace','lead.qualified',latest,'partial-address12'))->>'status'='duplicate','original raw replay remains identical');
 PERFORM pg_temp.assert_true(pg_temp.snapshot12()=before_replay,'replay changes no rows or counters');
 PERFORM pg_temp.reject12(pg_temp.ev12('address12-equal-merged','lead.qualified',latest || '{"address":"New street","city":"Latest city"}','partial-address12'),'revision_conflict');
END $$;
-- Scalar/nested text limits, their inclusive boundaries, and strict types.
DO $$ DECLARE k text; bound integer; base jsonb := '{"lead_id":"boundary12","revision":1,"phone":"+56977777774","name":"Buyer","rut":"r","crm_seller_id":"10000000-0000-4000-8000-000000000001","title":"T","requirement":"R"}'; details jsonb; nested_key text; BEGIN
 FOR k,bound IN SELECT * FROM (VALUES ('company',200),('purchase_order',100),('service',100),('city',100),('commune',100),('address',300),('use_case',200)) AS limits(k,n) LOOP
  PERFORM pg_temp.reject12(pg_temp.ev12('limit-invalid','lead.qualified',base||jsonb_build_object(k,repeat('x',bound+1))),'invalid_event');
  PERFORM pg_temp.reject12(pg_temp.ev12('type-invalid','lead.qualified',base||jsonb_build_object(k,123)),'invalid_event');
  PERFORM pg_temp.reject12(pg_temp.ev12('empty-invalid','lead.qualified',base||jsonb_build_object(k,'  ')),'invalid_event');
 END LOOP;
 FOREACH nested_key IN ARRAY ARRAY['lead_class','next_best_action','executive_summary','pain','scope','timing','obstacle'] LOOP
  PERFORM pg_temp.reject12(pg_temp.ev12('summary-limit','lead.qualified',base||jsonb_build_object('ai_summary',jsonb_build_object(nested_key,repeat('x',4001)))),'invalid_event');
 END LOOP;
 FOR k,bound IN SELECT * FROM (VALUES ('variant',200),('unit',20),('measurements',200),('product',200)) AS limits(k,n) LOOP
  PERFORM pg_temp.reject12(pg_temp.ev12('item-limit','lead.qualified',base||jsonb_build_object('items',jsonb_build_array('{"product":"P"}'::jsonb||jsonb_build_object(k,repeat('x',bound+1))))),'invalid_event');
 END LOOP;
 PERFORM pg_temp.reject12(pg_temp.ev12('site-limit','lead.qualified',base||jsonb_build_object('site',jsonb_build_object('terrain',repeat('x',101)))),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('restriction-limit','lead.qualified',base||jsonb_build_object('site',jsonb_build_object('access_restrictions',repeat('x',501)))),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('debris-type','lead.qualified',base||'{"site":{"debris_removal":null}}'),'invalid_event');
 details := base||jsonb_build_object('company',repeat('x',200),'purchase_order',repeat('x',100),'service',repeat('x',100),'city',repeat('x',100),'commune',repeat('x',100),'address',repeat('x',300),'use_case',repeat('x',200),'tax_document','factura','source_number','+56977777774','site',jsonb_build_object('terrain',repeat('x',100),'access_restrictions',repeat('x',500),'truck_access',true,'debris_removal',false),'ai_summary',jsonb_build_object('executive_summary',repeat('x',4000)),'items',(SELECT jsonb_agg(jsonb_build_object('product',repeat('p',200),'variant',repeat('v',200),'unit',repeat('u',20),'measurements',repeat('m',200),'quantity',0.5)) FROM generate_series(1,50)));
 PERFORM pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('boundary12','lead.qualified',details,'boundary12'))->>'status'='created','S2 inclusive scalar/nested/50-item boundaries');
END $$;
-- All release reasons persist, but only SLA expiry emits the missed-SLA notification.
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['seller_released','customer_new_quote','opportunity_closed'] LOOP
  PERFORM pg_temp.receive(pg_temp.ev12('take-'||r,'ownership.taken','{"version":1,"crm_seller_id":"10000000-0000-4000-8000-000000000001","source":"clickup"}',r));
  PERFORM pg_temp.receive(pg_temp.ev12('release-'||r,'ownership.released',jsonb_build_object('version',2,'reason',r),r));
  PERFORM pg_temp.assert_true((SELECT release_reason=r AND owner='bot' FROM whatsapp_ownership WHERE conversation_id=r),'S7 each release reason');
 END LOOP;
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM notificaciones WHERE mensaje='WhatsApp: SLA vencido; conversación liberada.'),'S7 non-SLA releases do not notify missed SLA');
 PERFORM pg_temp.reject12(pg_temp.ev12('reason-absent12','ownership.released','{"version":3}'),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('reason-invalid12','ownership.released','{"version":3,"reason":"other"}'),'invalid_event');
END $$;
-- Valid author variants, inactive sellers, and malformed/missing seller IDs.
DO $$ DECLARE sender_name text; message_data jsonb; BEGIN
 FOREACH sender_name IN ARRAY ARRAY['customer','bot','system'] LOOP
  message_data := jsonb_build_object('message_id','author-'||sender_name,'direction',CASE WHEN sender_name='customer' THEN 'inbound' ELSE 'outbound' END,'sender',sender_name,'text','Hello','sent_at','2026-11-11T12:00:00Z');
  PERFORM pg_temp.assert_true(pg_temp.receive(pg_temp.ev12('author-'||sender_name,'message.new',message_data))->>'status'='created','S6 each sender');
 END LOOP;
 PERFORM pg_temp.reject12(pg_temp.ev12('missing-seller','message.new','{"message_id":"missing-seller","direction":"outbound","sender":"seller","text":"Hello","sent_at":"2026-11-11T12:00:00Z"}'),'invalid_event');
 PERFORM pg_temp.reject12(pg_temp.ev12('missing-sender','message.new','{"message_id":"missing-sender","direction":"inbound","text":"Hello","sent_at":"2026-11-11T12:00:00Z"}'),'invalid_event');
END $$;
UPDATE usuarios SET activo=false WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.reject12(jsonb_set(:'message_event'::jsonb||'{"event_id":"inactive-message-seller"}','{data,message_id}','"inactive-message-seller"'),'invalid_seller');
UPDATE usuarios SET activo=true WHERE id='10000000-0000-4000-8000-000000000001';
-- Customer matching must never reclassify an existing customer on lead creation.
SELECT jsonb_set(:'lead_event'::jsonb || '{"event_id":"v12-matched","conversation_id":"v12-matched"}','{data}',(:'lead_event'::jsonb->'data') || '{"lead_id":"v12-matched","company":"Do not overwrite","customer_type":"natural","fulfillment":"pickup","items":[]}') AS matched_event \gset
SELECT pg_temp.receive(:'matched_event') AS matched \gset
SELECT pg_temp.assert_true(:'matched'::jsonb->>'crm_customer_id'=:'v12_customer','S3 matched customer reused');
SELECT pg_temp.assert_true((SELECT tipo_cliente='juridica' AND apellido_razon_social='Company' FROM clientes WHERE id=:'v12_customer'),'S3 matched customer untouched');
SELECT pg_temp.assert_true((SELECT forma_entrega='retiro_cliente' AND productos='[]'::jsonb FROM oportunidades WHERE id=(:'matched'::jsonb->>'crm_opportunity_id')::uuid),'S3 pickup and explicit empty items');
-- Natural defaults and nullable item properties preserve the exact rendered product.
SELECT pg_temp.receive(jsonb_set(:'matched_event'::jsonb || '{"event_id":"v12-defaults","conversation_id":"v12-defaults"}','{data}',((:'lead_event'::jsonb->'data') - ARRAY['customer_type','company','fulfillment','urgency','address','city','commune']) || '{"lead_id":"v12-defaults","phone":"+56977777773","items":[{"product":"Panel","variant":null,"quantity":null,"unit":null,"measurements":null}]}')) AS defaults \gset
SELECT pg_temp.assert_true((SELECT tipo_cliente='natural' AND apellido_razon_social='Buyer' FROM clientes WHERE id=(:'defaults'::jsonb->>'crm_customer_id')::uuid),'S3 natural and name fallback');
SELECT pg_temp.assert_true((SELECT modalidad_requerimiento='instalacion' AND tipo_venta='Instalación' AND prioridad='urgente' AND direccion_obra IS NULL AND productos='["Panel"]'::jsonb FROM oportunidades WHERE id=(:'defaults'::jsonb->>'crm_opportunity_id')::uuid),'S3 omitted defaults');
-- Defaults on a newly created opportunity are known provenance, unlike pre-migration rows.
SELECT pg_temp.receive(jsonb_set(:'lead_event'::jsonb || '{"event_id":"v12-defaults-correct","conversation_id":"v12-defaults"}','{data}',((:'lead_event'::jsonb->'data') - ARRAY['customer_type','company','urgency','address','city','commune']) || '{"lead_id":"v12-defaults","phone":"+56977777773","revision":2,"fulfillment":"pickup"}'));
SELECT pg_temp.assert_true((SELECT tipo_venta='Suministro' AND modalidad_requerimiento='solo_material' AND forma_entrega='retiro_cliente' FROM oportunidades WHERE id=(:'defaults'::jsonb->>'crm_opportunity_id')::uuid),'S4 new default provenance permits later sent fields');
-- The 1.2 complaint still reuses the single explicit-folio Postventa path.
SELECT pg_temp.receive(pg_temp.ev12('claim12','handoff.created','{"handoff_id":"claim12","kind":"complaint","reason":"damaged_glass","priority":"alta","description":"1.2 claim"}')) AS claim12 \gset
SELECT whatsapp_complete_handoff('claim12');
SELECT pg_temp.assert_true((SELECT folio='PV-WA-'||id::text AND oportunidad_id=:'v12_op' FROM postventa_casos WHERE id=(:'claim12'::jsonb->>'crm_case_id')::uuid),'S8 complaint folio and association');
SELECT pg_temp.receive(pg_temp.ev12('operational12','handoff.created','{"handoff_id":"operational12","kind":"operational","area":"finance","reason":"payment_question","priority":"baja","description":"Finance"}')) AS operational12 \gset
SELECT pg_temp.assert_true(:'operational12'::jsonb->>'status'='operational' AND :'operational12'::jsonb->>'crm_opportunity_id' IS NULL,'S8 operational never associates');
RESET ROLE;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 PERFORM pg_temp.assert_true(NOT has_table_privilege(r,'whatsapp_pending_corrections','SELECT,INSERT,UPDATE,DELETE'),'S9 seam closed to browser');
 END LOOP;
END $$;
