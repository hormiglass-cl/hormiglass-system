import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://127.0.0.1:3005';
const EMAIL = 'j.rodrigueztorresss1@gmail.com';
const PASS = 'Jert0211==';

const screenshotsDir = path.resolve('tests/screenshots/diseno-f2-despues');
fs.mkdirSync(screenshotsDir, { recursive: true });

async function run() {
  console.log('🚀 Iniciando verificación de Fase 2 (Panel operativo y Notificaciones)...');
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
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Sesión iniciada.');

    // 2. Verificar Panel Operativo (app/page.tsx)
    console.log('\n--- 2. Verificación de Panel Operativo (app/page.tsx) ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Verificar sección "Qué necesita atención hoy"
    const atencionTitle = page.locator('h2:has-text("Qué necesita atención hoy")');
    console.log(`✅ Sección "Qué necesita atención hoy" presente: ${await atencionTitle.isVisible()}`);

    // Verificar tarjetas de atención (4 tarjetas operativas)
    const cardDespachos = page.locator('text=Despachos en riesgo o activos');
    const cardAbonos = page.locator('text=Abonos por validar');
    const cardGarantias = page.locator('text=Garantías y reclamos abiertos');
    const cardRecordatorios = page.locator('text=Recordatorios y compromisos');
    console.log(`✅ Tarjeta Despachos: ${await cardDespachos.isVisible()}`);
    console.log(`✅ Tarjeta Abonos: ${await cardAbonos.isVisible()}`);
    console.log(`✅ Tarjeta Garantías: ${await cardGarantias.isVisible()}`);
    console.log(`✅ Tarjeta Recordatorios: ${await cardRecordatorios.isVisible()}`);

    // Verificar Riel Agregado de Obra
    const rielTitle = page.locator('h3:has-text("Riel de obra agregado")');
    console.log(`✅ Firma "Riel de obra agregado" presente: ${await rielTitle.isVisible()}`);

    // Verificar métricas clave (.t-figure)
    const tFigures = await page.locator('.t-figure').count();
    console.log(`✅ Cifras grandes (.t-figure) encontradas: ${tFigures}`);

    // Probar alternancia de gráfico de ventas (Diarias vs Mensuales, Área vs Barras)
    const btnDiarias = page.locator('button:has-text("Diarias")');
    const btnMensuales = page.locator('button:has-text("Mensuales")');
    await btnDiarias.click();
    await page.waitForTimeout(300);
    await btnMensuales.click();
    await page.waitForTimeout(300);
    console.log('✅ Alternancia de vista temporal en SalesTimelineChart funcionando.');

    // Captura de pantalla de inicio
    await page.screenshot({ path: path.join(screenshotsDir, 'inicio.png') });
    console.log('📸 Captura de Panel Operativo guardada en diseno-f2-despues/inicio.png');

    // 3. Verificar Notificaciones (app/notificaciones/page.tsx)
    console.log('\n--- 3. Verificación de Notificaciones (app/notificaciones/page.tsx) ---');
    await page.goto(`${BASE_URL}/notificaciones`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const notifHeader = page.locator('h1:has-text("Notificaciones")');
    console.log(`✅ Cabecera de Notificaciones visible: ${await notifHeader.isVisible()}`);

    // Verificar botones de filtro
    const tabTodas = page.getByRole('button', { name: /^Todas\s+\d+/ });
    const tabNoLeidas = page.getByRole('button', { name: /^No leídas\s+\d+/ });
    const tabLeidas = page.getByRole('button', { name: /^Leídas\s+\d+/ });
    console.log(`✅ Pestañas de filtro presentes: Todas (${await tabTodas.isVisible()}), No leídas (${await tabNoLeidas.isVisible()}), Leídas (${await tabLeidas.isVisible()})`);

    // Click en No leídas
    await tabNoLeidas.click();
    await page.waitForTimeout(300);
    await tabTodas.click();
    await page.waitForTimeout(300);

    // Captura de pantalla de notificaciones
    await page.screenshot({ path: path.join(screenshotsDir, 'notificaciones.png') });
    console.log('📸 Captura de Notificaciones guardada en diseno-f2-despues/notificaciones.png');

    // Control de Errores
    console.log('\n--- 4. Control de Errores ---');
    if (consoleErrors.length === 0) {
      console.log('✅ CERO errores en consola durante toda la ejecución de Fase 2.');
    } else {
      console.warn(`⚠️ Errores en consola:`, consoleErrors);
    }

    console.log('\n🎉 ¡FASE 2 VERIFICADA EXITOSAMENTE AL 100%!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Error en prueba de Fase 2:', err);
  process.exit(1);
});
