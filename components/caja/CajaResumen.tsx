'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, Download, Eye, Fuel, Landmark, Package, Pencil, Trash2, Truck, Upload, Wallet } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { mensajeError } from '../../lib/errores';
import { logSistema } from '../../lib/logger';
import {
  labelMedioPago,
  labelTipoDocumento,
  MEDIOS_PAGO,
  TIPOS_DOCUMENTO_CAJA,
} from '../../lib/caja-catalogos';
import {
  EMPTY_CAJA_LOOKUPS,
  nombreClienteCorto,
  type CajaLookups,
} from './MovimientoCajaDialog';
import type { CostoPorCliente, CuentaBancaria, MargenPorNV, MovimientoCaja } from '../../lib/types';
import { Pagination } from '../Pagination';
import { Button, CodeStamp, Dialog, IconButton, Panel, SearchField, StatusBadge, TextInput } from '../ui/crm';
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

const CSV_HEADER = [
  'Fecha',
  'Tipo',
  'Categoría',
  'Glosa',
  'Cuenta',
  'Empresa',
  'Monto',
  'Medio de pago',
  'Documento',
  'Centro de costos',
  'Código insumo',
  'Camión',
  'Trabajador',
  'Cliente',
  'Proveedor',
];
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
  empresaId: string | null;
  medioPago: string | null;
  tipoDocumento: string | null;
  centroCostoId: string | null;
  insumoId: string | null;
  vehiculoId: string | null;
  trabajadorId: string | null;
  clienteId: string | null;
  proveedorId: string | null;
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
  lookups = EMPTY_CAJA_LOOKUPS,
  canEdit,
  abonoMovIds,
  onEditMovimiento,
  onVerMovimientos,
  onReload,
}: {
  vista: 'resumen' | 'movimientos';
  desde: string;
  hasta: string;
  movimientos: MovimientoCaja[];
  cuentas: CuentaBancaria[];
  lookups?: CajaLookups;
  canEdit: boolean;
  abonoMovIds?: Set<string>;
  onEditMovimiento?: (m: MovimientoCaja) => void;
  onVerMovimientos?: () => void;
  onReload: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const { currentUser } = useAuth();
  const filterUi = useFilterUi();

  const [search, setSearch] = useState('');
  const [tipoTab, setTipoTab] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [grupoInsumoTab, setGrupoInsumoTab] = useState<'todos' | 'materia_prima' | 'combustible'>('todos');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [detalle, setDetalle] = useState<MovimientoCaja | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MovimientoCaja | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [margenes, setMargenes] = useState<MargenPorNV[]>([]);
  const [costosClientes, setCostosClientes] = useState<CostoPorCliente[]>([]);
  const [margenVista, setMargenVista] = useState<'nv' | 'cliente'>('nv');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canEdit) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      const [resNV, resCli] = await Promise.all([
        supabase.from('v_margen_por_nv').select('*').order('fecha_creacion', { ascending: false }),
        supabase.from('v_costos_por_cliente').select('*').order('sobrecosto', { ascending: false }),
      ]);
      if (alive && resNV.data) setMargenes(resNV.data as MargenPorNV[]);
      if (alive && resCli.data) setCostosClientes(resCli.data as CostoPorCliente[]);
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

  /* ── Consumo de materias primas y combustibles del período ── */
  const consumoInsumos = useMemo(() => {
    const acum = new Map<string, { monto: number; count: number }>();
    for (const m of delPeriodo) {
      if (m.tipo === 'egreso' && m.insumo_id) {
        const prev = acum.get(m.insumo_id) || { monto: 0, count: 0 };
        prev.monto += Number(m.monto || 0);
        prev.count += 1;
        acum.set(m.insumo_id, prev);
      }
    }
    const base = lookups.insumos
      .filter((ins) => ins.activo || acum.has(ins.id))
      .map((ins) => {
        const stats = acum.get(ins.id) || { monto: 0, count: 0 };
        return { insumo: ins, monto: stats.monto, count: stats.count };
      });
    const totalMateriaPrima = base
      .filter((x) => x.insumo.grupo === 'materia_prima')
      .reduce((s, x) => s + x.monto, 0);
    const totalCombustibles = base
      .filter((x) => x.insumo.grupo === 'combustible')
      .reduce((s, x) => s + x.monto, 0);
    const totalOtros = base
      .filter((x) => x.insumo.grupo === 'otro')
      .reduce((s, x) => s + x.monto, 0);
    const totalGeneral = totalMateriaPrima + totalCombustibles + totalOtros;
    return { items: base, totalMateriaPrima, totalCombustibles, totalGeneral };
  }, [delPeriodo, lookups.insumos]);

  const insumosVisibles = useMemo(() => {
    const lista =
      grupoInsumoTab === 'todos'
        ? consumoInsumos.items
        : consumoInsumos.items.filter((x) => x.insumo.grupo === grupoInsumoTab);
    return [...lista].sort((a, b) => b.monto - a.monto || a.insumo.orden - b.insumo.orden);
  }, [consumoInsumos.items, grupoInsumoTab]);

  /* ── Gastos por centro de costos y flota (camiones) ── */
  const gastosCentrosCosto = useMemo(() => {
    const acum = new Map<string, { monto: number; count: number }>();
    let sinCentroMonto = 0;
    let sinCentroCount = 0;
    for (const m of delPeriodo) {
      if (m.tipo !== 'egreso') continue;
      if (m.centro_costo_id) {
        const prev = acum.get(m.centro_costo_id) || { monto: 0, count: 0 };
        prev.monto += Number(m.monto || 0);
        prev.count += 1;
        acum.set(m.centro_costo_id, prev);
      } else {
        sinCentroMonto += Number(m.monto || 0);
        sinCentroCount += 1;
      }
    }
    const items = lookups.centrosCosto
      .filter((cc) => cc.activo || acum.has(cc.id))
      .map((cc) => {
        const stats = acum.get(cc.id) || { monto: 0, count: 0 };
        return { centro: cc, monto: stats.monto, count: stats.count };
      })
      .sort((a, b) => b.monto - a.monto || a.centro.orden - b.centro.orden);
    const totalAsignado = items.reduce((s, x) => s + x.monto, 0);
    return { items, totalAsignado, sinCentroMonto, sinCentroCount };
  }, [delPeriodo, lookups.centrosCosto]);

  const gastosVehiculos = useMemo(() => {
    const acum = new Map<string, { monto: number; count: number }>();
    for (const m of delPeriodo) {
      if (m.tipo === 'egreso' && m.vehiculo_id) {
        const prev = acum.get(m.vehiculo_id) || { monto: 0, count: 0 };
        prev.monto += Number(m.monto || 0);
        prev.count += 1;
        acum.set(m.vehiculo_id, prev);
      }
    }
    const items = lookups.vehiculos
      .filter((v) => v.activo || acum.has(v.id))
      .map((v) => {
        const stats = acum.get(v.id) || { monto: 0, count: 0 };
        return { vehiculo: v, monto: stats.monto, count: stats.count };
      })
      .sort((a, b) => b.monto - a.monto || a.vehiculo.orden - b.vehiculo.orden);
    const total = items.reduce((s, x) => s + x.monto, 0);
    return { items, total };
  }, [delPeriodo, lookups.vehiculos]);

  const abrirMovimientosFiltrados = (filtros: Record<string, string>) => {
    setTipoTab('egreso');
    setActiveFilters(filtros);
    setSearch('');
    setPage(1);
    onVerMovimientos?.();
  };

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
    const centrosMap = new Map<string, string>(
      lookups.centrosCosto.map((c) => [c.id, c.nombre]),
    );
    for (const m of delPeriodo) if (m.centro_costo) centrosMap.set(m.centro_costo.id, m.centro_costo.nombre);
    const insumosMap = new Map<string, string>(
      lookups.insumos.map((i) => [i.id, `${i.nombre} (${i.codigo})`]),
    );
    for (const m of delPeriodo) if (m.insumo) insumosMap.set(m.insumo.id, `${m.insumo.nombre} (${m.insumo.codigo})`);
    const vehiculosMap = new Map<string, string>(
      lookups.vehiculos.map((v) => [v.id, v.patente ? `${v.nombre} (${v.patente})` : v.nombre]),
    );
    for (const m of delPeriodo) if (m.vehiculo) vehiculosMap.set(m.vehiculo.id, m.vehiculo.patente ? `${m.vehiculo.nombre} (${m.vehiculo.patente})` : m.vehiculo.nombre);

    const centros = [...centrosMap.entries()];
    const insumos = [...insumosMap.entries()];
    const vehiculos = [...vehiculosMap.entries()];
    const medios = [...new Set(delPeriodo.map((m) => m.medio_pago).filter(Boolean) as string[])];
    const docs = [...new Set(delPeriodo.map((m) => m.tipo_documento).filter(Boolean) as string[])];
    const clientes = [...new Map(delPeriodo.filter((m) => m.cliente).map((m) => [m.cliente!.id, nombreClienteCorto(m.cliente)])).entries()].filter(([, n]) => !!n);
    const trabajadores = [...new Map(delPeriodo.filter((m) => m.trabajador).map((m) => [m.trabajador!.id, m.trabajador!.nombre])).entries()];

    const defs: FilterDefinition[] = [
      { id: 'empresa', label: 'Empresa', allLabel: 'Todas las empresas', options: empresas.map((e) => ({ value: e, label: e })) },
      { id: 'cuenta', label: 'Cuenta', allLabel: 'Todas las cuentas', options: cuentasOpc.map(([id, alias]) => ({ value: id, label: alias })) },
      { id: 'categoria', label: 'Categoría', allLabel: 'Todas las categorías', options: categorias.map((c) => ({ value: c, label: c })) },
      { id: 'centro_costo', label: 'Centro de costos', allLabel: 'Todos los centros', options: centros.map(([id, label]) => ({ value: id, label })) },
      { id: 'insumo', label: 'Insumo', allLabel: 'Todos los insumos', options: insumos.map(([id, label]) => ({ value: id, label })) },
      { id: 'medio_pago', label: 'Medio de pago', allLabel: 'Todos los medios', options: medios.map((v) => ({ value: v, label: labelMedioPago(v) })) },
      { id: 'tipo_documento', label: 'Documento', allLabel: 'Todos los documentos', options: docs.map((v) => ({ value: v, label: labelTipoDocumento(v) })) },
      { id: 'cliente', label: 'Cliente', allLabel: 'Todos los clientes', options: clientes.map(([id, label]) => ({ value: id, label })) },
      { id: 'trabajador', label: 'Trabajador', allLabel: 'Todos los trabajadores', options: trabajadores.map(([id, label]) => ({ value: id, label })) },
      { id: 'vehiculo', label: 'Camión', allLabel: 'Todos los vehículos', options: vehiculos.map(([id, label]) => ({ value: id, label })) },
    ];
    return defs;
  }, [delPeriodo, lookups.centrosCosto, lookups.insumos, lookups.vehiculos]);

  const filtrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return delPeriodo.filter((m) => {
      const textoBusqueda = [
        m.categoria,
        m.descripcion || '',
        m.cuenta_bancaria?.alias || '',
        m.cuenta_bancaria?.empresa?.razon_social || '',
        m.centro_costo?.nombre || '',
        m.centro_costo?.codigo || '',
        m.insumo?.nombre || '',
        m.insumo?.codigo || '',
        m.vehiculo?.nombre || '',
        m.vehiculo?.patente || '',
        nombreClienteCorto(m.cliente),
        m.oportunidad?.codigo || '',
        m.oportunidad?.titulo || '',
        m.proveedor?.nombre || '',
        m.trabajador?.nombre || '',
        m.medio_pago ? labelMedioPago(m.medio_pago) : '',
        m.tipo_documento ? labelTipoDocumento(m.tipo_documento) : '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        (tipoTab === 'todos' || m.tipo === tipoTab) &&
        matchMultiFilter(activeFilters.empresa, (v) => v === m.cuenta_bancaria?.empresa?.razon_social) &&
        matchMultiFilter(activeFilters.cuenta, (v) => v === m.cuenta_bancaria_id) &&
        matchMultiFilter(activeFilters.categoria, (v) => v === m.categoria) &&
        matchMultiFilter(activeFilters.centro_costo, (v) => v === m.centro_costo_id) &&
        matchMultiFilter(activeFilters.insumo, (v) => v === m.insumo_id) &&
        matchMultiFilter(activeFilters.medio_pago, (v) => v === m.medio_pago) &&
        matchMultiFilter(activeFilters.tipo_documento, (v) => v === m.tipo_documento) &&
        matchMultiFilter(activeFilters.cliente, (v) => v === m.cliente_id) &&
        matchMultiFilter(activeFilters.trabajador, (v) => v === m.trabajador_id) &&
        matchMultiFilter(activeFilters.vehiculo, (v) => v === m.vehiculo_id) &&
        (!term || textoBusqueda.includes(term))
      );
    });
  }, [delPeriodo, tipoTab, activeFilters, search]);

  const exportarCsv = () => {
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const filas = [
      CSV_HEADER.join(';'),
      ...filtrados.map((m) =>
        [
          fechaCsv(m.fecha),
          m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
          esc(m.categoria || ''),
          esc(m.descripcion || ''),
          esc(m.cuenta_bancaria?.alias || ''),
          esc(m.cuenta_bancaria?.empresa?.razon_social || ''),
          String(Number(m.monto || 0)),
          esc(m.medio_pago ? labelMedioPago(m.medio_pago) : ''),
          esc(m.tipo_documento ? labelTipoDocumento(m.tipo_documento) : ''),
          esc(m.centro_costo?.nombre || ''),
          esc(m.insumo?.codigo || ''),
          esc(m.vehiculo?.nombre || ''),
          esc(m.trabajador?.nombre || ''),
          esc(nombreClienteCorto(m.cliente)),
          esc(m.proveedor?.nombre || ''),
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

  const eliminarMovimiento = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('caja_movimientos')
        .delete()
        .eq('id', confirmDelete.id);
      if (error) throw error;

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'caja_movimientos',
        entidad_id: confirmDelete.id,
        descripcion: `Movimiento de caja eliminado (${confirmDelete.tipo} $${Number(confirmDelete.monto).toLocaleString('es-CL')} · ${confirmDelete.categoria})`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: confirmDelete,
      });

      toast({ message: 'Movimiento eliminado y saldo recalculado.', tone: 'success' });
      setConfirmDelete(null);
      await onReload();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo eliminar el movimiento.'), tone: 'danger' });
    } finally {
      setDeleting(false);
    }
  };

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
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const rows: ImportRow[] = datos.map((f, i) => {
      const tipoTxt = get(f, 'Tipo').toLowerCase();
      const tipo = tipoTxt.startsWith('ing') ? 'ingreso' : tipoTxt.startsWith('egr') ? 'egreso' : null;
      const monto = Math.abs(Number(get(f, 'Monto').replace(/[$\s.]/g, '').replace(',', '.')));
      const fecha = parseFecha(get(f, 'Fecha'));
      const cuentaTexto = get(f, 'Cuenta');
      const cuenta = cuentaTexto ? cuentas.find((c) => c.alias.toLowerCase() === cuentaTexto.toLowerCase()) : undefined;

      const medioTxt = get(f, 'Medio de pago');
      const medioMatch = medioTxt
        ? MEDIOS_PAGO.find((m) => norm(m.id) === norm(medioTxt) || norm(m.label) === norm(medioTxt))
        : undefined;

      const docTxt = get(f, 'Documento');
      const docMatch = docTxt
        ? TIPOS_DOCUMENTO_CAJA.find((d) => norm(d.id) === norm(docTxt) || norm(d.label) === norm(docTxt))
        : undefined;

      const ccTxt = get(f, 'Centro de costos');
      const ccMatch = ccTxt
        ? lookups.centrosCosto.find((c) => norm(c.codigo) === norm(ccTxt) || norm(c.nombre) === norm(ccTxt))
        : undefined;

      const insTxt = get(f, 'Código insumo');
      const insMatch = insTxt
        ? lookups.insumos.find((x) => norm(x.codigo) === norm(insTxt) || norm(x.nombre) === norm(insTxt))
        : undefined;

      const vehTxt = get(f, 'Camión');
      const vehMatch = vehTxt
        ? lookups.vehiculos.find((v) => norm(v.nombre) === norm(vehTxt) || (v.patente && norm(v.patente) === norm(vehTxt)))
        : undefined;

      const trabTxt = get(f, 'Trabajador');
      const trabMatch = trabTxt
        ? lookups.trabajadores.find((t) => norm(t.nombre) === norm(trabTxt))
        : undefined;

      const cliTxt = get(f, 'Cliente');
      const cliMatch = cliTxt
        ? lookups.clientes.find((c) => norm(nombreClienteCorto(c)) === norm(cliTxt))
        : undefined;

      const provTxt = get(f, 'Proveedor');
      const provMatch = provTxt
        ? lookups.proveedores.find((p) => norm(p.nombre) === norm(provTxt))
        : undefined;

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
        empresaId: cuenta?.empresa_id || null,
        medioPago: medioMatch?.id || (medioTxt || null),
        tipoDocumento: docMatch?.id || (docTxt || null),
        centroCostoId: ccMatch?.id || null,
        insumoId: insMatch?.id || null,
        vehiculoId: vehMatch?.id || null,
        trabajadorId: trabMatch?.id || null,
        clienteId: cliMatch?.id || null,
        proveedorId: provMatch?.id || null,
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
        empresa_id: r.empresaId,
        medio_pago: r.medioPago,
        tipo_documento: r.tipoDocumento,
        centro_costo_id: r.centroCostoId,
        insumo_id: r.insumoId,
        vehiculo_id: r.vehiculoId,
        trabajador_id: r.trabajadorId,
        cliente_id: r.clienteId,
        proveedor_id: r.proveedorId,
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
    const ejemplo = [
      `${hoy} 10:30`,
      'Egreso',
      'Combustibles',
      'Carga bencina traslado obra',
      cuentas[0]?.alias || '',
      cuentas[0]?.empresa?.razon_social || '',
      '45000',
      'Transferencia',
      'Comprobante',
      'Terreno 2 – Calera de Tango',
      'COMB-BENCINA',
      '',
      '',
      '',
      '',
    ];
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
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle title={margenVista === 'nv' ? 'Margen por nota de venta' : 'Costos y sobrecostos por cliente'} />
                <div role="tablist" aria-label="Vista de rentabilidad" className="inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
                  {([
                    ['nv', 'Por NV'],
                    ['cliente', 'Por Cliente'],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={margenVista === id}
                      onClick={() => setMargenVista(id)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        margenVista === id ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {margenVista === 'nv' ? (
                <div className="text-right">
                  <p className={`t-num text-xl font-bold ${margenTotal >= 0 ? 'text-success' : 'text-danger'}`}>{money(margenTotal)}</p>
                  <p className="text-xs text-ink-muted">{margenPct.toFixed(1)}% de {formatShortMoney(ventaTotal)}</p>
                </div>
              ) : (
                <div className="text-right">
                  <p className="t-num text-xl font-bold text-ink">
                    {costosClientes.filter((c) => c.tiene_sobrecosto).length}
                    <span className="text-xs font-medium text-ink-muted"> con sobrecosto</span>
                  </p>
                  <p className="text-xs text-ink-muted">{costosClientes.length} clientes con actividad</p>
                </div>
              )}
            </div>
            {margenVista === 'nv' ? (
              margenTop.length === 0 ? (
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
              )
            ) : costosClientes.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">Sin costos ni ventas registradas por cliente.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {(() => {
                  const topClientes = [...costosClientes]
                    .sort((a, b) => Number(b.sobrecosto || 0) - Number(a.sobrecosto || 0) || Math.abs(Number(b.margen_real || 0)) - Math.abs(Number(a.margen_real || 0)))
                    .slice(0, 8);
                  const maxCli = Math.max(
                    ...topClientes.map((c) => Math.max(Math.abs(Number(c.margen_real || 0)), Number(c.costo_total || 0))),
                    1,
                  );
                  return topClientes.map((c) => {
                    const margenVal = Number(c.margen_real || 0);
                    const sobreVal = Number(c.sobrecosto || 0);
                    const positivo = margenVal >= 0 && !c.tiene_sobrecosto;
                    return (
                      <li key={c.cliente_id}>
                        <Link
                          href={`/clientes/${c.cliente_id}`}
                          className="group block rounded-lg -mx-1.5 px-1.5 py-1 transition hover:bg-surface-muted/70"
                          title="Abrir ficha del cliente y centro de costos"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="font-semibold text-ink group-hover:text-accent-ink truncate">
                                {c.cliente_nombre}
                              </span>
                              {c.tiene_sobrecosto && (
                                <StatusBadge tone="danger">Sobrecosto {money(sobreVal)}</StatusBadge>
                              )}
                            </span>
                            <span className={`t-num shrink-0 font-semibold ${positivo ? 'text-success' : 'text-danger'}`}>
                              {money(margenVal)}
                              <span className="text-ink-muted font-normal"> · Costo {money(Number(c.costo_total || 0))}</span>
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className={`h-full rounded-full ${positivo ? 'bg-success' : 'bg-danger'}`}
                              style={{ width: `${Math.max(3, (Math.abs(margenVal || Number(c.costo_total || 0)) / maxCli) * 100)}%` }}
                            />
                          </div>
                        </Link>
                      </li>
                    );
                  });
                })()}
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

      {/* Consumo de materias primas y combustibles + Centros de costos y flota */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-[20px] border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle title="Consumo de materias primas y combustibles" />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Package className="h-3.5 w-3.5 text-accent-ink" aria-hidden />
                  Materia prima: <strong className="t-num text-ink">{money(consumoInsumos.totalMateriaPrima)}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 text-ink-muted">
                  <Fuel className="h-3.5 w-3.5 text-warning" aria-hidden />
                  Combustibles: <strong className="t-num text-ink">{money(consumoInsumos.totalCombustibles)}</strong>
                </span>
              </div>
            </div>
            <div role="tablist" aria-label="Filtrar grupo de insumo" className="inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
              {([
                ['todos', 'Todos'],
                ['materia_prima', 'Materia prima'],
                ['combustible', 'Combustibles'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={grupoInsumoTab === id}
                  onClick={() => setGrupoInsumoTab(id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    grupoInsumoTab === id ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {insumosVisibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Sin insumos configurados en este grupo.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {(() => {
                const maxInsumo = Math.max(...insumosVisibles.map((x) => x.monto), 1);
                const totalGrupo = insumosVisibles.reduce((s, x) => s + x.monto, 0);
                return insumosVisibles.map(({ insumo, monto, count }) => {
                  const pct = totalGrupo > 0 ? Math.round((monto / totalGrupo) * 100) : 0;
                  const isComb = insumo.grupo === 'combustible';
                  return (
                    <li key={insumo.id}>
                      <button
                        type="button"
                        onClick={() => abrirMovimientosFiltrados({ insumo: insumo.id })}
                        className="group w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 transition hover:bg-surface-muted/70"
                        title={`Ver movimientos de ${insumo.nombre}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="font-semibold text-ink group-hover:text-accent-ink transition-colors truncate">
                              {insumo.nombre}
                            </span>
                            <CodeStamp>{insumo.codigo}</CodeStamp>
                          </span>
                          <span className="t-num shrink-0 text-ink-muted">
                            <strong className={monto > 0 ? 'text-ink' : 'text-ink-muted font-normal'}>{money(monto)}</strong>
                            {' · '}
                            {count > 0 ? `${pct}% · ${count} mov.` : '0 mov.'}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={`h-full rounded-full transition-all ${
                              monto === 0 ? 'bg-transparent' : isComb ? 'bg-warning' : 'bg-accent'
                            }`}
                            style={{ width: monto > 0 ? `${Math.max(3, (monto / maxInsumo) * 100)}%` : '0%' }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                });
              })()}
            </ul>
          )}
        </section>

        <section className="rounded-[20px] border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle title="Gastos por centro de costos y flota" />
              <p className="mt-1.5 text-xs text-ink-muted">
                Asignado a centros: <strong className="t-num text-ink">{money(gastosCentrosCosto.totalAsignado)}</strong>
                {gastosCentrosCosto.sinCentroMonto > 0 && (
                  <> · Sin asignar: <span className="t-num">{money(gastosCentrosCosto.sinCentroMonto)}</span></>
                )}
              </p>
            </div>
          </div>

          {gastosCentrosCosto.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Sin centros de costos configurados.</p>
          ) : (
            <ul className="mt-5 space-y-3">
              {(() => {
                const maxCC = Math.max(...gastosCentrosCosto.items.map((x) => x.monto), 1);
                const totalCC = gastosCentrosCosto.totalAsignado;
                return gastosCentrosCosto.items.map(({ centro, monto, count }) => {
                  const pct = totalCC > 0 ? Math.round((monto / totalCC) * 100) : 0;
                  return (
                    <li key={centro.id}>
                      <button
                        type="button"
                        onClick={() => abrirMovimientosFiltrados({ centro_costo: centro.id })}
                        className="group w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 transition hover:bg-surface-muted/70"
                        title={`Ver egresos de ${centro.nombre}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="flex min-w-0 items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden />
                            <span className="font-semibold text-ink group-hover:text-accent-ink transition-colors truncate">
                              {centro.nombre}
                            </span>
                            <CodeStamp>{centro.codigo}</CodeStamp>
                          </span>
                          <span className="t-num shrink-0 text-ink-muted">
                            <strong className={monto > 0 ? 'text-ink' : 'text-ink-muted font-normal'}>{money(monto)}</strong>
                            {' · '}
                            {count > 0 ? `${pct}% · ${count} mov.` : '0 mov.'}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={`h-full rounded-full transition-all ${monto > 0 ? 'bg-info' : 'bg-transparent'}`}
                            style={{ width: monto > 0 ? `${Math.max(3, (monto / maxCC) * 100)}%` : '0%' }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                });
              })()}
            </ul>
          )}

          {gastosVehiculos.items.length > 0 && (
            <div className="mt-6 border-t border-line-subtle pt-4">
              <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Truck className="h-3.5 w-3.5 text-info" aria-hidden />
                  Desglose por camión / vehículo
                </span>
                <span className="t-num font-semibold text-ink">{money(gastosVehiculos.total)}</span>
              </div>
              <ul className="space-y-2">
                {(() => {
                  const maxVeh = Math.max(...gastosVehiculos.items.map((x) => x.monto), 1);
                  return gastosVehiculos.items.map(({ vehiculo, monto, count }) => (
                    <li key={vehiculo.id}>
                      <button
                        type="button"
                        onClick={() => abrirMovimientosFiltrados({ vehiculo: vehiculo.id })}
                        className="group w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 transition hover:bg-surface-muted/70"
                        title={`Ver egresos de ${vehiculo.nombre}`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="font-medium text-ink group-hover:text-accent-ink truncate">{vehiculo.nombre}</span>
                            {vehiculo.patente && <CodeStamp>{vehiculo.patente}</CodeStamp>}
                          </span>
                          <span className="t-num shrink-0 text-ink-muted">
                            <strong className={monto > 0 ? 'text-ink' : 'text-ink-muted font-normal'}>{money(monto)}</strong>
                            {' · '}
                            {count} mov.
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className={`h-full rounded-full transition-all ${monto > 0 ? 'bg-warning' : 'bg-transparent'}`}
                            style={{ width: monto > 0 ? `${Math.max(3, (monto / maxVeh) * 100)}%` : '0%' }}
                          />
                        </div>
                      </button>
                    </li>
                  ));
                })()}
              </ul>
            </div>
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
              <table className="w-full min-w-[920px] text-left text-xs">
                <thead>
                  <tr className="bg-surface-muted text-ink-muted">
                    {['Categoría y glosa', 'Centro de costos / Imputación', 'Respaldo', 'Cuenta y empresa', 'Monto', 'Tipo', 'Fecha y hora', 'Acción'].map((h) => (
                      <th key={h} className={`p-3 font-semibold ${h === 'Monto' ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((m) => {
                    const clienteNom = nombreClienteCorto(m.cliente);
                    const tags: string[] = [];
                    if (m.oportunidad?.codigo) tags.push(`NV ${m.oportunidad.codigo}`);
                    if (clienteNom) tags.push(clienteNom);
                    if (m.proveedor?.nombre) tags.push(`Prov: ${m.proveedor.nombre}`);
                    if (m.trabajador?.nombre) tags.push(`Trab: ${m.trabajador.nombre}`);
                    if (m.vehiculo?.nombre) tags.push(m.vehiculo.patente ? `${m.vehiculo.nombre} (${m.vehiculo.patente})` : m.vehiculo.nombre);

                    return (
                    <tr key={m.id} className="border-t border-line-subtle transition hover:bg-surface-muted/50">
                      <td className="p-3 max-w-[220px]">
                        <div className="font-semibold text-ink truncate" title={m.categoria}>{m.categoria}</div>
                        {m.descripcion && m.descripcion !== m.categoria && (
                          <div className="t-micro text-ink-muted truncate mt-0.5" title={m.descripcion}>
                            {m.descripcion}
                          </div>
                        )}
                      </td>
                      <td className="p-3 max-w-[240px]">
                        <div className="flex flex-wrap items-center gap-1">
                          {m.centro_costo && (
                            <span className="inline-flex items-center rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink">
                              {m.centro_costo.nombre}
                            </span>
                          )}
                          {m.insumo && (
                            <CodeStamp title={m.insumo.nombre}>
                              {m.insumo.codigo} · {m.insumo.nombre}
                            </CodeStamp>
                          )}
                          {tags.map((t) => (
                            <span key={t} className="t-micro text-ink-muted truncate max-w-[180px]" title={t}>
                              {t}
                            </span>
                          ))}
                          {!m.centro_costo && !m.insumo && tags.length === 0 && (
                            <span className="text-ink-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {m.medio_pago || m.tipo_documento ? (
                          <div className="space-y-0.5">
                            {m.medio_pago && <div className="font-medium text-ink">{labelMedioPago(m.medio_pago)}</div>}
                            {m.tipo_documento && <div className="t-micro text-ink-muted">{labelTipoDocumento(m.tipo_documento)}</div>}
                          </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {m.cuenta_bancaria?.alias ? (
                          <div>
                            <span className="inline-flex items-center gap-1 font-medium text-ink">
                              <Landmark className="h-3 w-3 text-accent-ink" aria-hidden />
                              {m.cuenta_bancaria.alias}
                            </span>
                            {m.cuenta_bancaria?.empresa?.razon_social && (
                              <div className="t-micro text-ink-muted mt-0.5">
                                {m.cuenta_bancaria.empresa.razon_social}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="italic text-ink-muted">Sin cuenta</span>
                        )}
                      </td>
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
                        <div className="inline-flex items-center gap-1">
                          <IconButton icon={Eye} label="Ver detalle" onClick={() => setDetalle(m)} />
                          {canEdit && onEditMovimiento && (
                            <IconButton icon={Pencil} label="Editar movimiento" onClick={() => onEditMovimiento(m)} />
                          )}
                          {canEdit && (
                            <IconButton
                              icon={Trash2}
                              label="Eliminar movimiento"
                              className="hover:text-danger hover:bg-danger-subtle"
                              onClick={() => setConfirmDelete(m)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
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
        footer={
          <>
            {canEdit && detalle && onEditMovimiento && (
              <Button
                variant="secondary"
                icon={Pencil}
                onClick={() => {
                  const target = detalle;
                  setDetalle(null);
                  onEditMovimiento(target);
                }}
              >
                Editar
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
          </>
        }
      >
        {detalle && (
          <dl className="grid grid-cols-[125px_1fr] gap-x-3 gap-y-2 text-xs">
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
            <dt className="text-ink-muted">Medio de pago</dt>
            <dd className="text-ink">{labelMedioPago(detalle.medio_pago)}</dd>
            <dt className="text-ink-muted">Documento</dt>
            <dd className="text-ink">{labelTipoDocumento(detalle.tipo_documento)}</dd>
            {detalle.centro_costo && (
              <>
                <dt className="text-ink-muted">Centro de costos</dt>
                <dd className="text-ink">{detalle.centro_costo.nombre} ({detalle.centro_costo.codigo})</dd>
              </>
            )}
            {detalle.insumo && (
              <>
                <dt className="text-ink-muted">Código insumo</dt>
                <dd className="text-ink">{detalle.insumo.codigo} · {detalle.insumo.nombre}</dd>
              </>
            )}
            {detalle.vehiculo && (
              <>
                <dt className="text-ink-muted">Camión / Vehículo</dt>
                <dd className="text-ink">{detalle.vehiculo.nombre}{detalle.vehiculo.patente ? ` (${detalle.vehiculo.patente})` : ''}</dd>
              </>
            )}
            {detalle.trabajador && (
              <>
                <dt className="text-ink-muted">Trabajador</dt>
                <dd className="text-ink">{detalle.trabajador.nombre}{detalle.trabajador.cargo ? ` · ${detalle.trabajador.cargo}` : ''}</dd>
              </>
            )}
            {detalle.cliente && (
              <>
                <dt className="text-ink-muted">Cliente</dt>
                <dd className="text-ink">{nombreClienteCorto(detalle.cliente)}</dd>
              </>
            )}
            {detalle.oportunidad && (
              <>
                <dt className="text-ink-muted">Obra / NV</dt>
                <dd className="text-ink">{detalle.oportunidad.codigo} · {detalle.oportunidad.titulo}</dd>
              </>
            )}
            {detalle.proveedor && (
              <>
                <dt className="text-ink-muted">Proveedor</dt>
                <dd className="text-ink">{detalle.proveedor.nombre}</dd>
              </>
            )}
          </dl>
        )}
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        title="Eliminar movimiento de caja"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || (!!confirmDelete && !!abonoMovIds?.has(confirmDelete.id))}
              onClick={() => void eliminarMovimiento()}
            >
              {deleting ? 'Eliminando…' : 'Eliminar movimiento'}
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <div className="space-y-3 text-xs">
            {abonoMovIds?.has(confirmDelete.id) ? (
              <div className="rounded-control border border-warning-line bg-warning-soft p-3 text-warning flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Este movimiento proviene de un <strong>abono validado</strong> y está protegido. Para revertirlo, recházalo desde la pestaña <strong>Validación de pagos</strong>.
                </span>
              </div>
            ) : (
              <p className="text-ink-muted">
                Esta acción eliminará el movimiento del registro y recalculará automáticamente el saldo de la cuenta y empresa asociada.
              </p>
            )}
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface-muted p-3">
              <dt className="text-ink-muted">Tipo</dt>
              <dd className="font-semibold text-ink">{confirmDelete.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}</dd>
              <dt className="text-ink-muted">Monto</dt>
              <dd className={`t-num font-bold ${confirmDelete.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                {confirmDelete.tipo === 'ingreso' ? '+' : '−'}${Number(confirmDelete.monto).toLocaleString('es-CL')}
              </dd>
              <dt className="text-ink-muted">Categoría</dt>
              <dd className="text-ink">{confirmDelete.categoria}</dd>
              <dt className="text-ink-muted">Cuenta</dt>
              <dd className="text-ink">{confirmDelete.cuenta_bancaria?.alias || 'Sin cuenta'}</dd>
              <dt className="text-ink-muted">Empresa</dt>
              <dd className="text-ink">{confirmDelete.cuenta_bancaria?.empresa?.razon_social || '—'}</dd>
              <dt className="text-ink-muted">Fecha</dt>
              <dd className="text-ink">{new Date(confirmDelete.fecha).toLocaleString('es-CL')}</dd>
            </dl>
          </div>
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
