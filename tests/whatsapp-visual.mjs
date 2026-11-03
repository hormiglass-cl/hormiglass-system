import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';

// Expanded CRM sidebar and padding budget, not an authenticated shell render.
export const isolatedFrameCss = `
#inbox { margin-left: 0; padding: 76px 16px 20px; }
@media (min-width: 640px) { #inbox { padding-inline: 24px; } }
@media (min-width: 768px) { #inbox { margin-left: 240px; } }
@media (min-width: 1024px) { #inbox { padding-inline: 32px; } }
#inbox > div { max-width: 1800px; margin-inline: auto; }
`;

export async function captureInitialLayout(page, directory) {
  const measurements = [];
  const inbox = page.locator('#inbox');
  const list = inbox.getByRole('heading', { name: 'Chats de demostración', exact: true, includeHidden: true }).locator('xpath=ancestor::section[1]');
  const details = inbox.locator('#chat-customer-details > section');
  const chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY };
  });
  for (const [name, width, height] of [['desktop', 1440, 900], ['laptop', 1280, 720], ['intermediate', 1024, 768], ['tablet', 768, 1024], ['mobile', 390, 844], ['narrow', 360, 740], ['reduced', 390, 500]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const measurement = {
      ...await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
      list: await box(list), thread: await box(chat), details: await box(details),
      header: await box(chat.locator('header')), composer: await box(chat.locator('form')),
      clippedControls: await chat.evaluate(element => [...element.querySelectorAll('button, textarea, summary')].filter(control => {
        if (control.closest('[role="group"]')) return false; // This explicit horizontal reply rail scrolls.
        const r = control.getBoundingClientRect(), c = element.getBoundingClientRect();
        return r.width && (r.x < c.x || r.right > c.right || r.y < c.y || r.bottom > c.bottom);
      }).map(control => control.textContent || control.getAttribute('aria-label'))),
      messages: await box(chat.getByRole('list', { name: 'Mensajes de demostración' }).locator('..')),
    };
    const screenshot = path.join(directory, `after-${name}.png`);
    await inbox.screenshot({ path: screenshot, animations: 'disabled' });
    measurements.push({ name, height, screenshot, ...measurement });
  }
  console.log(JSON.stringify({ visualLimitation: 'Isolated real components, compiled CSS, no fonts or authenticated shell; expanded sidebar budget only', measurements }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  return measurements;
}

export function assertLayout(measurements) {
  const failures = [];
  for (const m of measurements) {
    try {
    assert.deepEqual(m.clippedControls, [], `Clipped controls at ${m.viewport}x${m.height}`);
    assert.ok(m.scrollWidth <= m.viewport, `Horizontal overflow: ${JSON.stringify(m)}`);
    assert.ok(m.messages.height >= (m.height <= 500 ? 130 : 260), `Usable message area: ${JSON.stringify(m)}`);
    assert.ok(m.composer.y + m.composer.height <= m.height - 16, `Composer must fit modeled shell viewport: ${JSON.stringify(m)}`);
    assert.ok(m.thread.width >= 320, `Chat must not be squeezed: ${JSON.stringify(m)}`);
    assert.ok(m.header.height <= 160 && m.composer.height <= 165, `Chrome dominates thread: ${JSON.stringify(m)}`);
    assert.equal(m.messages.overflowY, 'auto');
    if (m.viewport < 1280) {
      assert.equal(m.list.height, 0, 'Selected mobile conversation hides list');
      assert.ok(m.thread.y < 160, `Selected chat must be near top: ${JSON.stringify(m)}`);
      assert.equal(m.details.height, 0, 'Details use disclosure below desktop');
    } else {
      assert.ok(Math.abs(m.details.y - m.thread.y) < 2, `Details must sit beside chat: ${JSON.stringify(m)}`);
      assert.ok(m.list.x + m.list.width <= m.thread.x, 'List before chat');
      assert.ok(m.thread.x + m.thread.width <= m.details.x, 'Details after chat');
    }
    } catch (error) { failures.push(error.message); }
  }
  assert.deepEqual(failures, [], 'Responsive sizing failures');
}

export async function assertMobileNavigation(page) {
  await page.setViewportSize({ width: 390, height: 1000 });
  const inbox = page.locator('#inbox');
  const list = inbox.getByRole('heading', { name: 'Chats de demostración', exact: true });
  const chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  await expect(list).toBeHidden();
  const disclosure = inbox.getByRole('button', { name: 'Datos del cliente', exact: true });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(inbox.getByRole('heading', { name: 'Capturado por el asistente', exact: true })).toBeVisible();
  await expect(inbox.getByRole('button', { name: 'Abrir oportunidad', exact: true })).toBeVisible();
  assert.ok(await chat.getByRole('list', { name: 'Mensajes de demostración' }).locator('..').evaluate(element => element.clientHeight) >= 260, 'Customer disclosure must not collapse messages');
  await disclosure.click();
  await expect(inbox.getByRole('heading', { name: 'Cliente', exact: true })).toBeHidden();
  await inbox.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(chat).toBeHidden();
  await inbox.getByRole('tab', { name: 'Con asistente', exact: true }).click();
  await inbox.getByRole('searchbox').fill('Camila');
  await inbox.getByRole('button', { name: /Camila Rojas/ }).click();
  await inbox.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
  await expect(inbox.getByRole('searchbox')).toHaveValue('Camila');
  await expect(inbox.getByRole('tab', { name: 'Con asistente', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inbox.getByRole('list').first().getByRole('button')).toHaveCount(1);
  await inbox.getByRole('button', { name: /Camila Rojas/ }).click();
  await expect(chat).toBeVisible();
  await expect(list).toBeHidden();
  await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toBeDisabled();
  await expect(chat.getByText('Demo: no se envían mensajes reales.', { exact: true })).toBeVisible();
  await chat.locator('summary').click();
  await expect(chat.getByText('Se envía por WhatsApp desde el número de Hormiglass', { exact: true })).toBeVisible();
  await chat.locator('summary').click();
  await chat.getByRole('button', { name: 'Tomar conversación', exact: true }).click();
  for (const reply of ['Agendar visita a terreno', 'Enviar ficha técnica', 'Cotización en preparación']) {
    await chat.getByRole('button', { name: reply, exact: true }).click();
    await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toHaveValue(reply);
  }
  await chat.getByRole('button', { name: 'Devolver al asistente', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
}
