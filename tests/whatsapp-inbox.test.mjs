import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the public inbox components with installed TypeScript, without generated files.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/link') return next('next/link.js', context);
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) {
        for (const extension of ['.tsx', '.ts']) {
          if (existsSync(new URL(url.href + extension))) return next(url.href + extension, context);
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.module.css')) return { format: 'module', shortCircuit: true, source: 'export default {scope:"ssr-scroll-scope"};' };
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    }
    return next(url, context);
  },
});

const { ConversationList, ConversationDetails, NoticeBanners, DemoNotice, DEMO_NOTICE_TEXT } = await import('../components/whatsapp/InboxParts.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const { formatListTimestamp } = await import('../lib/whatsapp/format.ts');
const NOW = 1800000000000;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const list = props => render(ConversationList, { chats: createMockRepository(NOW).list(), onSelect: () => {}, now: NOW, ...props });
const text = html => html.replace(/<[^>]+>/g, '');
/** Markup of the row button that holds the given contact name. */
const row = (html, name) => html.match(new RegExp(`<button[^>]*aria-pressed[^>]*>(?:(?!</button>)[\\s\\S])*?${name}[\\s\\S]*?</button>`))?.[0] ?? '';
const tabs = html => [...html.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map(match => ({ label: text(match[1]).replace(/\s+/g, ' ').trim(), markup: match[0] }));
const order = html => [...html.matchAll(/<button[^>]*aria-pressed[^>]*>([\s\S]*?)<\/button>/g)].map(match => ['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Pablo Torres'].find(name => match[1].includes(name)));

test('chat list shows the Chats header, demo pill, pill search and the filter tablist', () => {
  const html = list();
  assert.match(html, /<h2[^>]*>Chats<\/h2>/);
  assert.match(html, />Demo</);
  const search = html.match(/<input[^>]*type="search"[^>]*>/)?.[0] ?? '';
  assert.match(search, /aria-label="Buscar conversaciones"/);
  assert.match(search, /placeholder="Buscar nombre, teléfono o empresa"/);
  assert.match(search, /rounded-full/);
  assert.match(html, /<div[^>]*role="tablist"[^>]*aria-label="Filtrar chats"|<div[^>]*aria-label="Filtrar chats"[^>]*role="tablist"/);
  assert.deepEqual(tabs(html).map(tab => tab.label), ['Todos', 'No leídos', 'Esperando 1', 'Míos']);
  const [all, ...others] = tabs(html);
  assert.match(all.markup, /aria-selected="true"/);
  assert.ok(all.markup.includes('bg-accent-soft') && all.markup.includes('text-accent-ink'), 'Selected tab uses the soft accent');
  for (const tab of others) {
    assert.match(tab.markup, /aria-selected="false"/);
    assert.ok(tab.markup.includes('border-line') && !tab.markup.includes('bg-accent-soft'), `${tab.label} is outlined`);
  }
});

test('the waiting tab omits its count when no chat is waiting', () => {
  const chats = createMockRepository(NOW).list().filter(chat => chat.state !== 'waiting');
  assert.deepEqual(tabs(list({ chats })).map(tab => tab.label), ['Todos', 'No leídos', 'Esperando', 'Míos']);
});

test('chat list is one flat list ordered waiting, seller, assistant, closed without sections or toggle', () => {
  const html = list();
  assert.deepEqual(order(html), ['Camila Rojas', 'Valentina Soto', 'Diego Muñoz', 'Pablo Torres']);
  assert.ok(!/<h3/.test(html), 'No group headings');
  assert.ok(!html.includes('Ver chats cerrados'));
  assert.ok(!html.includes('hidden=""'), 'Closed chats are not hidden');
  assert.equal(html.match(/<ul/g).length, 1, 'One flat list');
  // Stable within a state: input order is kept.
  const chats = createMockRepository(NOW).list();
  const second = { ...chats[1], id: 'demo-9', contact: { ...chats[1].contact, name: 'Ana Pérez' } };
  const names = [...list({ chats: [second, ...chats] }).matchAll(/<button[^>]*aria-pressed[^>]*>[\s\S]*?(Ana Pérez|Diego Muñoz)/g)].map(match => match[1]);
  assert.deepEqual(names, ['Ana Pérez', 'Diego Muñoz']);
});

test('waiting and closed previews carry their state prefix', () => {
  const html = list();
  const camila = row(html, 'Camila Rojas');
  assert.match(camila, /<span[^>]*text-warning[^>]*>Esperando vendedor · <\/span>/);
  const camilaLast = createMockRepository(NOW).get('demo-1').messages.at(-1).text;
  assert.ok(text(camila).includes(`Esperando vendedor · ${camilaLast}`));
  assert.match(text(row(html, 'Pablo Torres')), /Cerrada · Conversación cerrada/);
});

test('rows show waiting time, previews with author prefix and unread badge', () => {
  const html = list();
  // Last customer message of demo-1 is 8 minutes before NOW.
  assert.match(row(html, 'Camila Rojas'), /<time[^>]*text-accent-ink[^>]*>hace 8 min<\/time>/);
  assert.match(text(row(html, 'Camila Rojas')), /1 sin leer · demo/);
  assert.match(text(row(html, 'Valentina Soto')), /Tú: Quedo atento a tus comentarios\./);
  assert.match(text(row(html, 'Diego Muñoz')), /Asistente: Sí, cuéntame las medidas/);
  assert.ok(!/hace \d+ min/.test(row(html, 'Diego Muñoz')), 'Only waiting rows show elapsed minutes');
  const diegoLast = createMockRepository(NOW).get('demo-2').messages.at(-1).at;
  assert.ok(row(html, 'Diego Muñoz').includes(`>${formatListTimestamp(diegoLast, NOW)}</time>`), 'Other rows keep the list timestamp');
  assert.match(row(html, 'Camila Rojas'), /sr-only">\s*sin leer · demo/);
});

test('waiting time counts at least one minute and follows the phone prefix rule', () => {
  const chats = createMockRepository(NOW).list();
  const waiting = chats[0];
  const lastCustomer = waiting.messages.filter(message => message.kind === 'customer').at(-1).at;
  assert.match(row(list({ chats, now: lastCustomer + 10000 }), 'Camila Rojas'), />hace 1 min</);
  const phone = { ...chats[2], messages: [...chats[2].messages, { id: 'p', kind: 'phone', text: 'Llamo en un rato', at: NOW }] };
  assert.match(text(row(list({ chats: [phone] }), 'Valentina Soto')), /Tú: Llamo en un rato/);
});

test('selected row uses soft accent with an accent bar, success bar when attending', () => {
  const waiting = row(list({ selectedId: 'demo-1' }), 'Camila Rojas');
  assert.match(waiting, /aria-pressed="true"/);
  assert.ok(waiting.includes('bg-accent-soft') && waiting.includes('before:bg-accent') && waiting.includes('before:w-1'));
  const seller = row(list({ selectedId: 'demo-3' }), 'Valentina Soto');
  assert.ok(seller.includes('bg-accent-soft') && seller.includes('before:bg-success'));
  assert.match(row(list({ selectedId: 'demo-3' }), 'Camila Rojas'), /aria-pressed="false"/);
});

test('empty list keeps the "Sin conversaciones" empty state', () => {
  assert.ok(list({ chats: [] }).includes('Sin conversaciones'));
});

test('customer card renders the night header, identity, rows, captured chips and summary toggle', () => {
  const chat = createMockRepository(NOW).get('demo-1');
  const html = render(ConversationDetails, { chat });
  assert.match(html, /<h2[^>]*>Ficha del cliente<\/h2>/);
  assert.match(html, /bg-night[^"]*text-night-ink|text-night-ink[^"]*bg-night/);
  assert.ok(!html.includes('Cerrar ficha del cliente'), 'No close button without onClose');
  assert.ok(html.includes('bg-success-soft'));
  for (const value of [chat.contact.name, chat.contact.company, 'Teléfono', chat.contact.phone, 'Oportunidad', chat.opportunity.code, 'Demo · ficha sin vínculo real']) assert.ok(text(html).includes(value), value);
  assert.ok(text(html).indexOf('Teléfono') < text(html).indexOf('Oportunidad'));
  assert.match(html, /<h3[^>]*text-info[^>]*>(?:(?!<\/h3>)[\s\S])*El asistente capturó<\/h3>/);
  for (const value of chat.opportunity.captured) assert.match(html, new RegExp(`<li[^>]*bg-info-soft[^>]*>${value}</li>`));
  assert.match(html, /<button[^>]*aria-expanded="false"[^>]*rounded-full[^>]*>Abrir oportunidad<\/button>|<button[^>]*rounded-full[^>]*aria-expanded="false"[^>]*>Abrir oportunidad<\/button>/);
  assert.ok(!html.includes('Resumen de oportunidad demo'));
  assert.ok(!html.includes('href='));
});

test('customer card shows a close button when onClose is given', () => {
  const html = render(ConversationDetails, { chat: createMockRepository(NOW).get('demo-1'), onClose: () => {} });
  assert.match(html, /<button[^>]*aria-label="Cerrar ficha del cliente"/);
});

test('notice banners hide assignments and offer Ver chat / Más tarde; demo notice unchanged', () => {
  const html = render(NoticeBanners, { notices: [
    { id: 'a', conversationId: 'demo-1', kind: 'assigned', text: 'Nuevo cliente asignado a ti' },
    { id: 'w', conversationId: 'demo-3', kind: 'warning', text: 'Tu plazo vence en 5 min' },
    { id: 'r', conversationId: 'demo-2', kind: 'resumed', text: 'El asistente retomó una conversación' },
  ], onOpen: () => {}, onDismiss: () => {} });
  assert.ok(!html.includes('Nuevo cliente asignado a ti'));
  for (const label of ['Tu plazo vence en 5 min', 'El asistente retomó una conversación']) assert.ok(html.includes(label), label);
  assert.equal(html.match(/Ver chat/g).length, 2);
  assert.equal(html.match(/Más tarde/g).length, 2);
  assert.ok(render(DemoNotice, {}).includes(DEMO_NOTICE_TEXT));
});

test('every row carries a state indicator on the avatar: tone ring, icon and a spoken label', () => {
  const html = list();
  for (const [name, state, label, tone] of [
    // Soft tones (L8): light ring and a soft badge with the state-colored icon.
    ['Camila Rojas', 'waiting', 'Esperando vendedor', 'warning-line'],
    ['Valentina Soto', 'seller', 'Atendiendo tú', 'success-line'],
    ['Diego Muñoz', 'assistant', 'Con el asistente', 'info-line'],
    ['Pablo Torres', 'closed', 'Cerrada', 'line'],
  ]) {
    const markup = row(html, name);
    const indicator = markup.match(/<span[^>]*data-chat-state="[^"]*"[^>]*>[\s\S]*?<\/svg><\/span>/)?.[0] ?? '';
    assert.match(indicator, new RegExp(`data-chat-state="${state}"`), `${name} exposes its state`);
    assert.match(markup, new RegExp(`ring-${tone}`), `${name} avatar ring uses the ${tone} tone`);
    assert.match(indicator, /<svg/, `${name} shows a state icon, not color alone`);
    assert.ok(text(markup).includes(`Estado: ${label}`), `${name} announces "Estado: ${label}"`);
  }
});
