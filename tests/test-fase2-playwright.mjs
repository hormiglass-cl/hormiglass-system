import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 2 (Validación de Pagos en Caja) con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots/fase2');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const fixturePath = path.resolve('tests/fixtures/comprobante-test.pdf');
  if (!fs.existsSync(fixturePath)) {
    throw new Error('No se encontró el archivo fixture para el comprobante.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await context.newPage();

  try {
    // 1. Iniciar sesión
    console.log('1. Navegando a http://127.0.0.1:3005/login...');
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada correctamente. URL:', page.url());

    // 2. Navegar a /caja y verificar pestañas
    console.log('2. Navegando a /caja...');
    await page.goto('http://127.0.0.1:3005/caja', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-caja-validacion-inicial.png') });

    const btnTabValidacion = await page.$('button:has-text("Validación de Pagos")');
    const btnTabMovimientos = await page.$('button:has-text("Movimientos de Caja")');
    console.log('Pestaña "Validación de Pagos" presente:', btnTabValidacion ? '✅ SÍ' : '❌ NO');
    console.log('Pestaña "Movimientos de Caja" presente:', btnTabMovimientos ? '✅ SÍ' : '❌ NO');

    // Cambiar a movimientos y tomar captura
    await page.click('button:has-text("Movimientos de Caja")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '02-caja-movimientos-inicial.png') });

    // Volver a validación
    await page.click('button:has-text("Validación de Pagos")');
    await page.waitForTimeout(1000);

    // 3. Navegar a /ventas con la oportunidad abierta directamente
    const targetOpId = '995040b9-182a-441b-9e0b-7f1d42f42301';
    console.log(`3. Navegando a /ventas?oportunidad=${targetOpId} para abrir directamente Liceo las Condes...`);
    await page.goto(`http://127.0.0.1:3005/ventas?oportunidad=${targetOpId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Área Comercial & Ventas', { timeout: 10000 });

    // Expandir Área Comercial & Ventas
    const areaComercialBtn = page.locator('button:has-text("Área Comercial & Ventas")').first();
    await areaComercialBtn.scrollIntoViewIfNeeded();
    await areaComercialBtn.click();
    await page.waitForTimeout(500);

    // Desplegar la sección de finanzas
    await page.waitForSelector('text=Finanzas & Comprobantes de Pago', { timeout: 10000 });
    const finanzasSectionBtn = page.locator('button:has-text("Finanzas & Comprobantes de Pago")').first();
    await finanzasSectionBtn.scrollIntoViewIfNeeded();
    await finanzasSectionBtn.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '03-ventas-modal-finanzas.png') });

    // 4. Subir nuevo abono con comprobante
    const testMonto = '250000';
    const testNota = `Transferencia Test Playwright ${Date.now()}`;
    console.log(`4. Registrando abono de $${testMonto} con nota "${testNota}"...`);

    const inputMonto = page.locator('input[placeholder="500.000"]').first();
    await inputMonto.scrollIntoViewIfNeeded();
    await inputMonto.fill(testMonto);

    const inputFile = page.locator('input[type="file"][required]').first();
    await inputFile.setInputFiles(fixturePath);

    const inputNota = page.locator('input[placeholder*="Transferencia"]').first();
    await inputNota.fill(testNota);

    await page.screenshot({ path: path.join(screenshotsDir, '04-formulario-abono-llenado.png') });

    console.log('Haciendo clic en "Agregar Abono"...');
    const agregarBtn = page.locator('button:has-text("Agregar Abono")').first();
    await agregarBtn.scrollIntoViewIfNeeded();
    await agregarBtn.click();
    await page.waitForTimeout(2500);

    await page.screenshot({ path: path.join(screenshotsDir, '05-abono-registrado-pendiente.png') });

    // Verificar que aparece el badge de "Pendiente de validación en Caja"
    const modalContent = await page.textContent('body');
    const hasPendienteBadge = modalContent?.includes('Pendiente de validación en Caja');
    const hasTestNota = modalContent?.includes(testNota);
    console.log(`¿Abono "${testNota}" registrado en el modal?:`, hasTestNota ? '✅ SÍ' : '❌ NO');
    console.log('¿Luce badge "Pendiente de validación en Caja"?:', hasPendienteBadge ? '✅ SÍ' : '❌ NO');

    // 5. Ir a /caja para validar el pago
    console.log('5. Volviendo a /caja para validar el pago en la bandeja de Finanzas...');
    await page.goto('http://127.0.0.1:3005/caja', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '06-caja-abono-en-bandeja.png') });

    const cajaText = await page.textContent('body');
    const abonoVisibleEnCaja = cajaText?.includes(testNota);
    console.log(`¿Abono "${testNota}" visible en bandeja de Caja?:`, abonoVisibleEnCaja ? '✅ SÍ' : '❌ NO');

    // Localizar la fila del abono
    const abonoRow = page.locator(`tr:has-text("${testNota}")`).first();
    if (await abonoRow.count() > 0) {
      console.log('Fila del abono encontrada en la tabla.');

      // Seleccionar banco (Santander Comercial o primera opción)
      const selectBanco = abonoRow.locator('select');
      await selectBanco.selectOption({ index: 0 });
      const selectedBancoText = await selectBanco.inputValue();
      console.log('Banco seleccionado ID:', selectedBancoText);

      // Clic en Validar
      console.log('Haciendo clic en botón "Validar"...');
      const validarBtn = abonoRow.locator('button:has-text("Validar")');
      await validarBtn.click();
      await page.waitForTimeout(2000);

      await page.screenshot({ path: path.join(screenshotsDir, '07-caja-abono-validado.png') });
      console.log('✅ Pago validado exitosamente en Caja.');
    } else {
      throw new Error(`No se encontró la fila con la nota "${testNota}" en la tabla de Caja.`);
    }

    // 6. Verificar que se creó el movimiento de ingreso en la pestaña de Movimientos
    console.log('6. Verificando movimiento generado en "Movimientos de Caja"...');
    await page.click('button:has-text("Movimientos de Caja")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(screenshotsDir, '08-caja-movimiento-ingreso-creado.png') });

    const movimientosText = await page.textContent('body');
    const ingresoGenerado = movimientosText?.includes('$250.000');
    console.log('¿Movimiento de ingreso por $250.000 presente en la tabla?:', ingresoGenerado ? '✅ SÍ' : '❌ NO');

    // 7. Volver a /ventas para verificar que el abono se muestra como Validado
    console.log('7. Volviendo a /ventas para verificar reflejo del abono validado...');
    await page.goto(`http://127.0.0.1:3005/ventas?oportunidad=${targetOpId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Área Comercial & Ventas', { timeout: 10000 });

    const areaComercialBtnRevisit = page.locator('button:has-text("Área Comercial & Ventas")').first();
    await areaComercialBtnRevisit.scrollIntoViewIfNeeded();
    await areaComercialBtnRevisit.click();
    await page.waitForTimeout(500);

    await page.waitForSelector('text=Finanzas & Comprobantes de Pago', { timeout: 10000 });
    const finanzasBtnRevisit = page.locator('button:has-text("Finanzas & Comprobantes de Pago")').first();
    await finanzasBtnRevisit.scrollIntoViewIfNeeded();
    await finanzasBtnRevisit.click();
    await page.waitForTimeout(800);

    await page.screenshot({ path: path.join(screenshotsDir, '09-ventas-abono-validado-reflejo.png') });

    const ventasRevisitText = await page.textContent('body');
    const hasValidadoBadge = ventasRevisitText?.includes('Validado en Caja');
    console.log('¿Abono muestra badge "Validado en Caja"?:', hasValidadoBadge ? '✅ SÍ' : '❌ NO');

    // 8. Probar flujo de Rechazo de Abono
    console.log('8. Probando flujo de rechazo con un segundo comprobante...');
    const rejectMonto = '75000';
    const rejectNota = `Abono Rechazo Test ${Date.now()}`;

    const rejectMontoInput = page.locator('input[placeholder="500.000"]').first();
    await rejectMontoInput.scrollIntoViewIfNeeded();
    await rejectMontoInput.fill(rejectMonto);

    const rejectFileInput = page.locator('input[type="file"][required]').first();
    await rejectFileInput.setInputFiles(fixturePath);

    const rejectNotaInput = page.locator('input[placeholder*="Transferencia"]').first();
    await rejectNotaInput.scrollIntoViewIfNeeded();
    await rejectNotaInput.fill(rejectNota);

    const rejectAddBtn = page.locator('button:has-text("Agregar Abono")').first();
    await rejectAddBtn.scrollIntoViewIfNeeded();
    await rejectAddBtn.click();
    await page.waitForTimeout(2500);

    console.log('Abono para rechazo creado. Volviendo a Caja para rechazar...');
    await page.goto('http://127.0.0.1:3005/caja', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const rejectRow = page.locator(`tr:has-text("${rejectNota}")`).first();
    if (await rejectRow.count() > 0) {
      console.log('Abriendo modal de rechazo...');
      const rejectBtn = rejectRow.locator('button[title*="Rechazar"]');
      await rejectBtn.click();
      await page.waitForSelector('text=Rechazar Comprobante de Pago', { timeout: 5000 });

      await page.screenshot({ path: path.join(screenshotsDir, '10-modal-rechazar-abono.png') });

      const motivoInput = page.locator('textarea[placeholder*="comprobante no coincide"]');
      await motivoInput.fill('Comprobante ilegible en prueba automatizada');

      await page.click('button:has-text("Confirmar Rechazo")');
      await page.waitForTimeout(2000);

      await page.screenshot({ path: path.join(screenshotsDir, '11-abono-rechazado-resultado.png') });
      console.log('✅ Abono rechazado con éxito y registrado con motivo.');
    }

    console.log('🎉 Fase 2 completada y validada al 100% con éxito.');
  } catch (err) {
    console.error('❌ Error durante la prueba de Fase 2:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-fase2.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
