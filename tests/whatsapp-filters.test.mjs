import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';

// Render the public component with installed TypeScript, without generated files.
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
const { ConversationList } = await import('../components/whatsapp/InboxParts.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const require = createRequire(import.meta.url);

test('ConversationList highlights the active filter and keeps usable horizontal and vertical scrollbars', { timeout: 20000 }, async t => {
  const globals = path.resolve(import.meta.dirname, '../app/globals.css');
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    await readFile(globals, 'utf8'), { from: globals },
  )).css.replace(/@font-face\s*\{[^}]*\}/g, '');
  // Include the actual unlayered WhatsApp stylesheet, as the inbox does.
  const scrollbarPath = path.resolve(import.meta.dirname, '../components/whatsapp/Scrollbars.module.css');
  const scrollbars = require('lightningcss').transform({
    filename: scrollbarPath, code: Buffer.from(await readFile(scrollbarPath, 'utf8')), cssModules: true,
  });
  const chats = createMockRepository(1800000000000).list();
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [], external = [], measurements = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { external.push(route.request().url()); return route.abort(); });
  const html = renderToStaticMarkup(React.createElement(ConversationList, { chats, onSelect: () => {} }));
  for (const width of [248, 320, 390]) {
    await page.setViewportSize({ width, height: 500 });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${scrollbars.code.toString()}</style></head><body><main class="${scrollbars.exports.scope.name}" style="height:300px">${html}</main></body></html>`);
    const rail = page.getByRole('tablist', { name: 'Filtrar conversaciones' });
    assert.deepEqual(await rail.getByRole('tab').allTextContents(), ['Todos', 'Mis chats', 'Esperando', 'Con asistente', 'Cerrados']);
    const frame = await rail.getByRole('tab', { selected: true }).evaluate(node => {
      const style = getComputedStyle(node);
      return {
        widths: ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Width`]),
        colors: ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Color`]),
        radius: parseFloat(style.borderTopLeftRadius),
        background: style.backgroundColor,
        inactiveBackgrounds: [...node.parentElement.querySelectorAll('[role="tab"][aria-selected="false"]')].map(tab => getComputedStyle(tab).backgroundColor),
      };
    });
    await rail.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/filter-selected-${width}.png`) });
    await rail.getByRole('tab', { name: 'Con asistente', exact: true }).focus();
    await page.keyboard.press('Tab');
    const data = await rail.evaluate(node => {
      const style = getComputedStyle(node), last = node.lastElementChild;
      const bounds = node.getBoundingClientRect(), end = last.getBoundingClientRect();
      const focused = document.activeElement === last;
      const focusScroll = node.scrollLeft;
      node.scrollLeft = 0;
      const resetScroll = node.scrollLeft;
      node.scrollLeft = node.scrollWidth;
      const scrolledEnd = last.getBoundingClientRect();
      return { width: innerWidth, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
        overflowX: style.overflowX, overflowY: style.overflowY, scrollbarWidth: style.scrollbarWidth,
        webkitDisplay: getComputedStyle(node, '::-webkit-scrollbar').display,
        scrollbarHeight: getComputedStyle(node, '::-webkit-scrollbar').height,
        scrollbarColor: style.scrollbarColor,
        thumbBorderTop: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderTopWidth,
        thumbBorderBottom: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderBottomWidth,
        thumbClip: getComputedStyle(node, '::-webkit-scrollbar-thumb').backgroundClip,
        paintedThickness: node.offsetHeight - node.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
        scrollbarVerticalWidth: getComputedStyle(node, '::-webkit-scrollbar').width,
        focused, focusScroll, lastVisible: end.left >= bounds.left - 1 && end.right <= bounds.right + 1,
        resetScroll, endScroll: node.scrollLeft,
        lastReachable: scrolledEnd.left >= bounds.left - 1 && scrolledEnd.right <= bounds.right + 1 };
    });
    const grab = await rail.evaluate(node => {
      node.scrollLeft = 0;
      const rect = node.getBoundingClientRect();
      return { x: rect.left + node.clientWidth * (node.clientWidth / node.scrollWidth) / 2, y: rect.bottom - 3 };
    });
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const dragScroll = await rail.evaluate(node => node.scrollLeft);
    const listNode = page.getByRole('list');
    const list = await listNode.evaluate(node => {
      const style = getComputedStyle(node);
      node.scrollTop = node.scrollHeight;
      return { overflowY: style.overflowY, scrollbarWidth: style.scrollbarWidth,
        scrollbarColor: style.scrollbarColor,
        scrollbarWidthPx: getComputedStyle(node, '::-webkit-scrollbar').width,
        thumbBorderLeft: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderLeftWidth,
        thumbBorderRight: getComputedStyle(node, '::-webkit-scrollbar-thumb').borderRightWidth,
        thumbClip: getComputedStyle(node, '::-webkit-scrollbar-thumb').backgroundClip,
        webkitDisplay: getComputedStyle(node, '::-webkit-scrollbar').display,
        clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop };
    });
    const listGrab = await listNode.evaluate(node => {
      node.scrollTop = 0;
      const rect = node.getBoundingClientRect();
      return { x: rect.right - 3, y: rect.top + node.clientHeight * (node.clientHeight / node.scrollHeight) / 2 };
    });
    await page.mouse.move(listGrab.x, listGrab.y);
    await page.mouse.down();
    await page.mouse.move(listGrab.x, listGrab.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    list.dragScroll = await listNode.evaluate(node => node.scrollTop);
    await listNode.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/chat-list-${width}.png`) });
    await rail.screenshot({ path: path.resolve(import.meta.dirname, `../node_modules/.cache/whatsapp-review/filter-rail-${width}.png`) });
    measurements.push({ ...data, frame, dragScroll, list });
  }
  console.log(JSON.stringify({ measurements, errors, external }));
  for (const m of measurements) {
    assert.equal(m.frame.background, 'rgb(255, 243, 230)', 'Active filter must use the soft orange highlight');
    assert.deepEqual(m.frame.widths, ['1px', '1px', '1px', '1px'], 'Transparent borders must preserve button spacing');
    assert.ok(m.frame.radius > 0, 'Highlighted filter must keep rounded corners');
    assert.ok(m.frame.colors.every(color => color === 'rgba(0, 0, 0, 0)' || color === 'transparent'), 'Active filter must not show an outline or underline');
    assert.ok(m.frame.inactiveBackgrounds.every(color => color === 'rgba(0, 0, 0, 0)' || color === 'transparent'), 'Inactive filters must not be highlighted');
    assert.equal(m.scrollbarWidth, 'auto', `Custom horizontal scrollbar must remain visible at ${m.width}px`);
    assert.notEqual(m.webkitDisplay, 'none');
    assert.equal(m.scrollbarColor, 'auto', 'Native scrollbar coloring must not override custom scrollbar sizing');
    assert.equal(m.scrollbarHeight, '12px', 'Scrollbar must have a usable 12px grab area');
    assert.equal(m.thumbBorderTop, '5px');
    assert.equal(m.thumbBorderBottom, '5px');
    assert.equal(m.thumbClip, 'padding-box', 'Only the 2px center of the thumb should be painted');
    assert.ok(m.dragScroll > 0, 'Dragging the transparent grab area must move the filters');
    assert.equal(m.scrollbarVerticalWidth, '0px');
    assert.equal(m.overflowX, 'auto');
    assert.equal(m.overflowY, 'hidden', 'Only the filter row vertical scrollbar must be removed');
    assert.ok(m.scrollWidth > m.clientWidth);
    // Native focus can leave the last tab partially clipped before this change too.
    assert.ok(m.focused, 'Keyboard navigation must still reach Cerrados');
    assert.ok(m.lastReachable, 'Horizontal scrolling must fully reveal Cerrados');
    assert.equal(m.resetScroll, 0);
    assert.ok(m.endScroll > 0, 'Horizontal scrolling must remain enabled');
    assert.equal(m.list.overflowY, 'auto');
    assert.equal(m.list.scrollbarWidth, 'auto');
    assert.equal(m.list.scrollbarColor, 'auto');
    assert.equal(m.list.scrollbarWidthPx, '12px', 'Chat list scrollbar must have the same usable grab area');
    assert.equal(m.list.thumbBorderLeft, '5px');
    assert.equal(m.list.thumbBorderRight, '5px');
    assert.equal(m.list.thumbClip, 'padding-box', 'Vertical thumb must paint only a 2px line');
    assert.ok(m.list.dragScroll > 0, 'Dragging the vertical scrollbar transparent margin must scroll the chats');
    assert.notEqual(m.list.webkitDisplay, 'none');
    assert.ok(m.list.scrollHeight > m.list.clientHeight && m.list.scrollTop > 0, 'Conversation list must still scroll');
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
