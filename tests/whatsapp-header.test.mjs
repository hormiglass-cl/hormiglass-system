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
const { ChatHeader } = await import('../components/whatsapp/ChatPrimitives.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const require = createRequire(import.meta.url);

test('ChatHeader stays compact without losing contact, state, timer or actions at desktop and narrow widths', { timeout: 20000 }, async t => {
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    readFileSync(globals, 'utf8'), { from: globals },
  )).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const now = 1800000000000;
  const repo = createMockRepository(now);
  const chats = ['assistant', 'waiting', 'closed'].map(state => repo.list().find(chat => chat.state === state));
  repo.claim('demo-1', now);
  chats.push(repo.get('demo-1'));
  const labels = { assistant: '1 · Con asistente', waiting: '2 · Esperando vendedor', seller: '3 · Atendiendo tú', closed: '4 · Cerrada' };
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], external = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  for (const width of [600, 480, 320]) {
    await page.setViewportSize({ width, height: 500 });
    for (const chat of chats) {
      const html = renderToStaticMarkup(React.createElement(ChatHeader, { chat, now: now + 14000, onAction: () => {}, onHistory: () => {} }));
      await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
      assert.equal(await page.getByRole('heading', { name: chat.contact.name, exact: true }).count(), 1);
      assert.equal(await page.getByText(chat.contact.phone, { exact: true }).count(), 1);
      assert.equal(await page.getByText(chat.opportunity.code, { exact: true }).count(), 1, 'Header must identify the current opportunity');
      assert.equal(await page.getByTitle(`${chat.opportunity.code} · ${chat.opportunity.title}`, { exact: true }).count(), 1, 'Opportunity title must remain available without taking over the header');
      assert.equal(await page.locator('[href]').count(), 0, 'Mock opportunity must not link to a real CRM record');
      assert.equal(await page.getByText(labels[chat.state], { exact: true }).count(), 1);
      const actions = ['Acciones del chat', ...(['assistant', 'waiting'].includes(chat.state) ? ['Tomar conversación'] : [])];
      for (const label of ['Cerrar', 'Ver historial', 'Devolver al asistente']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 0, 'Secondary actions belong in the closed menu');
      assert.equal(await page.getByRole('button').count(), actions.length);
      for (const action of actions) assert.equal(await page.getByRole('button', { name: action, exact: true }).count(), 1);
      if (chat.state === 'seller') assert.equal(await page.getByText('59:46', { exact: true }).count(), 1);
      if (chat.state === 'closed') assert.equal(await page.getByText('Si el cliente vuelve a escribir, la conversación se reabre con el asistente y queda en la misma ficha.', { exact: true }).count(), 1);
      const geometry = await page.getByRole('banner').evaluate(node => {
        const header = node.getBoundingClientRect();
        const buttons = [...node.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label') || button.textContent.trim(), height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const visible = [...node.querySelectorAll('h2,p,button,span')].filter(child => getComputedStyle(child).position !== 'absolute');
        const identity = node.querySelector('h2').parentElement.getBoundingClientRect();
        return { height: header.height, bottom: header.bottom, width: header.width, buttons,
          identityLeft: identity.left, identityTop: identity.top, identityBottom: identity.bottom,
          minFont: Math.min(...visible.map(child => parseFloat(getComputedStyle(child).fontSize))),
          overflow: document.documentElement.scrollWidth > innerWidth,
          clipped: visible.filter(child => child.scrollWidth > child.clientWidth + 1).map(child => child.textContent) };
      });
      if (chat.state === 'seller' || chat.state === 'waiting') await page.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/chat-header-${chat.state}-${width}.png`) });
      measurements.push({ state: chat.state, width, ...geometry });
    }
  }
  console.log(JSON.stringify({ measurements, errors, external }));
  for (const m of measurements) {
    const maxHeight = m.width === 600 ? 64 : 96;
    assert.ok(m.height <= maxHeight, `${m.state} header at ${m.width}px must be at most ${maxHeight}px, got ${m.height}px`);
    assert.equal(m.overflow, false);
    assert.deepEqual(m.clipped, []);
    assert.ok(m.minFont >= 11);
    const claim = m.buttons.find(button => button.label === 'Tomar conversación');
    if (m.state === 'assistant' || m.state === 'waiting') {
      assert.ok(claim, 'Primary claim stays visible');
      if (m.width === 600) assert.ok(claim.top < m.identityBottom && claim.bottom > m.identityTop, 'Wide header must have a single toolbar row');
    } else assert.equal(claim, undefined, 'Tomar chat must disappear after claiming or closing');
    const menu = m.buttons.find(button => button.label === 'Acciones del chat');
    assert.ok(Math.abs(menu.right - (m.width - 12)) <= 1, 'Menu must remain at the right edge');
    for (const button of m.buttons) assert.ok(button.height >= 28 && button.left >= 0 && button.right <= m.width && button.bottom <= m.bottom, 'Actions must remain usable and fully inside the header');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
