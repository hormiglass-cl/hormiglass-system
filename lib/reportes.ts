import type { MovimientoCaja } from './types';

export type ReportTab = 'flujo' | 'ingresos' | 'egresos' | 'margen_nv';
export type ReportGrouping = 'periodo' | 'categoria';
export type ReportViewConfig = {
  tab: ReportTab;
  desde: string;
  hasta: string;
  categoria: string;
  agrupacion: ReportGrouping;
  cuentaBancariaId?: string;
};

export function reportTotals(rows: Pick<MovimientoCaja, 'tipo' | 'monto'>[]) {
  const ingresos = rows.filter((row) => row.tipo === 'ingreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
  const egresos = rows.filter((row) => row.tipo === 'egreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
  return { ingresos, egresos, neto: ingresos - egresos, tasaSaldo: ingresos > 0 ? (ingresos - egresos) / ingresos : null };
}

export function reportSeries(rows: Pick<MovimientoCaja, 'tipo' | 'monto' | 'fecha' | 'categoria'>[], grouping: ReportGrouping) {
  const buckets = new Map<string, { label: string; ingresos: number; egresos: number }>();
  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const row of rows) {
    const dateParts = Object.fromEntries(dayFormatter.formatToParts(new Date(row.fecha)).map((part) => [part.type, part.value]));
    const day = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    const key = grouping === 'categoria' ? row.categoria || 'Sin categoría' : day;
    const bucket = buckets.get(key) || { label: key, ingresos: 0, egresos: 0 };
    bucket[row.tipo === 'ingreso' ? 'ingresos' : 'egresos'] += Number(row.monto || 0);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => grouping === 'periodo' ? a.label.localeCompare(b.label) : (b.ingresos + b.egresos) - (a.ingresos + a.egresos));
}

export function parseReportConfig(value: unknown): ReportViewConfig | null {
  if (!value || typeof value !== 'object') return null;
  const config = value as Partial<ReportViewConfig>;
  if (!['flujo', 'ingresos', 'egresos', 'margen_nv'].includes(config.tab || '') ||
    !['periodo', 'categoria'].includes(config.agrupacion || '') ||
    typeof config.desde !== 'string' || typeof config.hasta !== 'string' || typeof config.categoria !== 'string') return null;
  return config as ReportViewConfig;
}
