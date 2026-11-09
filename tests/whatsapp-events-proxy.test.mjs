import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
export async function evaluate(source, path, cookie, mode = 'valid') {
  let clients = 0; let cookieReads = 0;
  const nextUrl = new URL(`https://crm.test${path}`); nextUrl.clone = () => new URL(nextUrl);
  const request = { nextUrl, cookies: { getAll() { cookieReads++; return cookie ? [{ name: 'sb-test-auth', value: 'cookie' }] : []; }, set() {} } };
  const response = kind => ({ kind, cookies: { set() {} } });
  const module = { exports: {} };
  const context = { module, exports: module.exports, process: { env: {} }, URL, Date, Map, require(name) {
    if (name === './lib/supabase/config') return { authCookieName: 'sb-test-auth' };
    if (name === 'next/server') return { NextResponse: { next: () => response('next'), redirect: url => ({ kind: 'redirect', url: String(url) }) } };
    if (name === '@supabase/ssr') return { createServerClient() { clients++; return { auth: { getUser: async () => ({ data: { user: mode === 'anonymous' ? null : { id: 'u' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { activo: mode !== 'inactive', rol: mode === 'worker' ? 'mano_obra' : 'user' } }) }) }) }) }; } };
    throw Error(`unexpected import ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const result = await module.exports.proxy(request);
  return JSON.parse(JSON.stringify({ result, clients, cookieReads }));
}
const source = readFileSync('proxy.ts', 'utf8');
test('S2/S5: exact receiver path bypasses cookies and Supabase, even with session cookies', async () => {
  for (const cookie of [false, true]) assert.deepEqual(await evaluate(source, '/api/integrations/whatsapp/events', cookie), { result: { kind: 'next', cookies: {} }, clients: 0, cookieReads: 0 });
});
test('PRESERVE: siblings and existing session/redirect behavior are unchanged', async () => {
  for (const path of ['/api/integrations/whatsapp/events/extra', '/api/integrations/whatsapp/other', '/api/leads', '/login', '/auth/callback', '/ventas']) {
    const noCookie = await evaluate(source, path, false);
    assert.equal(noCookie.clients, 0); assert.equal(noCookie.cookieReads, 1);
    assert.equal(noCookie.result.kind, path === '/ventas' ? 'redirect' : 'next');
    const cookie = await evaluate(source, path, true);
    assert.equal(cookie.clients, 1); assert.equal(cookie.result.kind, path === '/login' ? 'redirect' : 'next');
  }
  assert.equal((await evaluate(source, '/ventas', true, 'anonymous')).result.url, 'https://crm.test/login');
  assert.equal((await evaluate(source, '/ventas', true, 'inactive')).result.url, 'https://crm.test/login?error=inactivo');
  // Colaborador (mano_obra) may open /caja since the HIG redesign removed the proxy-level redirect.
  assert.equal((await evaluate(source, '/caja', true, 'worker')).result.kind, 'next');
});
