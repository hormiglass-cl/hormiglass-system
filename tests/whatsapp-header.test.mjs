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
const { ChatHeader, ChatStatusBanner } = await import('../components/whatsapp/ChatPrimitives.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const require = createRequire(import.meta.url);

test('ChatHeader accent bar and status banner stay compact and complete at desktop and narrow widths', { timeout: 20000 }, async t => {
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    readFileSync(globals, 'utf8'), { from: globals },
  )).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  const now = 1800000000000;
  const repo = createMockRepository(now);
  const chats = ['assistant', 'waiting', 'closed'].map(state => repo.list().find(chat => chat.state === state));
  repo.claim('demo-1', now);
  chats.push(repo.get('demo-1'));
  const banners = { assistant: 'Tomar chat', waiting: 'Tomar chat', seller: 'Devolver al asistente', closed: null };
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], external = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  for (const width of [600, 480, 320]) {
    await page.setViewportSize({ width, height: 500 });
    for (const chat of chats) {
      const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
        React.createElement(ChatHeader, { chat, onAction: () => {}, onHistory: () => {}, detailsOpen: false, onToggleDetails: () => {} }),
        React.createElement(ChatStatusBanner, { chat, now: now + 14000, onAction: () => {} })));
      await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
      const header = page.getByRole('banner');
      assert.equal(await header.getByRole('heading', { name: chat.contact.name, exact: true }).count(), 1);
      assert.equal(await header.getByText(chat.contact.phone, { exact: true }).count(), 1);
      assert.equal(await header.getByText(chat.opportunity.code, { exact: true }).count(), 1, 'Header must identify the current opportunity');
      assert.equal(await page.getByTitle(`${chat.opportunity.code} · ${chat.opportunity.title}`, { exact: true }).count(), 1, 'Opportunity title must remain available without taking over the header');
      assert.equal(await page.locator('[href]').count(), 0, 'Mock opportunity must not link to a real CRM record');
      for (const label of ['Cerrar', 'Historial', 'Devolver al asistente', 'Tomar chat']) assert.equal(await header.getByRole('button', { name: label, exact: true }).count(), 0, 'Secondary actions live in the menu; claiming lives in the banner');
      assert.deepEqual(await header.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || node.textContent.trim())), ['Ficha del cliente', 'Opciones del chat']);
      assert.equal(await header.getByRole('button', { name: 'Opciones del chat', exact: true }).textContent(), 'Opciones');
      const status = page.getByRole('status');
      const action = banners[chat.state];
      assert.equal(await status.getByRole('button').count(), action ? 1 : 0);
      if (action) assert.equal(await status.getByRole('button', { name: action, exact: true }).count(), 1);
      if (chat.state === 'seller') assert.equal(await status.getByText('59:46', { exact: true }).count(), 1);
      if (chat.state === 'closed') assert.equal(await status.textContent(), 'Conversación cerrada. Si el cliente vuelve a escribir, se reabre con el asistente.');
      const geometry = await header.evaluate(node => {
        const header = node.getBoundingClientRect();
        const banner = document.querySelector('[role="status"]');
        const buttons = [...document.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect();
          return { label: button.getAttribute('aria-label') || button.textContent.trim(), height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const visible = [...document.body.querySelectorAll('h2,p,button,span,strong')].filter(child => getComputedStyle(child).position !== 'absolute');
        return { height: header.height, bottom: header.bottom, width: header.width, buttons,
          background: getComputedStyle(node).backgroundColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--hg-accent').trim(),
          bannerBottom: banner.getBoundingClientRect().bottom,
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
    const maxHeight = m.width === 600 ? 64 : 112;
    assert.ok(m.height <= maxHeight, `${m.state} header at ${m.width}px must be at most ${maxHeight}px, got ${m.height}px`);
    assert.equal(m.background, 'rgb(255, 243, 230)', 'Header is the soft accent bar');
    assert.equal(m.overflow, false);
    assert.deepEqual(m.clipped, []);
    assert.ok(m.minFont >= 11);
    const menu = m.buttons.find(button => button.label === 'Opciones del chat');
    assert.ok(Math.abs(menu.right - (m.width - 12)) <= 1, 'Menu must remain at the right edge');
    for (const button of m.buttons) {
      assert.ok(button.height >= 40, `${button.label} touch target is at least 40px, got ${button.height}`);
      assert.ok(button.left >= 0 && button.right <= m.width, `${button.label} stays inside the viewport`);
    }
    for (const button of m.buttons.filter(button => ['Ficha del cliente', 'Opciones del chat'].includes(button.label))) assert.ok(button.bottom <= m.bottom, 'Header actions stay inside the header');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
