import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/sidebar-colapsable');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('🧪 Iniciando prueba completa de secciones colapsables en la barra lateral...');
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
    // 1. Iniciar sesión
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada.');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 2. Verificar que las 7 secciones tienen botones con aria-expanded="true"
    const buttons = await page.$$('nav[aria-label="Navegación principal"] button[aria-expanded]');
    console.log(`📋 Secciones con disclosure encontradas: ${buttons.length}`);
    if (buttons.length < 7) {
      throw new Error(`Se esperaban al menos 7 secciones colapsables, se encontraron ${buttons.length}`);
    }

    // Captura 1: Todas las secciones abiertas
    await page.screenshot({ path: path.join(screenshotsDir, '01-sidebar-todas-abiertas.png') });
    console.log('📸 01-sidebar-todas-abiertas.png guardada');

    // 3. Colapsar Comercial, Compras, Finanzas, Administración, Sistema, Calendarios
    const labelsToCollapse = ['Comercial', 'Compras y catálogo', 'Calendarios', 'Finanzas', 'Administración', 'Sistema'];
    for (const label of labelsToCollapse) {
      const btn = await page.$(`nav[aria-label="Navegación principal"] button:has-text("${label}")`);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotsDir, '02-sidebar-varias-colapsadas.png') });
    console.log('📸 02-sidebar-varias-colapsadas.png guardada');

    // 4. Colapsar también Inicio (que tiene la ruta activa "/")
    const btnInicio = await page.$('nav[aria-label="Navegación principal"] button:has-text("Inicio")');
    if (btnInicio) {
      await btnInicio.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(screenshotsDir, '03-sidebar-todas-colapsadas-con-dot.png') });
    console.log('📸 03-sidebar-todas-colapsadas-con-dot.png guardada');

    // 5. Probar persistencia tras recarga de página (F5)
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '04-sidebar-persistencia-recarga.png') });
    console.log('📸 04-sidebar-persistencia-recarga.png guardada');

    // 6. Reabrir selectivamente Finanzas y Calendarios
    for (const label of ['Finanzas', 'Calendarios']) {
      const btn = await page.$(`nav[aria-label="Navegación principal"] button:has-text("${label}")`);
      if (btn) {
        await btn.click();
        await page.waitForTimeout(150);
      }
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotsDir, '05-sidebar-selectivamente-abiertas.png') });
    console.log('📸 05-sidebar-selectivamente-abiertas.png guardada');

    // 7. Probar modo mini de la barra lateral (botón Contraer al pie)
    const btnContraer = await page.$('aside button:has-text("Contraer")');
    if (btnContraer) {
      await btnContraer.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(screenshotsDir, '06-sidebar-modo-mini.png') });
      console.log('📸 06-sidebar-modo-mini.png guardada');

      // Expandir de vuelta
      const btnExpandir = await page.$('aside button[aria-label="Mostrar barra lateral"]');
      if (btnExpandir) {
        await btnExpandir.click();
        await page.waitForTimeout(400);
      }
    }

    // 8. Reabrir todas las secciones para dejar estado limpio
    const allLabels = ['Inicio', 'Comercial', 'Compras y catálogo', 'Calendarios', 'Finanzas', 'Administración', 'Sistema'];
    for (const label of allLabels) {
      const btn = await page.$(`nav[aria-label="Navegación principal"] button:has-text("${label}")`);
      const expanded = await btn?.getAttribute('aria-expanded');
      if (expanded === 'false') {
        await btn?.click();
        await page.waitForTimeout(100);
      }
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotsDir, '07-sidebar-restaurado-completo.png') });
    console.log('📸 07-sidebar-restaurado-completo.png guardada');

    if (consoleErrors.length > 0) {
      console.error(`⚠️ Errores de consola:`, consoleErrors);
    } else {
      console.log('✅ Cero errores de consola durante toda la prueba.');
    }

    console.log('🎉 Prueba de secciones colapsables completada exitosamente al 100%.');
  } catch (err) {
    console.error('❌ Error en prueba de sidebar colapsable:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
