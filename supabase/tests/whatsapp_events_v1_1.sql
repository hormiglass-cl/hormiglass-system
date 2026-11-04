\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.ev(eid text, typ text, data jsonb, conv text DEFAULT 'extension-chat', revision boolean DEFAULT true) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema_version',1,'event_id',eid,'type',typ,'conversation_id',conv,'data',data) || CASE WHEN revision THEN '{"protocol_revision":"1.1"}'::jsonb ELSE '{}'::jsonb END $$;
CREATE FUNCTION pg_temp.receive(e jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.whatsapp_receive_event(e,repeat(md5(e::text),2)) $$;
-- Snapshot complete public domain values, not just counts: late failures must not alter management.
CREATE FUNCTION pg_temp.snapshot() RETURNS text LANGUAGE sql AS $$ SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM clientes t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM oportunidades t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM notificaciones t),(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM postventa_casos t))::text) $$;
CREATE FUNCTION pg_temp.reject(e jsonb, expected text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE before_value text := pg_temp.snapshot(); BEGIN BEGIN PERFORM pg_temp.receive(e); RAISE EXCEPTION 'expected rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>expected THEN RAISE EXCEPTION 'expected %, got %',expected,SQLERRM; END IF; END; PERFORM pg_temp.assert_true(before_value=pg_temp.snapshot(),'rejection unchanged values'); END $$;
INSERT INTO usuarios(id,nombre,email,rol) VALUES ('10000000-0000-4000-8000-000000000003','Current seller','current@example.invalid','admin');
SET ROLE service_role;
-- Existing lead was reassigned by a person; routing must use that current assignment.
SELECT id AS opportunity FROM oportunidades WHERE titulo='Glass request' AND estado_pipeline='cotizada' ORDER BY codigo LIMIT 1 \gset
UPDATE oportunidades SET asignado_a='10000000-0000-4000-8000-000000000003' WHERE id=:'opportunity';
SELECT pg_temp.snapshot() AS original_domain \gset
SELECT pg_temp.receive(pg_temp.ev('sales-pending','handoff.created','{"handoff_id":"sales","kind":"commercial","area":"sales","reason":"human_requested","priority":"alta","description":"Quote"}')) AS pending \gset
SELECT pg_temp.assert_true(:'pending'::jsonb = '{"event_id":"sales-pending","external_handoff_id":"sales","crm_case_id":null,"crm_opportunity_id":null,"status":"pending_association","routing_status":"pending_routing"}','pending commercial exact result');
SELECT whatsapp_complete_handoff('sales',:'opportunity') AS sales \gset
SELECT pg_temp.assert_true(:'sales'::jsonb->>'routing_status'='routed' AND :'sales'::jsonb->>'status'='associated','service association routes');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notificaciones WHERE mensaje='Derivación WhatsApp: human_requested' AND usuario_id='10000000-0000-4000-8000-000000000003'),'current seller notified');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('sales-pending','handoff.created','{"handoff_id":"sales","kind":"commercial","area":"sales","reason":"human_requested","priority":"alta","description":"Quote"}'))=:'pending'::jsonb,'exact replay original after association');
SELECT whatsapp_complete_handoff('sales',:'opportunity');
SELECT pg_temp.receive(pg_temp.ev('sales-new-event','handoff.created','{"handoff_id":"sales","kind":"commercial","area":"sales","reason":"human_requested","priority":"alta","description":"Quote"}'));
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM notificaciones WHERE mensaje='Derivación WhatsApp: human_requested'),'routing dedup');
SELECT pg_temp.reject(pg_temp.ev('sales-changed','handoff.created','{"handoff_id":"sales","kind":"commercial","area":"sales","reason":"changed","priority":"alta","description":"Quote"}'),'identity_conflict');
SELECT pg_temp.receive(pg_temp.ev('management','handoff.created',jsonb_build_object('handoff_id','management','kind','commercial','area','management','reason','manager_requested','priority','urgente','description','Manager','crm_opportunity_id',:'opportunity'))) AS management \gset
SELECT pg_temp.assert_true(:'management'::jsonb->>'routing_status'='pending_routing','management requires explicit mapping');
INSERT INTO whatsapp_area_recipients(area,usuario_id) VALUES ('management','10000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(whatsapp_complete_handoff('management')->>'routing_status'='routed','explicit management completion');
SELECT whatsapp_complete_handoff('management');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM notificaciones WHERE mensaje='Derivación WhatsApp: manager_requested'),'management dedup seller plus mapped');
SELECT pg_temp.receive(pg_temp.ev('finance','handoff.created','{"handoff_id":"finance","kind":"operational","area":"finance","reason":"payment_question","priority":"media","description":"Payment"}')) AS finance \gset
SELECT pg_temp.assert_true(:'finance'::jsonb->>'status'='operational' AND :'finance'::jsonb->>'crm_opportunity_id' IS NULL AND :'finance'::jsonb->>'routing_status'='pending_routing','no operational sale or inferred recipient');
INSERT INTO whatsapp_area_recipients(area,usuario_id) VALUES ('finance','10000000-0000-4000-8000-000000000002');
UPDATE usuarios SET activo=false WHERE id='10000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(whatsapp_complete_handoff('finance')->>'routing_status'='pending_routing','inactive mapping not delivered');
UPDATE usuarios SET activo=true WHERE id='10000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(whatsapp_complete_handoff('finance')->>'routing_status'='routed','active mapped completion');
SELECT pg_temp.receive(pg_temp.ev('claims','handoff.created',jsonb_build_object('handoff_id','claims','kind','complaint','reason','damaged_glass','priority','baja','description','Claim','crm_opportunity_id',:'opportunity'))) AS claims \gset
SELECT pg_temp.assert_true(:'claims'::jsonb->>'status'='associated' AND :'claims'::jsonb->>'routing_status'='pending_routing','claims case independent of mapping');
SELECT pg_temp.assert_true((SELECT responsable_id IS NULL AND estado='recibido' FROM postventa_casos WHERE id=(:'claims'::jsonb->>'crm_case_id')::uuid),'real Postventa no invented responsible');
INSERT INTO whatsapp_area_recipients(area,usuario_id) VALUES ('claims','10000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(whatsapp_complete_handoff('claims')->>'routing_status'='routed','claims explicit routing');
-- Operational must not use a known conversation sale, including the scheduling area.
SELECT pg_temp.receive(pg_temp.ev('scheduling','handoff.created','{"handoff_id":"scheduling","kind":"operational","area":"scheduling","reason":"delivery_question","priority":"baja","description":"Schedule"}','chat-1')) AS scheduling \gset
SELECT pg_temp.assert_true(:'scheduling'::jsonb->>'crm_opportunity_id' IS NULL AND :'scheduling'::jsonb->>'routing_status'='pending_routing','scheduling no silent sale');
INSERT INTO whatsapp_area_recipients(area,usuario_id) VALUES ('scheduling','10000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(whatsapp_complete_handoff('scheduling')->>'routing_status'='routed','scheduling completion');
SELECT pg_temp.receive(pg_temp.ev('claims-pending','handoff.created','{"handoff_id":"claims-pending","kind":"complaint","reason":"claim_requested","priority":"media","description":"Unlinked complaint","postventa_type":"dano_transporte"}')) AS claims_pending \gset
SELECT pg_temp.assert_true(:'claims_pending'::jsonb->>'status'='pending_association','v1.1 complaint pending');
SELECT pg_temp.assert_true(whatsapp_complete_handoff('claims-pending',:'opportunity')->>'status'='associated','v1.1 complaint completion');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('claims-pending','handoff.created','{"handoff_id":"claims-pending","kind":"complaint","reason":"claim_requested","priority":"media","description":"Unlinked complaint","postventa_type":"dano_transporte"}'))=:'claims_pending'::jsonb,'complaint replay original pending');
DO $$ DECLARE e jsonb; f text; value jsonb; base jsonb := '{"handoff_id":"invalid","kind":"commercial","area":"sales","reason":"valid_reason","priority":"alta","description":"Help"}'; BEGIN
 FOREACH f IN ARRAY ARRAY['area','reason','priority'] LOOP
  PERFORM pg_temp.reject(pg_temp.ev('missing-'||f,'handoff.created',base-f),'invalid_event');
 END LOOP;
 FOR value IN SELECT x FROM jsonb_array_elements('[null,"","UPPER","bad-code","_leading","trailing_","two__words"]') x LOOP
  PERFORM pg_temp.reject(pg_temp.ev('reason','handoff.created',jsonb_set(base,'{reason}',value)),'invalid_event');
 END LOOP;
 PERFORM pg_temp.reject(pg_temp.ev('reason-long','handoff.created',jsonb_set(base,'{reason}',to_jsonb(repeat('a',65)))),'invalid_event');
 PERFORM pg_temp.reject(pg_temp.ev('priority','handoff.created',jsonb_set(base,'{priority}','"high"')),'invalid_event');
 PERFORM pg_temp.reject(pg_temp.ev('wrong-complaint-area','handoff.created',base || '{"kind":"complaint","area":"sales"}'),'invalid_event');
 PERFORM pg_temp.reject(pg_temp.ev('wrong-operational-area','handoff.created',base || '{"kind":"operational","area":"management"}'),'invalid_event');
 PERFORM pg_temp.reject(pg_temp.ev('operational-sale','handoff.created',base || '{"kind":"operational","area":"finance","crm_opportunity_id":"20000000-0000-4000-8000-000000000010"}'),'invalid_event');
 PERFORM pg_temp.reject(pg_temp.ev('commercial-case-type','handoff.created',base || '{"postventa_type":"otro"}'),'invalid_event');
 e := pg_temp.ev('reason-boundary','handoff.created',jsonb_set(base,'{reason}',to_jsonb(repeat('a',64))));
 PERFORM pg_temp.assert_true(pg_temp.receive(e)->>'status'='pending_association','reason 64 boundary');
END $$;
-- Ownership uses one sequence and returns complete authoritative state for both event kinds.
SELECT pg_temp.receive(pg_temp.ev('taken-null','ownership.taken','{"version":4,"crm_seller_id":null,"source":"clickup"}')) AS taken \gset
SELECT pg_temp.assert_true(:'taken'::jsonb='{"event_id":"taken-null","ownership_version":4,"owner":"human","crm_seller_id":null,"source":"clickup"}','explicit null ownership');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('stale-release','ownership.released','{"version":3}'))-'event_id'=:'taken'::jsonb-'event_id','stale release authoritative human');
SELECT pg_temp.reject(pg_temp.ev('same-release','ownership.released','{"version":4}'),'ownership_conflict');
SELECT pg_temp.reject(pg_temp.ev('same-seller-change','ownership.taken','{"version":4,"crm_seller_id":"10000000-0000-4000-8000-000000000001","source":"clickup"}'),'ownership_conflict');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('same-taken','ownership.taken','{"version":4,"crm_seller_id":null,"source":"clickup"}'))-'event_id'=:'taken'::jsonb-'event_id','same complete state');
SELECT pg_temp.reject(pg_temp.ev('legacy-stale','ownership.released','{"version":3}','extension-chat',false),'protocol_revision_required');
SELECT pg_temp.reject(pg_temp.ev('legacy-equal','ownership.released','{"version":4}','extension-chat',false),'protocol_revision_required');
SELECT pg_temp.reject(pg_temp.ev('bad-owner','ownership.taken','{"version":5,"crm_seller_id":"10000000-0000-4000-8000-000000000002","source":"clickup"}'),'invalid_seller');
SELECT pg_temp.receive(pg_temp.ev('taken-seller','ownership.taken','{"version":5,"crm_seller_id":"10000000-0000-4000-8000-000000000001","source":"clickup"}'));
SELECT pg_temp.receive(pg_temp.ev('release-6','ownership.released','{"version":6}')) AS released \gset
SELECT pg_temp.assert_true(:'released'::jsonb='{"event_id":"release-6","ownership_version":6,"owner":"bot","crm_seller_id":null,"source":null}','release clears human relation');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('taken-null','ownership.taken','{"version":4,"crm_seller_id":null,"source":"clickup"}'))=:'taken'::jsonb,'ownership original replay');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('legacy-higher','ownership.released','{"version":7}','extension-chat',false))='{"event_id":"legacy-higher","ownership_version":7,"owner":"bot"}','legacy representable exact shape');
SELECT pg_temp.reject(pg_temp.ev('bad-area','handoff.created','{"handoff_id":"bad","kind":"commercial","area":"finance","reason":"bad","priority":"alta","description":"Bad"}'),'invalid_event');
SELECT pg_temp.reject(pg_temp.ev('bad-reason','handoff.created','{"handoff_id":"bad","kind":"commercial","area":"sales","reason":"UPPER","priority":"alta","description":"Bad"}'),'invalid_event');
SELECT pg_temp.reject(pg_temp.ev('unknown','message.new','{"message_id":"bad","direction":"inbound","text":"x","sent_at":"2026-11-04T12:00:00Z","extra":true}'),'invalid_event');
-- Linked commercial and complaint paths use the same opportunity and never reset management.
SELECT pg_temp.receive(pg_temp.ev('linked-sales','handoff.created','{"handoff_id":"linked-sales","kind":"commercial","area":"sales","reason":"quote_requested","priority":"media","description":"Linked"}','chat-1')) AS linked_sales \gset
SELECT pg_temp.assert_true(:'linked_sales'::jsonb->>'crm_opportunity_id' IS NOT NULL AND :'linked_sales'::jsonb->>'routing_status'='routed','linked current seller');
SELECT pg_temp.reject(pg_temp.ev('linked-conflict','handoff.created','{"handoff_id":"linked-conflict","kind":"commercial","area":"sales","reason":"quote_requested","priority":"alta","description":"Conflict","crm_opportunity_id":"90000000-0000-4000-8000-000000000000"}','chat-1'),'identity_conflict');
DO $$ BEGIN BEGIN PERFORM whatsapp_complete_handoff('sales','90000000-0000-4000-8000-000000000000'); RAISE EXCEPTION 'reassociation allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'identity_conflict' THEN RAISE; END IF; END; END $$;
SELECT pg_temp.assert_true((SELECT bool_and(estado_pipeline='cotizada' AND monto_abonado=500 AND notas_venta='[{"human":"keep"}]'::jsonb) FROM oportunidades WHERE id=:'opportunity'),'commercial preserves human sale fields');
UPDATE postventa_casos SET estado='en_revision',responsable_id='10000000-0000-4000-8000-000000000002' WHERE id=(:'claims'::jsonb->>'crm_case_id')::uuid;
SELECT whatsapp_complete_handoff('claims');
SELECT pg_temp.assert_true((SELECT estado='en_revision' AND responsable_id='10000000-0000-4000-8000-000000000002' FROM postventa_casos WHERE id=(:'claims'::jsonb->>'crm_case_id')::uuid),'completion preserves case management');
UPDATE usuarios SET activo=false WHERE id='10000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true(whatsapp_complete_handoff('sales')->>'routing_status'='pending_routing','inactive seller not delivered');
SELECT pg_temp.reject(pg_temp.ev('inactive-owner','ownership.taken','{"version":8,"crm_seller_id":"10000000-0000-4000-8000-000000000003","source":"clickup"}'),'invalid_seller');
UPDATE usuarios SET activo=true WHERE id='10000000-0000-4000-8000-000000000003';
SELECT pg_temp.reject(pg_temp.ev('null-revision','ownership.released','{"version":8}') || '{"protocol_revision":null}','invalid_event');
SELECT pg_temp.reject(pg_temp.ev('bad-revision','ownership.released','{"version":8}') || '{"protocol_revision":"1.2"}','invalid_event');
SELECT pg_temp.reject(pg_temp.ev('missing-owner','ownership.taken','{"version":8,"source":"clickup"}'),'invalid_event');
SELECT pg_temp.reject(pg_temp.ev('bad-source','ownership.taken','{"version":8,"crm_seller_id":null,"source":"crm"}'),'invalid_event');
SELECT pg_temp.reject(pg_temp.ev('ownership-content-conflict','ownership.released','{"version":7}') || '{"event_id":"taken-null"}','event_conflict');
RESET ROLE;
-- Force a late failure after association and first notification: the whole public transaction rolls back.
CREATE FUNCTION pg_temp.fail_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.mensaje='Derivación WhatsApp: late_failure' AND NEW.usuario_id='10000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'fixture_late_failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fixture_late_failure BEFORE INSERT ON notificaciones FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_notification();
SET ROLE service_role;
SELECT pg_temp.reject(pg_temp.ev('late-failure','handoff.created',jsonb_build_object('handoff_id','late-failure','kind','commercial','area','management','reason','late_failure','priority','alta','description','Late','crm_opportunity_id',:'opportunity')),'fixture_late_failure');
RESET ROLE;
DROP TRIGGER fixture_late_failure ON notificaciones;
SET ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.ev('late-failure','handoff.created',jsonb_build_object('handoff_id','late-failure','kind','commercial','area','management','reason','late_failure','priority','alta','description','Late','crm_opportunity_id',:'opportunity')))->>'routing_status'='routed','failed event and handoff were not poisoned');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM notificaciones WHERE mensaje='Derivación WhatsApp: late_failure'),'late retry no missing or extra notification');
RESET ROLE;
DO $$ DECLARE r text; t text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH t IN ARRAY ARRAY['whatsapp_area_recipients','whatsapp_handoff_notifications'] LOOP
   PERFORM pg_temp.assert_true(NOT has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'new service-only tables');
  END LOOP;
  PERFORM pg_temp.assert_true(NOT has_function_privilege(r,'whatsapp_complete_handoff(text,uuid)','EXECUTE'),'completion denied');
  PERFORM pg_temp.assert_true(to_regprocedure('public.whatsapp_receive_event_v1(jsonb,text)') IS NULL,'legacy ingress removed, not merely renamed or revoked');
 END LOOP;
END $$;
SET ROLE anon;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['whatsapp_event_inbox','whatsapp_lead_links','whatsapp_messages','whatsapp_handoffs','whatsapp_ownership','whatsapp_area_recipients','whatsapp_handoff_notifications'] LOOP
  BEGIN EXECUTE format('SELECT 1 FROM public.%I',t); RAISE EXCEPTION 'anon table allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN PERFORM public.whatsapp_receive_event_v1('{}'::jsonb,'x'::text); RAISE EXCEPTION 'anon helper exists'; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;
DO $$ BEGIN BEGIN PERFORM whatsapp_complete_handoff('sales'); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN PERFORM 1 FROM whatsapp_area_recipients; RAISE EXCEPTION 'anon read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['whatsapp_event_inbox','whatsapp_lead_links','whatsapp_messages','whatsapp_handoffs','whatsapp_ownership','whatsapp_area_recipients','whatsapp_handoff_notifications'] LOOP
  BEGIN EXECUTE format('SELECT 1 FROM public.%I',t); RAISE EXCEPTION 'authenticated table allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN PERFORM public.whatsapp_receive_event_v1('{}'::jsonb,'x'::text); RAISE EXCEPTION 'authenticated helper exists'; EXCEPTION WHEN undefined_function THEN NULL; END;
END $$;
DO $$ BEGIN BEGIN PERFORM whatsapp_complete_handoff('sales'); RAISE EXCEPTION 'authenticated allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN PERFORM 1 FROM whatsapp_handoff_notifications; RAISE EXCEPTION 'authenticated read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
