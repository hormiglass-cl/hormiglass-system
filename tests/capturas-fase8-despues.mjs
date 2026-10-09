import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const screenshotsDir = path.resolve('tests/screenshots/diseno-f8-despues');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas POSTERIORES de Fase 8 (Acceso y autenticación)...');
  const browser = await chromium.launch({ headless: true });

  const consoleErrors = [];

  try {
    // Desktop context (1440x950)
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await desktopContext.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Desktop] ${msg.text()}`);
    });

    // 1. Login Desktop
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-login.png') });
    console.log('📸 01-login.png guardada');

    // 2. Login Tab Registro Desktop
    const btnRegister = await page.$('button:has-text("Crear cuenta")');
    if (btnRegister) {
      await btnRegister.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '02-login-registro.png') });
      console.log('📸 02-login-registro.png guardada');
    }

    // 3. Recuperar contraseña Desktop
    await page.goto(`${BASE_URL}/auth/recuperar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '04-auth-recuperar.png') });
    console.log('📸 04-auth-recuperar.png guardada');

    // 4. Actualizar contraseña Desktop
    await page.goto(`${BASE_URL}/auth/actualizar-password`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '06-auth-actualizar-password.png') });
    console.log('📸 06-auth-actualizar-password.png guardada');

    await desktopContext.close();

    // Mobile context (375x812 - iPhone)
    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobileContext.newPage();
    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Mobile] ${msg.text()}`);
    });

    // 5. Login Mobile
    await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(screenshotsDir, '03-login-movil.png') });
    console.log('📸 03-login-movil.png guardada');

    // 6. Recuperar contraseña Mobile
    await mobilePage.goto(`${BASE_URL}/auth/recuperar`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(screenshotsDir, '05-auth-recuperar-movil.png') });
    console.log('📸 05-auth-recuperar-movil.png guardada');

    // 7. Actualizar contraseña Mobile
    await mobilePage.goto(`${BASE_URL}/auth/actualizar-password`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(screenshotsDir, '07-auth-actualizar-password-movil.png') });
    console.log('📸 07-auth-actualizar-password-movil.png guardada');

    await mobileContext.close();

    if (consoleErrors.length > 0) {
      console.error(`⚠️ Errores de consola detectados:`, consoleErrors);
    } else {
      console.log('✅ Cero errores de consola durante la captura de Fase 8.');
    }

    console.log('🎉 Todas las capturas posteriores de Fase 8 fueron guardadas exitosamente.');
  } catch (err) {
    console.error('❌ Error capturando posteriores de Fase 8:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
