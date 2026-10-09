import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f5-antes');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas previas de Fase 5...');
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

    // 1. Órdenes de compra lista
    await page.goto(`${BASE_URL}/ordenes-compra`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '01-ordenes-compra-lista.png') });
    console.log('📸 01-ordenes-compra-lista.png guardada');

    // 2. Órdenes de compra nueva
    await page.goto(`${BASE_URL}/ordenes-compra/nuevo`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-ordenes-compra-nuevo.png') });
    console.log('📸 02-ordenes-compra-nuevo.png guardada');

    // 3. Asignaciones de OC (buscar enlace o usar OC existente)
    await page.goto(`${BASE_URL}/ordenes-compra`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const linkAsignacion = page.locator('a[href*="/asignaciones"]').first();
    if (await linkAsignacion.isVisible()) {
      const href = await linkAsignacion.getAttribute('href');
      await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '03-ordenes-compra-asignaciones.png') });
      console.log('📸 03-ordenes-compra-asignaciones.png guardada');
    }

    // 4. Proveedores lista
    await page.goto(`${BASE_URL}/proveedores`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '04-proveedores-lista.png') });
    console.log('📸 04-proveedores-lista.png guardada');

    // 5. Productos catálogo
    await page.goto(`${BASE_URL}/productos`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '05-productos-catalogo.png') });
    console.log('📸 05-productos-catalogo.png guardada');

    console.log('✅ Capturas de Fase 5 antes tomadas con éxito.');
  } catch (err) {
    console.error('Error durante la toma de capturas previas:', err);
  } finally {
    await browser.close();
  }
}

run();
