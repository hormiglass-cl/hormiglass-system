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
    for (const path of ['tests/fixtures/whatsapp-events-schema.sql', 'supabase/migrations/20261104120000_whatsapp_events_receiver.sql', 'supabase/tests/whatsapp_events_receiver.sql']) execFileSync('psql', [...args, '-f', resolve(path)], opts);
    const event = (eid, lid = 'race-lead') => ({ schema_version: 1, event_id: eid, type: 'lead.qualified', conversation_id: 'race-chat', data: { lead_id: lid, revision: 1, phone: '+56988888888', name: 'Race', rut: 'race-rut', crm_seller_id: '10000000-0000-4000-8000-000000000001', title: 'Race', requirement: 'Glass' } });
    const query = e => `SET ROLE service_role; SELECT whatsapp_receive_event('${JSON.stringify(e)}'::jsonb,repeat(md5('${JSON.stringify(e)}'),2));`;
    const outputs = await Promise.all([event('race-1'), event('race-1'), event('race-2'), event('race-3')].map(e => run('psql', [...args, '-At', '-c', query(e)], opts)));
    const ids = outputs.map(o => JSON.parse(o.stdout.trim().split('\n').at(-1)).crm_opportunity_id);
    assert.equal(new Set(ids).size, 1, 'concurrent event IDs and duplicate deliveries reuse opportunity');
    const count = execFileSync('psql', [...args, '-At', '-c', "SELECT count(*) FROM oportunidades WHERE titulo='Race'"], opts).trim();
    assert.equal(count, '1');
    const handoff = eid => ({ schema_version: 1, event_id: eid, type: 'handoff.created', conversation_id: 'race-chat', data: { handoff_id: 'race-handoff', kind: 'complaint', description: 'Concurrent complaint' } });
    const cases = await Promise.all(['case-1', 'case-1', 'case-2', 'case-3'].map(eid => run('psql', [...args, '-At', '-c', query(handoff(eid))], opts)));
    assert.equal(new Set(cases.map(o => JSON.parse(o.stdout.trim().split('\n').at(-1)).crm_case_id)).size, 1);
    assert.equal(execFileSync('psql', [...args, '-At', '-c', "SELECT count(*) FROM postventa_casos WHERE descripcion='Concurrent complaint'"], opts).trim(), '1');
  } catch (error) {
    const log = join(scratch, 'postgres.log');
    if (existsSync(log)) console.error(readFileSync(log, 'utf8'));
    throw error;
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], opts);
    rmSync(scratch, { recursive: true, force: true });
  }
});
