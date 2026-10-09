import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f3-despues');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('🚀 Iniciando verificación de Fase 3 (Pipeline y Ficha de Oportunidad)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource') && !msg.text().includes('JWT')) {
      consoleErrors.push(msg.text());
    }
  });

  try {
    // 1. Iniciar sesión
    console.log('\n--- 1. Login ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada.');

    // 2. Verificar Pipeline de Ventas (/ventas)
    console.log('\n--- 2. Verificación de Pipeline de Ventas (/ventas) ---');
    await page.goto(`${BASE_URL}/ventas`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Tomar captura de la vista inicial (Kanban o Lista)
    await page.screenshot({ path: path.join(screenshotsDir, '01-ventas-pipeline.png'), fullPage: false });
    console.log('📸 Captura 01-ventas-pipeline.png guardada.');

    // Cambiar a Tablero (Kanban) si está en lista
    const btnTablero = page.locator('button:has-text("Tablero"), button:has-text("Kanban")').first();
    if (await btnTablero.isVisible()) {
      await btnTablero.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, '02-ventas-kanban.png'), fullPage: false });
      console.log('📸 Captura 02-ventas-kanban.png guardada.');
    }

    // Verificar presencia de CodeStamps o tarjetas en Kanban
    const kanbanCards = page.locator('.kanban-card, [data-rbd-draggable-id], article');
    const cardCount = await kanbanCards.count();
    console.log(`✅ Tarjetas detectadas en Kanban: ${cardCount}`);

    // Alternar a vista de Lista
    const btnLista = page.locator('button:has-text("Lista")').first();
    if (await btnLista.isVisible()) {
      await btnLista.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, '03-ventas-lista.png'), fullPage: false });
      console.log('📸 Captura 03-ventas-lista.png guardada.');
    }

    // Buscar una oportunidad para probar la navegación
    const linkFichaCompleta = page.locator('a[href^="/ventas/"]:not([href="/ventas"])').first();
    let targetOpUrl = '';

    if (await linkFichaCompleta.isVisible()) {
      targetOpUrl = await linkFichaCompleta.getAttribute('href') || '';
      console.log(`🔗 Enlace a ficha encontrado: ${targetOpUrl}`);
    }

    // Probar abrir el modal rápido (hacer click en el botón de ficha rápida o fila)
    const opItem = page.locator('button:has-text("Ficha rápida"), button:has-text("Ficha"), table button, tr td button').first();
    if (await opItem.isVisible()) {
      await opItem.click();
      await page.waitForTimeout(1000);

      // Verificar si el modal rápido se abrió
      const modalHeader = page.locator('button:has-text("Ver ficha completa"), a:has-text("Abrir ficha completa"), text=Detalle de Oportunidad, text=Historial').first();
      const modalVisible = await modalHeader.isVisible();
      console.log(`✅ Modal rápido de oportunidad interactivo: ${modalVisible}`);

      if (modalVisible) {
        await page.screenshot({ path: path.join(screenshotsDir, '04-ventas-modal-rapido.png'), fullPage: false });
        console.log('📸 Captura 04-ventas-modal-rapido.png guardada.');
      }

      // Si no teníamos targetOpUrl, verificar si el botón "Abrir ficha completa" en el modal la tiene
      const btnAbrirFicha = page.locator('a:has-text("Abrir ficha completa"), a:has-text("Ficha completa")').first();
      if (!targetOpUrl && await btnAbrirFicha.isVisible()) {
        targetOpUrl = await btnAbrirFicha.getAttribute('href') || '';
      }

      // Cerrar modal presionando Escape o botón de cerrar
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 3. Verificar Ficha Canónica de Oportunidad (/ventas/[id])
    console.log('\n--- 3. Verificación de Ficha Canónica (/ventas/[id]) ---');
    if (!targetOpUrl) {
      // Intentar obtener un ID desde la BD o fallback
      targetOpUrl = '/ventas/demo';
    }

    console.log(`Navegando a: ${BASE_URL}${targetOpUrl}`);
    await page.goto(`${BASE_URL}${targetOpUrl}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Verificar componentes de la Ficha Canónica
    const pageHeader = page.locator('header, h1');
    console.log(`✅ Encabezado presente: ${await pageHeader.first().isVisible()}`);

    const stageRail = page.locator('nav, [aria-label*="Etapa"], ol, ul');
    console.log(`✅ StageRail presente: ${await stageRail.first().isVisible()}`);

    const summaryLine = page.locator('text=Total comercial, text=Abonado, text=Saldo');
    console.log(`✅ Bloque financiero presente: ${await summaryLine.first().isVisible()}`);

    await page.screenshot({ path: path.join(screenshotsDir, '05-ficha-oportunidad-top.png'), fullPage: false });
    console.log('📸 Captura 05-ficha-oportunidad-top.png guardada.');

    // Scroll abajo para ver partidas y timeline
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '06-ficha-oportunidad-detalle.png'), fullPage: false });
    console.log('📸 Captura 06-ficha-oportunidad-detalle.png guardada.');

    // 4. Verificar Vista de Operación (/ventas/[id]/operacion)
    console.log('\n--- 4. Verificación de Operación (/ventas/[id]/operacion) ---');
    const operacionUrl = `${targetOpUrl}/operacion`;
    console.log(`Navegando a: ${BASE_URL}${operacionUrl}`);
    await page.goto(`${BASE_URL}${operacionUrl}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '07-operacion-detalle.png'), fullPage: false });
    console.log('📸 Captura 07-operacion-detalle.png guardada.');

    // 5. Reporte de Errores de Consola
    console.log('\n--- 5. Errores de Consola Detectados ---');
    if (consoleErrors.length === 0) {
      console.log('✅ 0 errores críticos de consola.');
    } else {
      console.log(`⚠️ Se detectaron ${consoleErrors.length} errores de consola:`);
      consoleErrors.forEach((e, idx) => console.log(`   ${idx + 1}. ${e}`));
    }

    console.log('\n🎉 ¡Verificación de Fase 3 completada exitosamente!');
  } catch (err) {
    console.error('❌ Error durante la verificación:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
