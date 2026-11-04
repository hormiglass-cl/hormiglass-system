\set ON_ERROR_STOP on
-- Exercise the public service RPC and public domain tables, not private inbox storage.
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.event(eid text, typ text, data jsonb, conv text DEFAULT 'chat-1') RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('schema_version',1,'event_id',eid,'type',typ,'conversation_id',conv,'data',data) $$;
CREATE FUNCTION pg_temp.lead(eid text, rev int DEFAULT 1, requirement text DEFAULT 'Glass', lid text DEFAULT 'lead-1', conv text DEFAULT 'chat-1', phone text DEFAULT '+56912345678') RETURNS jsonb LANGUAGE sql AS $$ SELECT pg_temp.event(eid,'lead.qualified',jsonb_build_object('lead_id',lid,'revision',rev,'phone',phone,'name','Test','rut','12345678-5','crm_seller_id','10000000-0000-4000-8000-000000000001','title','Glass request','requirement',requirement),conv) $$;
CREATE FUNCTION pg_temp.receive(e jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.whatsapp_receive_event(e, repeat(md5(e::text),2)) $$;
CREATE FUNCTION pg_temp.reject(e jsonb, expected text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE before_counts jsonb; after_counts jsonb; BEGIN
 SELECT jsonb_build_array((SELECT count(*) FROM clientes),(SELECT count(*) FROM oportunidades),(SELECT count(*) FROM notificaciones),(SELECT count(*) FROM postventa_casos)) INTO before_counts;
 BEGIN PERFORM pg_temp.receive(e); RAISE EXCEPTION 'expected rejection'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> expected THEN RAISE EXCEPTION 'expected %, got %',expected,SQLERRM; END IF; END;
 SELECT jsonb_build_array((SELECT count(*) FROM clientes),(SELECT count(*) FROM oportunidades),(SELECT count(*) FROM notificaciones),(SELECT count(*) FROM postventa_casos)) INTO after_counts;
 PERFORM pg_temp.assert_true(before_counts=after_counts,'rejection rollback'); END $$;
SET ROLE service_role;
SELECT pg_temp.reject(pg_temp.lead('no-rut') #- '{data,rut}', 'rut_required');
-- Same event id succeeds after rejected transaction: no poisoned inbox entry.
SELECT pg_temp.receive(pg_temp.lead('no-rut')) AS first_result \gset
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.lead('no-rut')) = :'first_result'::jsonb,'stable duplicate IDs');
SELECT pg_temp.reject(jsonb_set(pg_temp.lead('no-rut'),'{data,requirement}','"changed"'),'event_conflict');
SELECT pg_temp.reject(jsonb_set(pg_temp.lead('bad-seller'),'{data,crm_seller_id}','"10000000-0000-4000-8000-000000000002"'),'invalid_seller');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM oportunidades),'one opportunity');
UPDATE oportunidades SET estado_pipeline='cotizada', monto_abonado=500, notas_venta='[{"human":"keep"}]';
SELECT pg_temp.receive(pg_temp.lead('correction',2,'Corrected')) AS correction \gset
SELECT pg_temp.assert_true((:'correction'::jsonb->>'crm_opportunity_id')=(:'first_result'::jsonb->>'crm_opportunity_id'),'correction keeps opportunity');
SELECT pg_temp.assert_true((SELECT estado_pipeline='cotizada' AND monto_abonado=500 AND notas_venta='[{"human":"keep"}]'::jsonb AND asignado_a='10000000-0000-4000-8000-000000000001' FROM oportunidades),'human fields preserved');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM notificaciones),'new lead and correction notifications');
SELECT pg_temp.receive(pg_temp.lead('stale',1));
SELECT pg_temp.reject(pg_temp.lead('same-revision',2,'Different'),'revision_conflict');
SELECT pg_temp.reject(pg_temp.lead('identity',3,'Glass','lead-1','different-chat'),'identity_conflict');
-- Phone normalization reuses customer but not unrelated external leads.
UPDATE clientes SET telefono='+56 9 1234 5678';
SELECT pg_temp.receive(pg_temp.lead('second',1,'Glass','lead-2','chat-2','+56912345678'));
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM clientes),'customer reuse');
RESET ROLE;
INSERT INTO clientes(nombre,rut,telefono) VALUES ('Ambiguous A','a','+56 9 0000 0000'),('Ambiguous B','b','56900000000');
SET ROLE service_role;
SELECT pg_temp.reject(pg_temp.lead('ambiguous',1,'Glass','ambiguous','ambiguous','+56900000000'),'ambiguous_customer');
SELECT pg_temp.receive(pg_temp.event('pending','handoff.created','{"handoff_id":"h1","kind":"complaint","description":"Issue"}', 'unknown')) AS pending \gset
SELECT pg_temp.assert_true(:'pending'::jsonb->>'status'='pending_association','unlinked complaint pending');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM postventa_casos),'no fabricated case');
DO $$ BEGIN BEGIN PERFORM whatsapp_associate_handoff('h1','90000000-0000-4000-8000-000000000000'); RAISE EXCEPTION 'expected invalid opportunity'; EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'invalid_opportunity' THEN RAISE; END IF; END; END $$;
SELECT whatsapp_associate_handoff('h1',(:'first_result'::jsonb->>'crm_opportunity_id')::uuid) AS association \gset
SELECT pg_temp.assert_true(whatsapp_associate_handoff('h1',(:'first_result'::jsonb->>'crm_opportunity_id')::uuid)=:'association'::jsonb,'association idempotent');
UPDATE postventa_casos SET estado='en_revision', responsable_id='10000000-0000-4000-8000-000000000002';
SELECT pg_temp.receive(pg_temp.event('pending-retry','handoff.created','{"handoff_id":"h1","kind":"complaint","description":"Issue"}', 'unknown'));
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(estado='en_revision' AND responsable_id='10000000-0000-4000-8000-000000000002') FROM postventa_casos),'retry preserves human case');
SELECT pg_temp.reject(pg_temp.event('changed-handoff','handoff.created','{"handoff_id":"h1","kind":"complaint","description":"Changed"}', 'unknown'),'identity_conflict');
SELECT pg_temp.receive(pg_temp.event('linked','handoff.created','{"handoff_id":"h2","kind":"complaint","description":"Linked complaint"}'));
SELECT pg_temp.receive(pg_temp.event('operational','handoff.created','{"handoff_id":"h3","kind":"operational","description":"Delay"}'));
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM postventa_casos),'operational is not complaint');
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.event('unknown-sale','handoff.created','{"handoff_id":"h4","kind":"complaint","description":"Unknown sale","crm_opportunity_id":"90000000-0000-4000-8000-000000000000"}', 'unknown-sale'))->>'status'='pending_association','unknown supplied opportunity pending');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM postventa_casos WHERE estado='recibido' AND tipo='otro' AND vendedor_id IS NOT NULL AND responsable_id IS NULL),'linked complaint semantics');
SELECT pg_temp.receive(pg_temp.event('msg','message.new','{"message_id":"m1","direction":"inbound","text":"Hello","sent_at":"2026-11-04T12:00:00Z"}')) AS msg \gset
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.event('msg-retry','message.new','{"message_id":"m1","direction":"inbound","text":"Hello","sent_at":"2026-11-04T12:00:00Z"}'))->>'crm_message_id'=:'msg'::jsonb->>'crm_message_id','source message dedup');
SELECT pg_temp.reject(pg_temp.event('msg-change','message.new','{"message_id":"m1","direction":"inbound","text":"Changed","sent_at":"2026-11-04T12:00:00Z"}'),'identity_conflict');
SELECT pg_temp.receive(pg_temp.event('owner-2','ownership.released','{"version":2}'));
SELECT pg_temp.assert_true(pg_temp.receive(pg_temp.event('owner-1','ownership.released','{"version":1}'))->>'ownership_version'='2','stale ownership cannot overwrite');
RESET ROLE;
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['whatsapp_event_inbox','whatsapp_lead_links','whatsapp_messages','whatsapp_handoffs','whatsapp_ownership'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   PERFORM pg_temp.assert_true(NOT has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'service-only data access');
  END LOOP;
 END LOOP;
END $$;
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.whatsapp_receive_event('{}','x'); RAISE EXCEPTION 'anon allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN PERFORM public.whatsapp_associate_handoff('h',gen_random_uuid()); RAISE EXCEPTION 'anon association allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.whatsapp_receive_event('{}','x'); RAISE EXCEPTION 'authenticated allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; BEGIN PERFORM public.whatsapp_associate_handoff('h',gen_random_uuid()); RAISE EXCEPTION 'authenticated association allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
