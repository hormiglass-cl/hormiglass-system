import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import ts from 'typescript';

registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (s.startsWith('.') && c.parentURL && !/\.[a-z]+$/i.test(s)) {
      const u = new URL(`${s}.ts`, c.parentURL); if (existsSync(u)) return next(u.href, c);
    }
    return next(s, c);
  },
  load(u, c, next) {
    if (u.endsWith('.ts')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(u), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(u, c);
  },
});
const { POST } = await import('../app/api/integrations/whatsapp/events/route.ts');
const seller = '10000000-0000-4000-8000-000000000001';
const secret = 'isolated-b1-synthetic-hmac-secret-32';
const event = (id, conversation, type, data, revision = true) => ({ schema_version: 1, ...(revision ? { protocol_revision: '1.1' } : {}), event_id: id, conversation_id: conversation, type, data });
const hash = raw => createHash('sha256').update(raw).digest('hex');
const literal = value => `'${value.replaceAll("'", "''")}'`;

// No ambient database configuration, network connection, Git history, or retained verifier fixture.
test('B1/S4/S10: no alternate public ingress can poison signed ownership acknowledgements', async t => {
  const scratch = mkdtempSync('/tmp/wa-b1-');
  const data = join(scratch, 'data');
  const env = { PATH: process.env.PATH, HOME: scratch, LANG: 'C', LC_ALL: 'C' };
  const opts = { env, encoding: 'utf8', timeout: 15000, stdio: 'pipe' };
  const args = ['-X', '-h', scratch, '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-qAt'];
  const sql = command => execFileSync('psql', [...args, '-c', command], opts).trim();
  const rpc = (name, e, digest = hash(JSON.stringify(e))) => spawnSync('psql', [...args, '-c', `SET ROLE service_role; SELECT public.${name}(${literal(JSON.stringify(e))}::jsonb,${literal(digest)});`], opts);
  const receive = e => { const result = rpc('whatsapp_receive_event', e); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  const tables = ['clientes', 'oportunidades', 'notificaciones', 'postventa_casos', 'whatsapp_event_inbox', 'whatsapp_lead_links', 'whatsapp_messages', 'whatsapp_handoffs', 'whatsapp_ownership', 'whatsapp_area_recipients', 'whatsapp_handoff_notifications', 'usuarios'];
  const snapshot = () => sql(`SELECT jsonb_build_array(${tables.map(name => `(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) FROM public.${name} r)`).join(',')});`);
  const signedPost = async raw => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = 'v1=' + createHmac('sha256', secret).update(timestamp + '.').update(raw).digest('hex');
    const response = await POST(new Request('https://crm.invalid/api/integrations/whatsapp/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-whatsapp-timestamp': timestamp, 'x-whatsapp-signature': signature }, body: raw }));
    return { status: response.status, body: await response.json() };
  };
  const originalFetch = globalThis.fetch;
  let started = false;
  try {
    execFileSync('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale'], opts);
    execFileSync('pg_ctl', ['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-k ${scratch} -p 5432 -c listen_addresses=''`, '-w', 'start'], opts); started = true;
    for (const path of ['tests/fixtures/whatsapp-events-schema.sql', 'supabase/migrations/20261104120000_whatsapp_events_receiver.sql', 'supabase/migrations/20261104130000_whatsapp_events_v1_1.sql', 'supabase/migrations/20261111160000_whatsapp_events_v1_2.sql']) execFileSync('psql', [...args, '-f', resolve(path)], opts);
    Object.assign(process.env, { WHATSAPP_EVENTS_ENABLED: 'true', WHATSAPP_EVENTS_SUPABASE_URL: 'https://whbqrracrxmeuyerrbdg.supabase.co', WHATSAPP_EVENTS_SERVICE_ROLE_KEY: 'isolated-synthetic-service-key', WHATSAPP_EVENTS_HMAC_SECRET: secret });
    // Mock only the transport: every handler RPC executes the installed SQL as service_role.
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://whbqrracrxmeuyerrbdg.supabase.co/rest/v1/rpc/whatsapp_receive_event');
      const { p_event, p_hash } = JSON.parse(options.body);
      const result = rpc('whatsapp_receive_event', p_event, p_hash);
      if (result.status === 0) return Response.json(JSON.parse(result.stdout));
      const error = /^ERROR:\s+([A-Z0-9]{5}):\s+([^\n]+)/m.exec(result.stderr);
      assert.ok(error, result.stderr);
      return Response.json({ code: error[1], message: error[2] }, { status: 400 });
    };
    for (const version of [9, 10, 11]) await t.test(`direct compatibility release ${version} cannot mutate human10 or inbox`, () => {
      const conversation = `direct-${version}`;
      receive(event(`take-${conversation}`, conversation, 'ownership.taken', { version: 10, crm_seller_id: seller, source: 'clickup' }));
      const release = event(`compat-${conversation}`, conversation, 'ownership.released', { version }, false);
      const before = snapshot();
      const attempt = rpc('whatsapp_receive_event_v1', release);
      assert.notEqual(attempt.status, 0, 'removed compatibility RPC must not acknowledge bot');
      assert.match(attempt.stderr, /42883:/, 'exact expected outcome: undefined_function');
      assert.equal(snapshot(), before, 'all affected rows, inbox and ownership unchanged');
      if (version <= 10) {
        const canonical = rpc('whatsapp_receive_event', release);
        assert.notEqual(canonical.status, 0);
        assert.match(canonical.stderr, /P0001: protocol_revision_required/);
        assert.equal(snapshot(), before, 'canonical rejection has no poisoned result');
        if (version === 10) {
          const equal = rpc('whatsapp_receive_event', { ...release, protocol_revision: '1.1' });
          assert.notEqual(equal.status, 0); assert.match(equal.stderr, /P0001: ownership_conflict/);
          assert.equal(snapshot(), before, 'equal-version revised release still conflicts without writes');
        }
        assert.deepEqual(receive({ ...release, protocol_revision: '1.1', data: { version: 9 } }), { event_id: release.event_id, ownership_version: 10, owner: 'human', crm_seller_id: seller, source: 'clickup' }, 'failed helper event ID remains safely reusable with a stale authoritative query');
      } else {
        assert.deepEqual(receive(release), { event_id: release.event_id, ownership_version: 11, owner: 'bot' });
        const authoritative = receive(event('current-direct-11', conversation, 'ownership.released', { version: 8 }));
        assert.deepEqual(authoritative, { event_id: 'current-direct-11', ownership_version: 11, owner: 'bot', crm_seller_id: null, source: null }, 'legitimate higher release really clears human seller/source');
      }
    });
    for (const version of [9, 10, 11]) await t.test(`signed POST after attempted raw-hash compatibility poisoning ${version}`, async () => {
      const conversation = `post-${version}`;
      const take = event(`take-${conversation}`, conversation, 'ownership.taken', { version: 10, crm_seller_id: null, source: 'clickup' });
      const human = { event_id: take.event_id, ownership_version: 10, owner: 'human', crm_seller_id: null, source: 'clickup' };
      assert.deepEqual(await signedPost(JSON.stringify(take)), { status: 200, body: human });
      const release = event(`compat-${conversation}`, conversation, 'ownership.released', { version }, false);
      const raw = JSON.stringify(release); const before = snapshot();
      const attempt = rpc('whatsapp_receive_event_v1', release, hash(raw));
      const reply = await signedPost(raw);
      assert.deepEqual(reply, version <= 10 ? { status: 409, body: { error: 'protocol_revision_required' } } : { status: 200, body: { event_id: release.event_id, ownership_version: 11, owner: 'bot' } }, 'canonical POST must never replay helper-written false bot acknowledgement');
      assert.notEqual(attempt.status, 0); assert.match(attempt.stderr, /42883:/);
      if (version <= 10) {
        assert.equal(snapshot(), before, 'failed helper and signed POST leave every row unchanged');
        if (version === 10) {
          assert.deepEqual(await signedPost(JSON.stringify({ ...release, protocol_revision: '1.1' })), { status: 409, body: { error: 'ownership_conflict' } });
          assert.equal(snapshot(), before, 'equal-version signed conflict remains atomic');
        }
        const revised = { ...release, protocol_revision: '1.1', data: { version: 9 } };
        const expected = { status: 200, body: { ...human, event_id: release.event_id } };
        assert.deepEqual(await signedPost(JSON.stringify(revised)), expected, 'unpoisoned ID can commit authoritative human result');
        assert.deepEqual(await signedPost(JSON.stringify(revised)), expected, 'exact signed replay remains original');
      } else {
        assert.deepEqual(receive(event('current-post-11', conversation, 'ownership.released', { version: 8 })), { event_id: 'current-post-11', ownership_version: 11, owner: 'bot', crm_seller_id: null, source: null });
        assert.deepEqual(await signedPost(raw), reply, 'legitimate legacy replay remains exact');
      }
    });
    await t.test('S1/S7: stale 1.1 signed POST reports authoritative 1.2 CRM ownership without loosening input', async () => {
      const conversation = 'cross-revision-crm';
      const take = { ...event('cross-take12', conversation, 'ownership.taken', { version: 10, crm_seller_id: seller, source: 'crm' }), protocol_revision: '1.2' };
      const authoritative = { event_id: take.event_id, ownership_version: 10, owner: 'human', crm_seller_id: seller, source: 'crm' };
      assert.deepEqual(await signedPost(JSON.stringify(take)), { status: 200, body: authoritative });
      const notificationCount = sql('SELECT count(*) FROM public.notificaciones');
      for (const type of ['ownership.taken', 'ownership.released']) {
        const stale = event(`cross-stale-${type}`, conversation, type, type === 'ownership.taken' ? { version: 9, crm_seller_id: null, source: 'clickup' } : { version: 9 });
        const expected = { status: 200, body: { ...authoritative, event_id: stale.event_id } };
        assert.deepEqual(await signedPost(JSON.stringify(stale)), expected, 'newer CRM state must not become persistence_unavailable');
        const afterFirst = snapshot();
        assert.deepEqual(await signedPost(JSON.stringify(stale)), expected, '1.1 replay keeps the exact authoritative keys and values');
        assert.equal(snapshot(), afterFirst, 'replay changes no rows or counters');
      }
      assert.equal(sql('SELECT count(*) FROM public.notificaciones'), notificationCount, 'stale requests do not notify');
      for (const type of ['ownership.taken', 'ownership.released']) {
        const equal = event(`cross-equal-${type}`, conversation, type, type === 'ownership.taken' ? { version: 10, crm_seller_id: seller, source: 'clickup' } : { version: 10 });
        const before = snapshot();
        assert.deepEqual(await signedPost(JSON.stringify(equal)), { status: 409, body: { error: 'ownership_conflict' } });
        assert.equal(snapshot(), before, 'equal-version conflicts leave every row and counter unchanged');
      }
      const forbidden = event('cross-forbidden-source', conversation, 'ownership.taken', { version: 11, crm_seller_id: seller, source: 'crm' });
      const before = snapshot();
      const transport = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async (...args) => { calls++; return transport(...args); };
      try {
        assert.deepEqual(await signedPost(JSON.stringify(forbidden)), { status: 400, body: { error: 'invalid_event' } });
        assert.equal(calls, 0, '1.1 CRM input is rejected before SQL');
      } finally { globalThis.fetch = transport; }
      assert.equal(snapshot(), before, 'invalid source leaves stored data and counters unchanged');
      const direct = rpc('whatsapp_receive_event', forbidden);
      assert.equal(direct.status, 1); assert.equal(direct.stdout, '');
      assert.match(direct.stderr, /P0001: invalid_event/);
      assert.equal(snapshot(), before, 'SQL independently rejects 1.1 CRM input without writes');
    });
    await t.test('unknown revision/fields cannot reach removed ingress; no public aliases; canonical service grants remain', () => {
      for (const extra of [{ protocol_revision: '1.3' }, { data: { version: 1, ignored: true } }]) {
        const e = { ...event('invalid-direct', 'invalid-direct', 'ownership.released', { version: 1 }, false), ...extra };
        const before = snapshot(); const attempt = rpc('whatsapp_receive_event_v1', e);
        assert.notEqual(attempt.status, 0); assert.match(attempt.stderr, /42883:/);
        const canonical = rpc('whatsapp_receive_event', e);
        assert.notEqual(canonical.status, 0); assert.match(canonical.stderr, /P0001: invalid_event/);
        assert.equal(snapshot(), before);
      }
      assert.equal(sql("SELECT string_agg(p.proname,',' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'whatsapp_receive_event%'"), 'whatsapp_receive_event');
      assert.equal(sql("SELECT NOT p.prosecdef AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='whatsapp_receive_event'"), 't');
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], opts);
    rmSync(scratch, { recursive: true, force: true });
  }
});
