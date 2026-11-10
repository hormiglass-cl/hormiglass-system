import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright';

// Render and hydrate the public inbox with installed TypeScript, without generated files.
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

test('hydrated chat list groups chats, searches across sections, toggles closed chats and keeps a themed scrolling list', { timeout: 40000 }, async t => {
  const script = await bundleFixture();
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(readFileSync(globals, 'utf8'), { from: globals })).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  // Include the actual unlayered WhatsApp stylesheet, as the inbox does.
  const scrollbarPath = path.resolve(import.meta.dirname, '../components/whatsapp/Scrollbars.module.css');
  const scrollbars = require('lightningcss').transform({ filename: scrollbarPath, code: readFileSync(scrollbarPath), cssModules: true });
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  const errors = [], external = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  const markup = renderToString(React.createElement(InboxFixture));
  for (const width of [248, 320, 390]) {
    await page.setViewportSize({ width: width * 2, height: 500 });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before{transition:none!important}${css}\n${scrollbars.code.toString()}#root{--panes-height:300px}</style></head><body><main class="${scrollbars.exports.scope.name}"><div id="root">${markup}</div></main></body></html>`);
    await page.addScriptTag({ content: script });
    await page.locator('output[aria-label="Demo lista"][data-ready="true"]').waitFor();
    const pane = page.locator('[data-pane="list"]');
    const sections = () => pane.getByRole('heading', { level: 3 }).allTextContents();
    assert.equal(await pane.getByRole('heading', { level: 2, name: 'Chats', exact: true }).count(), 1);
    assert.deepEqual((await sections()).map(s => s.replace(/\s+/g, ' ').trim()), ['Te esperan 1', 'Atendiendo tú 1', 'Con el asistente 1']);

    // Closed chats stay behind the toggle.
    const toggle = pane.getByRole('button', { name: 'Ver chats cerrados (1)' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await pane.getByRole('button', { name: /Pablo Torres/ }).count(), 0);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(await pane.getByRole('button', { name: /Pablo Torres/ }).count(), 1);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await pane.getByRole('button', { name: /Pablo Torres/ }).count(), 0);

    // Search filters across every section and the closed group.
    const search = pane.getByRole('searchbox', { name: 'Buscar conversaciones' });
    assert.equal(await search.getAttribute('placeholder'), 'Buscar nombre, teléfono o empresa');
    await search.fill('arquitectura');
    assert.deepEqual((await sections()).map(s => s.replace(/\s+/g, ' ').trim()), ['Atendiendo tú 1']);
    assert.equal(await pane.getByRole('button', { name: 'Ver chats cerrados (1)' }).count(), 0);
    await search.fill('0104');
    assert.deepEqual(await sections(), []);
    assert.equal(await pane.getByRole('button', { name: 'Ver chats cerrados (1)' }).count(), 1);
    await search.fill('sin coincidencias');
    assert.equal(await pane.getByText('Sin conversaciones', { exact: true }).count(), 1);
    await search.fill('');
    assert.equal((await sections()).length, 3);

    // Selecting a row: soft accent fill and inset bar (success while attending).
    const valentina = pane.getByRole('button', { name: /Valentina Soto/ });
    await valentina.click();
    assert.equal(await valentina.getAttribute('aria-pressed'), 'true');
    assert.equal(await pane.getByRole('button', { name: /Camila Rojas/ }).getAttribute('aria-pressed'), 'false');
    const rows = await pane.evaluate(node => {
      const read = button => { const bar = getComputedStyle(button, '::before'); const rect = button.getBoundingClientRect(); return { background: getComputedStyle(button).backgroundColor, bar: bar.backgroundColor, barWidth: bar.width, height: rect.height }; };
      const buttons = [...node.querySelectorAll('button[aria-pressed]')];
      const selected = buttons.find(b => b.getAttribute('aria-pressed') === 'true');
      const other = buttons.find(b => b.getAttribute('aria-pressed') === 'false' && b.offsetParent);
      const avatar = selected.querySelector('[aria-hidden]').getBoundingClientRect();
      return { selected: read(selected), other: read(other), avatar: [avatar.width, avatar.height] };
    });
    await valentina.screenshot({ path: review(`chat-row-selected-${width}.png`) });
    const camila = pane.getByRole('button', { name: /Camila Rojas/ });
    await camila.click();
    const accentBar = await camila.evaluate(node => getComputedStyle(node, '::before').backgroundColor);

    const layout = await pane.evaluate(node => {
      const section = node.querySelector('section'), header = section.firstElementChild;
      const style = getComputedStyle(section), input = node.querySelector('input[type="search"]');
      const textNodes = [...node.querySelectorAll('h2,h3,p,span,time,button,input')].filter(n => n.textContent.trim() || n.tagName === 'INPUT');
      return { radius: style.borderTopLeftRadius, borderRight: style.borderRightWidth, borderLeft: style.borderLeftWidth,
        background: style.backgroundColor, headerHeight: header.getBoundingClientRect().height,
        sectionHeight: section.getBoundingClientRect().height, paneHeight: node.getBoundingClientRect().height,
        searchRadius: parseFloat(getComputedStyle(input).borderTopLeftRadius), searchHeight: input.getBoundingClientRect().height,
        toggleHeight: [...node.querySelectorAll('button[aria-expanded]')][0].getBoundingClientRect().height,
        minFont: Math.min(...textNodes.map(n => parseFloat(getComputedStyle(n).fontSize))),
        overflow: section.scrollWidth > section.clientWidth };
    });

    // The list scrolls inside the column with the themed 2px-in-12px scrollbar.
    const listNode = pane.locator('[data-conversation-list]');
    const list = await listNode.evaluate(node => {
      const style = getComputedStyle(node);
      node.scrollTop = node.scrollHeight;
      return { overflowY: style.overflowY, scrollbarWidth: style.scrollbarWidth, scrollbarColor: style.scrollbarColor,
        scrollbarWidthPx: getComputedStyle(node, '::-webkit-scrollbar').width,
        thumbBorderLeft: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderLeftWidth,
        thumbBorderRight: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderRightWidth,
        thumbClip: getComputedStyle(node, '::-webkit-scrollbar-thumb').backgroundClip,
        clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop };
    });
    const grab = await listNode.evaluate(node => {
      node.scrollTop = 0;
      const rect = node.getBoundingClientRect();
      return { x: rect.right - 3, y: rect.top + node.clientHeight * (node.clientHeight / node.scrollHeight) / 2 };
    });
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x, grab.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    list.dragScroll = await listNode.evaluate(node => node.scrollTop);
    await pane.screenshot({ path: review(`chat-list-${width}.png`) });
    measurements.push({ width, rows, accentBar, layout, list });
  }
  console.log(JSON.stringify({ measurements, errors, external }));
  for (const m of measurements) {
    assert.equal(m.rows.selected.background, 'rgb(255, 243, 230)', 'Selected row uses the soft accent fill');
    assert.equal(m.rows.selected.bar, 'rgb(30, 107, 69)', 'Attending row shows the success bar');
    assert.equal(m.rows.selected.barWidth, '4px');
    assert.equal(m.accentBar, 'rgb(247, 147, 31)', 'Other selected rows show the accent bar');
    assert.equal(m.rows.other.background, 'rgb(255, 255, 255)');
    assert.ok(m.rows.selected.height >= 40 && m.rows.other.height >= 40, 'Rows are comfortable touch targets');
    assert.deepEqual(m.rows.avatar, [46, 46]);
    assert.equal(m.layout.radius, '0px', 'Edge-to-edge column without a rounded card');
    assert.equal(m.layout.borderLeft, '0px');
    assert.equal(m.layout.borderRight, '1px');
    assert.equal(m.layout.background, 'rgb(255, 255, 255)');
    assert.equal(m.layout.headerHeight, 60);
    assert.equal(m.layout.sectionHeight, m.layout.paneHeight, 'List fills its container height');
    assert.ok(m.layout.searchRadius >= 20 && m.layout.searchHeight >= 40, 'Pill search with a 40px target');
    assert.ok(m.layout.toggleHeight >= 40);
    assert.ok(m.layout.minFont >= 11);
    assert.equal(m.layout.overflow, false);
    assert.equal(m.list.overflowY, 'auto');
    assert.equal(m.list.scrollbarWidth, 'auto');
    assert.equal(m.list.scrollbarColor, 'auto');
    assert.equal(m.list.scrollbarWidthPx, '12px', 'Chat list scrollbar keeps the usable grab area');
    assert.equal(m.list.thumbBorderLeft, '5px');
    assert.equal(m.list.thumbBorderRight, '5px');
    assert.equal(m.list.thumbClip, 'padding-box');
    assert.ok(m.list.scrollHeight > m.list.clientHeight && m.list.scrollTop > 0, 'Conversation list must still scroll');
    assert.ok(m.list.dragScroll > 0, 'Dragging the scrollbar margin must scroll the chats');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
