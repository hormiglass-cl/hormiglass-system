import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';

import { isolatedFrameCss, captureInitialLayout, assertLayout, assertMobileNavigation } from './whatsapp-visual.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');

// Only the isolated render harness is served: never start Next, auth or the CRM.
test('isolated real WhatsApp frontend interactions (S1–S6)', { timeout: 25000 }, async t => {
  await mkdir(path.join(root, '.next'), { recursive: true });
  const scratch = await mkdtemp(path.join(root, '.next/whatsapp-browser-'));
  const review = path.join(root, '.next/whatsapp-review');
  await mkdir(review, { recursive: true });
  let server, browser, page, completed = false;
  const errors = [], external = [], requestErrors = [];
  t.after(async () => {
    if (!completed && page && !page.isClosed()) {
      try { await page.screenshot({ path: path.join(review, 'failure.png'), fullPage: true, animations: 'disabled', timeout: 2000 }); }
      catch (error) { console.log(`Failure screenshot unavailable: ${error.message}`); }
    }
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(scratch, { recursive: true, force: true });
    console.log(JSON.stringify({ browserErrors: errors, externalRequests: external, requestErrors, scratchCleaned: scratch }));
  });
  await writeFile(path.join(scratch, 'loader.cjs'), `const ts = require(${JSON.stringify(require.resolve('typescript'))});
module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; };`);
  await writeFile(path.join(scratch, 'entry.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationProvider } from ${JSON.stringify(path.join(root, 'lib/whatsapp/store.tsx'))};
import ConversacionesPage from ${JSON.stringify(path.join(root, 'app/conversaciones/page.tsx'))};
import { OpportunityActivity } from ${JSON.stringify(path.join(root, 'components/whatsapp/OpportunityActivity.tsx'))};
function Harness() {
  const [id, setId] = useState(1), [actions, setActions] = useState(0), [closed, setClosed] = useState(false);
  return <ConversationProvider><main id="inbox"><ConversacionesPage /></main>
    <section id="opportunity"><button onClick={() => setId(id + 1)}>Switch opportunity</button>
      <output aria-label="Opportunity identifier">{id}</output>
      <output aria-label="Close callbacks">{closed ? 'closed' : 'open'}</output>
      <OpportunityActivity key={id} onClose={() => setClosed(true)}>
        <button onClick={() => setActions(actions + 1)}>Existing activity action: {actions}</button>
      </OpportunityActivity>
    </section></ConversationProvider>;
}
createRoot(document.getElementById('root')!).render(<Harness />);`);
  let webpack;
  try {
    const bundled = require('next/dist/compiled/webpack/webpack');
    webpack = bundled.webpack;
    if (typeof webpack !== 'function') throw new Error('webpack export is not a function');
  } catch (error) { throw new Error(`Installed bundler unavailable: ${error.message}`); }
  const compiler = webpack({ mode: 'development', devtool: false, entry: path.join(scratch, 'entry.tsx'),
    output: { path: scratch, filename: 'bundle.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(scratch, 'loader.cjs') }] },
    // Installed React's browser entry also checks process.env beyond NODE_ENV.
    // Supply only a fixed synthetic environment, never the host environment.
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
    optimization: { minimize: false }, cache: false,
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => compiler.close(() => {
    if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  })));
  async function cssFiles(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? cssFiles(path.join(dir, entry.name)) : entry.name.endsWith('.css') ? [path.join(dir, entry.name)] : []));
      return groups.flat();
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  const devCss = [...await cssFiles(path.join(root, '.next/dev/static/css')), ...await cssFiles(path.join(root, '.next/dev/static/chunks'))];
  const loadedCss = devCss.length ? devCss : [...await cssFiles(path.join(root, '.next/static/css')), ...await cssFiles(path.join(root, '.next/static/chunks'))];
  assert.ok(loadedCss.length, 'Actual compiled CSS required for visual evidence');
  const css = (await Promise.all(loadedCss.map(file => readFile(file, 'utf8')))).join('\n');
  console.log(JSON.stringify({ loadedCss }));
  // Fonts/assets are deliberately not loaded; only already-built CSS may be served.
  const safeCss = css.replace(/@font-face\s*\{[^}]*\}/g, '') + isolatedFrameCss;
  const bundle = await readFile(path.join(scratch, 'bundle.js'));
  server = createServer((req, res) => {
    const asset = req.url === '/bundle.js' ? ['text/javascript', bundle]
      : req.url === '/style.css' ? ['text/css', safeCss]
      : req.url === '/' ? ['text/html', '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'] : null;
    res.writeHead(asset ? 200 : 404, { 'Content-Type': `${asset?.[0] ?? 'text/plain'}; charset=utf-8` }); res.end(asset?.[1] ?? 'Not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { browser = await chromium.launch({ headless: true }); }
  catch (error) { throw new Error(`Installed Chromium unavailable (no install attempted): ${error.message}`); }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(`${origin}/`)) { external.push(url); return route.abort(); }
    return route.continue();
  });
  page = await context.newPage();
  page.on('requestfailed', request => requestErrors.push({ url: request.url(), error: request.failure()?.errorText }));
  page.setDefaultTimeout(2000);
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.clock.install({ time: new Date('2026-11-03T12:00:00Z') });
  await page.goto(origin);
  const inbox = page.locator('#inbox'), opportunity = page.locator('#opportunity');
  const list = inbox.getByRole('list').first();
  const camila = list.getByRole('button', { name: /Camila Rojas/ });
  await expect(camila).toContainText('1 sin leer · demo');
  await inbox.getByRole('button', { name: 'Ver chat', exact: true }).click();
  let chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const composer = () => chat.getByRole('textbox', { name: 'Mensaje de demostración' });
  await expect(camila).not.toContainText('sin leer');
  console.log(`Initial accessibility tree:\n${await inbox.ariaSnapshot()}`);
  assert.equal(await inbox.getByRole('searchbox', { name: 'Buscar conversaciones' }).count(), 1);
  assert.equal(await inbox.locator('> div > div.grid').evaluate(node => getComputedStyle(node).display), 'grid', 'Compiled utility CSS is active');
  const measurements = await captureInitialLayout(page, review);
  await expect(chat.getByText('1 MENSAJE NUEVO', { exact: true })).toBeVisible();
  await expect(composer()).toBeDisabled();
  await chat.getByRole('button', { name: 'Tomar conversación', exact: true }).click();
  await expect(composer()).toBeEnabled();
  await expect(chat.getByText('1 MENSAJE NUEVO', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Agendar visita a terreno', exact: true }).click();
  await expect(composer()).toHaveValue('Agendar visita a terreno');
  const messages = chat.getByRole('list', { name: 'Mensajes de demostración' });
  const before = await messages.getByRole('listitem').count();
  await chat.getByRole('button', { name: 'Enviar demo', exact: true }).click();
  await expect(messages.getByRole('listitem')).toHaveCount(before + 1);
  await expect(messages.getByText('Agendar visita a terreno', { exact: true })).toBeVisible();
  await expect(composer()).toHaveValue('');
  await chat.getByRole('button', { name: 'Devolver al asistente', exact: true }).click();
  await expect(composer()).toBeDisabled();
  await chat.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await expect(chat.getByRole('region', { name: 'Historial del sistema' })).toBeVisible();
  await expect(chat.getByText('Devolviste la conversación al asistente', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Volver al chat', exact: true }).click();
  await expect(chat.getByRole('region', { name: 'Historial del sistema' })).toHaveCount(0);
  await inbox.getByRole('button', { name: 'Abrir oportunidad', exact: true }).click();
  await expect(inbox.getByRole('region', { name: 'Resumen de oportunidad demo' })).toContainText('No corresponde a una venta del CRM.');
  assert.equal(await page.locator('a[href]').count(), 0, 'Demo has no real CRM links');
  await inbox.getByRole('button', { name: 'Más tarde', exact: true }).click();
  await expect(inbox.getByText('Nuevo cliente asignado a ti', { exact: true })).toHaveCount(0);
  for (const [filter, names] of [
    ['Mis chats', ['Valentina Soto']], ['Esperando', []], ['Con asistente', ['Camila Rojas', 'Diego Muñoz']], ['Cerrados', ['Pablo Torres']], ['Todos', ['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Pablo Torres']],
  ]) {
    await inbox.getByRole('tab', { name: filter, exact: true }).click();
    assert.deepEqual(await list.getByRole('button').evaluateAll(nodes => nodes.map(node => node.querySelector('span > span')?.textContent)), names);
  }
  await inbox.getByRole('searchbox', { name: 'Buscar conversaciones' }).fill('Obras del Valle');
  await expect(list.getByRole('button')).toHaveCount(1);
  await expect(list.getByRole('button')).toContainText('Diego Muñoz');
  await inbox.getByRole('searchbox').fill('no matching demo');
  await expect(inbox.getByText('Sin conversaciones', { exact: true })).toBeVisible();
  await inbox.getByRole('searchbox').fill('');
  await list.getByRole('button', { name: /Valentina Soto/ }).click();
  chat = inbox.getByRole('region', { name: 'Chat demo con Valentina Soto' });
  for (const label of ['Enviado desde el teléfono', 'Archivo de demostración', 'Vendedor desde el CRM']) await expect(chat.getByText(label, { exact: true })).toBeVisible();
  await expect(chat.getByLabel('Leído').first()).toBeVisible();
  await expect(chat.getByLabel('Enviado', { exact: true })).toBeVisible();
  await page.clock.fastForward(55 * 60000);
  await expect(inbox.getByText('Tu plazo vence en 5 min', { exact: true })).toBeVisible();
  await expect(composer()).toBeEnabled();
  const warning = inbox.locator('[aria-live="polite"] > div').filter({ hasText: 'Tu plazo vence en 5 min' });
  await warning.getByRole('button', { name: 'Más tarde' }).click();
  await expect(warning).toHaveCount(0);
  await page.clock.fastForward(5 * 60000);
  await expect(inbox.getByText('El asistente retomó una conversación', { exact: true })).toBeVisible();
  await expect(composer()).toBeDisabled();
  await expect(chat.getByText('Plazo vencido · el asistente retomó', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(chat.getByText('4 · Cerrada', { exact: true })).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Tomar conversación', exact: true })).toHaveCount(0);
  await expect(composer()).toBeDisabled();
  await expect(chat.getByText(/Si el cliente vuelve a escribir/)).toBeVisible();
  await expect(opportunity.getByRole('tab', { name: 'Actividad', exact: true })).toHaveAttribute('aria-selected', 'true');
  await opportunity.getByRole('button', { name: 'Existing activity action: 0', exact: true }).click();
  await expect(opportunity.getByRole('tab', { name: 'WhatsApp 0', exact: true })).toContainText('0');
  await opportunity.getByRole('tab', { name: 'WhatsApp 0', exact: true }).click();
  await expect(opportunity.getByText('No hay un chat de WhatsApp vinculado', { exact: true })).toBeVisible();
  await expect(opportunity.getByRole('region', { name: /Chat demo/ })).toHaveCount(0);
  await opportunity.getByRole('button', { name: 'Ver conversación demo sin vincular', exact: true }).click();
  await expect(opportunity.getByRole('tab', { name: 'WhatsApp · demo 0', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(opportunity.getByText('Conversación ficticia de Camila · sin vínculo con esta venta', { exact: true })).toBeVisible();
  await expect(opportunity.getByRole('region', { name: 'Chat demo con Camila Rojas' })).toBeVisible();
  await opportunity.getByRole('button', { name: 'Cerrar oportunidad', exact: true }).click();
  await expect(opportunity.getByLabel('Close callbacks')).toHaveText('closed');
  await opportunity.getByRole('button', { name: 'Switch opportunity', exact: true }).click();
  await expect(opportunity.getByLabel('Opportunity identifier')).toHaveText('2');
  await expect(opportunity.getByRole('tab', { name: 'Actividad', exact: true })).toHaveAttribute('aria-selected', 'true');
  await opportunity.getByRole('button', { name: 'Existing activity action: 1', exact: true }).click();
  await expect(opportunity.getByRole('button', { name: 'Existing activity action: 2', exact: true })).toBeVisible();
  await expect(opportunity.getByRole('tab', { name: 'WhatsApp 0', exact: true })).toContainText('0');
  await opportunity.getByRole('tab', { name: 'WhatsApp 0', exact: true }).click();
  await expect(opportunity.getByText('No hay un chat de WhatsApp vinculado', { exact: true })).toBeVisible();
  console.log('Behavior assertions S1–S6 passed; checking initial layout S7');
  assertLayout(measurements);
  await list.getByRole('button', { name: /Camila Rojas/ }).click();
  await assertMobileNavigation(page);
  assert.deepEqual(errors, [], 'No browser errors');
  assert.deepEqual(external, [], 'No requests outside isolated harness');
  assert.deepEqual(requestErrors, [], 'No failed isolated requests');
  completed = true;
});
