'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { OrdenCompra, OrdenCompraAsignacion, OportunidadVenta } from '../../lib/types';
import { mensajeError } from '../../lib/errores';
import { Pagination } from '../../components/Pagination';
import { Button, CodeStamp, Dialog, Panel, StatusBadge, type Tone } from '../../components/ui/crm';
import { MetricCard } from '../../components/ui/MetricCard';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { esOportunidadPerdida } from '../../lib/oportunidad-perdida';
import {
  FilterMenu,
  FilterBar,
  useFilterUi,
  FilterDefinition,
  matchMultiFilter,
} from '../../components/ui/FilterPills';
import {
  Boxes,
  CheckCircle2,
  CircleDashed,
  Coins,
  Share2,
  Search,
  Split,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

type AsigEstado = 'sin_asignar' | 'parcial' | 'completa';

const ASIG_LABEL: Record<AsigEstado, string> = {
  sin_asignar: 'Sin asignar',
  parcial: 'Parcial',
  completa: 'Completa',
};

const ASIG_TONE: Record<AsigEstado, Tone> = {
  sin_asignar: 'warning',
  parcial: 'info',
  completa: 'success',
};

const EPS = 0.0001;
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const qtyFmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type ItemResumen = {
  id: string;
  descripcion: string;
  cantidad: number;
  total: number;
  asignadoQty: number;
  asignadoCosto: number;
  pendienteQty: number;
  pendienteCosto: number;
};

type OcResumen = {
  orden: OrdenCompra;
  items: ItemResumen[];
  comprado: number;
  asignado: number;
  pendiente: number;
  estado: AsigEstado;
  pct: number;
};

export default function AsignacionesPage() {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const filterUi = useFilterUi();

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [asignaciones, setAsignaciones] = useState<OrdenCompraAsignacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Popup de asignación
  const [openOcId, setOpenOcId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('oc');
  });
  const [itemId, setItemId] = useState('');
  const [opId, setOpId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState<string | null>(null); // null = calculado automáticamente
  const [unidad, setUnidad] = useState('');
  const [notas, setNotas] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [ocRes, asRes, opRes] = await Promise.all([
      supabase
        .from('ordenes_compra')
        .select('*, proveedor:proveedores(*), items:orden_compra_items(*)')
        .neq('estado', 'cancelada')
        .order('created_at', { ascending: false }),
      supabase.from('orden_compra_asignaciones').select('*'),
      supabase.from('oportunidades').select('id, codigo, titulo, perdida_at').order('created_at', { ascending: false }),
    ]);
    if (ocRes.error || asRes.error || opRes.error) {
      console.error('Error loading asignaciones:', ocRes.error || asRes.error || opRes.error);
      setLoadError('No se pudieron cargar las órdenes y asignaciones. Reintenta más tarde.');
    } else {
      setLoadError(null);
      setOrdenes((ocRes.data || []) as OrdenCompra[]);
      setAsignaciones((asRes.data || []) as OrdenCompraAsignacion[]);
      setOportunidades((opRes.data || []) as OportunidadVenta[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let debounceTimer: number | null = null;
    const initial = window.setTimeout(() => { void load(); }, 0);
    const reload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => { void load(); }, 300);
    };
    const channel = supabase
      .channel('realtime_asignaciones_oc')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_compra_asignaciones' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra' }, reload)
      .subscribe();
    return () => {
      window.clearTimeout(initial);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  const resumenes: OcResumen[] = useMemo(() => {
    return ordenes.map((orden) => {
      const mine = asignaciones.filter((a) => a.orden_compra_id === orden.id);
      const items: ItemResumen[] = (orden.items || []).map((item) => {
        const own = mine.filter((a) => a.orden_compra_item_id === item.id);
        const asignadoQty = own.reduce((s, a) => s + Number(a.cantidad), 0);
        const asignadoCosto = own.reduce((s, a) => s + Number(a.costo_asignado), 0);
        const cantidadItem = Number(item.cantidad || 0);
        const total = Number(item.total_item || 0);
        return {
          id: item.id || '',
          descripcion: item.descripcion,
          cantidad: cantidadItem,
          total,
          asignadoQty,
          asignadoCosto,
          pendienteQty: Math.max(cantidadItem - asignadoQty, 0),
          pendienteCosto: Math.max(total - asignadoCosto, 0),
        };
      });
      const comprado = items.reduce((s, i) => s + i.total, 0);
      const asignado = items.reduce((s, i) => s + i.asignadoCosto, 0);
      const algoAsignado = mine.length > 0;
      const todoCubierto = items.length > 0 && items.every((i) => i.pendienteQty <= EPS);
      const estado: AsigEstado = !algoAsignado ? 'sin_asignar' : todoCubierto ? 'completa' : 'parcial';
      return {
        orden,
        items,
        comprado,
        asignado,
        pendiente: Math.max(comprado - asignado, 0),
        estado,
        pct: comprado > 0 ? Math.min(Math.round((asignado / comprado) * 100), 100) : 0,
      };
    });
  }, [ordenes, asignaciones]);

  const proveedorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of ordenes) {
      if (o.proveedor_id && !seen.has(o.proveedor_id)) seen.set(o.proveedor_id, o.proveedor?.nombre || 'Proveedor');
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [ordenes]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => [
    {
      id: 'estado',
      label: 'Asignación',
      allLabel: 'Todas',
      options: [
        { value: 'sin_asignar', label: 'Sin asignar' },
        { value: 'parcial', label: 'Parcial' },
        { value: 'completa', label: 'Completa' },
      ],
    },
    { id: 'proveedor', label: 'Proveedor', allLabel: 'Todos los proveedores', options: proveedorOptions },
    {
      id: 'tipo',
      label: 'Tipo de compra',
      allLabel: 'Todos',
      options: [
        { value: 'reventa', label: 'Reventa' },
        { value: 'insumos_fabricacion', label: 'Insumos de fabricación' },
      ],
    },
  ], [proveedorOptions]);

  const kpis = useMemo(() => {
    const comprado = resumenes.reduce((s, r) => s + r.comprado, 0);
    const asignado = resumenes.reduce((s, r) => s + r.asignado, 0);
    const count = (e: AsigEstado) => resumenes.filter((r) => r.estado === e).length;
    return {
      comprado,
      asignado,
      pendiente: Math.max(comprado - asignado, 0),
      sin: count('sin_asignar'),
      parcial: count('parcial'),
      completa: count('completa'),
    };
  }, [resumenes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return resumenes.filter((r) => {
      const o = r.orden;
      const matchSearch =
        !q ||
        o.numero_oc.toLowerCase().includes(q) ||
        (o.proveedor?.nombre || '').toLowerCase().includes(q) ||
        (o.proveedor?.rut || '').toLowerCase().includes(q);
      return (
        matchSearch &&
        matchMultiFilter(activeFilters.estado, (v) => r.estado === v) &&
        matchMultiFilter(activeFilters.proveedor, (v) => o.proveedor_id === v) &&
        matchMultiFilter(activeFilters.tipo, (v) => (o.tipo_compra || 'reventa') === v)
      );
    });
  }, [resumenes, search, activeFilters]);

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleKpiFilter = (id: string, value: string) => {
    setCurrentPage(1);
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const kpiTiles: { key: string; label: string; value: string | number; icon: LucideIcon; tone: Tone; filter?: [string, string] }[] = [
    { key: 'comprado', label: 'Comprado', value: clp(kpis.comprado), icon: Wallet, tone: 'neutral' },
    { key: 'asignado', label: 'Asignado', value: clp(kpis.asignado), icon: Share2, tone: 'success' },
    { key: 'pendiente', label: 'Por asignar', value: clp(kpis.pendiente), icon: Coins, tone: 'warning' },
    { key: 'sin', label: 'Sin asignar', value: kpis.sin, icon: CircleDashed, tone: 'warning', filter: ['estado', 'sin_asignar'] },
    { key: 'parcial', label: 'Parciales', value: kpis.parcial, icon: Split, tone: 'info', filter: ['estado', 'parcial'] },
    { key: 'completa', label: 'Completas', value: kpis.completa, icon: CheckCircle2, tone: 'success', filter: ['estado', 'completa'] },
  ];

  // ----- Popup -----
  const openResumen = resumenes.find((r) => r.orden.id === openOcId) || null;
  const firstPending = openResumen?.items.find((i) => i.pendienteQty > EPS);
  const effectiveItemId = itemId || firstPending?.id || '';
  const selectedItem = openResumen?.items.find((i) => i.id === effectiveItemId);
  const remainingQty = selectedItem?.pendienteQty || 0;
  const remainingCost = selectedItem?.pendienteCosto || 0;

  const qtyNum = Number(cantidad);
  const autoCost = (() => {
    if (!selectedItem || !Number.isFinite(qtyNum) || qtyNum <= 0) return '';
    if (qtyNum >= remainingQty - EPS) return String(Math.round(remainingCost));
    const unit = selectedItem.cantidad > 0 ? selectedItem.total / selectedItem.cantidad : 0;
    return String(Math.min(Math.round(qtyNum * unit), Math.round(remainingCost)));
  })();
  const costoEfectivo = costo ?? autoCost;

  const resetForm = () => {
    setItemId('');
    setOpId('');
    setCantidad('');
    setCosto(null);
    setUnidad('');
    setNotas('');
    setFormError('');
  };

  const openDialog = (id: string) => {
    resetForm();
    setOpenOcId(id);
  };

  const closeDialog = () => {
    resetForm();
    setOpenOcId(null);
  };

  const saveAsignacion = async () => {
    if (!openResumen) return;
    const qty = Number(cantidad);
    const amount = Number(costoEfectivo);
    if (!effectiveItemId || !opId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(amount) || amount < 0) {
      setFormError('Selecciona ítem y venta, e ingresa cantidad y costo válidos.');
      return;
    }
    if (qty > remainingQty + EPS || amount > remainingCost + 0.5) {
      setFormError('La asignación supera la cantidad o el costo disponible del ítem.');
      return;
    }
    setSaving(true);
    setFormError('');
    const { error } = await supabase.from('orden_compra_asignaciones').insert({
      orden_compra_id: openResumen.orden.id,
      orden_compra_item_id: effectiveItemId,
      oportunidad_id: opId,
      cantidad: qty,
      costo_asignado: amount,
      unidad: unidad.trim() || null,
      notas: notas.trim() || null,
    });
    setSaving(false);
    if (error) {
      setFormError(mensajeError(error));
      return;
    }
    toast({ message: 'Asignación guardada correctamente.', tone: 'success' });
    setCantidad('');
    setCosto(null);
    setUnidad('');
    setNotas('');
    await load();
  };

  const removeAsignacion = async (asignacionId: string) => {
    const ok = await confirm({
      title: 'Quitar asignación',
      message: '¿Deseas quitar esta asignación de la venta asociada?',
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('orden_compra_asignaciones').delete().eq('id', asignacionId);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: 'Asignación quitada.', tone: 'success' });
      await load();
    }
  };

  const changeTipoCompra = async (tipo: 'reventa' | 'insumos_fabricacion') => {
    if (!openResumen) return;
    const id = openResumen.orden.id;
    const previous = openResumen.orden.tipo_compra;
    setOrdenes((prev) => prev.map((o) => (o.id === id ? { ...o, tipo_compra: tipo } : o)));
    const { error } = await supabase.from('ordenes_compra').update({ tipo_compra: tipo }).eq('id', id);
    if (error) {
      setOrdenes((prev) => prev.map((o) => (o.id === id ? { ...o, tipo_compra: previous } : o)));
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: 'Tipo de compra actualizado.', tone: 'success' });
    }
  };

  const openAsignaciones = openResumen
    ? asignaciones.filter((a) => a.orden_compra_id === openResumen.orden.id)
    : [];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1">
        {kpiTiles.map((k) => (
          <MetricCard
            key={k.key}
            compact
            className="min-w-[140px] flex-1"
            title={k.label}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            active={k.filter ? activeFilters[k.filter[0]] === k.filter[1] : false}
            onClick={k.filter ? () => toggleKpiFilter(k.filter![0], k.filter![1]) : undefined}
          />
        ))}
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              aria-label="Buscar órdenes de compra"
              placeholder="Buscar por N° OC, proveedor o RUT..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-9 w-full rounded-lg border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink shadow-[var(--hg-shadow-card)] placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
          <FilterMenu
            triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
            filters={filterDefinitions}
            activeFilters={activeFilters}
            ui={filterUi}
          />
        </div>
      </div>

      <FilterBar
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => {
          setCurrentPage(1);
          setActiveFilters((prev) => ({ ...prev, [id]: val }));
        }}
        onClearAll={() => {
          setActiveFilters({});
          setSearch('');
        }}
        ui={filterUi}
      />

      {loadError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {loadError}
        </div>
      )}

      <Panel className="overflow-hidden">
        {/* Móvil */}
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando órdenes…</p>
          ) : loadError ? null : paginated.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron órdenes de compra.</p>
          ) : (
            paginated.map((r) => (
              <div key={r.orden.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <CodeStamp>{r.orden.numero_oc}</CodeStamp>
                  <StatusBadge tone={ASIG_TONE[r.estado]}>{ASIG_LABEL[r.estado]}</StatusBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span className="truncate">{r.orden.proveedor?.nombre || 'Proveedor'}</span>
                  <span className="t-num text-ink">{clp(r.asignado)} / {clp(r.comprado)}</span>
                </div>
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => openDialog(r.orden.id)}>
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Asignar</span>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Escritorio */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[1100px] text-[13px]">
            <thead>
              <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                <th className="py-3 px-3 min-w-[150px] font-medium">N° OC</th>
                <th className="py-3 px-3 min-w-[220px] font-medium">Proveedor</th>
                <th className="py-3 px-3 min-w-[100px] font-medium">Fecha</th>
                <th className="py-3 px-3 min-w-[110px] text-right font-medium">Comprado</th>
                <th className="py-3 px-3 min-w-[110px] text-right font-medium">Asignado</th>
                <th className="py-3 px-3 min-w-[110px] text-right font-medium">Por asignar</th>
                <th className="py-3 px-3 min-w-[130px] font-medium">Estado</th>
                <th className="py-3 px-3 min-w-[150px] font-medium">Avance</th>
                <th className="py-3 px-3 w-28"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-ink">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-asig-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3"><div className="h-4 w-28 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-surface-muted hg-skeleton shrink-0" />
                        <div className="h-3.5 w-32 rounded bg-surface-muted hg-skeleton" />
                      </div>
                    </td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton ml-auto" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton ml-auto" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton ml-auto" /></td>
                    <td className="py-3 px-3"><div className="h-5 w-20 rounded-full bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-28 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-7 w-20 rounded-control bg-surface-muted hg-skeleton ml-auto" /></td>
                  </tr>
                ))
              ) : loadError ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron órdenes de compra.
                  </td>
                </tr>
              ) : (
                paginated.map((r) => (
                  <tr key={r.orden.id} className="hover:bg-surface-muted/60 transition border-b border-line-subtle">
                    <td className="py-3 px-3">
                      <span className="t-num font-semibold text-ink">{r.orden.numero_oc}</span>
                    </td>
                    <td className="py-3 px-3 font-semibold">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AvatarBadge name={r.orden.proveedor?.nombre || 'Proveedor'} size="md" className="shrink-0" />
                        <span className="text-[13px] font-semibold leading-tight text-ink truncate block">
                          {r.orden.proveedor?.nombre || 'Proveedor'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="t-num text-ink">
                        {r.orden.fecha_emision
                          ? new Date(`${r.orden.fecha_emision}T00:00:00`).toLocaleDateString('es-CL')
                          : '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right t-num text-ink">{clp(r.comprado)}</td>
                    <td className="py-3 px-3 text-right t-num text-ink">{clp(r.asignado)}</td>
                    <td className="py-3 px-3 text-right t-num text-ink">{clp(r.pendiente)}</td>
                    <td className="py-3 px-3">
                      <StatusBadge tone={ASIG_TONE[r.estado]}>{ASIG_LABEL[r.estado]}</StatusBadge>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2" title={`${r.pct}% del monto comprado ya está asignado a ventas`}>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
                        </div>
                        <span className="t-num text-xs text-ink-muted">{r.pct}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => openDialog(r.orden.id)}>
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Asignar</span>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filtered.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </Panel>

      {/* Popup de asignación */}
      <Dialog
        open={Boolean(openOcId) && !loading}
        onClose={closeDialog}
        size="lg"
        title={
          openResumen ? (
            <span className="inline-flex items-center gap-2">
              Asignar <CodeStamp>{openResumen.orden.numero_oc}</CodeStamp>
              <span className="text-sm font-normal text-ink-muted">{openResumen.orden.proveedor?.nombre}</span>
            </span>
          ) : 'Orden no encontrada'
        }
        footer={<Button variant="secondary" onClick={closeDialog}>Cerrar</Button>}
      >
        {!openResumen ? (
          <p className="text-sm text-ink-muted">La orden no existe o está cancelada.</p>
        ) : (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-surface-muted p-3">
                <p className="t-caption text-ink-muted">Comprado</p>
                <p className="t-num text-sm font-semibold text-ink">{clp(openResumen.comprado)}</p>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <p className="t-caption text-ink-muted">Asignado</p>
                <p className="t-num text-sm font-semibold text-ink">{clp(openResumen.asignado)}</p>
              </div>
              <div className="rounded-lg bg-surface-muted p-3">
                <p className="t-caption text-ink-muted">Por asignar</p>
                <p className="t-num text-sm font-semibold text-ink">{clp(openResumen.pendiente)}</p>
              </div>
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Tipo de compra</label>
                <SearchSelect
                  value={openResumen.orden.tipo_compra || 'reventa'}
                  onChange={(v) => v && void changeTipoCompra(v as 'reventa' | 'insumos_fabricacion')}
                  options={[
                    { value: 'reventa', label: 'Compra para reventa' },
                    { value: 'insumos_fabricacion', label: 'Insumos de fabricación' },
                  ]}
                  ariaLabel="Tipo de compra"
                  menuMinWidth={220}
                />
              </div>
            </div>

            {/* Resumen por ítem */}
            <section className="space-y-2">
              <span className="font-semibold text-ink">Ítems de la orden</span>
              <div className="overflow-x-auto rounded-lg border border-line-subtle">
                <table className="w-full min-w-[520px] text-left text-[13px]">
                  <thead>
                    <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                      <th className="py-2 px-3 font-medium">Ítem</th>
                      <th className="py-2 px-3 text-right font-medium">Comprado</th>
                      <th className="py-2 px-3 text-right font-medium">Asignado</th>
                      <th className="py-2 px-3 text-right font-medium">Por asignar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {openResumen.items.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2 px-3 text-ink">{i.descripcion}</td>
                        <td className="py-2 px-3 text-right t-num">{qtyFmt(i.cantidad)}</td>
                        <td className="py-2 px-3 text-right t-num">{qtyFmt(i.asignadoQty)}</td>
                        <td className="py-2 px-3 text-right t-num">
                          {i.pendienteQty <= EPS ? (
                            <StatusBadge tone="success">Completo</StatusBadge>
                          ) : (
                            <span className="font-semibold text-ink">{qtyFmt(i.pendienteQty)} · {clp(i.pendienteCosto)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Nueva asignación */}
            <section className="space-y-3">
              <div className="border-b border-line-subtle pb-2">
                <span className="font-semibold text-ink">Nueva asignación</span>
              </div>
              {formError && (
                <p role="alert" className="rounded-md border border-danger-line bg-danger-soft p-2.5 font-semibold text-danger">
                  {formError}
                </p>
              )}
              {!firstPending && !selectedItem ? (
                <p className="rounded-md bg-success-soft p-3 font-medium text-success">
                  Todos los ítems de esta orden ya están asignados.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">Ítem de la OC *</label>
                    <SearchSelect
                      value={effectiveItemId}
                      onChange={(v) => {
                        setItemId(v);
                        setCantidad('');
                        setCosto(null);
                      }}
                      options={openResumen.items.map((i) => ({
                        value: i.id,
                        label: i.descripcion,
                        hint: `Disp. ${qtyFmt(i.pendienteQty)}`,
                      }))}
                      placeholder="Seleccionar ítem"
                      ariaLabel="Ítem de la OC"
                      menuMinWidth={320}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">Venta destino (NV) *</label>
                    <SearchSelect
                      value={opId}
                      onChange={setOpId}
                      options={oportunidades
                        .filter((op) => !esOportunidadPerdida(op))
                        .map((op) => ({ value: op.id, label: op.codigo, hint: op.titulo }))}
                      placeholder="Seleccionar venta"
                      searchPlaceholder="Buscar venta..."
                      searchable
                      ariaLabel="Venta destino"
                      menuMinWidth={320}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">
                      Cantidad * <span className="font-normal text-ink-muted">(disponible {qtyFmt(remainingQty)})</span>
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={cantidad}
                      onChange={(e) => {
                        setCantidad(e.target.value);
                        setCosto(null);
                      }}
                      aria-label="Cantidad asignada"
                      className="hg-field-compact w-full text-right t-num"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">
                      Costo ($) * <span className="font-normal text-ink-muted">(se calcula solo; puedes editarlo)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={costoEfectivo}
                      onChange={(e) => setCosto(e.target.value)}
                      aria-label="Costo asignado"
                      className="hg-field-compact w-full text-right t-num"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">Unidad</label>
                    <input
                      type="text"
                      value={unidad}
                      onChange={(e) => setUnidad(e.target.value)}
                      placeholder="m², unidad, pallet"
                      aria-label="Unidad"
                      className="hg-field-compact w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block t-caption font-semibold text-ink">Notas</label>
                    <input
                      type="text"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Detalle o instrucción"
                      aria-label="Notas"
                      className="hg-field-compact w-full"
                    />
                  </div>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button variant="primary" disabled={saving} onClick={() => void saveAsignacion()}>
                      <Share2 className="w-4 h-4" />
                      <span>{saving ? 'Guardando...' : 'Asignar'}</span>
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* Distribución actual */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-line-subtle pb-2">
                <Boxes className="w-4 h-4 text-accent-ink" />
                <span className="font-semibold text-ink">Distribución actual</span>
              </div>
              {openAsignaciones.length === 0 ? (
                <p className="text-ink-muted">Sin asignaciones registradas.</p>
              ) : (
                <div className="divide-y divide-line-subtle">
                  {openAsignaciones.map((a) => {
                    const op = oportunidades.find((o) => o.id === a.oportunidad_id);
                    const it = openResumen.items.find((i) => i.id === a.orden_compra_item_id);
                    return (
                      <div key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <CodeStamp>{op?.codigo || '—'}</CodeStamp>
                            {op && <span className="truncate font-semibold text-ink">{op.titulo}</span>}
                          </div>
                          <p className="text-ink-muted">{it?.descripcion || 'Ítem'}</p>
                          <p className="t-num font-semibold text-ink">
                            {qtyFmt(Number(a.cantidad))} {a.unidad || 'unidades'} · {clp(Number(a.costo_asignado))}
                          </p>
                          {a.notas && <p className="italic text-ink-muted">{a.notas}</p>}
                        </div>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() => void removeAsignacion(a.id)}
                          className="shrink-0 text-danger hover:bg-danger-soft"
                          aria-label="Quitar asignación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Quitar</span>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </Dialog>
    </div>
  );
}
