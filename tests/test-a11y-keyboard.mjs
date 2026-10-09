import { chromium } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3005';

async function testA11yKeyboard() {
  console.log('⌨️ Iniciando prueba de navegación con teclado y accesibilidad...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

    // 1. Probar navegación con teclado secuencial (Tab)
    await page.keyboard.press('Tab'); // Enfocar botón "Iniciar sesión"
    let focusedText = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`Focus 1: "${focusedText?.trim()}"`);

    await page.keyboard.press('Tab'); // Enfocar botón "Crear cuenta"
    focusedText = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`Focus 2: "${focusedText?.trim()}"`);

    await page.keyboard.press('Tab'); // Enfocar input email
    let focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    let focusedId = await page.evaluate(() => document.activeElement?.id);
    console.log(`Focus 3: Tag ${focusedTag}, ID ${focusedId}`);
    if (focusedId !== 'input-email') throw new Error(`Se esperaba input-email, se obtuvo ${focusedId}`);

    await page.keyboard.press('Tab'); // Enfocar link "¿Olvidaste tu contraseña?"
    focusedText = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`Focus 4: "${focusedText?.trim()}"`);

    await page.keyboard.press('Tab'); // Enfocar input password
    focusedId = await page.evaluate(() => document.activeElement?.id);
    console.log(`Focus 5: Tag input, ID ${focusedId}`);
    if (focusedId !== 'input-password') throw new Error(`Se esperaba input-password, se obtuvo ${focusedId}`);

    await page.keyboard.press('Tab'); // Enfocar botón ver contraseña
    let ariaLabel = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    console.log(`Focus 6: Botón con aria-label "${ariaLabel}"`);

    await page.keyboard.press('Tab'); // Enfocar botón Iniciar sesión (submit)
    focusedText = await page.evaluate(() => document.activeElement?.textContent);
    console.log(`Focus 7: Botón submit "${focusedText?.trim()}"`);

    console.log('✅ Recorrido completo con teclado exitoso.');
  } catch (err) {
    console.error('❌ Error en prueba de teclado:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testA11yKeyboard();
