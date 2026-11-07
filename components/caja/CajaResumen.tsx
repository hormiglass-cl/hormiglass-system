'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, Eye, Landmark, Pencil, Upload, Wallet } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { mensajeError } from '../../lib/errores';
import type { CuentaBancaria, MargenPorNV, MovimientoCaja } from '../../lib/types';
import { Pagination } from '../Pagination';
import { Button, Dialog, IconButton, Panel, SearchField, StatusBadge, TextInput } from '../ui/crm';
import { FilterBar, FilterMenu, matchMultiFilter, useFilterUi, type FilterDefinition } from '../ui/FilterPills';
import { useAuth } from '../../lib/context/AuthContext';
import { CardTitle, ColumnChart, formatShortMoney } from '../dashboard/visuals';
import { MetricCard } from '../ui/MetricCard';
import { useToast } from '../ui/feedback';

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const signed = (n: number) => `${n < 0 ? '−' : '+'}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const neto = (list: MovimientoCaja[]) =>
  list.reduce((acc, m) => acc + (m.tipo === 'ingreso' ? 1 : -1) * Number(m.monto || 0), 0);
const suma = (list: MovimientoCaja[], tipo: 'ingreso' | 'egreso') =>
  list.filter((m) => m.tipo === tipo).reduce((acc, m) => acc + Number(m.monto || 0), 0);

const CSV_HEADER = ['Fecha', 'Tipo', 'Categoría', 'Glosa', 'Cuenta', 'Empresa', 'Monto'];
const fechaCsv = (iso: string) => {
  const d = new Date(iso);
  return `${dayKey(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface ImportRow {
  linea: number;
  fecha: string | null;
  tipo: 'ingreso' | 'egreso' | null;
  categoria: string;
  descripcion: string;
  cuentaTexto: string;
  cuentaId: string | null;
  monto: number;
  error: string | null;
}

function parseCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\ufeff/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i += 1;
      } else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i += 1;
      fila.push(celda);
      celda = '';
      if (fila.some((v) => v.trim())) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((v) => v.trim())) filas.push(fila);
  return filas;
}

function parseFecha(texto: string): string | null {
  const t = texto.trim();
  const m = t.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const mo = Number(m[2]);
  let [y, d] = [Number(m[1]), Number(m[3])];
  if (m[1].length <= 2) [y, d] = [d, y];
  if (y < 100) y += 2000;
  const date = new Date(y, mo - 1, d, Number(m[4] || 12), Number(m[5] || 0));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1) return null;
  return date.toISOString();
}

/** Primera pestaña de Caja: saldo actual (editable), ingresos y egresos del día y movimientos del período. */
export function CajaResumen({
  vista,
  desde,
  hasta,
  movimientos,
  cuentas,
  canEdit,
  onReload,
}: {
  vista: 'resumen' | 'movimientos';
  desde: string;
  hasta: string;
  movimientos: MovimientoCaja[];
  cuentas: CuentaBancaria[];
  canEdit: boolean;
  onReload: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const { currentUser } = useAuth();
  const filterUi = useFilterUi();

  const [search, setSearch] = useState('');
  const [tipoTab, setTipoTab] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [detalle, setDetalle] = useState<MovimientoCaja | null>(null);
  const [margenes, setMargenes] = useState<MargenPorNV[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from('v_margen_por_nv').select('*').order('fecha_creacion', { ascending: false });
      if (alive && data) setMargenes(data as MargenPorNV[]);
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [canEdit, supabase, movimientos.length]);

  const hoy = dayKey(new Date().toISOString());

  /* ── Saldos: saldo base de la cuenta + todos sus movimientos ── */
  const saldos = useMemo(() => {
    return cuentas.map((cuenta) => {
      const propios = movimientos.filter((m) => m.cuenta_bancaria_id === cuenta.id);
      const net = neto(propios);
      return { cuenta, net, actual: Number(cuenta.saldo_inicial || 0) + net };
    });
  }, [cuentas, movimientos]);
  const sinCuenta = useMemo(() => neto(movimientos.filter((m) => !m.cuenta_bancaria_id)), [movimientos]);
  const cajaTotal = saldos.reduce((acc, s) => acc + s.actual, 0) + sinCuenta;

  const porEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of saldos) {
      const nombre = s.cuenta.empresa?.razon_social || 'Sin empresa';
      map.set(nombre, (map.get(nombre) || 0) + s.actual);
    }
    if (sinCuenta !== 0) map.set('Sin cuenta asignada', sinCuenta);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [saldos, sinCuenta]);

  /* ── Hoy ── */
  const deHoy = useMemo(() => movimientos.filter((m) => dayKey(m.fecha) === hoy), [movimientos, hoy]);
  const ingresosHoy = suma(deHoy, 'ingreso');
  const egresosHoy = suma(deHoy, 'egreso');

  /* ── Período ── */
  const delPeriodo = useMemo(
    () =>
      movimientos.filter((m) => {
        const k = dayKey(m.fecha);
        return (!desde || k >= desde) && (!hasta || k <= hasta);
      }),
    [movimientos, desde, hasta],
  );

  /* ── Gráficos del período ── */
  const serie = useMemo(() => {
    const inicio = desde || (delPeriodo.length ? dayKey(delPeriodo[delPeriodo.length - 1].fecha) : hoy);
    const fin = hasta || hoy;
    const dias = Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1;
    const porMes = dias > 31;
    const buckets = new Map<string, { label: string; a: number; b: number }>();
    const cursor = new Date(`${inicio}T12:00:00Z`);
    for (let i = 0; i < Math.max(dias, 1) && i < 800; i += 1) {
      const key = porMes ? cursor.toISOString().slice(0, 7) : cursor.toISOString().slice(0, 10);
      if (!buckets.has(key)) {
        const label = porMes
          ? cursor.toLocaleDateString('es-CL', { month: 'short', year: '2-digit', timeZone: 'UTC' })
          : String(cursor.getUTCDate());
        buckets.set(key, { label, a: 0, b: 0 });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    for (const m of delPeriodo) {
      const k = dayKey(m.fecha);
      const bucket = buckets.get(porMes ? k.slice(0, 7) : k);
      if (!bucket) continue;
      if (m.tipo === 'ingreso') bucket.a += Number(m.monto || 0);
      else bucket.b += Number(m.monto || 0);
    }
    return [...buckets.values()];
  }, [delPeriodo, desde, hasta, hoy]);

  const egresosPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of delPeriodo) {
      if (m.tipo === 'egreso') {
        const key = m.categoria || 'Sin categoría';
        map.set(key, (map.get(key) || 0) + Number(m.monto || 0));
      }
    }
    const orden = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = orden.slice(0, 7);
    const resto = orden.slice(7).reduce((acc, [, v]) => acc + v, 0);
    if (resto > 0) top.push(['Otras categorías', resto]);
    return top;
  }, [delPeriodo]);

  /* ── Últimos movimientos agrupados por día ── */
  const ultimosPorDia = useMemo(() => {
    const grupos = new Map<string, MovimientoCaja[]>();
    for (const m of delPeriodo.slice(0, 8)) {
      const k = dayKey(m.fecha);
      grupos.set(k, [...(grupos.get(k) || []), m]);
    }
    return [...grupos.entries()];
  }, [delPeriodo]);

  /* ── Margen por nota de venta (NV creadas en el período) ── */
  const margenPeriodo = useMemo(
    () =>
      margenes.filter((r) => {
        const k = dayKey(r.fecha_creacion);
        return (!desde || k >= desde) && (!hasta || k <= hasta);
      }),
    [margenes, desde, hasta],
  );
  const margenTop = useMemo(
    () => [...margenPeriodo].sort((a, b) => Math.abs(Number(b.margen_bruto_proyectado)) - Math.abs(Number(a.margen_bruto_proyectado))).slice(0, 8),
    [margenPeriodo],
  );
  const margenTotal = margenPeriodo.reduce((acc, r) => acc + Number(r.margen_bruto_proyectado || 0), 0);
  const ventaTotal = margenPeriodo.reduce((acc, r) => acc + Number(r.valor_cotizado_neto || 0), 0);
  const margenPct = ventaTotal > 0 ? (margenTotal / ventaTotal) * 100 : 0;
  const margenMax = Math.max(...margenTop.map((r) => Math.abs(Number(r.margen_bruto_proyectado))), 1);

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const empresas = [...new Set(delPeriodo.map((m) => m.cuenta_bancaria?.empresa?.razon_social).filter(Boolean) as string[])].sort();
    const cuentasOpc = [...new Map(delPeriodo.filter((m) => m.cuenta_bancaria).map((m) => [m.cuenta_bancaria!.id, m.cuenta_bancaria!.alias])).entries()];
    const categorias = [...new Set(delPeriodo.map((m) => m.categoria).filter(Boolean))].sort();
    return [
      { id: 'empresa', label: 'Empresa', allLabel: 'Todas las empresas', options: empresas.map((e) => ({ value: e, label: e })) },
      { id: 'cuenta', label: 'Cuenta', allLabel: 'Todas las cuentas', options: cuentasOpc.map(([id, alias]) => ({ value: id, label: alias })) },
      { id: 'categoria', label: 'Categoría', allLabel: 'Todas las categorías', options: categorias.map((c) => ({ value: c, label: c })) },
    ];
  }, [delPeriodo]);

  const filtrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return delPeriodo.filter(
      (m) =>
        (tipoTab === 'todos' || m.tipo === tipoTab) &&
        matchMultiFilter(activeFilters.empresa, (v) => v === m.cuenta_bancaria?.empresa?.razon_social) &&
        matchMultiFilter(activeFilters.cuenta, (v) => v === m.cuenta_bancaria_id) &&
        matchMultiFilter(activeFilters.categoria, (v) => v === m.categoria) &&
        (!term || `${m.categoria} ${m.descripcion || ''} ${m.cuenta_bancaria?.alias || ''}`.toLowerCase().includes(term)),
    );
  }, [delPeriodo, tipoTab, activeFilters, search]);

  const exportarCsv = () => {
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const filas = [
      ['Fecha', 'Tipo', 'Categoría', 'Glosa', 'Cuenta', 'Empresa', 'Monto'].join(';'),
      ...filtrados.map((m) =>
        [
          fechaCsv(m.fecha),
          m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
          esc(m.categoria || ''),
          esc(m.descripcion || ''),
          esc(m.cuenta_bancaria?.alias || ''),
          esc(m.cuenta_bancaria?.empresa?.razon_social || ''),
          String(Number(m.monto || 0)),
        ].join(';'),
      ),
    ];
    const blob = new Blob(['\ufeff' + filas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos-caja-${hoy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pagina = filtrados.slice((page - 1) * perPage, page * perPage);

  /* ── Edición de la caja actual ── */
  const abrirEdicion = () => {
    setDraft(Object.fromEntries(saldos.map((s) => [s.cuenta.id, String(Math.round(s.actual))])));
    setEditOpen(true);
  };

  const guardarEdicion = async () => {
    const cambios = saldos
      .map((s) => ({ s, deseado: Number(draft[s.cuenta.id]) }))
      .filter(({ s, deseado }) => Number.isFinite(deseado) && Math.round(deseado) !== Math.round(s.actual));
    if (!cambios.length) {
      setEditOpen(false);
      return;
    }
    setSaving(true);
    try {
      for (const { s, deseado } of cambios) {
        // La caja actual = saldo base + movimientos; se ajusta el saldo base para llegar al valor indicado.
        const { error } = await supabase
          .from('cuentas_bancarias')
          .update({ saldo_inicial: Math.round(deseado - s.net), updated_at: new Date().toISOString() })
          .eq('id', s.cuenta.id);
        if (error) throw error;
      }
      toast({ message: 'Caja actualizada.', tone: 'success' });
      setEditOpen(false);
      await onReload();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo actualizar la caja. Revisa tus permisos.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const empresasEdicion = useMemo(() => {
    const map = new Map<string, typeof saldos>();
    for (const s of saldos) {
      const nombre = s.cuenta.empresa?.razon_social || 'Sin empresa';
      map.set(nombre, [...(map.get(nombre) || []), s]);
    }
    return [...map.entries()];
  }, [saldos]);

  const leerArchivo = async (file: File | undefined) => {
    if (!file) return;
    const filas = parseCsv(await file.text());
    const [cab, ...datos] = filas;
    const idx = (nombre: string) => cab.findIndex((h) => h.trim().toLowerCase() === nombre.toLowerCase());
    const cols = Object.fromEntries(CSV_HEADER.map((h) => [h, idx(h)]));
    if (cols.Fecha < 0 || cols.Tipo < 0 || cols.Monto < 0 || cols['Categoría'] < 0) {
      toast({ message: 'El archivo debe tener las columnas Fecha, Tipo, Categoría y Monto.', tone: 'danger' });
      return;
    }
    const get = (f: string[], h: string) => (cols[h] >= 0 ? (f[cols[h]] || '').trim() : '');
    const rows: ImportRow[] = datos.map((f, i) => {
      const tipoTxt = get(f, 'Tipo').toLowerCase();
      const tipo = tipoTxt.startsWith('ing') ? 'ingreso' : tipoTxt.startsWith('egr') ? 'egreso' : null;
      const monto = Math.abs(Number(get(f, 'Monto').replace(/[$\s.]/g, '').replace(',', '.')));
      const fecha = parseFecha(get(f, 'Fecha'));
      const cuentaTexto = get(f, 'Cuenta');
      const cuenta = cuentaTexto ? cuentas.find((c) => c.alias.toLowerCase() === cuentaTexto.toLowerCase()) : undefined;
      let error: string | null = null;
      if (!fecha) error = 'Fecha inválida';
      else if (!tipo) error = 'Tipo inválido';
      else if (!get(f, 'Categoría')) error = 'Falta la categoría';
      else if (!Number.isFinite(monto) || monto <= 0) error = 'Monto inválido';
      else if (cuentaTexto && !cuenta) error = 'Cuenta no encontrada';
      return {
        linea: i + 2,
        fecha,
        tipo,
        categoria: get(f, 'Categoría'),
        descripcion: get(f, 'Glosa'),
        cuentaTexto,
        cuentaId: cuenta?.id || null,
        monto,
        error,
      };
    });
    setImportName(file.name);
    setImportRows(rows);
  };

  const importar = async () => {
    const validas = importRows.filter((r) => !r.error);
    if (!validas.length) return;
    setImporting(true);
    try {
      const payload = validas.map((r) => ({
        tipo: r.tipo,
        monto: r.monto,
        categoria: r.categoria,
        descripcion: r.descripcion || r.categoria,
        usuario_id: currentUser?.id || null,
        cuenta_bancaria_id: r.cuentaId,
        fecha: r.fecha,
      }));
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from('caja_movimientos').insert(payload.slice(i, i + 200));
        if (error) throw error;
      }
      toast({ message: `${validas.length} movimientos importados.`, tone: 'success' });
      setImportOpen(false);
      setImportRows([]);
      setImportName('');
      await onReload();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo importar. Revisa el archivo y tus permisos.'), tone: 'danger' });
    } finally {
      setImporting(false);
    }
  };

  const descargarPlantilla = () => {
    const ejemplo = [`${hoy} 10:30`, 'Ingreso', 'Venta directa', 'Abono cliente', cuentas[0]?.alias || '', '', '150000'];
    const blob = new Blob(['\ufeff' + [CSV_HEADER.join(';'), ejemplo.join(';')].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-movimientos-caja.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importValidas = importRows.filter((r) => !r.error).length;
  const importErrores = importRows.length - importValidas;

  return (
    <div className="space-y-5">
      {vista === 'resumen' && (
      <>
      {/* Caja actual · ingresos y egresos del día */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[20px] bg-accent-soft p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-control bg-surface text-accent-ink">
                <Wallet size={16} aria-hidden />
              </span>
              <span className="text-sm font-semibold text-ink">Caja actual</span>
            </div>
            {canEdit && <IconButton icon={Pencil} label="Editar caja" onClick={abrirEdicion} />}
          </div>
          <p className="t-num mt-3 text-3xl font-bold text-ink">{money(cajaTotal)}</p>
          <ul className="mt-3 space-y-1">
            {porEmpresa.slice(0, 4).map(([nombre, valor]) => (
              <li key={nombre} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-ink-muted">{nombre}</span>
                <span className="t-num font-semibold text-ink">{money(valor)}</span>
              </li>
            ))}
            {!porEmpresa.length && <li className="text-xs text-ink-muted">Sin cuentas registradas.</li>}
          </ul>
        </div>

        <MetricCard
          title="Ingresos de hoy"
          value={`+${money(ingresosHoy)}`}
          icon={ArrowUpRight}
          tone="success"
          change={{
            value: `${deHoy.filter((m) => m.tipo === 'ingreso').length} movimientos`,
            trend: 'up',
            label: `Período: ${signed(suma(delPeriodo, 'ingreso'))}`,
          }}
        />
        <MetricCard
          title="Egresos de hoy"
          value={`−${money(egresosHoy)}`}
          icon={ArrowDownRight}
          tone="danger"
          change={{
            value: `${deHoy.filter((m) => m.tipo === 'egreso').length} movimientos`,
            trend: 'down',
            label: `Período: ${signed(-suma(delPeriodo, 'egreso'))}`,
          }}
        />
      </div>

      {/* Ingresos y egresos + últimos movimientos */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ColumnChart
          title="Ingresos y egresos"
          data={serie}
          aLabel="Ingresos"
          bLabel="Egresos"
          aClass="bg-success"
          bClass="bg-danger"
          format={formatShortMoney}
          showEmpty
        />

        <section className="rounded-[20px] border border-line bg-surface p-6">
          <CardTitle title="Últimos movimientos" />
          {ultimosPorDia.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">Sin movimientos en este período.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {ultimosPorDia.map(([dia, lista]) => {
                const net = neto(movimientos.filter((m) => dayKey(m.fecha) === dia));
                return (
                  <div key={dia}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold capitalize text-ink">
                        {dia === hoy
                          ? 'Hoy'
                          : new Date(`${dia}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className={`t-num font-semibold ${net >= 0 ? 'text-success' : 'text-danger'}`}>{signed(net)}</span>
                    </div>
                    <ul className="divide-y divide-line-subtle">
                      {lista.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${m.tipo === 'ingreso' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
                              {m.tipo === 'ingreso' ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-ink">{m.categoria}</span>
                              <span className="block truncate text-[11px] text-ink-muted">{m.cuenta_bancaria?.alias || 'Sin cuenta'}</span>
                            </span>
                          </span>
                          <span className={`t-num shrink-0 text-xs font-semibold ${m.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                            {m.tipo === 'ingreso' ? '+' : '−'}${Number(m.monto).toLocaleString('es-CL')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Margen por nota de venta + egresos por categoría */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canEdit && (
          <section className="rounded-[20px] border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Margen por nota de venta" />
              <div className="text-right">
                <p className={`t-num text-xl font-bold ${margenTotal >= 0 ? 'text-success' : 'text-danger'}`}>{money(margenTotal)}</p>
                <p className="text-xs text-ink-muted">{margenPct.toFixed(1)}% de {formatShortMoney(ventaTotal)}</p>
              </div>
            </div>
            {margenTop.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">No hay notas de venta creadas en este período.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {margenTop.map((r) => {
                  const valor = Number(r.margen_bruto_proyectado || 0);
                  const positivo = valor >= 0;
                  return (
                    <li key={r.oportunidad_id}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold text-ink">{r.codigo}</span>
                          <span className="text-ink-muted"> · {r.cliente_nombre || r.titulo}</span>
                        </span>
                        <span className={`t-num shrink-0 font-semibold ${positivo ? 'text-success' : 'text-danger'}`}>
                          {money(valor)} · {Number(r.porcentaje_margen_proyectado || 0).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full rounded-full ${positivo ? 'bg-success' : 'bg-danger'}`}
                          style={{ width: `${Math.max(2, (Math.abs(valor) / margenMax) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className={`rounded-[20px] border border-line bg-surface p-6 ${canEdit ? '' : 'xl:col-span-2'}`}>
          <CardTitle title="Egresos por categoría" />
          {egresosPorCategoria.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">Sin egresos en este período.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {egresosPorCategoria.map(([nombre, valor], i) => {
                const total = egresosPorCategoria.reduce((acc, [, v]) => acc + v, 0);
                const maxCat = egresosPorCategoria[0][1] || 1;
                return (
                  <li key={nombre}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-semibold text-ink">{nombre}</span>
                      <span className="t-num shrink-0 text-ink-muted">
                        {money(valor)} · {Math.round((valor / total) * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className={`h-full rounded-full ${i === 0 ? 'bg-danger' : 'bg-danger/60'}`}
                        style={{ width: `${Math.max(2, (valor / maxCat) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      </>
      )}

      {vista === 'movimientos' && (
        <Panel className="p-5">
          {/* Búsqueda, tipo y filtros */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              className="max-w-xs"
              placeholder="Buscar movimiento"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <div role="tablist" aria-label="Tipo de movimiento" className="inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
              {([['todos', 'Todos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tipoTab === id}
                  onClick={() => {
                    setTipoTab(id);
                    setPage(1);
                  }}
                  className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                    tipoTab === id ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <FilterMenu filters={filterDefinitions} activeFilters={activeFilters} ui={filterUi} />
              <Button variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>
                Importar
              </Button>
              <Button variant="secondary" icon={Download} onClick={exportarCsv} disabled={filtrados.length === 0}>
                Exportar
              </Button>
            </div>
          </div>
          <FilterBar
            filters={filterDefinitions}
            activeFilters={activeFilters}
            onFilterChange={(id, val) => {
              setActiveFilters((prev) => ({ ...prev, [id]: val }));
              setPage(1);
            }}
            onClearAll={() => setActiveFilters({})}
            ui={filterUi}
            className="mt-3"
          />

          {/* Tabla */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            {filtrados.length === 0 ? (
              <p className="p-10 text-center text-sm text-ink-muted">No hay movimientos con estos filtros.</p>
            ) : (
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead>
                  <tr className="bg-surface-muted text-ink-muted">
                    {['Categoría', 'Glosa', 'Cuenta', 'Empresa', 'Monto', 'Tipo', 'Fecha y hora', 'Acción'].map((h) => (
                      <th key={h} className={`p-3 font-semibold ${h === 'Monto' ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((m) => (
                    <tr key={m.id} className="border-t border-line-subtle transition hover:bg-surface-muted/50">
                      <td className="p-3 font-semibold text-ink">{m.categoria}</td>
                      <td className="max-w-[240px] truncate p-3 text-ink-muted" title={m.descripcion || undefined}>
                        {m.descripcion && m.descripcion !== m.categoria ? m.descripcion : '—'}
                      </td>
                      <td className="p-3">
                        {m.cuenta_bancaria?.alias ? (
                          <span className="inline-flex items-center gap-1 font-medium text-ink">
                            <Landmark className="h-3 w-3 text-accent-ink" aria-hidden />
                            {m.cuenta_bancaria.alias}
                          </span>
                        ) : (
                          <span className="italic text-ink-muted">Sin cuenta</span>
                        )}
                      </td>
                      <td className="p-3 text-ink-muted">{m.cuenta_bancaria?.empresa?.razon_social || '—'}</td>
                      <td className={`t-num p-3 text-right text-sm font-semibold ${m.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                        {m.tipo === 'ingreso' ? '+' : '−'}${Number(m.monto).toLocaleString('es-CL')}
                      </td>
                      <td className="p-3">
                        <StatusBadge tone={m.tipo === 'ingreso' ? 'success' : 'danger'}>
                          {m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                        </StatusBadge>
                      </td>
                      <td className="t-num whitespace-nowrap p-3 text-ink-muted">
                        {new Date(m.fecha).toLocaleDateString('es-CL')} · {new Date(m.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3">
                        <IconButton icon={Eye} label="Ver detalle" onClick={() => setDetalle(m)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-2">
            <Pagination
              currentPage={page}
              totalItems={filtrados.length}
              itemsPerPage={perPage}
              onPageChange={setPage}
              onItemsPerPageChange={setPerPage}
            />
          </div>
        </Panel>
      )}

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar movimientos"
        footer={
          <>
            <Button variant="subtle" icon={Download} onClick={descargarPlantilla}>
              Plantilla
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={importing || importValidas === 0} onClick={() => void importar()}>
              {importing ? 'Importando…' : `Importar ${importValidas || ''}`.trim()}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line p-6 text-center transition hover:bg-surface-muted">
            <Upload size={20} className="text-accent-ink" aria-hidden />
            <span className="text-sm font-semibold text-ink">{importName || 'Elegir archivo CSV'}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void leerArchivo(e.target.files?.[0])} />
          </label>
          {importRows.length > 0 && (
            <div>
              <p className="text-xs text-ink-muted">
                {importValidas} listos{importErrores > 0 ? ` · ${importErrores} con error` : ''}
              </p>
              {importErrores > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {importRows
                    .filter((r) => r.error)
                    .slice(0, 20)
                    .map((r) => (
                      <li key={r.linea} className="rounded-md bg-danger-soft px-2 py-1 text-danger">
                        Fila {r.linea}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle ? `${detalle.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} · ${detalle.categoria}` : ''}
        size="sm"
        footer={<Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>}
      >
        {detalle && (
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-ink-muted">Monto</dt>
            <dd className={`t-num text-base font-bold ${detalle.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
              {detalle.tipo === 'ingreso' ? '+' : '−'}${Number(detalle.monto).toLocaleString('es-CL')}
            </dd>
            <dt className="text-ink-muted">Fecha y hora</dt>
            <dd className="text-ink">{new Date(detalle.fecha).toLocaleString('es-CL')}</dd>
            <dt className="text-ink-muted">Glosa</dt>
            <dd className="text-ink">{detalle.descripcion || '—'}</dd>
            <dt className="text-ink-muted">Cuenta</dt>
            <dd className="text-ink">{detalle.cuenta_bancaria?.alias || 'Sin cuenta asignada'}</dd>
            <dt className="text-ink-muted">Empresa</dt>
            <dd className="text-ink">{detalle.cuenta_bancaria?.empresa?.razon_social || '—'}</dd>
          </dl>
        )}
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar caja"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void guardarEdicion()}>
              {saving ? 'Guardando…' : 'Guardar caja'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {empresasEdicion.map(([empresa, lista]) => (
            <section key={empresa}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{empresa}</h3>
              <div className="space-y-2">
                {lista.map((s) => (
                  <div key={s.cuenta.id} className="flex items-center justify-between gap-3">
                    <label htmlFor={`caja-${s.cuenta.id}`} className="min-w-0 text-xs">
                      <span className="block truncate font-semibold text-ink">{s.cuenta.alias}</span>
                      <span className="text-ink-muted">{s.cuenta.banco}</span>
                    </label>
                    <TextInput
                      id={`caja-${s.cuenta.id}`}
                      type="number"
                      className="w-40 text-right"
                      value={draft[s.cuenta.id] ?? ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [s.cuenta.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {sinCuenta !== 0 && (
            <p className="t-caption">
              Movimientos sin cuenta: {money(sinCuenta)}.
            </p>
          )}
          {!saldos.length && <p className="text-sm text-ink-muted">No hay cuentas activas.</p>}
        </div>
      </Dialog>
    </div>
  );
}
