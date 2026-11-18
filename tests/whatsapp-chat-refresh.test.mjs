import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/whatsapp-typescript.mjs';

const { watchChatState, CHAT_REFRESH_MS } = await import('../lib/whatsapp/chat-refresh.ts');

// Minimal visible/hidden document and window, so the rule runs without a browser.
function fakePage() {
  const doc = new EventTarget(); doc.hidden = false;
  const win = new EventTarget();
  return { doc, win, hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); },
    show() { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); } };
}

test('re-reads the chat state on an interval while the page is visible', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const page = fakePage(); let calls = 0;
  const stop = watchChatState(() => { calls += 1; }, { doc: page.doc, win: page.win });
  assert.equal(calls, 0, 'no extra read on start: the section already loads once');
  t.mock.timers.tick(CHAT_REFRESH_MS);
  assert.equal(calls, 1);
  t.mock.timers.tick(CHAT_REFRESH_MS);
  assert.equal(calls, 2);
  stop();
  t.mock.timers.tick(CHAT_REFRESH_MS * 3);
  assert.equal(calls, 2, 'stops after cleanup');
});

test('skips interval reads while hidden and re-reads when the page becomes visible again', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const page = fakePage(); let calls = 0;
  const stop = watchChatState(() => { calls += 1; }, { doc: page.doc, win: page.win });
  page.hide();
  assert.equal(calls, 0, 'hiding does not read');
  t.mock.timers.tick(CHAT_REFRESH_MS * 2);
  assert.equal(calls, 0, 'no reads while hidden');
  page.show();
  assert.equal(calls, 1, 'reads once when visible again');
  stop();
  page.hide(); page.show();
  assert.equal(calls, 1, 'listeners removed after cleanup');
});

test('re-reads when the window regains focus', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const page = fakePage(); let calls = 0;
  const stop = watchChatState(() => { calls += 1; }, { doc: page.doc, win: page.win });
  page.win.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  stop();
  page.win.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
});
