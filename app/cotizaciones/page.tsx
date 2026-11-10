'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import { Cotizacion, EstadoCotizacion, OportunidadVenta } from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { CotizacionModal } from '../../components/CotizacionModal';
import {
  Plus,
  Search,
  Download,
  Eye,
  Edit3,
  Trash2,
  FileText,
  PencilLine,
  Send,
  CheckCircle2,
  XCircle,
  Link2,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { mensajeError } from '../../lib/errores';
import { ActionMenu, ActionMenuItem, Button, CodeStamp, Panel, StatusBadge, type Tone } from '../../components/ui/crm';
import { MetricCard } from '../../components/ui/MetricCard';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { FloatingActionBar } from '../../components/ui/FloatingActionBar';
import { FilterMenu, FilterBar, useFilterUi, FilterDefinition, matchNumberFilter, matchMultiFilter } from '../../components/ui/FilterPills';
import clsx from 'clsx';
import { swrCache } from '../../lib/cache/swr-cache';

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(() => swrCache.get('cotizaciones:list') || []);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>(() => swrCache.get('cotizaciones:oportunidades') || []);
  const [loading, setLoading] = useState<boolean>(() => !swrCache.has('cotizaciones:list'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);

  // Unified CotizacionModal Create/Edit State
  const [editingCotizacion, setEditingCotizacion] = useState<Cotizacion | null>(null);
  const [modalClienteIdInicial, setModalClienteIdInicial] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('cliente_id') || undefined;
  });
  const [modalOportunidadIdInicial, setModalOportunidadIdInicial] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('op_id') || undefined;
  });
  const [modalEditCotIdInicial, setModalEditCotIdInicial] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('edit_cot_id') || undefined;
  });
  const [showEditModal, setShowEditModal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(
      params.get('nueva') === '1' ||
      params.get('cliente_id') ||
      params.get('op_id') ||
      params.get('edit_cot_id')
    );
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const confirmDialog = useConfirm();
  const filterUi = useFilterUi();
  const toast = useToast();
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const isUUID = (str?: string | null): boolean => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  useEffect(() => {
    let ignore = false;
    let debounceTimer: number | null = null;

    async function getCotizaciones() {
      try {
        const [cotRes, opRes] = await Promise.all([
          supabase
            .from('cotizaciones')
            .select('*, cliente:clientes(*), oportunidad:oportunidades!cotizaciones_oportunidad_id_fkey(*), items:cotizacion_items(*)')
            .order('created_at', { ascending: false }),
          supabase.from('oportunidades').select('*'),
        ]);

        if (cotRes.error) throw cotRes.error;
        if (opRes.error) throw opRes.error;

        if (!ignore) {
          setLoadError(null);
          const cotData = (cotRes.data || []) as Cotizacion[];
          const opData = (opRes.data || []) as OportunidadVenta[];
          setCotizaciones(cotData);
          setOportunidades(opData);
          swrCache.set('cotizaciones:list', cotData);
          swrCache.set('cotizaciones:oportunidades', opData);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching cotizaciones from Supabase:', err);
        if (!ignore) {
          setLoadError('No se pudieron cargar las cotizaciones. Reintenta más tarde.');
          setLoading(false);
        }
      }
    }

    void getCotizaciones();

    const triggerDebouncedReload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void getCotizaciones();
      }, 300);
    };

    const channel = supabase
      .channel('realtime_cotizaciones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cotizaciones',
        },
        triggerDebouncedReload
      )
      .subscribe();

    return () => {
      ignore = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const filterDefinitions: FilterDefinition[] = useMemo(() => [
    {
      id: 'estado',
      label: 'Estado',
      allLabel: 'Todos los estados',
      options: [
        { value: 'borrador', label: 'Borrador' },
        { value: 'enviada', label: 'Enviada' },
        { value: 'aprobada', label: 'Aprobada' },
        { value: 'rechazada', label: 'Rechazada' },
      ],
    },
    {
      id: 'asignacion',
      label: 'Oportunidad',
      allLabel: 'Todas',
      options: [
        { value: 'asignada', label: 'Asignada a una oportunidad' },
        { value: 'sin_asignar', label: 'Sin asignar' },
      ],
    },
    {
      id: 'monto',
      label: 'Monto total',
      type: 'number',
      options: [],
    },
  ], []);

  // Oportunidad vinculada de cada cotización (por id o por la relación embebida)
  const getLinkedOp = React.useCallback(
    (cot: Cotizacion): OportunidadVenta | null => {
      if (cot.oportunidad_id && isUUID(cot.oportunidad_id)) {
        return oportunidades.find((o) => o.id === cot.oportunidad_id) ?? cot.oportunidad ?? null;
      }
      return cot.oportunidad?.id ? cot.oportunidad : null;
    },
    [oportunidades]
  );

  const kpis = useMemo(() => {
    let borrador = 0, enviada = 0, aprobada = 0, rechazada = 0, asignadas = 0;
    for (const c of cotizaciones) {
      if (c.estado === 'borrador') borrador++;
      else if (c.estado === 'enviada') enviada++;
      else if (c.estado === 'aprobada') aprobada++;
      else if (c.estado === 'rechazada' || c.estado === 'declinada') rechazada++;
      if (getLinkedOp(c)) asignadas++;
    }
    return {
      total: cotizaciones.length,
      borrador, enviada, aprobada, rechazada,
      asignadas,
      sinAsignar: cotizaciones.length - asignadas,
    };
  }, [cotizaciones, getLinkedOp]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const estadoFiltro = activeFilters.estado;
    const asignacionFiltro = activeFilters.asignacion;

    return cotizaciones.filter((c) => {
      const matchSearch =
        !q ||
        c.numero_cotizacion.toLowerCase().includes(q) ||
        (c.referencia_cliente && c.referencia_cliente.toLowerCase().includes(q)) ||
        (c.cliente && c.cliente.nombre.toLowerCase().includes(q)) ||
        (c.cliente && c.cliente.rut.toLowerCase().includes(q));

      const matchEstado = matchMultiFilter(
        estadoFiltro,
        (v) => c.estado === v || (v === 'rechazada' && c.estado === 'declinada')
      );

      const linked = !!getLinkedOp(c);
      const matchAsignacion = matchMultiFilter(asignacionFiltro, (v) => (v === 'asignada' ? linked : !linked));

      const matchMonto = matchNumberFilter(activeFilters.monto, Number(c.monto_total || 0));

      return matchSearch && matchEstado && matchAsignacion && matchMonto;
    });
  }, [cotizaciones, search, activeFilters, getLinkedOp]);

  // Calculate pagination
  const totalItems = filtered.length;
  const paginatedCotizaciones = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) return;
    const firstSelected = cotizaciones.find((c) => selectedIds.includes(c.id));
    if (firstSelected) setPreviewCotizacion(firstSelected);
  };

  // Change quote status directly
  const handleChangeStatus = async (cotId: string, newStatus: EstadoCotizacion) => {
    const targetCot = cotizaciones.find((c) => c.id === cotId);
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === cotId ? { ...c, estado: newStatus } : c))
    );
    try {
      const { error } = await supabase.from('cotizaciones').update({ estado: newStatus }).eq('id', cotId);
      if (error) throw error;
      setLoadError(null);
      if (targetCot?.oportunidad_id) {
        await supabase.from('actividades_op').insert({
          oportunidad_id: targetCot.oportunidad_id,
          usuario_id: currentUser?.id || null,
          usuario_nombre: currentUser?.nombre || 'Sistema',
          contenido: `Cotización ${targetCot.numero_cotizacion} cambió de ${targetCot.estado} a ${newStatus}.`,
          tipo: 'actualizacion',
        });
      }
      await logSistema({
        tipo_accion: 'estado_cambiado',
        entidad: 'cotizaciones',
        entidad_id: cotId,
        descripcion: `Estado de la cotización ${targetCot?.numero_cotizacion || cotId} cambiado a ${newStatus.toUpperCase()}`,
        usuario_id: currentUser?.id,
        datos_anteriores: targetCot,
        datos_nuevos: { estado: newStatus },
      });
      toast({
        message: `Cotización actualizada a ${newStatus}.`,
        tone: 'success',
      });
    } catch (err) {
      console.error('Error updating status in Supabase:', err);
      setLoadError(mensajeError(err, 'No se pudo cambiar el estado de la cotización.'));
      setCotizaciones((prev) => prev.map((c) => c.id === cotId ? { ...c, estado: targetCot?.estado || c.estado } : c));
    }
  };

  // Delete quote permanently from Supabase
  const handleDeleteCotizacion = async (cot: Cotizacion) => {
    const ok = await confirmDialog({
      title: 'Eliminar Cotización',
      message: `¿Estás seguro de que deseas eliminar la cotización ${cot.numero_cotizacion} por un monto de $${(cot.monto_total || 0).toLocaleString('es-CL')}? Esta acción la eliminará permanentemente.`,
      confirmLabel: 'Eliminar Cotización',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('cotizaciones').delete().eq('id', cot.id);
      if (error) throw error;
      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'cotizaciones',
        entidad_id: cot.id,
        descripcion: `Cotización ${cot.numero_cotizacion} eliminada del sistema`,
        usuario_id: currentUser?.id,
        datos_anteriores: cot,
      });
      setCotizaciones((prev) => prev.filter((c) => c.id !== cot.id));
      toast({
        message: `Cotización ${cot.numero_cotizacion} eliminada.`,
        tone: 'success',
      });
    } catch (err) {
      console.error('Error deleting quote from Supabase:', err);
      toast({
        message: 'No se pudo eliminar la cotización.',
        tone: 'danger',
      });
    }
  };

  const getStatusTone = (estado: EstadoCotizacion): 'neutral' | 'accent' | 'success' | 'danger' | 'warning' => {
    if (estado === 'aprobada') return 'success';
    if (estado === 'enviada') return 'accent';
    if (estado === 'rechazada' || estado === 'declinada') return 'danger';
    return 'neutral';
  };


  const handleAssignOportunidad = async (cot: Cotizacion, targetOpId: string) => {
    if (!targetOpId) return;
    const previousOpId = cot.oportunidad_id;
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === cot.id ? { ...c, oportunidad_id: targetOpId } : c))
    );
    try {
      const { error } = await supabase.from('cotizaciones').update({ oportunidad_id: targetOpId }).eq('id', cot.id);
      if (error) throw error;
      await supabase.from('actividades_op').insert({
        oportunidad_id: targetOpId,
        usuario_id: currentUser?.id || null,
        usuario_nombre: currentUser?.nombre || 'Sistema',
        contenido: `Cotización ${cot.numero_cotizacion} vinculada a la oportunidad.`,
        tipo: 'actualizacion',
      });
      toast({ message: 'Oportunidad vinculada.', tone: 'success' });
    } catch (err) {
      console.error('Error linking op:', err);
      setCotizaciones((prev) =>
        prev.map((c) => (c.id === cot.id ? { ...c, oportunidad_id: previousOpId } : c))
      );
    }
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

  const kpiTiles: { key: string; label: string; value: number; icon: LucideIcon; tone: Tone; filter?: [string, string] }[] = [
    { key: 'total', label: 'Cotizaciones', value: kpis.total, icon: FileText, tone: 'neutral' },
    { key: 'borrador', label: 'Borrador', value: kpis.borrador, icon: PencilLine, tone: 'neutral', filter: ['estado', 'borrador'] },
    { key: 'enviada', label: 'Enviadas', value: kpis.enviada, icon: Send, tone: 'accent', filter: ['estado', 'enviada'] },
    { key: 'aprobada', label: 'Aprobadas', value: kpis.aprobada, icon: CheckCircle2, tone: 'success', filter: ['estado', 'aprobada'] },
    { key: 'rechazada', label: 'Rechazadas', value: kpis.rechazada, icon: XCircle, tone: 'danger', filter: ['estado', 'rechazada'] },
    { key: 'asignada', label: 'Con oportunidad', value: kpis.asignadas, icon: Link2, tone: 'info', filter: ['asignacion', 'asignada'] },
    { key: 'sin_asignar', label: 'Sin oportunidad', value: kpis.sinAsignar, icon: Unlink, tone: 'warning', filter: ['asignacion', 'sin_asignar'] },
  ];

  const statusOptions = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'enviada', label: 'Enviada' },
    { value: 'aprobada', label: 'Aprobada' },
    { value: 'rechazada', label: 'Rechazada' },
  ];

  const oportunidadOptions = oportunidades.map((op) => ({
    value: op.id,
    label: `${op.codigo} · ${op.titulo}`,
  }));

  const openNewCotizacion = () => {
    setEditingCotizacion(null);
    setModalClienteIdInicial(undefined);
    setModalOportunidadIdInicial(undefined);
    setModalEditCotIdInicial(undefined);
    setShowEditModal(true);
  };

  return (
    <div className="space-y-4">
      {/* KPIs: totales por estado y asignación (clic para filtrar) */}
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
              aria-label="Buscar cotizaciones"
              placeholder="Buscar por N° cotización, cliente o RUT..."
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
          <Button variant="primary" onClick={openNewCotizacion}>
            <Plus className="w-4 h-4" />
            <span>Nueva cotización</span>
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

      {/* Lista de cotizaciones */}
      <Panel className="overflow-hidden">
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando cotizaciones…</p>
          ) : loadError ? null : paginatedCotizaciones.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron cotizaciones.</p>
          ) : (
            paginatedCotizaciones.map((cot) => (
              <div key={cot.id} className="p-3 space-y-2 hover:bg-surface-muted/60 transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(cot.id)}
                      onChange={() => toggleSelectOne(cot.id)}
                      aria-label={`Seleccionar cotización ${cot.numero_cotizacion}`}
                      className="shrink-0 accent-accent"
                    />
                    <CodeStamp>{cot.numero_cotizacion}</CodeStamp>
                    <span className="text-xs text-ink-muted font-medium">v{cot.version || 1}</span>
                  </div>
                  <span className="t-num font-semibold text-sm text-ink">${Number(cot.monto_total || 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-muted truncate">{cot.cliente?.nombre || 'Cliente registrado'}</span>
                  <StatusBadge tone={getStatusTone(cot.estado)}>{cot.estado}</StatusBadge>
                </div>
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-line-subtle">
                  <Button variant="subtle" size="sm" onClick={() => setPreviewCotizacion(cot)}>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver</span>
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => { setEditingCotizacion(cot); setShowEditModal(true); }}>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => handleDeleteCotizacion(cot)} aria-label="Eliminar cotización">
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* relative: keeps absolutely positioned sr-only labels inside the scroll area, not widening the page. */}
        <div className="relative hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[1000px] text-[13px]">
            <thead>
              <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todas las cotizaciones"
                    className="rounded cursor-pointer accent-accent"
                  />
                </th>
                <th className="py-3 px-3 min-w-[150px] font-medium">N° Cotización</th>
                <th className="py-3 px-3 w-20 font-medium">Versión</th>
                <th className="py-3 px-3 min-w-[200px] font-medium">Cliente</th>
                <th className="py-3 px-3 min-w-[120px] font-medium">RUT</th>
                <th className="py-3 px-3 min-w-[220px] font-medium">Oportunidad de venta</th>
                <th className="py-3 px-3 min-w-[130px] font-medium">Estado</th>
                <th className="py-3 px-3 min-w-[120px] text-right font-medium">Monto total</th>
                <th className="py-3 px-3 w-12"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-[13px] text-ink">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-cot-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3 text-center">
                      <div className="w-4 h-4 rounded bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                    <td className="py-3 px-3"><div className="h-4 w-28 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-8 rounded bg-surface-muted hg-skeleton" /></td>
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
                    <td className="py-3 px-3"><div className="h-3.5 w-28 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-16 rounded bg-surface-muted hg-skeleton" /></td>
                    <td className="py-3 px-3"><div className="h-3.5 w-20 rounded bg-surface-muted hg-skeleton ml-auto" /></td>
                    <td className="py-3 px-3"><div className="h-6 w-16 rounded-control bg-surface-muted hg-skeleton mx-auto" /></td>
                  </tr>
                ))
              ) : loadError ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron cotizaciones.
                  </td>
                </tr>
              ) : (
                paginatedCotizaciones.map((cot) => {
                  const isSelected = selectedIds.includes(cot.id);
                  const linkedOp = getLinkedOp(cot);

                  return (
                    <tr
                      key={cot.id}
                      className={clsx(
                        'hover:bg-surface-muted/60 transition group border-b border-line-subtle',
                        isSelected ? 'bg-surface-muted/90' : ''
                      )}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(cot.id)}
                          aria-label={`Seleccionar cotización ${cot.numero_cotizacion}`}
                          className="rounded cursor-pointer accent-accent"
                        />
                      </td>

                      <td className="py-3 px-3">
                        <span className="t-num font-semibold text-ink">{cot.numero_cotizacion}</span>
                      </td>

                      {/* Versión */}
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">v{cot.version || 1}</span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-3 font-semibold">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge name={cot.cliente?.nombre || 'Cliente'} size="md" className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/clientes/${cot.cliente_id}`}
                              className="text-[13px] font-semibold leading-tight text-ink hover:text-accent-ink hover:underline transition truncate block"
                            >
                              {cot.cliente?.nombre || 'Cliente registrado'}
                            </Link>
                          </div>
                        </div>
                      </td>

                      {/* RUT */}
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{cot.cliente?.rut || '—'}</span>
                      </td>

                      {/* Oportunidad vinculada */}
                      <td className="py-3 px-3 max-w-[260px]">
                        {linkedOp ? (
                          <Link
                            href={`/ventas?oportunidad=${linkedOp.id}`}
                            className="inline-flex max-w-full items-center gap-2 text-ink hover:text-accent-ink transition"
                          >
                            <CodeStamp>{linkedOp.codigo}</CodeStamp>
                            <span className="truncate text-xs text-ink-muted">{linkedOp.estado_pipeline}</span>
                          </Link>
                        ) : (
                          <SearchSelect
                            variant="plain"
                            value=""
                            ariaLabel={`Asignar oportunidad a ${cot.numero_cotizacion}`}
                            placeholder="Asignar oportunidad"
                            searchPlaceholder="Buscar oportunidad..."
                            options={oportunidadOptions}
                            menuMinWidth={300}
                            onChange={(v) => void handleAssignOportunidad(cot, v)}
                            className="text-ink-muted"
                          />
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-3">
                        <SearchSelect
                          variant="plain"
                          value={cot.estado === 'declinada' ? 'rechazada' : cot.estado}
                          ariaLabel={`Estado de ${cot.numero_cotizacion}`}
                          options={statusOptions}
                          menuMinWidth={160}
                          onChange={(v) => void handleChangeStatus(cot.id, v as EstadoCotizacion)}
                          renderValue={(opt) => (
                            <StatusBadge tone={getStatusTone(opt.value as EstadoCotizacion)}>{opt.label}</StatusBadge>
                          )}
                        />
                      </td>

                      <td className="py-3 px-3 text-right t-num text-ink">
                        ${(cot.monto_total || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <ActionMenu label={`Acciones para ${cot.numero_cotizacion}`}>
                          <ActionMenuItem icon={Eye} onClick={() => setPreviewCotizacion(cot)}>
                            Previsualizar
                          </ActionMenuItem>
                          <ActionMenuItem
                            icon={Edit3}
                            onClick={() => {
                              setEditingCotizacion(cot);
                              setShowEditModal(true);
                            }}
                          >
                            Editar
                          </ActionMenuItem>
                          <ActionMenuItem icon={Trash2} destructive onClick={() => handleDeleteCotizacion(cot)}>
                            Eliminar
                          </ActionMenuItem>
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

      {/* Modal Unificado de Cotizaciones */}
      <CotizacionModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCotizacion(null);
          setModalClienteIdInicial(undefined);
          setModalOportunidadIdInicial(undefined);
          setModalEditCotIdInicial(undefined);
        }}
        initialCotizacion={editingCotizacion}
        clienteIdInicial={modalClienteIdInicial}
        oportunidadIdInicial={modalOportunidadIdInicial}
        editCotizacionIdInicial={modalEditCotIdInicial}
        onSuccess={async () => {
          const { data, error } = await supabase
            .from('cotizaciones')
            .select('*, cliente:clientes(*), oportunidad:oportunidades!cotizaciones_oportunidad_id_fkey(*), items:cotizacion_items(*)')
            .order('created_at', { ascending: false });
          if (error) {
            console.error('Error refreshing cotizaciones from Supabase:', error);
            setLoadError('No se pudieron actualizar las cotizaciones. Reintenta más tarde.');
          } else {
            setLoadError(null);
            setCotizaciones((data || []) as Cotizacion[]);
          }
        }}
      />

      {/* Modal Reusable Previsualización PDF */}
      <PdfPreviewModal
        cotizacion={previewCotizacion}
        onClose={() => setPreviewCotizacion(null)}
      />

      {/* Barra de Acciones Masivas Flotante */}
      <FloatingActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        itemLabel="cotizaciones"
      >
        <Button variant="secondary" size="sm" onClick={handleDownloadSelected}>
          <Download className="w-3.5 h-3.5 text-accent-ink" />
          <span>Ver PDF ({selectedIds.length})</span>
        </Button>
      </FloatingActionBar>
    </div>
  );
}
