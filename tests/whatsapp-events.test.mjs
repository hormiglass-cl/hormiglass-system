import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import { createHmac } from 'node:crypto';
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
const secret = 'local-test-only-shared-secret-32-bytes';
const url = 'https://whbqrracrxmeuyerrbdg.supabase.co';
const seller = '10000000-0000-4000-8000-000000000001';
const lead = () => ({ schema_version: 1, event_id: 'evt-1', type: 'lead.qualified', conversation_id: 'chat-1', data: { lead_id: 'lead-1', revision: 1, phone: '+56912345678', name: 'Test', rut: '12345678-5', crm_seller_id: seller, title: 'Test requirement', requirement: 'Glass' } });
function configure() {
  for (const k of Object.keys(process.env)) if (k.startsWith('WHATSAPP_EVENTS_')) delete process.env[k];
  Object.assign(process.env, { WHATSAPP_EVENTS_ENABLED: 'true', WHATSAPP_EVENTS_SUPABASE_URL: url, WHATSAPP_EVENTS_SERVICE_ROLE_KEY: 'local-test-service-key', WHATSAPP_EVENTS_HMAC_SECRET: secret });
}
function req(body, { timestamp = String(Math.floor(Date.now() / 1000)), signature, headers = {} } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  return new Request('https://crm.test/api/integrations/whatsapp/events', { method: 'POST', headers: { 'content-type': 'application/json', 'x-whatsapp-timestamp': timestamp, 'x-whatsapp-signature': signature ?? `v1=${sig}`, ...headers }, body: raw });
}
let calls;
const originalFetch = globalThis.fetch;
test.beforeEach(() => { configure(); calls = []; globalThis.fetch = async (...args) => {
  calls.push(args); const e = JSON.parse(args[1].body).p_event;
  const result = { event_id: e.event_id };
  if (e.type === 'lead.qualified') Object.assign(result, { crm_customer_id: seller, crm_opportunity_id: seller });
  if (e.type === 'message.new') result.crm_message_id = seller;
  if (e.type === 'ownership.released') Object.assign(result, { ownership_version: e.data.version, owner: 'bot' });
  if (e.type === 'handoff.created') Object.assign(result, { external_handoff_id: e.data.handoff_id, crm_case_id: null, crm_opportunity_id: null, status: e.data.kind === 'complaint' ? 'pending_association' : 'operational' });
  return Response.json(result);
}; });
test.afterEach(() => { globalThis.fetch = originalFetch; });
async function expectError(request, status, error) {
  const response = await POST(request);
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
  assert.equal(calls.length, 0, 'rejection must not call persistence');
}
test('S1/S4/S5: signed POST uses service RPC, raw content hash, no redirects, committed result', async () => {
  const body = lead(); const response = await POST(req(body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { event_id: 'evt-1', crm_customer_id: seller, crm_opportunity_id: seller });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `${url}/rest/v1/rpc/whatsapp_receive_event`);
  const options = calls[0][1];
  assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer local-test-service-key');
  assert.deepEqual(JSON.parse(options.body).p_event, body);
  assert.match(JSON.parse(options.body).p_hash, /^[a-f0-9]{64}$/);
});
test('S2: disabled, missing config and every non-exact URL fail closed before network', async () => {
  for (const key of ['WHATSAPP_EVENTS_ENABLED', 'WHATSAPP_EVENTS_HMAC_SECRET', 'WHATSAPP_EVENTS_SERVICE_ROLE_KEY', 'WHATSAPP_EVENTS_SUPABASE_URL']) {
    configure(); delete process.env[key]; await expectError(req(lead()), 503, 'receiver_unavailable');
  }
  for (const bad of ['false', '1']) { configure(); process.env.WHATSAPP_EVENTS_ENABLED = bad; await expectError(req(lead()), 503, 'receiver_unavailable'); }
  for (const bad of ['https://jvenwcupdllcqbxixcuo.supabase.co', 'http://whbqrracrxmeuyerrbdg.supabase.co', `${url}/`, `${url}:443`, `${url}?x=1`, `${url}#x`, `${url}/rest`, 'https://a:b@whbqrracrxmeuyerrbdg.supabase.co', 'https://custom.test']) {
    configure(); process.env.WHATSAPP_EVENTS_SUPABASE_URL = bad; await expectError(req(lead()), 503, 'receiver_unavailable');
  }
});
test('S5: missing, invalid, stale, future, tampered and malformed signatures leave storage untouched', async () => {
  for (const options of [{ signature: '' }, { signature: 'v1=' + '0'.repeat(64) }, { signature: 'v1=x' }, { timestamp: '' }, { timestamp: '1' }, { timestamp: String(Math.floor(Date.now()/1000)+301) }]) await expectError(req(lead(), options), 401, 'unauthorized');
  const r = req(lead()); const tampered = new Request(r.url, { method: 'POST', headers: r.headers, body: JSON.stringify({ ...lead(), event_id: 'tampered' }) });
  await expectError(tampered, 401, 'unauthorized');
});
test('S4: bounded bytes, malformed JSON, envelope and event-specific invalid input never reach RPC', async () => {
  await expectError(req('x'.repeat(65537)), 413, 'payload_too_large');
  await expectError(req('{'), 400, 'invalid_event');
  const invalid = [null, [], {}, { ...lead(), schema_version: 2 }, { ...lead(), event_id: '../bad' }, { ...lead(), type: 'unknown' }, { ...lead(), conversation_id: '' }];
  for (const field of ['lead_id', 'revision', 'phone', 'name', 'crm_seller_id', 'title', 'requirement']) invalid.push({ ...lead(), data: { ...lead().data, [field]: null } });
  invalid.push({ ...lead(), data: { ...lead().data, revision: 0 } }, { ...lead(), data: { ...lead().data, phone: 'abc123456789' } });
  for (const [type, data] of [['handoff.created', { handoff_id: 'h', kind: 'other', description: 'x' }], ['handoff.created', { handoff_id: 'h', kind: 'complaint', description: 'x', crm_opportunity_id: 'bad' }], ['message.new', { message_id: 'm', direction: 'inbound', text: 'x', sent_at: 'yesterday' }], ['ownership.released', { version: -1 }]]) invalid.push({ ...lead(), type, data });
  for (const body of invalid) await expectError(req(body), 400, 'invalid_event');
});
test('S4/S6/S7: all other v1 types reach durable persistence', async () => {
  for (const [type, data] of [['handoff.created', { handoff_id: 'h', kind: 'complaint', description: 'Issue' }], ['handoff.created', { handoff_id: 'h2', kind: 'operational', description: 'Delay' }], ['message.new', { message_id: 'm', direction: 'inbound', text: 'Hello', sent_at: '2026-11-04T12:00:00Z' }], ['ownership.released', { version: 1 }]]) {
    const response = await POST(req({ ...lead(), type, data })); assert.equal(response.status, 200);
  }
  assert.equal(calls.length, 4);
});
test('S4: impossible message dates reject before storage; exact byte limit is inclusive', async () => {
  await expectError(req({ ...lead(), type: 'message.new', data: { message_id: 'm', direction: 'inbound', text: 'x', sent_at: '2026-02-30T12:00:00Z' } }), 400, 'invalid_event');
  const raw = JSON.stringify(lead());
  assert.equal((await POST(req(raw + ' '.repeat(65536 - Buffer.byteLength(raw))))).status, 200);
  calls = [];
  await expectError(req(raw + ' '.repeat(65537 - Buffer.byteLength(raw)), { headers: { 'content-length': '1' } }), 413, 'payload_too_large');
});
test('S4: incomplete successful RPC response is not a committed acknowledgement', async () => {
  globalThis.fetch = async () => Response.json({ event_id: 'evt-1' });
  const response = await POST(req(lead()));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'persistence_unavailable' });
});
test('S5: replay age boundary is inclusive and re-signing retains content hash', async () => {
  const now = Date.now; const fixed = 1793793600000; Date.now = () => fixed;
  try {
    for (const seconds of [-300, 300]) assert.equal((await POST(req(lead(), { timestamp: String(fixed/1000+seconds) }))).status, 200);
    assert.equal(JSON.parse(calls[0][1].body).p_hash, JSON.parse(calls[1][1].body).p_hash);
    calls = [];
    await expectError(req(lead(), { timestamp: String(fixed/1000-301) }), 401, 'unauthorized');
  } finally { Date.now = now; }
});
test('S4: transaction conflicts, RUT compatibility and failures are sanitized, never false success', async () => {
  for (const [code, message, status, error] of [['P0001', 'event_conflict', 409, 'event_conflict'], ['P0001', 'identity_conflict', 409, 'identity_conflict'], ['P0001', 'rut_required', 422, 'rut_required'], ['P0001', 'invalid_seller', 422, 'invalid_seller'], ['XX000', 'SECRET private payload', 503, 'persistence_unavailable']]) {
    globalThis.fetch = async () => Response.json({ code, message }, { status: 400 });
    const response = await POST(req(lead())); assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
  }
  globalThis.fetch = async () => { throw Error('SECRET'); };
  const response = await POST(req(lead())); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'persistence_unavailable' });
});
