import test from 'node:test';
import assert from 'node:assert/strict';
import { openDialogFixture } from './helpers/whatsapp-dialog-browser.mjs';

const fixture = 'tests/fixtures/whatsapp-datasheet.tsx';
const confirmName = 'Confirmar envío demo';
const firstId = 'demo-placas';
const baselines = new WeakMap();

async function open(t, width = 640, scenario = 'seller') {
  const result = await openDialogFixture(t, fixture, width);
  const { page, errors, external } = result;
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(external, []); });
  if (scenario !== 'seller') await page.getByLabel('Escenario').selectOption(scenario);
  const messages = await page.getByLabel('Mensajes sin cambios').textContent();
  baselines.set(page, messages);
  await page.getByRole('button', { name: 'Enviar ficha técnica', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  return result;
}

async function counts(page, count = '0', last = 'ninguno') {
  assert.equal(await page.getByLabel('Confirmaciones').textContent(), count);
  assert.equal(await page.getByLabel('Último documento').textContent(), last);
  assert.equal(await page.getByLabel('Mensajes sin cambios').textContent(), baselines.get(page));
}

test('catálogo ficticio, conocido, sin fallback e inmutable', async () => {
  const { mockDatasheets, findMockDatasheet } = await import('../lib/whatsapp/mock-documents.ts');
  assert.ok(mockDatasheets.length >= 2 && mockDatasheets.length <= 3);
  assert.ok(Object.isFrozen(mockDatasheets));
  assert.equal(new Set(mockDatasheets.map(doc => doc.id)).size, mockDatasheets.length);
  for (const doc of mockDatasheets) {
    assert.match(doc.id, /^demo-[a-z-]+$/);
    assert.match(doc.product, /\(demo\)/);
    assert.match(doc.name, /demo.*\.pdf$/);
    assert.match(doc.description, /fictici/);
    assert.ok(doc.preview.includes('Contenido ficticio. No es una especificación técnica válida.'));
    assert.equal(/https?:|\bKB\b|MPa|\bmm\b|certificad/i.test(JSON.stringify(doc)), false);
    assert.ok(Object.isFrozen(doc));
    assert.ok(Object.isFrozen(doc.preview));
    assert.equal(findMockDatasheet(doc.id), doc);
    assert.throws(() => { doc.preview.push('cambio'); }, TypeError);
    assert.throws(() => { doc.name = 'cambio'; }, TypeError);
  }
  assert.equal(findMockDatasheet('desconocido'), undefined);
  assert.equal(findMockDatasheet(''), undefined);
});

test('seleccionar solo previsualiza; confirmar envía únicamente el id seleccionado', async t => {
  const { page } = await open(t);
  const submit = page.getByRole('button', { name: confirmName });
  assert.equal(await submit.isDisabled(), true);
  assert.equal(await page.getByLabel('Producto y documento').inputValue(), '');
  await counts(page);
  const { mockDatasheets } = await import('../lib/whatsapp/mock-documents.ts');
  for (const doc of mockDatasheets) {
    await page.getByLabel('Producto y documento').selectOption(doc.id);
    assert.deepEqual(await page.getByRole('region', { name: 'Vista previa ficticia' }).locator('li').allTextContents(), doc.preview);
    assert.equal(await page.getByRole('region', { name: 'Vista previa ficticia' }).getByRole('heading').textContent(), doc.name);
    assert.equal(await page.getByRole('region', { name: 'Mensaje previo al envío' }).locator('p').textContent(), `Te comparto ${doc.name}. Es una muestra ficticia para revisar el diseño; no es una ficha técnica válida.`);
    await counts(page);
  }
  const selected = mockDatasheets.at(-1);
  await submit.click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await counts(page, '1', selected.id);
  assert.equal(await page.getByRole('button', { name: 'Enviar ficha técnica', exact: true }).evaluate(el => el === document.activeElement), true);
});

for (const action of ['Cancelar', 'Escape']) {
  test(`${action} cierra sin confirmar y devuelve el foco`, async t => {
    const { page } = await open(t);
    await page.getByLabel('Producto y documento').selectOption(firstId);
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: action, exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await counts(page);
    assert.equal(await page.getByRole('button', { name: 'Enviar ficha técnica', exact: true }).evaluate(el => el === document.activeElement), true);
  });
}

test('rechazo del padre conserva vista previa y muestra alerta local', async t => {
  const { page } = await open(t, 640, 'reject');
  await page.getByLabel('Producto y documento').selectOption(firstId);
  await page.getByRole('button', { name: confirmName }).click();
  await counts(page, '1', firstId);
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(await page.getByLabel('Producto y documento').inputValue(), firstId);
  assert.equal(await page.getByRole('region', { name: 'Vista previa ficticia' }).isVisible(), true);
  assert.equal(await page.getByRole('alert').textContent(), 'No se confirmó el envío demo. Revisa el estado de la conversación e inténtalo de nuevo.');
});

for (const [scenario, reason] of [
  ['waiting', 'Toma la conversación para confirmar el envío demo.'],
  ['closed', 'La conversación está cerrada. Solo puedes revisar la vista previa.'],
  ['expired', 'Tu plazo para responder venció. Toma la conversación nuevamente para confirmar el envío demo.'],
]) {
  test(`${scenario}: vista previa disponible sin confirmar`, async t => {
    const { page } = await open(t, 640, scenario);
    await page.getByLabel('Producto y documento').selectOption(firstId);
    assert.equal(await page.getByRole('region', { name: 'Vista previa ficticia' }).isVisible(), true);
    assert.equal(await page.getByText(reason, { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: confirmName }).isDisabled(), true);
    await counts(page);
  });
}

for (const width of [320, 640]) {
  test(`${width}px: controles legibles sin desbordes; foco atrapado y confirmación por teclado`, async t => {
    const { page } = await open(t, width);
    await page.getByLabel('Producto y documento').selectOption(firstId);
    const dialog = page.getByRole('dialog');
    const geometry = await dialog.evaluate(el => ({
      left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
      overflow: [...el.querySelectorAll('*')].some(node => node.scrollWidth > node.clientWidth + 1),
      fonts: [...el.querySelectorAll('button, select, p, li, h2, h3, label')].map(node => parseFloat(getComputedStyle(node).fontSize)),
    }));
    assert.ok(geometry.left >= 0 && geometry.right <= width);
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.fonts.every(size => size >= 11));
    await page.getByRole('button', { name: 'Cerrar', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: confirmName }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Cerrar', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByLabel('Producto y documento').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Cancelar', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await counts(page, '1', firstId);
    assert.equal(await page.getByRole('dialog').count(), 0);
  });
}
