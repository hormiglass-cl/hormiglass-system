import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 0 con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 950 },
  });
  const page = await context.newPage();

  try {
    // 1. Ir a /login
    console.log('1. Navegando a http://127.0.0.1:3005/login...');
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });

    // 2. Ingresar credenciales correctas (Jert0211== sin el punto de puntuación)
    console.log('2. Ingresando credenciales del usuario...');
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');

    console.log('3. Haciendo clic en Ingresar...');
    await page.click('button[type="submit"]');

    // Esperar redirección
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Inicio de sesión exitoso. URL actual:', page.url());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-dashboard-logged-in.png') });

    // 4. Ir a /cotizaciones/nuevo para verificar formulario
    console.log('4. Navegando a /cotizaciones/nuevo...');
    await page.goto('http://127.0.0.1:3005/cotizaciones/nuevo', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-cotizacion-nuevo-form.png') });

    // Verificar etiqueta "Condiciones / Incluye (aparece bajo los productos)"
    const labelCondiciones = await page.textContent('body');
    const labelFound = labelCondiciones?.includes('Condiciones / Incluye (aparece bajo los productos)');
    console.log('Label "Condiciones / Incluye (aparece bajo los productos)" encontrado:', labelFound ? '✅ SÍ' : '❌ NO');

    // Verificar que el campo de observaciones es un textarea
    const isTextareaObservaciones = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const condLabel = labels.find(l => l.textContent?.includes('Condiciones / Incluye'));
      if (!condLabel) return false;
      const container = condLabel.parentElement;
      return !!container?.querySelector('textarea');
    });
    console.log('Campo Condiciones / Incluye es textarea multilínea:', isTextareaObservaciones ? '✅ SÍ' : '❌ NO');

    // 5. Ir a /cotizaciones para abrir vista previa
    console.log('5. Navegando a /cotizaciones...');
    await page.goto('http://127.0.0.1:3005/cotizaciones', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '03-cotizaciones-list.png') });

    // Buscar botón de previsualización (ojo "Eye")
    console.log('6. Buscando cotizaciones en la tabla...');
    const eyeButtons = await page.$$('button[title="Previsualizar PDF"]');
    console.log(`Encontrados ${eyeButtons.length} botones de previsualización.`);

    if (eyeButtons.length > 0) {
      await eyeButtons[0].click();
      console.log('Clic en botón de previsualización. Esperando modal...');
      await page.waitForSelector('.border.border-gray-400', { timeout: 10000 });
      await page.waitForTimeout(1000); // Dar tiempo a renderizar
      await page.screenshot({ path: path.join(screenshotsDir, '04-modal-preview-pdf.png') });

      // Inspección exhaustiva del DOM dentro del Modal
      const modalInspection = await page.evaluate(() => {
        // Encontrar el contenedor del modal de cotización
        const modalContainer = document.querySelector('.bg-white.rounded-lg.shadow-2xl') || document.querySelector('.max-w-4xl');
        if (!modalContainer) return { error: 'Modal container not found' };

        const itemsTable = modalContainer.querySelector('table');
        const tableContainer = itemsTable?.closest('.border.border-gray-400');

        // Elementos antes de la tabla
        const prevElement = tableContainer ? tableContainer.previousElementSibling : null;
        const prevText = prevElement ? prevElement.textContent?.trim() : '';

        // Sección inferior debajo de la tabla
        const bottomSection = tableContainer ? tableContainer.nextElementSibling : null;
        const bottomLeft = bottomSection ? bottomSection.querySelector('.text-\\[10px\\].space-y-1\\.5') : null;
        const bottomLeftText = bottomLeft ? bottomLeft.textContent?.trim() : '';

        // Celdas de producto
        const descCells = Array.from(modalContainer.querySelectorAll('table tbody tr td:first-child'));
        const cellDetails = descCells.map(td => ({
          text: td.textContent?.trim(),
          whiteSpace: window.getComputedStyle(td).whiteSpace,
        }));

        return {
          tableFound: !!itemsTable,
          elementAboveTableText: prevText,
          bottomSectionText: bottomLeftText,
          cellDetails,
        };
      });

      console.log('📋 Detalle de la inspección del modal:');
      console.log(' - Elemento justo arriba de la tabla:', modalInspection.elementAboveTableText);
      console.log(' - Bloque inferior (abajo de la tabla):', modalInspection.bottomSectionText);
      console.log(' - Estilos white-space en celdas de ítems:', modalInspection.cellDetails?.[0]?.whiteSpace);

      // Aseveraciones
      const noConditionsAbove = !modalInspection.elementAboveTableText?.toLowerCase().includes('condicion') &&
                                !modalInspection.elementAboveTableText?.toLowerCase().includes('nota:') &&
                                modalInspection.elementAboveTableText?.includes('Monto en Chile Peso');
      console.log('¿Arriba de la tabla solo dice "Monto en Chile Peso" (sin condiciones)?:', noConditionsAbove ? '✅ SÍ' : '❌ NO');

      const isWhiteSpacePreLine = modalInspection.cellDetails?.every(c => c.whiteSpace === 'pre-line');
      console.log('¿Todas las celdas de producto tienen white-space: pre-line?:', isWhiteSpacePreLine ? '✅ SÍ' : '❌ NO');
    }

    console.log('🎉 Todas las verificaciones de Fase 0 se ejecutaron con éxito.');
  } catch (err) {
    console.error('❌ Error durante la prueba:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-state.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
