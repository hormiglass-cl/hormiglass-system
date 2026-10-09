import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const screenshotsDir = path.resolve('tests/screenshots/diseno-f8-antes');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('📸 Tomando capturas PREVIAS de Fase 8 (Acceso y autenticación)...');
  const browser = await chromium.launch({ headless: true });

  try {
    // Desktop context
    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
    const page = await desktopContext.newPage();

    // 1. Login Desktop
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-login.png') });
    console.log('📸 01-login.png guardada');

    // 2. Login Tab Registro Desktop
    const btnRegister = await page.$('button:has-text("Crear Cuenta")');
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

    console.log('🎉 Todas las capturas previas de Fase 8 fueron guardadas exitosamente.');
  } catch (err) {
    console.error('❌ Error capturando previas de Fase 8:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
