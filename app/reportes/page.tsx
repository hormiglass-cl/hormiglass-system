'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, BarChart3, Bookmark, CalendarDays, Filter, RefreshCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/context/AuthContext';
import { createClient } from '../../lib/supabase/client';
import type { MovimientoCaja } from '../../lib/types';
import { parseReportConfig, reportSeries, reportTotals, type ReportGrouping, type ReportTab, type ReportViewConfig } from '../../lib/reportes';

type SavedView = { id: string; nombre: string; configuracion: unknown };
const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initialConfig = (): ReportViewConfig => {
  const now = new Date();
  return { tab: 'flujo', desde: dateInput(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: dateInput(now), categoria: 'todas', agrupacion: 'periodo' };
};

export default function ReportesPage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const supabase = useMemo(() => createClient(), []);
  const [config, setConfig] = useState<ReportViewConfig>(initialConfig);
  const [rows, setRows] = useState<MovimientoCaja[]>([]);
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState('');

  const loadViews = useCallback(async () => {
    if (!userId) return;
    const { data, error: viewsError } = await supabase.from('reportes_vistas')
      .select('id,nombre,configuracion').eq('usuario_id', userId).order('updated_at', { ascending: false });
    if (viewsError) setSaveError('No se pudieron cargar las vistas guardadas. Revisa si la migración de reportes está aplicada.');
    else { setSaved((data || []) as SavedView[]); setSaveError(''); }
  }, [userId, supabase]);

  const loadRows = useCallback(async () => {
    if (config.desde && config.hasta && config.desde > config.hasta) {
      setError('La fecha inicial debe ser anterior o igual a la fecha final.');
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const all: MovimientoCaja[] = [];
    const pageSize = 1000;
    const start = config.desde ? new Date(`${config.desde}T00:00:00`).toISOString() : null;
    const endDate = config.hasta ? new Date(`${config.hasta}T00:00:00`) : null;
    endDate?.setDate(endDate.getDate() + 1);
    const end = endDate?.toISOString() || null;
    for (let offset = 0; ; offset += pageSize) {
      let query = supabase.from('caja_movimientos').select('*').order('fecha', { ascending: false }).range(offset, offset + pageSize - 1);
      if (start) query = query.gte('fecha', start);
      if (end) query = query.lt('fecha', end);
      const { data, error: queryError } = await query;
      if (queryError) { setError('No se pudieron cargar los movimientos de caja.'); setRows([]); break; }
      all.push(...((data || []) as MovimientoCaja[]));
      if (!data || data.length < pageSize) { setRows(all); break; }
    }
    setLoading(false);
  }, [config.desde, config.hasta, supabase]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = window.setTimeout(() => { void loadRows(); }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, loadRows]);
  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = window.setTimeout(() => { void loadViews(); }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, loadViews]);

  const categories = useMemo(() => [...new Set([...rows.map((row) => row.categoria || 'Sin categoría'), ...(config.categoria === 'todas' ? [] : [config.categoria])])].sort((a, b) => a.localeCompare(b, 'es-CL')), [rows, config.categoria]);
  const filtered = useMemo(() => rows.filter((row) => config.categoria === 'todas' || (row.categoria || 'Sin categoría') === config.categoria), [rows, config.categoria]);
  const visible = useMemo(() => filtered.filter((row) => config.tab === 'flujo' || row.tipo === (config.tab === 'ingresos' ? 'ingreso' : 'egreso')), [filtered, config.tab]);
  const totals = useMemo(() => reportTotals(filtered), [filtered]);
  const series = useMemo(() => reportSeries(visible, config.agrupacion), [visible, config.agrupacion]);
  const maxBar = Math.max(1, ...series.map((item) => Math.max(item.ingresos, item.egresos)));

  function update<K extends keyof ReportViewConfig>(key: K, value: ReportViewConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setActiveViewId('');
  }

  async function saveView() {
    if (!currentUser?.id || !viewName.trim()) { setSaveError('Escribe un nombre para la vista.'); return; }
    setSaving(true);
    setSaveError('');
    const name = viewName.trim();
    const existing = saved.find((view) => view.nombre.toLocaleLowerCase('es-CL') === name.toLocaleLowerCase('es-CL'));
    const query = existing
      ? supabase.from('reportes_vistas').update({ configuracion: config }).eq('id', existing.id).eq('usuario_id', currentUser.id).select('id').single()
      : supabase.from('reportes_vistas').insert({ usuario_id: currentUser.id, nombre: name, configuracion: config }).select('id').single();
    const { data, error: writeError } = await query;
    if (writeError) setSaveError('No se pudo guardar la vista. Comprueba los permisos y el nombre.');
    else { setActiveViewId(data?.id || ''); await loadViews(); }
    setSaving(false);
  }

  async function deleteView(view: SavedView) {
    if (!currentUser?.id || !window.confirm(`¿Eliminar la vista “${view.nombre}”?`)) return;
    const { error: deleteError } = await supabase.from('reportes_vistas').delete().eq('id', view.id).eq('usuario_id', currentUser.id);
    if (deleteError) setSaveError('No se pudo eliminar la vista.');
    else { if (activeViewId === view.id) setActiveViewId(''); await loadViews(); }
  }

  async function renameView(view: SavedView) {
    if (!currentUser?.id) return;
    const name = window.prompt('Nuevo nombre de la vista', view.nombre)?.trim();
    if (!name || name === view.nombre) return;
    const { error: renameError } = await supabase.from('reportes_vistas').update({ nombre: name }).eq('id', view.id).eq('usuario_id', currentUser.id);
    if (renameError) setSaveError('No se pudo renombrar la vista.');
    else await loadViews();
  }

  if (!currentUser || currentUser.rol === 'mano_obra') return <section className="hg-panel p-8"><h1 className="text-xl font-bold">Acceso restringido</h1><p className="text-sm text-[#66716f]">Los reportes financieros están disponibles para administración y usuarios comerciales.</p></section>;

  return <div className="hg-page space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="hg-overline">Finanzas / Análisis</p><h1 className="text-2xl font-bold">Reportes</h1><p className="mt-1 text-sm text-[#66716f]">Flujo real calculado a partir de movimientos registrados en Caja.</p></div>
      <Link href="/caja" className="hg-button-secondary"><WalletIcon /> Abrir Caja</Link>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7e4]">
      <div role="tablist" aria-label="Tipo de reporte" className="flex gap-5">
        {(['flujo', 'ingresos', 'egresos'] as ReportTab[]).map((tab) => <button key={tab} role="tab" aria-selected={config.tab === tab} onClick={() => update('tab', tab)}
          className={`border-b-2 px-1 py-3 text-sm font-semibold capitalize ${config.tab === tab ? 'border-[#e87622] text-[#d4671c]' : 'border-transparent text-[#66716f] hover:text-[#252b2d]'}`}>{tab}</button>)}
      </div>
      <button className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#66716f] hover:text-[#252b2d]" onClick={() => void loadRows()}><RefreshCcw size={14} /> Actualizar</button>
    </div>
    <section aria-label="Filtros de reportes" className="hg-panel flex flex-wrap items-end gap-3 p-4">
      <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]"><CalendarDays size={14} className="mb-1 inline" /> Desde<input aria-label="Fecha inicial" type="date" className="hg-field mt-1" value={config.desde} onChange={(event) => update('desde', event.target.value)} /></label>
      <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]">Hasta<input aria-label="Fecha final" type="date" className="hg-field mt-1" value={config.hasta} onChange={(event) => update('hasta', event.target.value)} /></label>
      <label className="min-w-40 flex-1 text-xs font-semibold text-[#66716f]"><Filter size={14} className="mb-1 inline" /> Categoría<select className="hg-field mt-1" value={config.categoria} onChange={(event) => update('categoria', event.target.value)}><option value="todas">Todas las categorías</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]"><BarChart3 size={14} className="mb-1 inline" /> Agrupar por<select className="hg-field mt-1" value={config.agrupacion} onChange={(event) => update('agrupacion', event.target.value as ReportGrouping)}><option value="periodo">Día</option><option value="categoria">Categoría</option></select></label>
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section aria-label="Indicadores de caja" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: 'Ingresos registrados', value: money(totals.ingresos), color: 'text-emerald-700', icon: ArrowUpRight },
        { label: 'Egresos registrados', value: money(totals.egresos), color: 'text-red-700', icon: ArrowDownRight },
        { label: 'Saldo neto', value: money(totals.neto), color: 'text-[#252b2d]', icon: BarChart3 },
        { label: 'Tasa de saldo', value: totals.tasaSaldo === null ? 'No aplica' : new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 }).format(totals.tasaSaldo), color: 'text-[#252b2d]', icon: Bookmark },
      ].map((card) => <div key={card.label} className="hg-panel p-5"><div className="flex items-center justify-between"><p className="hg-overline">{card.label}</p><card.icon size={18} className={card.color} /></div><p className={`hg-kpi-value mt-4 ${card.color}`}>{loading ? '…' : card.value}</p></div>)}
    </section>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
        <section className="hg-panel overflow-hidden">
          <div className="border-b border-[#e5e7e4] p-5"><p className="hg-overline">{config.tab}</p><h2 className="hg-section-title">Movimiento por {config.agrupacion === 'periodo' ? 'día' : 'categoría'}</h2></div>
          {series.length === 0 ? <div className="p-12 text-center text-sm text-[#66716f]">No hay movimientos para este período y filtro.</div> :
            <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
              {series.map((item) => <div key={item.label} className="grid grid-cols-[minmax(80px,150px)_1fr] items-center gap-3 text-xs">
                <span className="truncate font-semibold" title={item.label}>{config.agrupacion === 'periodo' ? new Date(`${item.label}T12:00:00`).toLocaleDateString('es-CL') : item.label}</span>
                <div className="space-y-1">
                  {config.tab !== 'egresos' && <div className="flex items-center gap-2"><span title={`Ingresos ${money(item.ingresos)}`} className="h-3 rounded bg-emerald-500" style={{ width: `${Math.max(item.ingresos > 0 ? 2 : 0, item.ingresos / maxBar * 90)}%` }} /><span className="tabular-nums text-[#66716f]">{money(item.ingresos)}</span></div>}
                  {config.tab !== 'ingresos' && <div className="flex items-center gap-2"><span title={`Egresos ${money(item.egresos)}`} className="h-3 rounded bg-orange-400" style={{ width: `${Math.max(item.egresos > 0 ? 2 : 0, item.egresos / maxBar * 90)}%` }} /><span className="tabular-nums text-[#66716f]">{money(item.egresos)}</span></div>}
                </div>
              </div>)}
            </div>}
        </section>
        <section className="hg-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e7e4] p-5"><h2 className="hg-section-title">Movimientos</h2><span className="text-xs text-[#66716f]">{visible.length} registros</span></div>
          <div className="overflow-x-auto"><table className="hg-table hg-list-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>
            {visible.slice(0, 100).map((row) => <tr key={row.id}><td>{new Date(row.fecha).toLocaleDateString('es-CL')}</td><td className={row.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}>{row.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</td><td>{row.categoria}</td><td>{row.descripcion || '—'}</td><td className="font-semibold tabular-nums">{money(Number(row.monto))}</td></tr>)}
          </tbody></table></div>
          {visible.length > 100 && <p className="border-t border-[#e5e7e4] p-3 text-xs text-[#66716f]">Se muestran los 100 movimientos más recientes; los indicadores y el gráfico incluyen todos los registros del período.</p>}
          {!visible.length && <p className="p-8 text-center text-sm text-[#66716f]">Sin movimientos para mostrar.</p>}
        </section>
      </div>
      <aside className="hg-panel h-fit p-5">
        <p className="hg-overline">Personalización</p><h2 className="hg-section-title mt-1">Vistas guardadas</h2>
        <p className="mt-1 text-xs text-[#66716f]">Solo tú puedes ver y administrar tus vistas.</p>
        <label className="mt-4 block text-xs font-semibold text-[#66716f]">Nombre de la vista<input className="hg-field mt-1" maxLength={80} value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Ej. Flujo mensual" /></label>
        <button onClick={() => void saveView()} disabled={saving} className="hg-button-primary mt-3 w-full"><Bookmark size={16} /> {saving ? 'Guardando…' : 'Guardar vista'}</button>
        {saveError && <p role="alert" className="mt-3 text-xs text-red-700">{saveError}</p>}
        <div className="mt-5 space-y-2 border-t border-[#e5e7e4] pt-4">
          {saved.length === 0 && <p className="text-xs text-[#66716f]">Aún no tienes vistas guardadas.</p>}
          {saved.map((view) => <div key={view.id} className={`flex items-center gap-1 rounded-lg border p-1 ${activeViewId === view.id ? 'border-[#f7d3b8] bg-[#fff1e7]' : 'border-[#e5e7e4]'}`}>
            <button className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-xs font-semibold hover:underline" onClick={() => {
              const next = parseReportConfig(view.configuracion);
              if (!next) { setSaveError('Esta vista tiene una configuración inválida.'); return; }
              setConfig(next); setViewName(view.nombre); setActiveViewId(view.id);
            }} title={view.nombre}>{view.nombre}</button>
            <button title="Renombrar vista" aria-label={`Renombrar ${view.nombre}`} onClick={() => void renameView(view)} className="rounded p-1.5 text-[#66716f] hover:bg-white">✎</button>
            <button title="Eliminar vista" aria-label={`Eliminar ${view.nombre}`} onClick={() => void deleteView(view)} className="rounded p-1.5 text-[#b83d46] hover:bg-white"><Trash2 size={14} /></button>
          </div>)}
        </div>
      </aside>
    </div>
  </div>;
}

function WalletIcon() { return <BarChart3 size={16} />; }
