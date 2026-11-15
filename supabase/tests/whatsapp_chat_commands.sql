\set ON_ERROR_STOP on
-- Revision 1.2b CRM -> bot chat.take / chat.release: outbox, S9 permissions, results and echoes.
CREATE FUNCTION pg_temp.ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(auth_id text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub',auth_id,false); $$;
CREATE FUNCTION pg_temp.outbox() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.event_id),'[]')::text FROM whatsapp_crm_outbox x $$;
CREATE FUNCTION pg_temp.ownership() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT to_jsonb(o)::text FROM whatsapp_ownership o WHERE conversation_id='chat-cmd'),'none') $$;
CREATE FUNCTION pg_temp.refuse(op uuid, typ text, message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state text;
BEGIN
  SET LOCAL ROLE NONE; before_state := pg_temp.outbox()||pg_temp.ownership(); SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.whatsapp_chat_command(op,typ); RAISE EXCEPTION 'expected %',message;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>message THEN RAISE EXCEPTION 'expected %, got %',message,SQLERRM; END IF; END;
  SET LOCAL ROLE NONE;
  PERFORM pg_temp.ok(before_state=pg_temp.outbox()||pg_temp.ownership(),'refused command writes nothing: '||message);
END $$;
-- Service-side result recording, as the route does with the service key.
CREATE FUNCTION pg_temp.result(eid text, http integer, response jsonb, attempts integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role; r := public.whatsapp_chat_command_result(eid,http,response,attempts); SET LOCAL ROLE NONE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.command(auth_id text, op uuid, typ text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.as_user(auth_id); SET LOCAL ROLE authenticated; r := public.whatsapp_chat_command(op,typ); SET LOCAL ROLE NONE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.state(auth_id text, op uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.as_user(auth_id); SET LOCAL ROLE authenticated; r := public.whatsapp_chat_state(op); SET LOCAL ROLE NONE;
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.echo(eid text, typ text, data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  SET LOCAL ROLE service_role;
  r := public.whatsapp_receive_event(jsonb_build_object('schema_version',1,'protocol_revision','1.2','event_id',eid,'type',typ,'conversation_id','chat-cmd','data',data),repeat(md5(eid),2));
  SET LOCAL ROLE NONE;
  RETURN r;
END $$;

INSERT INTO usuarios(id,nombre,email,rol,activo,auth_id) VALUES
  ('40000000-0000-4000-8000-000000000001','Chat seller','chat-seller@example.invalid','user',true,'50000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','Other seller','chat-other@example.invalid','user',true,'50000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003','Chat admin','chat-admin@example.invalid','admin',true,'50000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000004','Chat finance','chat-finance@example.invalid','finanzas',true,'50000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000005','Chat inactive','chat-inactive@example.invalid','user',false,'50000000-0000-4000-8000-000000000005');
\set seller '50000000-0000-4000-8000-000000000001'
\set other '50000000-0000-4000-8000-000000000002'
\set admin '50000000-0000-4000-8000-000000000003'
\set finance '50000000-0000-4000-8000-000000000004'
\set inactive '50000000-0000-4000-8000-000000000005'
SET ROLE service_role;
SELECT (public.whatsapp_receive_event('{"schema_version":1,"protocol_revision":"1.2","event_id":"chat-lead","type":"lead.qualified","conversation_id":"chat-cmd","data":{"lead_id":"chat-lead","revision":1,"phone":"+56977777791","name":"Chat Buyer","rut":"chat-rut","crm_seller_id":"40000000-0000-4000-8000-000000000001","title":"Chat","requirement":"Glass"}}',repeat(md5('chat-lead'),2))->>'crm_opportunity_id') AS op \gset
RESET ROLE;
UPDATE oportunidades SET asignado_a='40000000-0000-4000-8000-000000000001' WHERE id=:'op';

-- Grants: the outbox and the result RPC are service-only; anonymous callers cannot run the RPCs.
SET ROLE authenticated;
DO $$ BEGIN PERFORM 1 FROM public.whatsapp_crm_outbox; RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM public.whatsapp_chat_command_result('crm-x',200,'{}',1); RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN PERFORM 1 FROM public.whatsapp_crm_outbox; RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM public.whatsapp_chat_command_result('crm-x',200,'{}',1); RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM public.whatsapp_chat_command(gen_random_uuid(),'chat.take'); RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM public.whatsapp_chat_state(gen_random_uuid()); RAISE EXCEPTION 'expected denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;

-- S9: no session, inactive and finance users are refused; only the assigned seller or an admin takes.
SELECT pg_temp.as_user('');
SET ROLE authenticated;
SELECT pg_temp.refuse(:'op','chat.take','forbidden');
DO $$ BEGIN PERFORM public.whatsapp_chat_state(gen_random_uuid()); RAISE EXCEPTION 'expected forbidden'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'forbidden' THEN RAISE; END IF; END $$;
SELECT pg_temp.as_user(:'inactive');
SELECT pg_temp.refuse(:'op','chat.take','forbidden');
SELECT pg_temp.as_user(:'finance');
SELECT pg_temp.refuse(:'op','chat.take','forbidden');
SELECT pg_temp.as_user(:'other');
SELECT pg_temp.refuse(:'op','chat.take','forbidden');
SELECT pg_temp.as_user(:'seller');
SELECT pg_temp.refuse(gen_random_uuid(),'chat.take','chat_not_linked');
SELECT pg_temp.refuse(:'op','chat.close','invalid_command');
SELECT pg_temp.refuse(:'op','chat.release','chat_not_taken');
RESET ROLE;

-- State before any ownership: version 0, bot owner; only the assigned seller/admin can take.
SELECT pg_temp.state(:'seller',:'op') AS st \gset
SELECT pg_temp.ok(:'st'::jsonb='{"ownership_version":0,"owner":"bot","source":null,"holder_crm_seller_id":null,"holder_name":null,"can_take":true,"can_release":false,"last_command":null}'::jsonb,'S9 seller state before ownership');
SELECT pg_temp.ok((pg_temp.state(:'other',:'op')->>'can_take')::boolean=false,'S9 other seller cannot take');
SELECT pg_temp.ok((pg_temp.state(:'finance',:'op')->>'can_take')::boolean=false,'S9 finance reads without taking');
SELECT pg_temp.ok((pg_temp.state(:'admin',:'op')->>'can_take')::boolean,'S9 admin can take');
SELECT pg_temp.ok(pg_temp.state(:'seller',gen_random_uuid()) IS NULL,'no lead link means no chat state');

-- S1: the assigned seller's take is stored as the exact bytes to send.
SELECT pg_temp.command(:'seller',:'op','chat.take') AS take1 \gset
SELECT (:'take1'::jsonb->>'event_id') AS take1_id, (:'take1'::jsonb->>'body') AS take1_body \gset
SELECT pg_temp.ok(:'take1_id' ~ '^crm-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$','S1 event_id format');
SELECT pg_temp.ok(:'take1_id' ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$','S1 event_id matches bot pattern');
SELECT pg_temp.ok((:'take1_body'::jsonb->>'occurred_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$','S1 occurred_at UTC with Z');
SELECT pg_temp.ok(:'take1_body'='{"schema_version":1,"protocol_revision":"1.2","event_id":"'||:'take1_id'||'","type":"chat.take","occurred_at":"'||(:'take1_body'::jsonb->>'occurred_at')||'","data":{"crm_opportunity_id":"'||:'op'||'","crm_seller_id":"40000000-0000-4000-8000-000000000001","ownership_version":0}}','S1 exact body bytes, keys and order');
SELECT pg_temp.ok(:'take1'::jsonb-'body'=jsonb_build_object('event_id',:'take1_id','reused',false),'command result shape');
SELECT pg_temp.ok((SELECT status='sending' AND type='chat.take' AND actor_id='40000000-0000-4000-8000-000000000001' AND crm_seller_id=actor_id AND base_version=0 AND body=:'take1_body' AND attempts=0 FROM whatsapp_crm_outbox WHERE event_id=:'take1_id'),'S2 outbox row written with the action');
SELECT pg_temp.ok((SELECT last_command->>'status'='sending' FROM (SELECT pg_temp.state(:'seller',:'op') AS s) x, LATERAL (SELECT s->'last_command' AS last_command) y),'state shows the command in progress');

-- One command at a time per conversation while one is being sent.
SELECT pg_temp.as_user(:'seller');
SET ROLE authenticated;
SELECT pg_temp.refuse(:'op','chat.take','command_in_progress');
SELECT pg_temp.as_user(:'admin');
SELECT pg_temp.refuse(:'op','chat.take','command_in_progress');
RESET ROLE;

-- S4: 503 and network failures are retryable; a retry resends the identical event and bytes.
SELECT pg_temp.ok((pg_temp.result(:'take1_id',503,'{"error":"unavailable"}',3)->>'status')='retryable','S4 503 retryable');
SELECT pg_temp.ok((SELECT status='retryable' AND attempts=3 AND last_http_status=503 FROM whatsapp_crm_outbox WHERE event_id=:'take1_id'),'S4 503 recorded');
SELECT pg_temp.ok(pg_temp.state(:'seller',:'op')->'last_command'@>'{"type":"chat.take","status":"retryable","http_status":503}','state shows retryable command');
SELECT pg_temp.ownership() AS own0 \gset
SELECT pg_temp.ok(:'own0'='none','S3 no optimistic ownership on failure');
SELECT pg_temp.command(:'seller',:'op','chat.take') AS take1b \gset
SELECT pg_temp.ok(:'take1b'::jsonb->>'event_id'=:'take1_id' AND :'take1b'::jsonb->>'body'=:'take1_body' AND (:'take1b'::jsonb->>'reused')::boolean,'S2 retry reuses event_id and identical bytes');
SELECT pg_temp.ok((SELECT count(*)=1 FROM whatsapp_crm_outbox),'S2 retry adds no row');
SELECT pg_temp.ok((pg_temp.result(:'take1_id',NULL,NULL,3)->>'status')='retryable','S4 network failure retryable');
SELECT pg_temp.ok((SELECT last_http_status IS NULL AND status='retryable' FROM whatsapp_crm_outbox WHERE event_id=:'take1_id'),'S4 network failure recorded');

-- S9 admin take is a different seller: the old retryable event is abandoned, a new one is created.
SELECT pg_temp.command(:'admin',:'op','chat.take') AS take2 \gset
SELECT (:'take2'::jsonb->>'event_id') AS take2_id \gset
SELECT pg_temp.ok(:'take2_id'<>:'take1_id' AND (:'take2'::jsonb->>'body')::jsonb->'data'->>'crm_seller_id'='40000000-0000-4000-8000-000000000003','S9 admin take sent as the admin');
SELECT pg_temp.ok((SELECT status='abandoned' FROM whatsapp_crm_outbox WHERE event_id=:'take1_id'),'older retryable event abandoned');
-- 409 ownership_conflict: rejected, holder kept; unknown response keys are dropped.
SELECT pg_temp.result(:'take2_id',409,'{"error":"ownership_conflict","holder_crm_seller_id":"40000000-0000-4000-8000-000000000002","debug":"drop me"}',1) AS conflict \gset
SELECT pg_temp.ok(:'conflict'::jsonb@>'{"status":"rejected","http_status":409,"error_code":"ownership_conflict","holder_crm_seller_id":"40000000-0000-4000-8000-000000000002"}','S4 409 conflict result');
SELECT pg_temp.ok((SELECT last_response='{"error":"ownership_conflict","holder_crm_seller_id":"40000000-0000-4000-8000-000000000002"}'::jsonb FROM whatsapp_crm_outbox WHERE event_id=:'take2_id'),'S4 bounded known response fields only');
SELECT pg_temp.ok(pg_temp.state(:'seller',:'op')->'last_command'@>'{"status":"rejected","http_status":409,"error_code":"ownership_conflict","holder_crm_seller_id":"40000000-0000-4000-8000-000000000002","holder_name":"Other seller"}','S3 state shows who holds the chat');
SELECT pg_temp.ok(pg_temp.ownership()='none','S3 conflict changes no ownership');

-- S3/S6 applied take: ownership moves forward; the bot echo at the same version is a no-op.
SELECT pg_temp.command(:'seller',:'op','chat.take') AS take3 \gset
SELECT (:'take3'::jsonb->>'event_id') AS take3_id \gset
SELECT pg_temp.ok(:'take3_id'<>:'take2_id','rejected event is not reused');
SELECT pg_temp.result(:'take3_id',200,'{"result":"applied","ownership_version":5}',1) AS applied \gset
SELECT pg_temp.ok(:'applied'::jsonb@>'{"status":"applied","http_status":200,"ownership_version":5}','S4 applied take');
SELECT pg_temp.ok((SELECT version=5 AND owner='human' AND crm_seller_id='40000000-0000-4000-8000-000000000001' AND source='crm' AND release_reason IS NULL FROM whatsapp_ownership WHERE conversation_id='chat-cmd'),'S3 confirmed take stored');
SELECT pg_temp.ownership() AS own_taken, (SELECT count(*) FROM notificaciones) AS notes \gset
SELECT pg_temp.echo('echo-take','ownership.taken','{"version":5,"crm_seller_id":"40000000-0000-4000-8000-000000000001","source":"crm"}') AS echo1 \gset
SELECT pg_temp.ok(:'echo1'::jsonb@>'{"ownership_version":5,"owner":"human","source":"crm"}','S6 take echo accepted');
SELECT pg_temp.ok(pg_temp.ownership()=:'own_taken' AND (SELECT count(*) FROM notificaciones)=:notes,'S6 take echo is a no-op without notifications');
SELECT pg_temp.state(:'seller',:'op') AS st_taken \gset
SELECT pg_temp.ok(:'st_taken'::jsonb@>'{"ownership_version":5,"owner":"human","source":"crm","holder_crm_seller_id":"40000000-0000-4000-8000-000000000001","holder_name":"Chat seller","can_take":false,"can_release":true}','S5 holder can release');
SELECT pg_temp.ok(pg_temp.state(:'other',:'op')@>'{"can_take":false,"can_release":false}','S5 other seller cannot release');
SELECT pg_temp.ok(pg_temp.state(:'admin',:'op')@>'{"can_take":true,"can_release":true}','S9 admin can take or release');
SELECT pg_temp.as_user(:'other');
SET ROLE authenticated;
SELECT pg_temp.refuse(:'op','chat.release','not_holder');
SELECT pg_temp.as_user(:'seller');
SELECT pg_temp.refuse(:'op','chat.take','already_holder');
RESET ROLE;

-- S5/S9 admin release on the holder's behalf: sent with the holder's seller id and last version.
SELECT pg_temp.command(:'admin',:'op','chat.release') AS rel \gset
SELECT (:'rel'::jsonb->>'event_id') AS rel_id, (:'rel'::jsonb->>'body') AS rel_body \gset
SELECT pg_temp.ok(:'rel_body'::jsonb->'data'=('{"crm_opportunity_id":"'||:'op'||'","crm_seller_id":"40000000-0000-4000-8000-000000000001","ownership_version":5}')::jsonb AND :'rel_body'::jsonb->>'type'='chat.release','S9 admin release sent as holder with version');
SELECT pg_temp.ok((SELECT actor_id='40000000-0000-4000-8000-000000000003' FROM whatsapp_crm_outbox WHERE event_id=:'rel_id'),'actor recorded');
SELECT pg_temp.ok((pg_temp.result(:'rel_id',200,'{"result":"applied","ownership_version":6}',1)->>'status')='applied','S5 applied release');
SELECT pg_temp.ok((SELECT version=6 AND owner='bot' AND crm_seller_id IS NULL AND source IS NULL AND release_reason='seller_released' FROM whatsapp_ownership WHERE conversation_id='chat-cmd'),'S5 bot owns the chat again');
SELECT pg_temp.ownership() AS own_released, (SELECT count(*) FROM notificaciones) AS notes \gset
SELECT pg_temp.echo('echo-release','ownership.released','{"version":6,"reason":"seller_released"}') AS echo2 \gset
SELECT pg_temp.ok(pg_temp.ownership()=:'own_released' AND (SELECT count(*) FROM notificaciones)=:notes,'S6 release echo is a no-op without notifications');

-- S4 ignored_stale: nothing changes.
SELECT (pg_temp.command(:'seller',:'op','chat.take')->>'event_id') AS stale_id \gset
SELECT pg_temp.ok((SELECT base_version=6 FROM whatsapp_crm_outbox WHERE event_id=:'stale_id'),'S3 command carries the last seen version');
SELECT pg_temp.ok((pg_temp.result(:'stale_id',200,'{"result":"ignored_stale","ownership_version":9}',1)->>'status')='ignored_stale','S4 ignored_stale');
SELECT pg_temp.ok(pg_temp.ownership()=:'own_released','S4 ignored_stale changes nothing');

-- Applied with a lower version than stored never regresses ownership.
SELECT (pg_temp.command(:'seller',:'op','chat.take')->>'event_id') AS low_id \gset
SELECT pg_temp.ok((pg_temp.result(:'low_id',200,'{"result":"applied","ownership_version":4}',1)->>'status')='applied','lower applied recorded');
SELECT pg_temp.ok(pg_temp.ownership()=:'own_released','lower applied version does not regress');

-- A 200 without a known result or a valid version is rejected as invalid_response.
SELECT (pg_temp.command(:'seller',:'op','chat.take')->>'event_id') AS bad_id \gset
SELECT pg_temp.ok(pg_temp.result(:'bad_id',200,'{"result":"applied"}',1)@>'{"status":"rejected","error_code":"invalid_response"}','invalid 200 rejected');
SELECT pg_temp.ok(pg_temp.ownership()=:'own_released','invalid 200 changes nothing');

-- S2/S4: 400, 401, 409, 413 and 422 stop and are shown.
DO $$ DECLARE code integer; eid text; r jsonb; BEGIN
  FOREACH code IN ARRAY ARRAY[400,401,409,413,422] LOOP
    eid := pg_temp.command('50000000-0000-4000-8000-000000000001',(SELECT opportunity_id FROM whatsapp_lead_links WHERE conversation_id='chat-cmd'),'chat.take')->>'event_id';
    r := pg_temp.result(eid,code,jsonb_build_object('error','code_'||code),1);
    PERFORM pg_temp.ok(r->>'status'='rejected' AND (r->>'http_status')::int=code AND r->>'error_code'='code_'||code,'S4 rejected '||code);
  END LOOP;
END $$;

-- A sending command older than 60 seconds is resent with the same bytes instead of blocking.
SELECT (pg_temp.command(:'seller',:'op','chat.take')) AS stuck \gset
UPDATE whatsapp_crm_outbox SET updated_at=updated_at-interval '2 minutes' WHERE event_id=:'stuck'::jsonb->>'event_id';
SELECT pg_temp.command(:'seller',:'op','chat.take') AS unstuck \gset
SELECT pg_temp.ok(:'unstuck'::jsonb->>'event_id'=:'stuck'::jsonb->>'event_id' AND :'unstuck'::jsonb->>'body'=:'stuck'::jsonb->>'body','stale sending command resent with same bytes');

-- Result recording refuses unknown, finished and invalid inputs.
DO $$ BEGIN PERFORM pg_temp.result('crm-unknown',200,'{}',1); RAISE EXCEPTION 'expected'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'command_not_found' THEN RAISE; END IF; END $$;
SELECT pg_temp.ok(true,'unknown event refused');
DO $$ DECLARE eid text := (SELECT event_id FROM whatsapp_crm_outbox WHERE status='applied' LIMIT 1); BEGIN
  PERFORM pg_temp.result(eid,200,'{"result":"applied","ownership_version":99}',1); RAISE EXCEPTION 'expected';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'command_not_sending' THEN RAISE; END IF; END $$;
DO $$ DECLARE eid text := (SELECT event_id FROM whatsapp_crm_outbox WHERE status='sending' LIMIT 1); BEGIN
  PERFORM pg_temp.result(eid,200,'{}',0); RAISE EXCEPTION 'expected';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'invalid_result' THEN RAISE; END IF; END $$;
SELECT pg_temp.ok(pg_temp.ownership()=:'own_released','refused results change nothing');
SELECT set_config('request.jwt.claim.sub','',false);
