import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright';

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
const { HeaderFixture } = await import('./fixtures/whatsapp-header-menu.tsx');

async function bundleFixture() {
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  const compiler = webpack({
    mode: 'development', devtool: false, cache: false,
    entry: path.resolve('tests/fixtures/whatsapp-header-menu.tsx'),
    output: { path: path.resolve('node_modules/.cache/whatsapp-review'), filename: 'in-memory.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'] },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.resolve('tests/helpers/whatsapp-header-loader.cjs') }] },
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

test('hydrated public header menu preserves actions, keyboard focus and unclipped placement', { timeout: 25000 }, async t => {
  const script = await bundleFixture();
  const globals = path.resolve('app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(readFileSync(globals, 'utf8'), { from: globals })).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  const errors = [], external = [], placements = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => console.log(JSON.stringify({ errors, external })));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  for (const width of [600, 480, 320]) {
    await page.setViewportSize({ width, height: 300 });
    await page.setContent(`<!doctype html><html lang="es"><head><style>${css}</style></head><body><div id="root">${renderToString(React.createElement(HeaderFixture))}</div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.locator('output[aria-label="Demo lista"][data-ready="true"]').waitFor();
    const trigger = page.getByRole('button', { name: 'Acciones del chat', exact: true });
    const claim = page.getByRole('button', { name: 'Tomar conversación', exact: true });
    assert.equal(await claim.count(), 1);
    assert.equal(await page.getByRole('menuitem').count(), 0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menu').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('menuitem', { name: 'Cerrar', exact: true }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'Escape restores usable trigger focus');
    await trigger.click();
    await page.getByRole('button', { name: 'Fuera del chat' }).click();
    assert.equal(await page.getByRole('menu').count(), 0);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Historial', exact: true }).click();
    assert.equal(await page.getByRole('status', { name: 'Historial abierto' }).textContent(), '1');
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, 'Action restores trigger focus');
    await claim.click();
    assert.equal(await claim.count(), 0);
    assert.equal(await page.getByText('3 · Atendiendo tú', { exact: true }).count(), 1);
    assert.equal(await page.getByText('59:46', { exact: true }).count(), 1);
    await trigger.click();
    assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Devolver al asistente', 'Cerrar', 'Historial']);
    const placement = await page.getByRole('menu').evaluate(menu => {
      const rect = menu.getBoundingClientRect();
      const container = document.querySelector('section').getBoundingClientRect();
      const items = [...menu.querySelectorAll('button')].map(item => {
        const r = item.getBoundingClientRect();
        return { height: r.height, reachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === item };
      });
      return { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top, containerBottom: container.bottom, items, width: innerWidth };
    });
    placements.push(placement);
    assert.ok(placement.left >= 0 && placement.right <= width && placement.bottom <= placement.containerBottom && placement.top >= 0);
    for (const item of placement.items) assert.ok(item.height >= 28 && item.reachable, 'Menu items must not be clipped by overflow-hidden chat');
    if (width !== 480) await page.screenshot({ path: path.resolve(`node_modules/.cache/whatsapp-review/chat-header-menu-${width}.png`) });
    await page.getByRole('menuitem', { name: 'Devolver al asistente', exact: true }).click();
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await claim.count(), 1);
    assert.equal(await page.getByText('1 · Con asistente', { exact: true }).count(), 1);
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Cerrar', exact: true }).click();
    assert.equal(await claim.count(), 0);
    assert.equal(await page.getByText('4 · Cerrada', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('menu').count(), 0);
    await trigger.click();
    assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['Historial']);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('menu').count(), 0);
  }
  console.log(JSON.stringify({ placements, errors, external }));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
