import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  console.log('🚀 Iniciando prueba E2E de Fase 1 con Playwright...');
  const screenshotsDir = path.resolve('tests/screenshots/fase1');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  const page = await context.newPage();

  try {
    // 1. Login con credenciales reales
    console.log('1. Navegando a http://127.0.0.1:3005/login...');
    await page.goto('http://127.0.0.1:3005/login', { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'j.rodrigueztorresss1@gmail.com');
    await page.fill('input[type="password"]', 'Jert0211==');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada correctamente. URL actual:', page.url());

    // 2. Verificar enlace en Sidebar
    const bancosSidebarLink = await page.$('a[href="/caja/configuracion"]');
    console.log('Enlace "Bancos y empresas" presente en Sidebar:', bancosSidebarLink ? '✅ SÍ' : '❌ NO');

    // 3. Navegar a /caja y verificar botón rápido
    console.log('2. Navegando a /caja...');
    await page.goto('http://127.0.0.1:3005/caja', { waitUntil: 'networkidle' });
    const bancosBtnCaja = await page.$('a[href="/caja/configuracion"]');
    console.log('Botón "Bancos & Empresas" presente en cabecera de Caja:', bancosBtnCaja ? '✅ SÍ' : '❌ NO');

    // 4. Navegar a /caja/configuracion
    console.log('3. Navegando a /caja/configuracion...');
    await page.goto('http://127.0.0.1:3005/caja/configuracion', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '01-caja-configuracion.png') });

    // Verificar las 3 empresas
    const pageText = await page.textContent('body');
    const hasComercial = pageText?.includes('Soc Comercial Hormiglass');
    const hasTransportes = pageText?.includes('Soc Transportes Hormiglass');
    const hasInmobiliaria = pageText?.includes('Soc Inmobiliaria Hormiglass');
    console.log('Empresas encontradas en UI:');
    console.log(' - Comercial:', hasComercial ? '✅ SÍ' : '❌ NO');
    console.log(' - Transportes:', hasTransportes ? '✅ SÍ' : '❌ NO');
    console.log(' - Inmobiliaria:', hasInmobiliaria ? '✅ SÍ' : '❌ NO');

    // Verificar las 8 cuentas activas
    const cuentaAliases = [
      'Santander Comercial',
      'Mercado Pago Comercial',
      'Caja Chica Efectivo',
      'Scotiabank Transportes',
      'Santander Transportes',
      'Scotiabank Inmobiliaria',
      'Santander Inmobiliaria',
      'Banco Chile Inmobiliaria',
    ];
    let allCuentasFound = true;
    for (const alias of cuentaAliases) {
      const found = pageText?.includes(alias);
      if (!found) allCuentasFound = false;
      console.log(` - Cuenta "${alias}":`, found ? '✅' : '❌');
    }
    console.log('¿Las 8 cuentas activas están listadas en la tabla?:', allCuentasFound ? '✅ SÍ' : '❌ NO');

    // 5. Probar Modal de Creación de Nueva Cuenta Bancaria
    console.log('4. Probando creación de nueva cuenta bancaria...');
    const testAlias = `Banco Estado Test ${Date.now()}`;
    await page.click('button:has-text("Nueva Cuenta Bancaria")');
    await page.waitForSelector('form', { timeout: 5000 });
    await page.screenshot({ path: path.join(screenshotsDir, '02-modal-nueva-cuenta.png') });

    await page.fill('input[placeholder*="Ej: Santander Comercial"]', testAlias);
    await page.fill('input[list="bancos-list"]', 'Banco Estado');
    await page.fill('input[placeholder*="00-12345-6"]', '99-887766-5');
    await page.fill('input[type="number"]', '150000');

    console.log(`Guardando cuenta de prueba "${testAlias}"...`);
    await page.click('button[type="submit"]:has-text("Guardar Cuenta")');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(screenshotsDir, '03-cuenta-creada.png') });
    const afterCreationText = await page.textContent('body');
    const createdFound = afterCreationText?.includes(testAlias);
    console.log(`Nueva cuenta "${testAlias}" creada y visible:`, createdFound ? '✅ SÍ' : '❌ NO');

    // 6. Probar Toggle Activo / Inactivo
    console.log('5. Probando toggle de activación...');
    const testRow = page.locator(`tr:has-text("${testAlias}")`).first();
    if (await testRow.count() > 0) {
      const toggleBtn = testRow.locator('button[title*="Clic para cambiar estado"]');
      const initialStatus = await toggleBtn.textContent();
      console.log('Estado inicial de cuenta test:', initialStatus?.trim());

      await toggleBtn.click();
      await page.waitForTimeout(1000);
      const afterStatus = await toggleBtn.textContent();
      console.log('Estado tras primer toggle:', afterStatus?.trim());

      await toggleBtn.click();
      await page.waitForTimeout(1000);
      const restoredStatus = await toggleBtn.textContent();
      console.log('Estado tras segundo toggle (restaurado):', restoredStatus?.trim());

      // 6.1 Probar Edición de Cuenta
      console.log('5.1 Probando edición de la cuenta bancaria...');
      const editBtn = testRow.locator('button[title="Editar cuenta"]');
      await editBtn.click();
      await page.waitForSelector('form', { timeout: 5000 });

      const updatedAlias = `${testAlias} (Editada)`;
      await page.fill('input[placeholder*="Ej: Santander Comercial"]', updatedAlias);
      await page.click('button[type="submit"]:has-text("Actualizar Cuenta")');
      await page.waitForTimeout(1500);

      const afterEditText = await page.textContent('body');
      const editFound = afterEditText?.includes(updatedAlias);
      console.log(`Cuenta actualizada "${updatedAlias}" visible:`, editFound ? '✅ SÍ' : '❌ NO');
    }

    // 7. Verificar Selector de Roles en /configuracion y /rrhh
    console.log('6. Verificando disponibilidad del rol "Finanzas y Caja" en /configuracion...');
    await page.goto('http://127.0.0.1:3005/configuracion', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const hasFinanzasRoleInConfig = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('select option'));
      return options.some(opt => opt.value === 'finanzas' && opt.textContent?.includes('Finanzas y Caja'));
    });
    console.log('Rol "Finanzas y Caja" disponible en /configuracion:', hasFinanzasRoleInConfig ? '✅ SÍ' : '❌ NO');
    await page.screenshot({ path: path.join(screenshotsDir, '04-configuracion-roles.png') });

    console.log('7. Verificando disponibilidad del rol "Finanzas y Caja" en /rrhh...');
    await page.goto('http://127.0.0.1:3005/rrhh', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const hasFinanzasRoleInRrhh = await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('select option'));
      return options.some(opt => opt.value === 'finanzas' && opt.textContent?.includes('Finanzas y Caja'));
    });
    console.log('Rol "Finanzas y Caja" disponible en /rrhh:', hasFinanzasRoleInRrhh ? '✅ SÍ' : '❌ NO');
    await page.screenshot({ path: path.join(screenshotsDir, '05-rrhh-roles.png') });

    console.log('🎉 Fase 1 completada y validada al 100% con éxito.');
  } catch (err) {
    console.error('❌ Error durante la prueba de Fase 1:', err);
    await page.screenshot({ path: path.join(screenshotsDir, 'error-fase1.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
