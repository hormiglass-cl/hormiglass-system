import assert from 'node:assert/strict';
import test from 'node:test';
import { openDialogFixture } from './helpers/whatsapp-dialog-browser.mjs';

const now = Date.UTC(2026, 10, 3, 12);

test('chat actions menu stays fully visible and clickable inside a short chat panel', { timeout: 25000 }, async t => {
  const { page, errors, external } = await openDialogFixture(t, 'tests/fixtures/whatsapp-short-chat.tsx', 640, { now });
  const trigger = page.getByRole('button', { name: 'Acciones del chat', exact: true });
  await trigger.click();
  const items = page.getByRole('menuitem');
  assert.ok(await items.count() >= 2, 'Seller chat offers several actions');
  for (const item of await items.all()) {
    // A clipped item is either cut off or covered: the topmost element at its center would differ.
    const visible = await item.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      let clipped = false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.overflow === 'visible' && style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const box = parent.getBoundingClientRect();
        if (rect.top < box.top || rect.bottom > box.bottom || rect.left < box.left || rect.right > box.right) clipped = true;
      }
      return { clipped, hit: !!hit && node.contains(hit) };
    });
    assert.deepEqual(visible, { clipped: false, hit: true }, await item.textContent());
  }
  await page.getByRole('menuitem', { name: 'Historial', exact: true }).click();
  assert.equal(await page.getByRole('menu').count(), 0, 'Choosing an action closes the menu');
  assert.equal(await page.getByRole('region', { name: 'Historial del sistema' }).count(), 1);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
