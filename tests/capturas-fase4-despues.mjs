import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f4-despues');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas de Fase 4 (después de migración)...');
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
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '01-clientes-lista.png') });
    console.log('📸 01-clientes-lista.png guardada');

    // Buscar enlace real a un cliente
    const clientRowLink = page.locator('table tbody tr a[href^="/clientes/"]').first();
    await clientRowLink.waitFor({ state: 'visible', timeout: 10000 });
    const clienteUrl = await clientRowLink.getAttribute('href');
    console.log('🔗 Cliente URL real encontrado:', clienteUrl);

    // 2. Ficha cliente
    await page.goto(`${BASE_URL}${clienteUrl}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    // Wait for the client data to populate
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-cliente-ficha.png') });
    console.log('📸 02-cliente-ficha.png guardada');

    // 3. Cotizaciones lista
    await page.goto(`${BASE_URL}/cotizaciones`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '03-cotizaciones-lista.png') });
    console.log('📸 03-cotizaciones-lista.png guardada');

    // 4. Cotizaciones nueva
    await page.goto(`${BASE_URL}/cotizaciones/nuevo`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '04-cotizaciones-nuevo.png') });
    console.log('📸 04-cotizaciones-nuevo.png guardada');

    // 5. Postventa
    await page.goto(`${BASE_URL}/postventa`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    await page.screenshot({ path: path.join(screenshotsDir, '05-postventa.png') });
    console.log('📸 05-postventa.png guardada');

    // 6. Postventa Ficha Sheet
    const fichaBtn = page.locator('button:has-text("Ficha")').first();
    if (await fichaBtn.isVisible()) {
      await fichaBtn.click();
      await page.waitForSelector('aside[role="dialog"]', { timeout: 5000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, '06-postventa-sheet.png') });
      console.log('📸 06-postventa-sheet.png guardada');
    }

    console.log('✅ Todas las capturas de Fase 4 tomadas con éxito.');
  } catch (err) {
    console.error('Error durante la toma de capturas:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
