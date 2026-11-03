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
    if (/\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
    }
    return next(url, context);
  },
});

const { ChatThread, ChatComposer, ChatHeader } = await import('../components/whatsapp/ChatPrimitives.tsx');
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
const repository = createMockRepository(1800000000000);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('thread renders all authors, file placeholder and delivery without a fake download', () => {
  const html = render(ChatThread, { messages: repository.get('demo-3').messages });
  for (const label of ['Cliente', 'Enviado desde el teléfono', 'Vendedor desde el CRM', 'Archivo de demostración', '340 KB', '✓✓', '✓']) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('download='));
  assert.ok(!html.includes('<a '));
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

test('assistant composer is locked and seller composer keeps quick replies and demo hint', () => {
  const locked = render(ChatComposer, { locked: true, onSend: () => true });
  assert.ok(locked.includes('Toma la conversación para responder al cliente.'));
  assert.ok(locked.includes('disabled=""'));
  const seller = render(ChatComposer, { locked: false, onSend: () => true });
  for (const text of ['Agendar visita a terreno', 'Enviar ficha técnica', 'Cotización en preparación', 'Se envía por WhatsApp desde el número de Hormiglass', 'no se envían mensajes reales']) assert.ok(seller.includes(text), text);
  assert.ok(!seller.includes('disabled=""'));
});

test('inbox lists demo conversations, filters and opportunity summary without live CRM links', async () => {
  const { ConversationList, ConversationDetails, NoticeBanners } = await import('../components/whatsapp/InboxParts.tsx');
  const list = render(ConversationList, { chats: repository.list(), selectedId: 'demo-1', onSelect: () => {} });
  for (const label of ['Mis chats', 'Esperando', 'Con asistente', 'Cerrados', 'Camila Rojas', 'Buscar conversaciones']) assert.ok(list.includes(label), label);
  const details = render(ConversationDetails, { chat: repository.get('demo-1') });
  for (const label of ['Cliente', 'Oportunidad', 'Capturado por el asistente', 'Abrir oportunidad', 'Demo']) assert.ok(details.includes(label), label);
  assert.ok(!details.includes('href='));
  const notices = render(NoticeBanners, { notices: [
    { id: 'a', conversationId: 'demo-1', text: 'Nuevo cliente asignado a ti' },
    { id: 'b', conversationId: 'demo-3', text: 'Tu plazo vence en 5 min' },
    { id: 'c', conversationId: 'demo-3', text: 'El asistente retomó una conversación' },
  ], onOpen: () => {}, onDismiss: () => {} });
  for (const label of ['Nuevo cliente asignado a ti', 'Tu plazo vence en 5 min', 'El asistente retomó una conversación', 'Ver chat', 'Más tarde']) assert.ok(notices.includes(label), label);
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

test('header presents numbered states and pause duration and closed reopening explanation', () => {
  for (const [id, label] of [['demo-1', '2 · Esperando vendedor'], ['demo-2', '1 · Con asistente'], ['demo-3', '3 · Atendiendo tú'], ['demo-4', '4 · Cerrada']]) {
    const html = render(ChatHeader, { chat: repository.get(id), now: 1800000000000, onAction: () => {}, onHistory: () => {} });
    assert.ok(html.includes(label), label);
    if (id === 'demo-3') assert.ok(html.includes('60:00'));
    if (id === 'demo-4') assert.ok(html.includes('la conversación se reabre con el asistente'));
  }
});
