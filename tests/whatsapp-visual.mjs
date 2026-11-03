import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';

// Expanded CRM sidebar and padding budget, not an authenticated shell render.
export const isolatedFrameCss = `
#inbox { margin-left: 0; padding: 20px 16px; }
@media (min-width: 640px) { #inbox { padding-inline: 24px; } }
@media (min-width: 768px) { #inbox { margin-left: 240px; } }
@media (min-width: 1024px) { #inbox { padding-inline: 32px; } }
#inbox > div { max-width: 1800px; margin-inline: auto; }
`;

export async function captureInitialLayout(page, directory) {
  const measurements = [];
  const inbox = page.locator('#inbox');
  const list = inbox.getByRole('heading', { name: 'Chats de demostración', exact: true, includeHidden: true }).locator('xpath=ancestor::section[1]');
  const details = inbox.getByRole('heading', { name: 'Demo · ficha sin vínculo real', exact: true, includeHidden: true }).locator('xpath=ancestor::section[1]');
  const chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight, overflowY: getComputedStyle(element).overflowY };
  });
  for (const [name, width] of [['desktop', 1440], ['laptop', 1280], ['mobile', 390]]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => scrollTo(0, 0));
    const measurement = {
      ...await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
      list: await box(list), thread: await box(chat), details: await box(details),
      header: await box(chat.locator('header')), composer: await box(chat.locator('form')),
      messages: await box(chat.getByRole('list', { name: 'Mensajes de demostración' }).locator('..')),
    };
    const screenshot = path.join(directory, `after-${name}.png`);
    await inbox.screenshot({ path: screenshot, animations: 'disabled' });
    measurements.push({ name, screenshot, ...measurement });
  }
  console.log(JSON.stringify({ visualLimitation: 'Isolated real components, compiled CSS, no fonts or authenticated shell; expanded sidebar budget only', measurements }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  return measurements;
}

export function assertLayout(measurements) {
  for (const m of measurements) {
    assert.ok(m.scrollWidth <= m.viewport, `Horizontal overflow: ${JSON.stringify(m)}`);
    assert.ok(m.messages.height >= 280, `Messages need at least 280px: ${JSON.stringify(m)}`);
    assert.ok(m.messages.y + m.messages.height <= 1000, `Messages extend below viewport: ${JSON.stringify(m)}`);
    assert.equal(m.messages.overflowY, 'auto');
    if (m.name === 'mobile') {
      assert.equal(m.list.height, 0, 'Selected mobile conversation hides list');
      assert.ok(m.thread.y < 160, `Selected mobile chat must be near top: ${JSON.stringify(m)}`);
    } else {
      assert.ok(Math.abs(m.details.y - m.thread.y) < 2, `Details must sit beside chat: ${JSON.stringify(m)}`);
      assert.ok(m.list.x + m.list.width <= m.thread.x, 'List before chat');
      assert.ok(m.thread.x + m.thread.width <= m.details.x, 'Details after chat');
    }
  }
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
  await disclosure.click();
  await expect(inbox.getByRole('heading', { name: 'Cliente', exact: true })).toBeHidden();
  await inbox.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(chat).toBeHidden();
  await inbox.getByRole('button', { name: /Camila Rojas/ }).click();
  await expect(chat).toBeVisible();
  await expect(list).toBeHidden();
  await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toBeDisabled();
  await expect(chat.getByText('Demo: no se envían mensajes reales.', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Tomar conversación', exact: true }).click();
  for (const reply of ['Agendar visita a terreno', 'Enviar ficha técnica', 'Cotización en preparación']) {
    await chat.getByRole('button', { name: reply, exact: true }).click();
    await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toHaveValue(reply);
  }
  await chat.getByRole('button', { name: 'Devolver al asistente', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'Mensaje de demostración' })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1000 });
}
