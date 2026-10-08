'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  CreditCard,
  Download,
  ExternalLink,
  Filter,
  Landmark,
  Percent,
  RefreshCcw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../lib/context/AuthContext';
import { createClient } from '../../lib/supabase/client';
import type { CuentaBancaria, MargenPorNV, MovimientoCaja } from '../../lib/types';
import {
  parseReportConfig,
  reportSeries,
  reportTotals,
  type ReportGrouping,
  type ReportTab,
  type ReportViewConfig,
} from '../../lib/reportes';

type SavedView = { id: string; nombre: string; configuracion: unknown };

const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const dateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const initialConfig = (): ReportViewConfig => {
  const now = new Date();
  return {
    tab: 'flujo',
    desde: dateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    hasta: dateInput(now),
    categoria: 'todas',
    agrupacion: 'periodo',
  };
};

export default function ReportesPage() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const supabase = useMemo(() => createClient(), []);
  const [config, setConfig] = useState<ReportViewConfig>(initialConfig);
  const [rows, setRows] = useState<MovimientoCaja[]>([]);
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [selectedCuentaBancaria, setSelectedCuentaBancaria] = useState<string>('todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const [activeViewId, setActiveViewId] = useState('');

  // Margen por NV State
  const [margenRows, setMargenRows] = useState<MargenPorNV[]>([]);
  const [searchMargen, setSearchMargen] = useState('');
  const [filtroRentabilidad, setFiltroRentabilidad] = useState<'todos' | 'positivo' | 'negativo'>('todos');
  const [loadingMargen, setLoadingMargen] = useState(false);

  const loadViews = useCallback(async () => {
    if (!userId) return;
    const { data, error: viewsError } = await supabase
      .from('reportes_vistas')
      .select('id,nombre,configuracion')
      .eq('usuario_id', userId)
      .order('updated_at', { ascending: false });
    if (viewsError)
      setSaveError('No se pudieron cargar las vistas guardadas.');
    else {
      setSaved((data || []) as SavedView[]);
      setSaveError('');
    }
  }, [userId, supabase]);

  const loadCuentas = useCallback(async () => {
    const { data } = await supabase
      .from('cuentas_bancarias')
      .select('*, empresa:empresas(*)')
      .eq('activo', true)
      .order('alias');
    if (data) setCuentasBancarias(data as CuentaBancaria[]);
  }, [supabase]);

  const loadMargenData = useCallback(async () => {
    setLoadingMargen(true);
    try {
      const { data, error: mError } = await supabase
        .from('v_margen_por_nv')
        .select('*')
        .order('fecha_creacion', { ascending: false });
      if (mError) throw mError;
      setMargenRows((data || []) as MargenPorNV[]);
    } catch (err) {
      console.error('Error cargando margen por NV:', err);
    } finally {
      setLoadingMargen(false);
    }
  }, [supabase]);

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
      let query = supabase
        .from('caja_movimientos')
        .select('*, cuenta_bancaria:cuentas_bancarias(*)')
        .order('fecha', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (start) query = query.gte('fecha', start);
      if (end) query = query.lt('fecha', end);
      if (selectedCuentaBancaria && selectedCuentaBancaria !== 'todas') {
        query = query.eq('cuenta_bancaria_id', selectedCuentaBancaria);
      }
      const { data, error: queryError } = await query;
      if (queryError) {
        setError('No se pudieron cargar los movimientos de caja.');
        setRows([]);
        break;
      }
      all.push(...((data || []) as MovimientoCaja[]));
      if (!data || data.length < pageSize) {
        setRows(all);
        break;
      }
    }
    setLoading(false);
  }, [config.desde, config.hasta, selectedCuentaBancaria, supabase]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    void loadCuentas();
    void loadMargenData();
  }, [currentUser, loadCuentas, loadMargenData]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = window.setTimeout(() => {
      void loadRows();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, loadRows]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = window.setTimeout(() => {
      void loadViews();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, loadViews]);

  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...rows.map((row) => row.categoria || 'Sin categoría'),
          ...(config.categoria === 'todas' ? [] : [config.categoria]),
        ]),
      ].sort((a, b) => a.localeCompare(b, 'es-CL')),
    [rows, config.categoria]
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) => config.categoria === 'todas' || (row.categoria || 'Sin categoría') === config.categoria
      ),
    [rows, config.categoria]
  );

  const visible = useMemo(
    () =>
      filtered.filter(
        (row) =>
          config.tab === 'flujo' ||
          row.tipo === (config.tab === 'ingresos' ? 'ingreso' : 'egreso')
      ),
    [filtered, config.tab]
  );

  const totals = useMemo(() => reportTotals(filtered), [filtered]);
  const series = useMemo(
    () => reportSeries(visible, config.agrupacion),
    [visible, config.agrupacion]
  );
  const maxBar = Math.max(1, ...series.map((item) => Math.max(item.ingresos, item.egresos)));

  // Margen Filtering
  const filteredMargen = useMemo(() => {
    return margenRows.filter((row) => {
      if (filtroRentabilidad === 'positivo' && Number(row.margen_bruto_real) < 0) return false;
      if (filtroRentabilidad === 'negativo' && Number(row.margen_bruto_real) >= 0) return false;
      if (!searchMargen) return true;
      const q = searchMargen.toLowerCase().trim();
      return (
        row.codigo.toLowerCase().includes(q) ||
        row.titulo.toLowerCase().includes(q) ||
        (row.cliente_nombre || '').toLowerCase().includes(q) ||
        (row.vendedor_nombre || '').toLowerCase().includes(q)
      );
    });
  }, [margenRows, searchMargen, filtroRentabilidad]);

  // Totales de Margen
  const margenTotals = useMemo(() => {
    const totalVenta = filteredMargen.reduce(
      (sum, r) => sum + Number(r.valor_cotizado_total || 0),
      0
    );
    const totalIngresos = filteredMargen.reduce(
      (sum, r) => sum + Number(r.total_ingresos_validados || 0),
      0
    );
    const totalCostos = filteredMargen.reduce(
      (sum, r) => sum + Number(r.costo_directo_total || 0),
      0
    );
    const margenReal = totalIngresos - totalCostos;
    const margenProyectado = totalVenta - totalCostos;
    const pctReal = totalIngresos > 0 ? (margenReal / totalIngresos) * 100 : 0;
    const pctProyectado = totalVenta > 0 ? (margenProyectado / totalVenta) * 100 : 0;

    return {
      totalVenta,
      totalIngresos,
      totalCostos,
      margenReal,
      margenProyectado,
      pctReal,
      pctProyectado,
    };
  }, [filteredMargen]);

  function update<K extends keyof ReportViewConfig>(key: K, value: ReportViewConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
    setActiveViewId('');
  }

  async function saveView() {
    if (!currentUser?.id || !viewName.trim()) {
      setSaveError('Escribe un nombre para la vista.');
      return;
    }
    setSaving(true);
    setSaveError('');
    const name = viewName.trim();
    const existing = saved.find(
      (view) => view.nombre.toLocaleLowerCase('es-CL') === name.toLocaleLowerCase('es-CL')
    );
    const query = existing
      ? supabase
          .from('reportes_vistas')
          .update({ configuracion: config })
          .eq('id', existing.id)
          .eq('usuario_id', currentUser.id)
          .select('id')
          .single()
      : supabase
          .from('reportes_vistas')
          .insert({ usuario_id: currentUser.id, nombre: name, configuracion: config })
          .select('id')
          .single();
    const { data, error: writeError } = await query;
    if (writeError) setSaveError('No se pudo guardar la vista. Comprueba los permisos y el nombre.');
    else {
      setActiveViewId(data?.id || '');
      await loadViews();
    }
    setSaving(false);
  }

  async function deleteView(view: SavedView) {
    if (!currentUser?.id || !window.confirm(`¿Eliminar la vista “${view.nombre}”?`)) return;
    const { error: deleteError } = await supabase
      .from('reportes_vistas')
      .delete()
      .eq('id', view.id)
      .eq('usuario_id', currentUser.id);
    if (deleteError) setSaveError('No se pudo eliminar la vista.');
    else {
      if (activeViewId === view.id) setActiveViewId('');
      await loadViews();
    }
  }

  async function renameView(view: SavedView) {
    if (!currentUser?.id) return;
    const name = window.prompt('Nuevo nombre de la vista', view.nombre)?.trim();
    if (!name || name === view.nombre) return;
    const { error: renameError } = await supabase
      .from('reportes_vistas')
      .update({ nombre: name })
      .eq('id', view.id)
      .eq('usuario_id', currentUser.id);
    if (renameError) setSaveError('No se pudo renombrar la vista.');
    else await loadViews();
  }

  // Exportar Margen a CSV
  const handleExportMargenCsv = () => {
    const headers = [
      'NV Codigo',
      'Titulo',
      'Cliente',
      'RUT',
      'Vendedor',
      'Estado',
      'Venta Cotizada Net ($)',
      'Venta Cotizada Total ($)',
      'Ingresos Validados ($)',
      'Costo Compras OC ($)',
      'Costo Fletes Guia ($)',
      'Costo Caja Directo ($)',
      'Costo Postventa ($)',
      'Costo Directo Total ($)',
      'Margen Bruto Real ($)',
      '% Margen Real',
      'Margen Proyectado ($)',
      '% Margen Proyectado',
    ];

    const csvRows = filteredMargen.map((r) => [
      `"${r.codigo}"`,
      `"${r.titulo.replaceAll('"', '""')}"`,
      `"${(r.cliente_nombre || '').replaceAll('"', '""')}"`,
      `"${r.cliente_rut || ''}"`,
      `"${r.vendedor_nombre || ''}"`,
      `"${r.estado_pipeline}"`,
      r.valor_cotizado_neto,
      r.valor_cotizado_total,
      r.total_ingresos_validados,
      r.costo_compras_asignadas,
      r.costo_fletes_despacho,
      r.costo_caja_directo,
      r.costo_postventa || 0,
      r.costo_directo_total,
      r.margen_bruto_real,
      `${r.porcentaje_margen_real}%`,
      r.margen_bruto_proyectado,
      `${r.porcentaje_margen_proyectado}%`,
    ]);

    const content = [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte_margen_nv_${dateInput(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentUser || currentUser.rol === 'mano_obra')
    return (
      <section className="hg-panel p-8">
        <h1 className="text-xl font-bold">Acceso restringido</h1>
        <p className="text-sm text-[#66716f]">
          Los reportes financieros están disponibles para administración y usuarios comerciales.
        </p>
      </section>
    );

  return (
    <div className="hg-page space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="hg-overline">Finanzas / Análisis</p>
          <h1 className="text-2xl font-bold">Reportes y Rentabilidad</h1>
          <p className="mt-1 text-sm text-[#66716f]">
            Flujo de caja bancario y matriz operacional de costos y margen por Nota de Venta (NV).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config.tab === 'margen_nv' && (
            <button
              onClick={handleExportMargenCsv}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download size={14} />
              <span>Exportar Margen a CSV</span>
            </button>
          )}
          <Link href="/caja" className="hg-button-secondary">
            <Wallet size={16} /> Abrir Caja
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7e4]">
        <div role="tablist" aria-label="Tipo de reporte" className="flex gap-5">
          {(
            [
              { id: 'flujo', label: 'Flujo de Caja' },
              { id: 'ingresos', label: 'Ingresos' },
              { id: 'egresos', label: 'Egresos' },
              { id: 'margen_nv', label: 'Margen por Nota de Venta (NV)' },
            ] as { id: ReportTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={config.tab === t.id}
              onClick={() => update('tab', t.id)}
              className={`border-b-2 px-1 py-3 text-sm font-semibold transition cursor-pointer ${
                config.tab === t.id
                  ? 'border-[#e87622] text-[#d4671c]'
                  : 'border-transparent text-[#66716f] hover:text-[#252b2d]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#66716f] hover:text-[#252b2d] cursor-pointer"
          onClick={() => {
            void loadRows();
            void loadMargenData();
          }}
        >
          <RefreshCcw size={14} /> Actualizar
        </button>
      </div>

      {/* Pestaña Margen por NV */}
      {config.tab === 'margen_nv' ? (
        <div className="space-y-5">
          {/* Indicadores de Margen */}
          <section aria-label="Indicadores de margen por NV" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="hg-panel p-5">
              <div className="flex items-center justify-between">
                <p className="hg-overline">Venta Total Cotizada</p>
                <BarChart3 size={18} className="text-blue-700" />
              </div>
              <p className="hg-kpi-value mt-4 text-blue-900">
                {money(margenTotals.totalVenta)}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Suma de NVs analizadas</span>
            </div>

            <div className="hg-panel p-5">
              <div className="flex items-center justify-between">
                <p className="hg-overline">Cobrado Validado en Caja</p>
                <ArrowUpRight size={18} className="text-emerald-700" />
              </div>
              <p className="hg-kpi-value mt-4 text-emerald-700">
                {money(margenTotals.totalIngresos)}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Abonos verificados</span>
            </div>

            <div className="hg-panel p-5">
              <div className="flex items-center justify-between">
                <p className="hg-overline">Costos Directos (OC + Fletes)</p>
                <ArrowDownRight size={18} className="text-amber-700" />
              </div>
              <p className="hg-kpi-value mt-4 text-amber-700">
                {money(margenTotals.totalCostos)}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Insumos y despachos imputados</span>
            </div>

            <div className="hg-panel p-5">
              <div className="flex items-center justify-between">
                <p className="hg-overline">Margen Bruto Real Total</p>
                <Percent size={18} className={margenTotals.margenReal >= 0 ? 'text-emerald-600' : 'text-red-600'} />
              </div>
              <p className={`hg-kpi-value mt-4 ${margenTotals.margenReal >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                {money(margenTotals.margenReal)}
              </p>
              <span className="text-[11px] font-bold mt-1 block text-gray-700">
                Rentabilidad Real: {margenTotals.pctReal.toFixed(1)}% (Proyectada: {margenTotals.pctProyectado.toFixed(1)}%)
              </span>
            </div>
          </section>

          {/* Filtros Margen */}
          <section className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por NV, título de venta, cliente o vendedor..."
                value={searchMargen}
                onChange={(e) => setSearchMargen(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f4f5f3] rounded-lg text-xs text-[#213343] font-semibold border border-transparent focus:border-[#f97316] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">Rentabilidad:</label>
              <select
                value={filtroRentabilidad}
                onChange={(e) => setFiltroRentabilidad(e.target.value as any)}
                className="bg-[#f4f5f3] border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-[#213343] font-semibold cursor-pointer"
              >
                <option value="todos">Todas las Notas de Venta</option>
                <option value="positivo">Margen Positivo (Ganancia)</option>
                <option value="negativo">Margen Negativo (Pérdida / En curso)</option>
              </select>
            </div>
          </section>

          {/* Tabla de Margen por NV */}
          <section className="hg-panel overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-[#213343] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#f97316]" />
                <span>Matriz de Costos y Margen Real por Nota de Venta ({filteredMargen.length})</span>
              </h2>
              <span className="text-xs text-gray-500">
                Cálculo atómico en base a compras asignadas, fletes confirmados y abonos validados
              </span>
            </div>

            {loadingMargen ? (
              <div className="p-8 text-center text-xs text-gray-500">Cargando matriz de rentabilidad...</div>
            ) : filteredMargen.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">No se encontraron ventas para este filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[1100px]">
                  <thead className="bg-[#f4f5f3] text-[#66716f] uppercase text-[10px] tracking-normal border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">NV / Código</th>
                      <th className="py-3 px-4">Proyecto & Cliente</th>
                      <th className="py-3 px-4">Vendedor</th>
                      <th className="py-3 px-4 text-right">Venta Cotizada</th>
                      <th className="py-3 px-4 text-right">Cobrado en Caja</th>
                      <th className="py-3 px-4 text-right">Compras OC</th>
                      <th className="py-3 px-4 text-right">Fletes Guías</th>
                      <th className="py-3 px-4 text-right">Costo Total</th>
                      <th className="py-3 px-4 text-right">Margen Real ($)</th>
                      <th className="py-3 px-4 text-center">Rentabilidad</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredMargen.map((r) => {
                      const isRealPositive = Number(r.margen_bruto_real) >= 0;
                      return (
                        <tr key={r.oportunidad_id} className="hover:bg-gray-50 transition">
                          <td className="py-3 px-4 font-mono font-bold text-[#213343]">
                            {r.codigo}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-gray-900">{r.titulo}</div>
                            <div className="text-[11px] text-gray-500">{r.cliente_nombre} {r.cliente_rut ? `(${r.cliente_rut})` : ''}</div>
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-700">
                            {r.vendedor_nombre}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-gray-800">
                            {money(Number(r.valor_cotizado_total || 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-700">
                            {money(Number(r.total_ingresos_validados || 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-700">
                            {money(Number(r.costo_compras_asignadas || 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-700">
                            {money(Number(r.costo_fletes_despacho || 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-amber-800">
                            {money(Number(r.costo_directo_total || 0))}
                          </td>
                          <td className="py-3 px-4 text-right font-black">
                            <span className={isRealPositive ? 'text-emerald-700' : 'text-red-700'}>
                              {money(Number(r.margen_bruto_real || 0))}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 border ${
                                isRealPositive
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              {isRealPositive ? (
                                <TrendingUp size={12} className="text-emerald-600" />
                              ) : (
                                <TrendingDown size={12} className="text-red-600" />
                              )}
                              <span>{Number(r.porcentaje_margen_real || 0).toFixed(1)}%</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Link
                                href={`/ventas?oportunidad=${r.oportunidad_id}`}
                                className="p-1 text-gray-500 hover:text-[#f97316] hover:bg-orange-50 rounded transition"
                                title="Ver venta"
                              >
                                <ExternalLink size={14} />
                              </Link>
                              <Link
                                href={`/ventas/${r.oportunidad_id}/operacion`}
                                className="text-[10px] font-bold text-[#f97316] hover:underline"
                                title="Ver producción y margen operativo"
                              >
                                Operación
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Pestañas Tradicionales: Flujo, Ingresos, Egresos */
        <div className="space-y-5">
          <section aria-label="Filtros de reportes" className="hg-panel flex flex-wrap items-end gap-3 p-4">
            <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]">
              <CalendarDays size={14} className="mb-1 inline" /> Desde
              <input
                aria-label="Fecha inicial"
                type="date"
                className="hg-field mt-1"
                value={config.desde}
                onChange={(event) => update('desde', event.target.value)}
              />
            </label>
            <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]">
              Hasta
              <input
                aria-label="Fecha final"
                type="date"
                className="hg-field mt-1"
                value={config.hasta}
                onChange={(event) => update('hasta', event.target.value)}
              />
            </label>
            <label className="min-w-40 flex-1 text-xs font-semibold text-[#66716f]">
              <Filter size={14} className="mb-1 inline" /> Categoría
              <select
                className="hg-field mt-1"
                value={config.categoria}
                onChange={(event) => update('categoria', event.target.value)}
              >
                <option value="todas">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="min-w-40 flex-1 text-xs font-semibold text-[#66716f]">
              <Landmark size={14} className="mb-1 inline" /> Cuenta Bancaria
              <select
                className="hg-field mt-1"
                value={selectedCuentaBancaria}
                onChange={(event) => setSelectedCuentaBancaria(event.target.value)}
              >
                <option value="todas">Todas las cuentas</option>
                {cuentasBancarias.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.alias} ({cb.banco})
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-36 flex-1 text-xs font-semibold text-[#66716f]">
              <BarChart3 size={14} className="mb-1 inline" /> Agrupar por
              <select
                className="hg-field mt-1"
                value={config.agrupacion}
                onChange={(event) => update('agrupacion', event.target.value as ReportGrouping)}
              >
                <option value="periodo">Día</option>
                <option value="categoria">Categoría</option>
              </select>
            </label>
          </section>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <section aria-label="Indicadores de caja" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Ingresos registrados', value: money(totals.ingresos), color: 'text-emerald-700', icon: ArrowUpRight },
              { label: 'Egresos registrados', value: money(totals.egresos), color: 'text-red-700', icon: ArrowDownRight },
              { label: 'Saldo neto', value: money(totals.neto), color: 'text-[#252b2d]', icon: BarChart3 },
              {
                label: 'Tasa de saldo',
                value:
                  totals.tasaSaldo === null
                    ? 'No aplica'
                    : new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 }).format(
                        totals.tasaSaldo
                      ),
                color: 'text-[#252b2d]',
                icon: Bookmark,
              },
            ].map((card) => (
              <div key={card.label} className="hg-panel p-5">
                <div className="flex items-center justify-between">
                  <p className="hg-overline">{card.label}</p>
                  <card.icon size={18} className={card.color} />
                </div>
                <p className={`hg-kpi-value mt-4 ${card.color}`}>{loading ? '…' : card.value}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-5">
              <section className="hg-panel overflow-hidden">
                <div className="border-b border-[#e5e7e4] p-5">
                  <p className="hg-overline">{config.tab}</p>
                  <h2 className="hg-section-title">
                    Movimiento por {config.agrupacion === 'periodo' ? 'día' : 'categoría'}
                  </h2>
                </div>
                {series.length === 0 ? (
                  <div className="p-12 text-center text-sm text-[#66716f]">
                    No hay movimientos para este período y filtro.
                  </div>
                ) : (
                  <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
                    {series.map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[minmax(80px,150px)_1fr] items-center gap-3 text-xs"
                      >
                        <span className="truncate font-semibold" title={item.label}>
                          {config.agrupacion === 'periodo'
                            ? new Date(`${item.label}T12:00:00`).toLocaleDateString('es-CL')
                            : item.label}
                        </span>
                        <div className="space-y-1">
                          {config.tab !== 'egresos' && (
                            <div className="flex items-center gap-2">
                              <span
                                title={`Ingresos ${money(item.ingresos)}`}
                                className="h-3 rounded bg-emerald-500"
                                style={{
                                  width: `${Math.max(
                                    item.ingresos > 0 ? 2 : 0,
                                    (item.ingresos / maxBar) * 90
                                  )}%`,
                                }}
                              />
                              <span className="tabular-nums text-[#66716f]">{money(item.ingresos)}</span>
                            </div>
                          )}
                          {config.tab !== 'ingresos' && (
                            <div className="flex items-center gap-2">
                              <span
                                title={`Egresos ${money(item.egresos)}`}
                                className="h-3 rounded bg-orange-400"
                                style={{
                                  width: `${Math.max(
                                    item.egresos > 0 ? 2 : 0,
                                    (item.egresos / maxBar) * 90
                                  )}%`,
                                }}
                              />
                              <span className="tabular-nums text-[#66716f]">{money(item.egresos)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="hg-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5e7e4] p-5">
                  <h2 className="hg-section-title">Movimientos</h2>
                  <span className="text-xs text-[#66716f]">{visible.length} registros</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="hg-table hg-list-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Categoría</th>
                        <th>Descripción</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.slice(0, 100).map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.fecha).toLocaleDateString('es-CL')}</td>
                          <td className={row.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'}>
                            {row.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                          </td>
                          <td>{row.categoria}</td>
                          <td>{row.descripcion || '—'}</td>
                          <td className="font-semibold tabular-nums">{money(Number(row.monto))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visible.length > 100 && (
                  <p className="border-t border-[#e5e7e4] p-3 text-xs text-[#66716f]">
                    Se muestran los 100 movimientos más recientes.
                  </p>
                )}
                {!visible.length && <p className="p-8 text-center text-sm text-[#66716f]">Sin movimientos para mostrar.</p>}
              </section>
            </div>

            <aside className="hg-panel h-fit p-5">
              <p className="hg-overline">Personalización</p>
              <h2 className="hg-section-title mt-1">Vistas guardadas</h2>
              <p className="mt-1 text-xs text-[#66716f]">Solo tú puedes ver y administrar tus vistas.</p>
              <label className="mt-4 block text-xs font-semibold text-[#66716f]">
                Nombre de la vista
                <input
                  className="hg-field mt-1"
                  maxLength={80}
                  value={viewName}
                  onChange={(event) => setViewName(event.target.value)}
                  placeholder="Ej. Flujo mensual"
                />
              </label>
              <button
                onClick={() => void saveView()}
                disabled={saving}
                className="hg-button-primary mt-3 w-full"
              >
                <Bookmark size={16} /> {saving ? 'Guardando…' : 'Guardar vista'}
              </button>
              {saveError && <p role="alert" className="mt-3 text-xs text-red-700">{saveError}</p>}
              <div className="mt-5 space-y-2 border-t border-[#e5e7e4] pt-4">
                {saved.length === 0 && <p className="text-xs text-[#66716f]">Aún no tienes vistas guardadas.</p>}
                {saved.map((view) => (
                  <div
                    key={view.id}
                    className={`flex items-center gap-1 rounded-lg border p-1 ${
                      activeViewId === view.id ? 'border-[#f7d3b8] bg-[#fff1e7]' : 'border-[#e5e7e4]'
                    }`}
                  >
                    <button
                      className="min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-xs font-semibold hover:underline"
                      onClick={() => {
                        const next = parseReportConfig(view.configuracion);
                        if (!next) {
                          setSaveError('Esta vista tiene una configuración inválida.');
                          return;
                        }
                        setConfig(next);
                        setViewName(view.nombre);
                        setActiveViewId(view.id);
                      }}
                      title={view.nombre}
                    >
                      {view.nombre}
                    </button>
                    <button
                      title="Renombrar vista"
                      aria-label={`Renombrar ${view.nombre}`}
                      onClick={() => void renameView(view)}
                      className="rounded p-1.5 text-[#66716f] hover:bg-white"
                    >
                      ✎
                    </button>
                    <button
                      title="Eliminar vista"
                      aria-label={`Eliminar ${view.nombre}`}
                      onClick={() => void deleteView(view)}
                      className="rounded p-1.5 text-[#b83d46] hover:bg-white"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
