import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDialogFixture } from './helpers/whatsapp-dialog-browser.mjs';

const line = (description = 'Placa manual', quantity = '1', unitPrice = '0') => ({ description, quantity, unitPrice });

test('quote totals round each line, then aggregate IVA; reject invalid and unsafe drafts', async () => {
  const { calculateQuote } = await import('../lib/whatsapp/quote-draft.ts');
  assert.deepEqual(calculateQuote([line('A', '1.5', '101'), line('B', '2', '100')]), {
    ok: true, lines: [152, 200], net: 352, iva: 67, total: 419,
  });
  assert.deepEqual(calculateQuote([line()]), { ok: true, lines: [0], net: 0, iva: 0, total: 0 });
  const invalid = [[], [line(' ')], ...['', '0', '-1', 'NaN', 'Infinity', '1e309'].map(q => [line('A', q)]),
    ...['', '-1', 'NaN', 'Infinity'].map(p => [line('A', '1', p)]),
    [line('A', '1e308', '1e308')], [line('A', '1', String(Number.MAX_SAFE_INTEGER))],
    [line('A', '1', '4503599627370496'), line('B', '1', '4503599627370496')]];
  for (const draft of invalid) {
    const before = JSON.stringify(draft);
    const result = calculateQuote(draft);
    assert.equal(result.ok, false, before);
    assert.equal(typeof result.error, 'string');
    assert.equal('total' in result, false);
    assert.equal(JSON.stringify(draft), before);
  }
});

for (const width of [320, 640]) {
  test(`public quote dialog at ${width}px: explicit local save, validation, retention and keyboard`, { timeout: 25000 }, async t => {
    const { page, errors, external } = await openDialogFixture(t, 'tests/fixtures/whatsapp-quote.tsx', width);
    const trigger = page.getByRole('button', { name: 'Crear cotización', exact: true });
    const original = await page.getByLabel('Chat original').textContent();
    const unchanged = async () => {
      assert.equal(await page.getByLabel('Chat actual').textContent(), original);
      assert.equal(await page.getByLabel('Repositorio actual').textContent(), original);
    };
    assert.equal(await page.getByRole('dialog').count(), 0);
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /Demo.*no persistente/);
    for (const value of ['Obras del Valle', 'Diego Muñoz', 'Paneles para bodega']) {
      assert.equal(await dialog.locator('input').evaluateAll((nodes, v) => nodes.filter(n => n.value === v && n.readOnly).length, value), 1);
    }
    const save = dialog.getByRole('button', { name: 'Guardar cotización demo', exact: true });
    await save.click();
    assert.equal(await dialog.getByRole('alert').textContent(), 'Completa la descripción de cada ítem.');
    assert.equal(await dialog.getByRole('status').count(), 0);
    await unchanged();
    const description = () => dialog.getByRole('textbox', { name: /^Descripción/ });
    const quantity = () => dialog.getByRole('spinbutton', { name: /^Cantidad/ });
    const price = () => dialog.getByRole('spinbutton', { name: /^Precio unitario \(CLP\)/ });
    assert.equal(await price().inputValue(), '');
    await description().fill('Panel ingresado manualmente');
    await quantity().fill('0');
    await price().fill('101');
    await save.click();
    assert.match(await dialog.getByRole('alert').textContent(), /cantidad.*positiva/);
    await quantity().fill('1.5');
    await price().fill('-1');
    await save.click();
    assert.match(await dialog.getByRole('alert').textContent(), /precio.*mayor o igual a cero/);
    assert.equal(await dialog.getByRole('status').count(), 0);
    await price().fill('101');
    await dialog.getByRole('button', { name: 'Agregar ítem' }).click();
    await description().nth(1).fill('Otro ítem');
    await quantity().nth(1).fill('2');
    await price().nth(1).fill('100');
    assert.equal(await dialog.getByLabel('Neto CLP').textContent(), '$352');
    assert.equal(await dialog.getByLabel('IVA 19% CLP').textContent(), '$67');
    assert.equal(await dialog.getByLabel('Total CLP').textContent(), '$419');
    assert.equal(await dialog.getByRole('status').count(), 0, 'editing never saves');
    await save.click();
    assert.match(await dialog.getByRole('status').textContent(), /Cotización demo preparada.*No se creó un registro.*no se envió/);
    await unchanged();
    await description().nth(0).fill('Edición posterior');
    assert.equal(await dialog.getByRole('status').count(), 0, 'edits invalidate prepared feedback');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate(n => n === document.activeElement), true);
    await trigger.click();
    assert.equal(await description().nth(0).inputValue(), 'Edición posterior');
    assert.equal(await price().nth(0).inputValue(), '101');
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await trigger.evaluate(n => n === document.activeElement), true);
    await trigger.click();
    await dialog.getByRole('button', { name: 'Quitar ítem 2' }).click();
    assert.equal(await description().count(), 1);
    assert.equal(await dialog.getByRole('button', { name: 'Quitar ítem 1' }).isDisabled(), true);
    for (let i = 0; i < 5; i++) await dialog.getByRole('button', { name: 'Agregar ítem' }).click();
    await description().last().scrollIntoViewIfNeeded();
    assert.equal(await description().last().isVisible(), true);
    const geometry = await dialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const nodes = [...node.querySelectorAll('*')];
      return { left: rect.left, right: rect.right, width: innerWidth,
        overflow: nodes.some(n => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1),
        minFont: Math.min(...nodes.filter(n => n.textContent.trim()).map(n => parseFloat(getComputedStyle(n).fontSize))),
        scrollable: nodes.some(n => n.scrollHeight > n.clientHeight && getComputedStyle(n).overflowY === 'auto') };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= width);
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.minFont >= 11);
    assert.equal(geometry.scrollable, true);
    await save.scrollIntoViewIfNeeded();
    assert.equal(await save.evaluate(n => {
      const r = n.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === n;
    }), true);
    await unchanged();
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  });
}
