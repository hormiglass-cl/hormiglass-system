import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
test('S4/S5/S6/S7: service RPC transactions, grants, identities and concurrent deliveries', async () => {
  const scratch = mkdtempSync('/tmp/wa-pg-');
  const data = join(scratch, 'data'); const port = '5432';
  // Unique Unix socket directory, TCP disabled. Never use ambient PG connection variables.
  const env = { PATH: process.env.PATH, HOME: scratch, LANG: 'C', LC_ALL: 'C' };
  const opts = { env, encoding: 'utf8', timeout: 15000 };
  const args = ['-X', '-h', scratch, '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale'], opts);
    execFileSync('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-k ${scratch} -p ${port} -c listen_addresses=''`, '-w', 'start'], opts); started = true;
    for (const path of ['tests/fixtures/whatsapp-events-schema.sql', 'supabase/migrations/20261104120000_whatsapp_events_receiver.sql', 'supabase/migrations/20261104130000_whatsapp_events_v1_1.sql', 'supabase/tests/whatsapp_events_receiver.sql', 'supabase/migrations/20261111160000_whatsapp_events_v1_2.sql', 'supabase/tests/whatsapp_events_v1_1.sql', 'supabase/tests/whatsapp_events_v1_2.sql', 'supabase/migrations/20261111170000_whatsapp_lead_panel.sql', 'supabase/tests/whatsapp_lead_panel.sql']) execFileSync('psql', [...args, '-f', resolve(path)], opts);
    const event = (eid, lid = 'race-lead') => ({ schema_version: 1, event_id: eid, type: 'lead.qualified', conversation_id: 'race-chat', data: { lead_id: lid, revision: 1, phone: '+56988888888', name: 'Race', rut: 'race-rut', crm_seller_id: '10000000-0000-4000-8000-000000000001', title: 'Race', requirement: 'Glass' } });
    const query = e => `SET ROLE service_role; SELECT whatsapp_receive_event('${JSON.stringify(e)}'::jsonb,repeat(md5('${JSON.stringify(e)}'),2));`;
    const outputs = await Promise.all([event('race-1'), event('race-1'), event('race-2'), event('race-3')].map(e => run('psql', [...args, '-At', '-c', query(e)], opts)));
    const ids = outputs.map(o => JSON.parse(o.stdout.trim().split('\n').at(-1)).crm_opportunity_id);
    assert.equal(new Set(ids).size, 1, 'concurrent event IDs and duplicate deliveries reuse opportunity');
    const count = execFileSync('psql', [...args, '-At', '-c', "SELECT count(*) FROM oportunidades WHERE titulo='Race'"], opts).trim();
    assert.equal(count, '1');
    const lead12 = (revision, title, urgency) => ({ ...event(`correction-race-${revision}`, 'correction-race'), protocol_revision: '1.2', conversation_id: 'correction-race', data: { ...event('unused').data, lead_id: 'correction-race', phone: '+56988888889', revision, title, urgency } });
    const initial12 = JSON.parse(execFileSync('psql', [...args, '-At', '-c', query(lead12(1, 'Before', 'media'))], opts).trim().split('\n').at(-1));
    execFileSync('psql', [...args, '-c', `UPDATE oportunidades SET titulo='Human race',monto_estimado=987 WHERE id='${initial12.crm_opportunity_id}'`], opts);
    const corrections = await Promise.all([lead12(2, 'Second', 'urgente'), lead12(3, 'Third', 'alta')].map(e => run('psql', [...args, '-At', '-c', query(e)], opts)));
    const updated = corrections.map(o => JSON.parse(o.stdout.trim().split('\n').at(-1))).filter(o => o.status === 'updated').length;
    const raceState = JSON.parse(execFileSync('psql', [...args, '-At', '-c', `SELECT jsonb_build_object('title',titulo,'priority',prioridad,'amount',monto_estimado,'notifications',(SELECT count(*) FROM notificaciones WHERE link_url='/ventas/'||o.id::text)) FROM oportunidades o WHERE id='${initial12.crm_opportunity_id}'`], opts).trim());
    assert.deepEqual(raceState, { title: 'Human race', priority: 'alta', amount: 987, notifications: updated + 1 }, 'concurrent higher revisions preserve human edits, apply highest mapped value and notify only applied revisions');
    const handoff = eid => ({ schema_version: 1, event_id: eid, type: 'handoff.created', conversation_id: 'race-chat', data: { handoff_id: 'race-handoff', kind: 'complaint', description: 'Concurrent complaint' } });
    const cases = await Promise.all(['case-1', 'case-1', 'case-2', 'case-3'].map(eid => run('psql', [...args, '-At', '-c', query(handoff(eid))], opts)));
    assert.equal(new Set(cases.map(o => JSON.parse(o.stdout.trim().split('\n').at(-1)).crm_case_id)).size, 1);
    assert.equal(execFileSync('psql', [...args, '-At', '-c', "SELECT count(*) FROM postventa_casos WHERE descripcion='Concurrent complaint'"], opts).trim(), '1');
    const commercial = eid => ({ schema_version: 1, protocol_revision: '1.1', event_id: eid, type: 'handoff.created', conversation_id: 'race-chat', data: { handoff_id: 'race-commercial', kind: 'commercial', area: 'management', reason: 'race_requested', priority: 'alta', description: 'Concurrent commercial' } });
    const deliveries = await Promise.all(['commercial-1', 'commercial-1', 'commercial-2', 'commercial-3'].map(eid => run('psql', [...args, '-At', '-c', query(commercial(eid))], opts)));
    assert.equal(new Set(deliveries.map(o => o.stdout)).size, 3, 'same-event replay has exact original JSON');
    for (const o of deliveries) assert.equal(JSON.parse(o.stdout.trim().split('\n').at(-1)).routing_status, 'routed');
    const completion = "SET ROLE service_role; SELECT whatsapp_complete_handoff('race-commercial');";
    await Promise.all([1, 2, 3].map(() => run('psql', [...args, '-At', '-c', completion], opts)));
    assert.equal(execFileSync('psql', [...args, '-At', '-c', "SELECT count(*) FROM notificaciones WHERE mensaje='Derivación WhatsApp: race_requested'"], opts).trim(), '1', 'mapped management and current seller overlap is deduplicated');
    const ownership = (eid, type, version, seller = null) => ({ schema_version: 1, protocol_revision: '1.1', event_id: eid, type, conversation_id: 'race-ownership', data: type === 'ownership.taken' ? { version, crm_seller_id: seller, source: 'clickup' } : { version } });
    const same = await Promise.allSettled([ownership('take-equal', 'ownership.taken', 20), ownership('release-equal', 'ownership.released', 20)].map(e => run('psql', [...args, '-At', '-c', query(e)], opts)));
    assert.equal(same.filter(x => x.status === 'fulfilled').length, 1);
    assert.match(same.find(x => x.status === 'rejected').reason.stderr, /ERROR:  ownership_conflict/);
    const taken = ownership('take-higher', 'ownership.taken', 22, '10000000-0000-4000-8000-000000000001');
    const crossed = await Promise.all([taken, ownership('release-lower', 'ownership.released', 21)].map(e => run('psql', [...args, '-At', '-c', query(e)], opts)));
    const original = JSON.parse(crossed[0].stdout.trim().split('\n').at(-1));
    assert.deepEqual(original, { event_id: 'take-higher', ownership_version: 22, owner: 'human', crm_seller_id: taken.data.crm_seller_id, source: 'clickup' });
    const stale = JSON.parse(execFileSync('psql', [...args, '-At', '-c', query(ownership('query-current', 'ownership.released', 1))], opts).trim().split('\n').at(-1));
    assert.deepEqual({ ...stale, event_id: original.event_id }, original);
    execFileSync('psql', [...args, '-At', '-c', query(ownership('final-release', 'ownership.released', 23))], opts);
    const replay = JSON.parse(execFileSync('psql', [...args, '-At', '-c', query(taken)], opts).trim().split('\n').at(-1));
    assert.deepEqual(replay, original, 'original human result is immutable after later bot release');
  } catch (error) {
    const log = join(scratch, 'postgres.log');
    if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
    throw error;
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], opts);
    rmSync(scratch, { recursive: true, force: true });
  }
});
