import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

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
const { ConversationDetails, ConversationList } = await import('../components/whatsapp/InboxParts.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const require = createRequire(import.meta.url);

test('ConversationDetails preserves demo content and presents readable customer, opportunity and assistant hierarchy', { timeout: 20000 }, async t => {
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    readFileSync(globals, 'utf8'), { from: globals },
  )).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const repository = createMockRepository(1800000000000);
  const before = repository.list();
  const chat = before[0];
  const html = renderToStaticMarkup(React.createElement(ConversationDetails, { chat }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const external = [], errors = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  for (const width of [236, 320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main>${html}</main></body></html>`);
    assert.equal(await page.getByRole('heading', { name: 'Ficha del cliente', exact: true }).count(), 1);
    for (const heading of ['Cliente', 'Oportunidad', 'Capturado por el asistente']) {
      assert.equal(await page.getByRole('heading', { name: heading, exact: true }).count(), 1);
    }
    for (const text of [chat.contact.name, chat.contact.company, chat.contact.phone, chat.opportunity.code, chat.opportunity.title, ...chat.opportunity.captured, 'Demo · ficha sin vínculo real']) {
      assert.equal(await page.getByText(text, { exact: true }).count(), 1, text);
    }
    const button = page.getByRole('button', { name: 'Abrir oportunidad', exact: true });
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByRole('region', { name: 'Resumen de oportunidad demo' }).count(), 0);
    assert.equal(await page.locator('[href]').count(), 0);
    const styles = await page.evaluate(() => {
      const section = label => [...document.querySelectorAll('h3')].find(h => h.textContent === label).closest('section');
      const read = node => { const s = getComputedStyle(node); return { background: s.backgroundColor, color: s.color, border: s.borderTopColor, radius: s.borderRadius }; };
      const opportunity = section('Oportunidad'), assistant = section('Capturado por el asistente');
      const name = [...document.querySelectorAll('p')].find(p => p.textContent === 'Camila Rojas');
      const button = document.querySelector('button'), bounds = button.getBoundingClientRect();
      const textNodes = [...document.querySelectorAll('h2,h3,p,li,button,span')].filter(n => n.textContent.trim() && getComputedStyle(n).position !== 'absolute');
      return { opportunity: read(opportunity), assistant: read(assistant), nameWeight: getComputedStyle(name).fontWeight,
        code: read([...opportunity.querySelectorAll('p')].find(p => p.textContent === 'DEMO-6056')),
        assistantHeading: read(assistant.querySelector('h3')),
        badgeHeight: assistant.querySelector('[aria-hidden]').getBoundingClientRect().height,
        minFont: Math.min(...textNodes.map(n => parseFloat(getComputedStyle(n).fontSize))),
        overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: textNodes.filter(n => n.scrollWidth > n.clientWidth + 1).map(n => n.textContent),
        buttonWidth: bounds.width, bodyWidth: button.parentElement.clientWidth - 24,
        buttonHeight: bounds.height, buttonLeft: bounds.left, buttonRight: bounds.right };
    });
    await page.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/client-details-${width}.png`), fullPage: true });
    measurements.push({ width, ...styles });
  }
  console.log(JSON.stringify({ measurements, external, errors }));
  for (const m of measurements) {
    assert.equal(m.opportunity.background, 'rgb(255, 243, 230)', 'Opportunity must have the existing soft orange fill');
    assert.equal(m.opportunity.border, 'rgb(248, 207, 160)');
    assert.equal(m.code.color, 'rgb(161, 74, 6)');
    assert.equal(m.assistant.background, 'rgb(234, 241, 250)');
    assert.equal(m.assistant.border, 'rgb(191, 211, 236)');
    assert.equal(m.assistantHeading.color, 'rgb(44, 90, 148)');
    assert.ok(Number(m.nameWeight) >= 600);
    assert.notEqual(m.opportunity.radius, '0px');
    assert.ok(m.badgeHeight <= 22, 'Compact IA badge must remain on one line');
    assert.ok(m.minFont >= 11);
    assert.equal(m.overflow, false);
    assert.deepEqual(m.clipped, []);
    assert.ok(Math.abs(m.buttonWidth - m.bodyWidth) <= 1, 'Action must span the content width');
    assert.ok(m.buttonHeight >= 36 && m.buttonLeft >= 0 && m.buttonRight <= m.width);
  }
  assert.deepEqual(repository.list(), before, 'Rendering must leave demo data unchanged');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});

test('Customer details matches the chat list height and header while retaining short-panel scrolling', { timeout: 20000 }, async t => {
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    readFileSync(globals, 'utf8'), { from: globals },
  )).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const chats = createMockRepository(1800000000000).list();
  const list = renderToStaticMarkup(React.createElement(ConversationList, { chats, onSelect: () => {} }));
  const details = renderToStaticMarkup(React.createElement(ConversationDetails, { chat: chats[0] }));
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  const external = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  for (const height of [600, 300]) {
    // Equal-size containers exercise each public panel's sizing contract, not the authenticated app shell.
    await page.setContent(`<!doctype html><html lang="es"><head><style>${css}</style></head><body><main style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;width:540px;height:${height}px"><div style="min-height:0">${list}</div><div style="min-height:0">${details}</div></main></body></html>`);
    const geometry = await page.evaluate(() => {
      const panel = title => [...document.querySelectorAll('h2')].find(node => node.textContent === title).closest('section');
      const read = node => { const rect = node.getBoundingClientRect(); return { top: rect.top, width: rect.width, height: rect.height, bottom: rect.bottom }; };
      const list = panel('Chats de demostración'), details = panel('Ficha del cliente');
      const body = details.lastElementChild;
      return { list: read(list), details: read(details), listHeader: read(list.firstElementChild), detailsHeader: read(details.firstElementChild), overflowY: getComputedStyle(body).overflowY, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
    });
    console.log(JSON.stringify({ height, geometry }));
    assert.equal(geometry.details.width, geometry.list.width);
    assert.equal(geometry.details.height, geometry.list.height, 'Customer panel must fill the same available height as Chats');
    assert.equal(geometry.details.height, height);
    assert.equal(geometry.details.top, geometry.list.top);
    assert.equal(geometry.detailsHeader.height, geometry.listHeader.height, 'Panel headers must align');
    assert.equal(geometry.overflowY, 'auto');
    const button = page.getByRole('button', { name: 'Abrir oportunidad', exact: true });
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    assert.ok(bounds.y >= geometry.details.top && bounds.y + bounds.height <= geometry.details.bottom);
    if (height === 300) assert.ok(geometry.scrollHeight > geometry.clientHeight, 'Short panels must retain scrollable content');
    await page.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/symmetric-panels-${height}.png`) });
  }
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
});
