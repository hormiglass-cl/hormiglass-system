import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Use the installed TypeScript compiler; no new runner/dependency or generated files.
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
    // SSR tests do not measure styles; the browser harness compiles the real module.
    if (url.endsWith('.module.css')) return {format:'module', shortCircuit:true, source:'export default {scope:"ssr-scroll-scope"};'};
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    }
    return next(url, context);
  },
});

const { ChatThread, ChatComposer, ChatHeader, ChatStatusBanner, ContactAvatar } = await import('../components/whatsapp/ChatPrimitives.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const now = 1800000000000;
const repository = createMockRepository(now);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const text = html => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"');
const attrsOf = (html, pattern) => (html.match(pattern) ?? [])[0] ?? '';

test('thread labels every author and keeps the file placeholder and delivery without a fake download', () => {
  const html = render(ChatThread, { messages: repository.get('demo-3').messages });
  for (const label of ['>Cliente<', '>Tú · desde el teléfono<', '>Tú<', '>Archivo de demostración<', '340 KB', '▤ ', 'Vista de ejemplo · archivo no disponible para descargar', 'aria-label="Leído"', 'aria-label="Enviado"', 'aria-label="Mensajes de demostración"']) assert.ok(html.includes(label), label);
  for (const old of ['Vendedor desde el CRM', 'Enviado desde el teléfono']) assert.ok(!html.includes(old), old);
  assert.equal(html.match(/<time /g).length, repository.get('demo-3').messages.length, 'One <time> per message');
  assert.ok(!html.includes('download='));
  assert.ok(!html.includes('<a '));
  const assistant = render(ChatThread, { messages: repository.get('demo-2').messages });
  assert.ok(assistant.includes('>Asistente<'));
  assert.match(assistant, /bg-accent-soft[^"]*"[^>]*>Sí, cuéntame/, 'Assistant bubble uses the soft accent tone');
  const events = render(ChatThread, { messages: repository.get('demo-1').messages });
  assert.match(events, /rounded-full[^"]*bg-info-soft[^"]*text-info[^"]*">Derivado a Ventas/, 'Handoff events are info pills');
});

test('unread divider remains anchored to captured message after repository markRead', () => {
  const chat = repository.get('demo-1');
  const anchor = chat.messages.filter(message => message.kind === 'customer').at(-1).id;
  repository.markRead(chat.id);
  const html = render(ChatThread, { messages: repository.get(chat.id).messages, unreadAt: anchor, unreadCount: 1 });
  assert.ok(html.includes('1 MENSAJE NUEVO'));
  assert.ok(html.indexOf('1 MENSAJE NUEVO') < html.indexOf('Son 120'));
  assert.equal(repository.get(chat.id).unread, 0);
});

test('composer offers labeled quick actions, a pill textbox and a round send button', () => {
  const locked = render(ChatComposer, { locked: true, onSend: () => true });
  assert.ok(locked.includes('role="group" aria-label="Acciones rápidas"'));
  assert.ok(locked.includes('placeholder="Toma el chat para escribir"'));
  assert.match(attrsOf(locked, /<textarea[^>]*>/), /disabled=""/);
  assert.match(attrsOf(locked, /<button[^>]*aria-label="Enviar"[^>]*>/), /disabled=""/);
  assert.match(attrsOf(locked, /<button(?:(?!<button)[\s\S])*?Agendar visita<\/span>/), /disabled=""/, 'Agendar visita needs a claimed chat');
  assert.match(attrsOf(locked, /<button(?:(?!<button)[\s\S])*?Cotizar<\/span>/), /disabled=""/, 'Cotizar needs a handler');
  const seller = render(ChatComposer, { locked: false, onSend: () => true, onCreateQuote: () => {}, onSelectDatasheet: () => {} });
  for (const [label, tone] of [['Cotizar', 'info'], ['Enviar ficha técnica', 'violet'], ['Agendar visita', 'success']]) {
    const button = attrsOf(seller, new RegExp(`<button(?:(?!<button)[\\s\\S])*?${label}</span>`));
    assert.ok(button, label);
    assert.ok(button.includes(`bg-${tone}-soft`) && button.includes(`text-${tone}`), `${label} uses the ${tone} tone`);
    assert.ok(!button.includes('disabled=""'), label);
  }
  assert.ok(seller.includes('placeholder="Escribe tu respuesta…"'));
  assert.ok(seller.includes('Mensaje de demostración'));
  assert.match(attrsOf(seller, /<button[^>]*aria-label="Enviar"[^>]*>/), /rounded-full[^"]*bg-accent/);
  for (const textValue of ['Se envía por WhatsApp desde el número de Hormiglass', 'Demo: no se envían mensajes reales.']) assert.ok(seller.includes(textValue), textValue);
  assert.ok(!seller.includes('disabled=""'));
  for (const old of ['Atajos comerciales', 'Crear cotización', 'Agendar visita a terreno<', 'Enviar demo', 'Toma la conversación para responder al cliente.']) assert.ok(!seller.includes(old) && !locked.includes(old), old);
});

test('opportunity integration preserves Activity by default and never invents captured real data', async () => {
  const { OpportunityActivity, UnlinkedChat, CapturedDataPending } = await import('../components/whatsapp/OpportunityActivity.tsx');
  const { ConversationProvider } = await import('../lib/whatsapp/store.tsx');
  const html = renderToStaticMarkup(React.createElement(ConversationProvider, null, React.createElement(OpportunityActivity, { onClose: () => {} }, React.createElement('p', null, 'Actividad existente y compositor'))));
  assert.ok(html.includes('Actividad existente y compositor'));
  assert.ok(html.includes('WhatsApp'));
  assert.ok(html.includes('aria-selected="true"'));
  const empty = render(UnlinkedChat, { onDemo: () => {} });
  assert.ok(empty.includes('No hay un chat de WhatsApp vinculado'));
  assert.ok(empty.includes('Ver conversación demo sin vincular'));
  const captured = render(CapturedDataPending, {});
  assert.ok(captured.includes('Datos capturados por el asistente'));
  assert.ok(captured.includes('no hay datos del asistente disponibles'));
  assert.ok(!captured.includes('Camila'));
});

test('header is an accent bar with identity, optional customer card toggle and the Opciones menu', () => {
  const chat = repository.get('demo-1');
  const html = render(ChatHeader, { chat, onAction: () => {}, onHistory: () => {} });
  assert.match(attrsOf(html, /<header[^>]*>/), /bg-accent-soft[^"]*text-ink/);
  for (const label of ['<h2', 'Camila Rojas', '+56 9 5555 0101', 'DEMO-6056', '>Opciones<', 'aria-label="Opciones del chat"']) assert.ok(html.includes(label), label);
  for (const absent of ['Tomar chat', 'Tomar conversación', 'Ficha del cliente', 'Esperando vendedor']) assert.ok(!html.includes(absent), absent);
  for (const detailsOpen of [false, true]) {
    const toggle = attrsOf(render(ChatHeader, { chat, onAction: () => {}, onHistory: () => {}, detailsOpen, onToggleDetails: () => {} }), /<button[^>]*aria-controls="chat-customer-details"[^>]*>/);
    assert.ok(toggle.includes(`aria-pressed="${detailsOpen}"`), `aria-pressed=${detailsOpen}`);
  }
  assert.ok(render(ChatHeader, { chat, onAction: () => {}, onHistory: () => {}, onToggleDetails: () => {} }).includes('Ficha del cliente'));
});

test('status banner states the next step for every conversation state', () => {
  const cases = [
    ['demo-1', 'warning', 'Camila te espera hace 8 min.', 'Tómalo para responderle tú: el asistente se pausa 60 minutos.', 'Tomar chat'],
    ['demo-2', 'info', 'Diego está con el asistente.', 'Tómalo si quieres responderle tú: el asistente se pausa 60 minutos.', 'Tomar chat'],
    ['demo-3', 'success', 'Estás atendiendo a Valentina.', 'Si no respondes en 60:00, el asistente vuelve a tomar el chat.', 'Devolver al asistente'],
  ];
  for (const [id, tone, bold, rest, action] of cases) {
    const html = render(ChatStatusBanner, { chat: repository.get(id), now, onAction: () => {} });
    assert.match(attrsOf(html, /<[a-z]+[^>]*role="status"[^>]*>/), new RegExp(`bg-${tone}-soft`), `${id} tone`);
    assert.ok(html.includes(`<strong`) && text(html).includes(`${bold} ${rest}`), `${id}: ${text(html)}`);
    assert.match(html, new RegExp(`<strong[^>]*>${bold.replace('.', '\\.')}</strong>`));
    assert.equal(html.match(/<button/g)?.length, 1);
    assert.ok(text(html).endsWith(action), action);
  }
  const closed = render(ChatStatusBanner, { chat: repository.get('demo-4'), now, onAction: () => {} });
  assert.ok(text(closed).includes('Conversación cerrada. Si el cliente vuelve a escribir, se reabre con el asistente.'));
  assert.ok(!closed.includes('<button'));
  const fresh = { ...repository.get('demo-1'), messages: [{ id: 'm', kind: 'customer', text: 'Hola', at: now - 5000 }] };
  assert.ok(text(render(ChatStatusBanner, { chat: fresh, now, onAction: () => {} })).includes('Camila te espera hace 1 min.'), 'At least one minute');
});

test('avatars use soft pastel token backgrounds with matching initials chosen by name', () => {
  const tones = new Set();
  for (const name of ['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Pablo Torres', 'Ana', 'Bo', 'Cy', 'Di']) {
    const html = render(ContactAvatar, { name });
    assert.match(html, /bg-(success|info|violet|accent|warning)-soft text-(success|info|violet|accent-ink|warning)\b/, name);
    tones.add(html.match(/bg-(success|info|violet|accent|warning)-soft/)?.[1]);
    assert.equal(html, render(ContactAvatar, { name }), 'Stable per name');
  }
  assert.ok(!tones.has(undefined));
  assert.ok(tones.size >= 3, 'Several strong tones are used');
});
