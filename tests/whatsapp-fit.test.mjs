import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

// Exercise the public presentational component, not a markup/style replica.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/link') return next('next/link.js', context);
    if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(specifier, context.parentURL);
      for (const extension of ['.tsx', '.ts']) {
        if (existsSync(new URL(url.href + extension))) return next(url.href + extension, context);
      }
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
const { ChatThread } = await import('../components/whatsapp/ChatPrimitives.tsx');
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const texts = ['Sí', 'Perfecto, coordinamos la visita mañana por la tarde.', 'Primera línea\nSegunda línea', 'W'.repeat(180), 'Cotización OP-2026-6056.pdf · 340 KB', 'Jesus tomó la conversación'];
const kinds = ['customer', 'seller', 'phone', 'assistant', 'file', 'event'];
const messages = texts.map((text, i) => ({ id: `fit-${i}`, kind: kinds[i], text, at: 1800000000000, ...(i === 1 ? {delivery: 'read'} : i === 2 ? {delivery:'sent'} : {}) }));

test('public ChatThread fits short text, wraps exact content and preserves metadata at desktop and 320/390px', {timeout: 20000}, async t => {
  const globals = path.join(root, 'app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile(globals, 'utf8'), {from:globals})).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const review = path.join(root, 'node_modules/.cache/whatsapp-review');
  await mkdir(review, {recursive:true});
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main style="max-width:480px;margin:auto">${renderToStaticMarkup(React.createElement(ChatThread, {messages}))}</main></body></html>`);
  const measurements = [];
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({width,height:900});
    const data = await page.getByRole('list', {name:'Mensajes de demostración'}).evaluate(list => {
      const items = [...list.children];
      const bubble = item => [...item.querySelectorAll('p'), item].find(node => getComputedStyle(node).borderTopStyle === 'solid' && parseFloat(getComputedStyle(node).borderTopWidth) > 0);
      const rect = node => ({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height});
      const short = bubble(items[0]), longer = bubble(items[1]);
      const range = document.createRange(); range.selectNodeContents(items[0].children[1]);
      return { viewport:innerWidth, scroll:document.documentElement.scrollWidth,
        short:rect(short), longer:rect(longer), textWidth:range.getBoundingClientRect().width,
        texts:items.map(item => item.children[1].textContent),
        multiline:rect(items[2].children[1]), longWord:rect(items[3].children[1]),
        overflowing:items.flatMap(item => [...item.querySelectorAll('p')]).filter(node => getComputedStyle(node).position !== 'absolute' && node.scrollWidth > node.clientWidth + 1).map(node => node.textContent),
        metadata:items.flatMap(item => [item.firstElementChild, item.lastElementChild]).map(node => parseFloat(getComputedStyle(node).fontSize)),
      };
    });
    measurements.push(data);
    await page.screenshot({path:path.join(review, `fit-${process.env.WHATSAPP_FIT_PHASE === 'before' ? 'before' : 'after'}-${width}.png`), fullPage:true});
  }
  console.log(JSON.stringify({measurements, errors, external}));
  for (const m of measurements) {
    assert.ok(m.short.width <= m.textWidth + 26, `Short bubble must hug message, not author/date: ${JSON.stringify(m)}`);
    assert.ok(m.short.width < m.longer.width / 2);
    assert.deepEqual(m.texts, texts.map((text, i) => i === 4 ? `▤ ${text}` : text));
    assert.ok(m.multiline.height >= 40 && m.longWord.height >= 40);
    assert.ok(m.scroll <= m.viewport, 'No mobile horizontal overflow');
    assert.deepEqual(m.overflowing, []);
    assert.ok(m.metadata.every(size => size >= 11));
  }
  assert.equal(await page.getByLabel('Leído', {exact:true}).textContent(), '✓✓');
  assert.equal(await page.getByLabel('Enviado', {exact:true}).textContent(), '✓');
  for (const author of ['Cliente', 'Tú', 'Tú · desde el teléfono', 'Asistente', 'Archivo de demostración']) assert.equal(await page.getByText(author, {exact:true}).count(), 1, author);
  for (const old of ['Vendedor desde el CRM', 'Enviado desde el teléfono']) assert.equal(await page.getByText(old, {exact:true}).count(), 0, old);
  assert.equal(await page.locator('time').count(), messages.length);
  assert.equal(await page.getByText('Vista de ejemplo · archivo no disponible para descargar', {exact:true}).count(), 1);
  assert.equal(await page.locator('a').count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
