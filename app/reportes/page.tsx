'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Bookmark,
  CalendarDays,
  Download,
  ExternalLink,
  Filter,
  Landmark,
  RefreshCcw,
  Trash2,
  Wallet,
  Edit2,
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
import {
  PageHeader,
  Panel,
  Button,
  IconButton,
  Tabs,
  SummaryLine,
  FilterBar,
  SearchField,
  FilterSelect,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  Select,
} from '../../components/ui/crm';
import { useToast, useConfirm } from '../../components/ui/feedback';

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
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
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

  // Renombrar vista modal
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [viewToRename, setViewToRename] = useState<SavedView | null>(null);
  const [renameValue, setRenameValue] = useState('');

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
    if (viewsError) {
      setSaveError('No se pudieron cargar las vistas guardadas.');
    } else {
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
    const timer = setTimeout(() => {
      void loadCuentas();
      void loadMargenData();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser, loadCuentas, loadMargenData]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = setTimeout(() => {
      void loadRows();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser, loadRows]);

  useEffect(() => {
    if (!currentUser || currentUser.rol === 'mano_obra') return;
    const timer = setTimeout(() => {
      void loadViews();
    }, 0);
    return () => clearTimeout(timer);
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
    if (writeError) {
      setSaveError('No se pudo guardar la vista. Comprueba los permisos y el nombre.');
    } else {
      setActiveViewId(data?.id || '');
      toast({ message: `Vista “${name}” guardada con éxito.`, tone: 'success' });
      await loadViews();
    }
    setSaving(false);
  }

  async function deleteView(view: SavedView) {
    if (!currentUser?.id) return;
    const ok = await confirm({
      title: 'Eliminar vista guardada',
      message: `¿Estás seguro de eliminar la vista “${view.nombre}”?`,
      confirmLabel: 'Eliminar vista',
      destructive: true,
    });
    if (!ok) return;

    const { error: deleteError } = await supabase
      .from('reportes_vistas')
      .delete()
      .eq('id', view.id)
      .eq('usuario_id', currentUser.id);
    if (deleteError) {
      toast({ message: 'No se pudo eliminar la vista.', tone: 'danger' });
    } else {
      if (activeViewId === view.id) setActiveViewId('');
      toast({ message: 'Vista eliminada.', tone: 'info' });
      await loadViews();
    }
  }

  function openRenameModal(view: SavedView) {
    setViewToRename(view);
    setRenameValue(view.nombre);
    setRenameModalOpen(true);
  }

  async function handleConfirmRename() {
    if (!currentUser?.id || !viewToRename || !renameValue.trim()) return;
    const { error: renameError } = await supabase
      .from('reportes_vistas')
      .update({ nombre: renameValue.trim() })
      .eq('id', viewToRename.id)
      .eq('usuario_id', currentUser.id);
    if (renameError) {
      toast({ message: 'No se pudo renombrar la vista.', tone: 'danger' });
    } else {
      toast({ message: 'Vista renombrada con éxito.', tone: 'success' });
      setRenameModalOpen(false);
      setViewToRename(null);
      await loadViews();
    }
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

  if (!currentUser || currentUser.rol === 'mano_obra') {
    return (
      <Panel className="p-8 text-center">
        <h1 className="t-section">Acceso restringido</h1>
        <p className="t-caption mt-1">
          Los reportes financieros están disponibles para administración y usuarios comerciales.
        </p>
      </Panel>
    );
  }

  return (
    <div className="hg-page space-y-5">
      <PageHeader
        title="Reportes y rentabilidad"
        description="Flujo de caja bancario y matriz operacional de costos y margen por Nota de Venta (NV)."
        actions={
          <>
            <IconButton
              icon={RefreshCcw}
              label="Actualizar datos"
              onClick={() => {
                void loadRows();
                void loadMargenData();
              }}
              className={loading ? 'animate-spin' : undefined}
            />
            {config.tab === 'margen_nv' && (
              <Button
                variant="secondary"
                icon={Download}
                onClick={handleExportMargenCsv}
              >
                Exportar margen a CSV
              </Button>
            )}
            <Button
              variant="secondary"
              icon={Wallet}
              onClick={() => router.push('/caja')}
            >
              Abrir caja
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        items={[
          { id: 'flujo', label: 'Flujo de caja' },
          { id: 'ingresos', label: 'Ingresos' },
          { id: 'egresos', label: 'Egresos' },
          { id: 'margen_nv', label: 'Margen por Nota de Venta (NV)', count: margenRows.length },
        ]}
        active={config.tab}
        onChange={(id) => update('tab', id as ReportTab)}
      />

      {/* Pestaña Margen por NV */}
      {config.tab === 'margen_nv' ? (
        <div className="space-y-4">
          {/* Resumen accionable de margen */}
          <Panel className="p-3">
            <SummaryLine
              items={[
                {
                  label: 'venta total cotizada',
                  value: money(margenTotals.totalVenta),
                  tone: 'info',
                },
                {
                  label: 'cobrado en caja',
                  value: money(margenTotals.totalIngresos),
                  tone: 'success',
                },
                {
                  label: 'costos directos (OC + Fletes)',
                  value: money(margenTotals.totalCostos),
                  tone: 'warning',
                },
                {
                  label: `margen bruto real (${margenTotals.pctReal.toFixed(1)}%)`,
                  value: money(margenTotals.margenReal),
                  tone: margenTotals.margenReal >= 0 ? 'success' : 'danger',
                },
              ]}
            />
          </Panel>

          {/* Filtros Margen */}
          <FilterBar>
            <SearchField
              placeholder="Buscar por NV, título de venta, cliente o vendedor..."
              value={searchMargen}
              onChange={(e) => setSearchMargen(e.target.value)}
            />

            <FilterSelect
              label="Rentabilidad"
              value={filtroRentabilidad}
              onChange={(e) => setFiltroRentabilidad(e.target.value as 'todos' | 'positivo' | 'negativo')}
            >
              <option value="todos">Todas las Notas de Venta</option>
              <option value="positivo">Margen positivo (ganancia)</option>
              <option value="negativo">Margen negativo (pérdida / en curso)</option>
            </FilterSelect>
          </FilterBar>

          {/* Tabla de Margen por NV */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent-ink" />
                <span>Matriz de costos y margen real por Nota de Venta ({filteredMargen.length})</span>
              </span>
            }
          >
            {loadingMargen ? (
              <div className="p-8 text-center t-caption">Cargando matriz de rentabilidad…</div>
            ) : filteredMargen.length === 0 ? (
              <div className="p-8 text-center t-caption">No se encontraron ventas para este filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="hg-table w-full text-left text-xs min-w-[1100px]">
                  <thead>
                    <tr>
                      <th className="p-3">NV / Código</th>
                      <th className="p-3">Proyecto y cliente</th>
                      <th className="p-3">Vendedor</th>
                      <th className="p-3 text-right">Venta cotizada</th>
                      <th className="p-3 text-right">Cobrado en caja</th>
                      <th className="p-3 text-right">Compras OC</th>
                      <th className="p-3 text-right">Fletes guías</th>
                      <th className="p-3 text-right">Costo total</th>
                      <th className="p-3 text-right">Margen real ($)</th>
                      <th className="p-3 text-center">Rentabilidad</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMargen.map((r) => {
                      const isRealPositive = Number(r.margen_bruto_real) >= 0;
                      return (
                        <tr key={r.oportunidad_id}>
                          <td className="p-3">
                            <CodeStamp title={r.titulo}>{r.codigo}</CodeStamp>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-ink">{r.titulo}</div>
                            <div className="t-caption text-ink-muted">
                              {r.cliente_nombre} {r.cliente_rut ? `(${r.cliente_rut})` : ''}
                            </div>
                          </td>
                          <td className="p-3 text-ink-muted">{r.vendedor_nombre}</td>
                          <td className="p-3 text-right font-semibold text-ink t-num">
                            {money(Number(r.valor_cotizado_total || 0))}
                          </td>
                          <td className="p-3 text-right font-semibold text-success t-num">
                            +{money(Number(r.total_ingresos_validados || 0))}
                          </td>
                          <td className="p-3 text-right text-ink-muted t-num">
                            {money(Number(r.costo_compras_asignadas || 0))}
                          </td>
                          <td className="p-3 text-right text-ink-muted t-num">
                            {money(Number(r.costo_fletes_despacho || 0))}
                          </td>
                          <td className="p-3 text-right font-semibold text-ink t-num">
                            −{money(Number(r.costo_directo_total || 0))}
                          </td>
                          <td className={`p-3 text-right font-semibold t-num ${isRealPositive ? 'text-success' : 'text-danger'}`}>
                            {isRealPositive ? '+' : '−'}{money(Math.abs(Number(r.margen_bruto_real || 0)))}
                          </td>
                          <td className="p-3 text-center">
                            <StatusBadge tone={isRealPositive ? 'success' : 'danger'}>
                              {Number(r.porcentaje_margen_real || 0).toFixed(1)}%
                            </StatusBadge>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <IconButton
                                icon={ExternalLink}
                                label="Ver venta"
                                onClick={() => router.push(`/ventas?oportunidad=${r.oportunidad_id}`)}
                              />
                              <Button
                                size="sm"
                                variant="subtle"
                                onClick={() => router.push(`/ventas?oportunidad=${r.oportunidad_id}&tab=operacion`)}
                              >
                                Operación
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : (
        /* Pestañas Tradicionales: Flujo, Ingresos, Egresos */
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  <CalendarDays size={13} className="inline mr-1 text-ink-muted" /> Desde
                </label>
                <TextInput
                  type="date"
                  aria-label="Fecha inicial"
                  value={config.desde}
                  onChange={(event) => update('desde', event.target.value)}
                />
              </div>

              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  Hasta
                </label>
                <TextInput
                  type="date"
                  aria-label="Fecha final"
                  value={config.hasta}
                  onChange={(event) => update('hasta', event.target.value)}
                />
              </div>

              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  <Filter size={13} className="inline mr-1 text-ink-muted" /> Categoría
                </label>
                <Select
                  value={config.categoria}
                  onChange={(event) => update('categoria', event.target.value)}
                >
                  <option value="todas">Todas las categorías</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  <Landmark size={13} className="inline mr-1 text-ink-muted" /> Cuenta bancaria
                </label>
                <Select
                  value={selectedCuentaBancaria}
                  onChange={(event) => setSelectedCuentaBancaria(event.target.value)}
                >
                  <option value="todas">Todas las cuentas</option>
                  {cuentasBancarias.map((cb) => (
                    <option key={cb.id} value={cb.id}>
                      {cb.alias} ({cb.banco})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block t-caption font-semibold text-ink mb-1">
                  <BarChart3 size={13} className="inline mr-1 text-ink-muted" /> Agrupar por
                </label>
                <Select
                  value={config.agrupacion}
                  onChange={(event) => update('agrupacion', event.target.value as ReportGrouping)}
                >
                  <option value="periodo">Día</option>
                  <option value="categoria">Categoría</option>
                </Select>
              </div>
            </div>
          </Panel>

          {error && (
            <p role="alert" className="p-3 rounded-control border border-danger-line bg-danger-soft text-sm text-danger font-semibold">
              {error}
            </p>
          )}

          {/* Resumen accionable */}
          <Panel className="p-3">
            <SummaryLine
              items={[
                {
                  label: 'ingresos registrados',
                  value: money(totals.ingresos),
                  tone: 'success',
                },
                {
                  label: 'egresos registrados',
                  value: money(totals.egresos),
                  tone: 'danger',
                },
                {
                  label: 'saldo neto',
                  value: money(totals.neto),
                  tone: totals.neto >= 0 ? 'accent' : 'danger',
                },
                {
                  label: 'tasa de saldo',
                  value: totals.tasaSaldo === null
                    ? 'No aplica'
                    : new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 1 }).format(
                        totals.tasaSaldo
                      ),
                  tone: 'neutral',
                },
              ]}
            />
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <Panel
                title={`Movimiento por ${config.agrupacion === 'periodo' ? 'día' : 'categoría'}`}
              >
                {series.length === 0 ? (
                  <div className="p-12 text-center t-caption">
                    No hay movimientos para este período y filtro.
                  </div>
                ) : (
                  <div className="max-h-[420px] space-y-3 overflow-y-auto p-4">
                    {series.map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[minmax(80px,160px)_1fr] items-center gap-3 text-xs"
                      >
                        <span className="truncate font-semibold text-ink" title={item.label}>
                          {config.agrupacion === 'periodo'
                            ? new Date(`${item.label}T12:00:00`).toLocaleDateString('es-CL')
                            : item.label}
                        </span>
                        <div className="space-y-1">
                          {config.tab !== 'egresos' && (
                            <div className="flex items-center gap-2">
                              <span
                                title={`Ingresos ${money(item.ingresos)}`}
                                className="h-3 rounded-control bg-success"
                                style={{
                                  width: `${Math.max(
                                    item.ingresos > 0 ? 2 : 0,
                                    (item.ingresos / maxBar) * 90
                                  )}%`,
                                }}
                              />
                              <span className="t-num text-ink-muted">{money(item.ingresos)}</span>
                            </div>
                          )}
                          {config.tab !== 'ingresos' && (
                            <div className="flex items-center gap-2">
                              <span
                                title={`Egresos ${money(item.egresos)}`}
                                className="h-3 rounded-control bg-accent"
                                style={{
                                  width: `${Math.max(
                                    item.egresos > 0 ? 2 : 0,
                                    (item.egresos / maxBar) * 90
                                  )}%`,
                                }}
                              />
                              <span className="t-num text-ink-muted">{money(item.egresos)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title={
                  <span className="flex items-center justify-between w-full gap-2">
                    <span>Movimientos</span>
                    <span className="t-caption">{visible.length} registros</span>
                  </span>
                }
              >
                <div className="overflow-x-auto">
                  <table className="hg-table w-full text-left text-xs min-w-[600px]">
                    <thead>
                      <tr>
                        <th className="p-3">Fecha</th>
                        <th className="p-3">Tipo</th>
                        <th className="p-3">Categoría</th>
                        <th className="p-3">Descripción</th>
                        <th className="p-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.slice(0, 100).map((row) => (
                        <tr key={row.id}>
                          <td className="p-3 t-num text-ink-muted">
                            {new Date(row.fecha).toLocaleDateString('es-CL')}
                          </td>
                          <td className="p-3">
                            <StatusBadge tone={row.tipo === 'ingreso' ? 'success' : 'danger'}>
                              {row.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                            </StatusBadge>
                          </td>
                          <td className="p-3 font-semibold text-ink">{row.categoria}</td>
                          <td className="p-3 text-ink-muted">{row.descripcion || '—'}</td>
                          <td className={`p-3 text-right font-semibold t-num ${row.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                            {row.tipo === 'ingreso' ? '+' : '−'}{money(Number(row.monto))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {visible.length > 100 && (
                  <p className="border-t border-line-subtle p-3 t-caption">
                    Se muestran los 100 movimientos más recientes.
                  </p>
                )}
                {!visible.length && <p className="p-8 text-center t-caption">Sin movimientos para mostrar.</p>}
              </Panel>
            </div>

            <aside className="space-y-4">
              <Panel className="p-4 space-y-3">
                <h2 className="t-section">Vistas guardadas</h2>
                <p className="t-caption">Solo tú puedes ver y administrar tus vistas personalizadas.</p>

                <Field label="Nombre de la vista">
                  {({ id }) => (
                    <TextInput
                      id={id}
                      maxLength={80}
                      value={viewName}
                      onChange={(event) => setViewName(event.target.value)}
                      placeholder="Ej. Flujo mensual"
                    />
                  )}
                </Field>

                <Button
                  variant="primary"
                  icon={Bookmark}
                  disabled={saving}
                  onClick={() => void saveView()}
                  className="w-full"
                >
                  {saving ? 'Guardando…' : 'Guardar vista'}
                </Button>

                {saveError && (
                  <p role="alert" className="t-caption text-danger">{saveError}</p>
                )}

                <div className="pt-3 border-t border-line-subtle space-y-2">
                  {saved.length === 0 && (
                    <p className="t-caption">Aún no tienes vistas guardadas.</p>
                  )}
                  {saved.map((view) => (
                    <div
                      key={view.id}
                      className={`flex items-center gap-1 rounded-control border p-1 transition-colors ${
                        activeViewId === view.id
                          ? 'border-accent-line bg-accent-soft'
                          : 'border-line bg-surface'
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-semibold text-ink hover:underline cursor-pointer"
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
                      <IconButton
                        icon={Edit2}
                        label={`Renombrar ${view.nombre}`}
                        onClick={() => openRenameModal(view)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={`Eliminar ${view.nombre}`}
                        onClick={() => void deleteView(view)}
                      />
                    </div>
                  ))}
                </div>
              </Panel>
            </aside>
          </div>
        </div>
      )}

      {/* Diálogo Renombrar Vista (evita prompt nativo) */}
      <Dialog
        open={renameModalOpen && !!viewToRename}
        title="Renombrar vista guardada"
        onClose={() => setRenameModalOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRenameModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmRename()}
            >
              Guardar nombre
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nuevo nombre" required>
            {({ id }) => (
              <TextInput
                id={id}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                maxLength={80}
              />
            )}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
