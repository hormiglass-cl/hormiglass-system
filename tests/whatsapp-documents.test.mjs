import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/whatsapp-typescript.mjs';
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');
import { mockDatasheets } from '../lib/whatsapp/mock-documents.ts';

const now = Date.UTC(2026, 10, 3, 12);
const document = mockDatasheets[0];

test('S9: explicit document confirmation appends only the preview text and demo attachment', () => {
  const repo = createMockRepository(now);
  const isolated = createMockRepository(now);
  const isolatedBefore = isolated.list();
  assert.equal(typeof repo.sendDocument, 'function');
  repo.claim('demo-1', now);
  const before = repo.get('demo-1');
  const notices = repo.notices();
  repo.sendDocument('demo-1', document.id, now + 1);
  const after = repo.get('demo-1');
  assert.deepEqual(after.messages.slice(0, -2), before.messages);
  assert.deepEqual(after.messages.slice(-2).map(({ kind, text, delivery, at }) => ({ kind, text, delivery, at })), [
    { kind: 'seller', text: `Te comparto ${document.name}. Es una muestra ficticia para revisar el diseño; no es una ficha técnica válida.`, delivery: 'sent', at: now + 1 },
    { kind: 'file', text: `${document.name} · Documento de demostración`, delivery: 'sent', at: now + 1 },
  ]);
  assert.deepEqual({ ...after, messages: [] }, { ...before, messages: [] });
  assert.deepEqual(repo.notices(), notices);
  assert.deepEqual(isolated.list(), isolatedBefore);
});

test('S9: rejected unclaimed, closed, expired, unknown-document and unknown-chat sends mutate nothing', () => {
  for (const scenario of ['waiting', 'assistant', 'closed', 'expired', 'unknown-document', 'unknown-chat']) {
    const repo = createMockRepository(now);
    const control = createMockRepository(now);
    assert.equal(typeof repo.sendDocument, 'function');
    let id = 'demo-1', at = now, doc = document.id;
    if (scenario === 'assistant') id = 'demo-2';
    if (scenario === 'closed') id = 'demo-4';
    if (['expired', 'unknown-document', 'unknown-chat'].includes(scenario)) {
      repo.claim('demo-1', now);
      control.claim('demo-1', now);
    }
    if (scenario === 'expired') at += 3600000;
    if (scenario === 'unknown-document') doc = 'not-an-approved-demo-document';
    if (scenario === 'unknown-chat') id = 'unknown';
    const before = { chats: repo.list(), notices: repo.notices() };
    const message = scenario === 'unknown-document' ? 'Selecciona una ficha técnica de demostración válida.'
      : scenario === 'unknown-chat' ? 'Conversación no encontrada.' : 'Toma la conversación para responder al cliente.';
    assert.throws(() => repo.sendDocument(id, doc, at), { message }, scenario);
    assert.deepEqual({ chats: repo.list(), notices: repo.notices() }, before, scenario);
    // Public comparison proves rejection did not consume message/notification IDs.
    repo.claim('demo-2', now);
    control.claim('demo-2', now);
    repo.send('demo-2', 'Mensaje habitual', now);
    control.send('demo-2', 'Mensaje habitual', now);
    assert.deepEqual(repo.list(), control.list(), scenario);
    assert.deepEqual(repo.notices(), control.notices(), scenario);
  }
  const repo = createMockRepository(now);
  repo.claim('demo-1', now);
  repo.sendDocument('demo-1', document.id, now + 3599999);
  assert.equal(repo.get('demo-1').messages.at(-1).kind, 'file');
});
