import { chromium } from 'playwright';
import path from 'path';

async function run() {
  console.log('🚀 Probando cotización con saltos de línea multilínea reales...');
  const screenshotsDir = path.resolve('tests/screenshots');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

    // Ir a /cotizaciones/nuevo
    await page.goto('http://127.0.0.1:3005/cotizaciones/nuevo', { waitUntil: 'networkidle' });

    // Seleccionar cliente si hay opciones
    const clientSelect = page.locator('select').first();
    const count = await clientSelect.locator('option').count();
    if (count > 1) {
      await clientSelect.selectOption({ index: 1 });
    }

    // Llenar condiciones multilínea
    const condicionesText = 'Condición 1: Terreno limpio y despejado.\nCondición 2: Pago 50% al contratar y 50% a la entrega.\nIncluye traslados de material y emboquillado.';
    const condTextarea = page.locator('textarea[placeholder*="Condiciones comerciales"]');
    await condTextarea.fill(condicionesText);

    // Llenar descripción de producto multilínea
    const productoDescText = 'Suministro e Instalación Cierro Hormigón\nModelo: Cierro Normal\nAltura: 1.80 H\nIncluye:\n- Mano de obra\n- Arena, Gravilla y cemento\n- Traslados de material';
    const prodTextarea = page.locator('textarea[placeholder*="Descripción de la partida"]');
    await prodTextarea.fill(productoDescText);

    // Llenar precio y cantidad
    await page.locator('input[type="number"]').first().fill('100'); // cantidad
    await page.locator('input[type="number"]').nth(1).fill('25000'); // precio

    await page.screenshot({ path: path.join(screenshotsDir, '05-form-filled-multiline.png') });

    // Guardar cotización
    console.log('Guardando cotización...');
    await page.click('button:has-text("Emitir Cotización")');

    // Esperar redirección a /cotizaciones
    await page.waitForURL((url) => url.pathname.includes('/cotizaciones') && !url.pathname.includes('/nuevo'), { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Abrir la primera cotización de la lista (la recién creada)
    const eyeButtons = await page.$$('button[title="Previsualizar PDF"]');
    if (eyeButtons.length > 0) {
      await eyeButtons[0].click();
      await page.waitForSelector('.border.border-gray-400', { timeout: 10000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '06-modal-multiline-preview.png') });
      console.log('✅ Captura de cotización multilínea guardada en 06-modal-multiline-preview.png');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
