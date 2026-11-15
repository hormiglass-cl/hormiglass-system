import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
registerHooks({
  resolve(s, c, next) {
    if (s === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (s === 'next/headers') return { url: 'data:text/javascript,export const cookies=async()=>({getAll:()=>[],set(){}})', shortCircuit: true };
    if (s === '@supabase/ssr') return { url: 'data:text/javascript,export const createServerClient=(...a)=>globalThis.__supabaseStub(...a)', shortCircuit: true };
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
const { sendCrmEvent, parseCrmEventsConfig } = await import('../lib/integrations/whatsapp/crm-sender.ts');
const { verifySignature } = await import('../lib/integrations/whatsapp/hmac.ts');
const { POST } = await import('../app/api/integrations/whatsapp/chat/route.ts');

const secret = 'crm-to-bot-local-test-secret-32-bytes!';
const inbound = 'bot-to-crm-local-test-secret-32-bytes!!';
const url = 'https://bot.test/webhook/crm-events';
const body = '{"schema_version":1,"protocol_revision":"1.2","event_id":"crm-1","type":"chat.take","occurred_at":"2026-11-15T12:00:00Z","data":{"crm_opportunity_id":"00000000-0000-4000-8000-000000000001","crm_seller_id":"00000000-0000-4000-8000-000000000002","ownership_version":0}}';
const reply = (status, json, raw) => new Response(raw ?? JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
function harness(replies, start = 1_800_000_000_000) {
  let clock = start; const calls = []; const sleeps = [];
  const fetch = async (target, init) => {
    calls.push({ target, init, at: clock });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, sleeps, deps: { fetch, now: () => clock, sleep: async ms => { sleeps.push(ms); clock += 2000; } } };
}

test('S1: signs v1=<hex HMAC(secret, timestamp.body)> with a 10-digit timestamp, verifiable with the shared helper', async () => {
  const h = harness([reply(200, { result: 'applied', ownership_version: 1 })]);
  const result = await sendCrmEvent({ url, secret, body }, h.deps);
  assert.deepEqual(result, { httpStatus: 200, response: { result: 'applied', ownership_version: 1 }, attempts: 1 });
  const [{ target, init, at }] = h.calls;
  assert.equal(target, url);
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.match(init.headers['X-CRM-Timestamp'], /^[0-9]{10}$/);
  assert.equal(init.headers['X-CRM-Timestamp'], String(Math.floor(at / 1000)));
  assert.match(init.headers['X-CRM-Signature'], /^v1=[a-f0-9]{64}$/);
  assert.equal(init.body, body, 'exact body bytes');
  assert.ok(verifySignature(Buffer.from(body), init.headers['X-CRM-Timestamp'], init.headers['X-CRM-Signature'], secret, at));
  assert.equal(verifySignature(Buffer.from(body), init.headers['X-CRM-Timestamp'], init.headers['X-CRM-Signature'], inbound, at), false, 'outbound secret only');
});

test('S2: retries 503 and network errors with backoff, identical bytes and a fresh timestamp/signature each attempt', async () => {
  const h = harness([reply(503, { error: 'unavailable' }), new TypeError('fetch failed'), reply(200, { result: 'applied', ownership_version: 7 })]);
  const result = await sendCrmEvent({ url, secret, body }, h.deps);
  assert.deepEqual(result, { httpStatus: 200, response: { result: 'applied', ownership_version: 7 }, attempts: 3 });
  assert.equal(h.calls.length, 3); assert.equal(h.sleeps.length, 2);
  assert.ok(h.sleeps[1] > h.sleeps[0], 'backoff grows');
  assert.equal(new Set(h.calls.map(c => c.init.body)).size, 1);
  assert.equal(new Set(h.calls.map(c => c.init.headers['X-CRM-Timestamp'])).size, 3);
  assert.equal(new Set(h.calls.map(c => c.init.headers['X-CRM-Signature'])).size, 3);
  for (const c of h.calls) assert.ok(verifySignature(Buffer.from(body), c.init.headers['X-CRM-Timestamp'], c.init.headers['X-CRM-Signature'], secret, c.at));
});

test('S2: at most 3 attempts; the last 503 or network failure is returned as retryable input', async () => {
  const unavailable = harness([reply(503, {}), reply(503, {}), reply(503, { error: 'unavailable' }), reply(200, {})]);
  assert.deepEqual(await sendCrmEvent({ url, secret, body }, unavailable.deps), { httpStatus: 503, response: { error: 'unavailable' }, attempts: 3 });
  assert.equal(unavailable.calls.length, 3);
  const offline = harness([new TypeError('a'), new TypeError('b'), new TypeError('c'), reply(200, {})]);
  assert.deepEqual(await sendCrmEvent({ url, secret, body }, offline.deps), { httpStatus: null, response: null, attempts: 3 });
  assert.equal(offline.calls.length, 3);
});

test('S2/S4: 400, 401, 409, 413 and 422 stop retries immediately', async () => {
  for (const status of [400, 401, 409, 413, 422]) {
    const h = harness([reply(status, { error: 'x' }), reply(200, {})]);
    assert.deepEqual(await sendCrmEvent({ url, secret, body }, h.deps), { httpStatus: status, response: { error: 'x' }, attempts: 1 });
    assert.equal(h.sleeps.length, 0);
  }
});

test('S4: responses are bounded to 8192 bytes and must be JSON objects', async () => {
  const big = harness([reply(200, null, JSON.stringify({ result: 'applied', pad: 'x'.repeat(9000) }))]);
  assert.deepEqual(await sendCrmEvent({ url, secret, body }, big.deps), { httpStatus: 200, response: null, attempts: 1 });
  for (const raw of ['not json', '[1]', 'null']) {
    const h = harness([reply(409, null, raw)]);
    assert.deepEqual(await sendCrmEvent({ url, secret, body }, h.deps), { httpStatus: 409, response: null, attempts: 1 });
  }
});

test('S7: config is off unless URL and a distinct outbound secret of at least 32 characters are set', () => {
  const ok = { WHATSAPP_CRM_EVENTS_URL: url, WHATSAPP_CRM_EVENTS_SECRET: secret, WHATSAPP_EVENTS_HMAC_SECRET: inbound };
  assert.deepEqual(parseCrmEventsConfig(ok), { url, secret });
  for (const local of ['http://127.0.0.1:8787/webhook/crm-events', 'http://localhost:8787/webhook/crm-events']) assert.deepEqual(parseCrmEventsConfig({ ...ok, WHATSAPP_CRM_EVENTS_URL: local }), { url: local, secret });
  for (const bad of [
    { WHATSAPP_CRM_EVENTS_URL: undefined }, { WHATSAPP_CRM_EVENTS_SECRET: undefined },
    { WHATSAPP_CRM_EVENTS_URL: 'http://bot.test/webhook/crm-events' }, { WHATSAPP_CRM_EVENTS_URL: 'not a url' },
    { WHATSAPP_CRM_EVENTS_URL: 'https://user:pass@bot.test/webhook/crm-events' }, { WHATSAPP_CRM_EVENTS_URL: 'ftp://bot.test/x' },
    { WHATSAPP_CRM_EVENTS_SECRET: 'short-secret' }, { WHATSAPP_CRM_EVENTS_SECRET: ' '.repeat(40) },
    { WHATSAPP_CRM_EVENTS_SECRET: inbound },
  ]) assert.equal(parseCrmEventsConfig({ ...ok, ...bad }), null, JSON.stringify(bad));
});

// Route: user session -> command RPC; signed send; service key -> result RPC.
const devUrl = 'https://whbqrracrxmeuyerrbdg.supabase.co';
const op = '00000000-0000-4000-8000-000000000001';
function configure(extra = {}) {
  for (const k of Object.keys(process.env)) if (k.startsWith('WHATSAPP_')) delete process.env[k];
  Object.assign(process.env, { WHATSAPP_EVENTS_ENABLED: 'true', WHATSAPP_EVENTS_SUPABASE_URL: devUrl, WHATSAPP_EVENTS_SERVICE_ROLE_KEY: 'local-test-service-key', WHATSAPP_EVENTS_HMAC_SECRET: inbound, NEXT_PUBLIC_SUPABASE_URL: devUrl, WHATSAPP_CRM_EVENTS_URL: url, WHATSAPP_CRM_EVENTS_SECRET: secret, ...extra });
}
const post = payload => POST(new Request('https://crm.test/api/integrations/whatsapp/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
function stubs({ rpc, bot }) {
  const rpcCalls = []; const fetches = [];
  globalThis.__supabaseStub = () => ({ rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpc(name, args); } });
  globalThis.fetch = async (target, init) => {
    fetches.push({ target: String(target), init });
    if (String(target) === url) return bot(init);
    const args = JSON.parse(init.body);
    return reply(200, { event_id: args.p_event_id, type: 'chat.take', status: args.p_http_status === 200 ? 'applied' : 'rejected', http_status: args.p_http_status, error_code: args.p_response?.error ?? null, holder_crm_seller_id: args.p_response?.holder_crm_seller_id ?? null, ownership_version: 3, owner: 'human' });
  };
  return { rpcCalls, fetches };
}
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('S7: route answers 503 chat_commands_unavailable when configuration is off, before any session or network work', async () => {
  for (const extra of [{ WHATSAPP_CRM_EVENTS_URL: '' }, { WHATSAPP_CRM_EVENTS_SECRET: inbound }, { WHATSAPP_EVENTS_ENABLED: 'false' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }]) {
    configure(extra);
    const s = stubs({ rpc: () => { throw new Error('unexpected'); }, bot: () => { throw new Error('unexpected'); } });
    const response = await post({ opportunity_id: op, action: 'take' });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'chat_commands_unavailable' });
    assert.equal(s.rpcCalls.length + s.fetches.length, 0);
  }
});

test('route validates input and maps refused commands to HTTP statuses', async () => {
  configure();
  for (const bad of [{}, { opportunity_id: 'x', action: 'take' }, { opportunity_id: op, action: 'close' }]) {
    stubs({ rpc: () => { throw new Error('unexpected'); }, bot: () => { throw new Error('unexpected'); } });
    const response = await post(bad);
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }
  for (const [code, status] of [['forbidden', 403], ['not_holder', 403], ['chat_not_linked', 404], ['chat_not_taken', 409], ['already_holder', 409], ['command_in_progress', 409], ['something else', 500], ['anon', 403]]) {
    const s = stubs({ rpc: () => ({ data: null, error: code === 'anon' ? { code: '42501', message: 'permission denied' } : { code: 'P0001', message: code } }), bot: () => { throw new Error('unexpected'); } });
    const response = await post({ opportunity_id: op, action: 'release' });
    assert.equal(response.status, status, code);
    assert.deepEqual(await response.json(), { error: status === 500 ? 'command_failed' : code === 'anon' ? 'forbidden' : code });
    assert.deepEqual(s.rpcCalls, [{ name: 'whatsapp_chat_command', args: { p_opportunity_id: op, p_type: 'chat.release' } }]);
    assert.equal(s.fetches.length, 0, 'refused commands send nothing');
  }
});

test('S3/S4: route sends the stored bytes, records the outcome with the service key and returns only known fields', async () => {
  configure();
  const s = stubs({
    rpc: () => ({ data: { event_id: 'crm-1', body, reused: false }, error: null }),
    bot: () => reply(409, { error: 'ownership_conflict', holder_crm_seller_id: '00000000-0000-4000-8000-000000000009', secret: 'drop' }),
  });
  const response = await post({ opportunity_id: op, action: 'take' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { event_id: 'crm-1', type: 'chat.take', status: 'rejected', http_status: 409, error_code: 'ownership_conflict', holder_crm_seller_id: '00000000-0000-4000-8000-000000000009', ownership_version: 3, owner: 'human' });
  const [bot, result] = s.fetches;
  assert.equal(bot.target, url); assert.equal(bot.init.body, body);
  assert.equal(result.target, `${devUrl}/rest/v1/rpc/whatsapp_chat_command_result`);
  assert.equal(result.init.headers.Authorization, 'Bearer local-test-service-key');
  assert.equal(result.init.redirect, 'error');
  assert.deepEqual(JSON.parse(result.init.body), { p_event_id: 'crm-1', p_http_status: 409, p_response: { error: 'ownership_conflict', holder_crm_seller_id: '00000000-0000-4000-8000-000000000009', secret: 'drop' }, p_attempts: 1 });
});

test('route reports result_unrecorded when the outcome cannot be stored', async () => {
  configure();
  stubs({ rpc: () => ({ data: { event_id: 'crm-1', body, reused: true }, error: null }), bot: () => reply(200, { result: 'applied', ownership_version: 3 }) });
  const bot = globalThis.fetch;
  globalThis.fetch = async (target, init) => String(target) === url ? bot(target, init) : reply(500, { message: 'db down' });
  const response = await post({ opportunity_id: op, action: 'take' });
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'result_unrecorded' });
});
