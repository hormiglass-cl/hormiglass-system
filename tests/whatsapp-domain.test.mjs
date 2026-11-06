import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/whatsapp-typescript.mjs';
const { createMockRepository } = await import('../lib/whatsapp/repository.ts');

const now = Date.UTC(2026, 10, 3, 12);
const setup = () => createMockRepository(now);

test('S1: mock repositories are isolated and reads cannot mutate stored data', () => {
  const a = setup();
  const before = a.list();
  before[0].contact.name = 'Changed';
  assert.notEqual(a.list()[0].contact.name, 'Changed');
  a.claim('demo-1', now);
  assert.equal(setup().get('demo-1').state, 'waiting');
  assert.equal(a.get('unknown'), undefined);
});

test('S2: claiming pauses for exactly 60 minutes and returns automatically at expiry', () => {
  const repo = setup();
  repo.claim('demo-1', now);
  assert.equal(repo.get('demo-1').state, 'seller');
  assert.equal(repo.get('demo-1').pausedUntil, now + 3600000);
  repo.tick(now + 3599999);
  assert.equal(repo.get('demo-1').state, 'seller');
  repo.tick(now + 3600000);
  const chat = repo.get('demo-1');
  assert.equal(chat.state, 'assistant');
  assert.equal(chat.pausedUntil, undefined);
  assert.equal(chat.messages.at(-1).text, 'Plazo vencido · el asistente retomó');
  const count = chat.messages.length;
  repo.tick(now + 7200000);
  assert.equal(repo.get('demo-1').messages.length, count);
});

test('S2: returning and closing preserve history; incoming message reopens the same record', () => {
  const repo = setup();
  repo.claim('demo-1', now);
  repo.release('demo-1', now + 1);
  assert.equal(repo.get('demo-1').state, 'assistant');
  repo.close('demo-1', now + 2);
  assert.equal(repo.get('demo-1').state, 'closed');
  const previous = repo.get('demo-1').messages;
  repo.receive('demo-1', 'Hola de nuevo', now + 3);
  const reopened = repo.get('demo-1');
  assert.equal(reopened.state, 'assistant');
  assert.equal(reopened.id, 'demo-1');
  assert.deepEqual(reopened.messages.slice(0, previous.length), previous);
  assert.equal(reopened.messages.at(-1).text, 'Hola de nuevo');
  assert.equal(reopened.unread, 1);
  assert.equal(repo.list().length, 4);
});

test('S3/S4: sending requires ownership, rejects blank text without mutation, and tracks delivery', () => {
  const repo = setup();
  const before = repo.list();
  assert.throws(() => repo.send('demo-1', 'Hello', now), /Toma la conversación/);
  assert.deepEqual(repo.list(), before);
  repo.claim('demo-1', now);
  const claimed = repo.list();
  assert.throws(() => repo.send('demo-1', '  ', now), /Escribe un mensaje/);
  assert.deepEqual(repo.list(), claimed);
  repo.send('demo-1', '  Te envío la cotización  ', now);
  const message = repo.get('demo-1').messages.at(-1);
  assert.equal(message.kind, 'seller');
  assert.equal(message.text, 'Te envío la cotización');
  assert.equal(message.delivery, 'sent');
  repo.tick(now + 3600000);
  const expired = repo.list();
  assert.throws(() => repo.send('demo-1', 'Late', now + 3600000), /Toma la conversación/);
  assert.deepEqual(repo.list(), expired);
});

test('S3: mock examples include every author, attachment, event and delivery state', () => {
  const messages = setup().list().flatMap(chat => chat.messages);
  for (const kind of ['customer', 'assistant', 'seller', 'phone', 'file', 'event']) {
    assert.ok(messages.some(message => message.kind === kind), kind);
  }
  assert.ok(messages.some(message => message.delivery === 'read'));
  assert.ok(messages.some(message => message.delivery === 'sent'));
});

test('S5/S6: read action clears unread and expiry notifications fire once', () => {
  const repo = setup();
  repo.markRead('demo-1');
  assert.equal(repo.get('demo-1').unread, 0);
  repo.claim('demo-1', now);
  repo.tick(now + 55 * 60000);
  assert.equal(repo.notices().filter(n => n.kind === 'warning' && n.conversationId === 'demo-1').length, 1);
  repo.tick(now + 56 * 60000);
  assert.equal(repo.notices().filter(n => n.kind === 'warning' && n.conversationId === 'demo-1').length, 1);
  repo.tick(now + 60 * 60000);
  assert.equal(repo.notices().filter(n => n.kind === 'resumed' && n.conversationId === 'demo-1').length, 1);
  const notice = repo.notices()[0];
  repo.dismissNotice(notice.id);
  assert.ok(!repo.notices().some(n => n.id === notice.id));
});
