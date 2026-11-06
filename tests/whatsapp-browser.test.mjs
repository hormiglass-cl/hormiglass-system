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
  await mkdir(path.join(root, 'node_modules/.cache'), { recursive: true });
  const scratch = await mkdtemp(path.join(root, 'node_modules/.cache/whatsapp-harness-'));
  const review = path.join(root, 'node_modules/.cache/whatsapp-review');
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
  await writeFile(path.join(scratch, 'style.cjs'), `module.exports = function() {}; module.exports.pitch = function(request) { return 'const css = require(' + JSON.stringify('!!' + request) + '); const style = document.createElement("style"); style.textContent = css.toString(); document.head.appendChild(style); module.exports = css.locals;'; };`);
  await writeFile(path.join(scratch, 'css.cjs'), `module.exports = function(source) {
  // Webpack seals its loader context; shadow readonly/inherited properties on a fresh context.
  const context = Object.create(this);
  Object.defineProperties(context, {
    currentTraceSpan: {value: require(${JSON.stringify(require.resolve('next/dist/trace'))}).trace('isolated-css')},
    getOptions: {value: () => ({esModule:false, modules:{localIdentName:'whatsapp__[local]', getLocalIdent:(loaderContext, localIdentName, localName) => 'whatsapp__' + localName}, postcss:async () => ({postcss:require(${JSON.stringify(require.resolve('postcss'))})})})}
  });
  return require(${JSON.stringify(require.resolve('next/dist/build/webpack/loaders/css-loader/src/index.js'))}).default.call(context, source);
};`);
  const stubs = {
    'navigation': `export const useRouter = () => ({push: href => window.dispatchEvent(new CustomEvent('navigate', {detail: href}))}); export const usePathname = () => '/conversaciones'; export const useSearchParams = () => new URLSearchParams();`,
    'link': `import React from 'react'; export default function Link({href, prefetch, children, ...props}) { return <a {...props} href={href} onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', {detail: href})); }}>{children}</a>; }`,
    'auth': `export const useAuth = () => ({currentUser: {id: 'isolated-user', nombre: 'Demo', rol: 'admin'}});`,
    'breadcrumb': `export const useBreadcrumb = () => ({});`,
    'feedback': `export const useToast = () => () => {}; export const useConfirm = () => async () => true;`,
    'supabase': `window.dbWrites = []; window.realFeed = []; window.realCount = 2; window.feedLoading = true;
      const pending = [];
      window.releaseFeed = () => { window.feedLoading = false; pending.splice(0).forEach(resolve => resolve({data: window.realFeed, count: window.realCount})); };
      const client = { from: table => {
        let write = false, head = false; const calls = [];
        const q = new Proxy({}, {get: (_, key) => key === 'then' ? (resolve => {
          if (write) window.dbWrites.push({table, calls});
          if (!write && !head && window.feedLoading) { pending.push(resolve); return; }
          resolve({data: head ? null : window.realFeed, count: window.realCount});
        }) : (...args) => {
          calls.push({method: key, args});
          if (key === 'select') head = args[1]?.head === true;
          if (['insert', 'upsert', 'update', 'delete'].includes(key)) write = true;
          return q;
        }}); return q;
      }, channel: () => ({on() {return this;}, subscribe() {return this;}}), removeChannel: () => {} }; export const createClient = () => client;`,
  };
  for (const [name, source] of Object.entries(stubs)) await writeFile(path.join(scratch, `${name}.tsx`), source);
  await writeFile(path.join(scratch, 'entry.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationProvider } from ${JSON.stringify(path.join(root, 'lib/whatsapp/store.tsx'))};
import ConversacionesPage from ${JSON.stringify(path.join(root, 'app/conversaciones/page.tsx'))};
import { ChatWorkspace } from ${JSON.stringify(path.join(root, 'components/whatsapp/ChatWorkspace.tsx'))};
import { OpportunityActivity } from ${JSON.stringify(path.join(root, 'components/whatsapp/OpportunityActivity.tsx'))};
import { Navbar } from ${JSON.stringify(path.join(root, 'components/Navbar.tsx'))};
import NotificacionesPage from ${JSON.stringify(path.join(root, 'app/notificaciones/page.tsx'))};
function Harness() {
  const [id, setId] = useState(1), [actions, setActions] = useState(0), [closed, setClosed] = useState(false);
  const [route, setRoute] = useState('/conversaciones');
  React.useEffect(() => { const go = event => setRoute(event.detail); window.addEventListener('navigate', go); return () => window.removeEventListener('navigate', go); }, []);
  return <ConversationProvider><div style={{position:'absolute', top:0, width:'100%'}}><Navbar /></div>
    {route === '/notificaciones' ? <main id="center" style={{paddingTop:76}}><NotificacionesPage /></main> : <main id="inbox"><ConversacionesPage /></main>}
    <section id="opportunity"><button onClick={() => setId(id + 1)}>Switch opportunity</button>
      <output aria-label="Opportunity identifier">{id}</output>
      <output aria-label="Close callbacks">{closed ? 'closed' : 'open'}</output>
      <OpportunityActivity key={id} onClose={() => setClosed(true)}>
        <button onClick={() => setActions(actions + 1)}>Existing activity action: {actions}</button>
      </OpportunityActivity>
    </section><div id="narrow-workspace" style={{ display: 'flex', width: 320, height: 420 }}><ChatWorkspace conversationId="demo-2" /></div></ConversationProvider>;
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
    resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.join(root, 'node_modules')], alias: {
      'next/navigation$': path.join(scratch, 'navigation.tsx'), 'next/link$': path.join(scratch, 'link.tsx'),
      [path.join(root, 'lib/context/AuthContext')]: path.join(scratch, 'auth.tsx'),
      [path.join(root, 'lib/context/BreadcrumbContext')]: path.join(scratch, 'breadcrumb.tsx'),
      [path.join(root, 'lib/supabase/client')]: path.join(scratch, 'supabase.tsx'),
      [path.join(root, 'components/ui/feedback')]: path.join(scratch, 'feedback.tsx'),
    } },
    module: { rules: [
      { test: /\.module\.css$/, use: [path.join(scratch, 'style.cjs'), path.join(scratch, 'css.cjs')] },
      { test: /\.tsx?$/, include: [scratch, path.join(root, 'app'), path.join(root, 'components'), path.join(root, 'lib')], use: path.join(scratch, 'loader.cjs') }] },
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
  // Compile the current CRM stylesheet so newly authored utilities are represented,
  // without requesting authenticated routes or relying on a stale dev CSS chunk.
  const postcss = require('postcss');
  const tailwind = require('@tailwindcss/postcss');
  const globals = path.join(root, 'app/globals.css');
  const css = (await postcss([tailwind()]).process(await readFile(globals, 'utf8'), { from: globals })).css;
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
  assert.deepEqual(await list.evaluate(node => [getComputedStyle(node).scrollbarWidth, getComputedStyle(node, '::-webkit-scrollbar').width]), ['auto', '12px'], 'WhatsApp list must use the custom slim WebKit scrollbar');
  await expect(inbox.getByText('Nuevo cliente asignado a ti', { exact: true })).toHaveCount(0);
  const bell = page.getByRole('link', {name:'Notificaciones', exact:true});
  await expect(bell).toHaveAttribute('href', '/notificaciones');
  await expect(bell).toContainText('3');
  await bell.focus(); await page.keyboard.press('Enter');
  const center = page.locator('#center');
  await expect(center.getByText('Cargando bandeja de entrada…')).toBeVisible();
  await expect(center.getByText('Nuevo cliente asignado a ti', {exact:true})).toBeVisible();
  await expect(center.getByText('Camila Rojas', {exact:true})).toBeVisible();
  await expect(bell).toContainText('3');
  await expect(center.getByRole('button', {name:'Marcar y limpiar todo'})).toBeDisabled();
  await center.screenshot({path:path.join(review, 'notification-center-loading.png'), animations:'disabled'});
  await page.evaluate(() => window.releaseFeed());
  await expect(center.getByText('Cargando bandeja de entrada…')).toHaveCount(0);
  await expect(center.getByText('Nuevo cliente asignado a ti', {exact:true})).toBeVisible();
  await expect(center.getByText('Bandeja principal al día', {exact:true})).toHaveCount(0);
  await expect(center.getByRole('button', {name:'Marcar y limpiar todo'})).toBeDisabled();
  await center.screenshot({path:path.join(review, 'notification-center-empty-feed.png'), animations:'disabled'});
  for (const [filter, visible] of [['Recordatorios y Tareas',true], ['Solo no leídas',true], ['Menciones (@)',false], ['Todos los avisos',true]]) {
    await center.getByRole('button', {name:/^Filtro/}).click();
    await center.getByRole('button', {name:filter,exact:true}).click();
    assert.equal(await center.getByText('Nuevo cliente asignado a ti', {exact:true}).count(), visible ? 1 : 0);
  }
  await center.getByPlaceholder('Buscar aviso…').fill('otra persona');
  await expect(center.getByText('Nuevo cliente asignado a ti', {exact:true})).toHaveCount(0);
  await center.getByPlaceholder('Buscar aviso…').fill('Camila');
  await center.getByRole('button', {name:/Otras/}).click();
  await expect(center.getByText('Nuevo cliente asignado a ti', {exact:true})).toHaveCount(0);
  await center.getByRole('button', {name:/Principal/}).click();
  await page.setViewportSize({width:390,height:844});
  await center.getByRole('button', {name:'Ver chat',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(inbox.getByRole('region', {name:'Chat demo con Camila Rojas'})).toBeVisible();
  await expect(inbox.getByRole('heading', {name:'Chats de demostración',exact:true})).toBeHidden();
  await expect(inbox.getByText('1 MENSAJE NUEVO', {exact:true})).toBeVisible();
  await expect(bell).toContainText('2');
  await inbox.getByRole('button', {name:'Volver a la lista'}).click();
  await page.clock.fastForward(1000);
  await expect(inbox.getByRole('heading', {name:'Chats de demostración',exact:true})).toBeVisible();
  await list.getByRole('button', {name:/Camila Rojas/}).click();
  await expect(bell).toContainText('2');
  assert.deepEqual(await page.evaluate(() => window.dbWrites), []);
  await page.setViewportSize({width:1440,height:1000});
  let chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const composer = () => chat.getByRole('textbox', { name: 'Mensaje de demostración' });
  await expect(camila).not.toContainText('sin leer');
  console.log(`Initial accessibility tree:\n${await inbox.ariaSnapshot()}`);
  assert.equal(await inbox.getByRole('searchbox', { name: 'Buscar conversaciones' }).count(), 1);
  assert.equal(await inbox.locator('> div > div.grid').evaluate(node => getComputedStyle(node).display), 'grid', 'Compiled utility CSS is active');
  const measurements = await captureInitialLayout(page, review);
  await expect(chat.getByText(/MENSAJE[S]? NUEVO[S]?/)).toHaveCount(0);
  await expect(composer()).toBeDisabled();
  await chat.getByRole('button', { name: 'Tomar conversación', exact: true }).click();
  await expect(composer()).toBeEnabled();
  await expect(chat.getByText(/MENSAJE[S]? NUEVO[S]?/)).toHaveCount(0);
  await chat.getByRole('button', { name: 'Agendar visita a terreno', exact: true }).click();
  await expect(composer()).toHaveValue('Agendar visita a terreno');
  const messages = chat.getByRole('list', { name: 'Mensajes de demostración' });
  const before = await messages.getByRole('listitem').count();
  await chat.getByRole('button', { name: 'Enviar demo', exact: true }).click();
  await expect(messages.getByRole('listitem')).toHaveCount(before + 1);
  await expect(messages.getByText('Agendar visita a terreno', { exact: true })).toBeVisible();
  await expect(composer()).toHaveValue('');
  await chat.getByRole('button', { name: 'Acciones del chat', exact: true }).click();
  await chat.getByRole('menuitem', { name: 'Devolver al asistente', exact: true }).click();
  await expect(composer()).toBeDisabled();
  await chat.getByRole('button', { name: 'Acciones del chat', exact: true }).click();
  await chat.getByRole('menuitem', { name: 'Historial', exact: true }).click();
  await expect(chat.getByRole('region', { name: 'Historial del sistema' })).toBeVisible();
  await expect(chat.getByText('Devolviste la conversación al asistente', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Volver al chat', exact: true }).click();
  await expect(chat.getByRole('region', { name: 'Historial del sistema' })).toHaveCount(0);
  await inbox.getByRole('button', { name: 'Abrir oportunidad', exact: true }).click();
  await expect(inbox.getByRole('region', { name: 'Resumen de oportunidad demo' })).toContainText('No corresponde a una venta del CRM.');
  assert.equal(await inbox.locator('a[href]').count(), 0, 'Demo has no real CRM links');
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
  await chat.getByRole('button', { name: 'Acciones del chat', exact: true }).click();
  await chat.getByRole('menuitem', { name: 'Cerrar', exact: true }).click();
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
  for (const width of [320, 400]) {
    const narrow = page.locator('#narrow-workspace');
    await narrow.evaluate((element, width) => { element.style.width = `${width}px`; }, width);
    const geometry = await narrow.evaluate(element => {
      const chat = element.firstElementChild, form = chat.querySelector('form');
      const messages = chat.querySelector('ol').parentElement;
      return { width: chat.clientWidth, scrollWidth: chat.scrollWidth, messages: messages.clientHeight, bottom: form.getBoundingClientRect().bottom - element.getBoundingClientRect().top };
    });
    assert.ok(geometry.scrollWidth <= geometry.width && geometry.messages >= 130 && geometry.bottom <= 420, JSON.stringify(geometry));
    await narrow.screenshot({ path: path.join(review, `after-shared-${width}.png`) });
    console.log(JSON.stringify({ sharedWorkspace: { width, ...geometry } }));
  }
  await list.getByRole('button', { name: /Camila Rojas/ }).click();
  await assertMobileNavigation(page);
  // Exercise the actual overflow surfaces, not a fabricated scroll fixture.
  await page.setViewportSize({width:390,height:500});
  const vertical = inbox.getByRole('region', {name:'Chat demo con Camila Rojas'});
  const scroll = vertical.getByRole('list', {name:'Mensajes de demostración'}).locator('..');
  const rail = vertical.getByRole('group', {name:'Respuestas rápidas'});
  for (const [surface, axis] of [[scroll, 'vertical'], [rail, 'horizontal']]) {
    const evidence = await surface.evaluate((node, axis) => {
      const style = getComputedStyle(node);
      const vertical = axis === 'vertical';
      const range = vertical ? node.scrollHeight - node.clientHeight : node.scrollWidth - node.clientWidth;
      node.scrollTo({top:0,left:0,behavior:'instant'});
      const before = vertical ? node.scrollTop : node.scrollLeft;
      node.scrollTo({top:vertical ? range : 0,left:vertical ? 0 : range,behavior:'instant'});
      return {range, before, after:vertical ? node.scrollTop : node.scrollLeft, width:style.scrollbarWidth,
        overflow:vertical ? style.overflowY : style.overflowX, display:getComputedStyle(node, '::-webkit-scrollbar').display};
    }, axis);
    assert.ok(evidence.range > 0 && evidence.after > evidence.before, JSON.stringify({axis,...evidence}));
    assert.equal(evidence.width, 'thin');
    assert.equal(evidence.overflow, 'auto');
    assert.notEqual(evidence.display, 'none');
    console.log(JSON.stringify({scrollbar:{axis,...evidence}}));
  }
  await inbox.screenshot({path:path.join(review, 'inbox-scrollbars.png'), animations:'disabled'});
  await page.emulateMedia({forcedColors:'active'});
  for (const surface of [scroll, rail]) {
    const computed = await surface.evaluate(node => ({color:getComputedStyle(node).scrollbarColor, width:getComputedStyle(node).scrollbarWidth, display:getComputedStyle(node,'::-webkit-scrollbar').display}));
    assert.equal(computed.color, 'auto');
    assert.notEqual(computed.width, 'none');
    assert.notEqual(computed.display, 'none');
    console.log(JSON.stringify({forcedColors:computed}));
  }
  await inbox.screenshot({path:path.join(review, 'inbox-forced-colors.png'), animations:'disabled'});
  await page.emulateMedia({forcedColors:'none'});
  await bell.click();
  await expect(center.getByRole('list', {name:'Asignaciones WhatsApp de demostración'}).getByRole('listitem')).toHaveCount(0);
  await expect(bell).toContainText('2');
  assert.deepEqual(await page.evaluate(() => ({writes:window.dbWrites,count:window.realCount})), {writes:[],count:2});
  // Reload resets only the in-memory mock; discard the exact assignment independently.
  await page.reload();
  await expect(bell).toContainText('3');
  await bell.click();
  await expect(center.getByText('Camila Rojas', {exact:true})).toBeVisible();
  await center.getByRole('button', {name:'Descartar asignación demo de Camila Rojas',exact:true}).click();
  await expect(center.getByRole('list', {name:'Asignaciones WhatsApp de demostración'}).getByRole('listitem')).toHaveCount(0);
  await expect(bell).toContainText('2');
  await page.evaluate(() => window.releaseFeed());
  await expect(center.getByText('Bandeja principal al día', {exact:true})).toBeVisible();
  await expect(center.getByRole('button', {name:'Marcar y limpiar todo'})).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => ({writes:window.dbWrites,count:window.realCount,feed:window.realFeed})), {writes:[],count:2,feed:[]});
  assert.deepEqual(errors, [], 'No browser errors');
  assert.deepEqual(external, [], 'No requests outside isolated harness');
  assert.deepEqual(requestErrors, [], 'No failed isolated requests');
  completed = true;
});
