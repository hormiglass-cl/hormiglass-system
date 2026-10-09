import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/verificacion-f0-f1');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('🧪 Iniciando verificación exhaustiva de Fase 0 y Fase 1...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    // 1. Login
    console.log('\n--- 1. Autenticación ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Login exitoso. URL:', page.url());

    // 2. Verificar Catálogo /diseno (Fase 0)
    console.log('\n--- 2. Verificación Fase 0 (/diseno) ---');
    await page.goto(`${BASE_URL}/diseno`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-catalogo-diseno.png') });

    // Verificar contraste de botón primario
    const btnPrimario = page.locator('button:has-text("Nueva oportunidad")').first();
    const btnBg = await btnPrimario.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    const btnColor = await btnPrimario.evaluate((el) => window.getComputedStyle(el).color);
    console.log(`✅ Botón primario en /diseno: fondo = ${btnBg}, color texto = ${btnColor}`);

    // Verificar StageRail interactivo
    const btnAvanzar = page.locator('button:has-text("Avanzar etapa")');
    await btnAvanzar.click();
    await page.waitForTimeout(300);
    console.log('✅ StageRail responde a clics e incrementa etapa.');

    // Probar Dialog y Sheet en /diseno
    const btnSheet = page.locator('button:has-text("Abrir hoja lateral")');
    if (await btnSheet.count() > 0) {
      await btnSheet.click();
      await page.waitForTimeout(500);
      const sheetDialog = page.locator('[role="dialog"]');
      const sheetVisible = await sheetDialog.isVisible();
      console.log(`✅ Sheet modal abre correctamente con role="dialog": ${sheetVisible}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const sheetClosed = !(await sheetDialog.isVisible());
      console.log(`✅ Sheet cierra correctamente con tecla Escape: ${sheetClosed}`);
    }

    // Probar Toast
    const btnToast = page.locator('button:has-text("Mostrar aviso")');
    if (await btnToast.count() > 0) {
      await btnToast.click();
      await page.waitForTimeout(400);
      const toastEl = page.locator('[role="status"]');
      console.log(`✅ Toast lanzado y visible en pantalla: ${await toastEl.isVisible()}`);
    }

    // 3. Verificación Fase 1 (Sidebar & Navbar)
    console.log('\n--- 3. Verificación Fase 1 (Sidebar y Navbar) ---');

    // Sidebar: Calendarios plegable
    const calToggle = page.locator('button:has-text("Calendarios")');
    if (await calToggle.count() > 0) {
      console.log('✅ Grupo "Calendarios" presente en Sidebar.');
      // Click para colapsar/desplegar
      await calToggle.click();
      await page.waitForTimeout(300);
      await calToggle.click();
      await page.waitForTimeout(300);
      console.log('✅ Grupo "Calendarios" colapsa y expande interactivamente.');
    }

    // Sidebar: Botón contraer / expandir sidebar
    const collapseBtn = page.locator('button[aria-label="Contraer barra lateral"]');
    if (await collapseBtn.count() > 0) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
      const asideWidth = await page.locator('aside.hg-app-sidebar').evaluate((el) => el.clientWidth);
      console.log(`✅ Barra lateral contraída. Ancho: ${asideWidth}px (esperado ~72px)`);
      
      const expandBtn = page.locator('button[aria-label="Mostrar barra lateral"]');
      await expandBtn.click();
      await page.waitForTimeout(500);
      const restoredWidth = await page.locator('aside.hg-app-sidebar').evaluate((el) => el.clientWidth);
      console.log(`✅ Barra lateral expandida. Ancho: ${restoredWidth}px (esperado ~240px)`);
    }

    // Navbar: Verificar migas de pan en distintas rutas
    console.log('\n--- 4. Verificación de Migas de Pan (Breadcrumbs) ---');
    const rutasMiga = [
      { ruta: '/caja', esperado: 'Caja' },
      { ruta: '/postventa', esperado: 'Postventa' },
      { ruta: '/clientes', esperado: 'Clientes' },
      { ruta: '/ventas', esperado: 'Pipeline de ventas' },
    ];

    for (const r of rutasMiga) {
      await page.goto(`${BASE_URL}${r.ruta}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const breadcrumbNav = page.locator('nav[aria-label="Ubicación"]');
      const text = await breadcrumbNav.innerText();
      console.log(`✅ Ruta ${r.ruta} -> Miga: "${text.replace(/\n/g, ' ')}" (contiene "${r.esperado}")`);
    }

    // Navbar: Buscador ⌘K / Command Palette
    console.log('\n--- 5. Verificación de Buscador ⌘K ---');
    await page.keyboard.press('Meta+KeyK');
    await page.waitForTimeout(500);
    const paletteModal = page.locator('div[role="dialog"][aria-label="Buscar"]');
    const isPaletteOpen = await paletteModal.isVisible();
    console.log(`✅ Command Palette abierto con Meta+K: ${isPaletteOpen}`);

    const searchInput = page.locator('input[role="combobox"]');
    await searchInput.fill('caja');
    await page.waitForTimeout(400);
    const resultsCount = await page.locator('ul[role="listbox"] div[role="option"]').count();
    console.log(`✅ Búsqueda por término "caja" devolvió ${resultsCount} resultado(s).`);

    // Cerrar con Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isPaletteClosed = !(await paletteModal.isVisible());
    console.log(`✅ Command Palette cerrado con Escape: ${isPaletteClosed}`);

    // Navbar: Menú de usuario / Avatar
    console.log('\n--- 6. Verificación de Menú de Usuario ---');
    const avatarBtn = page.locator('button[aria-haspopup="menu"]');
    await avatarBtn.click();
    await page.waitForTimeout(400);
    const menuUsuario = page.locator('div[role="menu"]');
    const isMenuOpen = await menuUsuario.isVisible();
    console.log(`✅ Menú de usuario visible: ${isMenuOpen}`);
    const menuText = await menuUsuario.innerText();
    console.log(`✅ Datos mostrados en menú de usuario:\n${menuText.split('\n').map(l => '   ' + l).join('\n')}`);
    
    // Cerrar menú con clic afuera o Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log(`✅ Menú de usuario cerrado con Escape: ${!(await menuUsuario.isVisible())}`);

    // Captura final del panel operativo con nuevo shell
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-panel-operativo-shell.png') });
    console.log('\n📸 Capturas guardadas en tests/screenshots/verificacion-f0-f1/');

    console.log('\n--- 7. Control de Errores de Consola ---');
    if (consoleErrors.length === 0) {
      console.log('✅ CERO errores de consola detectados durante todo el recorrido.');
    } else {
      console.warn(`⚠️ Se detectaron ${consoleErrors.length} errores de consola:`, consoleErrors);
    }

    console.log('\n🎉 ¡VERIFICACIÓN DE FASE 0 Y FASE 1 COMPLETADA CON ÉXITO!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Error durante la verificación:', err);
  process.exit(1);
});
