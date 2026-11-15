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

test('S9 Ficha WhatsApp shows the stored bot record and corrections as before -> after', async () => {
  const { LeadRecordPanel } = await import('../components/whatsapp/LeadRecordPanel.tsx');
  const panel = {
    lead_id: 'lead-1', revision: 3, can_resolve: true,
    record: { requirement: 'Pavers for the patio', tax_document: 'factura', purchase_order: 'OC-77', desired_date: '2028-02-29', source_number: '+56911111111', service: 'Pavimentos', use_case: 'Patio', site: { truck_access: false, terrain: 'Tierra' }, ai_summary: { executive_summary: 'Ready to quote' } },
    corrections: [
      { entity: 'opportunity', field: 'titulo', before: 'Patio (human)', after: 'Patio grande', revision: 3, updated_at: '2026-11-11T12:00:00Z' },
      { entity: 'opportunity', field: 'forma_entrega', before: 'retiro_cliente', after: null, revision: 3, updated_at: '2026-11-11T12:00:00Z' },
      { entity: 'customer', field: 'tipo_cliente', before: 'natural', after: 'juridica', revision: 3, updated_at: '2026-11-11T12:00:00Z' },
    ],
  };
  const html = render(LeadRecordPanel, { panel, onResolve: () => {} });
  const plain = text(html);
  assert.ok(plain.includes('Ficha WhatsApp'));
  assert.ok(plain.includes('Revisión 3'));
  for (const fragment of ['Requerimiento', 'Pavers for the patio', 'Documento tributario', 'Factura', 'OC-77', '2028-02-29', '+56911111111', 'Pavimentos', 'Acceso de camión', 'No', 'Tierra', 'Resumen ejecutivo', 'Ready to quote']) assert.ok(plain.includes(fragment), fragment);
  assert.ok(plain.includes('Título') && plain.includes('Patio (human)') && plain.includes('Patio grande'));
  assert.ok(plain.includes('Forma de entrega') && plain.includes('—'));
  assert.ok(plain.includes('Tipo de cliente (cliente)'));
  assert.equal((html.match(/>Aceptar</g) ?? []).length, 3);
  assert.equal((html.match(/>Descartar</g) ?? []).length, 3);
  assert.ok(!plain.includes('Integración pendiente'));
  const readOnly = text(render(LeadRecordPanel, { panel: { ...panel, can_resolve: false }, onResolve: () => {} }));
  assert.ok(!readOnly.includes('Aceptar') && !readOnly.includes('Descartar'));
  assert.ok(readOnly.includes('Patio grande'));
  const clean = text(render(LeadRecordPanel, { panel: { ...panel, corrections: [] }, onResolve: () => {} }));
  assert.ok(clean.includes('Sin correcciones pendientes'));
});

test('S3 S5 S9 chat ownership control shows who attends and only the allowed confirmed actions', async () => {
  const { ChatOwnershipControl } = await import('../components/whatsapp/ChatOwnershipControl.tsx');
  const base = { ownership_version: 4, owner: 'bot', source: null, holder_crm_seller_id: null, holder_name: null, can_take: true, can_release: false, last_command: null };
  const view = (props) => render(ChatOwnershipControl, { onAction: () => {}, ...props });
  const button = (html, label) => attrsOf(html, new RegExp(`<button[^>]*>${label}</button>`));

  const bot = view({ state: base });
  assert.ok(text(bot).includes('Atención del chat'));
  assert.ok(text(bot).includes('Asistente (bot)'));
  assert.ok(button(bot, 'Tomar chat') && !button(bot, 'Tomar chat').includes('disabled=""'));
  assert.ok(!bot.includes('Liberar chat'));

  const human = { ...base, ownership_version: 5, owner: 'human', source: 'crm', holder_crm_seller_id: 'u-1', holder_name: 'Paula Pérez', can_take: false, can_release: true };
  const held = view({ state: human });
  assert.ok(text(held).includes('Atendido por Paula Pérez'));
  assert.ok(button(held, 'Liberar chat'));
  assert.ok(!held.includes('Tomar chat'));

  assert.ok(text(view({ state: { ...human, holder_crm_seller_id: null, holder_name: null, can_release: false } })).includes('Atendido por un vendedor sin cuenta en el CRM'));
  const none = view({ state: { ...human, can_release: false } });
  assert.ok(!none.includes('<button'));

  const sending = view({ state: base, sending: true });
  assert.match(attrsOf(sending, /<[a-z]+[^>]*role="status"[^>]*>/), /role="status"/);
  assert.ok(text(sending).includes('Enviando al asistente…'));
  assert.match(button(sending, 'Tomar chat'), /disabled=""/);
});

test('S3 S4 chat ownership control explains every outcome from the response status, not the HTTP code', async () => {
  const { ChatOwnershipControl } = await import('../components/whatsapp/ChatOwnershipControl.tsx');
  const state = { ownership_version: 4, owner: 'bot', source: null, holder_crm_seller_id: null, holder_name: null, can_take: true, can_release: false, last_command: null };
  const view = (feedback, extra = {}) => render(ChatOwnershipControl, { state: { ...state, ...extra }, feedback, onAction: () => {} });
  const outcome = (status, error_code = null) => ({ kind: 'outcome', action: 'take', status, error_code });

  assert.ok(text(view(outcome('applied'))).includes('El asistente confirmó el cambio.'));
  const stale = view(outcome('ignored_stale'));
  assert.ok(text(stale).includes('El estado cambió en el asistente. Se actualizó la vista.'));
  assert.ok(stale.includes('role="status"'));

  const conflictCommand = { type: 'chat.take', status: 'rejected', http_status: 409, error_code: 'ownership_conflict', holder_crm_seller_id: 'u-2', holder_name: 'Marco Díaz', updated_at: '2026-11-15T12:00:00Z' };
  const conflict = view(outcome('rejected', 'ownership_conflict'), { last_command: conflictCommand });
  assert.ok(text(conflict).includes('Otro vendedor atiende este chat: Marco Díaz'));
  assert.ok(conflict.includes('role="alert"'));
  assert.ok(text(view(outcome('rejected', 'ownership_conflict'), { last_command: { ...conflictCommand, holder_crm_seller_id: null, holder_name: null } })).includes('Otro vendedor atiende este chat: sin cuenta en el CRM'));

  const generic = view(outcome('rejected', 'invalid_seller'));
  assert.ok(text(generic).includes('El asistente rechazó la solicitud'));
  assert.ok(text(generic).includes('invalid_seller'));

  const retry = view(outcome('retryable'));
  assert.ok(text(retry).includes('El asistente no respondió. Puedes reintentar.'));
  assert.ok(attrsOf(retry, /<button[^>]*>Reintentar<\/button>/));

  const unavailable = view({ kind: 'refusal', action: 'take', error: 'chat_commands_unavailable' });
  assert.ok(text(unavailable).includes('La conexión con el asistente aún no está activa.'));
  assert.ok(text(unavailable).includes('Asistente (bot)'));
  assert.ok(!unavailable.includes('<button'));

  assert.ok(text(view({ kind: 'refusal', action: 'take', error: 'result_unrecorded' })).includes('No se pudo confirmar el resultado; revisa el estado en unos segundos.'));
  for (const error of ['forbidden', 'not_holder', 'chat_not_taken', 'already_holder', 'command_in_progress', 'chat_not_linked']) {
    const html = view({ kind: 'refusal', action: 'take', error });
    assert.ok(html.includes('role="alert"'), error);
    assert.ok(!text(html).includes(error), `${error} has a Spanish message`);
  }

  const reloadRetry = render(ChatOwnershipControl, { state: { ...state, last_command: { ...conflictCommand, status: 'retryable', http_status: 503, error_code: null } }, onAction: () => {} });
  assert.ok(text(reloadRetry).includes('El asistente no respondió. Puedes reintentar.'));
  assert.ok(attrsOf(reloadRetry, /<button[^>]*>Reintentar<\/button>/));
  assert.ok(text(render(ChatOwnershipControl, { state: { ...state, last_command: conflictCommand }, onAction: () => {} })).includes('Otro vendedor atiende este chat: Marco Díaz'));
});
