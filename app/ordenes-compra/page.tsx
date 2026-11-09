'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import {
  EstadoOrdenCompra,
  OrdenCompra,
  CuentaBancaria,
  CajaSubcategoria,
} from '../../lib/types';
import { OrdenCompraModal } from '../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../components/OrdenCompraPdfPreviewModal';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../lib/context/AuthContext';
import {
  Boxes,
  CheckCircle2,
  CreditCard,
  Download,
  Edit3,
  Eye,
  PackageCheck,
  PencilLine,
  Plus,
  Search,
  Send,
  Share2,
  Trash2,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';
import {
  ActionMenu,
  ActionMenuItem,
  Button,
  CodeStamp,
  Dialog,
  Panel,
  StatusBadge,
  type Tone,
} from '../../components/ui/crm';
import { MetricCard } from '../../components/ui/MetricCard';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { FloatingActionBar } from '../../components/ui/FloatingActionBar';
import {
  FilterMenu,
  FilterBar,
  useFilterUi,
  FilterDefinition,
  matchMultiFilter,
  matchNumberFilter,
} from '../../components/ui/FilterPills';
import clsx from 'clsx';

import { swrCache } from '../../lib/cache/swr-cache';
import { Select } from '../../components/ui/FormControls';

const ESTADO_LABEL: Record<EstadoOrdenCompra, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  aprobada: 'Aprobada',
  recibida: 'Recibida',
  pagada: 'Pagada en Caja',
  cancelada: 'Cancelada',
};

const getStatusTone = (estado: EstadoOrdenCompra): Tone => {
  if (estado === 'pagada') return 'success';
  if (estado === 'emitida') return 'accent';
  if (estado === 'aprobada') return 'info';
  if (estado === 'recibida') return 'warning';
  if (estado === 'cancelada') return 'danger';
  return 'neutral';
};

export default function OrdenesCompraPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const filterUi = useFilterUi();

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>(() => swrCache.get('ordenes:list') || []);
  const [loading, setLoading] = useState<boolean>(() => !swrCache.has('ordenes:list'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewOrden, setPreviewOrden] = useState<OrdenCompra | null>(null);
  const [editingOrden, setEditingOrden] = useState<OrdenCompra | null>(null);
  const [modalProveedorIdInicial, setModalProveedorIdInicial] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('proveedor_id') || undefined;
  });
  const [modalOportunidadIdInicial, setModalOportunidadIdInicial] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('op_id') || undefined;
  });
  const [showOcModal, setShowOcModal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('nueva') === '1' || params.get('proveedor_id') || params.get('op_id'));
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Pago en Caja State
  const [payingOrden, setPayingOrden] = useState<OrdenCompra | null>(null);
  const [payCuentaId, setPayCuentaId] = useState('');
  const [paySubcatId, setPaySubcatId] = useState('');
  const [payDescripcion, setPayDescripcion] = useState('');
  const [payingLoading, setPayingLoading] = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [subcategorias, setSubcategorias] = useState<CajaSubcategoria[]>([]);

  const loadOrdenes = useCallback(async () => {
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('*, proveedor:proveedores(*), oportunidad:oportunidades(*), items:orden_compra_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading ordenes de compra:', error);
      setLoadError('No se pudieron cargar las órdenes de compra. Reintenta más tarde.');
    } else {
      const ocData = (data || []) as OrdenCompra[];
      setLoadError(null);
      setOrdenes(ocData);
      swrCache.set('ordenes:list', ocData);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let ignore = false;
    let debounceTimer: number | null = null;

    async function initialLoad() {
      if (!ignore) await loadOrdenes();
    }

    initialLoad();

    const triggerDebouncedReload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void loadOrdenes();
      }, 300);
    };

    const channel = supabase
      .channel('realtime_ordenes_compra')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_compra_items' }, triggerDebouncedReload)
      .subscribe();

    return () => {
      ignore = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadOrdenes, supabase]);

  const proveedorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of ordenes) {
      if (o.proveedor_id && !seen.has(o.proveedor_id)) {
        seen.set(o.proveedor_id, o.proveedor?.nombre || 'Proveedor');
      }
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [ordenes]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => [
    {
      id: 'estado',
      label: 'Estado',
      allLabel: 'Todos los estados',
      options: [
        { value: 'borrador', label: 'Borrador' },
        { value: 'emitida', label: 'Emitida' },
        { value: 'aprobada', label: 'Aprobada' },
        { value: 'recibida', label: 'Recibida' },
        { value: 'pagada', label: 'Pagada en Caja' },
        { value: 'cancelada', label: 'Cancelada' },
      ],
    },
    {
      id: 'proveedor',
      label: 'Proveedor',
      allLabel: 'Todos los proveedores',
      options: proveedorOptions,
    },
    {
      id: 'monto',
      label: 'Monto total',
      type: 'number',
      options: [],
    },
  ], [proveedorOptions]);

  const kpis = useMemo(() => {
    const count = (estado: EstadoOrdenCompra) => ordenes.filter((o) => o.estado === estado).length;
    return {
      total: ordenes.length,
      borrador: count('borrador'),
      emitida: count('emitida'),
      aprobada: count('aprobada'),
      recibida: count('recibida'),
      pagada: count('pagada'),
      cancelada: count('cancelada'),
    };
  }, [ordenes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    return ordenes.filter((orden) => {
      const matchSearch =
        !q ||
        orden.numero_oc.toLowerCase().includes(q) ||
        orden.estado.toLowerCase().includes(q) ||
        (orden.proveedor?.nombre || '').toLowerCase().includes(q) ||
        (orden.proveedor?.rut || '').toLowerCase().includes(q);

      const matchEstado = matchMultiFilter(activeFilters.estado, (v) => orden.estado === v);
      const matchProveedor = matchMultiFilter(activeFilters.proveedor, (v) => orden.proveedor_id === v);
      const matchMonto = matchNumberFilter(activeFilters.monto, Number(orden.monto_total || 0));

      return matchSearch && matchEstado && matchProveedor && matchMonto;
    });
  }, [ordenes, search, activeFilters]);

  const totalItems = filtered.length;
  const paginatedOrdenes = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map((o) => o.id));
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) return;
    const firstSelected = ordenes.find((o) => selectedIds.includes(o.id));
    if (firstSelected) setPreviewOrden(firstSelected);
  };

  const toggleKpiFilter = (id: string, value: string) => {
    setCurrentPage(1);
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const handleChangeStatus = async (orden: OrdenCompra, estado: EstadoOrdenCompra) => {
    if (estado === orden.estado) return;
    // "Pagada" solo se alcanza liquidando en Caja (genera el egreso)
    if (estado === 'pagada') {
      void handleOpenPayModal(orden);
      return;
    }
    setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? { ...item, estado } : item)));
    const { error } = await supabase.from('ordenes_compra').update({ estado }).eq('id', orden.id);
    if (error) {
      console.error('Error updating OC status:', error);
      toast({ message: mensajeError(error, 'No se pudo actualizar el estado de la OC.'), tone: 'danger' });
      setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? orden : item)));
    } else {
      toast({ message: `Estado actualizado a ${ESTADO_LABEL[estado].toLowerCase()}.`, tone: 'success' });
    }
  };

  const handleDeleteClick = async (orden: OrdenCompra) => {
    const ok = await confirm({
      title: 'Eliminar Orden de Compra',
      message: `Esta acción eliminará permanentemente la OC ${orden.numero_oc} y sus ítems asociados. ¿Deseas continuar?`,
      confirmLabel: 'Eliminar OC',
      destructive: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('ordenes_compra').delete().eq('id', orden.id);
    if (error) {
      console.error('Error deleting OC:', error);
      toast({ message: mensajeError(error, 'No se pudo eliminar la OC.'), tone: 'danger' });
      return;
    }
    setOrdenes((prev) => prev.filter((item) => item.id !== orden.id));
    setSelectedIds((prev) => prev.filter((id) => id !== orden.id));
    toast({ message: `Orden de compra ${orden.numero_oc} eliminada.`, tone: 'success' });
  };

  // Apertura del modal de pago en caja
  const handleOpenPayModal = async (orden: OrdenCompra) => {
    setPayingOrden(orden);
    setPayDescripcion(`Pago OC ${orden.numero_oc} - ${orden.proveedor?.nombre || 'Proveedor'}`);

    if (cuentasBancarias.length === 0) {
      const { data: cbData } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('activo', true)
        .order('alias');
      if (cbData && cbData.length > 0) {
        setCuentasBancarias(cbData as CuentaBancaria[]);
        setPayCuentaId(cbData[0].id);
      }
    } else {
      setPayCuentaId(cuentasBancarias[0]?.id || '');
    }

    if (subcategorias.length === 0) {
      const { data: subData } = await supabase
        .from('caja_subcategorias')
        .select('*, categoria:caja_categorias(*)')
        .eq('activo', true)
        .order('orden');
      if (subData && subData.length > 0) {
        setSubcategorias(subData as CajaSubcategoria[]);
        const defaultSub =
          (subData as CajaSubcategoria[]).find((s) => s.nombre.toLowerCase().includes('materiales')) || subData[0];
        setPaySubcatId(defaultSub.id);
      }
    } else {
      const defaultSub =
        subcategorias.find((s) => s.nombre.toLowerCase().includes('materiales')) || subcategorias[0];
      setPaySubcatId(defaultSub?.id || '');
    }
  };

  // Confirmación de pago en caja via RPC
  const handleConfirmPayment = async () => {
    if (!payingOrden || !payCuentaId) return;
    try {
      setPayingLoading(true);

      const { error } = await supabase.rpc('pagar_orden_compra_en_caja', {
        p_orden_compra_id: payingOrden.id,
        p_cuenta_bancaria_id: payCuentaId,
        p_subcategoria_id: paySubcatId || null,
        p_descripcion: payDescripcion.trim() || null,
      });

      if (error) throw error;

      toast({
        message: `Orden de compra ${payingOrden.numero_oc} pagada exitosamente. Se generó el egreso en Caja.`,
        tone: 'success',
      });
      setPayingOrden(null);
      await loadOrdenes();
    } catch (err: unknown) {
      console.error('Error pagando orden de compra:', err);
      toast({
        message: mensajeError(err, 'No se pudo registrar el pago de la orden de compra en Caja.'),
        tone: 'danger',
      });
    } finally {
      setPayingLoading(false);
    }
  };

  const openNewOrden = () => {
    setEditingOrden(null);
    setModalProveedorIdInicial(undefined);
    setModalOportunidadIdInicial(undefined);
    setShowOcModal(true);
  };

  const kpiTiles: { key: string; label: string; value: number; icon: LucideIcon; tone: Tone; filter?: [string, string] }[] = [
    { key: 'total', label: 'Órdenes', value: kpis.total, icon: Boxes, tone: 'neutral' },
    { key: 'borrador', label: 'Borrador', value: kpis.borrador, icon: PencilLine, tone: 'neutral', filter: ['estado', 'borrador'] },
    { key: 'emitida', label: 'Emitidas', value: kpis.emitida, icon: Send, tone: 'accent', filter: ['estado', 'emitida'] },
    { key: 'aprobada', label: 'Aprobadas', value: kpis.aprobada, icon: CheckCircle2, tone: 'info', filter: ['estado', 'aprobada'] },
    { key: 'recibida', label: 'Recibidas', value: kpis.recibida, icon: PackageCheck, tone: 'warning', filter: ['estado', 'recibida'] },
    { key: 'pagada', label: 'Pagadas', value: kpis.pagada, icon: Wallet, tone: 'success', filter: ['estado', 'pagada'] },
    { key: 'cancelada', label: 'Canceladas', value: kpis.cancelada, icon: XCircle, tone: 'danger', filter: ['estado', 'cancelada'] },
  ];

  const statusOptions = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'emitida', label: 'Emitida' },
    { value: 'aprobada', label: 'Aprobada' },
    { value: 'recibida', label: 'Recibida' },
    { value: 'pagada', label: 'Pagada en Caja' },
    { value: 'cancelada', label: 'Cancelada' },
  ];

  const canPay = (orden: OrdenCompra) => orden.estado !== 'pagada' && orden.estado !== 'cancelada';
  const isAdmin = currentUser?.rol === 'admin';

  return (
    <div className="space-y-4">
      {/* KPIs por estado (clic para filtrar) */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1">
        {kpiTiles.map((k) => (
          <MetricCard
            key={k.key}
            compact
            className="min-w-[130px] flex-1"
            title={k.label}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            active={k.filter ? activeFilters[k.filter[0]] === k.filter[1] : false}
            onClick={() => {
              if (k.filter) toggleKpiFilter(k.filter[0], k.filter[1]);
              else {
                setActiveFilters({});
                setCurrentPage(1);
              }
            }}
          />
        ))}
      </div>

      {/* Barra de herramientas: búsqueda, filtros y acciones */}
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

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={handleDownloadSelected}>
              <Download className="w-4 h-4 text-accent-ink" />
              <span>Ver PDF ({selectedIds.length})</span>
            </Button>
          )}
          <Button variant="primary" onClick={openNewOrden}>
            <Plus className="w-4 h-4" />
            <span>Nueva orden de compra</span>
          </Button>
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

      {/* Lista de órdenes de compra */}
      <Panel className="overflow-hidden">
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando órdenes de compra…</p>
          ) : loadError ? null : paginatedOrdenes.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron órdenes de compra.</p>
          ) : (
            paginatedOrdenes.map((orden) => (
              <div key={orden.id} className="p-3 space-y-2 hover:bg-surface-muted/60 transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(orden.id)}
                      onChange={() => toggleSelectOne(orden.id)}
                      aria-label={`Seleccionar orden ${orden.numero_oc}`}
                      className="shrink-0 accent-accent"
                    />
                    <CodeStamp>{orden.numero_oc}</CodeStamp>
                    <span className="text-xs text-ink-muted font-medium">v{orden.version || 1}</span>
                  </div>
                  <span className="t-num font-semibold text-sm text-ink">${Number(orden.monto_total || 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-muted truncate">{orden.proveedor?.nombre || 'Proveedor'}</span>
                  <StatusBadge tone={getStatusTone(orden.estado)}>{ESTADO_LABEL[orden.estado]}</StatusBadge>
                </div>
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-line-subtle">
                  <Button variant="subtle" size="sm" onClick={() => setPreviewOrden(orden)}>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver</span>
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => setEditingOrden(orden)}>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                  {canPay(orden) && (
                    <Button variant="subtle" size="sm" onClick={() => void handleOpenPayModal(orden)}>
                      <CreditCard className="w-3.5 h-3.5 text-success" />
                      <span>Pagar</span>
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="subtle" size="sm" onClick={() => void handleDeleteClick(orden)} aria-label="Eliminar orden de compra">
                      <Trash2 className="w-3.5 h-3.5 text-danger" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[1100px] text-[13px]">
            <thead>
              <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todas las órdenes de compra"
                    className="rounded cursor-pointer accent-accent"
                  />
                </th>
                <th className="py-3 px-3 min-w-[150px] font-medium">N° OC</th>
                <th className="py-3 px-3 w-20 font-medium">Versión</th>
                <th className="py-3 px-3 min-w-[100px] font-medium">Fecha</th>
                <th className="py-3 px-3 min-w-[200px] font-medium">Proveedor</th>
                <th className="py-3 px-3 min-w-[120px] font-medium">RUT</th>
                <th className="py-3 px-3 min-w-[160px] font-medium">Oportunidad de venta</th>
                <th className="py-3 px-3 min-w-[150px] font-medium">Estado</th>
                <th className="py-3 px-3 min-w-[120px] text-right font-medium">Monto total</th>
                <th className="py-3 px-3 w-12"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-[13px] text-ink">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-oc-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3 text-center">
                      <div className="w-4 h-4 rounded bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                    <td className="py-3 px-3"><div className="h-4 w-28 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-8 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-surface-muted hg-skeleton shrink-0" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3.5 w-32 rounded bg-surface-muted hg-skeleton" />
                          <div className="h-2.5 w-20 rounded bg-surface-muted hg-skeleton" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-24 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-16 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton ml-auto" /></td>
                    <td className="py-3 px-3"><div className="h-6 w-6 rounded-control bg-surface-muted hg-skeleton mx-auto" /></td>
                  </tr>
                ))
              ) : loadError ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron órdenes de compra.
                  </td>
                </tr>
              ) : (
                paginatedOrdenes.map((orden) => {
                  const isSelected = selectedIds.includes(orden.id);

                  return (
                    <tr
                      key={orden.id}
                      className={clsx(
                        'hover:bg-surface-muted/60 transition group border-b border-line-subtle',
                        isSelected ? 'bg-surface-muted/90' : ''
                      )}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(orden.id)}
                          aria-label={`Seleccionar orden ${orden.numero_oc}`}
                          className="rounded cursor-pointer accent-accent"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <span className="t-num font-semibold text-ink">{orden.numero_oc}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="t-num text-ink">v{orden.version || 1}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="t-num text-ink">
                          {orden.fecha_emision
                            ? new Date(`${orden.fecha_emision}T00:00:00`).toLocaleDateString('es-CL')
                            : '—'}
                        </span>
                      </td>

                      {/* Proveedor */}
                      <td className="py-3 px-3 font-semibold">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge name={orden.proveedor?.nombre || 'Proveedor'} size="md" className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-[13px] font-semibold leading-tight text-ink truncate block">
                              {orden.proveedor?.nombre || 'Proveedor'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* RUT */}
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{orden.proveedor?.rut || '—'}</span>
                      </td>

                      {/* Oportunidad vinculada */}
                      <td className="py-3 px-3 max-w-[220px]">
                        {orden.oportunidad?.id ? (
                          <Link
                            href={`/ventas?oportunidad=${orden.oportunidad.id}`}
                            className="inline-flex max-w-full items-center gap-2 text-ink hover:text-accent-ink transition"
                          >
                            <CodeStamp>{orden.oportunidad.codigo}</CodeStamp>
                            <span className="truncate text-xs text-ink-muted">{orden.oportunidad.estado_pipeline}</span>
                          </Link>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-3">
                        {orden.estado === 'pagada' ? (
                          <StatusBadge tone="success">Pagada en Caja</StatusBadge>
                        ) : (
                          <SearchSelect
                            variant="plain"
                            value={orden.estado}
                            ariaLabel={`Estado de ${orden.numero_oc}`}
                            options={statusOptions}
                            menuMinWidth={180}
                            onChange={(v) => void handleChangeStatus(orden, v as EstadoOrdenCompra)}
                            renderValue={(opt) => (
                              <StatusBadge tone={getStatusTone(opt.value as EstadoOrdenCompra)}>{opt.label}</StatusBadge>
                            )}
                          />
                        )}
                      </td>

                      <td className="py-3 px-3 text-right t-num text-ink">
                        ${Number(orden.monto_total || 0).toLocaleString('es-CL')}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <ActionMenu label={`Acciones para ${orden.numero_oc}`}>
                          <ActionMenuItem icon={Eye} onClick={() => setPreviewOrden(orden)}>
                            Previsualizar
                          </ActionMenuItem>
                          <ActionMenuItem icon={Edit3} onClick={() => setEditingOrden(orden)}>
                            Editar
                          </ActionMenuItem>
                          <ActionMenuItem
                            icon={Share2}
                            onClick={() => router.push(`/asignaciones?oc=${orden.id}`)}
                          >
                            Asignar a ventas
                          </ActionMenuItem>
                          {canPay(orden) && (
                            <ActionMenuItem icon={CreditCard} onClick={() => void handleOpenPayModal(orden)}>
                              Pagar en Caja
                            </ActionMenuItem>
                          )}
                          {isAdmin && (
                            <ActionMenuItem icon={Trash2} destructive onClick={() => void handleDeleteClick(orden)}>
                              Eliminar
                            </ActionMenuItem>
                          )}
                        </ActionMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </Panel>

      <OrdenCompraPdfPreviewModal orden={previewOrden} onClose={() => setPreviewOrden(null)} />
      <OrdenCompraModal
        isOpen={showOcModal || !!editingOrden}
        initialOrden={editingOrden}
        proveedorIdInicial={modalProveedorIdInicial}
        oportunidadIdInicial={modalOportunidadIdInicial}
        onClose={() => {
          setShowOcModal(false);
          setEditingOrden(null);
          setModalProveedorIdInicial(undefined);
          setModalOportunidadIdInicial(undefined);
        }}
        onSuccess={loadOrdenes}
      />

      {/* Modal Pagar OC en Caja */}
      <Dialog
        open={Boolean(payingOrden)}
        onClose={() => setPayingOrden(null)}
        title="Pagar Orden de Compra en Caja"
        description="Registra la liquidación de la orden con cargo directo a la cuenta seleccionada."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingOrden(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={payingLoading}
              onClick={handleConfirmPayment}
            >
              {payingLoading ? 'Registrando Egreso...' : 'Confirmar Pago en Caja'}
            </Button>
          </>
        }
      >
        {payingOrden && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleConfirmPayment();
            }}
            className="space-y-4 text-xs"
          >
            {/* Resumen de la OC */}
            <div className="bg-surface-muted border border-line rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted font-medium">Orden de Compra:</span>
                <CodeStamp>{payingOrden.numero_oc}</CodeStamp>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted font-medium">Proveedor:</span>
                <span className="text-xs font-semibold text-ink">
                  {payingOrden.proveedor?.nombre || 'Proveedor'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line-subtle pt-2">
                <span className="text-xs font-semibold text-ink">Monto a Liquidar:</span>
                <span className="text-base font-bold text-ink t-num">
                  ${Number(payingOrden.monto_total || 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">
                Cuenta Bancaria de Salida *
              </label>
              <Select
                value={payCuentaId}
                onChange={(e) => setPayCuentaId(e.target.value)}
                className="hg-field"
                required
              >
                {cuentasBancarias.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.alias} ({cb.banco})
                  </option>
                ))}
              </Select>
              <span className="text-[11px] text-ink-muted mt-1 block">
                El egreso se registrará directamente con cargo a esta cuenta.
              </span>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">
                Subcategoría de Costo *
              </label>
              <Select
                value={paySubcatId}
                onChange={(e) => setPaySubcatId(e.target.value)}
                className="hg-field"
                required
              >
                {subcategorias.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.nombre}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">
                Descripción / Glosa en Caja
              </label>
              <input
                type="text"
                value={payDescripcion}
                onChange={(e) => setPayDescripcion(e.target.value)}
                className="hg-field"
              />
            </div>
          </form>
        )}
      </Dialog>

      {/* Barra de Acciones Masivas Flotante */}
      <FloatingActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        itemLabel="órdenes"
      >
        <Button variant="secondary" size="sm" onClick={handleDownloadSelected}>
          <Download className="w-3.5 h-3.5 text-accent-ink" />
          <span>Ver PDF ({selectedIds.length})</span>
        </Button>
      </FloatingActionBar>
    </div>
  );
}
