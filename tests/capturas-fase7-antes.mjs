import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f7-antes');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas previas de Fase 7...');
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

    // 1. Caja Principal
    await page.goto(`${BASE_URL}/caja`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '01-caja.png') });
    console.log('📸 01-caja.png guardada');

    // 2. Caja Configuración
    await page.goto(`${BASE_URL}/caja/configuracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-caja-configuracion.png') });
    console.log('📸 02-caja-configuracion.png guardada');

    // 3. Reportes
    await page.goto(`${BASE_URL}/reportes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-reportes.png') });
    console.log('📸 03-reportes.png guardada');

    // 4. Administración
    await page.goto(`${BASE_URL}/administracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '04-administracion.png') });
    console.log('📸 04-administracion.png guardada');

    // 5. RRHH Lista
    await page.goto(`${BASE_URL}/rrhh`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '05-rrhh.png') });
    console.log('📸 05-rrhh.png guardada');

    // 6. RRHH Ficha individual
    // Buscamos un enlace hacia /rrhh/[id] o navegamos directamente
    const rrhhLink = await page.$('a[href^="/rrhh/"]');
    if (rrhhLink) {
      const href = await rrhhLink.getAttribute('href');
      await page.goto(`${BASE_URL}${href}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(screenshotsDir, '06-rrhh-id.png') });
      console.log('📸 06-rrhh-id.png guardada desde enlace ' + href);
    } else {
      console.log('⚠️ No se encontró enlace a /rrhh/[id]');
    }

    // 7. Configuración
    await page.goto(`${BASE_URL}/configuracion`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '07-configuracion.png') });
    console.log('📸 07-configuracion.png guardada');

    // 8. Usuarios
    await page.goto(`${BASE_URL}/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '08-usuarios.png') });
    console.log('📸 08-usuarios.png guardada');

    console.log('✅ Capturas de Fase 7 antes tomadas con éxito.');
  } catch (err) {
    console.error('Error durante la toma de capturas previas de Fase 7:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
