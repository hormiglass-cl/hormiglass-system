import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright';

// Render and hydrate the public customer card with installed TypeScript, without generated files.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/link') return next('next/link.js', context);
    if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier, context.parentURL);
      for (const extension of ['.tsx', '.ts']) if (existsSync(new URL(url.href + extension))) return next(url.href + extension, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
      } }).outputText,
    };
    return next(url, context);
  },
});
const require = createRequire(import.meta.url);
const { InboxFixture } = await import('./fixtures/whatsapp-inbox.tsx');
const fixturePath = path.resolve(import.meta.dirname, 'fixtures/whatsapp-inbox.tsx');
const review = name => path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/${name}`);

async function bundleFixture() {
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  const compiler = webpack({
    mode: 'development', devtool: false, cache: false, entry: fixturePath,
    output: { path: review(''), filename: 'in-memory.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve(import.meta.dirname, 'helpers/whatsapp-header-loader.cjs') }] },
    optimization: { minimize: false },
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
  });
  const files = new Map();
  // Webpack emits exclusively to this in-memory filesystem, never the worktree.
  compiler.outputFileSystem = {
    mkdir: (_path, options, callback) => (callback || options)(null),
    writeFile: (name, data, callback) => { files.set(name, data.toString()); callback(null); },
    stat: (_path, callback) => callback(Object.assign(new Error('Not emitted'), { code: 'ENOENT' })),
  };
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) reject(error);
      else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
      else resolve();
    }));
    return [...files.values()].join('\n');
  } finally { await new Promise(resolve => compiler.close(resolve)); }
}

const { createMockRepository } = await import('../lib/whatsapp/repository.ts');

test('hydrated customer card shows soft header, identity, rows, captured chips, summary toggle and close action', { timeout: 40000 }, async t => {
  const script = await bundleFixture();
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(readFileSync(globals, 'utf8'), { from: globals })).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const chat = createMockRepository(1800000000000).get('demo-1');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  const errors = [], external = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  const markup = renderToString(React.createElement(InboxFixture));
  for (const [width, height] of [[236, 800], [320, 800], [390, 800], [320, 300]]) {
    await page.setViewportSize({ width: width * 2, height: Math.max(height, 400) });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before{transition:none!important}${css}#root{--panes-height:${height}px}</style></head><body><main><div id="root">${markup}</div></main></body></html>`);
    await page.addScriptTag({ content: script });
    await page.locator('output[aria-label="Demo lista"][data-ready="true"]').waitFor();
    const pane = page.locator('[data-pane="details"]');
    assert.equal(await pane.getByRole('heading', { level: 2, name: 'Ficha del cliente', exact: true }).count(), 1);
    assert.equal(await pane.getByRole('heading', { level: 3, name: 'El asistente capturó', exact: true }).count(), 1);
    for (const text of [chat.contact.name, chat.contact.company, 'Teléfono', chat.contact.phone, 'Oportunidad', chat.opportunity.code, ...chat.opportunity.captured, 'Demo · ficha sin vínculo real']) {
      assert.equal(await pane.getByText(text, { exact: true }).count(), 1, text);
    }
    assert.equal(await pane.locator('[href]').count(), 0);

    const open = pane.getByRole('button', { name: 'Abrir oportunidad', exact: true });
    assert.equal(await open.getAttribute('aria-expanded'), 'false');
    assert.equal(await pane.getByRole('region', { name: 'Resumen de oportunidad demo' }).count(), 0);
    const styles = await pane.evaluate(node => {
      const read = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return { background: s.backgroundColor, color: s.color, radius: parseFloat(s.borderTopLeftRadius), width: r.width, height: r.height, top: r.top, bottom: r.bottom }; };
      const section = node.querySelector('section'), header = section.firstElementChild, body = section.lastElementChild;
      const byText = (selector, text) => [...node.querySelectorAll(selector)].find(el => el.textContent.trim() === text);
      const name = byText('p', 'Camila Rojas');
      const textNodes = [...node.querySelectorAll('h2,h3,p,li,button,span,dt,dd')].filter(n => n.textContent.trim() && getComputedStyle(n).position !== 'absolute');
      return { section: read(section), header: read(header), pane: read(node),
        close: read(header.querySelector('button')), closeLabel: header.querySelector('button').getAttribute('aria-label'),
        identity: read(name.parentElement), avatar: read(name.parentElement.querySelector('[aria-hidden]')),
        nameWeight: getComputedStyle(name).fontWeight,
        code: read(byText('dd', 'DEMO-6056')), captured: read(byText('h3', 'El asistente capturó')), chip: read(node.querySelector('li')),
        open: read(byText('button', 'Abrir oportunidad')),
        bodyOverflow: getComputedStyle(body).overflowY, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
        minFont: Math.min(...textNodes.map(n => parseFloat(getComputedStyle(n).fontSize))),
        overflow: section.scrollWidth > section.clientWidth,
        clipped: textNodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent) };
    });
    const listHeader = await page.locator('[data-pane="list"] > section').evaluate(node => node.firstElementChild.getBoundingClientRect().height);

    await open.scrollIntoViewIfNeeded();
    await open.click();
    assert.equal(await open.getAttribute('aria-expanded'), 'true');
    const summary = pane.getByRole('region', { name: 'Resumen de oportunidad demo' });
    assert.equal(await summary.count(), 1);
    assert.ok((await summary.textContent()).includes(chat.opportunity.title));
    await open.click();
    assert.equal(await pane.getByRole('region', { name: 'Resumen de oportunidad demo' }).count(), 0);

    await pane.getByRole('button', { name: 'Cerrar ficha del cliente', exact: true }).click();
    assert.equal(await page.locator('output[aria-label="Fichas cerradas"]').textContent(), '1');
    await page.screenshot({ path: review(`client-details-${width}-${height}.png`) });
    measurements.push({ width, height, listHeader, ...styles });
  }
  console.log(JSON.stringify({ measurements, errors, external }));
  for (const m of measurements) {
    assert.equal(m.header.background, 'rgb(238, 237, 232)', 'Soft muted header bar');
    assert.equal(m.header.color, 'rgb(54, 54, 54)');
    assert.equal(m.header.height, m.listHeader, 'Card and list header bars share their height');
    assert.equal(m.closeLabel, 'Cerrar ficha del cliente');
    assert.ok(m.close.width >= 40 && m.close.height >= 40, 'Close button is a 40px target');
    assert.equal(m.section.radius, 0, 'Edge-to-edge card');
    assert.equal(m.section.height, m.height, 'Card fills its container height');
    assert.equal(m.section.height, m.pane.height);
    assert.equal(m.identity.background, 'rgb(232, 243, 236)', 'Identity block uses the success soft tone');
    assert.deepEqual([m.avatar.width, m.avatar.height], [80, 80]);
    assert.ok(Number(m.nameWeight) >= 600);
    assert.equal(m.code.color, 'rgb(161, 74, 6)', 'Opportunity code uses accent ink');
    assert.equal(m.captured.color, 'rgb(44, 90, 148)', 'Captured heading uses the info tone');
    assert.equal(m.chip.background, 'rgb(234, 241, 250)');
    assert.equal(m.chip.color, 'rgb(44, 90, 148)');
    assert.ok(m.chip.radius >= 10, 'Captured values are pill chips');
    assert.equal(m.open.background, 'rgb(255, 243, 230)', 'Soft accent pill action');
    assert.ok(m.open.radius >= 20 && m.open.height >= 40);
    assert.equal(m.bodyOverflow, 'auto');
    if (m.height === 300) assert.ok(m.scrollHeight > m.clientHeight, 'Short cards keep scrollable content');
    assert.ok(m.minFont >= 11);
    assert.equal(m.overflow, false);
    assert.deepEqual(m.clipped, []);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
