import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f6-despues');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas posteriores de Fase 6...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada.');

    // 1. Calendario General
    await page.goto(`${BASE_URL}/calendarios/general`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '01-calendario-general.png') });
    console.log('📸 01-calendario-general.png guardada');

    // 2. Visitas a Terreno
    await page.goto(`${BASE_URL}/visitas`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-visitas.png') });
    console.log('📸 02-visitas.png guardada');

    // 3. Planificación Producción Principal
    await page.goto(`${BASE_URL}/planificacion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-planificacion.png') });
    console.log('📸 03-planificacion.png guardada');

    // 4. Planificación Calendario
    await page.goto(`${BASE_URL}/planificacion/calendario`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '04-planificacion-calendario.png') });
    console.log('📸 04-planificacion-calendario.png guardada');

    // 5. Planificación Programa Semanal
    await page.goto(`${BASE_URL}/planificacion/semana`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '05-planificacion-semana.png') });
    console.log('📸 05-planificacion-semana.png guardada');

    // 6. Reventa Principal
    await page.goto(`${BASE_URL}/reventa`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '06-reventa.png') });
    console.log('📸 06-reventa.png guardada');

    // 7. Reventa Calendario
    await page.goto(`${BASE_URL}/reventa/calendario`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '07-reventa-calendario.png') });
    console.log('📸 07-reventa-calendario.png guardada');

    if (consoleErrors.length > 0) {
      console.warn('⚠️ Console errors detected:', consoleErrors);
    } else {
      console.log('✅ Cero errores de consola en todas las páginas.');
    }

    console.log('✅ Capturas de Fase 6 después tomadas con éxito.');
  } catch (err) {
    console.error('Error durante la toma de capturas posteriores de Fase 6:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
