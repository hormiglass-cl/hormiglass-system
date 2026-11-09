import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers/whatsapp-typescript.mjs';
const { formatListTimestamp } = await import('../lib/whatsapp/format.ts');

// 2026-11-09 15:00 in Santiago (UTC-3).
const now = Date.UTC(2026, 10, 9, 18);

test('inbox timestamp shows the time of day for messages from today (Santiago)', () => {
  assert.equal(formatListTimestamp(Date.UTC(2026, 10, 9, 11, 52), now), '08:52 a. m.');
  // 00:30 Santiago is still today even though it is 03:30 UTC.
  assert.equal(formatListTimestamp(Date.UTC(2026, 10, 9, 3, 30), now), '12:30 a. m.');
});

test('inbox timestamp shows "Ayer" for messages from the previous Santiago day', () => {
  assert.equal(formatListTimestamp(Date.UTC(2026, 10, 8, 20), now), 'Ayer');
  // 23:30 Santiago on the 8th is 02:30 UTC on the 9th: still yesterday locally.
  assert.equal(formatListTimestamp(Date.UTC(2026, 10, 9, 2, 30), now), 'Ayer');
});

test('inbox timestamp shows day and month for older messages from this year', () => {
  assert.equal(formatListTimestamp(Date.UTC(2026, 10, 3, 12), now), '03-nov');
});

test('inbox timestamp adds the year for messages from a previous year', () => {
  assert.equal(formatListTimestamp(Date.UTC(2025, 10, 3, 12), now), '03-nov-2025');
});
