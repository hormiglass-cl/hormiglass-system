// Capturas antes/después del rediseño (plans/plan-rediseno-hig.md).
// Uso: E2E_EMAIL=... E2E_PASSWORD=... node tests/capturas-diseno.mjs <carpeta> [ruta ...]
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3005';
const [outName = 'diseno', ...routesArg] = process.argv.slice(2);
const routes = routesArg.length ? routesArg : [
  '/', '/ventas', '/clientes', '/cotizaciones', '/postventa', '/ordenes-compra',
  '/productos', '/caja', '/rrhh', '/configuracion',
];

if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
  console.error('Faltan E2E_EMAIL / E2E_PASSWORD');
  process.exit(1);
}

const outDir = path.resolve('tests/screenshots', outName);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const file = `${route === '/' ? 'inicio' : route.slice(1).replace(/[/?=&]/g, '-')}.png`;
    await page.screenshot({ path: path.join(outDir, file) });
    console.log('✓', route, '→', path.join('tests/screenshots', outName, file));
  }
} finally {
  await browser.close();
}
