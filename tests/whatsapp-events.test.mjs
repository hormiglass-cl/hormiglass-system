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
    const expected = type === 'handoff.created' ? { event_id: 'evt-1', external_handoff_id: data.handoff_id, crm_case_id: null, crm_opportunity_id: null, status: data.kind === 'complaint' ? 'pending_association' : 'operational' }
      : type === 'message.new' ? { event_id: 'evt-1', crm_message_id: seller } : { event_id: 'evt-1', ownership_version: 1, owner: 'bot' };
    assert.deepEqual(await response.json(), expected);
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
test('S9: revision-gated commercial/operational/claims handoffs and exact routing replies', async () => {
  const handoff = (kind, area) => ({ ...lead(), protocol_revision: '1.1', type: 'handoff.created', data: { handoff_id: 'extension', kind, ...(area ? { area } : {}), reason: 'human_requested', priority: 'alta', description: 'Help' } });
  for (const [kind, area] of [['commercial', 'sales'], ['commercial', 'management'], ['operational', 'finance'], ['operational', 'scheduling'], ['complaint', undefined], ['complaint', 'claims']]) {
    const event = handoff(kind, area);
    const result = { event_id: event.event_id, external_handoff_id: 'extension', crm_case_id: null, crm_opportunity_id: null, status: kind === 'operational' ? 'operational' : 'pending_association', routing_status: 'pending_routing' };
    globalThis.fetch = async () => Response.json(result);
    const response = await POST(req(event)); assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
  }
  for (const mutate of [e => { delete e.protocol_revision; }, e => { e.protocol_revision = '1.2'; }, e => { delete e.data.area; }, e => { delete e.data.reason; }, e => { delete e.data.priority; }, e => { e.data.area = 'claims'; }, e => { e.data.reason = 'Bad-Code'; }, e => { e.data.reason = '_leading'; }, e => { e.data.reason = 'trailing_'; }, e => { e.data.reason = 'double__underscore'; }, e => { e.data.reason = null; }, e => { e.data.reason = 'a'.repeat(65); }, e => { e.data.priority = 'high'; }, e => { e.data.priority = ['alta']; }, e => { e.data.area = ['sales']; }, e => { e.data.postventa_type = 'otro'; }, e => { e.data.extra = 1; }]) {
    const event = handoff('commercial', 'sales'); mutate(event); calls = []; await expectError(req(event), 400, 'invalid_event');
  }
  for (const [kind, area, extra] of [['complaint', 'claims', { postventa_type: ['otro'] }], ['operational', 'sales', {}], ['operational', 'finance', { crm_opportunity_id: seller }], ['complaint', 'sales', {}]]) {
    const e = handoff(kind, area); Object.assign(e.data, extra); calls = []; await expectError(req(e), 400, 'invalid_event');
  }
});
test('S9: associated handoff shapes and reason boundaries; invalid replies never acknowledge', async () => {
  for (const kind of ['commercial', 'complaint', 'operational']) {
    const e = { ...lead(), protocol_revision: '1.1', type: 'handoff.created', data: { handoff_id: 'h', kind, area: kind === 'commercial' ? 'sales' : kind === 'complaint' ? 'claims' : 'scheduling', reason: 'a'.repeat(64), priority: 'baja', description: 'Help' } };
    const result = { event_id: e.event_id, external_handoff_id: 'h', crm_case_id: kind === 'complaint' ? seller : null, crm_opportunity_id: kind === 'operational' ? null : seller, status: kind === 'operational' ? 'operational' : 'associated', routing_status: 'routed' };
    globalThis.fetch = async () => Response.json(result);
    const response = await POST(req(e)); assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
    for (const override of [{ routing_status: 'delivered' }, { crm_case_id: kind === 'complaint' ? null : seller }, { crm_opportunity_id: kind === 'operational' ? seller : null }, { extra: 1 }]) {
      globalThis.fetch = async () => Response.json({ ...result, ...override });
      const rejected = await POST(req(e)); assert.equal(rejected.status, 503); assert.deepEqual(await rejected.json(), { error: 'persistence_unavailable' });
    }
  }
});
test('S10: taken/released return authoritative human or bot state including nullable seller', async () => {
  for (const type of ['ownership.taken', 'ownership.released']) for (const owner of ['bot', 'human']) for (const currentSeller of [null, seller]) {
    if (owner === 'bot' && currentSeller !== null) continue;
    const e = { ...lead(), protocol_revision: '1.1', type, data: type === 'ownership.taken' ? { version: 4, crm_seller_id: seller, source: 'clickup' } : { version: 4 } };
    const result = { event_id: e.event_id, ownership_version: 5, owner, crm_seller_id: currentSeller, source: owner === 'human' ? 'clickup' : null };
    globalThis.fetch = async () => Response.json(result);
    const response = await POST(req(e)); assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
  }
  for (const data of [{ version: 1 }, { version: 1, crm_seller_id: null }, { version: 1, crm_seller_id: 'bad', source: 'clickup' }, { version: 1, crm_seller_id: null, source: 'crm' }, { version: 0, crm_seller_id: null, source: 'clickup' }]) {
    calls = []; await expectError(req({ ...lead(), protocol_revision: '1.1', type: 'ownership.taken', data }), 400, 'invalid_event');
  }
  const nullable = { ...lead(), protocol_revision: '1.1', type: 'ownership.taken', data: { version: 1, crm_seller_id: null, source: 'clickup' } };
  const result = { event_id: nullable.event_id, ownership_version: 1, owner: 'human', crm_seller_id: null, source: 'clickup' };
  globalThis.fetch = async () => Response.json(result);
  assert.deepEqual(await (await POST(req(nullable))).json(), result);
  calls = []; const legacy = { ...nullable }; delete legacy.protocol_revision; await expectError(req(legacy), 400, 'invalid_event');
});
test('S10: SQL UUID normalization does not invalidate a committed take acknowledgement', async () => {
  const requested = 'ABCDEF00-0000-4000-8000-000000000001';
  const e = { ...lead(), protocol_revision: '1.1', type: 'ownership.taken', data: { version: 4, crm_seller_id: requested, source: 'clickup' } };
  const result = { event_id: e.event_id, ownership_version: 4, owner: 'human', crm_seller_id: requested.toLowerCase(), source: 'clickup' };
  globalThis.fetch = async () => Response.json(result);
  const response = await POST(req(e)); assert.equal(response.status, 200); assert.deepEqual(await response.json(), result);
});
test('S9/S10: sanitized new conflicts and malformed authoritative responses fail closed', async () => {
  const e = { ...lead(), protocol_revision: '1.1', type: 'ownership.taken', data: { version: 4, crm_seller_id: seller, source: 'clickup' } };
  for (const code of ['ownership_conflict', 'protocol_revision_required']) {
    globalThis.fetch = async () => Response.json({ code: 'P0001', message: code }, { status: 400 });
    const response = await POST(req(e)); assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: code });
  }
  const good = { event_id: e.event_id, ownership_version: 4, owner: 'human', crm_seller_id: seller, source: 'clickup' };
  for (const override of [{ ownership_version: 3 }, { ownership_version: 4.5 }, { owner: 'bot' }, { crm_seller_id: 'bad' }, { crm_seller_id: null }, { source: null }, { extra: true }]) {
    globalThis.fetch = async () => Response.json({ ...good, ...override });
    const response = await POST(req(e)); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'persistence_unavailable' });
  }
});
test('S4: transaction conflicts, RUT compatibility and failures are sanitized, never false success', async () => {
  for (const [code, message, status, error] of [['P0001', 'event_conflict', 409, 'event_conflict'], ['P0001', 'identity_conflict', 409, 'identity_conflict'], ['P0001', 'rut_required', 422, 'rut_required'], ['P0001', 'invalid_seller', 422, 'invalid_seller'], ['XX000', 'SECRET private payload', 503, 'persistence_unavailable']]) {
    globalThis.fetch = async () => Response.json({ code, message }, { status: 400 });
    const response = await POST(req(lead())); assert.equal(response.status, status); assert.deepEqual(await response.json(), { error });
  }
  globalThis.fetch = async () => { throw Error('SECRET'); };
  const response = await POST(req(lead())); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'persistence_unavailable' });
});
