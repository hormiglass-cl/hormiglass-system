import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';

// Expanded CRM sidebar and padding budget, not an authenticated shell render.
// The page cancels this padding itself (edge-to-edge) and sits under a 56px navbar.
export const isolatedFrameCss = `
#inbox { margin-left: 0; padding: 76px 16px 20px; }
@media (min-width: 640px) { #inbox { padding-inline: 24px; } }
@media (min-width: 768px) { #inbox { margin-left: 240px; } }
@media (min-width: 1024px) { #inbox { padding-inline: 32px; } }
`;

/** Mirrors the page contract: phones (viewport < 1024) show one pane; the page width (not the viewport) decides three panes. */
const PHONE_MAX_VIEWPORT = 1024;
const THREE_PANES_MIN_WIDTH = 1120;
const NAVBAR_HEIGHT = 56;
const SIDEBAR_WIDTH = 768;

export function expectedMode(viewport, pageWidth) {
  if (viewport < PHONE_MAX_VIEWPORT) return 'phone';
  return pageWidth >= THREE_PANES_MIN_WIDTH ? 'three' : 'two';
}

async function measure(page, name, height) {
  return page.evaluate(({ name, height }) => {
    const root = document.querySelector('#inbox > div');
    const chat = root.querySelector('section[aria-label="Chat demo con Camila Rojas"]');
    const list = root.querySelector('[data-conversation-list]')?.parentElement;
    const details = root.querySelector('#chat-customer-details > section');
    const box = element => {
      if (!element) return { visible: false, x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 };
      const r = element.getBoundingClientRect();
      return { visible: r.width > 0 && r.height > 0, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const clipped = container => container ? [...container.querySelectorAll('button, textarea, input, summary')].filter(control => {
      if (control.closest('[role="group"]')) return false; // The labeled quick-action rail scrolls horizontally.
      const r = control.getBoundingClientRect(), c = container.getBoundingClientRect();
      // sr-only controls (1px box) are not visible, so they cannot look clipped.
      return r.width > 1 && r.height > 1 && (r.x < c.x - 0.5 || r.right > c.right + 0.5 || r.y < c.y - 0.5 || r.bottom > c.bottom + 0.5);
    }).map(control => control.getAttribute('aria-label') || control.textContent) : [];
    // Visible text below 11px; sr-only text is excluded by its 1px box.
    const smallFonts = [...root.querySelectorAll('*')].filter(element => {
      if (![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) return false;
      const r = element.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1 || !element.checkVisibility()) return false;
      return parseFloat(getComputedStyle(element).fontSize) < 11;
    }).map(element => `${element.textContent.trim().slice(0, 30)} (${getComputedStyle(element).fontSize})`);
    const messages = chat?.querySelector('ol[aria-label="Mensajes de demostración"]')?.parentElement;
    return {
      name, height,
      viewport: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
      page: box(root), list: box(list), thread: box(chat), details: box(details),
      headers: { list: box(list?.firstElementChild).height, chat: box(chat?.querySelector('header')).height, details: box(details?.firstElementChild).height },
      header: box(chat?.querySelector('header')), composer: box(chat?.querySelector('form')),
      messages: { ...box(messages), overflowY: messages ? getComputedStyle(messages).overflowY : null },
      clippedControls: [...clipped(chat), ...clipped(details)], smallFonts,
    };
  }, { name, height });
}

export async function captureInitialLayout(page, directory) {
  const measurements = [];
  const inbox = page.locator('#inbox');
  const snapshot = async (name, width, height) => {
    const measurement = await measure(page, name, height);
    const screenshot = path.join(directory, `after-${name}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    measurements.push({ ...measurement, width, screenshot, mode: expectedMode(width, measurement.page.width) });
  };
  for (const [name, width, height] of [['desktop', 1440, 900], ['laptop', 1280, 720], ['intermediate', 1024, 768], ['tablet', 768, 1024], ['mobile', 390, 844], ['narrow', 360, 740], ['reduced', 390, 500]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    // The page picks its panes from a ResizeObserver; let it observe and React re-render before measuring.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await snapshot(name, width, height);
  }
  // Two-pane page (expanded sidebar at 1280): the card is closed by default and swaps in for the list.
  await page.setViewportSize({ width: 1280, height: 720 });
  const chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const toggle = chat.getByRole('button', { name: 'Ficha del cliente', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'chat-customer-details');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(inbox.locator('#chat-customer-details').getByRole('heading', { name: 'Ficha del cliente', level: 2 })).toBeVisible();
  await expect(inbox.getByRole('heading', { name: 'Chats', exact: true })).toBeHidden();
  const card = await measure(page, 'laptop-card', 720);
  await page.screenshot({ path: path.join(directory, 'after-laptop-card.png'), animations: 'disabled' });
  measurements.push({ ...card, width: 1280, screenshot: path.join(directory, 'after-laptop-card.png'), mode: 'two-card' });
  await inbox.getByRole('button', { name: 'Cerrar ficha del cliente', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(inbox.locator('#chat-customer-details')).toHaveCount(0);
  await expect(inbox.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  // The explicit choice survives a resize to three panes; reopening restores the card.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(inbox.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  await expect(inbox.locator('#chat-customer-details').getByRole('heading', { name: 'Ficha del cliente', level: 2 })).toBeVisible();
  console.log(JSON.stringify({ visualLimitation: 'Isolated real components, compiled CSS, no fonts or authenticated shell; expanded sidebar budget only', measurements }));
  return measurements;
}

export function assertLayout(measurements) {
  const failures = [];
  const near = (a, b) => Math.abs(a - b) < 1.5;
  const ordered = (...panes) => panes.every((pane, index) => index === 0 || panes[index - 1].right <= pane.x + 0.5);
  for (const m of measurements) {
    const at = `${m.name} ${m.viewport}x${m.height} (${m.mode}): ${JSON.stringify(m)}`;
    try {
      assert.deepEqual(m.clippedControls, [], `Clipped controls at ${at}`);
      assert.deepEqual(m.smallFonts, [], `Fonts below 11px at ${m.name}`);
      assert.ok(m.scrollWidth <= m.clientWidth, `Horizontal page overflow: ${at}`);
      // Edge-to-edge: the page starts under the navbar, at the sidebar edge, and reaches the right and bottom edges.
      assert.ok(near(m.page.y, NAVBAR_HEIGHT), `Page must start under the navbar: ${at}`);
      assert.ok(near(m.page.x, m.viewport >= SIDEBAR_WIDTH ? 240 : 0), `Page must start at the sidebar edge: ${at}`);
      assert.ok(near(m.page.right, m.clientWidth), `Page must reach the right edge: ${at}`);
      assert.ok(near(m.page.bottom, m.height), `Page must fill the height: ${at}`);
      assert.ok(m.thread.visible && m.thread.width >= 320, `Chat must be visible and not squeezed: ${at}`);
      assert.ok(m.composer.bottom <= m.height + 0.5, `Composer must fit the viewport: ${at}`);
      assert.ok(m.messages.height >= (m.height <= 500 ? 130 : 260), `Usable message area: ${at}`);
      assert.equal(m.messages.overflowY, 'auto');
      assert.ok(m.header.height <= 160 && m.composer.height <= 165, `Chrome dominates thread: ${at}`);
      if (m.mode === 'phone') {
        assert.ok(!m.list.visible && !m.details.visible, `Phones show one pane at a time: ${at}`);
        assert.ok(near(m.thread.x, m.page.x) && near(m.thread.right, m.page.right), `Phone chat spans the page: ${at}`);
        assert.ok(m.thread.y < 160, `Selected chat must be near top: ${at}`);
      } else {
        const panes = m.mode === 'three' ? [m.list, m.thread, m.details] : m.mode === 'two' ? [m.list, m.thread] : [m.thread, m.details];
        assert.ok(panes.every(pane => pane.visible), `Expected ${m.mode} panes visible: ${at}`);
        if (m.mode === 'two') assert.ok(!m.details.visible, `Card closed by default on a two-pane page: ${at}`);
        if (m.mode === 'two-card') assert.ok(!m.list.visible, `Card replaces the list on a two-pane page: ${at}`);
        assert.ok(ordered(...panes), `Panes must not overlap and keep list | chat | card order: ${at}`);
        assert.ok(panes.every(pane => near(pane.y, m.page.y)), `Pane tops must align: ${at}`);
        assert.ok(near(panes[0].x, m.page.x) && near(panes.at(-1).right, m.page.right), `Panes span the page edge to edge: ${at}`);
        const headers = [m.list.visible && m.headers.list, m.headers.chat, m.details.visible && m.headers.details].filter(Boolean);
        assert.ok(headers.every(height => near(height, headers[0])), `Header bars must share a height: ${at}`);
      }
    } catch (error) { failures.push(error.message); }
  }
  assert.deepEqual(failures, [], 'Responsive sizing failures');
}

export async function assertMobileNavigation(page) {
  await page.setViewportSize({ width: 390, height: 1000 });
  const inbox = page.locator('#inbox');
  const list = inbox.getByRole('heading', { name: 'Chats', exact: true });
  const chat = inbox.getByRole('region', { name: 'Chat demo con Camila Rojas' });
  const composer = chat.getByRole('textbox', { name: 'Mensaje de demostración' });
  const banner = chat.getByRole('status').first();
  await expect(list).toBeHidden();
  await expect(chat).toBeVisible();
  // On phones the customer card replaces the chat instead of squeezing it.
  const toggle = chat.getByRole('button', { name: 'Ficha del cliente', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  const card = inbox.locator('#chat-customer-details');
  await expect(card.getByRole('heading', { name: 'Ficha del cliente', level: 2 })).toBeVisible();
  await expect(card.getByRole('heading', { name: 'El asistente capturó', level: 3 })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Abrir oportunidad', exact: true })).toBeVisible();
  await expect(chat).toBeHidden();
  await card.getByRole('button', { name: 'Cerrar ficha del cliente', exact: true }).click();
  await expect(chat).toBeVisible();
  await expect(card).toHaveCount(0);
  assert.ok(await chat.getByRole('list', { name: 'Mensajes de demostración' }).locator('..').evaluate(element => element.clientHeight) >= 260, 'Closing the card must restore the message area');
  await inbox.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(chat).toBeHidden();
  const search = inbox.getByRole('searchbox', { name: 'Buscar conversaciones' });
  await search.fill('Camila');
  const rows = inbox.locator('[data-conversation-list]').getByRole('button', { name: /Rojas|Muñoz|Soto|Torres/ });
  await expect(rows).toHaveCount(1);
  await inbox.getByRole('button', { name: /Camila Rojas/ }).click();
  await inbox.getByRole('button', { name: 'Volver a la lista', exact: true }).click();
  await expect(search).toHaveValue('Camila');
  await expect(rows).toHaveCount(1);
  await inbox.getByRole('button', { name: /Camila Rojas/ }).click();
  await expect(chat).toBeVisible();
  await expect(list).toBeHidden();
  await expect(composer).toBeDisabled();
  await expect(composer).toHaveAttribute('placeholder', 'Toma el chat para escribir');
  await expect(chat.getByText('Demo: no se envían mensajes reales.', { exact: true })).toBeVisible();
  await chat.locator('summary').click();
  await expect(chat.getByText('Se envía por WhatsApp desde el número de Hormiglass', { exact: true })).toBeVisible();
  await chat.locator('summary').click();
  await expect(banner).toContainText('Camila está con el asistente.');
  const quick = chat.getByRole('group', { name: 'Acciones rápidas' });
  await expect(quick.getByRole('button', { name: 'Agendar visita', exact: true })).toBeDisabled();
  await banner.getByRole('button', { name: 'Tomar chat', exact: true }).click();
  await expect(composer).toBeEnabled();
  await expect(composer).toHaveAttribute('placeholder', 'Escribe tu respuesta…');
  await expect(banner).toContainText('Estás atendiendo a Camila.');
  await expect(banner).toContainText(/Si no respondes en \d+:\d{2}, el asistente vuelve a tomar el chat\./);
  await quick.getByRole('button', { name: 'Agendar visita', exact: true }).click();
  await expect(composer).toHaveValue('Agendar visita a terreno');
  for (const [action, dialog] of [['Cotizar', 'Crear cotización demo'], ['Enviar ficha técnica', 'Enviar ficha técnica']]) {
    await quick.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: dialog })).toHaveCount(0);
  }
  await expect(composer).toHaveValue('Agendar visita a terreno');
  await banner.getByRole('button', { name: 'Devolver al asistente', exact: true }).click();
  await expect(composer).toBeDisabled();
  await expect(banner).toContainText('Camila está con el asistente.');
  await page.setViewportSize({ width: 1440, height: 1000 });
}
