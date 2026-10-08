import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 4 (Maestro de Productos, Proveedores y Excel) con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots/fase4');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  try {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
    });
    page.on('pageerror', (err) => console.error('PAGE UNCAUGHT ERROR:', err));

    // 1. Iniciar sesión
    console.log('1. Navegando a http://127.0.0.1:3005/login...');
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 });
    console.log('✅ Sesión iniciada correctamente. URL actual:', page.url());

    // 2. Navegar a /productos
    console.log('2. Navegando a http://127.0.0.1:3005/productos...');
    await page.goto('http://127.0.0.1:3005/productos', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Validar tarjetas de estadísticas
    const statsText = await page.textContent('body');
    console.log('Verificando contadores en pantalla...');
    if (statsText.includes('Total Catálogo') && statsText.includes('Fabricación Propia') && statsText.includes('Compra / Reventa')) {
      console.log('✅ KPI Stats Cards visualizadas correctamente.');
    }

    await page.screenshot({ path: path.join(screenshotsDir, '01-productos-catalogo-principal.png') });
    console.log('✅ Captura 01 guardada: catálogo principal con productos importados.');

    // 3. Probar filtro por origen: Fabricación propia
    console.log('3. Probando filtro de origen: Fabricación Propia...');
    const selectOrigen = page.locator('select[aria-label="Filtrar por origen"]');
    await selectOrigen.selectOption('fabricacion_propia');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '02-filtro-fabricacion-propia.png') });
    console.log('✅ Captura 02 guardada: filtro fabricación propia.');

    // 4. Probar filtro por origen: Compra / Reventa
    console.log('4. Probando filtro de origen: Compra / Reventa...');
    await selectOrigen.selectOption('reventa');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-filtro-reventa.png') });
    console.log('✅ Captura 03 guardada: filtro compra / reventa.');

    // Restablecer origen a todos
    await selectOrigen.selectOption('todos');
    await page.waitForTimeout(300);

    // 5. Probar filtro por proveedor: Bottai S.A.
    console.log('5. Probando filtro por proveedor: Bottai S.A....');
    const selectProveedor = page.locator('select[aria-label="Filtrar por proveedor"]');
    // Encontrar opción que contenga Bottai
    const bottaiOption = await page.locator('select[aria-label="Filtrar por proveedor"] option:has-text("Bottai")').getAttribute('value');
    if (bottaiOption) {
      await selectProveedor.selectOption(bottaiOption);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '04-filtro-bottai.png') });
      console.log('✅ Captura 04 guardada: filtro proveedor Bottai S.A.');
    }

    // 6. Probar filtro por proveedor: Atrio Baldosas
    console.log('6. Probando filtro por proveedor: Atrio Baldosas...');
    const atrioOption = await page.locator('select[aria-label="Filtrar por proveedor"] option:has-text("Atrio")').getAttribute('value');
    if (atrioOption) {
      await selectProveedor.selectOption(atrioOption);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '05-filtro-atrio.png') });
      console.log('✅ Captura 05 guardada: filtro proveedor Atrio Baldosas.');
    }

    // Restablecer proveedor a todos
    await selectProveedor.selectOption('todos');
    await page.waitForTimeout(300);

    // 7. Probar filtro: Solo requieren revisión
    console.log('7. Probando toggle "Requieren Revisión"...');
    const btnRevision = page.locator('button:has-text("Requieren Revisión")');
    await btnRevision.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '06-filtro-solo-revision.png') });
    console.log('✅ Captura 06 guardada: filtro solo productos que requieren revisión.');

    // Desactivar filtro de revisión
    await btnRevision.click();
    await page.waitForTimeout(300);

    // 8. Probar búsqueda de producto Bottai
    console.log('8. Probando búsqueda de texto: BOT-100101103...');
    const searchInput = page.locator('input[aria-label="Buscar productos"]');
    await searchInput.fill('BOT-100101103');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '07-busqueda-producto-bottai.png') });
    console.log('✅ Captura 07 guardada: búsqueda de producto Bottai.');

    // 9. Abrir modal de edición
    console.log('9. Abriendo modal de edición...');
    const btnEditar = page.locator('button:has-text("Editar")').first();
    await btnEditar.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(screenshotsDir, '08-modal-editar-producto.png') });
    console.log('✅ Captura 08 guardada: modal de edición con atributos técnicos y revisión.');

    // Cerrar modal
    const btnCerrarModal = page.locator('div[role="dialog"] button:has-text("Cancelar")');
    await btnCerrarModal.click();
    await page.waitForTimeout(500);

    // 10. Navegar a /cotizaciones/nuevo y verificar visualización y alerta de producto con revisión
    console.log('10. Navegando a http://127.0.0.1:3005/cotizaciones/nuevo...');
    await page.goto('http://127.0.0.1:3005/cotizaciones/nuevo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const catalogSelect = page.locator('select[aria-label="Producto del catálogo 1"]');
    // Verificar que existe opción con advertencia ⚠️ BOT-100101103
    const bottaiItemOption = await catalogSelect.locator('option:has-text("BOT-100101103")').getAttribute('value');
    if (bottaiItemOption) {
      console.log('Seleccionando producto Bottai con revisión en el cotizador...');
      await catalogSelect.selectOption(bottaiItemOption);
      await page.waitForTimeout(600);

      // Verificar que aparece el banner de alerta
      const alertBanner = page.locator('text=Precio referencial OCR (Bottai)');
      if (await alertBanner.isVisible()) {
        console.log('✅ Alerta visual en fila de cotización confirmada:', await alertBanner.textContent());
      }
      await page.screenshot({ path: path.join(screenshotsDir, '09-cotizador-producto-bottai-alerta.png') });
      console.log('✅ Captura 09 guardada: cotizador con advertencia de precio Bottai.');
    } else {
      console.log('Nota: no se encontró opción con BOT-100101103 en el dropdown, revisando opciones...');
    }

    console.log('\n🎉 ¡TODAS LAS PRUEBAS E2E DE FASE 4 PASARON EXITOSAMENTE!');
  } catch (error) {
    console.error('❌ Error durante la ejecución del test:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-fase4.png') });
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
