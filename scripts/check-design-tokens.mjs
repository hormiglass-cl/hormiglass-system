#!/usr/bin/env node
// Chequeo de tokens de diseño (plans/plan-rediseno-hig.md).
//   node scripts/check-design-tokens.mjs          → falla si una pantalla migrada rompe las reglas
//   node scripts/check-design-tokens.mjs --report → cuenta violaciones en todo app/ y components/ (línea base)
// Cada fase agrega sus archivos a MIGRATED cuando quedan limpios.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATED = [
  'components/ui/crm.tsx',
  'components/ui/feedback.tsx',
  'components/ui/AvatarBadge.tsx',
  'components/ui/FloatingActionBar.tsx',
  'components/ui/FilterPills.tsx',
  'components/ui/MetricCard.tsx',
  'components/ui/SlideOverDrawer.tsx',
  'components/ventas/KanbanCard.tsx',
  'components/clientes/ClienteDrawer.tsx',
  'components/Pagination.tsx',
  'app/diseno/page.tsx',
  // Fase 1
  'components/AppShell.tsx',
  'components/Sidebar.tsx',
  'components/Navbar.tsx',
  'components/CommandPalette.tsx',
  'components/dashboard/visuals.tsx',
  // Fase 2
  'app/page.tsx',
  'app/notificaciones/page.tsx',
  'components/dashboard/DonutChart.tsx',
  'components/dashboard/FinancialBalanceCard.tsx',
  'components/dashboard/PipelineFunnelChart.tsx',
  'components/dashboard/RankingBarChart.tsx',
  'components/dashboard/SalesTimelineChart.tsx',
  'components/dashboard/RecentLeadsCard.tsx',
  'components/dashboard/TasksActivityCard.tsx',
  // Fase 3
  'app/ventas/page.tsx',
  // Fase 4
  'app/clientes/page.tsx',
  'app/clientes/[id]/page.tsx',
  'app/cotizaciones/page.tsx',
  'app/cotizaciones/nuevo/page.tsx',
  'components/CotizacionModal.tsx',
  'app/postventa/page.tsx',
  // Fase 5
  'components/OrdenCompraModal.tsx',
  'app/ordenes-compra/page.tsx',
  'app/ordenes-compra/nuevo/page.tsx',
  'app/ordenes-compra/[id]/asignaciones/page.tsx',
  'app/proveedores/page.tsx',
  'app/productos/page.tsx',
  // Fase 6
  'components/CalendarioEventos.tsx',
  'app/calendarios/general/page.tsx',
  'app/visitas/page.tsx',
  'app/planificacion/page.tsx',
  'app/planificacion/semana/page.tsx',
  'app/planificacion/calendario/page.tsx',
  'app/reventa/page.tsx',
  'app/reventa/calendario/page.tsx',
  // Fase 7
  'app/usuarios/page.tsx',
  'app/caja/page.tsx',
  'app/caja/configuracion/page.tsx',
  'app/reportes/page.tsx',
  'app/administracion/page.tsx',
  'app/configuracion/page.tsx',
  'app/rrhh/page.tsx',
  'app/rrhh/[id]/page.tsx',
  // Fase 8
  'app/login/page.tsx',
  'app/auth/recuperar/page.tsx',
  'app/auth/actualizar-password/page.tsx',
];

// Fuera de alcance: documentos que genera el sistema (PDF, impresión).
const EXCLUDED = [
  'components/PdfPreviewModal.tsx',
  'components/OrdenCompraPdfPreviewModal.tsx',
];

const PALETTE = 'gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const RULES = [
  ['hex suelto', /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g],
  ['paleta Tailwind cruda', new RegExp(`\\b(?:bg|text|border|ring|from|to|via|divide|outline|fill|stroke)-(?:${PALETTE})-\\d{2,3}\\b`, 'g')],
  ['texto < 11 px', /\btext-\[(?:[0-9]|10(?:\.\d+)?)px\]/g],
  ['peso fuera de escala', /\bfont-(?:black|extrabold|thin|extralight|light)\b/g],
  ['alert/confirm nativo', /(?<![\w.])(?:window\.)?(?:alert|confirm|prompt)\(/g],
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = process.argv.includes('--report');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith('.tsx') ? [full] : [];
  });
}

const files = report
  ? ['app', 'components'].flatMap((dir) => walk(path.join(root, dir))).map((file) => path.relative(root, file))
  : MIGRATED;

let total = 0;
const totals = Object.fromEntries(RULES.map(([name]) => [name, 0]));

for (const file of files) {
  if (EXCLUDED.some((prefix) => file.startsWith(prefix))) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // confirm() es válido cuando viene de useConfirm() (components/ui/feedback.tsx).
  const usesConfirmHook = /=\s*useConfirm\(\)/.test(source);
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comentarios
    for (const [name, regex] of RULES) {
      let matches = line.match(regex);
      if (matches && name === 'alert/confirm nativo' && usesConfirmHook) matches = matches.filter((m) => m !== 'confirm(');
      if (matches && !matches.length) matches = null;
      if (!matches) continue;
      total += matches.length;
      totals[name] += matches.length;
      if (!report) console.log(`${file}:${index + 1}  ${name}: ${matches.join(', ')}`);
    }
  });
}

if (report) {
  console.log(`Violaciones en ${files.length} archivos:`);
  for (const [name, count] of Object.entries(totals)) console.log(`  ${String(count).padStart(5)}  ${name}`);
  process.exit(0);
}

if (total) {
  console.error(`\n✗ ${total} violaciones de tokens en pantallas migradas.`);
  process.exit(1);
}
console.log(`✓ ${files.length} archivos migrados sin violaciones de tokens.`);
