'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { createClient } from '../../lib/supabase/client';
import { useClienteOpciones } from '../../lib/clientes-opciones';
import { SearchSelect } from '../../components/ui/SearchSelect';
import {
  Cliente,
  Cotizacion,
  EstadoCotizacion,
  EstadoPipeline,
  OportunidadVenta,
  Usuario,
  ChatMensaje,
  VisitaTerreno,
  EventoProduccionLogistica,
  OrdenCompra,
  OrdenCompraAsignacion,
  ProduccionDiaria,
  CotizacionItem,
  AntecedenteDocumento,
  TipoAntecedenteDocumento,
  ContextoEventoProduccionLogistica,
  EstadoEventoProduccionLogistica,
  TipoEventoProduccionLogistica,
  ROL_NOMBRE,
  MargenPorNV,
} from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { OrdenCompraModal } from '../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../components/OrdenCompraPdfPreviewModal';
import { logSistema } from '../../lib/logger';
import { playNotificationSound } from '../../lib/audio';
import { cotizacionVigente, totalAbonado, totalComercial } from '../../lib/oportunidad-finanzas';
import {
  Calendar,
  FileText,
  Plus,
  Eye,
  FilePlus,
  User,
  Check,
  Edit,
  Paperclip,
  Send,
  MessageSquare,
  DollarSign,
  Layers,
  List,
  Kanban,
  AtSign,
  Search,
  Trash2,
  AlertTriangle,
  X,
  Reply,
  MoreHorizontal,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutList,
  ChevronDown,
  Factory,
  Download,
  ShoppingCart,
  Flag,
  Tag,
  Compass,
  Disc,
  AlarmClock,
  Ban,
  RotateCcw,
} from 'lucide-react';

import { useRouter, useSearchParams } from 'next/navigation';
import { CotizacionModal } from '../../components/CotizacionModal';
import { mensajeError } from '../../lib/errores';
import {
  MOTIVOS_PERDIDA,
  esOportunidadPerdida,
  puedeMarcarsePerdida,
  sugerirPerdidaPorRechazo,
  motivoPerdidaLabel,
} from '../../lib/oportunidad-perdida';
import { CodeStamp, StatusBadge, Button, Dialog, Field, TextInput, Select } from '../../components/ui/crm';
import { KanbanCard } from '../../components/ventas/KanbanCard';
import { CapturedDataPending, OpportunityActivity } from '../../components/whatsapp/OpportunityActivity';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { useBreadcrumb } from '../../lib/context/BreadcrumbContext';
import { useAjuste } from '../../lib/ajustes';
import { swrCache } from '../../lib/cache/swr-cache';
import { DateInput, DateTimeInput } from '../../components/ui/FormControls';

// Convierte el texto de un recordatorio en pares [etiqueta, valor].
// Soporta el formato actual (una línea por campo) y el anterior ("⏰ ... · fecha · Resp: ...").
function parseSeguimientoContenido(contenido: string): [string, string][] {
  const limpio = contenido.replace(/^⏰\s*/, '');
  const partes = limpio.includes('\n') ? limpio.split('\n') : limpio.split(' · ');
  return partes
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte): [string, string] => {
      const idx = parte.indexOf(': ');
      if (idx === -1) return ['Fecha', parte];
      const label = parte.slice(0, idx);
      return [label === 'Resp' ? 'Responsable' : label, parte.slice(idx + 2)];
    });
}

function isUUID(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}


/* Valores impuros usados solo dentro de manejadores de eventos (nunca durante el render). */
const nowMs = () => Date.now();
const randomSuffix = () => Math.random().toString(36).slice(2, 6);

/** Cambio recibido por Supabase Realtime (solo los campos que usa esta pantalla). */
type RealtimeChange<T> = { eventType: string; new: T; old: Partial<T> };
type ActividadRow = {
  id: string; oportunidad_id: string; usuario_id: string | null; usuario_nombre: string | null;
  contenido: string; created_at: string; tipo: string | null;
};
type AntecedenteRow = {
  id: string; oportunidad_id: string; nombre: string; tipo: string | null; public_url: string | null;
  bucket_id: string | null; storage_path: string; mime_type: string | null; size_bytes: number | null;
  created_at: string; updated_at: string; subido_por_nombre: string | null; subido_por_id: string | null;
  eliminado: boolean | null; eliminado_en: string | null; eliminado_por: string | null;
};

export default function PipelineVentasPage() {
  const { currentUser, usersList } = useAuth();
  const searchParams = useSearchParams();
  const closingOpRef = useRef(false);
  const router = useRouter();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [opEventosProdLog, setOpEventosProdLog] = useState<EventoProduccionLogistica[]>([]);
  const [opVisitasList, setOpVisitasList] = useState<VisitaTerreno[]>([]);
  const { setCustomTitle, setOnBack } = useBreadcrumb();
  const origenes = useAjuste('origenes').valor.lista;
  const etapasNombres = useAjuste('pipeline_etapas').valor.nombres;
  const tiposVenta = useAjuste('tipos_venta').valor.lista;
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>(() => swrCache.get('ventas:oportunidades') || []);
  const [deliveryAccreditation, setDeliveryAccreditation] = useState<Record<string, boolean>>(() => swrCache.get('ventas:accreditation') || {});
  const [allCotizaciones, setAllCotizaciones] = useState<Cotizacion[]>(() => swrCache.get('ventas:allCotizaciones') || []);

  // Una versión nueva reemplaza a la anterior en los importes comerciales.
  const getOportunidadTotalValue = (op: OportunidadVenta): number => {
    return totalComercial(op, allCotizaciones);
  };

  // Helper para obtener el monto abonado de una oportunidad
  const getOportunidadAbonadoValue = (op: OportunidadVenta): number => {
    return totalAbonado(op);
  };

  // Helper para obtener la cotización activa principal para una oportunidad
  const getActiveQuote = (op: OportunidadVenta): Cotizacion | undefined => {
    return cotizacionVigente(op, allCotizaciones);
  };
  const [usuariosApp, setUsuariosApp] = useState<Usuario[]>([]);
  const [personalTerrenoList, setPersonalTerrenoList] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !swrCache.has('ventas:oportunidades'));

  // Advanced Filters for List & Board View
  const [viewType, setViewType] = useState<'lista' | 'tablero'>('tablero');
  // Lost opportunities live outside the active pipeline, under their own view.
  const [vistaPerdidas, setVistaPerdidas] = useState<'activas' | 'perdidas'>('activas');
  const [opToMarkLost, setOpToMarkLost] = useState<OportunidadVenta | null>(null);
  const [perdidaMotivo, setPerdidaMotivo] = useState('');
  const [perdidaDetalle, setPerdidaDetalle] = useState('');
  const [savingPerdida, setSavingPerdida] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterEstado] = useState<string>('todos');
  const [filterRama] = useState<string>(() => searchParams.get('rama') || 'todos');
  const [filterTipoVenta] = useState<string>('todos');
  const [filterPrioridad] = useState<string>('todos');
  const [filterAsignado] = useState<string>('todos');

  // List View Section Collapsing State
  const [stageMenuPos, setStageMenuPos] = useState<{ opId: string; top: number; left: number } | null>(null);
  const [statusSearchQuery, setStatusSearchQuery] = useState('');

  // Deletion Modal State for Oportunidad
  const [opToDelete, setOpToDelete] = useState<OportunidadVenta | null>(null);
  const [opMenuOpen, setOpMenuOpen] = useState(false);
  const [deleteOpError, setDeleteOpError] = useState('');
  const [deletingOp, setDeletingOp] = useState(false);
  const [cotToDeleteInModal, setCotToDeleteInModal] = useState<Cotizacion | null>(null);

  // Antecedentes Documentación State
  const [nuevoAntecedenteFile, setNuevoAntecedenteFile] = useState<File | null>(null);
  const [nuevoAntecedenteNombre, setNuevoAntecedenteNombre] = useState<string>('');
  const [nuevoAntecedenteTipo, setNuevoAntecedenteTipo] = useState<TipoAntecedenteDocumento>('contrato');
  const [antecedenteUploading, setAntecedenteUploading] = useState(false);
  const [antecedenteErrorMsg, setAntecedenteErrorMsg] = useState('');
  const [opAntecedentesList, setOpAntecedentesList] = useState<AntecedenteDocumento[]>([]);

  // Reclamo Mode in Chat
  const [isReclamoMode, setIsReclamoMode] = useState(false);

  // Seguimiento comercial (recordatorio) desde el compositor de Actividad
  const [isSeguimientoMode, setIsSeguimientoMode] = useState(false);
  const [seguimientoDraft, setSeguimientoDraft] = useState({ resultado: '', accion: '', fecha: '', responsable: '' });
  const [seguimientoSaving, setSeguimientoSaving] = useState(false);

  // Órdenes de Compra vinculadas a la Oportunidad
  const [opOrdenesCompra, setOpOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [loadingOpOrdenes, setLoadingOpOrdenes] = useState(false);
  const [showCreateOcModal, setShowCreateOcModal] = useState(false);
  const [pdfPreviewOc, setPdfPreviewOc] = useState<OrdenCompra | null>(null);

  // Matriz de Costos y Margen por NV (Fase 3)
  const [margenOp, setMargenOp] = useState<MargenPorNV | null>(null);
  const [, setLoadingMargenOp] = useState(false);

  // Bitácora de Producción Diaria y Stock de la Oportunidad
  const [opProduccionDiaria, setOpProduccionDiaria] = useState<ProduccionDiaria[]>([]);
  const [loadingProduccionDiaria, setLoadingProduccionDiaria] = useState(false);
  const [cotizacionItemsOp, setCotizacionItemsOp] = useState<CotizacionItem[]>([]);
  const [showProdModal, setShowProdModal] = useState(false);
  const [newProdItemId, setNewProdItemId] = useState('');
  const [prodSaving, setProdSaving] = useState(false);
  const [stockCatalogo, setStockCatalogo] = useState<Record<string, number>>({});
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showAntecedenteModal, setShowAntecedenteModal] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem('hg-op-rail-collapsed') === '1'; } catch { return false; }
  });
  const toggleRail = () => setRailCollapsed((v) => {
    const next = !v;
    try { window.localStorage.setItem('hg-op-rail-collapsed', next ? '1' : '0'); } catch { /* sin almacenamiento */ }
    return next;
  });
  const [newProdCantidad, setNewProdCantidad] = useState<number>(0);
  const [newProdFecha, setNewProdFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [newProdResponsableId, setNewProdResponsableId] = useState('');
  const [newProdObservaciones, setNewProdObservaciones] = useState('');

  // Modal Cotización Unificado State
  const [showUnifiedCotModal, setShowUnifiedCotModal] = useState(false);

  // Drag & Drop State
  const [draggedOpId, setDraggedOpId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<EstadoPipeline | null>(null);

  // Toast / Mention Notifications
  const [toastAlert, setToastAlert] = useState<{ id: string; message: string; user: string } | null>(null);

  const activitiesCacheRef = useRef<Record<string, ChatMensaje[]>>({});
  const visitasCacheRef = useRef<Record<string, VisitaTerreno[]>>({});
  const eventosProdLogCacheRef = useRef<Record<string, EventoProduccionLogistica[]>>({});
  const ordenesCompraCacheRef = useRef<Record<string, OrdenCompra[]>>({});
  const produccionDiariaCacheRef = useRef<Record<string, ProduccionDiaria[]>>({});
  const cotizacionItemsCacheRef = useRef<Record<string, CotizacionItem[]>>({});
  const antecedentesCacheRef = useRef<Record<string, AntecedenteDocumento[]>>({});

  // Modal Detalle de Oportunidad
  const [selectedOp, setSelectedOp] = useState<OportunidadVenta | null>(null);
  const [opDetailTab, setOpDetailTab] = useState<'resumen' | 'cotizaciones' | 'abastecimiento' | 'operacion'>('resumen');
  const [showNewOpModal, setShowNewOpModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Internal Chat / Actividades Input State
  const [chatInput, setChatInput] = useState('');
  const [stagedChatFiles, setStagedChatFiles] = useState<File[]>([]);
  const [isUploadingChatFiles, setIsUploadingChatFiles] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const mentionRef = React.useRef<HTMLDivElement | null>(null);

  // Product Category Search & Dropdown State
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const productRef = React.useRef<HTMLDivElement | null>(null);

  // Click outside listener for mention menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (mentionRef.current && !mentionRef.current.contains(event.target as Node)) {
        setMentionMenuOpen(false);
      }
    }
    if (mentionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mentionMenuOpen]);

  // Click outside listener for product search dropdown
  useEffect(() => {
    function handleClickOutsideProduct(event: MouseEvent) {
      if (productRef.current && !productRef.current.contains(event.target as Node)) {
        setProductDropdownOpen(false);
      }
    }
    if (productDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutsideProduct);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideProduct);
    };
  }, [productDropdownOpen]);


  // Activity Search & Filter State
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [showActivitySearch] = useState(false);

  // Helper to deduplicate chat & activity messages across all sources and real-time updates
  const mergeAndDeduplicateMessages = (messages: ChatMensaje[]): ChatMensaje[] => {
    const result: ChatMensaje[] = [];

    for (const msg of messages) {
      if (!msg || !msg.contenido) continue;

      const isDuplicate = result.some((existing) => {
        // 1. Direct ID match
        if (msg.id && existing.id && msg.id === existing.id) return true;

        // 2. Content + User + Type + Close Timestamp match (within 60 seconds)
        const sameContent = (existing.contenido || '').trim() === (msg.contenido || '').trim();
        const sameUser = (existing.usuario_nombre || '').toLowerCase() === (msg.usuario_nombre || '').toLowerCase();
        const sameType = existing.tipo === msg.tipo;

        const timeA = new Date(existing.created_at).getTime();
        const timeB = new Date(msg.created_at).getTime();
        const timeDiff = Math.abs(timeA - timeB);

        const isTimeClose = isNaN(timeDiff) || timeDiff < 60000;

        return sameContent && sameUser && sameType && isTimeClose;
      });

      if (!isDuplicate) {
        result.push(msg);
      }
    }

    return result.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  // Helper to render message content with @mentions and interactive attachment badges
  const renderMessageContentWithMentions = (content?: string) => {
    if (!content) return null;

    const lines = content.split('\n');
    return (
      <div className="space-y-1.5">
        {lines.map((line, lineIdx) => {
          // Check if line is an attachment link: 📎 [FileName](URL)
          const attachmentMatch = line.match(/^📎\s*\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
          if (attachmentMatch) {
            const [, fileName, fileUrl] = attachmentMatch;
            return (
              <a
                key={lineIdx}
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface-muted)] hover:bg-[var(--color-surface-muted)] border border-line hover:border-accent/50 rounded-lg text-xs text-white transition my-1 group shadow-sm"
              >
                <Paperclip className="w-3.5 h-3.5 text-accent-ink group-hover:scale-110 transition-transform shrink-0" />
                <span className="font-semibold underline decoration-gray-600 group-hover:decoration-white truncate max-w-xs">{fileName}</span>
                <span className="t-micro text-ink-subtle font-mono flex items-center gap-0.5 shrink-0">
                  Descargar <Download className="w-3 h-3 ml-0.5" />
                </span>
              </a>
            );
          }

          // Otherwise split by mentions
          const parts = line.split(/(@[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)/g);
          return (
            <p key={lineIdx} className="leading-relaxed">
              {parts.map((part, idx) => {
                if (part.startsWith('@')) {
                  return (
                    <span
                      key={idx}
                      className="text-accent-ink font-semibold bg-accent/15 px-1.5 py-0.5 rounded-md border border-accent/30 inline-block mx-0.5"
                    >
                      {part}
                    </span>
                  );
                }
                return part;
              })}
            </p>
          );
        })}
      </div>
    );
  };

  // Helper to load latest activities directly from Supabase for an opportunity
  const loadLatestActivities = async (opId: string) => {
    if (!isUUID(opId)) return;
    const cached = activitiesCacheRef.current[opId];
    if (cached) {
      setSelectedOp((prev) => (prev && prev.id === opId ? { ...prev, chat_interno: cached } : prev));
      return;
    }

    try {
      const [actRes, opDataRes] = await Promise.all([
        supabase
          .from('actividades_op')
          .select('*')
          .eq('oportunidad_id', opId)
          .order('created_at', { ascending: true }),
        supabase
          .from('oportunidades')
          .select('chat_interno')
          .eq('id', opId)
          .single(),
      ]);

      const jsonChat: ChatMensaje[] = Array.isArray(opDataRes.data?.chat_interno)
        ? opDataRes.data.chat_interno
        : [];

      const tableChat: ChatMensaje[] = (actRes.data as ActividadRow[] | null || []).map((a) => ({
        id: a.id || `db-${a.created_at}`,
        usuario_id: a.usuario_id || 'sistema',
        usuario_nombre: a.usuario_nombre || 'Sistema',
        contenido: a.contenido,
        created_at: a.created_at,
        tipo: a.tipo || 'actualizacion',
      }));

      const merged = mergeAndDeduplicateMessages([...jsonChat, ...tableChat]);
      activitiesCacheRef.current[opId] = merged;

      setSelectedOp((prev) => (prev && prev.id === opId ? { ...prev, chat_interno: merged } : prev));
      setOportunidades((prev) =>
        prev.map((o) => (o.id === opId ? { ...o, chat_interno: merged } : o))
      );
    } catch (err) {
      console.error('Error loading latest activities from Supabase:', err);
    }
  };

  // Helper to load visits for an opportunity
  const loadVisitasOportunidad = async (op: OportunidadVenta) => {
    const cached = visitasCacheRef.current[op.id];
    if (cached) {
      setOpVisitasList(cached);
      return;
    }

    try {
      const { data } = await supabase
        .from('visitas_terreno')
        .select('*, tecnico:usuarios!tecnico_id(*)')
        .eq('oportunidad_id', op.id)
        .order('fecha_visita_terreno', { ascending: true });

      const list = (data || []) as VisitaTerreno[];
      visitasCacheRef.current[op.id] = list;
      setOpVisitasList(list);
    } catch (err) {
      console.error('Error loading visitas:', err);
      setOpVisitasList([]);
    }
  };

  const loadEventosProduccionLogistica = async (opId: string) => {
    if (!isUUID(opId)) {
      setOpEventosProdLog([]);
      return;
    }

    const cached = eventosProdLogCacheRef.current[opId];
    if (cached) {
      setOpEventosProdLog(cached);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('eventos_produccion_logistica')
        .select('*, responsable:usuarios!responsable_id(*)')
        .eq('oportunidad_id', opId)
        .order('fecha_evento', { ascending: true })
        .order('hora_evento', { ascending: true });

      if (error) throw error;
      const list = (data || []) as EventoProduccionLogistica[];
      eventosProdLogCacheRef.current[opId] = list;
      setOpEventosProdLog(list);
    } catch (err) {
      console.error('Error loading production/logistics events:', err);
      setOpEventosProdLog([]);
    }
  };

  const loadOrdenesCompraOportunidad = async (opId: string) => {
    if (!isUUID(opId)) {
      setOpOrdenesCompra([]);
      return;
    }

    const cached = ordenesCompraCacheRef.current[opId];
    if (cached) {
      setOpOrdenesCompra(cached);
      return;
    }

    setLoadingOpOrdenes(true);
    try {
      const { data: assignments } = await supabase
        .from('orden_compra_asignaciones')
        .select('*')
        .eq('oportunidad_id', opId);
      const assignedIds = [...new Set(((assignments || []) as OrdenCompraAsignacion[]).map((a) => a.orden_compra_id))];
      const { data, error } = await supabase
        .from('ordenes_compra')
        .select('*, proveedor:proveedores(*), items:orden_compra_items(*)')
        .order('created_at', { ascending: false });

      if (error) throw new Error(mensajeError(error));
      const list = ((data || []) as OrdenCompra[])
        .filter((oc) => oc.oportunidad_id === opId || assignedIds.includes(oc.id))
        .map((oc) => ({
          ...oc,
          asignaciones: ((assignments || []) as OrdenCompraAsignacion[])
            .filter((a) => a.orden_compra_id === oc.id),
        }));
      ordenesCompraCacheRef.current[opId] = list;
      setOpOrdenesCompra(list);
    } catch (err) {
      console.error('Error loading ordenes de compra:', err);
      setOpOrdenesCompra([]);
    } finally {
      setLoadingOpOrdenes(false);
    }
  };

  const loadMargenOportunidad = async (opId: string) => {
    if (!isUUID(opId)) {
      setMargenOp(null);
      return;
    }
    setLoadingMargenOp(true);
    try {
      const { data, error } = await supabase
        .from('v_margen_por_nv')
        .select('*')
        .eq('oportunidad_id', opId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching margen de oportunidad:', error);
        setMargenOp(null);
      } else {
        setMargenOp((data as MargenPorNV) || null);
      }
    } catch (err) {
      console.error('Error loading margen:', err);
      setMargenOp(null);
    } finally {
      setLoadingMargenOp(false);
    }
  };

  const mapAntecedenteRecord = (record: AntecedenteRow): AntecedenteDocumento => ({
    id: record.id,
    oportunidad_id: record.oportunidad_id,
    nombre: record.nombre,
    tipo: (record.tipo || 'otro') as TipoAntecedenteDocumento,
    url: record.public_url || '#',
    bucket_id: record.bucket_id || 'documentos',
    storage_path: record.storage_path,
    mime_type: record.mime_type || null,
    size_bytes: record.size_bytes ?? null,
    fecha_iso: record.created_at || new Date().toISOString(),
    subido_por: record.subido_por_nombre || 'Usuario',
    subido_por_id: record.subido_por_id || null,
    eliminado: record.eliminado || false,
    eliminado_en: record.eliminado_en || null,
    eliminado_por: record.eliminado_por || null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });

  const loadAntecedentesOportunidad = async (op: OportunidadVenta) => {
    if (!isUUID(op.id)) {
      const legacyDocs = Array.isArray(op.antecedentes) ? op.antecedentes : [];
      setOpAntecedentesList(legacyDocs);
    }
  };

  // Helper to open opportunity and update URL
  const handleOpenOportunidad = (op: OportunidadVenta, initialTab: 'resumen' | 'cotizaciones' | 'abastecimiento' | 'operacion' = 'resumen') => {
    setIsSeguimientoMode(false);
    closingOpRef.current = false;
    setOpDetailTab(initialTab);
    setSelectedOp(op);
    setEditTitleValue(op.titulo);
    loadLatestActivities(op.id);
    loadVisitasOportunidad(op);
    loadEventosProduccionLogistica(op.id);
    loadOrdenesCompraOportunidad(op.id);
    loadMargenOportunidad(op.id);
    loadAntecedentesOportunidad(op);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('oportunidad', op.id);
      window.history.pushState(null, '', url.pathname + url.search);
    }
  };

  const handleGuardarVisita = async () => {
    if (!selectedOp || !newVisitaFecha || !newVisitaTecnico) return;
    const responsableNombre = getPersonalTerreno(newVisitaTecnico)?.nombre || '';
    const payload = {
      oportunidad_id: selectedOp.id,
      tecnico_visita: responsableNombre,
      tecnico_id: newVisitaTecnico,
      fecha_visita_terreno: newVisitaFecha,
      hora_visita_terreno: newVisitaHora,
      estado_visita: 'programada',
      observaciones_visita: newVisitaNotas,
    };
    try {
      const { data, error } = await supabase
        .from('visitas_terreno')
        .insert([payload])
        .select('*, tecnico:usuarios!tecnico_id(*)')
        .single();
      if (error || !data) throw error || new Error('Sin datos');
      const nueva = data as VisitaTerreno;
      visitasCacheRef.current[selectedOp.id] = [...(visitasCacheRef.current[selectedOp.id] || opVisitasList), nueva];
      setOpVisitasList((prev) => [...prev, nueva]);
      updateOportunidadField(selectedOp.id, 'requiere_visita_terreno', true);
      setShowAddVisitaForm(false);
      setNewVisitaNotas('');
      setNewVisitaFecha('');
      await addOportunidadActividad(selectedOp.id, `Visita a terreno programada para ${newVisitaFecha} a las ${newVisitaHora} hrs con ${responsableNombre}.`);
      toast({ message: 'Visita a terreno agendada', tone: 'success' });
    } catch (err) {
      console.error('Error inserting visita:', err);
      toast({ message: 'No se pudo agendar la visita', tone: 'danger' });
    }
  };

  // Helper to close opportunity and clear URL parameter
  const handleCloseOportunidad = () => {
    closingOpRef.current = true;
    setSelectedOp(null);
    setOpDetailTab('resumen');
    setMargenOp(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('oportunidad');
      url.searchParams.delete('opId');
      const newSearch = url.searchParams.toString();
      // router.replace actualiza useSearchParams; con pushState quedaba el valor viejo y la oportunidad se reabría sola.
      router.replace(url.pathname + (newSearch ? '?' + newSearch : ''), { scroll: false });
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const targetOpId = new URLSearchParams(window.location.search).get('oportunidad');
      if (targetOpId) {
        const found = oportunidades.find((o) => o.id === targetOpId);
        if (found) {
          handleOpenOportunidad(found);
        }
      } else {
        closingOpRef.current = false;
        setSelectedOp(null);
        setOpDetailTab('resumen');
        setMargenOp(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- el handler se recrea en cada render; solo reaccionan los datos indicados
  }, [oportunidades]);

  useEffect(() => {
    if (selectedOp) {
      setCustomTitle(selectedOp.titulo || selectedOp.codigo || 'Oportunidad');
      setOnBack(() => () => {
        if (opDetailTab !== 'resumen') {
          setOpDetailTab('resumen');
        } else {
          handleCloseOportunidad();
        }
      });
    } else {
      setCustomTitle(null);
      setOnBack(null);
    }
    return () => {
      setCustomTitle(null);
      setOnBack(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- el handler se recrea en cada render; solo reaccionan los datos indicados
  }, [selectedOp, opDetailTab, setCustomTitle, setOnBack]);

  useEffect(() => {
    const targetOpId = searchParams.get('oportunidad');
    if (!targetOpId) closingOpRef.current = false;
    if (closingOpRef.current) return;
    if (!targetOpId && selectedOp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la oportunidad abierta con ?oportunidad= de la URL
      setSelectedOp(null);
      setOpDetailTab('resumen');
      setMargenOp(null);
    } else if (targetOpId && (!selectedOp || selectedOp.id !== targetOpId) && oportunidades.length > 0) {
      const found = oportunidades.find((o) => o.id === targetOpId);
      if (found) {
        const tabParam = searchParams.get('tab');
        const validTabs = ['resumen', 'cotizaciones', 'abastecimiento', 'operacion'] as const;
        const initialTab = validTabs.find((t) => t === tabParam) ?? 'resumen';
        handleOpenOportunidad(found, initialTab);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sincroniza con la URL solo cuando cambian los parámetros
  }, [searchParams, selectedOp, oportunidades]);

  // Cotización seleccionada para previsualización modal
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);

  // Form para Nueva Oportunidad
  const [nuevoTitulo, setNuevoTitulo] = useState('');
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const clientesSel = useClienteOpciones(nuevoClienteId, (c) => c.nombre);
  const [nuevaFechaLimite, setNuevaFechaLimite] = useState('');
  const [nuevoTipoVenta, setNuevoTipoVenta] = useState('Instalación');
  const [nuevoOrigen, setNuevoOrigen] = useState('');
  const [nuevaModalidadRequerimiento, setNuevaModalidadRequerimiento] = useState<'solo_material' | 'instalacion'>('instalacion');

  // Visitas a Terreno Múltiples State
  const [showAddVisitaForm, setShowAddVisitaForm] = useState(false);
  const [newVisitaTecnico, setNewVisitaTecnico] = useState<string>('');
  const [newVisitaFecha, setNewVisitaFecha] = useState<string>('');
  const [newVisitaHora, setNewVisitaHora] = useState<string>('09:00');
  const [newVisitaNotas, setNewVisitaNotas] = useState<string>('');

  // Editing Visita State

  // Eventos múltiples para calendario Producción y Logística
  const [showAddProdLogEventForm, setShowAddProdLogEventForm] = useState(false);
  const [newProdLogTipo, setNewProdLogTipo] = useState<TipoEventoProduccionLogistica>('produccion');
  const [newProdLogTitulo, setNewProdLogTitulo] = useState('');
  const [newProdLogFecha, setNewProdLogFecha] = useState('');
  const [newProdLogHora, setNewProdLogHora] = useState('09:00');
  const [newProdLogResponsableId, setNewProdLogResponsableId] = useState('');
  const [newProdLogEstado, setNewProdLogEstado] = useState<EstadoEventoProduccionLogistica>('por_hacer');
  const [newProdLogNotas, setNewProdLogNotas] = useState('');
  const [, setNewProdLogContexto] = useState<ContextoEventoProduccionLogistica>('produccion_logistica');
  const [editingProdLogEventId, setEditingProdLogEventId] = useState<string | null>(null);

  // Ref y Estado para el feed de actividad con scroll
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const handleActivityScroll = () => {
    if (!activityScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = activityScrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;
    setShowScrollBottomBtn(!isNearBottom);
  };

  const scrollToBottomActivity = () => {
    if (activityScrollRef.current) {
      activityScrollRef.current.scrollTo({
        top: activityScrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollBottomBtn(false);
    }
  };

  useEffect(() => {
    if (selectedOp) {
      const timer = setTimeout(() => {
        setShowScrollBottomBtn(false);
        if (activityScrollRef.current) {
          activityScrollRef.current.scrollTop = activityScrollRef.current.scrollHeight;
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sincroniza con la URL solo cuando cambian los parámetros
  }, [selectedOp?.id, selectedOp?.chat_interno?.length]);

  useEffect(() => {
    let ignore = false;
    async function fetchPipelineData() {
      try {
        const [opRes, usrRes, cotRes, actRes] = await Promise.all([
          supabase
            .from('oportunidades')
            .select('*, cliente:clientes(*)')
            .order('created_at', { ascending: false }),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true }),
          supabase.from('cotizaciones').select('*, cliente:clientes(*), items:cotizacion_items(*)'),
          supabase.from('actividades_op').select('*').order('created_at', { ascending: true }),
        ]);

        if (!ignore) {
          const loadedUsers = (usrRes.data || usersList || []) as Usuario[];
          setUsuariosApp(loadedUsers);
          setPersonalTerrenoList(loadedUsers);

          let mergedOps: OportunidadVenta[] = [];
          if (opRes.data) {
            const rawOps = opRes.data as OportunidadVenta[];
            const closedIds = rawOps.filter((op) => ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline)).map((op) => op.id);
            const { data: accreditationRows } = closedIds.length
              ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
              : { data: [] };
            const accreditationMap = Object.fromEntries(((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [row.venta_id, row.acreditada]));
            setDeliveryAccreditation(accreditationMap);
            swrCache.set('ventas:accreditation', accreditationMap);
            const allQuotes = (cotRes.data || []) as Cotizacion[];
            const allDbAct = (actRes.data || []) as ActividadRow[];

            mergedOps = rawOps.map((op) => {
              const jsonChat: ChatMensaje[] = Array.isArray(op.chat_interno) ? op.chat_interno : [];
              const tableChat = allDbAct
                .filter((a) => a.oportunidad_id === op.id)
                .map((a) => ({
                  id: a.id || `db-${a.created_at}`,
                  usuario_id: a.usuario_id || 'sistema',
                  usuario_nombre: a.usuario_nombre || 'Sistema',
                  contenido: a.contenido,
                  created_at: a.created_at,
                  tipo: a.tipo || 'actualizacion',
                }));

              const mergedChat = mergeAndDeduplicateMessages([...jsonChat, ...tableChat]);
              activitiesCacheRef.current[op.id] = mergedChat;

              return {
                ...op,
                chat_interno: mergedChat,
                cotizaciones: allQuotes.filter((c) => c.oportunidad_id === op.id),
              };
            });

            setOportunidades(mergedOps);
            swrCache.set('ventas:oportunidades', mergedOps);
          } else {
            setOportunidades([]);
            setDeliveryAccreditation({});
          }

          if (cotRes.data) {
            const allQuotes = cotRes.data as Cotizacion[];
            setAllCotizaciones(allQuotes);
            swrCache.set('ventas:allCotizaciones', allQuotes);
          } else {
            setAllCotizaciones([]);
          }

          // Auto open opportunity modal if searchParam ?oportunidad=id exists
          const targetOpId = searchParams.get('oportunidad');
          if (targetOpId && opRes.data) {
            const found = mergedOps.find((o) => o.id === targetOpId);
            if (found) {
              setSelectedOp(found);
              setEditTitleValue(found.titulo);
              loadLatestActivities(found.id);
              loadVisitasOportunidad(found);
              loadEventosProduccionLogistica(found.id);
              loadOrdenesCompraOportunidad(found.id);
              loadMargenOportunidad(found.id);
              loadAntecedentesOportunidad(found);
            }
          }

          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching oportunidades from Supabase:', err);
        if (!ignore) {
          setOportunidades([]);
          setDeliveryAccreditation({});
          setUsuariosApp([]);
          setAllCotizaciones([]);
          setLoading(false);
        }
      }
    }

    fetchPipelineData();

    // Configurar canal de suscripción en tiempo real con Supabase Realtime
    const realtimeChannel = supabase
      .channel('realtime_sales_hub')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'actividades_op',
        },
        (payload: RealtimeChange<ActividadRow>) => {
          const newAct = payload.new;
          if (!newAct) return;

          const newMsg: ChatMensaje = {
            id: newAct.id,
            usuario_id: newAct.usuario_id || 'sistema',
            usuario_nombre: newAct.usuario_nombre || 'Sistema',
            contenido: newAct.contenido,
            created_at: newAct.created_at,
            tipo: newAct.tipo || 'actualizacion',
          };

          setSelectedOp((prev) => {
            if (!prev || prev.id !== newAct.oportunidad_id) return prev;
            const current = prev.chat_interno || [];
            return { ...prev, chat_interno: mergeAndDeduplicateMessages([...current, newMsg]) };
          });

          setOportunidades((prevOps) =>
            prevOps.map((op) => {
              if (op.id !== newAct.oportunidad_id) return op;
              const current = op.chat_interno || [];
              return { ...op, chat_interno: mergeAndDeduplicateMessages([...current, newMsg]) };
            })
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'oportunidades',
        },
        (payload: RealtimeChange<Partial<OportunidadVenta> & { id: string }>) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedOp = payload.new;
            setOportunidades((prevOps) =>
              prevOps.map((op) =>
                op.id === updatedOp.id
                  ? { ...op, ...updatedOp, chat_interno: op.chat_interno }
                  : op
              )
            );
            setSelectedOp((prev) =>
              prev && prev.id === updatedOp.id
                ? { ...prev, ...updatedOp, chat_interno: prev.chat_interno }
                : prev
            );
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            fetchPipelineData();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visitas_terreno',
        },
        () => {
          setSelectedOp((prev) => {
            if (prev) {
              delete visitasCacheRef.current[prev.id];
              loadVisitasOportunidad(prev);
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'oportunidad_antecedentes',
        },
        (payload: RealtimeChange<{ oportunidad_id: string }>) => {
          const opId = payload.new?.oportunidad_id || payload.old?.oportunidad_id;
          if (opId) delete antecedentesCacheRef.current[opId];
          setSelectedOp((prev) => {
            if (prev && (!opId || prev.id === opId)) loadAntecedentesOportunidad(prev);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clientes',
        },
        (payload: RealtimeChange<Cliente>) => {
          // Solo se recarga si se elimina un cliente; altas y ediciones no afectan al pipeline.
          if (!payload.new) fetchPipelineData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
        },
        (payload: RealtimeChange<{ usuario_id: string; mensaje: string }>) => {
          const newNotif = payload.new;
          if (!newNotif) return;

          // Check if notification is targeted strictly to the currently logged in user by usuario_id
          const isTargetedToMe =
            currentUser &&
            isUUID(currentUser.id) &&
            newNotif.usuario_id === currentUser.id;

          if (isTargetedToMe) {
            playNotificationSound();
            setToastAlert({
              id: Date.now().toString(),
              message: newNotif.mensaje,
              user: 'Mención Directa',
            });
            setTimeout(() => setToastAlert(null), 20000); // 20 SECONDS!
          }
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(realtimeChannel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carga de datos al abrir otra oportunidad; los loaders se recrean en cada render
  }, [usersList, searchParams]);

  // Synchronize file attachments and chats when selecting an opportunity
  useEffect(() => {
    let ignore = false;
    if (selectedOp) {

      if (isUUID(selectedOp.id)) {
        const cachedProduccion = produccionDiariaCacheRef.current[selectedOp.id];
        if (cachedProduccion) {
          setOpProduccionDiaria(cachedProduccion);
        } else {
          setLoadingProduccionDiaria(true);
          supabase
            .from('produccion_diaria')
            .select('*, responsable:usuarios!responsable_id(*)')
            .eq('oportunidad_id', selectedOp.id)
            .order('fecha_produccion', { ascending: false })
            .then(({ data }: { data: ProduccionDiaria[] | null }) => {
              if (!ignore && data) {
                const list = data as ProduccionDiaria[];
                produccionDiariaCacheRef.current[selectedOp.id] = list;
                setOpProduccionDiaria(list);
              }
              if (!ignore) setLoadingProduccionDiaria(false);
            });
        }

        const latestQ = getActiveQuote(selectedOp);
        if (latestQ && isUUID(latestQ.id)) {
          const cachedItems = cotizacionItemsCacheRef.current[latestQ.id];
          if (cachedItems) {
            setCotizacionItemsOp(cachedItems);
          } else {
            supabase
              .from('cotizacion_items')
              .select('*')
              .eq('cotizacion_id', latestQ.id)
              .then(({ data }: { data: CotizacionItem[] | null }) => {
                if (!ignore && data) {
                  const items = data as CotizacionItem[];
                  cotizacionItemsCacheRef.current[latestQ.id] = items;
                  setCotizacionItemsOp(items);
                }
              });
          }
        } else {
          setCotizacionItemsOp([]);
        }

        if (!antecedentesCacheRef.current[selectedOp.id]) {
          loadAntecedentesOportunidad(selectedOp);
        }
      }
    }
    return () => {
      ignore = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga solo al cambiar la oportunidad seleccionada
  }, [selectedOp?.id, selectedOp?.cotizacion_actual_id, allCotizaciones.length]);

  const SECCIONES_BASE = [
    {
      id: 'ventas',
      nombre: 'Comercial y Ventas',
      descripcion: 'Gestión de prospección, cotizaciones, validación de pago y cierre comercial.',
      badge: 'Comercial',
      badgeBg: 'bg-warning-soft border-warning/30',
      badgeText: 'text-warning-ink',
      etapas: [
        { id: 'nueva' as EstadoPipeline, label: 'Nueva Oportunidad', color: 'border-warning/30 text-warning-ink', bg: 'bg-warning-soft' },
        { id: 'pagada' as EstadoPipeline, label: 'Pago Validado', color: 'border-info/30 text-info', bg: 'bg-info-soft' },
        { id: 'programada' as EstadoPipeline, label: 'En Programación', color: 'border-line text-ink', bg: 'bg-surface-muted' },
        { id: 'entregada' as EstadoPipeline, label: 'Venta Aprobada', color: 'border-success/30 text-success', bg: 'bg-success-soft' },
      ],
    },
    {
      id: 'produccion',
      nombre: 'Producción y Logística',
      descripcion: 'Planificación de fabricación, control de planta y ejecución de instalaciones en terreno.',
      badge: 'Producción',
      badgeBg: 'bg-surface-muted border-line',
      badgeText: 'text-ink',
      etapas: [
        { id: 'prod_pendiente' as EstadoPipeline, label: 'Pendiente Planificación', color: 'border-warning/30 text-warning-ink', bg: 'bg-warning-soft' },
        { id: 'prod_cola' as EstadoPipeline, label: 'En Cola de Fabricación', color: 'border-info/30 text-info', bg: 'bg-info-soft' },
        { id: 'prod_fabricacion' as EstadoPipeline, label: 'En Fabricación', color: 'border-line text-ink', bg: 'bg-surface-muted' },
        { id: 'prod_listo_instalacion' as EstadoPipeline, label: 'Listo p/ Instalación', color: 'border-line text-ink', bg: 'bg-surface-muted' },
        { id: 'prod_instalacion' as EstadoPipeline, label: 'En Instalación', color: 'border-accent/30 text-accent-ink', bg: 'bg-accent-soft' },
        { id: 'prod_finalizado' as EstadoPipeline, label: 'Finalizado / Entregado', color: 'border-success/30 text-success', bg: 'bg-success-soft' },
      ],
    },
    {
      id: 'reventa',
      nombre: 'Reventa y Logística',
      descripcion: 'Coordinación con proveedores, confirmación de stock y despachos.',
      badge: 'Reventa y Logística',
      badgeBg: 'bg-surface-muted border-line',
      badgeText: 'text-ink',
      etapas: [
        { id: 'rev_coordinacion' as EstadoPipeline, label: 'Coordinación Proveedor', color: 'border-info/30 text-info', bg: 'bg-info-soft' },
        { id: 'rev_stock' as EstadoPipeline, label: 'Confirmación Stock', color: 'border-line text-ink', bg: 'bg-surface-muted' },
        { id: 'rev_listo_retiro' as EstadoPipeline, label: 'Listo para Retiro', color: 'border-warning/30 text-warning-ink', bg: 'bg-warning-soft' },
        { id: 'rev_listo_despacho' as EstadoPipeline, label: 'Listo para Despacho', color: 'border-accent/30 text-accent-ink', bg: 'bg-accent-soft' },
        { id: 'rev_entregado' as EstadoPipeline, label: 'Entregado al Cliente', color: 'border-success/30 text-success', bg: 'bg-success-soft' },
        { id: 'rev_postventa' as EstadoPipeline, label: 'Postventa & Seguimiento', color: 'border-line text-ink', bg: 'bg-surface-muted' },
      ],
    },
  ];
  const SECCIONES_PIPELINE = SECCIONES_BASE.map((sec) => ({
    ...sec,
    etapas: sec.etapas.map((e) => ({ ...e, label: etapasNombres[e.id]?.trim() || e.label })),
  }));
  const getProdLogTipoLabel = (tipo: string) => {
    if (tipo === 'obra') return 'Obra';
    if (tipo === 'produccion') return 'Producción';
    if (tipo === 'reventa') return 'Reventa';
    return 'Logística';
  };

  const prodLogEstadoOptions: { value: EstadoEventoProduccionLogistica; label: string }[] = [
    { value: 'por_hacer', label: 'Por hacer' },
    { value: 'en_curso', label: 'En curso' },
    { value: 'reprogramado', label: 'Reprogramado' },
    { value: 'completado', label: 'Completado' },
    { value: 'no_realizado', label: 'No realizado' },
  ];

  const getProdLogEstadoLabel = (estado?: string | null) =>
    prodLogEstadoOptions.find((option) => option.value === estado)?.label || 'Por hacer';

  const getProdLogEstadoClasses = (estado?: string | null) => {
    if (estado === 'completado') return 'bg-success-soft text-success border-success/30';
    if (estado === 'no_realizado') return 'bg-danger-soft text-danger border-danger/30';
    if (estado === 'reprogramado') return 'bg-surface-muted text-ink border-line';
    if (estado === 'en_curso') return 'bg-warning-soft text-warning-ink border-warning/30';
    return 'bg-info-soft text-info border-info/30';
  };

  const responsablesVisitas = personalTerrenoList.filter(
    (p) => p.activo && (p.calendario_visitas ?? true)
  );

  const responsablesProduccionLogistica = personalTerrenoList.filter(
    (p) => p.activo && (p.calendario_produccion ?? true)
  );

  const responsablesReventaLogistica = personalTerrenoList.filter(
    (p) => p.activo && (p.calendario_reventa ?? true)
  );

  const getPersonalTerreno = (id?: string | null) =>
    id ? personalTerrenoList.find((p) => p.id === id) : undefined;

  const getResponsableVisitaNombre = (vis: VisitaTerreno) =>
    vis.tecnico?.nombre ||
    getPersonalTerreno(vis.tecnico_id)?.nombre ||
    vis.tecnico_visita ||
    'Responsable';

  const getResponsableEventoNombre = (event: EventoProduccionLogistica) =>
    event.responsable?.nombre ||
    getPersonalTerreno(event.responsable_id)?.nombre ||
    'Sin responsable';

  const getEventDateParts = (event: EventoProduccionLogistica) => {
    const sourceDate = event.fecha_inicio || event.fecha_evento || '';
    const dateObj = sourceDate ? new Date(sourceDate) : null;
    const isValidDate = dateObj && !Number.isNaN(dateObj.getTime());
    return {
      fecha: isValidDate
        ? dateObj.toISOString().split('T')[0]
        : event.fecha_evento || 'Sin fecha',
      hora: isValidDate
        ? dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        : event.hora_evento || '09:00',
    };
  };

  const resetProdLogForm = (contexto: ContextoEventoProduccionLogistica, tipo: TipoEventoProduccionLogistica) => {
    setNewProdLogContexto(contexto);
    setNewProdLogTipo(tipo);
    setNewProdLogEstado('por_hacer');
    setNewProdLogTitulo(selectedOp?.titulo || '');
    setNewProdLogFecha(new Date().toISOString().split('T')[0]);
    setNewProdLogHora('09:00');
    setNewProdLogResponsableId('');
    setNewProdLogNotas('');
    setEditingProdLogEventId(null);
  };

  const startEditProdLogEvent = (event: EventoProduccionLogistica) => {
    const { fecha, hora } = getEventDateParts(event);
    setNewProdLogContexto(event.contexto || 'produccion_logistica');
    setNewProdLogTipo(event.tipo_evento);
    setNewProdLogEstado((event.estado as EstadoEventoProduccionLogistica) || 'por_hacer');
    setNewProdLogTitulo(event.titulo);
    setNewProdLogFecha(fecha);
    setNewProdLogHora(hora);
    setNewProdLogResponsableId(event.responsable_id || '');
    setNewProdLogNotas(event.observaciones || '');
    setEditingProdLogEventId(event.id);
    setShowAddProdLogEventForm(true);
  };

  const saveProdLogEvent = async (contexto: ContextoEventoProduccionLogistica) => {
    if (!selectedOp || !newProdLogFecha || !newProdLogTitulo.trim()) return;

    const startIso = new Date(`${newProdLogFecha}T${newProdLogHora || '08:00'}:00`).toISOString();
    const endIso = new Date(new Date(startIso).getTime() + 3600000).toISOString();
    const payload = {
      contexto,
      oportunidad_id: selectedOp.id,
      planificacion_id: null,
      tipo_evento: newProdLogTipo,
      titulo: newProdLogTitulo.trim(),
      fecha_inicio: startIso,
      fecha_fin: endIso,
      fecha_evento: newProdLogFecha,
      hora_evento: newProdLogHora,
      responsable_id: isUUID(newProdLogResponsableId) ? newProdLogResponsableId : null,
      estado: newProdLogEstado,
      observaciones: newProdLogNotas,
      registrado_por: isUUID(currentUser?.id) ? currentUser?.id : null,
    };

    try {
      const query = editingProdLogEventId
        ? supabase
            .from('eventos_produccion_logistica')
            .update(payload)
            .eq('id', editingProdLogEventId)
            .select('*, responsable:usuarios!responsable_id(*)')
            .single()
        : supabase
            .from('eventos_produccion_logistica')
            .insert([payload])
            .select('*, responsable:usuarios!responsable_id(*)')
            .single();

      const { data, error } = await query;
      if (error) throw error;

      if (data) {
        const savedEvent = data as EventoProduccionLogistica;
        setOpEventosProdLog((prev) => {
          const next = editingProdLogEventId
            ? prev.map((event) => (event.id === editingProdLogEventId ? savedEvent : event))
            : [...prev, savedEvent];
          eventosProdLogCacheRef.current[selectedOp.id] = next;
          return next;
        });
      }

      setShowAddProdLogEventForm(false);
      setEditingProdLogEventId(null);
      setNewProdLogTitulo(selectedOp.titulo);
      setNewProdLogNotas('');
      await addOportunidadActividad(
        selectedOp.id,
        editingProdLogEventId
          ? `Evento de ${getProdLogTipoLabel(newProdLogTipo)} actualizado para ${newProdLogFecha}${newProdLogHora ? ` a las ${newProdLogHora}` : ''}.`
          : `Evento de ${getProdLogTipoLabel(newProdLogTipo)} programado para ${newProdLogFecha}${newProdLogHora ? ` a las ${newProdLogHora}` : ''}.`
      );
    } catch (err) {
      console.error('Error saving production/logistics event:', err);
      setToastAlert({
        id: nowMs().toString(),
        message: 'No se pudo guardar el evento. Revisa los datos e intenta nuevamente.',
        user: 'Sistema CRM',
      });
      setTimeout(() => setToastAlert(null), 5000);
    }
  };

  const deleteProdLogEvent = async (event: EventoProduccionLogistica) => {
    const okEvent = await confirmDialog({ title: 'Eliminar evento', message: '¿Eliminar este evento del calendario?', confirmLabel: 'Eliminar', destructive: true }); if (!okEvent) return;
    try {
      const { error } = await supabase
        .from('eventos_produccion_logistica')
        .delete()
        .eq('id', event.id);
      if (error) throw error;
      setOpEventosProdLog((prev) => {
        const next = prev.filter((item) => item.id !== event.id);
        if (selectedOp) eventosProdLogCacheRef.current[selectedOp.id] = next;
        return next;
      });
      if (editingProdLogEventId === event.id) {
        setEditingProdLogEventId(null);
        setShowAddProdLogEventForm(false);
      }
      if (selectedOp) {
        await addOportunidadActividad(
          selectedOp.id,
          `Evento de ${getProdLogTipoLabel(event.tipo_evento)} eliminado del calendario.`
        );
      }
    } catch (err) {
      console.error('Error deleting production/logistics event:', err);
      setToastAlert({
        id: nowMs().toString(),
        message: 'No se pudo eliminar el evento. Intenta nuevamente.',
        user: 'Sistema CRM',
      });
      setTimeout(() => setToastAlert(null), 5000);
    }
  };

  const pipelineStates = SECCIONES_PIPELINE.flatMap((s) => s.etapas);

  const handleDeleteOportunidad = async () => {
    if (!opToDelete || deletingOp) return;
    setDeletingOp(true);
    setDeleteOpError('');
    try {
      const { data, error } = await supabase.from('oportunidades')
        .delete().eq('id', opToDelete.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No se eliminó el registro. Revisa tus permisos e intenta nuevamente.');

      setOportunidades((prev) => prev.filter((o) => o.id !== opToDelete.id));
      setAllCotizaciones((prev) => prev.filter((c) => c.oportunidad_id !== opToDelete.id));
      if (selectedOp?.id === opToDelete.id) setSelectedOp(null);
      setOpToDelete(null);
    } catch (err) {
      console.error('Error deleting oportunidad from Supabase:', err);
      const message = err && typeof err === 'object' && 'code' in err && err.code === '23503'
        ? 'Esta oportunidad tiene una orden de compra vinculada. No se puede eliminar mientras conserve ese vínculo.'
        : mensajeError(err, 'No se pudo eliminar la oportunidad.');
      setDeleteOpError(message);
    } finally {
      setDeletingOp(false);
    }
  };

  // Delete Cotización in modal from Supabase
  const handleDeleteCotizacionInModal = async () => {
    if (!cotToDeleteInModal) return;
    const { error } = await supabase.from('cotizaciones').delete().eq('id', cotToDeleteInModal.id);
    if (error) {
      setCotizacionErrorMsg(mensajeError(error));
      return;
    }

    setAllCotizaciones((prev) => prev.filter((c) => c.id !== cotToDeleteInModal.id));
    if (selectedOp) {
      const updatedCots = (selectedOp.cotizaciones || []).filter((c) => c.id !== cotToDeleteInModal.id);
      const { data: opData } = await supabase.from('oportunidades')
        .select('cotizacion_actual_id').eq('id', selectedOp.id).single();
      setSelectedOp({ ...selectedOp, cotizaciones: updatedCots,
        cotizacion_actual_id: opData?.cotizacion_actual_id || undefined });
    }
    setCotToDeleteInModal(null);
  };

  const sortOpportunities = (ops: OportunidadVenta[]) =>
    [...ops].sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es'));

  // Modal Split Ratio State (Porcentaje de ancho de la columna izquierda, por defecto 64%)
  const [modalLeftColRatio, setModalLeftColRatio] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const savedRatio = localStorage.getItem('hormiglass_modal_left_col_ratio');
      if (savedRatio) {
        const parsed = Number(savedRatio);
        if (parsed >= 30 && parsed <= 80) {
          return parsed;
        }
      }
    }
    return 64;
  });

  const modalResizingRef = React.useRef<{ startX: number; startRatio: number; containerWidth: number } | null>(null);
  const modalContainerRef = React.useRef<HTMLDivElement | null>(null);

  const handleMouseDownModalResizer = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!modalContainerRef.current) return;
    const containerWidth = modalContainerRef.current.getBoundingClientRect().width;

    modalResizingRef.current = {
      startX: e.clientX,
      startRatio: modalLeftColRatio,
      containerWidth,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!modalResizingRef.current) return;
      const deltaX = moveEvent.clientX - modalResizingRef.current.startX;
      const deltaRatio = (deltaX / modalResizingRef.current.containerWidth) * 100;
      const newRatio = Math.min(80, Math.max(30, modalResizingRef.current.startRatio + deltaRatio));

      setModalLeftColRatio(newRatio);
      if (typeof window !== 'undefined') {
        localStorage.setItem('hormiglass_modal_left_col_ratio', newRatio.toString());
      }
    };

    const handleMouseUp = () => {
      modalResizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Warning Modal para validación de Abono Mínimo (50% o 100%)
  const [abonoWarningModal, setAbonoWarningModal] = useState<{
    op: OportunidadVenta;
    targetStage: EstadoPipeline;
    montoTotal: number;
    montoAbonado: number;
    porcentajeActual?: number;
  } | null>(null);


  const [cotizacionErrorMsg, setCotizacionErrorMsg] = useState('');
  const guardarCambioCotizacion = async (
    cotizacion: Cotizacion,
    cambios: { oportunidad_id?: string | null; estado?: EstadoCotizacion },
  ) => {
    const { data, error } = await supabase.from('cotizaciones')
      .update(cambios).eq('id', cotizacion.id).select().single();
    if (error || !data) throw new Error(mensajeError(error, 'No se confirmó el cambio de cotización.'));
    const { data: oportunidad, error: opError } = await supabase.from('oportunidades')
      .select('cotizacion_actual_id').eq('id', selectedOp!.id).single();
    if (opError || !oportunidad) throw new Error(mensajeError(opError, 'No se pudo actualizar la cotización vigente.'));
    setAllCotizaciones((prev) => prev.map((cot) => cot.id === data.id ? data as Cotizacion : cot));
    setSelectedOp((prev) => prev ? { ...prev, cotizacion_actual_id: oportunidad.cotizacion_actual_id } : null);
    setOportunidades((prev) => prev.map((op) => op.id === selectedOp!.id
      ? { ...op, cotizacion_actual_id: oportunidad.cotizacion_actual_id } : op));
    setCotizacionErrorMsg('');
    return oportunidad.cotizacion_actual_id as string | null;
  };

  // Candidate quote dropdown selection state
  const [selectedCandidateCotIds, setSelectedCandidateCotIds] = useState<string[]>([]);
  const [showVincularCotModal, setShowVincularCotModal] = useState(false);
  const [vincularCotBusqueda, setVincularCotBusqueda] = useState('');
  const [vinculandoCot, setVinculandoCot] = useState(false);

  // Abonos state
  const [nuevoAbonoMonto, setNuevoAbonoMonto] = useState<string>('');
  const [nuevoAbonoNota, setNuevoAbonoNota] = useState<string>('');
  const [nuevoAbonoFile, setNuevoAbonoFile] = useState<File | null>(null);
  const [nuevoAbonoFileName, setNuevoAbonoFileName] = useState<string>('');
  const [abonoErrorMsg, setAbonoErrorMsg] = useState<string>('');
  const [abonoSaving, setAbonoSaving] = useState(false);

  const guardarAbono = async (operacion: 'crear' | 'editar' | 'eliminar', pago: Record<string, unknown>) => {
    if (!selectedOp) throw new Error('Selecciona una oportunidad.');
    const { data, error } = await supabase.rpc('registrar_abono_atomico', {
      p_oportunidad_id: selectedOp.id,
      p_pago: pago,
      p_operacion: operacion,
    });
    if (error || !data) throw new Error(mensajeError(error, 'No se confirmó el abono.'));
    const updated = data as { comprobantes_pago: OportunidadVenta['comprobantes_pago']; monto_abonado: number };
    setSelectedOp((prev) => prev ? { ...prev, ...updated } : null);
    setOportunidades((prev) => prev.map((op) => op.id === selectedOp.id ? { ...op, ...updated } : op));
    setAbonoErrorMsg('');
    void loadMargenOportunidad(selectedOp.id);
    return updated;
  };

  const abrirComprobante = async (storedUrl: string) => {
    const publicMarker = '/storage/v1/object/public/documentos/';
    const privateMarker = '/storage/v1/object/sign/documentos/';
    const marker = storedUrl.includes(publicMarker) ? publicMarker : privateMarker;
    const path = storedUrl.includes(marker)
      ? decodeURIComponent(storedUrl.split(marker)[1].split('?')[0])
      : storedUrl;
    if (!path || /^https?:/i.test(path)) {
      setAbonoErrorMsg('El comprobante histórico no tiene una ruta privada válida.');
      return;
    }
    const tab = window.open('', '_blank');
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      tab?.close();
      setAbonoErrorMsg(mensajeError(error, 'No se pudo abrir el comprobante.'));
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  // Editing abono state

  // Helper para agregar actividades al historial de la oportunidad y persistir en actividades_op
  const addOportunidadActividad = async (
    opId: string,
    contenido: string,
    tipo: 'comentario' | 'actualizacion' | 'abono' | 'reclamo' | 'seguimiento' = 'actualizacion'
  ) => {
    const targetOp = oportunidades.find((o) => o.id === opId) || selectedOp;
    if (!targetOp) return;

    const userName = currentUser?.nombre || 'Vendedor';
    const userId = (currentUser?.id && isUUID(currentUser.id)) ? currentUser.id : null;

    const newMsg: ChatMensaje = {
      id: `act-${nowMs()}-${randomSuffix()}`,
      usuario_id: userId || 'sistema',
      usuario_nombre: userName,
      contenido,
      created_at: new Date().toISOString(),
      tipo,
    };

    if (selectedOp && selectedOp.id === opId) {
      setSelectedOp((prev) =>
        prev
          ? { ...prev, chat_interno: mergeAndDeduplicateMessages([...(prev.chat_interno || []), newMsg]) }
          : prev
      );
    }
    setOportunidades((prev) =>
      prev.map((o) =>
        o.id === opId
          ? { ...o, chat_interno: mergeAndDeduplicateMessages([...(o.chat_interno || []), newMsg]) }
          : o
      )
    );
    activitiesCacheRef.current[opId] = mergeAndDeduplicateMessages([
      ...(activitiesCacheRef.current[opId] || targetOp.chat_interno || []),
      newMsg,
    ]);

    if (isUUID(opId)) {
      try {
        // Save in actividades_op table in Supabase
        await supabase.from('actividades_op').insert([{
          oportunidad_id: opId,
          usuario_id: userId,
          usuario_nombre: userName,
          contenido,
          tipo,
        }]);
      } catch (err) {
        console.error('Error updating actividades_op in Supabase:', err);
      }
    }

    // Always log to logs_sistema (Ajustes-8 Req 8)
    await logSistema({
      tipo_accion: tipo === 'comentario' ? 'creacion' : 'actualizacion',
      entidad: 'oportunidades',
      entidad_id: opId,
      descripcion: `[${tipo.toUpperCase()}] ${targetOp.codigo}: ${contenido}`,
      usuario_id: userId,
    });
  };

  // Bifurcación Explícita & Ejecución de Transición
  const applyMoveWithRama = async (
    opId: string,
    targetState: EstadoPipeline,
    rama: 'produccion' | 'reventa'
  ) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp) return;
    const previousOportunidades = oportunidades;
    const previousSelectedOp = selectedOp;

    // Actualización optimista local
    setOportunidades((prev) =>
      prev.map((o) =>
        o.id === opId ? { ...o, estado_pipeline: targetState, rama_destino: rama } : o
      )
    );

    if (selectedOp && selectedOp.id === opId) {
      setSelectedOp({ ...selectedOp, estado_pipeline: targetState, rama_destino: rama });
    }

    const stateLabel = pipelineStates.find((s) => s.id === targetState)?.label || targetState;

    if (isUUID(opId)) {
      try {
        const { error: oportunidadError } = await supabase
          .from('oportunidades')
          .update({
            estado_pipeline: targetState,
            rama_destino: rama,
            rama_definida_en: new Date().toISOString(),
            rama_definida_por: currentUser?.id || null,
          })
          .eq('id', opId);
        if (oportunidadError) throw oportunidadError;
      } catch (err) {
        console.error('Error updating oportunidad state in Supabase:', err);
        setOportunidades(previousOportunidades);
        setSelectedOp(previousSelectedOp);
        setToastAlert({
          id: nowMs().toString(),
          message: 'No se pudo cambiar la rama. La oportunidad quedó sin cambios.',
          user: 'Sistema CRM',
        });
        setTimeout(() => setToastAlert(null), 5000);
        return;
      }
    }

    await addOportunidadActividad(opId, `Etapa del pipeline actualizada a "${stateLabel}" (Rama: ${rama === 'produccion' ? 'Producción' : 'Reventa'})`);
    await logSistema({
      tipo_accion: 'estado_cambiado',
      entidad: 'oportunidades',
      entidad_id: opId,
      descripcion: `Oportunidad ${targetOp.codigo} movida a ${stateLabel} (${rama})`,
      usuario_id: currentUser?.id,
    });
  };

  const requestMoveWithRama = async (
    opId: string,
    targetState: EstadoPipeline,
    rama: 'produccion' | 'reventa'
  ) => {
    // Una OC puede distribuirse entre varias ventas y no se borra al cambiar de ruta.
    await applyMoveWithRama(opId, targetState, rama);
  };

  // Lost opportunity: the database owns perdida_at/perdida_por; the client only sends the reason.
  type CamposPerdida = Pick<OportunidadVenta, 'perdida_at' | 'perdida_motivo' | 'perdida_detalle' | 'perdida_por'>;
  const CAMPOS_PERDIDA = 'perdida_at, perdida_motivo, perdida_detalle, perdida_por';
  const perdidaDetalleLimpio = perdidaDetalle.trim();
  const perdidaValida = Boolean(perdidaMotivo) && (perdidaMotivo !== 'otro' || perdidaDetalleLimpio.length > 0);

  const aplicarCamposPerdida = (opId: string, campos: CamposPerdida) => {
    setOportunidades((prev) => prev.map((o) => (o.id === opId ? { ...o, ...campos } : o)));
    setSelectedOp((prev) => (prev && prev.id === opId ? { ...prev, ...campos } : prev));
  };

  const abrirMarcarPerdida = (op: OportunidadVenta) => {
    setPerdidaMotivo('');
    setPerdidaDetalle('');
    setOpToMarkLost(op);
  };

  const confirmarMarcarPerdida = async () => {
    const op = opToMarkLost;
    if (!op || !perdidaValida || savingPerdida) return;
    setSavingPerdida(true);
    try {
      const detalle = perdidaDetalleLimpio || null;
      const { data, error } = await supabase
        .from('oportunidades')
        .update({ perdida_motivo: perdidaMotivo, perdida_detalle: detalle })
        .eq('id', op.id)
        .select(CAMPOS_PERDIDA)
        .single();
      if (error || !data) throw new Error(mensajeError(error, 'No se pudo marcar la oportunidad como perdida.'));
      aplicarCamposPerdida(op.id, data as CamposPerdida);
      setOpToMarkLost(null);
      toast({ message: `Oportunidad ${op.codigo} marcada como perdida.`, tone: 'success' });
      await addOportunidadActividad(op.id, `Marcada como perdida: ${motivoPerdidaLabel(perdidaMotivo)}${detalle ? ` — ${detalle}` : ''}`);
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo marcar la oportunidad como perdida.'), tone: 'danger' });
    } finally {
      setSavingPerdida(false);
    }
  };

  const reabrirOportunidad = async (op: OportunidadVenta) => {
    const etapa = pipelineStates.find((s) => s.id === op.estado_pipeline)?.label || op.estado_pipeline;
    const ok = await confirmDialog({
      title: 'Reabrir oportunidad',
      message: `La oportunidad ${op.codigo} volverá al pipeline activo en la etapa "${etapa}".`,
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    try {
      const { data, error } = await supabase
        .from('oportunidades')
        .update({ perdida_motivo: null, perdida_detalle: null })
        .eq('id', op.id)
        .select(CAMPOS_PERDIDA)
        .single();
      if (error || !data) throw new Error(mensajeError(error, 'No se pudo reabrir la oportunidad.'));
      aplicarCamposPerdida(op.id, data as CamposPerdida);
      toast({ message: `Oportunidad ${op.codigo} reabierta.`, tone: 'success' });
      await addOportunidadActividad(op.id, 'Oportunidad reabierta');
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo reabrir la oportunidad.'), tone: 'danger' });
    }
  };

  // Mover Oportunidad en el Pipeline (Sin gates bloqueantes de abono)
  const moveOportunidadToState = async (opId: string, targetState: EstadoPipeline) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp || targetOp.estado_pipeline === targetState) return;
    if (esOportunidadPerdida(targetOp)) {
      toast({ message: 'La oportunidad está perdida. Reábrela para cambiar su etapa.', tone: 'warning' });
      return;
    }

    if (['prod_finalizado', 'rev_entregado'].includes(targetState)) {
      const { data: accredited, error: deliveryError } = await supabase.rpc('entrega_acreditada', { p_venta: opId });
      if (deliveryError || !accredited) {
        toast({ message: mensajeError(deliveryError, 'La venta aún no tiene entrega completa acreditada. Revisa guías y excepciones en la vista operativa.'), tone: 'warning' });
        return;
      }
      const okCierre = await confirmDialog({ title: 'Confirmar cierre', message: '¿Confirmar el cierre de esta venta con entrega acreditada?', confirmLabel: 'Confirmar' }); if (!okCierre) return;
    }

    // Si se mueve a etapas específicas de Producción o Reventa, asignar rama automáticamente
    if (targetState.startsWith('prod_')) {
      await requestMoveWithRama(opId, targetState, 'produccion');
      return;
    }
    if (targetState.startsWith('rev_')) {
      await requestMoveWithRama(opId, targetState, 'reventa');
      return;
    }

    // Si se mueve a Venta Aprobada (entregada) y no tiene rama_destino aún, abrir modal de elección
    if (targetState === 'entregada' && !targetOp.rama_destino) {
      return;
    }

    // Si ya tiene rama o se mueve dentro de comercial

    // Actualización optimista local
    setOportunidades((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, estado_pipeline: targetState } : o))
    );

    if (selectedOp && selectedOp.id === opId) {
      setSelectedOp({ ...selectedOp, estado_pipeline: targetState });
    }

    const stateLabel = pipelineStates.find((s) => s.id === targetState)?.label || targetState;

    if (isUUID(opId)) {
      try {
        const { error } = await supabase
          .from('oportunidades')
          .update({ estado_pipeline: targetState })
          .eq('id', opId);
        if (error) throw error;
      } catch (err) {
        console.error('Error updating oportunidad state in Supabase:', err);
        setOportunidades((prev) => prev.map((o) => o.id === opId ? targetOp : o));
        if (selectedOp?.id === opId) setSelectedOp(targetOp);
        toast({ message: mensajeError(err, 'No se pudo actualizar la etapa.'), tone: 'danger' });
        return;
      }
    }

    await addOportunidadActividad(opId, `Etapa del pipeline actualizada a "${stateLabel}"`);
    await logSistema({
      tipo_accion: 'estado_cambiado',
      entidad: 'oportunidades',
      entidad_id: opId,
      descripcion: `Oportunidad ${targetOp.codigo} movida a ${stateLabel}`,
      usuario_id: currentUser?.id,
    });
  };

  // Stock actual de los productos del catálogo que aparecen en la cotización vigente
  const cargarStockCatalogo = async (items: CotizacionItem[]) => {
    const ids = Array.from(new Set(items.map((i) => i.producto_catalogo_id).filter((v): v is string => !!v)));
    if (ids.length === 0) return;
    const { data, error } = await supabase.from('catalogo_productos').select('id, stock_actual').in('id', ids);
    if (error || !data) return; // columna aún no migrada: se omite el stock
    const next: Record<string, number> = {};
    for (const row of data as { id: string; stock_actual: number | null }[]) next[row.id] = Number(row.stock_actual || 0);
    setStockCatalogo((prev) => ({ ...prev, ...next }));
  };

  const abrirModalProduccion = async () => {
    if (!selectedOp) return;
    let items = cotizacionItemsOp;
    if (items.length === 0) {
      // Las partidas pueden no haberse cargado aún: se piden bajo demanda a la cotización vigente.
      const latestQ = getActiveQuote(selectedOp);
      if (latestQ && isUUID(latestQ.id)) {
        const { data } = await supabase.from('cotizacion_items').select('*').eq('cotizacion_id', latestQ.id);
        if (data) {
          items = data as CotizacionItem[];
          cotizacionItemsCacheRef.current[latestQ.id] = items;
          setCotizacionItemsOp(items);
        }
      }
    }
    if (!items.some((i) => i.id)) {
      toast({ message: 'Vincula una cotización con partidas a esta oportunidad para registrar producción.', tone: 'warning' });
      return;
    }
    setNewProdItemId(items.find((i) => i.id)?.id || '');
    setNewProdCantidad(0);
    setNewProdObservaciones('');
    setNewProdFecha(new Date().toISOString().split('T')[0]);
    setShowProdModal(true);
    void cargarStockCatalogo(items);
  };

  // Registrar tanda de Producción Diaria (suma al stock del producto del catálogo vía trigger en la base de datos)
  const handleRegisterProduccionDiaria = async () => {
    const item = cotizacionItemsOp.find((i) => i.id === newProdItemId);
    if (!selectedOp || !item?.id || newProdCantidad <= 0) return;
    setProdSaving(true);
    try {
      const latestQ = getActiveQuote(selectedOp);

      // La base exige que cada tanda cuelgue de una orden de producción y de una partida de la cotización.
      const { data: existentes, error: ordenErr } = await supabase
        .from('ordenes_produccion')
        .select('id, items:orden_produccion_items(cotizacion_item_id)')
        .eq('oportunidad_id', selectedOp.id)
        .neq('estado', 'cancelada')
        .order('created_at', { ascending: true })
        .limit(1);
      if (ordenErr) throw ordenErr;

      let ordenId: string | undefined = existentes?.[0]?.id;
      if (!ordenId) {
        const { data: nueva, error: nuevaErr } = await supabase
          .from('ordenes_produccion')
          .insert({
            oportunidad_id: selectedOp.id,
            fecha_inicio: newProdFecha || new Date().toISOString().split('T')[0],
            responsable_id: newProdResponsableId || null,
          })
          .select('id')
          .single();
        if (nuevaErr || !nueva) throw nuevaErr || new Error('No se pudo crear la orden de producción.');
        ordenId = nueva.id as string;
        const { error: itemsErr } = await supabase.from('orden_produccion_items').insert(
          cotizacionItemsOp
            .filter((i) => i.id && Number(i.cantidad) > 0)
            .map((i) => ({
              orden_produccion_id: ordenId,
              cotizacion_item_id: i.id,
              producto: i.producto,
              cantidad_objetivo: i.cantidad,
            }))
        );
        if (itemsErr) {
          await supabase.from('ordenes_produccion').delete().eq('id', ordenId);
          throw itemsErr;
        }
      } else {
        const yaTiene = (existentes?.[0]?.items as { cotizacion_item_id: string | null }[] | undefined)?.some(
          (r) => r.cotizacion_item_id === item.id
        );
        if (!yaTiene) {
          const { error: itemErr } = await supabase.from('orden_produccion_items').insert({
            orden_produccion_id: ordenId,
            cotizacion_item_id: item.id,
            producto: item.producto,
            cantidad_objetivo: item.cantidad,
          });
          if (itemErr) throw itemErr;
        }
      }

      const payload: Record<string, unknown> = {
        oportunidad_id: selectedOp.id,
        orden_produccion_id: ordenId,
        cotizacion_id: latestQ?.id || null,
        cotizacion_item_id: item.id,
        producto: item.producto,
        cantidad_producida: newProdCantidad,
        fecha_produccion: newProdFecha || new Date().toISOString().split('T')[0],
        responsable_id: newProdResponsableId || null,
        observaciones: newProdObservaciones.trim() || null,
        registrado_por: currentUser?.id || null,
      };
      if (item.producto_catalogo_id) payload.producto_catalogo_id = item.producto_catalogo_id;

      const { data, error } = await supabase
        .from('produccion_diaria')
        .insert([payload])
        .select('*, responsable:usuarios!responsable_id(*)')
        .single();
      if (error) throw error;

      if (data) {
        const newRecord = data as ProduccionDiaria;
        setOpProduccionDiaria((prev) => {
          const next = [newRecord, ...prev];
          produccionDiariaCacheRef.current[selectedOp.id] = next;
          return next;
        });
      }

      await addOportunidadActividad(
        selectedOp.id,
        `Fabricación registrada: ${newProdCantidad} un. de "${item.producto}" el ${payload.fecha_produccion}`
      );

      if (item.producto_catalogo_id) {
        await cargarStockCatalogo([item]);
        toast({ message: `Producción registrada: +${newProdCantidad} un. al stock de ${item.producto}`, tone: 'success' });
      } else {
        toast({ message: 'Producción registrada (el producto no está en el catálogo, no suma stock)', tone: 'warning' });
      }
      setShowProdModal(false);
    } catch (err) {
      console.error('Error registrando produccion diaria:', err);
      toast({ message: mensajeError(err, 'No se pudo registrar la producción.'), tone: 'danger' });
    } finally {
      setProdSaving(false);
    }
  };

  // Guardar campo individual en Supabase
  // Vincula a la oportunidad una cotización existente del mismo cliente.
  const vincularCotizacionesSeleccionadas = async (op: OportunidadVenta) => {
    const targets = allCotizaciones.filter((c) => selectedCandidateCotIds.includes(c.id));
    if (targets.length === 0) return;
    setVinculandoCot(true);
    setCotizacionErrorMsg('');
    try {
      for (const target of targets) {
        await guardarCambioCotizacion(target, { oportunidad_id: op.id });
        await addOportunidadActividad(op.id, `Cotización ${target.numero_cotizacion} vinculada a la oportunidad.`);
      }
      setSelectedCandidateCotIds([]);
      setVincularCotBusqueda('');
      setShowVincularCotModal(false);
      toast({ message: targets.length === 1 ? 'Cotización vinculada' : `${targets.length} cotizaciones vinculadas`, tone: 'success' });
    } catch (err) {
      setCotizacionErrorMsg(mensajeError(err));
    } finally {
      setVinculandoCot(false);
    }
  };

  const updateOportunidadField = async (
    opId: string,
    field: keyof OportunidadVenta,
    value: OportunidadVenta[keyof OportunidadVenta]
  ) => {
    setOportunidades((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, [field]: value } : o))
    );

    if (selectedOp && selectedOp.id === opId) {
      setSelectedOp((prev) => prev ? { ...prev, [field]: value } : prev);
    }

    if (isUUID(opId)) {
      try {
        await supabase
          .from('oportunidades')
          .update({ [field]: value })
          .eq('id', opId);
      } catch (err) {
        console.error(`Error updating field ${String(field)}:`, err);
      }
    }
  };

  const toDateTimeLocal = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T').slice(0, 16) : '';

  const openSeguimientoPanel = () => {
    if (!selectedOp) return;
    setSeguimientoDraft({
      resultado: '',
      accion: selectedOp.proxima_accion || '',
      fecha: toDateTimeLocal(selectedOp.proxima_accion_fecha),
      responsable: selectedOp.seguimiento_responsable_id || selectedOp.asignado_a || '',
    });
    setIsReclamoMode(false);
    setIsSeguimientoMode(true);
  };

  const handleSaveSeguimiento = async () => {
    if (!selectedOp || !seguimientoDraft.accion.trim()) return;
    setSeguimientoSaving(true);
    const opId = selectedOp.id;
    const resultado = seguimientoDraft.resultado.trim();
    const changes: Partial<OportunidadVenta> = {
      proxima_accion: seguimientoDraft.accion.trim(),
      proxima_accion_fecha: seguimientoDraft.fecha ? new Date(seguimientoDraft.fecha).toISOString() : null,
      seguimiento_responsable_id: seguimientoDraft.responsable || null,
      ...(resultado ? { seguimiento_resultado: resultado } : {}),
    };

    setOportunidades((prev) => prev.map((o) => (o.id === opId ? { ...o, ...changes } : o)));
    setSelectedOp((prev) => (prev && prev.id === opId ? { ...prev, ...changes } : prev));
    if (isUUID(opId)) {
      const { error } = await supabase.from('oportunidades').update(changes).eq('id', opId);
      if (error) console.error('Error guardando seguimiento comercial:', error);
    }

    const responsable = usuariosApp.find((u) => u.id === changes.seguimiento_responsable_id);
    const fechaTexto = changes.proxima_accion_fecha
      ? new Date(changes.proxima_accion_fecha).toLocaleString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Sin fecha';
    const partes = [
      `Próxima acción: ${changes.proxima_accion}`,
      `Fecha: ${fechaTexto}`,
      `Responsable: ${responsable?.nombre || 'Sin responsable'}`,
      ...(resultado ? [`Último contacto: ${resultado}`] : []),
    ];
    await addOportunidadActividad(opId, partes.join('\n'), 'seguimiento');

    setSeguimientoSaving(false);
    setIsSeguimientoMode(false);
  };

  // Handle Drag Handlers
  const handleDragStart = (e: React.DragEvent, opId: string) => {
    e.dataTransfer.setData('text/plain', opId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedOpId(opId);
  };

  const handleDragEnd = () => {
    setDraggedOpId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: EstadoPipeline) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDrop = (e: React.DragEvent, colId: EstadoPipeline) => {
    e.preventDefault();
    const opId = e.dataTransfer.getData('text/plain') || draggedOpId;
    if (opId) {
      moveOportunidadToState(opId, colId);
    }
    setDraggedOpId(null);
    setDragOverColumn(null);
  };

  // Chat message & @ Mentions Handling with File Attachments
  const handleSendChatMessage = async () => {
    if (!selectedOp || (!chatInput.trim() && stagedChatFiles.length === 0)) return;

    setIsUploadingChatFiles(true);
    let uploadedAttachmentsText = '';
    const newAntecedentesUploaded: AntecedenteDocumento[] = [];

    if (stagedChatFiles.length > 0 && isUUID(selectedOp.id)) {
      for (const file of stagedChatFiles) {
        try {
          const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `antecedentes/${selectedOp.id}/${nowMs()}_${cleanFileName}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(storagePath, file, {
              contentType: file.type || undefined,
              upsert: false,
            });

          if (uploadError || !uploadData) {
            console.error('Error uploading chat attachment to Supabase:', uploadError);
            continue;
          }

          const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(storagePath);
          const publicUrl = urlData?.publicUrl || '#';

          const userName = currentUser?.nombre || 'Vendedor';
          const userId = currentUser?.id && isUUID(currentUser.id) ? currentUser.id : null;

          const { data: insertedDoc, error: insertError } = await supabase
            .from('oportunidad_antecedentes')
            .insert([
              {
                oportunidad_id: selectedOp.id,
                nombre: file.name,
                tipo: 'otro',
                bucket_id: 'documentos',
                storage_path: storagePath,
                public_url: publicUrl,
                mime_type: file.type || null,
                size_bytes: file.size,
                subido_por_id: userId,
                subido_por_nombre: userName,
              },
            ])
            .select()
            .single();

          if (!insertError && insertedDoc) {
            const mappedDoc = mapAntecedenteRecord(insertedDoc);
            newAntecedentesUploaded.push(mappedDoc);
          }

          uploadedAttachmentsText += `\n📎 [${file.name}](${publicUrl})`;
        } catch (err) {
          console.error('Error uploading chat attachment:', err);
        }
      }

      if (newAntecedentesUploaded.length > 0) {
        const existingDocs = antecedentesCacheRef.current[selectedOp.id] || opAntecedentesList;
        const updatedDocs = [...newAntecedentesUploaded, ...existingDocs];
        antecedentesCacheRef.current[selectedOp.id] = updatedDocs;
        setOpAntecedentesList(updatedDocs);
        updateOportunidadField(selectedOp.id, 'antecedentes', updatedDocs);
      }
    }

    const rawText = chatInput.trim();
    let msgContent = rawText;
    if (uploadedAttachmentsText) {
      msgContent = rawText ? `${rawText}\n${uploadedAttachmentsText}` : uploadedAttachmentsText.trim();
    }

    const msgTipo = isReclamoMode ? 'reclamo' : 'comentario';
    setChatInput('');
    setStagedChatFiles([]);
    setIsUploadingChatFiles(false);
    setIsReclamoMode(false);
    setMentionMenuOpen(false);

    if (msgContent) {
      await addOportunidadActividad(selectedOp.id, msgContent, msgTipo);

      // Detect @ mentions in text
      const mentionsFound = usuariosApp.filter((u) =>
        msgContent.toLowerCase().includes(`@${u.nombre.toLowerCase()}`)
      );

      if (mentionsFound.length > 0) {
        for (const u of mentionsFound) {
          if (isUUID(u.id)) {
            try {
              await supabase.from('notificaciones').insert([
                {
                  usuario_id: u.id,
                  tipo: 'mencion',
                  mensaje: `@${currentUser?.nombre || 'Usuario'} te mencionó en la oportunidad ${selectedOp.codigo}: "${msgContent}"`,
                  link_url: `/ventas?oportunidad=${selectedOp.id}`,
                  leido: false,
                  fecha: new Date().toISOString(),
                },
              ]);
            } catch (err) {
              console.error('Error inserting notification in Supabase:', err);
            }
          }
        }
      }
    }
  };

  // Helper to extract mention query after @
  const getMentionQuery = () => {
    const lastAtIndex = chatInput.lastIndexOf('@');
    if (lastAtIndex === -1) return null;
    const textAfterAt = chatInput.slice(lastAtIndex + 1);
    if (textAfterAt.includes('\n')) return null;

    // Check if textAfterAt matches any user name followed by space (completed mention)
    for (const u of usuariosApp) {
      if (textAfterAt.toLowerCase().startsWith(u.nombre.toLowerCase() + ' ')) {
        return null;
      }
    }
    return textAfterAt;
  };

  const currentMentionQuery = getMentionQuery();
  const filteredMentionUsers = currentMentionQuery === null ? [] : usuariosApp.filter((u) => {
    if (!currentMentionQuery) return true;
    return (
      u.nombre.toLowerCase().includes(currentMentionQuery.toLowerCase()) ||
      u.rol.toLowerCase().includes(currentMentionQuery.toLowerCase())
    );
  });

  const handleInsertMention = (userName: string) => {
    const lastIndex = chatInput.lastIndexOf('@');
    if (lastIndex !== -1) {
      const prefix = chatInput.substring(0, lastIndex);
      setChatInput(`${prefix}@${userName} `);
    } else {
      setChatInput((prev) => `${prev}@${userName} `);
    }
    setMentionMenuOpen(false);
  };

  // Upload Antecedente Document
  const handleUploadAntecedente = async () => {
    if (!nuevoAntecedenteFile || !selectedOp) {
      setAntecedenteErrorMsg('Debes seleccionar un archivo para adjuntar.');
      return;
    }

    setAntecedenteUploading(true);
    setAntecedenteErrorMsg('');

    try {
      if (!isUUID(selectedOp.id)) {
        throw new Error('La oportunidad debe estar guardada antes de adjuntar antecedentes.');
      }

      const cleanFileName = nuevoAntecedenteFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `antecedentes/${selectedOp.id}/${nowMs()}_${cleanFileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(storagePath, nuevoAntecedenteFile, {
          contentType: nuevoAntecedenteFile.type || undefined,
          upsert: false,
        });

      if (uploadError || !uploadData) {
        throw new Error(mensajeError(uploadError, 'No se pudo subir el archivo.'));
      }

      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl || '#';

      const { data: inserted, error: insertError } = await supabase
        .from('oportunidad_antecedentes')
        .insert({
          oportunidad_id: selectedOp.id,
          nombre: nuevoAntecedenteNombre.trim() || nuevoAntecedenteFile.name,
          tipo: nuevoAntecedenteTipo,
          bucket_id: 'documentos',
          storage_path: storagePath,
          public_url: publicUrl,
          mime_type: nuevoAntecedenteFile.type || null,
          size_bytes: nuevoAntecedenteFile.size,
          subido_por_id: currentUser?.id && isUUID(currentUser.id) ? currentUser.id : null,
          subido_por_nombre: currentUser?.nombre || 'Usuario',
        })
        .select()
        .single();

      if (insertError || !inserted) {
        await supabase.storage.from('documentos').remove([storagePath]);
        throw new Error(mensajeError(insertError, 'No se pudo registrar la metadata del antecedente.'));
      }

      const newDoc = mapAntecedenteRecord(inserted);
      const existingDocs = antecedentesCacheRef.current[selectedOp.id] || opAntecedentesList;
      const updatedDocs = [...existingDocs, newDoc];

      antecedentesCacheRef.current[selectedOp.id] = updatedDocs;
      setOpAntecedentesList(updatedDocs);
      updateOportunidadField(selectedOp.id, 'antecedentes', updatedDocs);

      await addOportunidadActividad(
        selectedOp.id,
        `Documento antecedente adjuntado: "${newDoc.nombre}" (${newDoc.tipo}) por ${currentUser?.nombre || 'Usuario'}.`,
        'actualizacion'
      );

      setNuevoAntecedenteFile(null);
      setNuevoAntecedenteNombre('');
      setNuevoAntecedenteTipo('contrato');
      setShowAntecedenteModal(false);
    } catch (err) {
      console.error('Error uploading antecedente:', err);
      setAntecedenteErrorMsg(`Error al subir archivo: ${mensajeError(err, 'Error al subir.')}`);
    } finally {
      setAntecedenteUploading(false);
    }
  };

  const handleDeleteAntecedente = async (docId: string) => {
    if (!selectedOp) return; const okDoc = await confirmDialog({ title: 'Eliminar antecedente', message: '¿Eliminar este documento de antecedentes?', confirmLabel: 'Eliminar', destructive: true }); if (!okDoc) return;
    const existingDocs = antecedentesCacheRef.current[selectedOp.id] || opAntecedentesList;
    const updatedDocs = existingDocs.filter((d) => d.id !== docId);

    setOpAntecedentesList(updatedDocs);
    antecedentesCacheRef.current[selectedOp.id] = updatedDocs;
    updateOportunidadField(selectedOp.id, 'antecedentes', updatedDocs);

    if (isUUID(selectedOp.id)) {
      const { error } = await supabase
        .from('oportunidad_antecedentes')
        .update({
          eliminado: true,
          eliminado_en: new Date().toISOString(),
          eliminado_por: currentUser?.id && isUUID(currentUser.id) ? currentUser.id : null,
        })
        .eq('id', docId);

      if (error) {
        antecedentesCacheRef.current[selectedOp.id] = existingDocs;
        setOpAntecedentesList(existingDocs);
        updateOportunidadField(selectedOp.id, 'antecedentes', existingDocs);
        console.error('Error deleting antecedente:', error);
        return;
      }
    }

    await addOportunidadActividad(
      selectedOp.id,
      `Documento antecedente eliminado de la oportunidad.`,
      'actualizacion'
    );
  };

  // Crear nueva Oportunidad
  const handleCreateOportunidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTitulo || !nuevoClienteId) return;

    const newCode = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const validUserId = (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) ? currentUser.id : null;
    const validClienteId = (nuevoClienteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nuevoClienteId)) ? nuevoClienteId : null;

    const payload = {
      codigo: newCode,
      titulo: nuevoTitulo,
      cliente_id: validClienteId,
      tipo_venta: nuevoTipoVenta || 'Instalación',
      origen: nuevoOrigen.trim() || null,
      modalidad_requerimiento: nuevaModalidadRequerimiento,
      estado_pipeline: 'nueva' as const,
      fecha_inicio: today,
      fecha_limite: nuevaFechaLimite || null,
      monto_abonado: 0,
      asignado_a: validUserId,
      productos: [],
    };

    try {
      const { data, error } = await supabase
        .from('oportunidades')
        .insert([payload])
        .select('*, cliente:clientes(*)')
        .single();

      if (!error && data) {
        setOportunidades([data as OportunidadVenta, ...oportunidades]);
        setShowNewOpModal(false);
        setNuevoTitulo('');
        setNuevoClienteId('');
        setNuevaFechaLimite('');
        setNuevoTipoVenta('Instalación');
        setNuevoOrigen('');
        setNuevaModalidadRequerimiento('instalacion');
      } else {
        console.error('Error creating oportunidad in Supabase:', error?.message || error);
        toast({ message: 'No se pudo crear la oportunidad. Revisa los datos e intenta nuevamente.', tone: 'danger' });
      }
    } catch (err) {
      console.error('Error creating oportunidad:', err);
      toast({ message: 'No se pudo conectar con la base de datos. Intenta nuevamente.', tone: 'danger' });
    }
  };

  const handleSaveTitleEdit = () => {
    if (selectedOp && editTitleValue.trim()) {
      updateOportunidadField(selectedOp.id, 'titulo', editTitleValue);
    }
    setIsEditingTitle(false);
  };

  const isUnaccreditedClose = (op: OportunidadVenta) =>
    ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) && deliveryAccreditation[op.id] !== true;
  const perdidasCount = oportunidades.filter(esOportunidadPerdida).length;
  const filteredOportunidades = oportunidades.filter((op) => {
    // 0. Active pipeline vs lost opportunities
    if ((vistaPerdidas === 'perdidas') !== esOportunidadPerdida(op)) {
      return false;
    }

    // 1. Text Search (código, título, cliente nombre, cliente rut)
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase().trim();
      const matchesCodigo = op.codigo?.toLowerCase().includes(q);
      const matchesTitulo = op.titulo?.toLowerCase().includes(q);
      const matchesCliente = op.cliente?.nombre?.toLowerCase().includes(q);
      const matchesRut = op.cliente?.rut?.toLowerCase().includes(q);
      if (!matchesCodigo && !matchesTitulo && !matchesCliente && !matchesRut) {
        return false;
      }
    }

    // 2. Estado
    if (filterEstado !== 'todos' && op.estado_pipeline !== filterEstado) {
      return false;
    }

    // 2.5 Rama Operativa (Producción vs Reventa)
    if (filterRama !== 'todos') {
      if (filterRama === 'produccion' && op.rama_destino !== 'produccion' && !op.estado_pipeline.startsWith('prod_')) {
        return false;
      }
      if (filterRama === 'reventa' && op.rama_destino !== 'reventa' && !op.estado_pipeline.startsWith('rev_')) {
        return false;
      }
    }

    // 3. Tipo de Venta
    if (filterTipoVenta !== 'todos' && op.tipo_venta !== filterTipoVenta) {
      return false;
    }

    // 4. Prioridad
    if (filterPrioridad !== 'todos' && op.prioridad !== filterPrioridad) {
      return false;
    }

    // 5. Asignado
    if (filterAsignado !== 'todos') {
      if (filterAsignado === 'me') {
        if (op.asignado_a !== currentUser?.id) return false;
      } else if (op.asignado_a !== filterAsignado) {
        return false;
      }
    }

    return true;
  });


  return (
    <div className="space-y-6 text-ink relative">
      {/* Toast Alert Flotante Superior Derecho */}
      {toastAlert && (
        <div className="fixed top-20 right-6 z-50 bg-surface-dark text-white p-4 rounded-lg shadow-sm border border-accent flex items-center gap-3 animate-slideDown max-w-sm">
          <div className="bg-accent p-2 rounded-md text-on-accent shrink-0">
            <AtSign className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 text-xs">
            <span className="font-semibold text-accent-ink block">{toastAlert.user}</span>
            <p className="font-medium text-ink-subtle">{toastAlert.message}</p>
          </div>
          <button onClick={() => setToastAlert(null)} className="text-ink-subtle hover:text-white p-1 ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!selectedOp ? (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted p-1">
          {([
            { id: 'activas' as const, label: 'Activas', count: oportunidades.length - perdidasCount },
            { id: 'perdidas' as const, label: 'Perdidas', count: perdidasCount },
          ]).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVistaPerdidas(v.id)}
              aria-pressed={vistaPerdidas === v.id}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                vistaPerdidas === v.id ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span>{v.label}</span>
              <span className="t-num text-[11px] opacity-80">{v.count}</span>
            </button>
          ))}
        </div>
        {vistaPerdidas === 'activas' && (
        <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-muted p-1">
          <button
            type="button"
            onClick={() => setViewType('lista')}
            aria-pressed={viewType === 'lista'}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewType === 'lista' ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Lista</span>
          </button>
          <button
            type="button"
            onClick={() => setViewType('tablero')}
            aria-pressed={viewType === 'tablero'}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              viewType === 'tablero' ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Kanban className="h-3.5 w-3.5" />
            <span>Tablero</span>
          </button>
        </div>
        )}
        </div>

        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              aria-label="Buscar oportunidad o cliente"
              placeholder="Buscar cliente, código, RUT..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full rounded-control border border-line bg-surface py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowNewOpModal(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva Oportunidad</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-ink-muted font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : vistaPerdidas === 'perdidas' ? (
        <section className="overflow-hidden rounded-panel border border-line bg-surface">
          {filteredOportunidades.length === 0 ? (
            <p className="px-4 py-4 text-xs font-medium text-ink-muted">No hay oportunidades perdidas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Oportunidad</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Detalle</th>
                    <th className="px-4 py-2">Fecha perdida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {[...filteredOportunidades]
                    .sort((a, b) => (b.perdida_at || '').localeCompare(a.perdida_at || ''))
                    .map((op) => (
                      <tr key={op.id} onClick={() => handleOpenOportunidad(op)} className="cursor-pointer transition hover:bg-surface-muted">
                        <td className="t-num px-4 py-2.5 font-semibold text-ink">{op.codigo}</td>
                        <td className="max-w-[260px] truncate px-4 py-2.5 text-ink-muted">{op.titulo}</td>
                        <td className="px-4 py-2.5 text-ink">{op.cliente?.nombre || '—'}</td>
                        <td className="px-4 py-2.5 text-ink">{motivoPerdidaLabel(op.perdida_motivo)}</td>
                        <td className="max-w-[260px] truncate px-4 py-2.5 text-ink-muted">{op.perdida_detalle || '—'}</td>
                        <td className="t-num px-4 py-2.5 text-ink-muted">{op.perdida_at ? new Date(op.perdida_at).toLocaleDateString('es-CL') : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : viewType === 'lista' ? (
        <div className="space-y-4">
          {pipelineStates.map((stage) => {
            const rows = sortOpportunities(filteredOportunidades.filter((o) => o.estado_pipeline === stage.id));
            const total = rows.reduce((acc, curr) => acc + getOportunidadTotalValue(curr), 0);
            const isTargetColumn = dragOverColumn === stage.id;
            return (
              <section
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={clsx('overflow-hidden rounded-panel border bg-surface transition', isTargetColumn ? 'border-accent ring-2 ring-accent/20' : 'border-line')}
              >
                <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted/40 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full border', stage.color, stage.bg)} />
                    <h3 className="truncate text-sm font-semibold text-ink">{stage.label}</h3>
                    <span className="rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink-muted">{rows.length}</span>
                  </div>
                  {total > 0 && <span className="t-num text-xs font-semibold text-ink-muted">${total.toLocaleString('es-CL')}</span>}
                </header>
                {rows.length === 0 ? (
                  <p className="px-4 py-4 text-xs font-medium text-ink-muted">No hay oportunidades en esta etapa.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        <tr>
                          <th className="px-4 py-2">Código</th>
                          <th className="px-4 py-2">Cliente</th>
                          <th className="px-4 py-2">Oportunidad</th>
                          <th className="px-4 py-2 text-right">Monto</th>
                          <th className="px-4 py-2 text-right">Abonado</th>
                          <th className="px-4 py-2">Responsable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {rows.map((op) => (
                          <tr
                            key={op.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, op.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleOpenOportunidad(op)}
                            className="cursor-pointer transition hover:bg-surface-muted"
                          >
                            <td className="t-num px-4 py-2.5 font-semibold text-ink">{op.codigo}</td>
                            <td className="px-4 py-2.5 text-ink">{op.cliente?.nombre || '—'}</td>
                            <td className="max-w-[260px] truncate px-4 py-2.5 text-ink-muted">{op.titulo}</td>
                            <td className="t-num px-4 py-2.5 text-right text-ink">${getOportunidadTotalValue(op).toLocaleString('es-CL')}</td>
                            <td className="t-num px-4 py-2.5 text-right text-ink-muted">${getOportunidadAbonadoValue(op).toLocaleString('es-CL')}</td>
                            <td className="px-4 py-2.5 text-ink-muted">{usuariosApp.find((u) => u.id === op.asignado_a)?.nombre || 'Sin asignar'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3">
          {pipelineStates.map((stage) => {
            const colOps = sortOpportunities(filteredOportunidades.filter((o) => o.estado_pipeline === stage.id));
            const isTargetColumn = dragOverColumn === stage.id;
            const totalColMonto = colOps.reduce((acc, curr) => acc + getOportunidadTotalValue(curr), 0);

            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={clsx(
                  'flex h-[calc(100vh-230px)] min-h-[460px] w-[290px] shrink-0 snap-start flex-col rounded-panel border p-3 transition',
                  isTargetColumn ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : 'border-line bg-surface-muted/30'
                )}
              >
                <div className="mb-3 flex shrink-0 items-center justify-between border-b border-line pb-2.5">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full border', stage.color, stage.bg)} />
                    <h4 className="truncate text-xs font-bold text-ink">{stage.label}</h4>
                    <span className="shrink-0 rounded-full border border-line bg-surface px-1.5 text-[11px] font-semibold text-ink-muted">{colOps.length}</span>
                  </div>
                  {totalColMonto > 0 && (
                    <span className="t-num shrink-0 text-[11px] font-semibold text-ink-muted" title={`Total acumulado: $${totalColMonto.toLocaleString('es-CL')}`}>
                      ${Math.round(totalColMonto / 1000).toLocaleString('es-CL')}k
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto">
                  {colOps.map((op) => {
                    const latestQuote = getActiveQuote(op);
                    const montoTotal = getOportunidadTotalValue(op);
                    const montoAbonado = getOportunidadAbonadoValue(op);
                    return (
                      <KanbanCard
                        key={op.id}
                        oportunidad={op}
                        assignedUser={usuariosApp.find((u) => u.id === op.asignado_a)}
                        montoTotal={montoTotal}
                        montoAbonado={montoAbonado}
                        saldoPendiente={Math.max(0, montoTotal - montoAbonado)}
                        latestQuoteVersion={latestQuote?.version}
                        isUnaccredited={isUnaccreditedClose(op)}
                        isBeingDragged={draggedOpId === op.id}
                        onDragStart={(e) => handleDragStart(e, op.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleOpenOportunidad(op)}
                        onDelete={() => {
                          setDeleteOpError('');
                          setOpToDelete(op);
                        }}
                      />
                    );
                  })}
                  {colOps.length === 0 && (
                    <div className="flex min-h-24 items-center justify-center rounded-control border border-dashed border-line bg-surface/50 text-xs font-medium text-ink-muted">
                      Sin oportunidades
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      ) : (
        <div className="bg-surface text-ink border border-line rounded-lg w-full h-[88vh] flex flex-col relative overflow-hidden">
          {/* Barra superior: menú de acciones y cierre */}
          <div className="flex shrink-0 items-center justify-end gap-1 border-b border-line px-4 py-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={opMenuOpen}
                aria-label="Más acciones"
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {opMenuOpen && (
                <>
                  <button type="button" aria-label="Cerrar menú" tabIndex={-1} onClick={() => setOpMenuOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                  <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]">
                    {esOportunidadPerdida(selectedOp) ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setOpMenuOpen(false); void reabrirOportunidad(selectedOp); }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-surface-muted"
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span>Reabrir oportunidad</span>
                      </button>
                    ) : puedeMarcarsePerdida(selectedOp) && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setOpMenuOpen(false); abrirMarcarPerdida(selectedOp); }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-surface-muted"
                      >
                        <Ban className="h-4 w-4" />
                        <span>Marcar como perdida</span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpMenuOpen(false); setDeleteOpError(''); setOpToDelete(selectedOp); }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-danger transition hover:bg-danger-soft"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Eliminar oportunidad</span>
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleCloseOportunidad}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              title="Cerrar y volver al pipeline de ventas"
              aria-label="Cerrar oportunidad"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

        <div ref={modalContainerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Columna Izquierda: Pestañas en sitio de la Oportunidad */}
          <div
            style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${modalLeftColRatio}%` : '100%' }}
            className="flex min-h-0 flex-col overflow-hidden shrink-0 md:flex-row lg:h-full"
          >
            {/* Navegación lateral vertical + contenido */}
              <nav aria-label="Secciones de la oportunidad" className={clsx('flex shrink-0 gap-1 overflow-x-auto border-b border-line p-3 transition-[width] duration-150 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r', railCollapsed ? 'md:w-16' : 'md:w-64')}>
                <button
                  type="button"
                  onClick={toggleRail}
                  aria-expanded={!railCollapsed}
                  aria-label={railCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
                  title={railCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
                  className={clsx('hidden shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-subtle transition hover:bg-surface-muted hover:text-ink md:flex', railCollapsed && 'justify-center')}
                >
                  {railCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <><PanelLeftClose className="h-4 w-4" aria-hidden /><span>Contraer</span></>}
                </button>
                {([
                  { id: 'resumen' as const, label: 'Resumen', icon: LayoutList, count: null as number | null },
                  { id: 'cotizaciones' as const, label: 'Cotizaciones y pagos', icon: FileText, count: allCotizaciones.filter((c) => c.oportunidad_id === selectedOp.id).length },
                  { id: 'abastecimiento' as const, label: 'Abastecimiento y OC', icon: ShoppingCart, count: opOrdenesCompra.length },
                  { id: 'operacion' as const, label: 'Producción y logística', icon: Factory, count: null as number | null },
                ]).map((t) => {
                  const active = opDetailTab === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOpDetailTab(t.id)}
                      aria-current={active ? 'page' : undefined}
                      title={railCollapsed ? t.label : undefined}
                      aria-label={t.label}
                      className={clsx(
                        'flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition',
                        railCollapsed && 'md:justify-center',
                        active ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                      )}
                    >
                      <Icon className={clsx('h-3.5 w-3.5 shrink-0', active ? 'text-accent-ink' : 'text-ink-subtle')} aria-hidden />
                      <span className={clsx('min-w-0 flex-1', railCollapsed && 'md:hidden')}>{t.label}</span>
                      {t.count !== null && t.count > 0 && !railCollapsed && (
                        <span className="t-num rounded-full bg-surface px-1.5 text-[11px] font-semibold text-ink-muted ring-1 ring-line">{t.count}</span>
                      )}
                    </button>
                  );
                })}
              </nav>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-5">
            {/* Título Principal Editable Inline (Tipografía estandarizada t-page) */}
            <div className="flex shrink-0 items-center justify-between pb-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    className="bg-surface t-page text-ink border border-accent rounded-md px-3 py-1 w-full focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitleEdit}
                    className="bg-accent hover:bg-accent-hover text-on-accent p-2 rounded-md transition font-semibold"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => {
                    setIsEditingTitle(true);
                    setEditTitleValue(selectedOp.titulo);
                  }}
                  className="flex items-center gap-2.5 cursor-pointer group min-w-0"
                >
                  <h2 className="truncate text-[28px] font-bold leading-tight tracking-tight text-ink transition group-hover:text-accent-ink">
                    {selectedOp.titulo}
                  </h2>
                  <Edit className="w-4 h-4 text-ink-subtle group-hover:text-accent-ink transition opacity-0 group-hover:opacity-100 shrink-0" />
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-0.5 pb-5 text-xs text-ink-muted">
              {esOportunidadPerdida(selectedOp) && (
                <div className="flex flex-wrap items-center gap-2 pb-1.5">
                  <StatusBadge tone="danger">Perdida</StatusBadge>
                  <span className="font-semibold text-ink">{motivoPerdidaLabel(selectedOp.perdida_motivo)}</span>
                  {selectedOp.perdida_detalle && <span>— {selectedOp.perdida_detalle}</span>}
                  {selectedOp.perdida_at && <span className="t-num">· {new Date(selectedOp.perdida_at).toLocaleDateString('es-CL')}</span>}
                </div>
              )}
              <p>
                ID: <span className="t-num font-semibold text-ink">{selectedOp.codigo}</span>
              </p>
              <p>
                Cliente:{' '}
                <Link
                  href={`/clientes/${selectedOp.cliente_id}?desde=${encodeURIComponent(selectedOp.id)}&desdeTitulo=${encodeURIComponent(selectedOp.titulo || selectedOp.codigo || 'Oportunidad')}`}
                  className="font-semibold text-ink underline-offset-2 transition hover:text-accent-ink hover:underline"
                >
                  {selectedOp.cliente?.nombre || 'Ver cliente'}
                </Link>
              </p>
            </div>

            {/* Contenido de la Pestaña Activa */}
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-2 text-xs">
              {isUnaccreditedClose(selectedOp) && (
                <p role="alert" className="rounded-md border border-warning/30 bg-warning-soft p-3 text-xs font-semibold text-warning-ink">
                  Esta venta figura cerrada en el historial, pero su entrega no tiene respaldo acreditado. La cobranza automática permanece suspendida.
                </p>
              )}

              {/* =========================================================
                  PESTAÑA 1: RESUMEN Y VISITA (Vista Principal de Oportunidad)
                 ========================================================= */}
              {opDetailTab === 'resumen' && (
                <>
                  {/* Resumen visible: campos de decisión y seguimiento rápido */}
                  {selectedOp.origen?.trim().toLowerCase() === 'whatsapp' && <CapturedDataPending />}
                  <section aria-label="Propiedades de la oportunidad" className="space-y-1 pb-2">
                    <div className="grid grid-cols-1 gap-y-0.5 pt-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Disc className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Estado</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <Select
                              value={selectedOp.estado_pipeline}
                              disabled={esOportunidadPerdida(selectedOp)}
                              onChange={async (e) => {
                                const newStage = e.target.value as EstadoPipeline;
                                await moveOportunidadToState(selectedOp.id, newStage);
                              }}
                              className="w-full h-full appearance-none bg-transparent hover:bg-surface-muted text-ink font-semibold text-xs pl-3 pr-8 rounded-md border border-transparent hover:border-line cursor-pointer focus:outline-none focus:border-accent transition"
                            >
                              {pipelineStates.map((etapa) => (
                                <option key={etapa.id} value={etapa.id}>{etapa.label}</option>
                              ))}
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <User className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Vendedor</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <Select
                              value={selectedOp.asignado_a || ''}
                              onChange={async (e) => {
                                const newUserId = e.target.value || null;
                                updateOportunidadField(selectedOp.id, 'asignado_a', newUserId);
                                const userObj = usuariosApp.find((u) => u.id === newUserId);
                                await addOportunidadActividad(selectedOp.id, `Vendedor asignado actualizado a "${userObj?.nombre || 'Sin asignar'}".`);
                              }}
                              className={`w-full h-full appearance-none bg-transparent hover:bg-surface-muted border border-transparent hover:border-line rounded-md pl-3 pr-8 text-xs font-semibold truncate focus:outline-none focus:border-accent transition cursor-pointer ${
                                selectedOp.asignado_a ? 'text-ink' : 'text-ink-subtle font-normal'
                              }`}
                            >
                              <option value="">Sin asignar</option>
                              {usuariosApp.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nombre}
                                </option>
                              ))}
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Calendar className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Fechas</span>
                          </div>
                          <div className="flex w-[408px] max-w-full min-w-0 items-center gap-1.5">
                            <DateInput
                              value={selectedOp.fecha_inicio || ''}
                              onChange={async (e) => {
                                const newDate = e.target.value;
                                updateOportunidadField(selectedOp.id, 'fecha_inicio', newDate);
                                await addOportunidadActividad(selectedOp.id, `Fecha de inicio actualizada a ${newDate} desde el detalle.`);
                              }}
                              className="w-[190px]"
                              placeholder="Elegir fecha de inicio"
                              title="Fecha de inicio"
                            />
                            <span className="text-ink-subtle">→</span>
                            <DateInput
                              value={selectedOp.fecha_limite || ''}
                              onChange={async (e) => {
                                const newDate = e.target.value;
                                updateOportunidadField(selectedOp.id, 'fecha_limite', newDate);
                                await addOportunidadActividad(selectedOp.id, `Fecha límite actualizada a ${newDate} desde el detalle.`);
                              }}
                              className="w-[190px]"
                              placeholder="Elegir fecha de finalización"
                              title="Fecha límite"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Flag className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Prioridad</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                              <Flag className={`w-3.5 h-3.5 ${
                                selectedOp.prioridad === 'urgente' ? 'text-danger' : selectedOp.prioridad === 'alta' ? 'text-warning-ink' : selectedOp.prioridad === 'normal' ? 'text-info' : 'text-ink-subtle'
                              }`} />
                            </div>
                            <Select
                              value={selectedOp.prioridad || ''}
                              onChange={async (e) => {
                                const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                                updateOportunidadField(selectedOp.id, 'prioridad', newPrio || null);
                                await addOportunidadActividad(selectedOp.id, `Prioridad cambiada a "${newPrio || 'normal'}" desde el detalle.`);
                              }}
                              className={`w-full h-full appearance-none bg-transparent hover:bg-surface-muted border border-transparent hover:border-line rounded-md pl-8 pr-8 text-xs font-semibold focus:outline-none focus:border-accent transition cursor-pointer ${
                                selectedOp.prioridad ? 'text-ink' : 'text-ink-subtle font-normal'
                              }`}
                            >
                              <option value="">Sin prioridad</option>
                              <option value="normal">Normal</option>
                              <option value="alta">Alta</option>
                              <option value="urgente">Urgente</option>
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Compass className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Origen</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <Select
                              value={selectedOp.origen || ''}
                              onChange={async (e) => {
                                const origen = e.target.value;
                                updateOportunidadField(selectedOp.id, 'origen', origen || null);
                                await addOportunidadActividad(
                                  selectedOp.id,
                                  origen ? `Origen actualizado a "${origen}".` : 'Origen de la oportunidad eliminado.'
                                );
                              }}
                              className={`w-full h-full appearance-none bg-transparent hover:bg-surface-muted border border-transparent hover:border-line rounded-md pl-3 pr-8 text-xs font-semibold focus:outline-none focus:border-accent transition cursor-pointer ${
                                selectedOp.origen ? 'text-ink' : 'text-ink-subtle font-normal'
                              }`}
                            >
                              <option value="">Sin origen</option>
                              {origenes.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                              {selectedOp.origen && !origenes.includes(selectedOp.origen) && (
                                <option value={selectedOp.origen}>{selectedOp.origen}</option>
                              )}
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Tag className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Tipo de venta</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <Select
                              value={selectedOp.tipo_venta || 'Instalación'}
                              onChange={async (e) => {
                                const newTipo = e.target.value;
                                updateOportunidadField(selectedOp.id, 'tipo_venta', newTipo);
                                await addOportunidadActividad(selectedOp.id, `Tipo de venta cambiado a "${newTipo}" desde el detalle.`);
                              }}
                              className="w-full h-full appearance-none bg-transparent hover:bg-surface-muted border border-transparent hover:border-line rounded-md pl-3 pr-8 text-xs font-semibold text-ink focus:outline-none focus:border-accent transition cursor-pointer"
                            >
                              {tiposVenta.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                              {selectedOp.tipo_venta && !tiposVenta.includes(selectedOp.tipo_venta) && (
                                <option value={selectedOp.tipo_venta}>{selectedOp.tipo_venta}</option>
                              )}
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3 min-h-[36px]">
                          <div className="w-36 flex items-center gap-2.5 t-caption shrink-0">
                            <Layers className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                            <span>Requerimiento</span>
                          </div>
                          <div className="relative h-8 w-[408px] max-w-full">
                            <Select
                              value={selectedOp.modalidad_requerimiento || 'instalacion'}
                              onChange={async (e) => {
                                const value = e.target.value as 'solo_material' | 'instalacion';
                                updateOportunidadField(selectedOp.id, 'modalidad_requerimiento', value);
                                await addOportunidadActividad(
                                  selectedOp.id,
                                  `Requerimiento actualizado a "${value === 'solo_material' ? 'Sólo material' : 'Instalación'}".`
                                );
                              }}
                              className="w-full h-full appearance-none bg-transparent hover:bg-surface-muted border border-transparent hover:border-line rounded-md pl-3 pr-8 text-xs font-semibold text-ink focus:outline-none focus:border-accent transition cursor-pointer"
                            >
                              <option value="instalacion">Instalación</option>
                              <option value="solo_material">Sólo material</option>
                            </Select>
                            <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Visitas a terreno */}
                  <section aria-label="Visitas a terreno" className="border-t border-line pt-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="t-section text-ink flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-accent-ink" />
                        <span>Visitas a terreno</span>
                        <span className="t-num rounded-full bg-surface-muted px-2 text-[11px] font-semibold text-ink-muted">{opVisitasList.length}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowAddVisitaForm(true)}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agendar visita a terreno</span>
                      </button>
                    </div>

                    <Dialog
                      open={showAddVisitaForm}
                      onClose={() => setShowAddVisitaForm(false)}
                      title="Agendar visita a terreno"
                      footer={
                        <>
                          <Button onClick={() => setShowAddVisitaForm(false)}>Cancelar</Button>
                          <Button variant="primary" disabled={!newVisitaFecha || !newVisitaTecnico} onClick={handleGuardarVisita}>Guardar visita</Button>
                        </>
                      }
                    >
                      <div className="space-y-4">
                        <Field label="Responsable" required>
                          {(f) => (
                            <Select {...f} value={newVisitaTecnico} onChange={(e) => setNewVisitaTecnico(e.target.value)}>
                              <option value="">Selecciona responsable</option>
                              {responsablesVisitas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </Select>
                          )}
                        </Field>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Fecha" required>
                            {(f) => <DateInput {...f} className="t-num" value={newVisitaFecha} onChange={(e) => setNewVisitaFecha(e.target.value)} />}
                          </Field>
                          <Field label="Hora">
                            {(f) => <TextInput {...f} type="time" className="t-num" value={newVisitaHora} onChange={(e) => setNewVisitaHora(e.target.value)} />}
                          </Field>
                        </div>
                        <Field label="Notas para el técnico">
                          {(f) => <TextInput {...f} value={newVisitaNotas} onChange={(e) => setNewVisitaNotas(e.target.value)} placeholder="Ej: medir acceso y tomar plantilla" />}
                        </Field>
                      </div>
                    </Dialog>

                    {opVisitasList.length === 0 ? null : (
                      <ul className="divide-y divide-line-subtle rounded-lg border border-line">
                        {opVisitasList.map((vis) => (
                          <li key={vis.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <span className="t-num block font-semibold text-ink">
                                {vis.fecha_visita_terreno}{vis.hora_visita_terreno ? ` · ${vis.hora_visita_terreno}` : ''}
                              </span>
                              <span className="t-caption block truncate">
                                {getResponsableVisitaNombre(vis)}{vis.observaciones_visita ? ` — ${vis.observaciones_visita}` : ''}
                              </span>
                            </div>
                            <StatusBadge tone={vis.estado_visita === 'realizada' ? 'success' : vis.estado_visita === 'cancelada' ? 'danger' : 'accent'}>
                              {vis.estado_visita || 'programada'}
                            </StatusBadge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Documentos y antecedentes */}
                  <section aria-label="Documentos y antecedentes" className="border-t border-line pt-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="t-section text-ink flex items-center gap-1.5">
                      <Paperclip className="w-4 h-4 text-accent-ink" />
                      <span>Documentos y antecedentes</span>
                      <span className="t-num rounded-full bg-surface-muted px-2 text-[11px] font-semibold text-ink-muted">{opAntecedentesList.length}</span>
                    </h3>
                      <button
                        type="button"
                        onClick={() => { setAntecedenteErrorMsg(''); setShowAntecedenteModal(true); }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Subir documento</span>
                      </button>
                      </div>

                    <Dialog
                      open={showAntecedenteModal}
                      onClose={() => setShowAntecedenteModal(false)}
                      title="Subir contrato o documento"
                      footer={
                        <>
                          <Button onClick={() => setShowAntecedenteModal(false)}>Cancelar</Button>
                          <Button variant="primary" disabled={!nuevoAntecedenteFile || antecedenteUploading} onClick={handleUploadAntecedente}>
                            {antecedenteUploading ? 'Subiendo...' : 'Subir documento'}
                          </Button>
                        </>
                      }
                    >
                      <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="t-caption font-semibold text-ink">1. Tipo de documento</p>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['contrato', 'Contrato'],
                            ['anexo', 'Anexo'],
                            ['documento_empresa', 'Doc. empresa'],
                            ['otro', 'Otro'],
                          ] as [TipoAntecedenteDocumento, string][]).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNuevoAntecedenteTipo(value)}
                              aria-pressed={nuevoAntecedenteTipo === value}
                              className={clsx(
                                'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                                nuevoAntecedenteTipo === value ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-muted hover:text-ink'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="t-caption font-semibold text-ink">2. Archivo</p>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-surface px-4 py-3 transition hover:border-accent">
                          <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                          <span className={clsx('min-w-0 flex-1 truncate text-xs', nuevoAntecedenteFile ? 'font-semibold text-ink' : 'text-ink-muted')}>
                            {nuevoAntecedenteFile ? nuevoAntecedenteFile.name : 'Haz clic para elegir un archivo'}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null;
                              setNuevoAntecedenteFile(f);
                              if (f && !nuevoAntecedenteNombre) setNuevoAntecedenteNombre(f.name);
                            }}
                          />
                        </label>
                      </div>

                        {antecedenteErrorMsg && <p className="text-xs font-medium text-danger">{antecedenteErrorMsg}</p>}
                      </div>
                    </Dialog>
                    {antecedenteErrorMsg && <p className="text-xs font-medium text-danger">{antecedenteErrorMsg}</p>}

                    {opAntecedentesList.length === 0 ? null : (
                      <ul className="divide-y divide-line-subtle rounded-lg border border-line">
                        {opAntecedentesList.map((doc) => (
                          <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                            <FileText className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block truncate font-semibold text-ink hover:text-accent-ink hover:underline">
                                {doc.nombre}
                              </a>
                              <span className="t-caption block truncate">{doc.tipo} · {doc.subido_por}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteAntecedente(doc.id)}
                              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-ink-subtle transition hover:bg-danger-soft hover:text-danger"
                              title="Eliminar documento"
                              aria-label="Eliminar documento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}

              {/* =========================================================
                  PESTAÑA 2: COTIZACIONES Y PAGOS (En Sitio)
                 ========================================================= */}
              {opDetailTab === 'cotizaciones' && (() => {
                const opQuotes = allCotizaciones.filter((c) => c.oportunidad_id === selectedOp.id);
                const activeQuote = getActiveQuote(selectedOp);
                const candidateQuotes = allCotizaciones.filter(
                  (c) => c.cliente_id === selectedOp.cliente_id && c.oportunidad_id !== selectedOp.id
                );
                const totalCot = getOportunidadTotalValue(selectedOp);
                const abonado = getOportunidadAbonadoValue(selectedOp);
                const saldo = Math.max(0, totalCot - abonado);
                const pagosList = Array.isArray(selectedOp.comprobantes_pago)
                  ? selectedOp.comprobantes_pago.filter((p) => typeof p === 'object' && p !== null && 'monto' in p)
                  : [];

                const enviarAbono = async () => {
                              const montoNum = Number(nuevoAbonoMonto);
                              if (!montoNum || montoNum <= 0 || !nuevoAbonoFile) return;
                              setAbonoSaving(true);
                              setAbonoErrorMsg('');
                              try {
                                const cleanName = nuevoAbonoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                const storagePath = `comprobantes/${selectedOp.id}/${Date.now()}_${cleanName}`;
                                const { error: upErr } = await supabase.storage
                                  .from('documentos')
                                  .upload(storagePath, nuevoAbonoFile, { upsert: false });
                                if (upErr) throw upErr;
                                await guardarAbono('crear', {
                                  id: `pago-${Date.now()}`,
                                  monto: montoNum,
                                  fecha: new Date().toLocaleDateString('es-CL'),
                                  fecha_iso: new Date().toISOString(),
                                  comprobante_url: storagePath,
                                  comprobante_nombre: nuevoAbonoFileName || nuevoAbonoFile.name,
                                  nota: nuevoAbonoNota.trim() || 'Abono registrado',
                                  creado_por: currentUser?.nombre || 'Comercial',
                                  estado: 'pendiente',
                                });
                                // eslint-disable-next-line react-hooks/refs -- falso positivo: el ref solo se lee al ejecutar el manejador, no al renderizar
                                await addOportunidadActividad(
                                  selectedOp.id,
                                  `Abono registrado por $${montoNum.toLocaleString('es-CL')} (pendiente de validación en Caja).`,
                                  'abono'
                                );
                                setNuevoAbonoMonto('');
                                setNuevoAbonoNota('');
                                setNuevoAbonoFile(null);
                                setNuevoAbonoFileName('');
                                setShowAbonoModal(false);
                              } catch (err) {
                                setAbonoErrorMsg(mensajeError(err, 'No se pudo registrar el abono.'));
                              } finally {
                                setAbonoSaving(false);
                              }
                };

                return (
                  <div className="space-y-6">
                    {/* Tarjeta de Resumen Financiero y Matriz de Costos */}
                    <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="t-section text-ink flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4 text-accent-ink" />
                          <span>Resumen Financiero y Matriz de Costos</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowUnifiedCotModal(true)}
                          className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        >
                          <FilePlus className="w-3.5 h-3.5" />
                          <span>Crear nueva cotización</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="rounded-lg border border-line bg-surface-muted/50 p-2.5">
                          <span className="t-caption block">Total comercial</span>
                          <strong className="text-sm font-semibold text-ink t-num block mt-0.5">${totalCot.toLocaleString('es-CL')}</strong>
                        </div>
                        <div className="rounded-lg border border-line bg-surface-muted/50 p-2.5">
                          <span className="t-caption block">Validado en Caja</span>
                          <strong className="text-sm font-semibold text-success t-num block mt-0.5">${abonado.toLocaleString('es-CL')}</strong>
                        </div>
                        <div className="rounded-lg border border-line bg-surface-muted/50 p-2.5">
                          <span className="t-caption block">Saldo pendiente</span>
                          <strong className="text-sm font-semibold text-warning-ink t-num block mt-0.5">${saldo.toLocaleString('es-CL')}</strong>
                        </div>
                        <div className="rounded-lg border border-line bg-surface-muted/50 p-2.5">
                          <span className="t-caption block">Costo OC / Directo</span>
                          <strong className="text-sm font-semibold text-ink t-num block mt-0.5">
                            ${Number(margenOp?.costo_compras_asignadas ?? margenOp?.costo_directo_total ?? 0).toLocaleString('es-CL')}
                          </strong>
                        </div>
                      </div>
                    </section>

                    {/* Listado de Cotizaciones de la Oportunidad */}
                    <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="t-section text-ink">Cotizaciones vinculadas ({opQuotes.length})</h3>
                        <button
                          type="button"
                          onClick={() => { setSelectedCandidateCotIds([]); setVincularCotBusqueda(''); setShowVincularCotModal(true); }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Vincular cotización</span>
                        </button>
                      </div>

                      <Dialog
                        open={showVincularCotModal}
                        onClose={() => setShowVincularCotModal(false)}
                        title="Vincular cotizaciones"
                        footer={
                          <>
                            <Button onClick={() => setShowVincularCotModal(false)}>Cancelar</Button>
                            <Button
                              variant="primary"
                              disabled={vinculandoCot || selectedCandidateCotIds.length === 0}
                              // eslint-disable-next-line react-hooks/refs -- el compilador marca el ref de cierre que usan los handlers de oportunidad; aquí solo se invoca en un click
                              onClick={() => void vincularCotizacionesSeleccionadas(selectedOp)}
                            >
                              {vinculandoCot ? 'Vinculando...' : selectedCandidateCotIds.length > 1 ? `Vincular ${selectedCandidateCotIds.length} cotizaciones` : 'Vincular cotización'}
                            </Button>
                          </>
                        }
                      >
                        {(() => {
                          const q = vincularCotBusqueda.trim().toLowerCase();
                          const filtradas = candidateQuotes.filter((cq) =>
                            !q || `${cq.numero_cotizacion} ${cq.monto_total ?? ''} ${cq.estado ?? ''}`.toLowerCase().includes(q)
                          );
                          return (
                            <div className="space-y-3">
                              <TextInput
                                type="search"
                                aria-label="Buscar cotización"
                                placeholder="Buscar por número o monto..."
                                value={vincularCotBusqueda}
                                onChange={(e) => setVincularCotBusqueda(e.target.value)}
                                autoFocus
                              />
                              <ul className="max-h-72 divide-y divide-line-subtle overflow-y-auto rounded-control border border-line" role="listbox" aria-multiselectable="true" aria-label="Cotizaciones del cliente">
                                {filtradas.map((cq) => {
                                  const checked = selectedCandidateCotIds.includes(cq.id);
                                  return (
                                    <li key={cq.id}>
                                      <label className={clsx('flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-surface-muted', checked && 'bg-accent-soft')}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => setSelectedCandidateCotIds((prev) => checked ? prev.filter((id) => id !== cq.id) : [...prev, cq.id])}
                                          className="h-4 w-4 accent-[var(--hg-accent)]"
                                        />
                                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{cq.numero_cotizacion}</span>
                                        <span className="t-num shrink-0 text-ink-muted">${(cq.monto_total || 0).toLocaleString('es-CL')}</span>
                                      </label>
                                    </li>
                                  );
                                })}
                              </ul>
                              {cotizacionErrorMsg && <p className="text-xs font-medium text-danger">{cotizacionErrorMsg}</p>}
                            </div>
                          );
                        })()}
                      </Dialog>

                      {cotizacionErrorMsg && !showVincularCotModal && <p className="text-xs text-danger font-medium">{cotizacionErrorMsg}</p>}

                      {opQuotes.length === 0 ? null : (
                        <div className="divide-y divide-line-subtle">
                          {opQuotes.map((cot) => {
                            const isVigente = activeQuote?.id === cot.id;
                            return (
                              <div key={cot.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <CodeStamp>{cot.numero_cotizacion}</CodeStamp>
                                    {cot.version && <span className="t-caption">v{cot.version}</span>}
                                    {isVigente && <StatusBadge tone="success">Vigente</StatusBadge>}
                                  </div>
                                  <div className="t-caption t-num">
                                    Fecha: {cot.created_at ? new Date(cot.created_at).toLocaleDateString('es-CL') : '—'} · Total: <strong className="text-ink">${Number(cot.monto_total || 0).toLocaleString('es-CL')}</strong>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Select
                                    value={cot.estado}
                                    onChange={async (e) => {
                                      try {
                                        const nuevoEstado = e.target.value as EstadoCotizacion;
                                        const cotizacionActualId = await guardarCambioCotizacion(cot, { estado: nuevoEstado });
                                        const op = selectedOp;
                                        // A rejected current quote only suggests closing as lost; never automatic.
                                        if (sugerirPerdidaPorRechazo({ ...op, cotizacion_actual_id: cotizacionActualId ?? undefined }, { id: cot.id, estado: nuevoEstado })) {
                                          toast({
                                            message: 'Cotización rechazada. ¿Quieres marcar la oportunidad como perdida?',
                                            tone: 'info',
                                            action: { label: 'Marcar como perdida', onClick: () => abrirMarcarPerdida(op) },
                                          });
                                        }
                                      } catch (err) {
                                        setCotizacionErrorMsg(mensajeError(err));
                                      }
                                    }}
                                    className="h-7 rounded-md border border-line bg-surface px-2 text-xs font-semibold text-ink"
                                  >
                                    <option value="borrador">Borrador</option>
                                    <option value="enviada">Enviada</option>
                                    <option value="aprobada">Aprobada</option>
                                    <option value="rechazada">Rechazada</option>
                                  </Select>
                                  <button
                                    type="button"
                                    onClick={() => setPreviewCotizacion(cot)}
                                    className="px-2.5 py-1 rounded-md border border-line bg-surface-muted hover:bg-accent-soft text-ink hover:text-accent-ink font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>PDF</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCotToDeleteInModal(cot)}
                                    className="p-1 text-ink-subtle hover:text-danger transition cursor-pointer"
                                    title="Eliminar cotización"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* Abonos y Comprobantes de Pago */}
                    <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="t-section text-ink">Abonos y Comprobantes de Pago ({pagosList.length})</h3>
                        <button
                          type="button"
                          onClick={() => { setAbonoErrorMsg(''); setShowAbonoModal(true); }}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Registrar abono</span>
                        </button>
                        </div>

                      <Dialog
                        open={showAbonoModal}
                        onClose={() => setShowAbonoModal(false)}
                        title="Registrar abono"
                        footer={
                          <>
                            <Button onClick={() => setShowAbonoModal(false)}>Cancelar</Button>
                            <Button variant="primary" disabled={abonoSaving || !nuevoAbonoMonto || !nuevoAbonoFile} onClick={enviarAbono}>
                              {abonoSaving ? 'Registrando...' : 'Enviar abono a Caja'}
                            </Button>
                          </>
                        }
                      >
                        <div className="space-y-4">
                          <Field label="Monto del abono (CLP)" required>
                            {(f) => <TextInput {...f} type="number" min={1} className="t-num" placeholder="Ej: 450000" value={nuevoAbonoMonto} onChange={(e) => setNuevoAbonoMonto(e.target.value)} />}
                          </Field>
                          <Field label="Nota / referencia">
                            {(f) => <TextInput {...f} placeholder="Ej: Transferencia 50%" value={nuevoAbonoNota} onChange={(e) => setNuevoAbonoNota(e.target.value)} />}
                          </Field>
                          <Field label="Comprobante (PDF o imagen)" required>
                            {(f) => (
                              <TextInput
                                {...f}
                                type="file"
                                accept="image/*,.pdf"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  setNuevoAbonoFile(file);
                                  setNuevoAbonoFileName(file?.name || '');
                                }}
                              />
                            )}
                          </Field>
                          {abonoErrorMsg && <p className="text-xs font-medium text-danger">{abonoErrorMsg}</p>}
                        </div>
                      </Dialog>

                      {abonoErrorMsg && <p className="text-xs text-danger font-medium">{abonoErrorMsg}</p>}

                      {pagosList.length === 0 ? null : (
                        <div className="divide-y divide-line-subtle">
                          {pagosList.map((pago) => (
                            <div key={pago.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <strong className="text-sm font-semibold text-ink t-num">
                                    ${Number(pago.monto || 0).toLocaleString('es-CL')}
                                  </strong>
                                  <StatusBadge
                                    tone={
                                      pago.estado === 'validado'
                                        ? 'success'
                                        : pago.estado === 'rechazado'
                                          ? 'danger'
                                          : 'warning'
                                    }
                                  >
                                    {pago.estado === 'validado'
                                      ? 'Validado en Caja'
                                      : pago.estado === 'rechazado'
                                        ? 'Rechazado'
                                        : 'Pendiente en Caja'}
                                  </StatusBadge>
                                </div>
                                <span className="t-caption block">
                                  {pago.fecha} · {pago.nota || 'Sin nota'}
                                </span>
                              </div>
                              {(pago.comprobante_url || (pago as Record<string, unknown>).url) ? (
                                <button
                                  type="button"
                                  onClick={() => abrirComprobante(String(pago.comprobante_url || (pago as Record<string, unknown>).url))}
                                  className="px-2.5 py-1 rounded-md border border-line bg-surface-muted hover:bg-accent-soft text-ink hover:text-accent-ink font-semibold text-xs cursor-pointer"
                                >
                                  Ver comprobante
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                );
              })()}

              {/* =========================================================
                  PESTAÑA 3: ABASTECIMIENTO Y OC (En Sitio)
                 ========================================================= */}
              {opDetailTab === 'abastecimiento' && (
                <div className="space-y-6">
                  <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="t-section text-ink flex items-center gap-1.5">
                        <ShoppingCart className="w-4 h-4 text-accent-ink" />
                        <span>Órdenes de Compra asignadas ({opOrdenesCompra.length})</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs inline-flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nueva orden de compra</span>
                      </button>
                    </div>

                    {loadingOpOrdenes ? (
                      <p className="t-caption py-3">Cargando órdenes de compra...</p>
                    ) : opOrdenesCompra.length === 0 ? null : (
                      <div className="divide-y divide-line-subtle">
                        {opOrdenesCompra.map((oc) => {
                          const asig = (oc as OrdenCompra & { asignaciones?: OrdenCompraAsignacion[] }).asignaciones?.find(
                            (a) => a.oportunidad_id === selectedOp.id
                          );
                          const montoAsig = asig ? Number(asig.costo_asignado || 0) : Number(oc.monto_total || 0);
                          return (
                            <div key={oc.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <CodeStamp>{oc.numero_oc || oc.id.slice(0, 8)}</CodeStamp>
                                  <span className="font-semibold text-ink">{oc.proveedor?.nombre || 'Proveedor'}</span>
                                  <StatusBadge tone={oc.estado === 'pagada' || oc.estado === 'aprobada' ? 'success' : oc.estado === 'cancelada' ? 'danger' : 'accent'}>
                                    {oc.estado}
                                  </StatusBadge>
                                </div>
                                <span className="t-caption t-num block">
                                  Emisión: {oc.fecha_emision} · Asignado a esta NV: <strong className="text-ink">${montoAsig.toLocaleString('es-CL')}</strong>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPdfPreviewOc(oc)}
                                className="px-2.5 py-1 rounded-md border border-line bg-surface-muted hover:bg-accent-soft text-ink hover:text-accent-ink font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver PDF</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Partidas de la Cotización Vigente */}
                  <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                    <h3 className="t-section text-ink">Partidas de la Cotización Vigente ({cotizacionItemsOp.length})</h3>
                    {cotizacionItemsOp.length === 0 ? null : (
                      <div className="divide-y divide-line-subtle">
                        {cotizacionItemsOp.map((item, idx) => (
                          <div key={item.id || idx} className="py-2 flex items-center justify-between gap-2">
                            <span className="font-medium text-ink truncate">{item.producto || item.descripcion}</span>
                            <span className="t-caption t-num shrink-0">
                              Cant: <strong className="text-ink">{item.cantidad}</strong> · Subtotal: <strong className="text-ink">${Number(item.total_item || 0).toLocaleString('es-CL')}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* =========================================================
                  PESTAÑA 4: PRODUCCIÓN Y GUÍAS (En Sitio)
                 ========================================================= */}
              {opDetailTab === 'operacion' && (
                <div className="space-y-6">
                  {/* Bitácora de Producción Diaria */}
                  <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="t-section text-ink flex items-center gap-1.5">
                      <Factory className="w-4 h-4 text-accent-ink" />
                      <span>Bitácora de Producción Diaria ({opProduccionDiaria.length})</span>
                    </h3>
                      <button
                        type="button"
                        onClick={abrirModalProduccion}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Registrar producción</span>
                      </button>
                      </div>

                    <Dialog
                      open={showProdModal}
                      onClose={() => setShowProdModal(false)}
                      title="Registrar producción diaria"
                      footer={
                        <>
                          <Button onClick={() => setShowProdModal(false)}>Cancelar</Button>
                          <Button
                            variant="primary"
                            disabled={prodSaving || !newProdItemId || newProdCantidad <= 0}
                            onClick={handleRegisterProduccionDiaria}
                          >
                            {prodSaving ? 'Guardando...' : 'Registrar producción'}
                          </Button>
                        </>
                      }
                    >
                      {(() => {
                        const itemSel = cotizacionItemsOp.find((i) => i.id === newProdItemId);
                        const catId = itemSel?.producto_catalogo_id || null;
                        const stockActual = catId ? stockCatalogo[catId] : undefined;
                        return (
                          <div className="space-y-4">
                            <Field label="Producto fabricado" required>
                              {(f) => (
                                <Select {...f} value={newProdItemId} onChange={(e) => setNewProdItemId(e.target.value)}>
                                  {cotizacionItemsOp.filter((i) => i.id).map((i) => (
                                    <option key={i.id} value={i.id}>{i.producto} (pedido: {i.cantidad})</option>
                                  ))}
                                </Select>
                              )}
                            </Field>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Field label="Cantidad fabricada" required>
                                {(f) => (
                                  <TextInput {...f} type="number" min={1} className="t-num" value={newProdCantidad || ''} onChange={(e) => setNewProdCantidad(Number(e.target.value))} />
                                )}
                              </Field>
                              <Field label="Fecha de producción" required>
                                {(f) => <DateInput {...f} className="t-num" value={newProdFecha} onChange={(e) => setNewProdFecha(e.target.value)} />}
                              </Field>
                            </div>
                            <Field label="Responsable">
                              {(f) => (
                                <Select {...f} value={newProdResponsableId} onChange={(e) => setNewProdResponsableId(e.target.value)}>
                                  <option value="">Sin responsable</option>
                                  {responsablesProduccionLogistica.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </Select>
                              )}
                            </Field>
                            <Field label="Observaciones">
                              {(f) => <TextInput {...f} value={newProdObservaciones} onChange={(e) => setNewProdObservaciones(e.target.value)} placeholder="Ej: tanda de la mañana, 2 piezas con falla" />}
                            </Field>
                            <div className="rounded-control border border-line bg-surface-muted/60 px-3 py-2.5 text-xs">
                              {catId ? (
                                <p className="text-ink">
                                  Inventario de <strong>{itemSel?.producto}</strong>:{' '}
                                  <span className="t-num font-semibold">{stockActual ?? '—'}</span>
                                  {newProdCantidad > 0 && stockActual !== undefined && (
                                    <> → <span className="t-num font-semibold text-accent-ink">{stockActual + newProdCantidad}</span> tras esta tanda</>
                                  )}
                                </p>
                              ) : (
                                <p className="text-ink-muted">Esta partida no está vinculada al catálogo de productos, así que no sumará inventario.</p>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </Dialog>

                    {loadingProduccionDiaria ? (
                      <p className="t-caption">Cargando bitácora de producción...</p>
                    ) : opProduccionDiaria.length === 0 ? null : (
                      <div className="divide-y divide-line-subtle">
                        {opProduccionDiaria.map((prod) => (
                          <div key={prod.id} className="py-2 flex items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-ink">{prod.producto}</span>
                              <span className="t-caption t-num block">
                                Fecha: {prod.fecha_produccion} {prod.observaciones ? `· ${prod.observaciones}` : ''}
                              </span>
                            </div>
                            <StatusBadge tone="success">{prod.cantidad_producida} un.</StatusBadge>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Eventos de producción y logística */}
                  {(() => {
                    const contextoEvento: ContextoEventoProduccionLogistica = selectedOp.rama_destino === 'reventa' || selectedOp.estado_pipeline.startsWith('rev_') ? 'reventa_logistica' : 'produccion_logistica';
                    const responsablesEvento = contextoEvento === 'reventa_logistica' ? responsablesReventaLogistica : responsablesProduccionLogistica;
                    const tiposEvento: [TipoEventoProduccionLogistica, string][] = [
                      ['produccion', 'Producción'],
                      ['instalacion', 'Instalación'],
                      ['despacho_cliente', 'Despacho a cliente'],
                      ['retiro_proveedor', 'Retiro en proveedor'],
                      ['obra', 'Obra'],
                      ['postventa', 'Postventa'],
                      ['logistica', 'Logística'],
                    ];
                    return (
                      <section className="border-t border-line pt-5 space-y-3 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="t-section text-ink flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-accent-ink" />
                            <span>Eventos de producción y logística</span>
                            <span className="t-num rounded-full bg-surface-muted px-2 text-[11px] font-semibold text-ink-muted">{opEventosProdLog.length}</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              resetProdLogForm(contextoEvento, 'produccion');
                              setShowAddProdLogEventForm(true);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar evento</span>
                          </button>
                        </div>

                        <Dialog
                          open={showAddProdLogEventForm}
                          onClose={() => { setShowAddProdLogEventForm(false); setEditingProdLogEventId(null); }}
                          title={editingProdLogEventId ? 'Editar evento' : 'Nuevo evento de producción o logística'}
                          footer={
                            <>
                              <Button onClick={() => { setShowAddProdLogEventForm(false); setEditingProdLogEventId(null); }}>Cancelar</Button>
                              <Button variant="primary" disabled={!newProdLogFecha || !newProdLogTitulo.trim()} onClick={() => saveProdLogEvent(contextoEvento)}>
                                {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                              </Button>
                            </>
                          }
                        >
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Field label="Tipo">
                                {(f) => (
                                  <Select {...f} value={newProdLogTipo} onChange={(e) => setNewProdLogTipo(e.target.value as TipoEventoProduccionLogistica)}>
                                    {tiposEvento.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                  </Select>
                                )}
                              </Field>
                              <Field label="Estado">
                                {(f) => (
                                  <Select {...f} value={newProdLogEstado} onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}>
                                    {prodLogEstadoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </Select>
                                )}
                              </Field>
                            </div>
                            <Field label="Título" required>
                              {(f) => <TextInput {...f} value={newProdLogTitulo} onChange={(e) => setNewProdLogTitulo(e.target.value)} />}
                            </Field>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <Field label="Fecha" required>
                                {(f) => <DateInput {...f} className="t-num" value={newProdLogFecha} onChange={(e) => setNewProdLogFecha(e.target.value)} />}
                              </Field>
                              <Field label="Hora">
                                {(f) => <TextInput {...f} type="time" className="t-num" value={newProdLogHora} onChange={(e) => setNewProdLogHora(e.target.value)} />}
                              </Field>
                            </div>
                            <Field label="Responsable">
                              {(f) => (
                                <Select {...f} value={newProdLogResponsableId} onChange={(e) => setNewProdLogResponsableId(e.target.value)}>
                                  <option value="">Sin responsable</option>
                                  {responsablesEvento.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </Select>
                              )}
                            </Field>
                            <Field label="Notas">
                              {(f) => <TextInput {...f} value={newProdLogNotas} onChange={(e) => setNewProdLogNotas(e.target.value)} placeholder="Instrucciones o detalles del evento" />}
                            </Field>
                          </div>
                        </Dialog>

                        {opEventosProdLog.length === 0 ? null : (
                          <ul className="divide-y divide-line-subtle rounded-lg border border-line">
                            {opEventosProdLog.map((ev) => {
                              const { fecha, hora } = getEventDateParts(ev);
                              return (
                                <li key={ev.id} className="flex items-center gap-3 px-4 py-3">
                                  <div className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold text-ink">{ev.titulo}</span>
                                    <span className="t-caption t-num block truncate">
                                      {getProdLogTipoLabel(ev.tipo_evento)} · {fecha} {hora} · {getResponsableEventoNombre(ev)}
                                    </span>
                                  </div>
                                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${getProdLogEstadoClasses(ev.estado)}`}>
                                    {getProdLogEstadoLabel(ev.estado)}
                                  </span>
                                  <button type="button" onClick={() => startEditProdLogEvent(ev)} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-ink-subtle transition hover:bg-surface-muted hover:text-ink" title="Editar evento" aria-label="Editar evento">
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={() => deleteProdLogEvent(ev)} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-ink-subtle transition hover:bg-danger-soft hover:text-danger" title="Eliminar evento" aria-label="Eliminar evento">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </section>
                    );
                  })()}
                </div>
              )}
            </div>
            </div>
          </div>

            {/* Separador redimensionable (delgado, sobre la línea divisoria) */}
            <div
              onMouseDown={handleMouseDownModalResizer}
              className="relative z-20 hidden w-1 shrink-0 cursor-col-resize select-none bg-transparent transition-colors hover:bg-accent/30 active:bg-accent/40 lg:block"
              title="Arrastrar para ajustar el ancho entre Información y Actividad"
            />

            {/* Columna Derecha: Feed de Actividades (Siempre visible junto a cualquier pestaña) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - modalLeftColRatio}%` : '100%' }}
              className="flex-1 border-t border-line lg:border-l lg:border-t-0 flex flex-col justify-between h-[45vh] lg:h-full overflow-hidden shrink-0"
            >
              <OpportunityActivity key={selectedOp.id} onClose={handleCloseOportunidad}>
              <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {/* Header de Actividad con tipografía estandarizada */}
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="t-section text-ink flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-accent-ink" />
                      <span>Actividad</span>
                    </h3>
                    <span className="text-xs bg-surface text-ink font-semibold px-2 py-0.5 rounded-full border border-line t-num">
                      {(selectedOp.chat_interno || []).length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                  </div>
                </div>

                {/* Input de Búsqueda Flotante de Actividad */}
                {showActivitySearch && (
                  <div className="px-5">
                    <input
                      type="text"
                      placeholder="Filtrar mensajes o cambios..."
                      value={activitySearchQuery}
                      onChange={(e) => setActivitySearchQuery(e.target.value)}
                      className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-accent"
                      autoFocus
                    />
                  </div>
                )}

                {/* Feed de Actividades & Comentarios con Scroll Completo y Auto-Scroll al final */}
                <div
                  className="flex-1 overflow-y-auto space-y-3 px-5 text-sm scrollbar-thin relative"
                  ref={activityScrollRef}
                  onScroll={handleActivityScroll}
                >
                  {(() => {
                    const rawList = selectedOp.chat_interno || [];
                    
                    // Filtrar por término de búsqueda y tipo
                    let filteredList = rawList;
                    if (activitySearchQuery.trim()) {
                      const q = activitySearchQuery.toLowerCase();
                      filteredList = filteredList.filter(
                        (m) =>
                          m.contenido?.toLowerCase().includes(q) ||
                          m.usuario_nombre?.toLowerCase().includes(q)
                      );
                    }

                    // Ordenar por fecha ascendente (lo más antiguo arriba, lo más reciente abajo)
                    const sortedList = [...filteredList].sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );

                    if (sortedList.length === 0) {
                      return (
                        <div className="text-center py-14 text-ink-muted italic text-xs space-y-2">
                          <MessageSquare className="w-10 h-10 text-ink-subtle mx-auto opacity-60" />
                          <p className="font-semibold text-ink">No hay actividades registradas.</p>
                          <p className="text-[11px] text-ink-muted">
                            Escribe un comentario abajo usando @ para mencionar a un integrante. El historial se guarda automáticamente.
                          </p>
                        </div>
                      );
                    }

                    return sortedList.map((msg) => {
                      const isReclamoMsg = msg.tipo === 'reclamo';
                      const isSeguimientoMsg = msg.tipo === 'seguimiento';
                      const isUserComment =
                        msg.tipo === 'comentario' ||
                        isReclamoMsg ||
                        isSeguimientoMsg ||
                        (!msg.tipo && !msg.contenido?.startsWith('['));

                      const msgDate = new Date(msg.created_at);
                      const formattedTime = msgDate.toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      const formattedDate = msgDate.toLocaleDateString('es-CL', {
                        month: 'short',
                        day: 'numeric',
                      });

                      if (isUserComment) {
                        // Tarjeta de Comentario de Usuario (Estilo ClickUp / HubSpot Minimalista)
                        return (
                          <div
                            key={msg.id}
                            className={`p-4 rounded-lg border shadow-xs space-y-3 transition ${
                              isReclamoMsg
                                ? 'bg-danger-soft/70 border-danger/30 hover:border-danger/30'
                                : isSeguimientoMsg
                                  ? 'bg-warning-soft/70 border-warning/30 hover:border-warning/30'
                                  : 'bg-surface border-line hover:border-line'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center border shrink-0 ${
                                    isReclamoMsg
                                      ? 'bg-danger-soft text-danger border-danger/30'
                                      : isSeguimientoMsg
                                        ? 'bg-warning-soft text-warning-ink border-warning/30'
                                        : 'bg-accent-soft text-accent-ink border-accent/30'
                                  }`}
                                >
                                  {isReclamoMsg ? (
                                    <AlertTriangle className="w-4 h-4 text-danger" />
                                  ) : isSeguimientoMsg ? (
                                    <AlarmClock className="w-4 h-4 text-warning-ink" />
                                  ) : (
                                    <User className="w-4 h-4 text-accent-ink" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-ink text-sm block leading-none">
                                      {msg.usuario_nombre}
                                    </span>
                                    {isReclamoMsg && (
                                      <span className="px-2 py-0.5 rounded-md t-micro font-bold uppercase bg-danger-soft text-danger border border-danger/30">
                                        Reclamo / Postventa
                                      </span>
                                    )}
                                    {isSeguimientoMsg && (
                                      <span className="px-2 py-0.5 rounded-md t-micro font-bold uppercase bg-warning-soft text-warning-ink border border-warning/30">
                                        Recordatorio
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <span className="text-ink-subtle text-xs t-num">
                                {formattedDate} {formattedTime}
                              </span>
                            </div>

                            {isSeguimientoMsg ? (() => {
                              const campos = Object.fromEntries(parseSeguimientoContenido(msg.contenido || ''));
                              return (
                                <div className="rounded-lg bg-surface border border-warning/30 p-3 space-y-2.5">
                                  <div>
                                    <span className="t-caption text-warning-ink font-semibold block">Próxima acción</span>
                                    <p className="text-sm font-semibold text-ink leading-snug break-words">
                                      {campos['Próxima acción'] || msg.contenido}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 rounded-md bg-warning-soft/60 border border-warning/30 px-2.5 py-1.5 min-w-0">
                                      <Calendar className="w-3.5 h-3.5 text-warning-ink shrink-0" />
                                      <div className="min-w-0">
                                        <span className="block t-micro font-medium text-ink-muted leading-none mb-0.5">Fecha del recordatorio</span>
                                        <span className="block text-xs font-semibold text-ink t-num truncate">{campos['Fecha'] || 'Sin fecha'}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-md bg-warning-soft/60 border border-warning/30 px-2.5 py-1.5 min-w-0">
                                      <User className="w-3.5 h-3.5 text-warning-ink shrink-0" />
                                      <div className="min-w-0">
                                        <span className="block t-micro font-medium text-ink-muted leading-none mb-0.5">Responsable</span>
                                        <span className="block text-xs font-semibold text-ink truncate">{campos['Responsable'] || 'Sin responsable'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {campos['Último contacto'] && (
                                    <p className="border-l-2 border-warning/30 pl-2.5 text-xs text-ink-muted break-words">
                                      <span className="font-semibold text-ink">Último contacto: </span>
                                      {campos['Último contacto']}
                                    </p>
                                  )}
                                </div>
                              );
                            })() : (
                              <div className="text-ink text-sm whitespace-pre-wrap leading-relaxed">
                                {renderMessageContentWithMentions(msg.contenido)}
                              </div>
                            )}

                            <div className="flex items-center justify-end pt-2 border-t border-line text-xs">
                              <button
                                type="button"
                                onClick={() => setChatInput(`@${msg.usuario_nombre} `)}
                                className="font-semibold text-ink-muted hover:text-accent-ink transition flex items-center gap-1"
                              >
                                <Reply className="w-3.5 h-3.5" />
                                <span>Respuesta</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Evento / Actualización de Sistema (Viñetas Limpias)
                      return (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2.5 rounded-md px-2 py-2 text-xs transition hover:bg-surface-muted"
                        >
                          <span className="select-none pt-px text-sm font-semibold text-accent-ink shrink-0">•</span>
                          <p className="min-w-0 flex-1 break-words leading-snug text-ink-muted">
                            <strong className="font-semibold text-ink">{msg.usuario_nombre}</strong>{' '}
                            <span>{msg.contenido}</span>
                          </p>
                          <span className="t-num shrink-0 whitespace-nowrap pt-px text-[11px] text-ink-subtle">
                            {formattedDate} {formattedTime}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Botón flotante para ir rápidamente a la última actividad (sólo se muestra si se ha hecho scroll hacia arriba) */}
                {showScrollBottomBtn && (
                  <div className="flex justify-end -mt-8 mb-2 mr-2 relative z-10 pointer-events-auto">
                    <button
                      type="button"
                      onClick={scrollToBottomActivity}
                      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-accent text-on-accent shadow-md transition hover:bg-accent-hover active:scale-95"
                      title="Ir a la actividad más reciente"
                      aria-label="Ir a la actividad más reciente"
                    >
                      <ChevronDown className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                )}
              </div>
              </OpportunityActivity>

              {/* Input de Comentarios en el Fondo del Panel Lateral */}
              <div className="border-t border-line px-5 py-3 relative text-sm" ref={mentionRef}>
                {mentionMenuOpen && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-3 left-0 right-0 bg-surface border border-line rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="p-2.5 bg-surface-muted text-ink-muted font-semibold text-xs border-b border-line flex justify-between items-center">
                      <span>Mencionar integrante:</span>
                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(false)}
                        className="text-ink-subtle hover:text-ink font-semibold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-line-subtle">
                      {filteredMentionUsers.map((usr, idx) => (
                        <button
                          key={usr.id}
                          type="button"
                          onClick={() => handleInsertMention(usr.nombre)}
                          className={`w-full text-left px-3.5 py-2.5 text-xs transition flex items-center justify-between ${
                            idx === selectedMentionIndex ? 'bg-accent text-on-accent' : 'text-ink hover:bg-accent-soft hover:text-accent-ink'
                          }`}
                        >
                          <span className="font-semibold">{usr.nombre}</span>
                          <span className="t-caption opacity-80">{ROL_NOMBRE[usr.rol] ?? usr.rol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isSeguimientoMode && (
                  <div className="bg-warning-soft/70 border border-warning/30 rounded-lg p-3 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-semibold text-warning-ink">
                        <AlarmClock className="w-4 h-4" />
                        Nuevo recordatorio de seguimiento
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSeguimientoMode(false)}
                        className="p-1 text-warning-ink hover:bg-warning-soft rounded-md transition"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label className="sm:col-span-2 t-caption">
                        Próxima acción *
                        <input
                          autoFocus
                          value={seguimientoDraft.accion}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, accion: e.target.value }))}
                          placeholder="Ej: Llamar para confirmar cotización"
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30"
                        />
                      </label>
                      <label className="t-caption">
                        Fecha y hora
                        <DateTimeInput
                         
                          value={seguimientoDraft.fecha}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, fecha: e.target.value }))}
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink t-num focus:outline-none focus:border-warning/30 [color-scheme:light]"
                        />
                      </label>
                      <label className="t-caption">
                        Responsable
                        <Select
                          value={seguimientoDraft.responsable}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, responsable: e.target.value }))}
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30"
                        >
                          <option value="">Sin responsable</option>
                          {usuariosApp.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
                        </Select>
                      </label>
                      <label className="sm:col-span-2 t-caption">
                        Resultado del último contacto (opcional)
                        <input
                          value={seguimientoDraft.resultado}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, resultado: e.target.value }))}
                          placeholder={selectedOp.seguimiento_resultado || 'Ej: Cliente pidió ajustar medidas'}
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30"
                        />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsSeguimientoMode(false)}
                        className="px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface rounded-md border border-transparent hover:border-line transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!seguimientoDraft.accion.trim() || seguimientoSaving}
                        onClick={handleSaveSeguimiento}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-warning-soft hover:bg-warning-soft rounded-md transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {seguimientoSaving ? 'Guardando...' : 'Guardar recordatorio'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Escribe un comentario... Usa @ para mencionar"
                    value={chatInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setChatInput(val);

                      const lastAt = val.lastIndexOf('@');
                      if (lastAt !== -1) {
                        const afterAt = val.slice(lastAt + 1);
                        const isCompleted = usuariosApp.some((u) =>
                          afterAt.toLowerCase().startsWith(u.nombre.toLowerCase() + ' ')
                        );

                        if (!afterAt.includes('\n') && !isCompleted) {
                          const matches = usuariosApp.filter(
                            (u) =>
                              u.nombre.toLowerCase().includes(afterAt.toLowerCase()) ||
                              u.rol.toLowerCase().includes(afterAt.toLowerCase())
                          );
                          if (matches.length > 0) {
                            setMentionMenuOpen(true);
                            setSelectedMentionIndex(0);
                          } else {
                            setMentionMenuOpen(false);
                          }
                        } else {
                          setMentionMenuOpen(false);
                        }
                      } else {
                        setMentionMenuOpen(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (mentionMenuOpen && filteredMentionUsers.length > 0) {
                        if (e.key === 'Tab' || e.key === 'Enter') {
                          e.preventDefault();
                          const targetUsr = filteredMentionUsers[selectedMentionIndex] || filteredMentionUsers[0];
                          if (targetUsr) {
                            handleInsertMention(targetUsr.nombre);
                          }
                          return;
                        }
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSelectedMentionIndex((prev) => (prev + 1) % filteredMentionUsers.length);
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSelectedMentionIndex((prev) => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
                          return;
                        }
                        if (e.key === 'Escape') {
                          setMentionMenuOpen(false);
                          return;
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !mentionMenuOpen) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    className="w-full bg-transparent text-ink font-medium text-sm focus:outline-none placeholder:text-ink-muted min-h-[56px] resize-none"
                  />

                  {/* Fichas de archivos encolados para enviar con este comentario */}
                  {stagedChatFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 pb-1">
                      {stagedChatFiles.map((f, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-muted border border-line rounded-md text-xs text-ink shadow-xs"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-accent-ink shrink-0" />
                          <span className="font-medium truncate max-w-[160px]">{f.name}</span>
                          <span className="t-caption t-num">({Math.round(f.size / 1024)} KB)</span>
                          <button
                            type="button"
                            onClick={() => setStagedChatFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-ink-subtle hover:text-danger ml-1 font-semibold text-xs"
                            title="Quitar archivo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Barra Inferior de Herramientas del Comentario */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-ink-subtle">
                      {/* Botón Adjuntar Archivos al mensaje */}
                      <label className="p-1.5 hover:text-accent-ink hover:bg-surface-muted rounded-lg transition cursor-pointer" title="Adjuntar archivo(s) al mensaje">
                        <Paperclip className="w-4 h-4" />
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              setStagedChatFiles((prev) => [...prev, ...files]);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(!mentionMenuOpen)}
                        className="p-1.5 hover:text-accent-ink hover:bg-surface-muted rounded-lg transition"
                        title="Mencionar a alguien"
                      >
                        <AtSign className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsSeguimientoMode(false);
                          setIsReclamoMode(!isReclamoMode);
                        }}
                        className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs font-semibold ${
                          isReclamoMode
                            ? 'bg-danger text-white shadow-xs'
                            : 'text-ink-muted hover:text-danger hover:bg-danger-soft'
                        }`}
                        title="Marcar este mensaje como Reclamo / Postventa"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{isReclamoMode ? 'Modo Reclamo' : 'Reclamo'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => (isSeguimientoMode ? setIsSeguimientoMode(false) : openSeguimientoPanel())}
                        className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs font-semibold ${
                          isSeguimientoMode
                            ? 'bg-warning-soft text-white shadow-xs'
                            : 'text-ink-muted hover:text-warning-ink hover:bg-warning-soft'
                        }`}
                        title="Agendar un recordatorio de seguimiento comercial"
                      >
                        <AlarmClock className="w-3.5 h-3.5" />
                        <span>Seguimiento</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={(!chatInput.trim() && stagedChatFiles.length === 0) || isUploadingChatFiles}
                      onClick={handleSendChatMessage}
                      className={`${
                        isReclamoMode ? 'bg-danger hover:bg-danger/90 text-white' : 'bg-accent hover:bg-accent-hover text-on-accent'
                      } p-2.5 rounded-md transition flex items-center justify-center shadow-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={isReclamoMode ? 'Registrar Reclamo' : 'Enviar comentario'}
                    >
                      {isUploadingChatFiles ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cotización Modal Unificado */}
      <CotizacionModal
        isOpen={showUnifiedCotModal}
        onClose={() => setShowUnifiedCotModal(false)}
        clienteIdInicial={selectedOp?.cliente_id}
        oportunidadIdInicial={selectedOp?.id}
        onSuccess={async () => {
          const { data: cotRes } = await supabase
            .from('cotizaciones')
            .select('*, cliente:clientes(*), items:cotizacion_items(*)');
          if (cotRes) {
            setAllCotizaciones(cotRes as Cotizacion[]);
          }
          if (selectedOp) {
            const { data: opData, error: opError } = await supabase.from('oportunidades')
              .select('cotizacion_actual_id').eq('id', selectedOp.id).single();
            if (opError) setCotizacionErrorMsg(mensajeError(opError));
            setSelectedOp((prev) => prev ? { ...prev, cotizacion_actual_id: opData?.cotizacion_actual_id || undefined } : null);
            setOportunidades((prev) => prev.map((op) => op.id === selectedOp.id
              ? { ...op, cotizacion_actual_id: opData?.cotizacion_actual_id || undefined } : op));
            await addOportunidadActividad(selectedOp.id, 'Nueva cotización creada y vinculada a la oportunidad');
            void loadMargenOportunidad(selectedOp.id);
          }
        }}
      />

      {/* Previsualización PDF Reusable */}
      <PdfPreviewModal
        cotizacion={previewCotizacion}
        onClose={() => setPreviewCotizacion(null)}
      />

      <OrdenCompraModal
        isOpen={showCreateOcModal}
        onClose={() => setShowCreateOcModal(false)}
        oportunidadIdInicial={selectedOp?.id}
        onSuccess={async () => {
          if (!selectedOp) return;
          delete ordenesCompraCacheRef.current[selectedOp.id];
          await loadOrdenesCompraOportunidad(selectedOp.id);
          await loadMargenOportunidad(selectedOp.id);
          await addOportunidadActividad(selectedOp.id, 'Nueva orden de compra vinculada a esta oportunidad.');
        }}
      />

      <OrdenCompraPdfPreviewModal
        orden={pdfPreviewOc}
        onClose={() => setPdfPreviewOc(null)}
      />

      {/* Modal Crear Nueva Oportunidad */}
      {showNewOpModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-lg max-w-lg w-full p-6 space-y-5 shadow-sm text-ink">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Plus className="w-5 h-5 text-accent-ink" />
                <span>Registrar Nueva Oportunidad de Venta</span>
              </h3>
              <button onClick={() => setShowNewOpModal(false)} className="text-ink-subtle hover:text-ink text-lg font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOportunidad} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-ink mb-1">Título de la Oportunidad *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Pavimentación Pastelones Obra Apoquindo"
                  value={nuevoTitulo}
                  onChange={(e) => setNuevoTitulo(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink placeholder-gray-400 focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Cliente Asociado *</label>
                <SearchSelect
                  value={nuevoClienteId}
                  onChange={setNuevoClienteId}
                  options={clientesSel.opciones}
                  onSearch={clientesSel.onSearch}
                  placeholder="-- Seleccionar Cliente --"
                  searchPlaceholder="Buscar por nombre o RUT..."
                  menuMinWidth={320}
                  ariaLabel="Cliente asociado"
                />
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Tipo de Venta *</label>
                <Select
                  value={nuevoTipoVenta}
                  onChange={(e) => setNuevoTipoVenta(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent"
                >
                  {tiposVenta.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink mb-1">Origen *</label>
                  <Select
                    value={nuevoOrigen}
                    onChange={(e) => setNuevoOrigen(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="">-- Seleccionar Origen --</option>
                    {origenes.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block font-bold text-ink mb-1">Sólo material o instalación</label>
                  <Select
                    value={nuevaModalidadRequerimiento}
                    onChange={(e) => setNuevaModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent"
                  >
                    <option value="solo_material">Sólo material</option>
                    <option value="instalacion">Instalación</option>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Fecha Límite de Término del Trabajo</label>
                <DateInput
                  value={nuevaFechaLimite}
                  onChange={(e) => setNuevaFechaLimite(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowNewOpModal(false)}
                  className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-ink rounded-md font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded-md font-semibold transition shadow-sm"
                >
                  Crear Oportunidad
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Marcar oportunidad como perdida: motivo obligatorio */}
      <Dialog
        open={opToMarkLost !== null}
        onClose={() => { if (!savingPerdida) setOpToMarkLost(null); }}
        title="Marcar como perdida"
        description={opToMarkLost ? `${opToMarkLost.codigo} · ${opToMarkLost.titulo}. Saldrá del pipeline activo y podrás reabrirla desde "Perdidas".` : undefined}
        footer={
          <>
            <Button onClick={() => setOpToMarkLost(null)} disabled={savingPerdida}>Cancelar</Button>
            <Button variant="destructive" disabled={!perdidaValida || savingPerdida} onClick={confirmarMarcarPerdida}>
              {savingPerdida ? 'Guardando...' : 'Marcar como perdida'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Motivo" required>
            {(f) => (
              <Select {...f} value={perdidaMotivo} onChange={(e) => setPerdidaMotivo(e.target.value)}>
                <option value="">Selecciona un motivo</option>
                {MOTIVOS_PERDIDA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Detalle" required={perdidaMotivo === 'otro'}>
            {(f) => (
              <TextInput
                {...f}
                value={perdidaDetalle}
                onChange={(e) => setPerdidaDetalle(e.target.value)}
                placeholder={perdidaMotivo === 'otro' ? 'Describe el motivo' : 'Opcional'}
              />
            )}
          </Field>
        </div>
      </Dialog>

      {/* Modal Confirmación Eliminación de Oportunidad */}
      {opToDelete && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 ">
          <div className="bg-surface border border-line rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-ink">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-danger flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <span>Eliminar Oportunidad</span>
              </h3>
              <button onClick={() => setOpToDelete(null)} className="text-ink-subtle hover:text-ink font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-ink">
              <p>
                ¿Estás seguro de que deseas eliminar la oportunidad <strong className="font-mono text-ink">{opToDelete.codigo}</strong> (&quot;{opToDelete.titulo}&quot;)?
              </p>
              <p className="bg-danger-soft p-3 rounded-md border border-danger/30 text-danger font-medium">
                Esta acción eliminará permanentemente la oportunidad y sus registros vinculados, incluidas cotizaciones y actividades. Una orden de compra vinculada impedirá eliminarla.
              </p>
              {deleteOpError && <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-danger">{deleteOpError}</p>}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOpToDelete(null)}
                className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-ink font-bold rounded-md transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteOportunidad}
                disabled={deletingOp}
                className="px-5 py-2 bg-danger hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md transition shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingOp ? 'Eliminando...' : 'Eliminar Oportunidad'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Eliminación de Cotización desde Modal */}
      {cotToDeleteInModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 ">
          <div className="bg-surface border border-line rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-ink">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-danger flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger" />
                <span>Eliminar Cotización</span>
              </h3>
              <button onClick={() => setCotToDeleteInModal(null)} className="text-ink-subtle hover:text-ink font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-ink">
              <p>
                ¿Estás seguro de que deseas eliminar la cotización <strong className="font-mono text-ink">{cotToDeleteInModal.numero_cotizacion}</strong> por <strong className="text-success">${(cotToDeleteInModal.monto_total || 0).toLocaleString('es-CL')}</strong>?
              </p>
              <p className="bg-danger-soft p-3 rounded-md border border-danger/30 text-danger font-medium">
                Esta acción la eliminará del sistema.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCotToDeleteInModal(null)}
                className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-ink font-bold rounded-md transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCotizacionInModal}
                className="px-5 py-2 bg-danger hover:opacity-90 text-white font-semibold rounded-md transition shadow-sm flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Cotización</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Advertencia por Abono Mínimo Requerido (50% o 100%) */}
      {abonoWarningModal && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 "
          onClick={() => setAbonoWarningModal(null)}
        >
          <div
            className="bg-surface text-ink border border-line rounded-lg max-w-md w-full p-6 shadow-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line pb-3">
              <div className="p-2.5 bg-warning-soft text-warning-ink rounded-lg shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">Requisito de Abono Mínimo (50%)</h3>
                <p className="text-xs text-ink-muted font-medium">No se puede mover la oportunidad de estado</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-ink font-medium leading-relaxed">
                Para cambiar la oportunidad <strong className="font-mono text-accent-ink">{abonoWarningModal.op.codigo}</strong> al estado de Venta Aprobada o Producción, se requiere registrar un abono equivalente a al menos el <strong className="text-warning-ink font-bold">50% o 100%</strong> del monto total.
              </p>

              <div className="bg-surface-muted p-3.5 rounded-lg border border-line space-y-2 t-num text-xs">
                <div className="flex justify-between text-ink-muted">
                  <span>Monto Total Venta:</span>
                  <span className="font-semibold text-ink">${abonoWarningModal.montoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Abonado actualmente:</span>
                  <span className="font-semibold text-warning-ink">${abonoWarningModal.montoAbonado.toLocaleString('es-CL')} ({abonoWarningModal.porcentajeActual}%)</span>
                </div>
                <div className="flex justify-between text-accent-ink font-semibold border-t border-line pt-2 text-xs">
                  <span>Requerido mínimo (50%):</span>
                  <span>${Math.round(abonoWarningModal.montoTotal * 0.5).toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAbonoWarningModal(null)}
                className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-ink font-semibold rounded-md transition"
              >
                Entendido
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetOp = abonoWarningModal.op;
                  setAbonoWarningModal(null);
                  handleOpenOportunidad(targetOp, 'cotizaciones');
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-md transition shadow-sm flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>Registrar Abono Ahora</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Status Popover Overlay (Estilo ClickUp de la Imagen) */}
      {stageMenuPos && (
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => {
            setStageMenuPos(null);
            setStatusSearchQuery('');
          }}
        >
          <div
            style={{
              top: `${Math.min(stageMenuPos.top, typeof window !== 'undefined' ? window.innerHeight - 420 : stageMenuPos.top)}px`,
              left: `${Math.min(stageMenuPos.left, typeof window !== 'undefined' ? window.innerWidth - 290 : stageMenuPos.left)}px`,
            }}
            className="fixed z-[101] bg-[var(--color-surface)] text-ink-subtle border border-line rounded-lg shadow-sm p-3 min-w-[280px] space-y-3 "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Popover con Buscador ClickUp */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-line pb-2 px-1">
                <span className="text-[11px] font-bold uppercase text-ink-subtle tracking-normal">Estado del Pipeline</span>
                <button
                  onClick={() => {
                    setStageMenuPos(null);
                    setStatusSearchQuery('');
                  }}
                  className="text-ink-muted hover:text-ink-subtle p-0.5 rounded-lg transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Buscador de estados Buscar... */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-subtle absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={statusSearchQuery}
                  onChange={(e) => setStatusSearchQuery(e.target.value)}
                  className="w-full bg-[var(--color-surface-muted)] text-ink-subtle border border-line focus:border-accent text-xs rounded-md pl-8 pr-3 py-1.5 focus:outline-none transition placeholder-gray-500 font-medium"
                  autoFocus
                />
              </div>
            </div>

            {/* Listado Agrupado de Estados con Filtro */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
              {SECCIONES_PIPELINE.map((sec) => {
                const filteredEtapas = sec.etapas.filter((st) =>
                  st.label.toLowerCase().includes(statusSearchQuery.toLowerCase())
                );
                if (filteredEtapas.length === 0) return null;

                return (
                  <div key={sec.id} className="space-y-1">
                    <span className="t-micro font-semibold uppercase text-ink-subtle tracking-normal px-2 py-0.5 block">
                      {sec.nombre}
                    </span>
                    {filteredEtapas.map((st) => {
                      const targetOp = oportunidades.find((o) => o.id === stageMenuPos.opId);
                      const isCurrent = targetOp?.estado_pipeline === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={async () => {
                            const opId = stageMenuPos.opId;
                            setStageMenuPos(null);
                            setStatusSearchQuery('');
                            await moveOportunidadToState(opId, st.id as EstadoPipeline);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-md transition flex items-center justify-between group ${
                            isCurrent
                              ? 'bg-[var(--color-surface-muted)] text-accent-ink border border-accent/40 shadow-sm'
                              : 'hover:bg-surface/5 text-ink-subtle'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-3 h-3 rounded-full border border-current shadow-2xs ${
                                st.id === 'nueva'
                                  ? 'bg-warning-soft border-warning/30'
                                  : st.id === 'pagada'
                                  ? 'bg-info-soft border-info/30'
                                  : st.id === 'entregada'
                                  ? 'bg-success-soft border-success/30'
                                  : st.id.startsWith('prod_')
                                  ? 'bg-surface-muted border-line'
                                  : 'bg-surface-muted border-line'
                              }`}
                            />
                            <span className="text-[11px] font-semibold uppercase tracking-normal">{st.label}</span>
                          </div>
                          {isCurrent && <Check className="w-4 h-4 text-accent-ink" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
