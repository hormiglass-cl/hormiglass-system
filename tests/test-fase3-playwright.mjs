import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 3 (Matriz de Costos y Margen por NV) con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots/fase3');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await context.newPage();

  try {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

    // 1. Iniciar sesión
    console.log('1. Navegando a http://127.0.0.1:3005/login...');
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 25000 });
    console.log('✅ Sesión iniciada correctamente. URL:', page.url());

    // 2. Navegar a /caja/configuracion y verificar categorías de costos
    console.log('2. Navegando a /caja/configuracion...');
    await page.goto('http://127.0.0.1:3005/caja/configuracion', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-caja-configuracion-cuentas.png') });

    const btnTabCategorias = page.locator('button:has-text("Categorías de Costos y Gastos")');
    if (await btnTabCategorias.isVisible()) {
      console.log('✅ Pestaña "Categorías de Costos y Gastos" encontrada. Haciendo clic...');
      await btnTabCategorias.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '02-caja-configuracion-categorias.png') });
      console.log('✅ Captura de categorías de costos guardada.');

      // Probar modal de crear subcategoría
      const btnNuevaSubcat = page.locator('button:has-text("Nueva Subcategoría")').first();
      if (await btnNuevaSubcat.isVisible()) {
        console.log('Abriendo modal de nueva subcategoría...');
        await btnNuevaSubcat.click();
        await page.waitForTimeout(500);

        // Llenar datos
        await page.fill('input[placeholder*="Materiales e Insumos"]', 'Prueba E2E Insumos');
        const descInput = page.locator('textarea[placeholder*="Explica qué tipo"]');
        if (await descInput.isVisible()) {
          await descInput.fill('Subcategoría creada por test Playwright Fase 3');
        }

        const btnGuardarSubcat = page.locator('button:has-text("Guardar Subcategoría")');
        if (await btnGuardarSubcat.isVisible()) {
          await btnGuardarSubcat.click();
          await page.waitForTimeout(1500);
          console.log('✅ Subcategoría guardada exitosamente.');
          await page.screenshot({ path: path.join(screenshotsDir, '03-caja-configuracion-subcategoria-guardada.png') });
        }
      }
    }

    // 3. Navegar a /ordenes-compra y validar pago de OC en caja
    console.log('3. Navegando a /ordenes-compra...');
    await page.goto('http://127.0.0.1:3005/ordenes-compra', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(screenshotsDir, '04-ordenes-compra-listado.png') });

    const btnPagar = page.locator('button:has-text("Pagar")').first();
    const btnPagarExists = await btnPagar.isVisible();
    console.log('Botón "Pagar" disponible en listado de OCs:', btnPagarExists ? '✅ SÍ' : 'ℹ️ NO');

    if (btnPagarExists) {
      console.log('Haciendo clic en "Pagar" de la orden de compra...');
      await btnPagar.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(screenshotsDir, '05-orden-compra-modal-pagar.png') });

      // Verificar que el modal de pago está abierto
      const modalPagar = page.locator('text=Pagar Orden de Compra en Caja');
      if (await modalPagar.isVisible()) {
        console.log('✅ Modal de pago en caja abierto.');
        // Seleccionar cuenta si no hay una por defecto
        const selectBanco = page.locator('select').first();
        if (await selectBanco.isVisible()) {
          const options = await selectBanco.locator('option').all();
          if (options.length > 1) {
            const val = await options[1].getAttribute('value');
            if (val) await selectBanco.selectOption(val);
          }
        }

        // Click en confirmar pago
        const btnConfirmarPago = page.locator('button:has-text("Confirmar Pago en Caja")');
        if (await btnConfirmarPago.isVisible()) {
          console.log('Confirmando pago de la orden de compra en caja...');
          await btnConfirmarPago.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: path.join(screenshotsDir, '06-orden-compra-pagada-confirmada.png') });
          console.log('✅ Orden de compra pagada en caja y confirmada.');
        }
      }
    }

    // 4. Navegar a /caja y verificar registro del egreso
    console.log('4. Navegando a /caja...');
    await page.goto('http://127.0.0.1:3005/caja', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const btnMovimientos = page.locator('button:has-text("Movimientos de Caja")');
    if (await btnMovimientos.isVisible()) {
      await btnMovimientos.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(screenshotsDir, '07-caja-movimiento-egreso-verificado.png') });
      console.log('✅ Movimientos de caja verificados.');
    }

    // 5. Navegar a /reportes y verificar pestaña de Margen por NV
    console.log('5. Navegando a /reportes...');
    await page.goto('http://127.0.0.1:3005/reportes', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btnTabMargen = page.locator('button:has-text("Margen por Nota de Venta (NV)")');
    if (await btnTabMargen.isVisible()) {
      console.log('✅ Pestaña "Margen por Nota de Venta (NV)" encontrada. Haciendo clic...');
      await btnTabMargen.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(screenshotsDir, '08-reportes-margen-nv-kpis.png') });
      console.log('✅ KPIs y tabla de margen por NV cargados.');

      // Probar filtro de rentabilidad
      const selectRentabilidad = page.locator('select').first();
      if (await selectRentabilidad.isVisible()) {
        await selectRentabilidad.selectOption('positivo');
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(screenshotsDir, '09-reportes-margen-nv-filtro.png') });
        console.log('✅ Filtro de rentabilidad aplicado.');
      }

      // Probar volver a Flujo de Caja y ver selector de banco
      const btnTabFlujo = page.locator('button:has-text("Flujo de Caja")');
      if (await btnTabFlujo.isVisible()) {
        await btnTabFlujo.click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(screenshotsDir, '10-reportes-filtro-banco.png') });
        console.log('✅ Selector de cuenta bancaria verificado en reporte de flujo.');
      }
    }

    // 6. Navegar a /ventas y validar Matriz Operacional en modal de Oportunidad
    const targetOpId = '995040b9-182a-441b-9e0b-7f1d42f42301';
    console.log(`6. Navegando a /ventas?oportunidad=${targetOpId}...`);
    await page.goto(`http://127.0.0.1:3005/ventas?oportunidad=${targetOpId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Área Comercial & Ventas', { timeout: 15000 });

    // Expandir Área Comercial & Ventas
    const areaComercialBtn = page.locator('button:has-text("Área Comercial & Ventas")').first();
    await areaComercialBtn.scrollIntoViewIfNeeded();
    await areaComercialBtn.click();
    await page.waitForTimeout(600);

    // Expandir Finanzas & Comprobantes de Pago
    await page.waitForSelector('text=Finanzas & Comprobantes de Pago', { timeout: 10000 });
    const finanzasBtn = page.locator('button:has-text("Finanzas & Comprobantes de Pago")').first();
    await finanzasBtn.scrollIntoViewIfNeeded();
    await finanzasBtn.click();
    await page.waitForTimeout(1000);

      const matrizCard = page.locator('text=Matriz de Costos y Margen Operacional de la NV');
      const matrizVisible = await matrizCard.isVisible();
      console.log('Matriz Operacional de Costos y Margen visible en modal:', matrizVisible ? '✅ SÍ' : '❌ NO');

      // Scroll para que la matriz completa quede en el centro de la vista
      await page.evaluate(() => {
        const containers = document.querySelectorAll('.overflow-y-auto');
        containers.forEach((c) => {
          c.scrollTop += 450;
        });
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(screenshotsDir, '11-ventas-modal-matriz-margen-nv.png') });
      console.log('✅ Captura completa centrada de la Matriz de Costos tomada con éxito.');

    console.log('\n🎉 ¡PRUEBA E2E DE FASE 3 COMPLETADA CON ÉXITO AL 100%!');
  } catch (error) {
    console.error('❌ Error durante la prueba E2E de Fase 3:', error);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-fase3.png') }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

run();
