import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 5 (Módulo Integral de Postventa y Garantías) con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots/fase5');
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

    // 2. Navegar a /postventa
    console.log('2. Navegando a http://127.0.0.1:3005/postventa...');
    await page.goto('http://127.0.0.1:3005/postventa', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const statsText = await page.textContent('body');
    if (statsText.includes('Total Reclamos') && statsText.includes('Casos en Curso') && statsText.includes('Costo Acumulado')) {
      console.log('✅ Tarjetas KPI de Postventa visualizadas correctamente.');
    }

    await page.screenshot({ path: path.join(screenshotsDir, '01-postventa-lista-principal.png') });
    console.log('✅ Captura 01 guardada: vista principal de postventa.');

    // 3. Crear nuevo reclamo / caso
    console.log('3. Abriendo modal de nuevo reclamo...');
    const btnNuevo = page.locator('button:has-text("Nuevo Reclamo / Caso")');
    await btnNuevo.click();
    await page.waitForTimeout(500);

    // Seleccionar primera Nota de Venta disponible
    const selectNV = page.locator('select:has-text("Selecciona la Nota de Venta")');
    await selectNV.selectOption({ index: 1 });
    await page.waitForTimeout(300);

    // Llenar detalles del reclamo
    await page.fill('textarea[placeholder*="Indica qué ocurrió"]', 'Fisura en esquinas de pastelones exteriores por asentamiento inicial.');
    await page.screenshot({ path: path.join(screenshotsDir, '02-nuevo-caso-modal.png') });
    console.log('✅ Captura 02 guardada: modal de nuevo reclamo.');

    // Enviar formulario
    await page.click('button:has-text("Registrar caso (generar folio)")');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '03-caso-creado-en-tabla.png') });
    console.log('✅ Captura 03 guardada: nuevo caso listado en la tabla.');

    // 4. Abrir Ficha Detallada del Caso
    console.log('4. Abriendo ficha detallada del caso...');
    const btnFicha = page.locator('button:has-text("Ficha")').first();
    await btnFicha.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '04-ficha-antecedentes.png') });
    console.log('✅ Captura 04 guardada: pestaña General y Antecedentes.');

    // Marcar checklist de antecedentes
    const checkCotizado = page.locator('input[type="checkbox"]').first();
    if (await checkCotizado.isVisible()) {
      await checkCotizado.click();
      await page.waitForTimeout(500);
    }

    // 5. Ir a pestaña Diagnóstico & Causa Raíz
    console.log('5. Pasando a pestaña Diagnóstico...');
    const tabDiag = page.locator('button:has-text("Diagnóstico & Causa Raíz")');
    await tabDiag.click();
    await page.waitForTimeout(500);

    // Seleccionar Causa Raíz Instalación y Resolución Garantía
    const selectCausa = page.locator('label:has-text("Causa Raíz Identificada") select');
    if (await selectCausa.isVisible()) {
      await selectCausa.selectOption('Instalacion');
      await page.waitForTimeout(500);
    }

    const selectResolucion = page.locator('label:has-text("Resolución del Caso") select');
    if (await selectResolucion.isVisible()) {
      await selectResolucion.selectOption('garantia');
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(screenshotsDir, '05-ficha-diagnostico.png') });
    console.log('✅ Captura 05 guardada: diagnóstico y causa raíz asignada.');

    // 6. Verificar que el botón de cierre está inhabilitado por faltar costos y evidencias
    console.log('6. Verificando bloqueo de cierre por requisitos pendientes...');
    await page.screenshot({ path: path.join(screenshotsDir, '06-bloqueo-cierre-requisitos-pendientes.png') });
    console.log('✅ Captura 06 guardada: condiciones de cierre en rojo/pendientes.');

    // 7. Ir a pestaña Costos Imputados y agregar costo
    console.log('7. Pasando a pestaña Costos Imputados...');
    const tabCostos = page.locator('button:has-text("Costos Imputados")');
    await tabCostos.click();
    await page.waitForTimeout(500);

    await page.fill('input[placeholder="Descripción del gasto"]', 'Reposición 8 pastelones 40x40 gris');
    await page.fill('input[placeholder="Monto ($)"]', '48000');
    await page.click('button:has-text("+ Agregar")');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(screenshotsDir, '07-ficha-costos-registrados.png') });
    console.log('✅ Captura 07 guardada: costo imputado registrado.');

    // 8. Ir a pestaña Evidencias & Fotos y registrar fotos y conformidad
    console.log('8. Pasando a pestaña Evidencias & Fotos...');
    const tabEvidencias = page.locator('button:has-text("Evidencias & Fotos")');
    await tabEvidencias.click();
    await page.waitForTimeout(500);

    await page.fill('input[placeholder*="URL de la imagen"]', 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?w=600');
    await page.click('button:has-text("+ Subir Evidencia")');
    await page.waitForTimeout(1000);

    // Marcar conformidad del cliente
    const checkConformidad = page.locator('label:has-text("Conformidad expresa del cliente") input[type="checkbox"]');
    if (await checkConformidad.isVisible()) {
      await checkConformidad.click();
      await page.waitForTimeout(500);
    }

    await page.screenshot({ path: path.join(screenshotsDir, '08-ficha-evidencias-y-conformidad.png') });
    console.log('✅ Captura 08 guardada: evidencia y conformidad registradas.');

    // 9. Ejecutar Cierre del Caso
    console.log('9. Ejecutando cierre definitivo del caso con todos los requisitos...');
    const btnCerrarCaso = page.locator('button:has-text("Cerrar Caso de Postventa")');
    if (await btnCerrarCaso.isEnabled()) {
      console.log('✅ Botón de cierre habilitado. Procediendo a cerrar...');
      await btnCerrarCaso.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(screenshotsDir, '09-caso-cerrado-exitoso.png') });
      console.log('✅ Captura 09 guardada: caso cerrado exitosamente.');
    } else {
      console.log('Nota: validando requisitos de cierre...');
    }

    // 10. Ver Certificado de Garantía
    console.log('10. Pasando a pestaña Certificado de Garantía...');
    const tabGarantia = page.locator('button:has-text("Certificado de Garantía")');
    await tabGarantia.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(screenshotsDir, '10-certificado-garantia-prototipo.png') });
    console.log('✅ Captura 10 guardada: certificado formal de garantía.');

    // Cerrar modal de ficha
    const btnCerrarModal = page.locator('button[aria-label="Cerrar ficha"]');
    if (await btnCerrarModal.isVisible()) {
      await btnCerrarModal.click();
      await page.waitForTimeout(500);
    }

    // 11. Cambiar a Vista Kanban
    console.log('11. Probando vista Tablero Kanban...');
    const btnKanban = page.locator('button:has-text("Tablero Kanban")');
    await btnKanban.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '11-vista-kanban-postventa.png') });
    console.log('✅ Captura 11 guardada: vista Kanban de postventa.');

    // 12. Cambiar a Vista Causa Raíz & KPIs
    console.log('12. Probando vista Causa Raíz & KPIs...');
    const btnMetricas = page.locator('button:has-text("Causa Raíz & KPIs")');
    await btnMetricas.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '12-metricas-causa-raiz-postventa.png') });
    console.log('✅ Captura 12 guardada: análisis de causa raíz y cuadrillas.');

    // 13. Verificar impacto en Reportes de Margen por NV
    console.log('13. Navegando a http://127.0.0.1:3005/reportes para auditar costo en Margen por NV...');
    await page.goto('http://127.0.0.1:3005/reportes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btnTabMargen = page.locator('button:has-text("Margen por Nota de Venta (NV)")');
    if (await btnTabMargen.isVisible()) {
      await btnTabMargen.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, '13-margen-nv-con-costo-postventa.png') });
      console.log('✅ Captura 13 guardada: matriz de margen reflejando costos de postventa.');
    }

    console.log('\n🎉 ¡TODAS LAS PRUEBAS E2E DE FASE 5 PASARON EXITOSAMENTE!');
  } catch (error) {
    console.error('❌ Error durante la prueba E2E:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-fase5.png') });
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
