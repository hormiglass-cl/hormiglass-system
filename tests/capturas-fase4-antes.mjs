import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f4-antes');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas previas de Fase 4...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada.');

    // 1. Clientes lista
    await page.goto(`${BASE_URL}/clientes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '01-clientes-lista.png') });
    console.log('📸 01-clientes-lista.png guardada');

    // Buscar enlace a un cliente
    const linkCliente = page.locator('a[href^="/clientes/"]:not([href="/clientes"])').first();
    let clienteUrl = '/clientes/9e8aa035-bddf-41f2-b42d-dc626d43c332';
    if (await linkCliente.isVisible()) {
      clienteUrl = await linkCliente.getAttribute('href') || clienteUrl;
    }

    // 2. Ficha cliente
    await page.goto(`${BASE_URL}${clienteUrl}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-cliente-ficha.png') });
    console.log('📸 02-cliente-ficha.png guardada');

    // 3. Cotizaciones lista
    await page.goto(`${BASE_URL}/cotizaciones`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-cotizaciones-lista.png') });
    console.log('📸 03-cotizaciones-lista.png guardada');

    // 4. Cotizaciones nueva
    await page.goto(`${BASE_URL}/cotizaciones/nuevo`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '04-cotizaciones-nuevo.png') });
    console.log('📸 04-cotizaciones-nuevo.png guardada');

    // 5. Postventa
    await page.goto(`${BASE_URL}/postventa`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '05-postventa.png') });
    console.log('📸 05-postventa.png guardada');

    console.log('✅ Capturas de Fase 4 antes tomadas con éxito.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

run();
