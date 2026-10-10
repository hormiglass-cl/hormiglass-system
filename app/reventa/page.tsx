'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { esRutaReventa } from '../../lib/pipeline-ruta';
import { totalAbonado } from '../../lib/oportunidad-finanzas';
import {
  OrdenReventa,
  EstadoReventa,
  OportunidadVenta,
  Cotizacion,
  ChatMensaje,
} from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import {
  Truck,
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

type ReventaStageMeta = {
  id: EstadoReventa;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'accent';
};

const ETAPAS_REVENTA: ReventaStageMeta[] = [
  { id: 'coordinacion_proveedor', label: '1. Coordinación Proveedor', tone: 'info' },
  { id: 'confirmacion_stock', label: '2. Confirmación Stock', tone: 'info' },
  { id: 'listo_retiro', label: '3. Listo para Retiro', tone: 'warning' },
  { id: 'listo_despacho', label: '4. Listo para Despacho', tone: 'accent' },
  { id: 'entregado', label: '5. Entregado al Cliente', tone: 'success' },
  { id: 'postventa', label: '6. Postventa & Seguimiento', tone: 'neutral' },
];

const ESTADO_LEGADO_REVENTA: Record<string, EstadoReventa> = {
  reventa_coordinacion: 'coordinacion_proveedor',
  reventa_stock: 'confirmacion_stock',
  reventa_retiro: 'listo_retiro',
  reventa_despacho: 'listo_despacho',
  reventa_entregado: 'entregado',
  reventa_postventa: 'postventa',
  rev_coordinacion: 'coordinacion_proveedor',
  rev_stock: 'confirmacion_stock',
  rev_listo_retiro: 'listo_retiro',
  rev_listo_despacho: 'listo_despacho',
  rev_entregado: 'entregado',
  rev_postventa: 'postventa',
};

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export default function ReventaPage() {
  const { currentUser } = useAuth();
  const toast = useToast();
  const [ordenes, setOrdenes] = useState<(OrdenReventa & { oportunidad?: OportunidadVenta })[]>([]);
  const [, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [selectedOp, setSelectedOp] = useState<OportunidadVenta | null>(null);
  const [selectedOrden, setSelectedOrden] = useState<OrdenReventa | null>(null);

  const [openSections, setOpenSections] = useState({
    contacto: false,
    productos: false,
    finanzas: false,
    visita: false,
    reventa: false,
  });

  const [opActivities, setOpActivities] = useState<ChatMensaje[]>([]);
  const [newChatText, setNewChatText] = useState('');
  const [pdfPreviewCotizacion, setPdfPreviewCotizacion] = useState<Cotizacion | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadOrdenes = React.useCallback(async () => {
    try {
      setLoading(true);

      const [opRes, revRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('*, cliente:clientes(*), cotizaciones!cotizaciones_oportunidad_id_fkey(*)')
          .or(
            'rama_destino.eq.reventa,estado_pipeline.in.(entregada,reventa_coordinacion,reventa_stock,reventa_retiro,reventa_despacho,reventa_entregado,reventa_postventa,rev_coordinacion,rev_stock,rev_listo_retiro,rev_listo_despacho,rev_entregado,rev_postventa)'
          ),
        supabase.from('ordenes_reventa').select('*'),
      ]);

      if (opRes.error) throw new Error(`Oportunidades: ${opRes.error.message}`);
      if (revRes.error) throw new Error(`Órdenes: ${revRes.error.message}`);

      const revMap = new Map<string, OrdenReventa>();
      ((revRes.data || []) as OrdenReventa[]).forEach((r) => {
        if (r.oportunidad_id) revMap.set(r.oportunidad_id, r);
      });

      const combined: (OrdenReventa & { oportunidad?: OportunidadVenta })[] = [];

      ((opRes.data || []) as OportunidadVenta[]).forEach((op) => {
        const isReventa = esRutaReventa(op);
        if (!isReventa) return;

        const revRecord = revMap.get(op.id);
        combined.push({
          id: revRecord?.id || `rev-${op.id}`,
          oportunidad_id: op.id,
          codigo: op.codigo,
          titulo: op.titulo,
          cliente_id: op.cliente_id,
          cliente: op.cliente,
          estado:
            (revRecord?.estado as EstadoReventa) ||
            ESTADO_LEGADO_REVENTA[op.estado_pipeline] ||
            'coordinacion_proveedor',
          proveedor_nombre: revRecord?.proveedor_nombre || undefined,
          fecha_despacho: revRecord?.fecha_despacho || undefined,
          observaciones: revRecord?.observaciones || 'Vinculado desde Venta Aprobada.',
          notas_postventa: revRecord?.notas_postventa || undefined,
          oportunidad: op,
        });
      });

      setOrdenes(combined);
    } catch (err) {
      console.error('Error cargando órdenes de reventa:', err);
      toast({ message: 'Error al cargar órdenes de reventa', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(() => {
      if (!ignore) void loadOrdenes();
    }, 0);

    const channel1 = supabase
      .channel('realtime_rev_table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_reventa' }, () => {
        if (!ignore) void loadOrdenes();
      })
      .subscribe();

    const channel2 = supabase
      .channel('realtime_rev_ops')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => {
        if (!ignore) void loadOrdenes();
      })
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(timer);
      void supabase.removeChannel(channel1);
      void supabase.removeChannel(channel2);
    };
  }, [supabase, loadOrdenes]);

  const moveOrdenState = async (id: string, opId: string, targetEstado: EstadoReventa) => {
    setOrdenes((prev) =>
      prev.map((o) => (o.oportunidad_id === opId || o.id === id ? { ...o, estado: targetEstado } : o))
    );

    if (selectedOrden && (selectedOrden.oportunidad_id === opId || selectedOrden.id === id)) {
      setSelectedOrden({ ...selectedOrden, estado: targetEstado });
    }

    if (isUUID(opId)) {
      try {
        await supabase.from('ordenes_reventa').upsert(
          [
            {
              oportunidad_id: opId,
              codigo: selectedOrden?.codigo || 'OP-2790',
              titulo: selectedOrden?.titulo || 'Orden Reventa',
              cliente_id: selectedOrden?.cliente_id,
              estado: targetEstado,
            },
          ],
          { onConflict: 'oportunidad_id' }
        );
        toast({ message: 'Estado de reventa actualizado', tone: 'success' });
      } catch (err) {
        console.error('Error moviendo orden de reventa:', err);
        toast({ message: 'Error al actualizar estado', tone: 'danger' });
      }
    }
  };

  const handleOpenOrdenModal = async (ord: OrdenReventa & { oportunidad?: OportunidadVenta }) => {
    setSelectedOrden(ord);
    const op =
      ord.oportunidad ||
      ({
        id: ord.oportunidad_id,
        codigo: ord.codigo,
        titulo: ord.titulo,
        cliente_id: ord.cliente_id,
        cliente: ord.cliente,
        estado_pipeline: 'entregada',
      } as OportunidadVenta);

    setSelectedOp(op);
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      visita: false,
      reventa: false,
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

  const filteredOrdenes = ordenes.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.codigo?.toLowerCase().includes(q) ||
      o.titulo?.toLowerCase().includes(q) ||
      o.cliente?.nombre?.toLowerCase().includes(q) ||
      o.proveedor_nombre?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reventa y proveedores"
        description="Control logístico de compras con proveedores, stock y despachos vinculados a ventas."
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

            <Link href="/reventa/calendario">
              <Button variant="secondary" icon={Calendar}>
                Calendario de reventa
              </Button>
            </Link>
          </div>
        }
      />

      {/* Buscador */}
      <Panel className="p-3">
        <SearchField
          placeholder="Buscar por código, suministro, cliente o proveedor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Panel>

      {/* VISTA 1: LISTA AGRUPADA POR ESTADOS */}
      {activeTab === 'lista' ? (
        <div className="space-y-4">
          {ETAPAS_REVENTA.map((col) => {
            const isCollapsed = Boolean(collapsedSections[col.id]);
            const colOrdenes = filteredOrdenes.filter((o) => o.estado === col.id);

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
                      {colOrdenes.length}
                    </span>
                  </div>
                </button>

                {/* Filas */}
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {colOrdenes.map((ord) => {
                      const totalMonto = getOportunidadTotalValue(ord.oportunidad);

                      return (
                        <div
                          key={ord.id}
                          className="flex items-center justify-between gap-4 p-3 hover:bg-surface-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <CodeStamp>{ord.codigo}</CodeStamp>
                            <button
                              type="button"
                              onClick={() => void handleOpenOrdenModal(ord)}
                              className="min-w-0 flex-1 text-left group"
                            >
                              <span className="block truncate t-body font-semibold text-ink group-hover:text-accent transition-colors">
                                {ord.titulo}
                              </span>
                              <span className="block truncate t-micro text-ink-muted">
                                {ord.cliente?.nombre || 'Cliente sin asignar'}
                              </span>
                            </button>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            {ord.proveedor_nombre && (
                              <span className="t-micro text-ink-muted hidden md:inline">
                                {ord.proveedor_nombre}
                              </span>
                            )}
                            {ord.fecha_despacho && (
                              <span className="t-micro text-ink-muted t-num hidden sm:inline">
                                Despacho {ord.fecha_despacho}
                              </span>
                            )}
                            <span className="t-caption font-semibold text-ink t-num">
                              ${totalMonto.toLocaleString('es-CL')}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleOpenOrdenModal(ord)}
                              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                              aria-label={`Ver detalle de ${ord.codigo}`}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {colOrdenes.length === 0 && (
                      <div className="p-4 text-center t-micro text-ink-muted">
                        No hay órdenes de reventa en esta etapa.
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
          {ETAPAS_REVENTA.map((col) => {
            const colOrdenes = filteredOrdenes.filter((o) => o.estado === col.id);

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
                    {colOrdenes.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                  {colOrdenes.length === 0 ? (
                    <div className="h-32 flex items-center justify-center text-center t-micro text-ink-subtle border border-dashed border-border rounded-lg bg-surface/50">
                      Sin órdenes aquí
                    </div>
                  ) : (
                    colOrdenes.map((ord) => {
                      const op = ord.oportunidad;
                      const montoTotal = getOportunidadTotalValue(op);
                      const abonado = getOportunidadAbonadoValue(op);
                      const saldo = Math.max(0, montoTotal - abonado);

                      return (
                        <div
                          key={ord.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => void handleOpenOrdenModal(ord)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleOpenOrdenModal(ord);
                            }
                          }}
                          className="rounded-lg border border-border bg-surface p-3.5 space-y-2.5 transition-colors hover:border-accent/50 hover:bg-surface-muted/30 cursor-pointer group text-left"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <CodeStamp>{ord.codigo}</CodeStamp>
                            <StatusBadge tone={col.tone}>
                              {col.label.split('.')[1]?.trim() || col.label}
                            </StatusBadge>
                          </div>

                          <h4 className="t-body font-semibold text-ink leading-snug group-hover:text-accent transition-colors line-clamp-2">
                            {ord.titulo}
                          </h4>

                          <div className="flex items-center gap-1.5 t-micro text-ink-muted truncate">
                            <User size={13} className="shrink-0 text-ink-subtle" />
                            <span className="truncate">{ord.cliente?.nombre || 'Sin cliente'}</span>
                          </div>

                          <div className="pt-2 border-t border-border t-micro space-y-1 t-num">
                            <div className="flex items-center justify-between text-ink-muted">
                              <span>Despacho:</span>
                              <span>{ord.fecha_despacho || 'Por definir'}</span>
                            </div>
                            {ord.proveedor_nombre && (
                              <div className="flex items-center justify-between text-ink font-semibold">
                                <span>Proveedor:</span>
                                <span className="truncate max-w-[130px]">{ord.proveedor_nombre}</span>
                              </div>
                            )}
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
                              value={ord.estado}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                void moveOrdenState(
                                  ord.id,
                                  ord.oportunidad_id,
                                  e.target.value as EstadoReventa
                                )
                              }
                              className="rounded border border-border bg-surface px-1.5 py-0.5 t-micro font-medium text-ink outline-none focus:border-accent"
                            >
                              {ETAPAS_REVENTA.map((e) => (
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
                  {selectedOrden?.estado && (
                    <StatusBadge
                      tone={
                        ETAPAS_REVENTA.find((e) => e.id === selectedOrden.estado)?.tone || 'neutral'
                      }
                    >
                      {selectedOrden.estado.toUpperCase()}
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

                {/* Accordion 4: Datos de Logística & Reventa */}
                <Panel className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenSections({ ...openSections, reventa: !openSections.reventa })}
                    className="w-full p-3.5 bg-surface-muted hover:bg-surface transition-colors t-caption font-semibold text-ink flex items-center justify-between border-b border-border text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Truck size={15} className="text-accent" />
                      <span>4. Datos de Logística & Reventa</span>
                    </div>
                    {openSections.reventa ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {openSections.reventa && (
                    <div className="p-4 space-y-4 t-caption bg-surface">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Estado Logístico
                          </label>
                          <select
                            value={selectedOrden?.estado || 'coordinacion_proveedor'}
                            onChange={(e) => {
                              if (selectedOrden) {
                                void moveOrdenState(
                                  selectedOrden.id,
                                  selectedOrden.oportunidad_id,
                                  e.target.value as EstadoReventa
                                );
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body font-medium text-ink outline-none focus:border-accent"
                          >
                            {ETAPAS_REVENTA.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Proveedor Asignado
                          </label>
                          <input
                            type="text"
                            placeholder="Nombre del proveedor o distribuidor..."
                            value={selectedOrden?.proveedor_nombre || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedOrden) {
                                setSelectedOrden({ ...selectedOrden, proveedor_nombre: val });
                                if (isUUID(selectedOrden.oportunidad_id)) {
                                  await supabase.from('ordenes_reventa').upsert(
                                    [
                                      {
                                        oportunidad_id: selectedOrden.oportunidad_id,
                                        codigo: selectedOrden.codigo,
                                        titulo: selectedOrden.titulo,
                                        cliente_id: selectedOrden.cliente_id,
                                        proveedor_nombre: val,
                                      },
                                    ],
                                    { onConflict: 'oportunidad_id' }
                                  );
                                }
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 t-body text-ink outline-none focus:border-accent"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block t-caption font-semibold text-ink mb-1">
                            Fecha Despacho
                          </label>
                          <input
                            type="date"
                            value={selectedOrden?.fecha_despacho || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (selectedOrden) {
                                setSelectedOrden({ ...selectedOrden, fecha_despacho: val });
                                if (isUUID(selectedOrden.oportunidad_id)) {
                                  await supabase.from('ordenes_reventa').upsert(
                                    [
                                      {
                                        oportunidad_id: selectedOrden.oportunidad_id,
                                        codigo: selectedOrden.codigo,
                                        titulo: selectedOrden.titulo,
                                        cliente_id: selectedOrden.cliente_id,
                                        fecha_despacho: val,
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
                          Notas de Postventa & Seguimiento
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Añadir observaciones de entrega, garantías o postventa..."
                          value={selectedOrden?.notas_postventa || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (selectedOrden) {
                              setSelectedOrden({ ...selectedOrden, notas_postventa: val });
                              if (isUUID(selectedOrden.oportunidad_id)) {
                                await supabase.from('ordenes_reventa').upsert(
                                  [
                                    {
                                      oportunidad_id: selectedOrden.oportunidad_id,
                                      codigo: selectedOrden.codigo,
                                      titulo: selectedOrden.titulo,
                                      cliente_id: selectedOrden.cliente_id,
                                      notas_postventa: val,
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
