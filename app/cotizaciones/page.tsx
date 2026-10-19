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
  Building,
  Download,
  Eye,
  CheckSquare,
  Square,
  Edit3,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { mensajeError } from '../../lib/errores';
import { Button, CodeStamp, PageHeader, Panel, StatusBadge } from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { FloatingActionBar } from '../../components/ui/FloatingActionBar';
import { FilterPills, FilterDefinition } from '../../components/ui/FilterPills';
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

  // Unified CotizacionModal Edit State
  const [editingCotizacion, setEditingCotizacion] = useState<Cotizacion | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const confirmDialog = useConfirm();
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
        { value: 'declinada', label: 'Declinada' },
      ],
    },
  ], []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const estadoFiltro = activeFilters.estado;

    return cotizaciones.filter((c) => {
      const matchSearch =
        !q ||
        c.numero_cotizacion.toLowerCase().includes(q) ||
        (c.referencia_cliente && c.referencia_cliente.toLowerCase().includes(q)) ||
        (c.cliente && c.cliente.nombre.toLowerCase().includes(q)) ||
        (c.cliente && c.cliente.rut.toLowerCase().includes(q));

      const matchEstado = !estadoFiltro || estadoFiltro === 'todos' || c.estado === estadoFiltro;

      return matchSearch && matchEstado;
    });
  }, [cotizaciones, search, activeFilters]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Cotizaciones Emitidas"
        description="Gestiona estados, versiones y vínculos con oportunidades de venta."
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button variant="secondary" onClick={handleDownloadSelected}>
                <Download className="w-4 h-4 text-accent-ink" />
                <span>Ver PDF Selección ({selectedIds.length})</span>
              </Button>
            )}
            <Link href="/cotizaciones/nuevo">
              <Button variant="primary">
                <Plus className="w-4 h-4" />
                <span>Crear Nueva Cotización</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Barra Búsqueda y Filtros Next-Gen (Attio Style) */}
      <FilterPills
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => setActiveFilters((prev) => ({ ...prev, [id]: val }))}
        onClearAll={() => {
          setActiveFilters({});
          setSearch('');
        }}
        totalResults={cotizaciones.length}
        filteredResults={filtered.length}
      >
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por N° cotización, cliente o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface border border-line rounded-control text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent"
          />
        </div>
      </FilterPills>

      {loadError && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {loadError}
        </div>
      )}

      {/* Tabla de Cotizaciones */}
      <Panel className="overflow-hidden">
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando cotizaciones…</p>
          ) : loadError ? null : paginatedCotizaciones.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron cotizaciones.</p>
          ) : (
            paginatedCotizaciones.map((cot) => (
              <div key={cot.id} className="p-4 space-y-2 hover:bg-surface-muted transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelectOne(cot.id)}
                      aria-label={`Seleccionar cotización ${cot.numero_cotizacion}`}
                      className="shrink-0 text-ink-muted"
                    >
                      {selectedIds.includes(cot.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                    </button>
                    <CodeStamp>{cot.numero_cotizacion}</CodeStamp>
                    <span className="text-xs text-ink-muted font-medium">v{cot.version || 1}</span>
                  </div>
                  <span className="t-num font-semibold text-sm text-ink">${Number(cot.monto_total || 0).toLocaleString('es-CL')}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-muted truncate">{cot.cliente?.nombre || 'Cliente registrado'}</span>
                  <StatusBadge tone={getStatusTone(cot.estado)}>{cot.estado}</StatusBadge>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-line-subtle">
                  <Button variant="subtle" size="sm" onClick={() => setPreviewCotizacion(cot)}>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ver</span>
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => { setEditingCotizacion(cot); setShowEditModal(true); }}>
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </Button>
                  <Button variant="subtle" size="sm" onClick={() => handleDeleteCotizacion(cot)}>
                    <Trash2 className="w-3.5 h-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead className="bg-surface-muted/50 text-ink-muted uppercase text-[11px] font-semibold tracking-normal border-b border-line">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">
                  <button onClick={toggleSelectAll} className="text-ink-muted hover:text-accent" aria-label="Seleccionar todas las cotizaciones">
                    {selectedIds.length === filtered.length && filtered.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-accent" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-3 font-semibold text-ink">N° Cotización</th>
                <th className="py-2.5 px-3 font-semibold text-ink">Versión</th>
                <th className="py-2.5 px-3 font-semibold text-ink">Cliente & RUT</th>
                <th className="py-2.5 px-3 font-semibold text-ink">Oportunidad de Venta</th>
                <th className="py-2.5 px-3 font-semibold text-ink">Estado</th>
                <th className="py-2.5 px-3 text-right font-semibold text-ink">Monto Total</th>
                <th className="py-2.5 px-3 text-center font-semibold text-ink">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-xs">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-cot-${idx}`} className="animate-pulse">
                    <td className="py-2 px-3 text-center">
                      <div className="w-4 h-4 rounded bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                    <td className="py-2 px-3">
                      <div className="h-4 w-24 rounded bg-surface-muted hg-skeleton" />
                    </td>
                    <td className="py-2 px-3">
                      <div className="h-3.5 w-8 rounded bg-surface-muted hg-skeleton" />
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-surface-muted hg-skeleton shrink-0" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3.5 w-32 rounded bg-surface-muted hg-skeleton" />
                          <div className="h-2.5 w-20 rounded bg-surface-muted hg-skeleton" />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="h-3.5 w-28 rounded bg-surface-muted hg-skeleton" />
                    </td>
                    <td className="py-2 px-3">
                      <div className="h-4 w-16 rounded-full bg-surface-muted hg-skeleton" />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="h-4 w-20 rounded bg-surface-muted hg-skeleton ml-auto" />
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="h-6 w-16 rounded-control bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                  </tr>
                ))
              ) : loadError ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron cotizaciones.
                  </td>
                </tr>
              ) : (
                paginatedCotizaciones.map((cot) => {
                  const isSelected = selectedIds.includes(cot.id);
                  const linkedOp = (cot.oportunidad_id && isUUID(cot.oportunidad_id))
                    ? oportunidades.find((o) => o.id === cot.oportunidad_id)
                    : (cot.oportunidad?.id ? cot.oportunidad : null);

                  return (
                    <tr
                      key={cot.id}
                      className={clsx(
                        'hover:bg-surface-muted/60 transition group border-b border-line-subtle',
                        isSelected ? 'bg-surface-muted/90' : ''
                      )}
                    >
                      <td className="py-2 px-3 text-center">
                        <button
                          onClick={() => toggleSelectOne(cot.id)}
                          className="text-ink-muted hover:text-accent"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-accent" />
                          ) : (
                            <Square className="w-4 h-4 text-ink-muted" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 font-semibold text-ink">
                        <CodeStamp>{cot.numero_cotizacion}</CodeStamp>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-[11px] font-semibold text-ink-muted bg-surface-muted border border-line px-1.5 py-0.5 rounded-control">
                          v{cot.version || 1}
                        </span>
                      </td>

                      {/* Cliente & RUT con AvatarBadge */}
                      <td className="py-2 px-3">
                        <Link
                          href={`/clientes/${cot.cliente_id}`}
                          className="group flex items-center gap-2 hover:text-accent transition min-w-0"
                        >
                          <AvatarBadge name={cot.cliente?.nombre || 'Cliente'} size="xs" className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-semibold text-ink group-hover:text-accent truncate block">
                              {cot.cliente?.nombre || 'Cliente Registrado'}
                            </span>
                            <span className="text-[11px] text-ink-muted t-num block truncate">
                              RUT: {cot.cliente?.rut || 'Sin RUT'}
                            </span>
                          </div>
                        </Link>
                      </td>

                      {/* Oportunidad Vinculada */}
                      <td className="py-2 px-3 max-w-[240px]">
                        {linkedOp ? (
                          <Link
                            href={`/ventas/${linkedOp.id}`}
                            className="flex items-center gap-1.5 text-xs text-ink hover:text-accent transition font-medium group truncate"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-accent-ink shrink-0" />
                            <CodeStamp>{linkedOp.codigo}</CodeStamp>
                            <StatusBadge tone="neutral">{linkedOp.estado_pipeline}</StatusBadge>
                          </Link>
                        ) : (
                          <div className="space-y-1">
                            <select
                              defaultValue=""
                              onChange={async (e) => {
                                const targetOpId = e.target.value;
                                if (!targetOpId) return;
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
                                  toast({
                                    message: 'Oportunidad vinculada.',
                                    tone: 'success',
                                  });
                                } catch (err) {
                                  console.error('Error linking op:', err);
                                  setCotizaciones((prev) => prev.map((c) => c.id === cot.id ? { ...c, oportunidad_id: cot.oportunidad_id } : c));
                                }
                              }}
                              className="bg-surface border border-line rounded-control px-2 py-0.5 text-[11px] text-ink font-medium focus:outline-none focus:border-accent w-full"
                            >
                              <option value="">-- Asignar Oportunidad --</option>
                              {oportunidades.map((op) => (
                                <option key={op.id} value={op.id}>
                                  {op.codigo} - {op.titulo}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Selector de Estado */}
                      <td className="py-2 px-3">
                        <select
                          value={cot.estado}
                          onChange={(e) => handleChangeStatus(cot.id, e.target.value as EstadoCotizacion)}
                          className="text-[11px] font-semibold bg-surface border border-line rounded-control px-2 py-0.5 text-ink focus:outline-none focus:border-accent cursor-pointer"
                        >
                          <option value="borrador">Borrador</option>
                          <option value="enviada">Enviada</option>
                          <option value="aprobada">Aprobada</option>
                          <option value="rechazada">Rechazada</option>
                        </select>
                      </td>

                      <td className="py-2 px-3 text-right font-bold text-ink text-xs t-num">
                        ${(cot.monto_total || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => setPreviewCotizacion(cot)}
                            title="Previsualizar PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => {
                              setEditingCotizacion(cot);
                              setShowEditModal(true);
                            }}
                            title="Editar Cotización"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => handleDeleteCotizacion(cot)}
                            title="Eliminar Cotización"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-danger" />
                          </Button>
                        </div>
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
        }}
        initialCotizacion={editingCotizacion}
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

      {/* Barra de Acciones Masivas Flotante (Twenty CRM Style) */}
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
