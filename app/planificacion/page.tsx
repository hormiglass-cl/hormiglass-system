'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { esRutaReventa } from '../../lib/pipeline-ruta';
import { totalAbonado } from '../../lib/oportunidad-finanzas';
import {
  ProyectoPlanificacion,
  EstadoPlanificacion,
  OportunidadVenta,
  Cotizacion,
  ChatMensaje,
} from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import {
  Factory,
  Calendar,
  User,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Building,
  DollarSign,
  FileText,
  MessageSquare,
  Send,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  PageHeader,
  Panel,
  Button,
  SearchField,
  CodeStamp,
  StatusBadge,
} from '../../components/ui/crm';
import { useToast } from '../../components/ui/feedback';

type StageMeta = {
  id: EstadoPlanificacion;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'accent';
};

const ETAPAS_PLANIFICACION: StageMeta[] = [
  { id: 'pendiente', label: '1. Pendiente Planificación', tone: 'warning' },
  { id: 'cola_produccion', label: '2. En Cola de Fabricación', tone: 'info' },
  { id: 'fabricacion', label: '3. En Fabricación', tone: 'accent' },
  { id: 'listo_instalacion', label: '4. Listo p/ Instalación', tone: 'info' },
  { id: 'instalacion', label: '5. En Instalación', tone: 'accent' },
  { id: 'finalizado', label: '6. Finalizado / Entregado', tone: 'success' },
];

const ESTADO_LEGADO_PRODUCCION: Record<string, EstadoPlanificacion> = {
  en_produccion: 'fabricacion',
  listo_despacho: 'listo_instalacion',
  terminada: 'finalizado',
  prod_pendiente: 'pendiente',
  prod_cola: 'cola_produccion',
  prod_fabricacion: 'fabricacion',
  prod_listo_instalacion: 'listo_instalacion',
  prod_instalacion: 'instalacion',
  prod_finalizado: 'finalizado',
};

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export default function PlanificacionPage() {
  const { currentUser } = useAuth();
  const toast = useToast();
  const [proyectos, setProyectos] = useState<(ProyectoPlanificacion & { oportunidad?: OportunidadVenta })[]>([]);
  const [, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [selectedOp, setSelectedOp] = useState<OportunidadVenta | null>(null);
  const [selectedProyecto, setSelectedProyecto] = useState<ProyectoPlanificacion | null>(null);

  const [openSections, setOpenSections] = useState({
    contacto: false,
    productos: false,
    finanzas: false,
    visita: false,
    produccion: false,
  });

  const [opActivities, setOpActivities] = useState<ChatMensaje[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [pdfPreviewCotizacion, setPdfPreviewCotizacion] = useState<Cotizacion | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadProyectos = React.useCallback(async () => {
    try {
      setLoading(true);

      const [opRes, planRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones!cotizaciones_oportunidad_id_fkey(*)')
          .or(
            'rama_destino.eq.produccion,estado_pipeline.in.(entregada,en_produccion,listo_despacho,terminada,prod_pendiente,prod_cola,prod_fabricacion,prod_listo_instalacion,prod_instalacion,prod_finalizado)'
          ),
        supabase.from('proyectos_planificacion').select('*'),
      ]);

      if (opRes.error) throw new Error(`Oportunidades: ${opRes.error.message}`);
      if (planRes.error) throw new Error(`Proyectos: ${planRes.error.message}`);

      const planMap = new Map<string, ProyectoPlanificacion>();
      ((planRes.data || []) as ProyectoPlanificacion[]).forEach((p) => {
        if (p.oportunidad_id) planMap.set(p.oportunidad_id, p);
      });

      const combined: (ProyectoPlanificacion & { oportunidad?: OportunidadVenta })[] = [];

      ((opRes.data || []) as OportunidadVenta[]).forEach((op) => {
        const isReventa = esRutaReventa(op);
        if (isReventa) return;

        const planRecord = planMap.get(op.id);
        combined.push({
          id: planRecord?.id || `plan-${op.id}`,
          oportunidad_id: op.id,
          codigo: op.codigo,
          titulo: op.titulo,
          cliente_id: op.cliente_id,
          cliente: op.cliente,
          estado:
            (planRecord?.estado as EstadoPlanificacion) ||
            ESTADO_LEGADO_PRODUCCION[op.estado_pipeline] ||
            'pendiente',
          fecha_estimada_produccion: planRecord?.fecha_estimada_produccion || undefined,
          fecha_estimada_instalacion: planRecord?.fecha_estimada_instalacion || undefined,
          observaciones: planRecord?.observaciones || 'Vinculado desde Venta Cerrada.',
          oportunidad: op,
        });
      });

      setProyectos(combined);
    } catch (err) {
      console.error('Error cargando proyectos de producción:', err);
      toast({ message: 'Error al cargar proyectos de producción', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(() => {
      if (!ignore) void loadProyectos();
    }, 0);

    const channel1 = supabase
      .channel('realtime_plan_table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos_planificacion' }, () => {
        if (!ignore) void loadProyectos();
      })
      .subscribe();

    const channel2 = supabase
      .channel('realtime_plan_ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => {
        if (!ignore) void loadProyectos();
      })
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel1);
      void supabase.removeChannel(channel2);
    };
  }, [supabase, loadProyectos]);

  const moveProyectoState = async (id: string, opId: string, targetEstado: EstadoPlanificacion) => {
    setProyectos((prev) =>
      prev.map((p) => (p.oportunidad_id === opId || p.id === id ? { ...p, estado: targetEstado } : p))
    );

    if (selectedProyecto && (selectedProyecto.oportunidad_id === opId || selectedProyecto.id === id)) {
      setSelectedProyecto({ ...selectedProyecto, estado: targetEstado });
    }

    if (isUUID(opId)) {
      try {
        await supabase.from('proyectos_planificacion').upsert(
          [
            {
              oportunidad_id: opId,
              codigo: selectedProyecto?.codigo || 'OP-2790',
              titulo: selectedProyecto?.titulo || 'Proyecto',
              cliente_id: selectedProyecto?.cliente_id,
              estado: targetEstado,
            },
          ],
          { onConflict: 'oportunidad_id' }
        );
        toast({ message: 'Estado de producción actualizado', tone: 'success' });
      } catch (err) {
        console.error('Error moviendo estado en producción:', err);
        toast({ message: 'Error al actualizar estado', tone: 'danger' });
      }
    }
  };

  const handleOpenProyectoModal = async (proy: ProyectoPlanificacion & { oportunidad?: OportunidadVenta }) => {
    setSelectedProyecto(proy);
    const op =
      proy.oportunidad ||
      ({
        id: proy.oportunidad_id,
        codigo: proy.codigo,
        titulo: proy.titulo,
        cliente_id: proy.cliente_id,
        cliente: proy.cliente,
        estado_pipeline: 'entregada',
      } as OportunidadVenta);

    setSelectedOp(op);
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      visita: false,
      produccion: false,
    });

    if (isUUID(op.id)) {
      void loadActivitiesForOp(op.id);
    }
  };

  const loadActivitiesForOp = async (opId: string) => {
    try {
      const { data } = await supabase
        .from('actividades_op')
        .select('*')
        .eq('oportunidad_id', opId)
        .order('created_at', { ascending: true });

      if (data) {
        setOpActivities(
          (data as (ChatMensaje & { usuario_nombre?: string })[]).map((a) => ({
            id: a.id,
            usuario_id: a.usuario_id || 'sistema',
            usuario_nombre: a.usuario_nombre || 'Sistema',
            contenido: a.contenido,
            created_at: a.created_at,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading activities:', err);
    }
  };

  const handleSendChatMessage = async () => {
    if (!newChatText.trim() || !selectedOp) return;
    const msgContent = newChatText.trim();
    setNewChatText('');

    const newMsg: ChatMensaje = {
      id: Date.now().toString(),
      usuario_id: currentUser?.id || 'admin',
      usuario_nombre: currentUser?.nombre || 'Administrador',
      contenido: msgContent,
      created_at: new Date().toISOString(),
    };

    setOpActivities((prev) => [...prev, newMsg]);

    if (isUUID(selectedOp.id)) {
      try {
        await supabase.from('actividades_op').insert([
          {
            oportunidad_id: selectedOp.id,
            usuario_id: currentUser?.id || 'admin',
            usuario_nombre: currentUser?.nombre || 'Administrador',
            contenido: msgContent,
          },
        ]);
      } catch (err) {
        console.error('Error sending chat message:', err);
      }
    }
  };

  const getOportunidadTotalValue = (op?: OportunidadVenta) => {
    if (!op) return 0;
    if (!op.cotizaciones || op.cotizaciones.length === 0) return op.monto || 0;
    const aprobada = op.cotizaciones.find((c) => c.estado === 'aprobada');
    if (aprobada) return aprobada.monto_total || 0;
    return op.cotizaciones[0]?.monto_total || op.monto || 0;
  };

  const getOportunidadAbonadoValue = (op?: OportunidadVenta) => {
    return op ? totalAbonado(op) : 0;
  };

  const filteredProyectos = proyectos.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.codigo?.toLowerCase().includes(q) ||
      p.titulo?.toLowerCase().includes(q) ||
      p.cliente?.nombre?.toLowerCase().includes(q) ||
      p.oportunidad?.titulo?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planificación de producción"
        description="Control de etapas de fabricación, instalación y entregas vinculadas a ventas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-surface p-1">
              <button
                type="button"
                onClick={() => setActiveTab('lista')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md t-micro font-semibold transition-colors ${
                  activeTab === 'lista'
                    ? 'bg-accent text-on-accent'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <ListIcon size={14} />
                <span>Lista</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tablero')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md t-micro font-semibold transition-colors ${
                  activeTab === 'tablero'
                    ? 'bg-accent text-on-accent'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <LayoutGrid size={14} />
                <span>Tablero</span>
              </button>
            </div>

            <Link href="/planificacion/calendario">
              <Button variant="secondary" icon={Calendar}>
                Calendario de entregas
              </Button>
            </Link>

            <Link href="/planificacion/semana">
              <Button variant="secondary" icon={Factory}>
                Programa semanal
              </Button>
            </Link>
          </div>
        }
      />

      {/* Buscador */}
      <Panel className="p-3">
        <SearchField
          placeholder="Buscar por código, título de proyecto o cliente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Panel>

      {/* VISTA 1: LISTA AGRUPADA POR ESTADOS */}
      {activeTab === 'lista' ? (
        <div className="space-y-4">
          {ETAPAS_PLANIFICACION.map((col) => {
            const isCollapsed = Boolean(collapsedSections[col.id]);
            const colProyectos = filteredProyectos.filter((p) => p.estado === col.id);

            return (
              <Panel key={col.id} className="p-0 overflow-hidden">
                {/* Accordion Group Header */}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedSections((prev) => ({ ...prev, [col.id]: !prev[col.id] }))
                  }
                  aria-expanded={!isCollapsed}
                  className="w-full flex items-center justify-between p-3.5 bg-surface-muted hover:bg-surface transition-colors cursor-pointer text-left border-b border-border"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-ink-muted">
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </span>

                    <StatusBadge tone={col.tone}>
                      {col.label}
                    </StatusBadge>

                    <span className="rounded-full bg-surface px-2 py-0.5 t-micro t-num font-semibold text-ink-muted border border-border">
                      {colProyectos.length}
                    </span>
                  </div>
                </button>

                {/* Filas */}
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {colProyectos.map((proy) => {
                      const totalMonto = getOportunidadTotalValue(proy.oportunidad);

                      return (
                        <div
                          key={proy.id}
                          className="flex items-center justify-between gap-4 p-3 hover:bg-surface-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <CodeStamp>{proy.codigo}</CodeStamp>
                            <button
                              type="button"
                              onClick={() => void handleOpenProyectoModal(proy)}
                              className="min-w-0 flex-1 text-left group"
                            >
                              <span className="block truncate t-body font-semibold text-ink group-hover:text-accent transition-colors">
                                {proy.titulo}
                              </span>
                              <span className="block truncate t-micro text-ink-muted">
                                {proy.cliente?.nombre || 'Cliente sin asignar'}
                              </span>
                            </button>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            {proy.oportunidad?.fecha_limite && (
                              <span className="t-micro text-ink-muted t-num hidden sm:inline">
                                Límite {proy.oportunidad.fecha_limite}
                              </span>
                            )}
                            <span className="t-caption font-semibold text-ink t-num">
                              ${totalMonto.toLocaleString('es-CL')}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleOpenProyectoModal(proy)}
                              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                              aria-label={`Ver detalle de ${proy.codigo}`}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {colProyectos.length === 0 && (
                      <div className="p-4 text-center t-micro text-ink-muted">
                        No hay oportunidades en esta etapa.
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      ) : (
        /* VISTA 2: TABLERO KANBAN */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4 items-start">
          {ETAPAS_PLANIFICACION.map((col) => {
            const colProyectos = filteredProyectos.filter((p) => p.estado === col.id);

            return (
              <div
                key={col.id}
                className="rounded-xl border border-border bg-surface-muted/40 p-3 flex flex-col min-h-[560px] space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <StatusBadge tone={col.tone}>
                    {col.label}
                  </StatusBadge>
                  <span className="rounded-full bg-surface px-2 py-0.5 t-micro t-num font-semibold text-ink-muted border border-border">
                    {colProyectos.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {colProyectos.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-center t-micro text-ink-subtle border border-dashed border-border rounded-lg bg-surface/50">
                      Sin oportunidades aquí
                    </div>
                  ) : (
                    colProyectos.map((proy) => {
                      const op = proy.oportunidad;
                      const montoTotal = getOportunidadTotalValue(op);
                      const abonado = getOportunidadAbonadoValue(op);
                      const saldo = Math.max(0, montoTotal - abonado);

                      return (
                        <div
                          key={proy.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleOpenProyectoModal(proy)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleOpenProyectoModal(proy);
                            }
                          }}
                          className="rounded-lg border border-border bg-surface p-3.5 space-y-2.5 transition-colors hover:border-accent/50 hover:bg-surface-muted/30 cursor-pointer group text-left"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <CodeStamp>{proy.codigo}</CodeStamp>
                            <StatusBadge tone={col.tone}>
                              {col.label.split('.')[1]?.trim() || col.label}
                            </StatusBadge>
                          </div>

                          <h4 className="t-body font-semibold text-ink leading-snug group-hover:text-accent transition-colors line-clamp-2">
                            {proy.titulo}
                          </h4>

                          <div className="flex items-center gap-1.5 t-micro text-ink-muted truncate">
                            <User size={13} className="shrink-0 text-ink-subtle" />
                            <span className="truncate">{proy.cliente?.nombre || 'Sin cliente'}</span>
                          </div>

                          <div className="pt-2 border-t border-border t-micro space-y-1 t-num">
                            <div className="flex items-center justify-between text-ink-muted">
                              <span>Inicio:</span>
                              <span>{op?.fecha_inicio || 'Sin fecha'}</span>
                            </div>
                            <div className="flex items-center justify-between text-ink font-semibold">
                              <span>Límite Término:</span>
                              <span>{op?.fecha_limite || 'Sin fecha'}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-border t-micro space-y-1 t-num">
                            <div className="flex items-center justify-between font-semibold text-ink">
                              <span>Total:</span>
                              <span>${montoTotal.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex items-center justify-between text-success font-medium">
                              <span>Abonado:</span>
                              <span>${abonado.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex items-center justify-between text-ink-muted">
                              <span>Saldo Pendiente:</span>
                              <span className="font-semibold text-ink">${saldo.toLocaleString('es-CL')}</span>
                            </div>
                          </div>

                          <div className="pt-2 flex items-center justify-between gap-1 border-t border-border">
                            <span className="t-micro text-ink-subtle uppercase">Mover:</span>
                            <select
                              value={proy.estado}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void moveProyectoState(
                                  proy.id,
                                  proy.oportunidad_id,
                                  e.target.value as EstadoPlanificacion
                                )
                              }
                              className="rounded border border-border bg-surface px-1.5 py-0.5 t-micro font-medium text-ink outline-none focus:border-accent"
                            >
                              {ETAPAS_PLANIFICACION.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL UNIFIED OPORTUNIDAD MODAL */}
      {selectedOp && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedOp(null);
          }}
        >
          <div className="rounded-2xl border border-border bg-surface text-ink max-w-6xl w-full p-4 sm:p-6 shadow-xl h-[92vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda (7/12 Cols) */}
            <div className="lg:col-span-7 flex flex-col h-full overflow-hidden pr-2 lg:border-r border-border">
              {/* Header Modal */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Building size={16} className="text-ink-muted" />
                  <span className="t-body font-semibold text-ink">
                    {selectedOp.cliente?.nombre || 'Cliente'}
                  </span>
                  <span className="text-ink-subtle">/</span>
                  <CodeStamp>{selectedOp.codigo}</CodeStamp>
                </div>

                <div className="flex items-center gap-2">
                  {selectedProyecto?.estado && (
                    <StatusBadge
                      tone={
                        ETAPAS_PLANIFICACION.find((e) => e.id === selectedProyecto.estado)?.tone ||
                        'neutral'
                      }
                    >
                      {selectedProyecto.estado.toUpperCase()}
                    </StatusBadge>
                  )}
                  <Link href={`/ventas/${selectedOp.id}/operacion`}>
                    <Button variant="secondary" size="sm" icon={ExternalLink}>
                      Operación completa
                    </Button>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSelectedOp(null)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Título de la Oportunidad */}
              <div className="py-3 border-b border-border shrink-0">
                <h2 className="t-page text-ink">{selectedOp.titulo}</h2>
              </div>

              {/* Acordeones */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 py-4">
                {/* Accordion 1: Contacto */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, contacto: !openSections.contacto })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <User size={15} className="text-accent" />
                      <span>1. Contacto del Cliente</span>
                    </div>
                    {openSections.contacto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {openSections.contacto && (
                    <div className="p-4 space-y-3 t-micro text-ink-muted bg-surface">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="block font-medium text-ink-subtle uppercase">Nombre</span>
                          <p className="t-body font-semibold text-ink">{selectedOp.cliente?.nombre}</p>
                        </div>
                        <div>
                          <span className="block font-medium text-ink-subtle uppercase">RUT</span>
                          <p className="t-body font-mono text-ink t-num">{selectedOp.cliente?.rut || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>

                {/* Accordion 2: Cotizaciones */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-accent" />
                      <span>2. Cotizaciones de la Oportunidad</span>
                    </div>
                    {openSections.productos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {openSections.productos && (
                    <div className="p-4 space-y-3 t-micro text-ink-muted bg-surface">
                      <p className="t-caption text-ink">
                        Cotización asociada aprobada: ${getOportunidadTotalValue(selectedOp).toLocaleString('es-CL')}
                      </p>
                    </div>
                  )}
                </Panel>

                {/* Accordion 3: Finanzas & Abonos */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <DollarSign size={15} className="text-accent" />
                      <span>3. Finanzas & Abonos</span>
                    </div>
                    {openSections.finanzas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {openSections.finanzas && (
                    <div className="p-4 space-y-3 t-micro bg-surface">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div className="p-3 rounded-lg border border-border bg-surface-muted">
                          <span className="t-micro text-ink-muted uppercase">Total Venta</span>
                          <p className="t-body font-semibold text-ink t-num mt-1">
                            ${getOportunidadTotalValue(selectedOp).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border border-border bg-surface-muted">
                          <span className="t-micro text-success uppercase">Abonado</span>
                          <p className="t-body font-semibold text-success t-num mt-1">
                            ${getOportunidadAbonadoValue(selectedOp).toLocaleString('es-CL')}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border border-border bg-surface-muted">
                          <span className="t-micro text-ink-muted uppercase">Saldo Pendiente</span>
                          <p className="t-body font-semibold text-ink t-num mt-1">
                            $
                            {(
                              getOportunidadTotalValue(selectedOp) -
                              getOportunidadAbonadoValue(selectedOp)
                            ).toLocaleString('es-CL')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>

                {/* Accordion 4: Visita a Terreno */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar size={15} className="text-accent" />
                      <span>4. Visita a Terreno</span>
                    </div>
                    {openSections.visita ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {openSections.visita && (
                    <div className="p-4 t-micro text-ink-muted bg-surface">
                      <p>Información de inspecciones en terreno vinculadas.</p>
                    </div>
                  )}
                </Panel>

                {/* Accordion 5: Datos de Producción */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, produccion: !openSections.produccion })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Factory size={15} className="text-accent" />
                      <span>5. Datos de Producción y Logística</span>
                    </div>
                    {openSections.produccion ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {openSections.produccion && (
                    <div className="p-4 space-y-4 t-caption bg-surface">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Estado de Producción
                          </label>
                          <select
                            value={selectedProyecto?.estado || 'pendiente'}
                            onChange={(e) => {
                              if (selectedProyecto) {
                                void moveProyectoState(
                                  selectedProyecto.id,
                                  selectedProyecto.oportunidad_id,
                                  e.target.value as EstadoPlanificacion
                                );
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body font-medium text-ink outline-none focus:border-accent"
                          >
                            {ETAPAS_PLANIFICACION.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Estimación Fabricación
                          </label>
                          <input
                            type="date"
                            value={selectedProyecto?.fecha_estimada_produccion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedProyecto) {
                                setSelectedProyecto({ ...selectedProyecto, fecha_estimada_produccion: val });
                                if (isUUID(selectedProyecto.oportunidad_id)) {
                                  await supabase.from('proyectos_planificacion').upsert(
                                    [
                                      {
                                        oportunidad_id: selectedProyecto.oportunidad_id,
                                        codigo: selectedProyecto.codigo,
                                        titulo: selectedProyecto.titulo,
                                        cliente_id: selectedProyecto.cliente_id,
                                        fecha_estimada_produccion: val,
                                      },
                                    ],
                                    { onConflict: 'oportunidad_id' }
                                  );
                                }
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body t-num text-ink outline-none focus:border-accent"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Estimación Instalación
                          </label>
                          <input
                            type="date"
                            value={selectedProyecto?.fecha_estimada_instalacion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedProyecto) {
                                setSelectedProyecto({ ...selectedProyecto, fecha_estimada_instalacion: val });
                                if (isUUID(selectedProyecto.oportunidad_id)) {
                                  await supabase.from('proyectos_planificacion').upsert(
                                    [
                                      {
                                        oportunidad_id: selectedProyecto.oportunidad_id,
                                        codigo: selectedProyecto.codigo,
                                        titulo: selectedProyecto.titulo,
                                        cliente_id: selectedProyecto.cliente_id,
                                        fecha_estimada_instalacion: val,
                                      },
                                    ],
                                    { onConflict: 'oportunidad_id' }
                                  );
                                }
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body t-num text-ink outline-none focus:border-accent"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">
                          Observaciones Técnicas / Planta
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Instrucciones específicas de corte, templado, armado o logística de instalación..."
                          value={selectedProyecto?.observaciones || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (selectedProyecto) {
                              setSelectedProyecto({ ...selectedProyecto, observaciones: val });
                              if (isUUID(selectedProyecto.oportunidad_id)) {
                                await supabase.from('proyectos_planificacion').upsert(
                                  [
                                    {
                                      oportunidad_id: selectedProyecto.oportunidad_id,
                                      codigo: selectedProyecto.codigo,
                                      titulo: selectedProyecto.titulo,
                                      cliente_id: selectedProyecto.cliente_id,
                                      observaciones: val,
                                    },
                                  ],
                                  { onConflict: 'oportunidad_id' }
                                );
                              }
                            }
                          }}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink outline-none focus:border-accent resize-none"
                        />
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            </div>

            {/* Columna Derecha (5/12 Cols): Feed de Actividades & Chat */}
            <div className="lg:col-span-5 rounded-xl border border-border bg-surface p-4 flex flex-col justify-between h-full overflow-hidden">
              <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="t-body font-semibold text-ink flex items-center gap-2">
                    <MessageSquare size={16} className="text-accent" />
                    <span>Actividad y comentarios</span>
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {opActivities.length === 0 ? (
                    <div className="text-center py-8 t-micro text-ink-muted">
                      Sin mensajes o actividades registradas.
                    </div>
                  ) : (
                    opActivities.map((act) => (
                      <div key={act.id} className="p-3 rounded-lg border border-border bg-surface-muted/50 space-y-1">
                        <div className="flex items-center justify-between t-micro">
                          <span className="font-semibold text-ink">{act.usuario_nombre}</span>
                          <span className="text-ink-subtle t-num">
                            {new Date(act.created_at).toLocaleTimeString('es-CL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="t-caption text-ink">{act.contenido}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat Input */}
              <div className="pt-3 border-t border-border flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Escribir comentario..."
                  value={newChatText}
                  onChange={(e) => setNewChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSendChatMessage()}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink outline-none focus:border-accent"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSendChatMessage()}
                  icon={Send}
                >
                  Enviar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewCotizacion && (
        <PdfPreviewModal
          cotizacion={pdfPreviewCotizacion}
          onClose={() => setPdfPreviewCotizacion(null)}
        />
      )}
    </div>
  );
}
