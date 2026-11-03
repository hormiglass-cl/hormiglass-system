'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { createClient } from '../../lib/supabase/client';
import {
  Cliente,
  Cotizacion,
  EstadoCotizacion,
  EstadoPipeline,
  OportunidadVenta,
  PRODUCTOS_HORMIGLASS,
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
  ArrowLeft,
  TrendingUp,
  GripVertical,
  Calendar,
  Clock,
  FileText,
  Plus,
  Sparkles,
  Building,
  Eye,
  FilePlus,
  User,
  Check,
  Edit,
  Phone,
  Mail,
  Paperclip,
  Send,
  MessageSquare,
  DollarSign,
  Package,
  Layers,
  List,
  Kanban,
  AtSign,
  FileCheck,
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Bell,
  ThumbsUp,
  Reply,
  Mic,
  MoreHorizontal,
  ListFilter,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Circle,
  Factory,
  Truck,
  CheckCircle,
  Download,
  HardHat,
  ShoppingCart,
  ShieldAlert,
  Flag,
  Tag,
  Compass,
  Disc,
  AlarmClock,
  ClipboardCheck,
  ExternalLink,
} from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { CotizacionModal } from '../../components/CotizacionModal';
import { mensajeError } from '../../lib/errores';
import { CodeStamp, StageRail, StatusBadge, FilterPills, type FilterDefinition, FloatingActionBar, AvatarBadge } from '../../components/ui/crm';
import { KanbanCard } from '../../components/ventas/KanbanCard';
import { CapturedDataPending, OpportunityActivity } from '../../components/whatsapp/OpportunityActivity';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { useBreadcrumb } from '../../lib/context/BreadcrumbContext';
import { swrCache } from '../../lib/cache/swr-cache';

function AreaCardHeader({
  icon: Icon,
  title,
  open,
  onToggle,
  aside,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  open: boolean;
  onToggle: () => void;
  aside?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full p-3 bg-surface hover:bg-surface-muted text-ink font-semibold text-sm flex items-center justify-between gap-3 transition cursor-pointer text-left"
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-4 h-4 text-accent-ink shrink-0" />
        <span className="truncate">{title}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {aside}
        {open ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
      </span>
    </button>
  );
}

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


const PIPELINE_STAGES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'pagada', label: 'Abono / Pago' },
  { id: 'aprobada', label: 'Venta Aprobada' },
  { id: 'operacion', label: 'Abastecimiento' },
  { id: 'entregada', label: 'Cierre / Entrega' },
] as const;

function getStageIndex(estado: EstadoPipeline): number {
  if (estado === 'nueva') return 0;
  if (estado === 'pagada') return 2;
  if (estado === 'entregada') return 3;
  if (estado.startsWith('prod_') || estado.startsWith('rev_') || estado === 'programada') {
    if (estado === 'prod_finalizado' || estado === 'rev_entregado') return 5;
    return 4;
  }
  return 1;
}

export default function PipelineVentasPage() {
  const { currentUser, usersList } = useAuth();
  const searchParams = useSearchParams();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const { setCustomTitle, setOnBack } = useBreadcrumb();
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
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');

  // Advanced Filters for List & Board View
  const [filterSearch, setFilterSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterTipoVenta, setFilterTipoVenta] = useState<string>('todos');
  const [filterPrioridad, setFilterPrioridad] = useState<string>('todos');
  const [filterAsignado, setFilterAsignado] = useState<string>('todos');
  const [collapsedParentSections, setCollapsedParentSections] = useState<Record<string, boolean>>({});

  // List View Section Collapsing State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [stageMenuPos, setStageMenuPos] = useState<{ opId: string; top: number; left: number } | null>(null);
  const [statusSearchQuery, setStatusSearchQuery] = useState('');

  // Bifurcation Modal State (Sección 1 -> Sección 2 vs 3)
  const [ramaChoiceModal, setRamaChoiceModal] = useState<{
    op: OportunidadVenta;
    targetState: EstadoPipeline;
  } | null>(null);

  // Deletion Modal State for Oportunidad
  const [opToDelete, setOpToDelete] = useState<OportunidadVenta | null>(null);
  const [deleteOpError, setDeleteOpError] = useState('');
  const [deletingOp, setDeletingOp] = useState(false);
  const [cotToDeleteInModal, setCotToDeleteInModal] = useState<Cotizacion | null>(null);

  // Accordion Sections State in Modal (Todas cerradas por defecto)
  const [openSections, setOpenSections] = useState<{
    contacto: boolean;
    productos: boolean;
    finanzas: boolean;
    antecedentes: boolean;
    visita: boolean;
    produccionEventos: boolean;
    produccionBitacora: boolean;
    produccionOc: boolean;
    reventaEventos: boolean;
    reventaOc: boolean;
  }>({
    contacto: true,
    productos: false,
    finanzas: false,
    antecedentes: false,
    visita: false,
    produccionEventos: false,
    produccionBitacora: false,
    produccionOc: false,
    reventaEventos: false,
    reventaOc: false,
  });

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

  // Area Sections Collapsible State (Secciones 1, 2 y 3) (Todas contraídas por defecto al entrar)
  const [areaExpanded, setAreaExpanded] = useState<{ comercial: boolean; produccion: boolean; reventa: boolean; cierre: boolean }>({
    comercial: false,
    produccion: false,
    reventa: false,
    cierre: false,
  });

  // Órdenes de Compra vinculadas a la Oportunidad
  const [opOrdenesCompra, setOpOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [loadingOpOrdenes, setLoadingOpOrdenes] = useState(false);
  const [showCreateOcModal, setShowCreateOcModal] = useState(false);
  const [pdfPreviewOc, setPdfPreviewOc] = useState<OrdenCompra | null>(null);

  // Matriz de Costos y Margen por NV (Fase 3)
  const [margenOp, setMargenOp] = useState<MargenPorNV | null>(null);
  const [loadingMargenOp, setLoadingMargenOp] = useState(false);

  // Bitácora de Producción Diaria y Stock de la Oportunidad
  const [opProduccionDiaria, setOpProduccionDiaria] = useState<ProduccionDiaria[]>([]);
  const [loadingProduccionDiaria, setLoadingProduccionDiaria] = useState(false);
  const [cotizacionItemsOp, setCotizacionItemsOp] = useState<CotizacionItem[]>([]);
  const [newProdProducto, setNewProdProducto] = useState('');
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
  const [productSearchInput, setProductSearchInput] = useState('');
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
  const [activityFilter, setActivityFilter] = useState<'all' | 'comentarios' | 'sistema' | 'reclamos' | 'seguimiento'>('all');
  const [showActivitySearch, setShowActivitySearch] = useState(false);
  const [likedMessages, setLikedMessages] = useState<Record<string, boolean>>({});

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

      const tableChat: ChatMensaje[] = (actRes.data || []).map((a: any) => ({
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

      // Include legacy visit from opportunity fields if not present in visitas_terreno
      if (
        op.fecha_visita_terreno &&
        !list.some((v) => v.fecha_visita_terreno === op.fecha_visita_terreno)
      ) {
        list.unshift({
          id: `legacy-${op.id}`,
          oportunidad_id: op.id,
          tecnico_visita: op.tecnico_visita || 'Responsable',
          tecnico_id: op.tecnico_id || null,
          fecha_visita_terreno: op.fecha_visita_terreno,
          hora_visita_terreno: op.hora_visita_terreno || '09:00',
          estado_visita: op.estado_visita || 'programada',
          observaciones_visita: op.observaciones_visita || '',
        });
      }

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

  const mapAntecedenteRecord = (record: any): AntecedenteDocumento => ({
    id: record.id,
    oportunidad_id: record.oportunidad_id,
    nombre: record.nombre,
    tipo: record.tipo || 'otro',
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
      return;
    }

    const cached = antecedentesCacheRef.current[op.id];
    if (cached) {
      setOpAntecedentesList(cached);
      setSelectedOp((prev) => (prev && prev.id === op.id ? { ...prev, antecedentes: cached } : prev));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('oportunidad_antecedentes')
        .select('*')
        .eq('oportunidad_id', op.id)
        .eq('eliminado', false)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const docs = (data || []).map(mapAntecedenteRecord);
      antecedentesCacheRef.current[op.id] = docs;
      setOpAntecedentesList(docs);
      setSelectedOp((prev) => (prev && prev.id === op.id ? { ...prev, antecedentes: docs } : prev));
      setOportunidades((prevOps) =>
        prevOps.map((o) => (o.id === op.id ? { ...o, antecedentes: docs } : o))
      );
    } catch (err) {
      console.error('Error loading antecedentes from Supabase:', err);
      const legacyDocs = Array.isArray(op.antecedentes) ? op.antecedentes : [];
      setOpAntecedentesList(legacyDocs);
    }
  };

  // Helper to open opportunity and update URL
  const handleOpenOportunidad = (op: OportunidadVenta) => {
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      antecedentes: false,
      visita: false,
      produccionEventos: false,
      produccionBitacora: false,
      produccionOc: false,
      reventaEventos: false,
      reventaOc: false,
    });
    setAreaExpanded({
      comercial: false,
      produccion: false,
      reventa: false,
      cierre: false,
    });
    setIsSeguimientoMode(false);
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

  // Helper to close opportunity and clear URL parameter
  const handleCloseOportunidad = () => {
    setSelectedOp(null);
    setMargenOp(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('oportunidad');
      url.searchParams.delete('opId');
      const newSearch = url.searchParams.toString();
      window.history.pushState(null, '', url.pathname + (newSearch ? '?' + newSearch : ''));
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
        setSelectedOp(null);
        setMargenOp(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [oportunidades]);

  useEffect(() => {
    if (selectedOp) {
      setCustomTitle(selectedOp.titulo || selectedOp.codigo || 'Oportunidad');
      setOnBack(() => handleCloseOportunidad);
    } else {
      setCustomTitle(null);
      setOnBack(null);
    }
    return () => {
      setCustomTitle(null);
      setOnBack(null);
    };
  }, [selectedOp, setCustomTitle, setOnBack]);

  useEffect(() => {
    const targetOpId = searchParams.get('oportunidad');
    if (!targetOpId && selectedOp) {
      setSelectedOp(null);
      setMargenOp(null);
    }
  }, [searchParams, selectedOp]);

  // Cotización seleccionada para previsualización modal
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);

  // Form para Nueva Oportunidad
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [nuevoTitulo, setNuevoTitulo] = useState('');
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevaFechaLimite, setNuevaFechaLimite] = useState('');
  const [nuevoTipoVenta, setNuevoTipoVenta] = useState('Instalación');
  const [nuevoOrigen, setNuevoOrigen] = useState('');
  const [nuevaModalidadRequerimiento, setNuevaModalidadRequerimiento] = useState<'solo_material' | 'instalacion'>('instalacion');
  const [isActividadesExpanded, setIsActividadesExpanded] = useState(false);

  // Visitas a Terreno Múltiples State
  const [opVisitasList, setOpVisitasList] = useState<VisitaTerreno[]>([]);
  const [showAddVisitaForm, setShowAddVisitaForm] = useState(false);
  const [newVisitaTecnico, setNewVisitaTecnico] = useState<string>('');
  const [newVisitaFecha, setNewVisitaFecha] = useState<string>('');
  const [newVisitaHora, setNewVisitaHora] = useState<string>('09:00');
  const [newVisitaEstado, setNewVisitaEstado] = useState<string>('programada');
  const [newVisitaNotas, setNewVisitaNotas] = useState<string>('');

  // Editing Visita State
  const [editingVisitaId, setEditingVisitaId] = useState<string | null>(null);
  const [editVisitaTecnico, setEditVisitaTecnico] = useState<string>('');
  const [editVisitaFecha, setEditVisitaFecha] = useState<string>('');
  const [editVisitaHora, setEditVisitaHora] = useState<string>('09:00');
  const [editVisitaEstado, setEditVisitaEstado] = useState<string>('programada');
  const [editVisitaNotas, setEditVisitaNotas] = useState<string>('');

  // Eventos múltiples para calendario Producción y Logística
  const [opEventosProdLog, setOpEventosProdLog] = useState<EventoProduccionLogistica[]>([]);
  const [showAddProdLogEventForm, setShowAddProdLogEventForm] = useState(false);
  const [newProdLogTipo, setNewProdLogTipo] = useState<TipoEventoProduccionLogistica>('produccion');
  const [newProdLogTitulo, setNewProdLogTitulo] = useState('');
  const [newProdLogFecha, setNewProdLogFecha] = useState('');
  const [newProdLogHora, setNewProdLogHora] = useState('09:00');
  const [newProdLogResponsableId, setNewProdLogResponsableId] = useState('');
  const [newProdLogEstado, setNewProdLogEstado] = useState<EstadoEventoProduccionLogistica>('por_hacer');
  const [newProdLogNotas, setNewProdLogNotas] = useState('');
  const [newProdLogContexto, setNewProdLogContexto] = useState<ContextoEventoProduccionLogistica>('produccion_logistica');
  const [editingProdLogEventId, setEditingProdLogEventId] = useState<string | null>(null);
  const [produccionEventosEnabled, setProduccionEventosEnabled] = useState(true);
  const [reventaEventosEnabled, setReventaEventosEnabled] = useState(true);

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
  }, [selectedOp?.id, selectedOp?.chat_interno?.length]);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let ignore = false;
    async function fetchPipelineData() {
      try {
        const [opRes, cliRes, usrRes, cotRes, actRes] = await Promise.all([
          supabase
            .from('oportunidades')
            .select('*, cliente:clientes(*)')
            .order('created_at', { ascending: false }),
          supabase.from('clientes').select('*'),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true }),
          supabase.from('cotizaciones').select('*, cliente:clientes(*), items:cotizacion_items(*)'),
          supabase.from('actividades_op').select('*').order('created_at', { ascending: true }),
        ]);

        if (!ignore) {
          if (cliRes.data) {
            setClientes(cliRes.data as Cliente[]);
          } else {
            setClientes([]);
          }

          const loadedUsers = (usrRes.data || usersList || []) as Usuario[];
          setUsuariosApp(loadedUsers);
          setPersonalTerrenoList(loadedUsers);

          let mergedOps: OportunidadVenta[] = [];
          if (opRes.data) {
            const rawOps = opRes.data as OportunidadVenta[];
            const closedIds = rawOps.filter((op) => ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline)).map((op) => op.id);
            const { data: accreditationRows, error: accreditationError } = closedIds.length
              ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
              : { data: [], error: null };
            const accreditationMap = Object.fromEntries(((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [row.venta_id, row.acreditada]));
            setDeliveryAccreditation(accreditationMap);
            swrCache.set('ventas:accreditation', accreditationMap);
            const allQuotes = (cotRes.data || []) as Cotizacion[];
            const allDbAct = actRes.data || [];

            mergedOps = rawOps.map((op) => {
              const jsonChat: ChatMensaje[] = Array.isArray(op.chat_interno) ? op.chat_interno : [];
              const tableChat = allDbAct
                .filter((a: any) => a.oportunidad_id === op.id)
                .map((a: any) => ({
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
              setOpenSections({
                contacto: false,
                productos: false,
                finanzas: false,
                antecedentes: false,
                visita: false,
                produccionEventos: false,
                produccionBitacora: false,
                produccionOc: false,
                reventaEventos: false,
                reventaOc: false,
              });
              setAreaExpanded({
                comercial: false,
                produccion: false,
                reventa: false,
                cierre: false,
              });
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
          setClientes([]);
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
        (payload: any) => {
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
        (payload: any) => {
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
        (payload: any) => {
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
        (payload: any) => {
          if (payload.new) {
            const updatedClient = payload.new as Cliente;
            setClientes((prev) => {
              const exists = prev.some((c) => c.id === updatedClient.id);
              if (exists) {
                return prev.map((c) => (c.id === updatedClient.id ? { ...c, ...updatedClient } : c));
              }
              return [updatedClient, ...prev];
            });
          } else {
            fetchPipelineData();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
        },
        (payload: any) => {
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
            .then(({ data }: any) => {
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
              .then(({ data }: any) => {
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
  }, [selectedOp?.id]);

  const SECCIONES_PIPELINE = [
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

  const getProdLogTipoClasses = (tipo?: string | null) => {
    if (tipo === 'produccion') return 'bg-surface-muted text-ink border-line';
    if (tipo === 'obra') return 'bg-accent-soft text-accent-ink border-accent/30';
    if (tipo === 'reventa') return 'bg-surface-muted text-ink border-line';
    return 'bg-surface-muted text-ink border-line';
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
        id: Date.now().toString(),
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
        id: Date.now().toString(),
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

  // Helper para obtener el color del círculo de estado según la etapa del pipeline
  const getStageDotColor = (stage: EstadoPipeline) => {
    if (stage === 'nueva') return 'bg-warning-soft border-warning/30 text-warning-ink';
    if (stage === 'pagada') return 'bg-info-soft border-info/30 text-info';
    if (stage === 'entregada') return 'bg-success-soft border-success/30 text-success';
    if (stage.startsWith('prod_')) return 'bg-surface-muted border-line text-ink';
    return 'bg-surface-muted border-line text-ink';
  };


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
  };

  // Candidate quote dropdown selection state
  const [selectedCandidateCotId, setSelectedCandidateCotId] = useState<string>('');

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
  const [editingAbonoId, setEditingAbonoId] = useState<string | null>(null);
  const [editAbonoMonto, setEditAbonoMonto] = useState<string>('');
  const [editAbonoNota, setEditAbonoNota] = useState<string>('');

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
      id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    setToastAlert({
      id: Date.now().toString(),
      message: `Oportunidad ${targetOp.codigo} movida a ${stateLabel} (${rama === 'produccion' ? 'Producción y Logística' : 'Reventa y Logística'})`,
      user: 'Sistema CRM',
    });
    setTimeout(() => setToastAlert(null), 4000);

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
          id: Date.now().toString(),
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

  // Mover Oportunidad en el Pipeline (Sin gates bloqueantes de abono)
  const moveOportunidadToState = async (opId: string, targetState: EstadoPipeline) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp || targetOp.estado_pipeline === targetState) return;

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
      setRamaChoiceModal({ op: targetOp, targetState });
      return;
    }

    // Si ya tiene rama o se mueve dentro de comercial
    const rama = targetOp.rama_destino || (targetOp.tipo_venta === 'Suministro' || targetOp.tipo_venta === 'Reventa de Material' ? 'reventa' : 'produccion');

    // Actualización optimista local
    setOportunidades((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, estado_pipeline: targetState } : o))
    );

    if (selectedOp && selectedOp.id === opId) {
      setSelectedOp({ ...selectedOp, estado_pipeline: targetState });
    }

    const stateLabel = pipelineStates.find((s) => s.id === targetState)?.label || targetState;
    setToastAlert({
      id: Date.now().toString(),
      message: `Oportunidad ${targetOp.codigo} movida a ${stateLabel}`,
      user: 'Sistema CRM',
    });
    setTimeout(() => setToastAlert(null), 4000);

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

  // Registrar tanda de Producción Diaria
  const handleRegisterProduccionDiaria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOp || !newProdProducto.trim() || newProdCantidad <= 0) return;

    try {
      const latestQ = getActiveQuote(selectedOp);
      const payload: any = {
        oportunidad_id: selectedOp.id,
        cotizacion_id: latestQ?.id || null,
        producto: newProdProducto.trim(),
        cantidad_producida: newProdCantidad,
        fecha_produccion: newProdFecha || new Date().toISOString().split('T')[0],
        responsable_id: newProdResponsableId || null,
        observaciones: newProdObservaciones.trim() || null,
        registrado_por: currentUser?.id || null,
      };

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
        `Fabricación registrada: ${newProdCantidad} un. de "${newProdProducto.trim()}" el ${payload.fecha_produccion}`
      );

      setNewProdCantidad(0);
      setNewProdObservaciones('');
    } catch (err) {
      console.error('Error registrando produccion diaria:', err);
    }
  };

  // Guardar campo individual en Supabase
  const updateOportunidadField = async (
    opId: string,
    field: keyof OportunidadVenta,
    value: any
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

  // Toggle producto en oportunidad
  const toggleProductoSeleccionado = (prod: string) => {
    if (!selectedOp) return;
    const currentProds = selectedOp.productos || [];
    const updated = currentProds.includes(prod)
      ? currentProds.filter((p) => p !== prod)
      : [...currentProds, prod];

    updateOportunidadField(selectedOp.id, 'productos', updated);
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
          const storagePath = `antecedentes/${selectedOp.id}/${Date.now()}_${cleanFileName}`;
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
      const storagePath = `antecedentes/${selectedOp.id}/${Date.now()}_${cleanFileName}`;
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
    } catch (err: any) {
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
    } catch (err: any) {
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
  const filteredOportunidades = oportunidades.filter((op) => {
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

  const produccionEventos = opEventosProdLog.filter(
    (event) => (event.contexto || 'produccion_logistica') === 'produccion_logistica'
  );
  const reventaEventos = opEventosProdLog.filter(
    (event) => event.contexto === 'reventa_logistica'
  );

  const ventasFilterDefs: FilterDefinition[] = useMemo(() => [
    {
      id: 'estado',
      label: 'Estado',
      options: pipelineStates.map((st) => ({
        value: st.id,
        label: st.label,
        count: oportunidades.filter((o) => o.estado_pipeline === st.id).length,
      })),
    },
    {
      id: 'tipo_venta',
      label: 'Tipo de venta',
      options: [
        { value: 'Instalación', label: 'Instalación' },
        { value: 'Suministro', label: 'Suministro' },
        { value: 'Reventa de Material', label: 'Reventa de Material' },
      ],
    },
    {
      id: 'prioridad',
      label: 'Prioridad',
      options: [
        { value: 'Normal / Baja', label: 'Normal / Baja' },
        { value: 'Alta', label: 'Alta' },
        { value: 'Urgente', label: 'Urgente' },
      ],
    },
    {
      id: 'asignado',
      label: 'Asignado a',
      options: [
        ...(currentUser ? [{ value: 'me', label: '👤 Asignadas a mí' }] : []),
        ...usuariosApp.map((u) => ({
          value: u.id,
          label: u.nombre || u.email,
        })),
      ],
    },
  ], [pipelineStates, oportunidades, currentUser, usuariosApp]);

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
          {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-accent-ink" />
            <span>Pipeline de Oportunidades de Venta</span>
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Gestiona todas las oportunidades desde la captación hasta la entrega y postventa.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setShowNewOpModal(true)}
            className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Oportunidad</span>
          </button>

          <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-md border border-line">
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'lista' ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tablero' ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Next-Gen (Attio & Twenty Style) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface p-3 rounded-panel border border-line shadow-xs">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
          <input
            type="search"
            placeholder="Buscar por código, cliente, título, RUT..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-app border border-line rounded-control text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent"
          />
          {filterSearch && (
            <button
              onClick={() => setFilterSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <FilterPills
          filters={ventasFilterDefs}
          activeFilters={{
            estado: filterEstado,
            tipo_venta: filterTipoVenta,
            prioridad: filterPrioridad,
            asignado: filterAsignado,
          }}
          onFilterChange={(id, value) => {
            if (id === 'estado') setFilterEstado(value);
            if (id === 'tipo_venta') setFilterTipoVenta(value);
            if (id === 'prioridad') setFilterPrioridad(value);
            if (id === 'asignado') setFilterAsignado(value);
          }}
          onClearAll={() => {
            setFilterSearch('');
            setFilterEstado('todos');
            setFilterTipoVenta('todos');
            setFilterPrioridad('todos');
            setFilterAsignado('todos');
          }}
          totalResults={oportunidades.length}
          filteredResults={filteredOportunidades.length}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-ink-muted font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : activeTab === 'tablero' ? (
        <div className="space-y-4 ">
          {SECCIONES_PIPELINE.map((activeSection) => (
              <div key={activeSection.id} className="p-4 rounded-xl border border-line bg-surface space-y-4 min-h-[560px]">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <h3 className="text-base font-semibold text-[var(--color-ink)]">{activeSection.nombre}</h3>
                  <span className="text-xs font-mono font-bold text-ink-muted">
                    {activeSection.etapas.length} etapas
                  </span>
                </div>

                <div
                  className="grid gap-4 overflow-x-auto pb-2"
                  style={{ gridTemplateColumns: `repeat(${activeSection.etapas.length}, minmax(260px, 1fr))` }}
                >
                  {activeSection.etapas.map((stage) => {
                    const colOps = filteredOportunidades.filter((o) => o.estado_pipeline === stage.id);
                    const isTargetColumn = dragOverColumn === stage.id;
                    const totalColMonto = colOps.reduce((acc, curr) => acc + getOportunidadTotalValue(curr), 0);

                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => handleDragOver(e, stage.id)}
                        onDrop={(e) => handleDrop(e, stage.id)}
                        className={clsx(
                          'rounded-panel border p-3 min-h-[500px] transition flex flex-col',
                          isTargetColumn
                            ? 'bg-accent-soft border-accent ring-2 ring-accent/20'
                            : 'bg-surface-muted/30 border-line'
                        )}
                      >
                        {/* Cabecera de Etapa (Folk & Attio Style) */}
                        <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3 shrink-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={clsx('w-2 h-2 rounded-full shrink-0', stage.color)} />
                            <h4 className="text-xs font-bold text-ink truncate">{stage.label}</h4>
                            <span className="text-[11px] font-semibold text-ink-muted bg-surface px-1.5 py-0.2 rounded-full border border-line shrink-0">
                              {colOps.length}
                            </span>
                          </div>
                          {totalColMonto > 0 && (
                            <span className="t-num text-[11px] font-semibold text-ink-muted shrink-0" title={`Total acumulado: $${totalColMonto.toLocaleString('es-CL')}`}>
                              ${Math.round(totalColMonto / 1000).toLocaleString('es-CL')}k
                            </span>
                          )}
                        </div>

                        {/* Listado de Tarjetas Modulares Compactas */}
                        <div className="space-y-2.5 flex-1 overflow-y-auto">
                          {colOps.map((op) => {
                            const latestQuote = getActiveQuote(op);
                            const montoTotal = getOportunidadTotalValue(op);
                            const montoAbonado = getOportunidadAbonadoValue(op);
                            const saldoPendiente = Math.max(0, montoTotal - montoAbonado);
                            const isBeingDragged = draggedOpId === op.id;

                            return (
                              <KanbanCard
                                key={op.id}
                                oportunidad={op}
                                assignedUser={usuariosApp.find((u) => u.id === op.asignado_a)}
                                montoTotal={montoTotal}
                                montoAbonado={montoAbonado}
                                saldoPendiente={saldoPendiente}
                                latestQuoteVersion={latestQuote?.version}
                                isUnaccredited={isUnaccreditedClose(op)}
                                isBeingDragged={isBeingDragged}
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
                            <div className="min-h-24 border border-dashed border-line rounded-control flex items-center justify-center text-xs text-ink-muted font-medium bg-surface/50">
                              Sin oportunidades
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          ))}
        </div>
      ) : (
        /* Vista Lista Agrupada por Secciones del Pipeline */
        <div className="space-y-5">
          {SECCIONES_PIPELINE.map((sec) => {
            const isSecCollapsed = !!collapsedParentSections[sec.id];
            const secOps = filteredOportunidades.filter((o) =>
              sec.etapas.some((e) => e.id === o.estado_pipeline)
            );

            return (
              <div key={sec.id} className="hg-list-group">
                {/* Header de Sección Colapsable */}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedParentSections((prev) => ({
                      ...prev,
                      [sec.id]: !prev[sec.id],
                    }))
                  }
                  aria-expanded={!isSecCollapsed}
                  className="hg-list-group-heading w-full cursor-pointer select-none text-left hover:bg-[var(--color-surface-muted)]"
                >
                    {isSecCollapsed ? <ChevronRight className="w-5 h-5 text-[var(--color-ink-muted)]" /> : <ChevronDown className="w-5 h-5 text-[var(--color-ink-muted)]" />}
                    <span className="text-sm font-semibold text-[var(--color-ink)]">{sec.nombre}</span>
                    <span className="hg-list-count">{secOps.length}</span>
                </button>

                {/* Tablas por etapa dentro de esta sección */}
                {!isSecCollapsed && (
                  <div className="divide-y divide-[var(--color-line-subtle)]">
                    {sec.etapas.map((col) => {
                      const isCollapsed = !!collapsedSections[col.id];
                      const rawOps = filteredOportunidades.filter((o) => o.estado_pipeline === col.id);
                      const colOps = sortOpportunities(rawOps);
                      const isTargetColumn = dragOverColumn === col.id;

                      return (
                        <div
                          key={col.id}
                          onDragOver={(e) => handleDragOver(e, col.id)}
                          onDrop={(e) => handleDrop(e, col.id)}
                          className={`transition-all duration-200 ${
                            isTargetColumn
                              ? 'bg-accent-soft ring-2 ring-inset ring-[var(--color-accent)]'
                              : 'bg-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between px-4 py-3 transition group hover:bg-[var(--color-surface-muted)]">
                            <button
                              type="button"
                              onClick={() => setCollapsedSections((prev) => ({ ...prev, [col.id]: !prev[col.id] }))}
                              aria-expanded={!isCollapsed}
                              className="flex min-w-0 items-center gap-2.5 text-left"
                            >
                              <span className="text-ink-subtle group-hover:text-ink transition">
                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>

                              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                                <span className={`h-2.5 w-2.5 rounded-full border ${col.color} ${col.bg}`} />
                                <span>{col.label}</span>
                              </span>

                              <span className="hg-list-count">
                                {col.id === 'prod_finalizado' || col.id === 'rev_entregado'
                                  ? `${rawOps.filter((op) => !isUnaccreditedClose(op)).length} acreditadas · ${rawOps.length} registros`
                                  : rawOps.length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setShowNewOpModal(true)}
                              className="text-xs font-bold text-ink-muted hover:text-accent-ink transition flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Agregar Oportunidad</span>
                            </button>
                          </div>

                          {!isCollapsed && (
                            <div className="border-t border-[var(--color-line-subtle)]">
                              {colOps.length > 0 && <div>
                                {colOps.map((op) => {
                                  const responsable = usuariosApp.find((user) => user.id === op.asignado_a)?.nombre || 'Sin asignar';
                                  const monto = getOportunidadTotalValue(op);
                                  return (
                                    <div key={op.id} className="hg-list-row">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          const rect = event.currentTarget.getBoundingClientRect();
                                          setStageMenuPos({ opId: op.id, top: rect.bottom + 4, left: rect.left });
                                        }}
                                        className={`h-3.5 w-3.5 shrink-0 rounded-full border ${getStageDotColor(op.estado_pipeline)}`}
                                        aria-label={`Cambiar etapa de ${op.codigo}`}
                                      />
                                      <CodeStamp>{op.codigo}</CodeStamp>
                                      <button type="button" onClick={() => handleOpenOportunidad(op)} className="min-w-0 flex-1 text-left">
                                        <span className="block truncate text-sm font-semibold text-[var(--color-ink)] hover:text-[var(--color-accent-ink)]">{op.titulo}</span>
                                        <span className="block truncate text-xs text-[var(--color-ink-muted)]">{op.cliente?.nombre || 'Cliente sin nombre'}</span>
                                        {isUnaccreditedClose(op) && <span className="block text-xs font-semibold text-warning-ink">Entrega sin acreditar</span>}
                                      </button>
                                      <div className="hidden items-center gap-2 lg:flex">
                                        <span className="hg-list-meta" title={`Responsable: ${responsable}`}>{responsable}</span>
                                        {op.fecha_limite && <span className="hg-list-meta">Límite {op.fecha_limite}</span>}
                                        <span className="hg-list-meta t-num font-semibold text-[var(--color-ink)]">${monto.toLocaleString('es-CL')}</span>
                                      </div>
                                      <Link
                                        href={`/ventas/${op.id}`}
                                        className="p-1 text-ink-subtle hover:text-accent-ink rounded transition"
                                        title="Abrir ficha completa"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </Link>
                                    </div>
                                  );
                                })}
                              </div>}
                              {colOps.length === 0 && (
                                <div className="px-5 py-4 text-xs text-[var(--color-ink-muted)]">
                                  No hay oportunidades en esta etapa.
                                </div>
                              )}
                        </div>
                      )}
                    </div>
                  );
                })}
	              </div>
	            )}
	            </div>
	          );
	        })}
        </div>
      )}
      </>
      ) : (
        /* Vista Nativa de Oportunidad de Venta (Directa en página, sin modal flotante) */
        <div
          ref={modalContainerRef}
          className="bg-surface text-ink border border-line rounded-xl w-full p-4 sm:p-6 shadow-xs flex flex-col lg:flex-row gap-0 relative min-h-[calc(100vh-10rem)]"
        >
          {/* Columna Izquierda: Breadcrumb + Título + Accordions (Ancho Resizable) */}
          <div
            style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${modalLeftColRatio}%` : '100%' }}
            className="flex flex-col min-h-0 lg:h-full overflow-hidden pr-0 lg:pr-3 shrink-0"
          >
            {/* Header Superior con Flecha Atrás, Breadcrumb y Botones de Acción */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 text-sm shrink-0">
              <div className="flex items-center gap-2.5 text-ink-muted font-medium">
                <button
                  type="button"
                  onClick={handleCloseOportunidad}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control border border-line bg-surface hover:bg-surface-muted text-ink font-semibold text-xs transition shadow-xs cursor-pointer mr-1"
                  title="Volver al panel de ventas"
                >
                  <ArrowLeft className="w-4 h-4 text-ink-muted" />
                  <span>Volver al panel</span>
                </button>

                <Building className="w-4 h-4 text-accent-ink" />
                <Link href={`/clientes/${selectedOp.cliente_id}`} className="hover:text-accent-ink text-ink transition underline font-bold text-sm">
                  {selectedOp.cliente?.nombre || 'Cliente'}
                </Link>
                <span className="text-ink-subtle">/</span>
                <span className="text-ink-muted font-bold font-mono text-sm">{selectedOp.codigo}</span>
                <button
                  type="button"
                  onClick={() => setOpenSections((prev) => ({ ...prev, antecedentes: true }))}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-surface-muted hover:bg-accent-soft text-ink hover:text-accent-ink border border-line hover:border-accent/30 font-mono transition"
                  title={`${opAntecedentesList.length} archivo(s) adjunto(s) - Clic para ver`}
                >
                  <Paperclip className="w-3 h-3 text-accent-ink" />
                  <span>{opAntecedentesList.length}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <Link href={`/ventas/${selectedOp.id}/operacion`} className="px-3 py-1.5 bg-accent-soft hover:bg-accent-soft text-accent-ink rounded-md border border-accent/30 font-bold text-xs">
                  Producción y entregas
                </Link>
                <button
                  onClick={() => { setDeleteOpError(''); setOpToDelete(selectedOp); }}
                  className="px-3 py-1.5 bg-danger-soft hover:bg-danger-soft text-danger rounded-md transition border border-danger/30 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  title="Eliminar oportunidad"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </button>
              </div>
            </div>

              {/* Título Principal Editable Inline */}
              <div className="py-3 border-b border-line flex items-center justify-between shrink-0 mb-4">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2.5 w-full">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      className="bg-surface text-2xl font-bold text-ink border border-accent rounded-md px-3.5 py-1.5 w-full focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitleEdit}
                      className="bg-accent hover:bg-accent-hover text-on-accent p-2.5 rounded-md transition font-bold"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setIsEditingTitle(true);
                      setEditTitleValue(selectedOp.titulo);
                    }}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <h2 className="text-2xl sm:text-3xl font-bold text-ink leading-tight group-hover:text-accent-ink transition">
                      {selectedOp.titulo}
                    </h2>
                    <Edit className="w-5 h-5 text-ink-subtle group-hover:text-accent-ink transition opacity-0 group-hover:opacity-100" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 text-sm">
              {isUnaccreditedClose(selectedOp) && <p role="alert" className="rounded-md border border-warning/30 bg-warning-soft p-3 text-sm font-semibold text-warning-ink">Esta venta figura cerrada en el historial, pero su entrega no tiene respaldo acreditado. La cobranza automática permanece suspendida.</p>}
              {/* Resumen visible: campos de decisión y seguimiento rápido */}
              {selectedOp.origen?.trim().toLowerCase() === 'whatsapp' && <CapturedDataPending />}
              <section aria-label="Resumen de la oportunidad" className="rounded-xl border border-line bg-[var(--color-surface-muted)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">Resumen de la oportunidad</h3>
                  <span className="text-[11px] text-ink-subtle">Datos principales</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-2 text-xs">
                  <div className="min-w-0">
                    {/* 1. Status */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Disc className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Estado</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <select
                          value={selectedOp.estado_pipeline}
                          onChange={async (e) => {
                            const newStage = e.target.value as EstadoPipeline;
                            await moveOportunidadToState(selectedOp.id, newStage);
                          }}
                          className="w-full h-full appearance-none bg-surface-muted hover:bg-surface-muted text-ink font-bold text-xs pl-3 pr-8 rounded-md border border-line cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition shadow-xs"
                        >
                          {pipelineStates.map((etapa) => (
                            <option key={etapa.id} value={etapa.id}>{etapa.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 1. Vendedor (anteriormente Assignees) */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <User className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Vendedor</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <select
                          value={selectedOp.asignado_a || ''}
                          onChange={async (e) => {
                            const newUserId = e.target.value || null;
                            updateOportunidadField(selectedOp.id, 'asignado_a', newUserId);
                            const userObj = usuariosApp.find((u) => u.id === newUserId);
                            await addOportunidadActividad(selectedOp.id, `Vendedor asignado actualizado a "${userObj?.nombre || 'Sin asignar'}".`);
                          }}
                          className={`w-full h-full appearance-none bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md pl-3 pr-8 text-xs font-bold truncate focus:outline-none focus:border-accent transition shadow-xs cursor-pointer ${
                            selectedOp.asignado_a ? 'text-ink' : 'text-ink-subtle font-normal'
                          }`}
                        >
                          <option value="">Sin asignar</option>
                          {usuariosApp.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* Fechas */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3 min-h-[40px]">
                      <div className="w-full sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Calendar className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Fechas</span>
                      </div>
                      <div className="w-full sm:w-auto min-w-0 flex-1 h-8 bg-surface border border-line hover:border-line rounded-md px-2.5 flex items-center justify-between text-xs text-ink shadow-xs">
                        <input
                          type="date"
                          value={selectedOp.fecha_inicio || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            updateOportunidadField(selectedOp.id, 'fecha_inicio', newDate);
                            await addOportunidadActividad(selectedOp.id, `Fecha de inicio actualizada a ${newDate} desde el detalle.`);
                          }}
                          className="bg-transparent text-ink font-mono text-xs w-[95px] min-w-0 focus:outline-none cursor-pointer [color-scheme:light]"
                          title="Fecha de inicio"
                        />
                        <span className="text-ink-subtle font-bold">→</span>
                        <input
                          type="date"
                          value={selectedOp.fecha_limite || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            updateOportunidadField(selectedOp.id, 'fecha_limite', newDate);
                            await addOportunidadActividad(selectedOp.id, `Fecha límite actualizada a ${newDate} desde el detalle.`);
                          }}
                          className="bg-transparent text-warning-ink font-mono text-xs w-[95px] min-w-0 focus:outline-none cursor-pointer [color-scheme:light]"
                          title="Fecha límite"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 2. Priority */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Flag className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Prioridad</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                          <Flag className={`w-3.5 h-3.5 ${
                            selectedOp.prioridad === 'urgente' ? 'text-danger' : selectedOp.prioridad === 'alta' ? 'text-warning-ink' : selectedOp.prioridad === 'normal' ? 'text-info' : 'text-ink-subtle'
                          }`} />
                        </div>
                        <select
                          value={selectedOp.prioridad || ''}
                          onChange={async (e) => {
                            const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                            updateOportunidadField(selectedOp.id, 'prioridad', newPrio || null);
                            await addOportunidadActividad(selectedOp.id, `Prioridad cambiada a "${newPrio || 'normal'}" desde el detalle.`);
                          }}
                          className={`w-full h-full appearance-none bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md pl-8 pr-8 text-xs font-bold focus:outline-none focus:border-accent transition shadow-xs cursor-pointer ${
                            selectedOp.prioridad ? 'text-ink' : 'text-ink-subtle font-normal'
                          }`}
                        >
                          <option value="">Sin prioridad</option>
                          <option value="normal">Normal</option>
                          <option value="alta">Alta</option>
                          <option value="urgente">Urgente</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 3. Origen */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Compass className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Origen</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <select
                          value={selectedOp.origen || ''}
                          onChange={async (e) => {
                            const origen = e.target.value;
                            updateOportunidadField(selectedOp.id, 'origen', origen || null);
                            await addOportunidadActividad(
                              selectedOp.id,
                              origen ? `Origen actualizado a "${origen}".` : 'Origen de la oportunidad eliminado.'
                            );
                          }}
                          className={`w-full h-full appearance-none bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md pl-3 pr-8 text-xs font-bold focus:outline-none focus:border-accent transition shadow-xs cursor-pointer ${
                            selectedOp.origen ? 'text-ink' : 'text-ink-subtle font-normal'
                          }`}
                        >
                          <option value="">Sin origen</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Webmail">Webmail</option>
                          <option value="Llamado">Llamado</option>
                          <option value="Visita presencial">Visita presencial</option>
                          <option value="Referido">Referido</option>
                          <option value="Cliente recurrente">Cliente recurrente</option>
                          <option value="Manual">Manual</option>
                          {selectedOp.origen && !['WhatsApp', 'Webmail', 'Llamado', 'Visita presencial', 'Referido', 'Cliente recurrente', 'Manual'].includes(selectedOp.origen) && (
                            <option value={selectedOp.origen}>{selectedOp.origen}</option>
                          )}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 4. Tipo de Venta / Tags */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Tag className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Tipo de venta</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <select
                          value={selectedOp.tipo_venta || 'Instalación'}
                          onChange={async (e) => {
                            const newTipo = e.target.value;
                            updateOportunidadField(selectedOp.id, 'tipo_venta', newTipo);
                            await addOportunidadActividad(selectedOp.id, `Tipo de venta cambiado a "${newTipo}" desde el detalle.`);
                          }}
                          className="w-full h-full appearance-none bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md pl-3 pr-8 text-xs font-bold text-ink focus:outline-none focus:border-accent transition shadow-xs cursor-pointer"
                        >
                          <option value="Instalación">Instalación</option>
                          <option value="Suministro">Suministro</option>
                          <option value="Reventa de Material">Reventa de Material</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 5. Requerimiento (debajo de Tipo de venta) */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-ink-muted font-medium shrink-0">
                        <Layers className="w-4 h-4 text-ink-subtle shrink-0" />
                        <span>Requerimiento</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <select
                          value={selectedOp.modalidad_requerimiento || 'instalacion'}
                          onChange={async (e) => {
                            const value = e.target.value as 'solo_material' | 'instalacion';
                            updateOportunidadField(selectedOp.id, 'modalidad_requerimiento', value);
                            await addOportunidadActividad(
                              selectedOp.id,
                              `Requerimiento actualizado a "${value === 'solo_material' ? 'Sólo material' : 'Instalación'}".`
                            );
                          }}
                          className="w-full h-full appearance-none bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md pl-3 pr-8 text-xs font-bold text-ink focus:outline-none focus:border-accent transition shadow-xs cursor-pointer"
                        >
                          <option value="instalacion">Instalación</option>
                          <option value="solo_material">Sólo material</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {(() => {
                const activeClient = clientes.find((c) => c.id === selectedOp.cliente_id) || selectedOp.cliente;
                const ejecutivoCliente = usuariosApp.find((u) => u.id === (activeClient?.usuario_id || selectedOp.asignado_a));

                return (
                  <div className="mb-4 bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-surface hover:bg-surface-muted text-ink font-semibold text-sm flex flex-wrap items-center justify-between gap-3 border-b border-line transition">
                      <button
                        type="button"
                        onClick={() => setOpenSections((prev) => ({ ...prev, contacto: !prev.contacto }))}
                        className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-sm text-ink"
                      >
                        <User className="w-4 h-4 text-accent-ink" />
                        <span>Información del cliente</span>
                        {openSections.contacto ? (
                          <ChevronUp className="w-4 h-4 text-ink-muted" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-ink-muted" />
                        )}
                      </button>
                      {selectedOp.cliente_id && (
                        <Link
                          href={`/clientes/${selectedOp.cliente_id}`}
                          className="text-xs font-semibold bg-accent-soft hover:bg-accent text-accent-ink hover:text-white border border-accent/30 px-3 py-1.5 rounded-md transition flex items-center gap-1.5"
                        >
                          Editar ficha del cliente
                        </Link>
                      )}
                    </div>

                    {openSections.contacto && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5 text-ink text-xs">
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">Razón social / Nombre</span>
                        <strong className="text-ink text-xs font-bold block">{activeClient?.nombre || 'Hormiglass Cliente'}</strong>
                      </div>
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">Encargado del cliente</span>
                        <span className="text-ink text-xs font-bold block">{ejecutivoCliente?.nombre || 'Sin encargado asignado'}</span>
                      </div>
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">RUT registrado</span>
                        <span className="font-mono text-warning-ink font-bold text-xs block">{activeClient?.rut || 'Sin RUT'}</span>
                      </div>
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">Teléfono</span>
                        <span className="flex items-center gap-1.5 font-bold text-ink text-xs">
                          <Phone className="w-3.5 h-3.5 text-accent-ink" />
                          {activeClient?.telefono || 'No indicado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">Dirección de despacho / Obra</span>
                        <span className="text-ink text-xs font-bold block" title={activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}>
                          {activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}
                        </span>
                      </div>
                      <div>
                        <span className="text-ink-muted font-medium text-xs block mb-0.5">Comuna / Región</span>
                        <span className="text-ink text-xs font-bold block">
                          {[activeClient?.comuna || selectedOp.comuna, activeClient?.region || selectedOp.region || 'Región Metropolitana'].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-ink-muted font-medium text-xs block mb-1">Correos electrónicos</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-surface-muted px-2.5 py-1 rounded-md border border-line text-ink font-mono text-xs flex items-center gap-1.5 font-semibold">
                            <Mail className="w-3.5 h-3.5 text-accent-ink" />
                            {activeClient?.correo || 'Sin correo principal'}
                          </span>
                          {activeClient?.correos_secundarios?.map((sec, idx) => (
                            <span key={idx} className="bg-surface-muted px-2.5 py-1 rounded-md border border-line text-ink-muted font-mono text-xs flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-ink-subtle" />
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                );
              })()}

              {/* Listas Desplegables (Accordions) */}
                {/* Área Comercial & Ventas */}
                <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                <AreaCardHeader
                  icon={TrendingUp}
                  title="Área Comercial & Ventas"
                  open={areaExpanded.comercial}
                  onToggle={() => setAreaExpanded((prev) => ({ ...prev, comercial: !prev.comercial }))}
                />

                {areaExpanded.comercial && (
                  <div className="border-t border-line p-3 sm:p-4 space-y-3.5">

                {/* Accordion 1: Cotizaciones de la Oportunidad */}
                <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                  <button
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-3 bg-surface-muted hover:bg-surface-muted/80 text-ink font-semibold text-xs flex items-center justify-between border-b border-line transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-accent-ink" />
                      <span>Cotizaciones de la Oportunidad</span>
                    </span>
                    {openSections.productos ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                  </button>

                  {openSections.productos && (
                    <div className="p-5 space-y-4 bg-surface text-ink">
                      {cotizacionErrorMsg && <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">{cotizacionErrorMsg}</p>}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
                        <div>
                          <h4 className="text-ink font-semibold text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-accent-ink" />
                            <span>Cotizaciones del Cliente:</span>
                          </h4>
                          <p className="text-xs text-ink-muted mt-1">
                            Vincula las cotizaciones a esta oportunidad. Solo la última versión <strong>Enviada</strong> o <strong>Aprobada</strong> determina el valor total.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowUnifiedCotModal(true)}
                          className="bg-accent hover:bg-accent-hover text-on-accent text-xs font-semibold px-3.5 py-2 rounded-md transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-xs"
                        >
                          <FilePlus className="w-4 h-4" />
                          <span>Crear Nueva Cotización</span>
                        </button>
                      </div>

                      {(() => {
                        const candidateQuotes = allCotizaciones.filter(
                          (c) => c.cliente_id === selectedOp.cliente_id
                        );
                        const unassignedQuotes = candidateQuotes.filter(
                          (c) => !c.oportunidad_id || c.oportunidad_id !== selectedOp.id
                        );
                        const linkedQuotes = candidateQuotes.filter(
                          (c) => c.oportunidad_id === selectedOp.id
                        );
                        const totalValorOportunidad = getOportunidadTotalValue(selectedOp);

                        return (
                          <div className="space-y-4">
                            {/* Desplegable de Selección y Previsualización de Cotizaciones Disponibles */}
                            {unassignedQuotes.length > 0 && (
                              <div className="bg-surface-muted p-4 rounded-lg border border-line space-y-3">
                                <label className="text-ink font-semibold text-xs flex items-center gap-2 uppercase tracking-normal">
                                  <FileText className="w-4 h-4 text-accent-ink" />
                                  <span>Seleccionar Cotización Disponible para Agregar:</span>
                                </label>

                                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                                  <select
                                    value={selectedCandidateCotId}
                                    onChange={(e) => setSelectedCandidateCotId(e.target.value)}
                                    className="w-full bg-surface text-ink border border-line rounded-md px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-accent"
                                  >
                                    <option value="">-- Escoger Cotización Disponible ({unassignedQuotes.length}) --</option>
                                    {unassignedQuotes.map((cot) => (
                                      <option key={cot.id} value={cot.id}>
                                        {cot.numero_cotizacion} (v{cot.version || 1}) — ${(cot.monto_total || 0).toLocaleString('es-CL')} CLP [{cot.estado}]
                                      </option>
                                    ))}
                                  </select>

                                  {selectedCandidateCotId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const found = unassignedQuotes.find((c) => c.id === selectedCandidateCotId);
                                        if (found) setPreviewCotizacion(found);
                                      }}
                                      className="w-full sm:w-auto bg-surface hover:bg-surface-muted text-ink text-xs font-semibold px-3.5 py-2.5 rounded-md transition flex items-center justify-center gap-1.5 shrink-0 border border-line shadow-xs"
                                      title="Previsualizar PDF antes de vincular"
                                    >
                                      <Eye className="w-4 h-4 text-accent-ink" />
                                      <span>Previsualizar</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={!selectedCandidateCotId}
                                    onClick={async () => {
                                      if (!selectedCandidateCotId) return;
                                      const targetCot = unassignedQuotes.find((c) => c.id === selectedCandidateCotId);
                                      if (!targetCot) return;

                                      try {
                                        await guardarCambioCotizacion(targetCot, { oportunidad_id: selectedOp.id });
                                        setSelectedCandidateCotId('');
                                      } catch (err: any) {
                                        setCotizacionErrorMsg(mensajeError(err, 'No se pudo vincular la cotización.'));
                                        return;
                                      }
                                      await addOportunidadActividad(
                                        selectedOp.id,
                                        `Cotización ${targetCot.numero_cotizacion} agregada y vinculada a la oportunidad.`
                                      );
                                    }}
                                    className="w-full sm:w-auto bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-4 py-2.5 rounded-md transition flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Agregar</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Lista de Cotizaciones Agregadas a la Oportunidad */}
                            {linkedQuotes.length === 0 ? (
                              <div className="p-5 bg-surface-muted rounded-lg border border-dashed border-line text-ink-muted text-center text-xs">
                                No hay cotizaciones agregadas a esta oportunidad. {unassignedQuotes.length > 0 ? 'Selecciona una del desplegable de arriba o haz' : 'Haz'} clic en &quot;Crear Nueva Cotización&quot;.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {linkedQuotes.map((cot) => {
                                  const isLinked = true;
                                  const isSummed = cot.id === getActiveQuote(selectedOp)?.id &&
                                    (cot.estado === 'aprobada' || cot.estado === 'enviada');

                                  return (
                                    <div
                                      key={cot.id}
                                      className={`p-4 rounded-lg border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        isLinked
                                          ? 'bg-surface border-accent/30 shadow-xs'
                                          : 'bg-surface border-line opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3.5">
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={async (e) => {
                                            const checked = e.target.checked;
                                            const newOpId = checked ? selectedOp.id : undefined;

                                            try {
                                              await guardarCambioCotizacion(cot, { oportunidad_id: newOpId || null });
                                            } catch (err: any) {
                                              setCotizacionErrorMsg(mensajeError(err, 'No se pudo cambiar el vínculo.'));
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} ${checked ? 'vinculada a' : 'desvinculada de'} la oportunidad.`
                                            );
                                          }}
                                          className="w-4 h-4 rounded text-accent-ink focus:ring-[var(--color-accent)] accent-[var(--color-accent)] cursor-pointer shrink-0"
                                        />

                                        <div className="space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono font-bold text-ink text-sm">
                                              {cot.numero_cotizacion}
                                            </span>
                                            <span className="text-xs font-semibold uppercase bg-info-soft text-info px-2 py-0.5 rounded-full border border-info/30">
                                              v{cot.version || 1}
                                            </span>
                                            {isSummed ? (
                                              <span className="t-micro font-bold uppercase bg-success-soft text-success px-2.5 py-0.5 rounded-full border border-success/30">
                                                Cotización vigente
                                              </span>
                                            ) : isLinked ? (
                                              <span className="t-micro font-bold uppercase bg-warning-soft text-warning-ink px-2.5 py-0.5 rounded-full border border-warning/30">
                                                Agregada ({cot.estado})
                                              </span>
                                            ) : (
                                              <span className="t-micro font-bold text-ink-subtle">
                                                Sin asignar
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-bold text-accent-ink text-sm block">
                                            ${(cot.monto_total || 0).toLocaleString('es-CL')} CLP
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2.5 self-end sm:self-auto">
                                        <select
                                          value={cot.estado}
                                          onChange={async (e) => {
                                            const newStatus = e.target.value as EstadoCotizacion;

                                            try {
                                              await guardarCambioCotizacion(cot, { estado: newStatus });
                                            } catch (err: any) {
                                              setCotizacionErrorMsg(mensajeError(err, 'No se pudo cambiar el estado.'));
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Estado de cotización ${cot.numero_cotizacion} cambiado a "${newStatus.toUpperCase()}"`
                                            );
                                          }}
                                          className={`text-xs font-semibold uppercase px-3 py-1.5 rounded-md border cursor-pointer focus:outline-none ${
                                            cot.estado === 'aprobada'
                                              ? 'bg-success-soft text-success border-success/30'
                                              : cot.estado === 'enviada'
                                              ? 'bg-info-soft text-info border-info/30'
                                              : cot.estado === 'declinada' || cot.estado === 'rechazada'
                                              ? 'bg-danger-soft text-danger border-danger/30'
                                              : 'bg-warning-soft text-warning-ink border-warning/30'
                                          }`}
                                        >
                                          <option value="borrador">Borrador</option>
                                          <option value="enviada">Enviada</option>
                                          <option value="aprobada">Aprobada</option>
                                          <option value="rechazada">Rechazada</option>
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() => setPreviewCotizacion(cot)}
                                          className="p-2 bg-surface hover:bg-accent-soft text-ink hover:text-accent-ink rounded-md font-bold transition text-xs flex items-center gap-1.5 border border-line"
                                          title="Previsualizar PDF"
                                        >
                                          <Eye className="w-4 h-4" />
                                          <span className="hidden sm:inline">PDF</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              await guardarCambioCotizacion(cot, { oportunidad_id: null });
                                            } catch (err: any) {
                                              setCotizacionErrorMsg(mensajeError(err, 'No se pudo desvincular la cotización.'));
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} desvinculada de esta oportunidad.`
                                            );
                                          }}
                                          className="p-2 bg-surface hover:bg-danger-soft text-ink-subtle hover:text-danger rounded-md transition border border-line"
                                          title="Desvincular cotización de la oportunidad"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Resumen Total Sumado de Oportunidad */}
                            <div className="p-4 bg-surface-muted border border-line rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                              <div>
                                <span className="text-ink font-semibold text-sm block">Valor Total de la Oportunidad:</span>
                                <span className="text-xs text-ink-muted">
                                  Solo la última versión vinculada en estado <strong>Enviada</strong> o <strong>Aprobada</strong>.
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-2xl font-bold text-accent-ink block">
                                  ${totalValorOportunidad.toLocaleString('es-CL')} CLP
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Accordion 3: Finanzas & Documentos Adjuntos (Comprobantes de Pago) */}
                <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                  <button
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-3 bg-surface-muted hover:bg-surface-muted/80 text-ink font-semibold text-xs flex items-center justify-between border-b border-line transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-accent-ink" />
                      <span>Finanzas & Comprobantes de Pago</span>
                    </span>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                  </button>

                  {openSections.finanzas && (
                    <div className="p-5 space-y-5 bg-surface text-ink">
                      {/* Resumen de Saldo */}
                      {(() => {
                        const totalCot = getOportunidadTotalValue(selectedOp);
                        const abonado = getOportunidadAbonadoValue(selectedOp);
                        const abonosPendientes = (selectedOp.comprobantes_pago || [])
                          .filter((item: any) => typeof item === 'object' && item !== null && item.estado === 'pendiente')
                          .reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0);
                        const saldo = Math.max(0, totalCot - abonado);

                        return (
                          <div className="space-y-4">
                            {/* Resumen Financiero Calculado */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-surface-muted p-4 rounded-lg border border-line text-center">
                              <div>
                                <span className="text-ink-muted block text-xs font-semibold mb-1">Valor Total Cotizado:</span>
                                <strong className="text-ink text-lg font-bold">${totalCot.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-ink-muted block text-xs font-semibold mb-1">Total Validado en Caja:</span>
                                <strong className="text-success text-lg font-bold">${abonado.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-ink-muted block text-xs font-semibold mb-1">Pendiente de Validación:</span>
                                <strong className={`text-lg font-bold ${abonosPendientes > 0 ? 'text-warning-ink' : 'text-ink-subtle'}`}>
                                  ${abonosPendientes.toLocaleString('es-CL')}
                                </strong>
                              </div>
                              <div>
                                <span className="text-ink-muted block text-xs font-semibold mb-1">Saldo por Cobrar:</span>
                                <strong className="text-warning-ink text-lg font-bold">${saldo.toLocaleString('es-CL')}</strong>
                              </div>
                            </div>
                            {abonosPendientes > 0 && (
                              <div className="p-2.5 bg-warning-soft/70 border border-warning/30 rounded-md text-warning-ink text-xs flex items-center gap-2">
                                <Clock className="w-4 h-4 text-warning-ink shrink-0" />
                                <span>Hay <strong>${abonosPendientes.toLocaleString('es-CL')}</strong> en comprobantes pendientes de validación por finanzas en Caja.</span>
                              </div>
                            )}

                            {/* Matriz Operacional de Costos y Margen por NV (Fase 3) */}
                            <div className="bg-gradient-to-br bg-surface-dark bg-surface-dark text-white p-4 rounded-lg border border-line space-y-3 shadow-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/80 pb-2.5">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-accent-ink" />
                                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                                    Matriz de Costos y Margen Operacional de la NV
                                  </span>
                                </div>
                                {margenOp && (
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                        (margenOp.porcentaje_margen_proyectado ?? 0) >= 35
                                          ? 'bg-success-soft/20 text-success border-success/30/40'
                                          : (margenOp.porcentaje_margen_proyectado ?? 0) >= 20
                                          ? 'bg-warning-soft/20 text-warning-ink border-warning/30/40'
                                          : 'bg-surface-muted/20 text-ink border-line/40'
                                      }`}
                                    >
                                      Margen Proyectado: {(margenOp.porcentaje_margen_proyectado ?? 0).toFixed(1)}%
                                    </span>
                                  </div>
                                )}
                              </div>

                              {loadingMargenOp ? (
                                <div className="py-3 text-center text-xs text-ink-subtle animate-pulse">
                                  Calculando costos directos y rentabilidad en tiempo real...
                                </div>
                              ) : margenOp ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                  {/* Compras OC */}
                                  <div className="bg-surface-muted/90 border border-line/70 p-2.5 rounded-md">
                                    <span className="t-micro text-ink-subtle uppercase font-bold flex items-center gap-1">
                                      <ShoppingCart className="w-3 h-3 text-ink" />
                                      <span>Compras OC Asignadas</span>
                                    </span>
                                    <strong className="text-white text-sm font-bold block mt-0.5">
                                      ${(margenOp.costo_compras_asignadas ?? 0).toLocaleString('es-CL')}
                                    </strong>
                                  </div>

                                  {/* Fletes & Guías */}
                                  <div className="bg-surface-muted/90 border border-line/70 p-2.5 rounded-md">
                                    <span className="t-micro text-ink-subtle uppercase font-bold flex items-center gap-1">
                                      <Truck className="w-3 h-3 text-ink" />
                                      <span>Fletes Despacho</span>
                                    </span>
                                    <strong className="text-white text-sm font-bold block mt-0.5">
                                      ${(margenOp.costo_fletes_despacho ?? 0).toLocaleString('es-CL')}
                                    </strong>
                                  </div>

                                  {/* Costo Directo Total */}
                                  <div className="bg-surface-muted/90 border border-line/70 p-2.5 rounded-md">
                                    <span className="t-micro text-ink-subtle uppercase font-bold block">
                                      Costo Directo Total
                                    </span>
                                    <strong className="text-ink text-sm font-bold block mt-0.5">
                                      ${(margenOp.costo_directo_total ?? 0).toLocaleString('es-CL')}
                                    </strong>
                                    {margenOp.costo_caja_directo > 0 && (
                                      <span className="t-micro text-ink-subtle block">
                                        +${(margenOp.costo_caja_directo).toLocaleString('es-CL')} caja
                                      </span>
                                    )}
                                  </div>

                                  {/* Margen Bruto Real / Proyectado */}
                                  <div className="bg-surface-muted/90 border border-line/70 p-2.5 rounded-md">
                                    <span className="t-micro text-ink-subtle uppercase font-bold block">
                                      Margen Bruto Real (Cobrado)
                                    </span>
                                    <strong
                                      className={`text-sm font-bold block mt-0.5 ${
                                        (margenOp.margen_bruto_real ?? 0) >= 0 ? 'text-success' : 'text-ink'
                                      }`}
                                    >
                                      ${(margenOp.margen_bruto_real ?? 0).toLocaleString('es-CL')}
                                    </strong>
                                    <span className="t-micro text-ink-subtle block truncate">
                                      Real: {(margenOp.porcentaje_margen_real ?? 0).toFixed(1)}% | Proy: ${(margenOp.margen_bruto_proyectado ?? 0).toLocaleString('es-CL')}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="py-2 text-center text-xs text-ink-subtle">
                                  Sin costos directos registrados para esta nota de venta.
                                </div>
                              )}
                            </div>

                            {/* Registro de Abonos e Historial Acumulativo */}
                            <div className="bg-surface-muted p-4 rounded-lg border border-line space-y-4">
                              <h4 className="text-ink font-semibold text-sm flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-accent-ink" />
                                <span>Ingresar Nuevo Abono o Pago (Comprobante Obligatorio)</span>
                              </h4>

                              {abonoErrorMsg && (
                                <div className="p-3 bg-danger-soft border border-danger/30 text-danger rounded-md text-xs font-bold">
                                  {abonoErrorMsg}
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="text-xs text-ink-muted font-bold block mb-1">Monto Abono ($ CLP) *</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-ink-subtle font-bold text-xs">$</span>
                                    <input
                                      type="text"
                                      placeholder="500.000"
                                      value={nuevoAbonoMonto ? Number(nuevoAbonoMonto).toLocaleString('es-CL') : ''}
                                      onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        setNuevoAbonoMonto(digits);
                                        setAbonoErrorMsg('');
                                      }}
                                      className="w-full bg-surface text-ink border border-line rounded-md pl-7 pr-3 py-2 text-xs font-bold focus:outline-none focus:border-accent"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-xs text-ink-muted font-bold block mb-1">Comprobante de Pago *</label>
                                  <label className="w-full bg-surface hover:bg-surface-muted text-ink border border-line rounded-md px-3 py-2 text-xs font-bold cursor-pointer flex items-center justify-between transition truncate">
                                    <span className="truncate">{nuevoAbonoFileName || 'Subir Comprobante'}</span>
                                    <Paperclip className="w-4 h-4 text-accent-ink shrink-0 ml-1" />
                                    <input
                                      type="file"
                                      required
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          if (file.size > 10 * 1024 * 1024) {
                                            setAbonoErrorMsg('El comprobante excede el tamaño máximo de 10 MB.');
                                            return;
                                          }
                                          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                          setNuevoAbonoFile(file);
                                          setNuevoAbonoFileName(safeName);
                                          setAbonoErrorMsg('');
                                        }
                                      }}
                                    />
                                  </label>
                                </div>

                                <div>
                                  <label className="text-xs text-ink-muted font-bold block mb-1">Nota / Referencia</label>
                                  <input
                                    type="text"
                                    placeholder="Ej. Transferencia #9842"
                                    value={nuevoAbonoNota}
                                    onChange={(e) => setNuevoAbonoNota(e.target.value)}
                                    className="w-full bg-surface text-ink border border-line rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent"
                                  />
                                </div>

                                <div className="flex items-end">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const rawVal = Number(nuevoAbonoMonto);
                                      if (!rawVal || rawVal <= 0) {
                                        setAbonoErrorMsg('Ingresa un monto de abono válido.');
                                        return;
                                      }
                                      if (!nuevoAbonoFile) {
                                        setAbonoErrorMsg('El comprobante de pago es obligatorio.');
                                        return;
                                      }

                                      setAbonoSaving(true);
                                      let fileName = '';
                                      const pagoId = crypto.randomUUID();
                                      try {
                                        const cleanFileName = nuevoAbonoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                        fileName = `abonos/${selectedOp.id}/${crypto.randomUUID()}_${cleanFileName}`;
                                        const { data: upload, error: uploadError } = await supabase.storage.from('documentos').upload(fileName, nuevoAbonoFile, {
                                          contentType: nuevoAbonoFile.type || undefined,
                                          upsert: false,
                                        });
                                        if (uploadError || !upload) throw new Error(mensajeError(uploadError, 'No se pudo subir el archivo.'));
                                        await guardarAbono('crear', {
                                          id: pagoId,
                                          monto: rawVal,
                                          fecha: new Date().toLocaleString('es-CL'),
                                          fecha_iso: new Date().toISOString(),
                                          nota: nuevoAbonoNota || 'Abono registrado',
                                          comprobante_nombre: nuevoAbonoFile.name,
                                          comprobante_url: fileName,
                                        });
                                        setNuevoAbonoMonto('');
                                        setNuevoAbonoNota('');
                                        setNuevoAbonoFile(null);
                                        setNuevoAbonoFileName('');
                                      } catch (err: any) {
                                        if (fileName) {
                                          // Si se perdió la respuesta tras el commit, conservar el respaldo ya vinculado.
                                          const { data: persisted } = await supabase.from('oportunidades')
                                            .select('comprobantes_pago, monto_abonado').eq('id', selectedOp.id).single();
                                          if (!persisted) {
                                            setAbonoErrorMsg('No se pudo confirmar el registro. Recarga la oportunidad antes de intentar de nuevo.');
                                            return;
                                          }
                                          const registered = (persisted?.comprobantes_pago || []).some(
                                            (pago: { id?: string }) => pago.id === pagoId,
                                          );
                                          if (registered) {
                                            setSelectedOp((prev) => prev ? { ...prev, ...persisted } : null);
                                            setOportunidades((prev) => prev.map((op) => op.id === selectedOp.id ? { ...op, ...persisted } : op));
                                            setNuevoAbonoMonto('');
                                            setNuevoAbonoNota('');
                                            setNuevoAbonoFile(null);
                                            setNuevoAbonoFileName('');
                                            setAbonoErrorMsg('');
                                            return;
                                          }
                                          const { error: cleanupError } = await supabase.storage.from('documentos').remove([fileName]);
                                          if (cleanupError) console.error('No se pudo limpiar el comprobante tras el error:', cleanupError);
                                        }
                                        setAbonoErrorMsg(mensajeError(err, 'No se pudo registrar el abono.'));
                                      } finally {
                                        setAbonoSaving(false);
                                      }
                                    }}
                                    disabled={abonoSaving}
                                    className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-on-accent text-xs font-semibold px-3.5 py-2 rounded-md transition flex items-center justify-center gap-1.5 shadow-xs"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>{abonoSaving ? 'Guardando...' : 'Agregar Abono'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Historial de Abonos Registrados */}
                              <div className="pt-4 border-t border-line space-y-3">
                                <span className="text-ink text-xs font-semibold uppercase tracking-normal block">Historial de Abonos Registrados:</span>
                                {(() => {
                                  const abonosList = (selectedOp.comprobantes_pago || []).filter(
                                    (item: any) => typeof item === 'object' && item !== null && 'monto' in item
                                  );

                                  if (abonosList.length === 0) {
                                    return (
                                      <p className="text-ink-muted italic text-xs">No hay abonos registrados en el historial.</p>
                                    );
                                  }

                                  return (
                                    <div className="space-y-2.5">
                                      {abonosList.map((ab: any, idx: number) => {
                                        const isEditingThis = editingAbonoId === ab.id;

                                        if (isEditingThis) {
                                          return (
                                            <div key={ab.id || idx} className="bg-surface p-3.5 rounded-md border border-accent space-y-2 text-xs">
                                              <span className="font-bold text-accent-ink text-xs">Editar Abono:</span>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <input
                                                  type="text"
                                                  value={editAbonoMonto ? Number(editAbonoMonto).toLocaleString('es-CL') : ''}
                                                  onChange={(e) => setEditAbonoMonto(e.target.value.replace(/\D/g, ''))}
                                                  className="bg-surface text-ink border border-line rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                                />
                                                <input
                                                  type="text"
                                                  value={editAbonoNota}
                                                  onChange={(e) => setEditAbonoNota(e.target.value)}
                                                  className="bg-surface text-ink border border-line rounded-lg px-2.5 py-1.5 text-xs"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      const rawNum = Number(editAbonoMonto);
                                                      if (!rawNum || rawNum <= 0) return;

                                                      setAbonoSaving(true);
                                                      try {
                                                        await guardarAbono('editar', { id: ab.id, monto: rawNum, nota: editAbonoNota });
                                                        setEditingAbonoId(null);
                                                      } catch (err: any) {
                                                        setAbonoErrorMsg(mensajeError(err, 'No se pudo editar el abono.'));
                                                      } finally {
                                                        setAbonoSaving(false);
                                                      }
                                                    }}
                                                    className="bg-success-soft hover:bg-success-soft text-white font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Guardar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingAbonoId(null)}
                                                    className="bg-surface-muted hover:bg-surface-muted text-ink font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={ab.id || idx} className="bg-surface p-3 rounded-md border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-xs">
                                            <div className="space-y-1.5">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-success text-sm">
                                                  ${Number(ab.monto || 0).toLocaleString('es-CL')} CLP
                                                </span>
                                                <span className="text-ink text-xs font-semibold">
                                                  — {ab.nota || 'Abono'}
                                                </span>

                                                {/* Estado del Abono */}
                                                {(!ab.estado || ab.estado === 'validado') && (
                                                  <span className="t-micro font-bold px-2 py-0.5 rounded-full bg-success-soft text-success border border-success/30 inline-flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3 text-success" />
                                                    <span>Validado en Caja {ab.banco_alias ? `(${ab.banco_alias})` : ''}</span>
                                                  </span>
                                                )}
                                                {ab.estado === 'pendiente' && (
                                                  <span className="t-micro font-bold px-2 py-0.5 rounded-full bg-warning-soft text-warning-ink border border-warning/30 inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3 text-warning-ink" />
                                                    <span>Pendiente de validación en Caja</span>
                                                  </span>
                                                )}
                                                {ab.estado === 'rechazado' && (
                                                  <span className="t-micro font-bold px-2 py-0.5 rounded-full bg-danger-soft text-danger border border-danger/30 inline-flex items-center gap-1" title={ab.motivo_rechazo}>
                                                    <XCircle className="w-3 h-3 text-danger" />
                                                    <span>Rechazado: {ab.motivo_rechazo || 'Comprobante no válido'}</span>
                                                  </span>
                                                )}
                                              </div>

                                              {ab.comprobante_url && (
                                                <button
                                                  type="button"
                                                  onClick={() => void abrirComprobante(ab.comprobante_url)}
                                                  className="text-accent-ink hover:underline text-xs font-mono flex items-center gap-1.5 mt-0.5"
                                                >
                                                  <FileCheck className="w-3.5 h-3.5 text-accent-ink" />
                                                  <span>Comprobante: {ab.comprobante_nombre || 'Ver archivo'}</span>
                                                </button>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                              <div className="text-right text-xs text-ink-muted mr-2">
                                                <span>{ab.fecha}</span>
                                                {ab.creado_por && <span className="block text-ink-subtle font-semibold">{ab.creado_por}</span>}
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingAbonoId(ab.id);
                                                  setEditAbonoMonto(String(ab.monto || ''));
                                                  setEditAbonoNota(ab.nota || '');
                                                }}
                                                className="p-1.5 bg-surface hover:bg-info-soft text-info rounded-lg transition border border-line"
                                                title="Editar Abono"
                                              >
                                                <Edit className="w-4 h-4" />
                                              </button>

                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  setAbonoSaving(true);
                                                  try {
                                                    await guardarAbono('eliminar', { id: ab.id });
                                                  } catch (err: any) {
                                                    setAbonoErrorMsg(mensajeError(err, 'No se pudo eliminar el abono.'));
                                                  } finally {
                                                    setAbonoSaving(false);
                                                  }
                                                }}
                                                className="p-1.5 bg-surface hover:bg-danger-soft text-danger rounded-lg transition border border-line"
                                                title="Eliminar Abono"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>



                {/* Accordion 4: Visita a Terreno */}
                <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                  <div className="w-full p-3 bg-surface-muted text-ink font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-line">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                      className="flex items-center gap-2.5 hover:text-accent-ink transition cursor-pointer text-left font-semibold text-xs text-ink"
                    >
                      <Calendar className="w-4 h-4 text-accent-ink" />
                      <span>Visita a Terreno</span>
                      {opVisitasList.length > 0 && (
                        <span className="text-xs bg-accent text-on-accent font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opVisitasList.length}
                        </span>
                      )}
                      {openSections.visita ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                    </button>

                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOp.requiere_visita_terreno ?? false}
                          onChange={async (e) => {
                            const checked = e.target.checked;
                            updateOportunidadField(selectedOp.id, 'requiere_visita_terreno', checked);
                            if (checked) {
                              setOpenSections((prev) => ({ ...prev, visita: true }));
                            }
                            await addOportunidadActividad(
                              selectedOp.id,
                              checked
                                ? 'Se habilitó la sección de Visita a Terreno.'
                                : 'Se deshabilitó la sección de Visita a Terreno.'
                            );
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-surface-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-line after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                        <span className="ml-2 text-xs font-bold text-ink capitalize tracking-normal">
                          {selectedOp.requiere_visita_terreno ? 'Habilitado' : 'No Requiere'}
                        </span>
                      </label>
                      {selectedOp.requiere_visita_terreno && (
                        <Link
                          href={`/visitas?opId=${selectedOp.id}`}
                          className="text-[11px] bg-accent hover:bg-accent-hover text-on-accent px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                        >
                          <span>Ver en Calendario</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {openSections.visita && selectedOp.requiere_visita_terreno && (
                    <div className="p-4 space-y-4 text-xs text-ink bg-surface">
                      {/* Botón para agregar una nueva visita */}
                      <div className="flex items-center justify-between border-b border-line pb-3">
                        <span className="font-bold text-ink text-xs">Visitas Programadas para este Proyecto:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddVisitaForm(!showAddVisitaForm);
                            if (!newVisitaFecha) {
                              setNewVisitaFecha(new Date().toISOString().split('T')[0]);
                            }
                          }}
                          className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Visita a Terreno</span>
                        </button>
                      </div>

                      {/* Formulario Inline para Registrar Nueva Visita */}
                      {showAddVisitaForm && (
                        <div className="bg-surface-muted p-4 rounded-lg border border-accent/30 space-y-3">
                          <h4 className="font-semibold text-accent-ink text-xs uppercase flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Nueva Visita</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Responsable *</label>
                              <select
                                value={newVisitaTecnico}
                                onChange={(e) => setNewVisitaTecnico(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                              >
                                <option value="">Selecciona responsable</option>
                                {responsablesVisitas.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre}{p.rut ? ` - ${p.rut}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Fecha de Visita *</label>
                              <input
                                type="date"
                                required
                                value={newVisitaFecha}
                                onChange={(e) => setNewVisitaFecha(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Hora de Visita</label>
                              <input
                                type="time"
                                value={newVisitaHora}
                                onChange={(e) => setNewVisitaHora(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Estado Inicial</label>
                              <select
                                value={newVisitaEstado}
                                onChange={(e) => setNewVisitaEstado(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-semibold uppercase focus:outline-none focus:border-accent"
                              >
                                <option value="programada">Programada</option>
                                <option value="realizada">Realizada</option>
                                <option value="cancelada">Cancelada</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: Medir acceso y toma de plantilla..."
                                value={newVisitaNotas}
                                onChange={(e) => setNewVisitaNotas(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 focus:outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                            <button
                              type="button"
                              onClick={() => setShowAddVisitaForm(false)}
                              className="px-3 py-1.5 bg-surface-muted hover:bg-surface-muted text-ink rounded-md font-bold transition"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!selectedOp || !newVisitaFecha || !newVisitaTecnico) return;
                                const responsable = getPersonalTerreno(newVisitaTecnico);
                                const responsableNombre = responsable?.nombre || '';
                                const payload = {
                                  oportunidad_id: selectedOp.id,
                                  tecnico_visita: responsableNombre,
                                  tecnico_id: newVisitaTecnico,
                                  fecha_visita_terreno: newVisitaFecha,
                                  hora_visita_terreno: newVisitaHora,
                                  estado_visita: newVisitaEstado,
                                  observaciones_visita: newVisitaNotas,
                                };

                                try {
                                  const { data, error } = await supabase
                                    .from('visitas_terreno')
                                    .insert([payload])
                                    .select('*, tecnico:usuarios!tecnico_id(*)')
                                    .single();

                                  if (!error && data) {
                                    setOpVisitasList((prev) => [...prev, data as VisitaTerreno]);
                                    updateOportunidadField(selectedOp.id, 'requiere_visita_terreno', true);
                                    updateOportunidadField(selectedOp.id, 'tecnico_visita', responsableNombre);
                                    updateOportunidadField(selectedOp.id, 'tecnico_id', newVisitaTecnico);
                                    updateOportunidadField(selectedOp.id, 'fecha_visita_terreno', newVisitaFecha);
                                    updateOportunidadField(selectedOp.id, 'hora_visita_terreno', newVisitaHora);
                                    updateOportunidadField(selectedOp.id, 'estado_visita', newVisitaEstado);
                                    updateOportunidadField(selectedOp.id, 'observaciones_visita', newVisitaNotas);

                                    await supabase
                                      .from('oportunidades')
                                      .update({
                                        requiere_visita_terreno: true,
                                        tecnico_visita: responsableNombre,
                                        tecnico_id: newVisitaTecnico,
                                        fecha_visita_terreno: newVisitaFecha,
                                        hora_visita_terreno: newVisitaHora,
                                        estado_visita: newVisitaEstado,
                                        observaciones_visita: newVisitaNotas,
                                      })
                                      .eq('id', selectedOp.id);

                                    setShowAddVisitaForm(false);
                                    setNewVisitaNotas('');
                                    await addOportunidadActividad(
                                      selectedOp.id,
                                      `Nueva Visita a Terreno programada para ${newVisitaFecha} a las ${newVisitaHora} hrs con ${responsableNombre}.`
                                    );
                                  }
                                } catch (err) {
                                  console.error('Error inserting visita:', err);
                                }
                              }}
                              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-md font-semibold transition shadow-xs"
                            >
                              Guardar Visita
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lista de Visitas Registradas */}
                      {opVisitasList.length === 0 ? (
                        <div className="py-4 text-center text-ink-muted italic text-xs bg-surface-muted rounded-lg border border-dashed border-line">
                          No hay visitas a terreno registradas en este momento. Haz clic en <strong>&quot;+ Agregar Visita a Terreno&quot;</strong> para programar una.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {opVisitasList.map((vis, vIdx) => {
                            const isEditingThis = editingVisitaId === vis.id;
                            const responsableNombre = getResponsableVisitaNombre(vis);

                            if (isEditingThis) {
                              return (
                                <div
                                  key={vis.id || vIdx}
                                  className="bg-surface p-4 rounded-lg border border-accent space-y-3 shadow-xs"
                                >
                                  <h4 className="font-semibold text-accent-ink text-xs uppercase flex items-center gap-1.5">
                                    <Edit className="w-4 h-4" />
                                    <span>Editar Visita a Terreno</span>
                                  </h4>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block font-bold text-ink-muted mb-1">Responsable</label>
                                      <select
                                        value={editVisitaTecnico}
                                        onChange={(e) => setEditVisitaTecnico(e.target.value)}
                                        className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                                      >
                                        <option value="">Selecciona responsable</option>
                                        {responsablesVisitas.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.nombre}{p.rut ? ` - ${p.rut}` : ''}
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block font-bold text-ink-muted mb-1">Fecha</label>
                                      <input
                                        type="date"
                                        value={editVisitaFecha}
                                        onChange={(e) => setEditVisitaFecha(e.target.value)}
                                        className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                                      />
                                    </div>

                                    <div>
                                      <label className="block font-bold text-ink-muted mb-1">Hora</label>
                                      <input
                                        type="time"
                                        value={editVisitaHora}
                                        onChange={(e) => setEditVisitaHora(e.target.value)}
                                        className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block font-bold text-ink-muted mb-1">Estado</label>
                                      <select
                                        value={editVisitaEstado}
                                        onChange={(e) => setEditVisitaEstado(e.target.value)}
                                        className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-semibold uppercase focus:outline-none focus:border-accent"
                                      >
                                        <option value="programada">Programada</option>
                                        <option value="realizada">Realizada</option>
                                        <option value="cancelada">Cancelada</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block font-bold text-ink-muted mb-1">Notas / Observaciones</label>
                                      <input
                                        type="text"
                                        value={editVisitaNotas}
                                        onChange={(e) => setEditVisitaNotas(e.target.value)}
                                        className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 focus:outline-none focus:border-accent"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                                    <button
                                      type="button"
                                      onClick={() => setEditingVisitaId(null)}
                                      className="px-3 py-1.5 bg-surface-muted hover:bg-surface-muted text-ink rounded-md font-bold transition text-xs"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const responsable = getPersonalTerreno(editVisitaTecnico);
                                        const editResponsableNombre = responsable?.nombre || vis.tecnico_visita || '';
                                        const updatedVis = {
                                          ...vis,
                                          tecnico_visita: editResponsableNombre,
                                          tecnico_id: editVisitaTecnico || null,
                                          tecnico: responsable,
                                          fecha_visita_terreno: editVisitaFecha,
                                          hora_visita_terreno: editVisitaHora,
                                          estado_visita: editVisitaEstado,
                                          observaciones_visita: editVisitaNotas,
                                        };

                                        setOpVisitasList((prev) =>
                                          prev.map((v) => (v.id === vis.id ? updatedVis : v))
                                        );
                                        setEditingVisitaId(null);

                                        try {
                                          if (!vis.id.startsWith('legacy-')) {
                                            await supabase
                                              .from('visitas_terreno')
                                              .update({
                                                tecnico_visita: editResponsableNombre,
                                                tecnico_id: editVisitaTecnico || null,
                                                fecha_visita_terreno: editVisitaFecha,
                                                hora_visita_terreno: editVisitaHora,
                                                estado_visita: editVisitaEstado,
                                                observaciones_visita: editVisitaNotas,
                                              })
                                              .eq('id', vis.id);
                                          } else {
                                            await supabase
                                              .from('oportunidades')
                                              .update({
                                                tecnico_visita: editResponsableNombre,
                                                tecnico_id: editVisitaTecnico || null,
                                                fecha_visita_terreno: editVisitaFecha,
                                                hora_visita_terreno: editVisitaHora,
                                                estado_visita: editVisitaEstado,
                                                observaciones_visita: editVisitaNotas,
                                              })
                                              .eq('id', selectedOp.id);
                                          }

                                          await addOportunidadActividad(
                                            selectedOp.id,
                                            `Visita a terreno actualizada: ${editVisitaFecha} (${editResponsableNombre}).`
                                          );
                                        } catch (err) {
                                          console.error('Error updating visita:', err);
                                        }
                                      }}
                                      className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-md font-semibold transition shadow-xs text-xs"
                                    >
                                      Guardar Cambios
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={vis.id || vIdx}
                                className="bg-surface p-3.5 rounded-lg border border-line flex flex-col gap-3 hover:border-line transition shadow-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-normal px-2 py-1 rounded-md bg-accent-soft text-accent-ink border border-accent/30">
                                      {responsableNombre}
                                    </span>

                                    <span className="text-[11px] font-bold px-2 py-1 rounded-md border bg-surface-muted text-ink border-line">
                                      Visitas a terreno
                                    </span>

                                    <span
                                      className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${
                                        vis.estado_visita === 'realizada'
                                          ? 'bg-success-soft text-success border-success/30'
                                          : vis.estado_visita === 'cancelada'
                                          ? 'bg-danger-soft text-danger border-danger/30'
                                          : 'bg-warning-soft text-warning-ink border-warning/30'
                                      }`}
                                    >
                                      {vis.estado_visita || 'programada'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingVisitaId(vis.id);
                                        setEditVisitaTecnico(
                                          vis.tecnico_id ||
                                          responsablesVisitas.find((p) => p.nombre === vis.tecnico_visita)?.id ||
                                          ''
                                        );
                                        setEditVisitaFecha(vis.fecha_visita_terreno || '');
                                        setEditVisitaHora(vis.hora_visita_terreno || '09:00');
                                        setEditVisitaEstado(vis.estado_visita || 'programada');
                                        setEditVisitaNotas(vis.observaciones_visita || '');
                                      }}
                                      className="p-1.5 bg-surface hover:bg-info-soft text-info rounded-lg transition border border-line"
                                      title="Editar Visita"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          const isLegacy = vis.id.startsWith('legacy-');
                                          if (isUUID(vis.id) && !isLegacy) {
                                            await supabase.from('visitas_terreno').delete().eq('id', vis.id);
                                          }

                                          const updatedList = opVisitasList.filter((v) => v.id !== vis.id);
                                          setOpVisitasList(updatedList);

                                          if (updatedList.length === 0 || isLegacy) {
                                            if (isUUID(selectedOp.id)) {
                                              await supabase.from('oportunidades').update({
                                                fecha_visita_terreno: null,
                                                hora_visita_terreno: null,
                                                tecnico_visita: null,
                                                tecnico_id: null,
                                                estado_visita: null,
                                                observaciones_visita: null,
                                                requiere_visita_terreno: false,
                                              }).eq('id', selectedOp.id);
                                            }

                                            setSelectedOp((prev) =>
                                              prev ? { ...prev, requiere_visita_terreno: false, fecha_visita_terreno: undefined } : null
                                            );
                                            setOportunidades((prevOps) =>
                                              prevOps.map((o) =>
                                                o.id === selectedOp.id ? { ...o, requiere_visita_terreno: false, fecha_visita_terreno: undefined } : o
                                              )
                                            );
                                          }

                                          await addOportunidadActividad(selectedOp.id, 'Una Visita a Terreno fue eliminada del sistema.');
                                        } catch (err) {
                                          console.error('Error deleting visita:', err);
                                        }
                                      }}
                                      className="p-1.5 bg-surface hover:bg-danger-soft text-danger rounded-lg transition border border-line"
                                      title="Eliminar Visita"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <strong className="text-ink text-sm block">Visita a terreno</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted font-bold">
                                    <span className="font-mono flex items-center gap-1 text-ink">
                                      <Calendar className="w-3.5 h-3.5 text-accent-ink" />
                                      {vis.fecha_visita_terreno}
                                    </span>

                                    <span className="font-mono flex items-center gap-1 text-ink-muted">
                                      <Clock className="w-3.5 h-3.5 text-ink-subtle" />
                                      {vis.hora_visita_terreno || '09:00'} hrs
                                    </span>
                                  </div>
                                  <div className="text-xs text-ink-muted font-semibold">
                                    {[selectedOp.codigo, selectedOp.cliente?.nombre].filter(Boolean).join(' · ')}
                                  </div>

                                  {vis.observaciones_visita && (
                                    <p className="text-ink-muted text-xs pt-1">
                                      {vis.observaciones_visita}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>

            {/* Producción y Logística */}
            <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
              <AreaCardHeader
                icon={Factory}
                title="Producción y Logística"
                open={areaExpanded.produccion}
                onToggle={() => setAreaExpanded((prev) => ({ ...prev, produccion: !prev.produccion }))}
              />

              {areaExpanded.produccion && (
                <div className="border-t border-line p-3 sm:p-4 space-y-3.5">
                  <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-surface-muted text-ink font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-line">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionEventos: !openSections.produccionEventos })}
                        className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-xs text-ink"
                      >
                        <Calendar className="w-4 h-4 text-accent-ink" />
                        <span>Eventos de Producción y Logística</span>
                        {produccionEventos.length > 0 && (
                          <span className="text-xs bg-accent text-on-accent font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {produccionEventos.length}
                          </span>
                        )}
                        {openSections.produccionEventos ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={produccionEventosEnabled}
                            onChange={(e) => setProduccionEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-surface-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-line after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                          <span className="ml-2 text-xs font-bold text-ink capitalize tracking-normal">
                            {produccionEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {produccionEventosEnabled && (
                          <Link
                            href={`/planificacion/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-accent hover:bg-accent-hover text-on-accent px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>

                    </div>

                    {openSections.produccionEventos && produccionEventosEnabled && (
                    <div className="p-4 space-y-4 text-xs text-ink bg-surface">
                      <div className="flex items-center justify-between border-b border-line pb-3">
                        <span className="font-bold text-ink text-xs">Eventos registrados para esta oportunidad:</span>
                        <button
                          type="button"
                          onClick={() => {
                            resetProdLogForm('produccion_logistica', 'produccion');
                            setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'produccion_logistica');
                          }}
                          className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Evento</span>
                        </button>
                      </div>

                      {showAddProdLogEventForm && newProdLogContexto === 'produccion_logistica' && (
                        <div className="bg-surface-muted p-4 rounded-lg border border-accent/30 space-y-3">
                          <h4 className="font-semibold text-[var(--color-accent-hover)] text-xs uppercase flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Evento</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Tipo de evento *</label>
                              <select
                                value={newProdLogTipo}
                                onChange={(e) => {
                                  const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                  setNewProdLogTipo(nextTipo);
                                }}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                              >
                                <option value="obra">Obra</option>
                                <option value="logistica">Logística</option>
                                <option value="produccion">Producción</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Fecha *</label>
                              <input
                                type="date"
                                required
                                value={newProdLogFecha}
                                onChange={(e) => setNewProdLogFecha(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Hora</label>
                              <input
                                type="time"
                                value={newProdLogHora}
                                onChange={(e) => setNewProdLogHora(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Título *</label>
                              <input
                                type="text"
                                value={newProdLogTitulo}
                                onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 font-bold focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Responsable</label>
                              <select
                                value={newProdLogResponsableId}
                                onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                              >
                                <option value="">-- Sin asignar --</option>
                                {responsablesProduccionLogistica.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre}{p.rut ? ` - ${p.rut}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Estado Inicial</label>
                              <select
                                value={newProdLogEstado}
                                onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-semibold uppercase focus:outline-none focus:border-accent"
                              >
                                {prodLogEstadoOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block font-bold text-ink-muted mb-1">Notas / Instrucciones</label>
                            <input
                              type="text"
                              placeholder="Ej: coordinar retiro, despacho, fabricación o instalación..."
                              value={newProdLogNotas}
                              onChange={(e) => setNewProdLogNotas(e.target.value)}
                              className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 focus:outline-none focus:border-accent"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                            <button
                              type="button"
                              onClick={() => setShowAddProdLogEventForm(false)}
                              className="px-3 py-1.5 bg-surface-muted hover:bg-surface-muted text-ink rounded-md font-bold transition"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveProdLogEvent('produccion_logistica')}
                              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-md font-semibold transition shadow-xs"
                            >
                              {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                            </button>
                          </div>
                        </div>
                      )}

                      {produccionEventos.length === 0 ? (
                        <div className="py-4 text-center text-ink-muted italic text-xs bg-surface-muted rounded-lg border border-dashed border-line">
                          No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {produccionEventos.map((event) => {
                            const { fecha, hora } = getEventDateParts(event);

                            return (
                              <div
                                key={event.id}
                                className="bg-surface p-3.5 rounded-lg border border-line flex flex-col gap-3 text-ink hover:border-line transition shadow-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold uppercase tracking-normal text-[11px] px-2 py-1 rounded-md text-accent-ink bg-accent-soft border border-accent/30">
                                      {getResponsableEventoNombre(event)}
                                    </span>
                                    <span className={`text-[11px] font-bold px-2 py-1 rounded-md border ${getProdLogTipoClasses(event.tipo_evento)}`}>
                                      {getProdLogTipoLabel(event.tipo_evento)}
                                    </span>
                                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${getProdLogEstadoClasses(event.estado)}`}>
                                      {getProdLogEstadoLabel(event.estado)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditProdLogEvent(event)}
                                      className="p-1.5 bg-surface hover:bg-accent-soft text-accent-ink border border-line rounded-lg transition"
                                      title="Editar evento"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteProdLogEvent(event)}
                                      className="p-1.5 bg-surface hover:bg-danger-soft text-danger border border-line rounded-lg transition"
                                      title="Eliminar evento"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <strong className="text-ink text-sm block">{event.titulo}</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted font-bold">
                                    <span className="font-mono flex items-center gap-1 text-ink">
                                      <Calendar className="w-3.5 h-3.5 text-accent-ink" />
                                      {fecha}
                                    </span>
                                    <span className="font-mono flex items-center gap-1 text-ink-muted">
                                      <Clock className="w-3.5 h-3.5 text-ink-subtle" />
                                      {hora}
                                    </span>
                                  </div>
                                  {event.observaciones && (
                                    <span className="block text-xs text-ink-muted">{event.observaciones}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    )}
                    {openSections.produccionEventos && !produccionEventosEnabled && (
                      <div className="p-4 text-xs text-ink-muted bg-surface">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 2.3: Órdenes de Compra (OC) en Producción (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('prod_') && (
                  <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-surface-muted text-ink font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-line">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionOc: !openSections.produccionOc })}
                        className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-xs text-ink"
                      >
                        <ShoppingCart className="w-4 h-4 text-accent-ink" />
                        <span>Órdenes de Compra (OC) — Insumos de Fabricación</span>
                        <span className="text-xs text-[var(--color-accent-hover)] font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.produccionOc ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.produccionOc && (
                    <div className="p-4 space-y-3 text-xs bg-surface text-ink">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-ink-muted">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-surface-muted rounded-lg text-ink-muted text-center italic border border-line">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-line">
                          <table className="w-full text-left text-xs bg-surface">
                            <thead className="bg-surface-muted text-ink-muted font-bold uppercase t-micro border-b border-line">
                              <tr>
	                                <th className="py-2.5 px-3">Folio OC</th>
	                                <th className="py-2.5 px-3 text-center">Version</th>
	                                <th className="py-2.5 px-3">Proveedor</th>
                                <th className="py-2.5 px-3 text-center">Fecha</th>
                                <th className="py-2.5 px-3 text-right">Costo asignado</th>
                                <th className="py-2.5 px-3 text-center">Estado</th>
                                <th className="py-2.5 px-3 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line-subtle">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-surface-muted">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-[var(--color-accent-hover)]">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-ink-muted">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-ink">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-ink-muted">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                                    ${(oc.asignaciones || []).reduce((sum, a) => sum + Number(a.costo_asignado), 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="t-micro font-bold uppercase px-2 py-0.5 bg-accent-soft text-[var(--color-accent-hover)] border border-accent/30 rounded">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-surface hover:bg-accent-soft text-[var(--color-accent-hover)] rounded-lg transition border border-line font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
                                    <Link href={`/ordenes-compra/${oc.id}/asignaciones`} className="block text-[11px] text-accent-ink font-bold mt-1">Ver asignaciones</Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* Reventa y Logística */}
            <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
              <AreaCardHeader
                icon={Truck}
                title="Reventa y Logística"
                open={areaExpanded.reventa}
                onToggle={() => setAreaExpanded((prev) => ({ ...prev, reventa: !prev.reventa }))}
              />

              {areaExpanded.reventa && (
                <div className="border-t border-line p-3 sm:p-4 space-y-3.5">
                  <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-surface-muted text-ink font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-line">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaEventos: !openSections.reventaEventos })}
                        className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-xs text-ink"
                      >
                        <Calendar className="w-4 h-4 text-accent-ink" />
                        <span>Eventos de Reventa y Logística</span>
                        {reventaEventos.length > 0 && (
                          <span className="text-xs bg-accent text-on-accent font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {reventaEventos.length}
                          </span>
                        )}
                        {openSections.reventaEventos ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reventaEventosEnabled}
                            onChange={(e) => setReventaEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-surface-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:border-line after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                          <span className="ml-2 text-xs font-bold text-ink capitalize tracking-normal">
                            {reventaEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {reventaEventosEnabled && (
                          <Link
                            href={`/reventa/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-accent hover:bg-accent-hover text-on-accent px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    {openSections.reventaEventos && reventaEventosEnabled && (
                      <div className="p-4 space-y-4 text-xs text-ink bg-surface">
                        <div className="flex items-center justify-between border-b border-line pb-3">
                          <span className="font-bold text-ink text-xs">Eventos registrados para esta oportunidad:</span>
                          <button
                            type="button"
                            onClick={() => {
                              resetProdLogForm('reventa_logistica', 'reventa');
                              setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'reventa_logistica');
                            }}
                            className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Agregar Evento</span>
                          </button>
                        </div>

                        {showAddProdLogEventForm && newProdLogContexto === 'reventa_logistica' && (
                          <div className="bg-surface-muted p-4 rounded-lg border border-accent/30 space-y-3">
                            <h4 className="font-semibold text-[var(--color-accent-hover)] text-xs uppercase flex items-center gap-1.5">
                              <Plus className="w-4 h-4" />
                              <span>Registrar Evento</span>
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Tipo de evento *</label>
                                <select
                                  value={newProdLogTipo}
                                  onChange={(e) => {
                                    const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                    setNewProdLogTipo(nextTipo);
                                  }}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                                >
                                  <option value="logistica">Logística</option>
                                  <option value="reventa">Reventa</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Fecha *</label>
                                <input
                                  type="date"
                                  required
                                  value={newProdLogFecha}
                                  onChange={(e) => setNewProdLogFecha(e.target.value)}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Hora</label>
                                <input
                                  type="time"
                                  value={newProdLogHora}
                                  onChange={(e) => setNewProdLogHora(e.target.value)}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-accent"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Título *</label>
                                <input
                                  type="text"
                                  value={newProdLogTitulo}
                                  onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 font-bold focus:outline-none focus:border-accent"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Responsable</label>
                                <select
                                  value={newProdLogResponsableId}
                                  onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-accent"
                                >
                                  <option value="">-- Sin asignar --</option>
                                  {(responsablesReventaLogistica.length > 0 ? responsablesReventaLogistica : personalTerrenoList).map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nombre}{p.rut ? ` - ${p.rut}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block font-bold text-ink-muted mb-1">Estado Inicial</label>
                                <select
                                  value={newProdLogEstado}
                                  onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                  className="w-full bg-surface text-ink border border-line rounded-md px-2.5 py-1.5 font-semibold uppercase focus:outline-none focus:border-accent"
                                >
                                  {prodLogEstadoOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block font-bold text-ink-muted mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: coordinar proveedor, retiro, despacho o entrega..."
                                value={newProdLogNotas}
                                onChange={(e) => setNewProdLogNotas(e.target.value)}
                                className="w-full bg-surface text-ink border border-line rounded-md px-3 py-1.5 focus:outline-none focus:border-accent"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                              <button
                                type="button"
                                onClick={() => setShowAddProdLogEventForm(false)}
                                className="px-3 py-1.5 bg-surface-muted hover:bg-surface-muted text-ink rounded-md font-bold transition"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => saveProdLogEvent('reventa_logistica')}
                                className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-md font-semibold transition shadow-xs"
                              >
                                {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                              </button>
                            </div>
                          </div>
                        )}

                        {reventaEventos.length === 0 ? (
                          <div className="py-4 text-center text-ink-muted italic text-xs bg-surface-muted rounded-lg border border-dashed border-line">
                            No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {reventaEventos.map((event) => {
                              const { fecha, hora } = getEventDateParts(event);

                              return (
                                <div
                                  key={event.id}
                                  className="bg-surface p-3.5 rounded-lg border border-line flex flex-col gap-3 text-ink hover:border-line transition shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold uppercase tracking-normal text-[11px] px-2 py-1 rounded-md text-accent-ink bg-accent-soft border border-accent/30">
                                        {getResponsableEventoNombre(event)}
                                      </span>
                                      <span className={`text-[11px] font-bold px-2 py-1 rounded-md border ${getProdLogTipoClasses(event.tipo_evento)}`}>
                                        {getProdLogTipoLabel(event.tipo_evento)}
                                      </span>
                                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${getProdLogEstadoClasses(event.estado)}`}>
                                        {getProdLogEstadoLabel(event.estado)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => startEditProdLogEvent(event)}
                                        className="p-1.5 bg-surface hover:bg-accent-soft text-accent-ink border border-line rounded-lg transition"
                                        title="Editar evento"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteProdLogEvent(event)}
                                        className="p-1.5 bg-surface hover:bg-danger-soft text-danger border border-line rounded-lg transition"
                                        title="Eliminar evento"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <strong className="text-ink text-sm block">{event.titulo}</strong>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted font-bold">
                                      <span className="font-mono flex items-center gap-1 text-ink">
                                        <Calendar className="w-3.5 h-3.5 text-accent-ink" />
                                        {fecha}
                                      </span>
                                      <span className="font-mono flex items-center gap-1 text-ink-muted">
                                        <Clock className="w-3.5 h-3.5 text-ink-subtle" />
                                        {hora}
                                      </span>
                                    </div>
                                    {event.observaciones && (
                                      <span className="block text-xs text-ink-muted">{event.observaciones}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {openSections.reventaEventos && !reventaEventosEnabled && (
                      <div className="p-4 text-xs text-ink-muted bg-surface">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 3.2: Órdenes de Compra (OC) en Reventa (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('rev_') && (
                  <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-surface-muted text-ink font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-line">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaOc: !openSections.reventaOc })}
                        className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-xs text-ink"
                      >
                        <ShoppingCart className="w-4 h-4 text-accent-ink" />
                        <span>Órdenes de Compra a Proveedores / Distribución</span>
                        <span className="text-xs text-[var(--color-accent-hover)] font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.reventaOc ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-accent hover:bg-accent-hover text-on-accent font-semibold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.reventaOc && (
                    <div className="p-4 space-y-3 text-xs bg-surface text-ink">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-ink-muted">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-surface-muted rounded-lg text-ink-muted text-center italic border border-line">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-line">
                          <table className="w-full text-left text-xs bg-surface">
                            <thead className="bg-surface-muted text-ink-muted font-bold uppercase t-micro border-b border-line">
                              <tr>
	                                <th className="py-2.5 px-3">Folio OC</th>
	                                <th className="py-2.5 px-3 text-center">Version</th>
	                                <th className="py-2.5 px-3">Proveedor</th>
                                <th className="py-2.5 px-3 text-center">Fecha</th>
                                <th className="py-2.5 px-3 text-right">Costo asignado</th>
                                <th className="py-2.5 px-3 text-center">Estado</th>
                                <th className="py-2.5 px-3 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line-subtle">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-surface-muted">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-[var(--color-accent-hover)]">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-ink-muted">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-ink">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-ink-muted">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-ink">
                                    ${(oc.asignaciones || []).reduce((sum, a) => sum + Number(a.costo_asignado), 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="t-micro font-bold uppercase px-2 py-0.5 bg-accent-soft text-[var(--color-accent-hover)] border border-accent/30 rounded">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-surface hover:bg-accent-soft text-[var(--color-accent-hover)] rounded-lg transition border border-line font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
                                    <Link href={`/ordenes-compra/${oc.id}/asignaciones`} className="block text-[11px] text-accent-ink font-bold mt-1">Ver asignaciones</Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>

                {/* Accordion: Archivos Adjuntos (Ubicado debajo de Reventa y Logística) */}
                <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                  <div className="w-full p-3 bg-surface hover:bg-surface-muted text-ink font-semibold text-sm flex flex-wrap items-center justify-between gap-3 border-b border-line transition">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, antecedentes: !openSections.antecedentes })}
                      className="flex items-center gap-2.5 hover:text-[var(--color-accent-hover)] transition cursor-pointer text-left font-semibold text-sm text-ink"
                    >
                      <Paperclip className="w-4 h-4 text-accent-ink" />
                      <span>Archivos adjuntos</span>
                      {opAntecedentesList.length > 0 && (
                        <span className="text-xs bg-accent text-on-accent font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opAntecedentesList.length}
                        </span>
                      )}
                      {openSections.antecedentes ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
                    </button>

                    <label className="text-xs font-semibold bg-accent-soft hover:bg-accent text-accent-ink hover:text-white border border-accent/30 px-3 py-1.5 rounded-md transition flex items-center gap-1.5 cursor-pointer">
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>{antecedenteUploading ? 'Subiendo...' : 'Adjuntar archivo'}</span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={antecedenteUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedOp) return;
                          try {
                            setAntecedenteUploading(true);
                            const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                            const storagePath = `antecedentes/${selectedOp.id}/${Date.now()}_${cleanFileName}`;
                            const { error: uploadError } = await supabase.storage
                              .from('documentos')
                              .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
                            if (uploadError) throw uploadError;

                            const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(storagePath);
                            const publicUrl = urlData?.publicUrl || '#';
                            const userName = currentUser?.nombre || 'Usuario';
                            const userId = currentUser?.id && isUUID(currentUser.id) ? currentUser.id : null;

                            const { data: inserted, error: insertError } = await supabase
                              .from('oportunidad_antecedentes')
                              .insert({
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
                              })
                              .select()
                              .single();

                            if (!insertError && inserted) {
                              const newDoc = mapAntecedenteRecord(inserted);
                              const existingDocs = antecedentesCacheRef.current[selectedOp.id] || opAntecedentesList;
                              const updatedDocs = [newDoc, ...existingDocs];
                              antecedentesCacheRef.current[selectedOp.id] = updatedDocs;
                              setOpAntecedentesList(updatedDocs);
                              updateOportunidadField(selectedOp.id, 'antecedentes', updatedDocs);

                              await addOportunidadActividad(
                                selectedOp.id,
                                `Archivo adjuntado: "${file.name}" por ${userName}.`,
                                'actualizacion'
                              );
                            }
                          } catch (err: any) {
                            console.error('Error uploading file:', err);
                            toast({ message: `Error al subir archivo: ${mensajeError(err, 'Error desconocido')}`, tone: 'danger' });
                          } finally {
                            setAntecedenteUploading(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>

                  {openSections.antecedentes && (
                    <div className="p-4 space-y-3 text-xs bg-surface text-ink">
                      {opAntecedentesList.length === 0 ? (
                        <div className="p-6 text-center text-ink-muted bg-surface-muted rounded-lg border border-dashed border-line space-y-2">
                          <Paperclip className="w-8 h-8 text-ink-subtle mx-auto opacity-50" />
                          <p className="font-semibold text-ink">No hay archivos adjuntos en esta oportunidad.</p>
                          <p className="text-[11px] text-ink-muted">
                            Puedes adjuntar archivos desde el botón superior o enviándolos directamente en el chat de actividad.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-line-subtle bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                          {opAntecedentesList.map((doc) => {
                            const isImg = doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.nombre);
                            const isPdf = doc.mime_type?.includes('pdf') || /\.pdf$/i.test(doc.nombre);

                            return (
                              <div
                                key={doc.id}
                                className="p-3 hover:bg-surface-muted transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-surface-muted border border-line flex items-center justify-center shrink-0">
                                    {isPdf ? (
                                      <FileText className="w-4 h-4 text-danger" />
                                    ) : isImg ? (
                                      <Paperclip className="w-4 h-4 text-info" />
                                    ) : (
                                      <FileCheck className="w-4 h-4 text-accent-ink" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-ink text-xs truncate max-w-xs sm:max-w-md block" title={doc.nombre}>
                                        {doc.nombre}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-ink-muted flex items-center gap-2 mt-0.5 font-mono">
                                      {doc.size_bytes ? (
                                        <span>{Math.round(doc.size_bytes / 1024)} KB</span>
                                      ) : null}
                                      <span>•</span>
                                      <span>Subido por: {doc.subido_por || 'Usuario'}</span>
                                      {doc.fecha_iso && (
                                        <>
                                          <span>•</span>
                                          <span>{new Date(doc.fecha_iso).toLocaleDateString('es-CL')}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 bg-surface hover:bg-accent-soft text-ink hover:text-accent-ink rounded-md font-bold border border-line transition text-xs flex items-center gap-1.5"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Ver / Descargar</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAntecedente(doc.id)}
                                    className="p-1.5 bg-surface hover:bg-danger-soft text-ink-subtle hover:text-danger rounded-md border border-line transition"
                                    title="Eliminar archivo adjunto"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cierre y traspaso a operación (checklist + ruta operativa) */}
                {(() => {
                  const cierreItems: { label: string; ready: boolean; target?: string }[] = [
                    { label: 'Cotización vigente', ready: getOportunidadTotalValue(selectedOp) > 0 },
                    { label: 'Dirección de obra', ready: Boolean(selectedOp.direccion_obra || (selectedOp.direccion && selectedOp.comuna)), target: 'cierre-direccion_obra' },
                    { label: 'Fecha prometida', ready: Boolean(selectedOp.fecha_prometida || selectedOp.fecha_limite), target: 'cierre-fecha_prometida' },
                    { label: 'Forma de entrega', ready: Boolean(selectedOp.forma_entrega), target: 'cierre-forma_entrega' },
                    { label: 'Abastecimiento', ready: Boolean(selectedOp.abastecimiento), target: 'cierre-abastecimiento' },
                    { label: 'Condición de pago', ready: Boolean(selectedOp.condicion_pago), target: 'cierre-condicion_pago' },
                  ];
                  const completos = cierreItems.filter((item) => item.ready).length;
                  const fieldLabel = 'text-[11px] font-medium text-ink-muted';
                  const fieldClass = 'mt-0.5 block w-full h-8 bg-surface hover:bg-surface-muted border border-line hover:border-line rounded-md px-3 text-xs font-bold text-ink focus:outline-none focus:border-accent transition shadow-xs';

                  return (
                    <div key={`cierre-${selectedOp.id}`} className="bg-surface rounded-lg border border-line overflow-hidden shadow-xs">
                      <AreaCardHeader
                        icon={ClipboardCheck}
                        title="Cierre y traspaso a operación"
                        open={areaExpanded.cierre}
                        onToggle={() => setAreaExpanded((prev) => ({ ...prev, cierre: !prev.cierre }))}
                        aside={
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            completos === cierreItems.length
                              ? 'bg-success-soft text-success border-success/30'
                              : 'bg-accent-soft text-[var(--color-accent-hover)] border-accent/30'
                          }`}>
                            {completos}/{cierreItems.length} completos
                          </span>
                        }
                      />

                      {areaExpanded.cierre && (
                        <div className="border-t border-line p-3 sm:p-4 space-y-4 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {cierreItems.map((item) => (
                              <button
                                key={item.label}
                                type="button"
                                disabled={item.ready || !item.target}
                                onClick={() => {
                                  const el = item.target ? document.getElementById(item.target) : null;
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  el?.focus();
                                }}
                                className={`text-left text-xs font-semibold flex items-center gap-1.5 rounded-md px-2 py-1 transition ${
                                  item.ready ? 'text-success' : 'text-warning-ink hover:bg-warning-soft enabled:cursor-pointer disabled:cursor-default'
                                }`}
                              >
                                {item.ready ? <CheckCircle className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                                {item.label}
                              </button>
                            ))}
                          </div>

                          <div className="border-t border-line pt-3">
                            <p className="text-[11px] text-ink-muted mb-2">Estos datos alimentan la página de Operación y la guía de despacho.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
                              <label className={fieldLabel}>
                                Abastecimiento
                                <select
                                  id="cierre-abastecimiento"
                                  value={selectedOp.abastecimiento || ''}
                                  onChange={async (e) => {
                                    await updateOportunidadField(selectedOp.id, 'abastecimiento', e.target.value || null);
                                    await addOportunidadActividad(selectedOp.id, `Abastecimiento: ${e.target.selectedOptions[0].text}.`);
                                  }}
                                  className={fieldClass}
                                >
                                  <option value="">Definir abastecimiento</option>
                                  <option value="fabricar">Fabricar</option>
                                  <option value="compra_proveedor">Comprar a proveedor</option>
                                  <option value="stock">Stock disponible</option>
                                </select>
                              </label>
                              <label className={fieldLabel}>
                                Forma de entrega
                                <select
                                  id="cierre-forma_entrega"
                                  value={selectedOp.forma_entrega || ''}
                                  onChange={async (e) => {
                                    await updateOportunidadField(selectedOp.id, 'forma_entrega', e.target.value || null);
                                    await addOportunidadActividad(selectedOp.id, `Entrega: ${e.target.selectedOptions[0].text}.`);
                                  }}
                                  className={fieldClass}
                                >
                                  <option value="">Definir entrega</option>
                                  <option value="retiro_cliente">Retiro por cliente</option>
                                  <option value="retiro_proveedor">Retiro en proveedor</option>
                                  <option value="despacho_propio">Despacho propio</option>
                                  <option value="despacho_subcontratado">Despacho subcontratado</option>
                                </select>
                              </label>
                              <label className={fieldLabel}>
                                Condición de pago
                                <select
                                  id="cierre-condicion_pago"
                                  value={selectedOp.condicion_pago || ''}
                                  onChange={async (e) => {
                                    await updateOportunidadField(selectedOp.id, 'condicion_pago', e.target.value || null);
                                    await addOportunidadActividad(selectedOp.id, `Condición de pago: ${e.target.selectedOptions[0].text}.`);
                                  }}
                                  className={fieldClass}
                                >
                                  <option value="">Definir condición</option>
                                  <option value="total">Pago total</option>
                                  <option value="abono50">Abono 50%</option>
                                  <option value="oc">Orden de compra</option>
                                  <option value="especial">Especial</option>
                                </select>
                              </label>
                              <label className={fieldLabel}>
                                Responsable operativo
                                <select
                                  value={selectedOp.responsable_operativo_id || ''}
                                  onChange={(e) => updateOportunidadField(selectedOp.id, 'responsable_operativo_id', e.target.value || null)}
                                  className={fieldClass}
                                >
                                  <option value="">Sin responsable operativo</option>
                                  {usuariosApp.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
                                </select>
                              </label>
                              {([
                                ['fecha_prometida', 'Fecha prometida'],
                                ['fecha_tentativa_produccion', 'Producción tentativa'],
                                ['fecha_tentativa_entrega', 'Entrega tentativa'],
                              ] as [keyof OportunidadVenta, string][]).map(([field, label]) => (
                                <label key={field} className={fieldLabel}>
                                  {label}
                                  <input
                                    id={`cierre-${field}`}
                                    type="date"
                                    value={String(selectedOp[field] || '').slice(0, 10)}
                                    onChange={(e) => updateOportunidadField(selectedOp.id, field, e.target.value || null)}
                                    className={`${fieldClass} font-mono [color-scheme:light]`}
                                  />
                                </label>
                              ))}
                              <label className={fieldLabel}>
                                Vehículo o transporte
                                <input
                                  placeholder="Vehículo o transporte"
                                  defaultValue={selectedOp.transporte || ''}
                                  onBlur={(e) => updateOportunidadField(selectedOp.id, 'transporte', e.target.value.trim() || null)}
                                  className={fieldClass}
                                />
                              </label>
                              <label className={`${fieldLabel} sm:col-span-2`}>
                                Dirección de obra
                                <input
                                  id="cierre-direccion_obra"
                                  placeholder={selectedOp.direccion || 'Dirección de obra'}
                                  defaultValue={selectedOp.direccion_obra || ''}
                                  onBlur={(e) => updateOportunidadField(selectedOp.id, 'direccion_obra', e.target.value.trim() || null)}
                                  className={fieldClass}
                                />
                              </label>
                            </div>
                          </div>

                          <p className="text-[11px] text-ink-muted">
                            Abonos registrados: ${getOportunidadAbonadoValue(selectedOp).toLocaleString('es-CL')}. Los pendientes no impiden avanzar.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Separador Vertical Resizable (Barra para arrastrar y cambiar ancho) */}
            <div
              onMouseDown={handleMouseDownModalResizer}
              className="hidden lg:flex w-4 hover:w-4 bg-transparent hover:bg-warning-soft/20 active:bg-warning-soft/30 cursor-col-resize select-none items-center justify-center group z-20 relative mx-1 transition-all rounded-full shrink-0"
              title="Arrastrar para ajustar el ancho entre Información y Actividad (Tu configuración se guardará automáticamente)"
            >
              <div className="w-1.5 h-14 rounded-full bg-surface-muted group-hover:bg-accent group-active:bg-accent transition-colors shadow-xs" />
            </div>

            {/* Columna Derecha: Feed de Actividades (Ancho Resizable) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - modalLeftColRatio}%` : '100%' }}
              className="flex-1 bg-surface-muted rounded-lg border border-line p-4 sm:p-5 flex flex-col justify-between h-[45vh] lg:h-full overflow-hidden shadow-xs shrink-0"
            >
              <OpportunityActivity key={selectedOp.id} onClose={handleCloseOportunidad}>
              <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
                {/* Header de Actividad con Título e Íconos ClickUp */}
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-base sm:text-lg text-ink uppercase tracking-normal flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-accent-ink" />
                      <span>Actividad</span>
                    </h3>
                    <span className="text-xs bg-surface text-ink font-bold px-2.5 py-0.5 rounded-full border border-line font-mono">
                      {(selectedOp.chat_interno || []).length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Cerrar Modal */}
                    <button
                      onClick={handleCloseOportunidad}
                      className="p-1 text-ink-subtle hover:text-ink rounded-lg hover:bg-surface-muted transition font-bold text-lg leading-none ml-1"
                      title="Cerrar Modal"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Barra de Filtros de Actividad (Todos / Comentarios / Acciones / Reclamos) */}
                <div className="flex items-center gap-1.5 p-1 bg-surface rounded-md border border-line text-xs">
                  <button
                    type="button"
                    onClick={() => setActivityFilter('all')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'all'
                        ? 'bg-accent text-on-accent shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <span>Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('comentarios')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'comentarios'
                        ? 'bg-accent text-on-accent shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <span>Comentarios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('sistema')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'sistema'
                        ? 'bg-accent text-on-accent shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                    }`}
                  >
                    <span>Acciones</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('reclamos')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'reclamos'
                        ? 'bg-danger-soft text-white shadow-xs'
                        : 'text-danger hover:text-danger hover:bg-danger-soft'
                    }`}
                  >
                    <span>Reclamos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('seguimiento')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-semibold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'seguimiento'
                        ? 'bg-warning-soft text-white shadow-xs'
                        : 'text-warning-ink hover:text-warning-ink hover:bg-warning-soft'
                    }`}
                  >
                    <span>Seguimiento</span>
                  </button>
                </div>

                {/* Input de Búsqueda Flotante de Actividad */}
                {showActivitySearch && (
                  <div className="">
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
                  className="flex-1 overflow-y-auto space-y-3 pr-1 text-sm scrollbar-thin relative"
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

                    if (activityFilter === 'comentarios') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo === 'comentario' || (!m.tipo && !m.contenido?.startsWith('['))
                      );
                    } else if (activityFilter === 'sistema') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo !== 'comentario' && m.tipo !== 'reclamo' && m.tipo !== 'seguimiento' && (m.tipo || m.contenido?.startsWith('['))
                      );
                    } else if (activityFilter === 'reclamos') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo === 'reclamo'
                      );
                    } else if (activityFilter === 'seguimiento') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo === 'seguimiento'
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

                              <span className="text-ink-subtle text-xs font-mono">
                                {formattedDate} {formattedTime}
                              </span>
                            </div>

                            {isSeguimientoMsg ? (() => {
                              const campos = Object.fromEntries(parseSeguimientoContenido(msg.contenido || ''));
                              return (
                                <div className="rounded-lg bg-surface border border-warning/30 p-3 space-y-2.5">
                                  <div>
                                    <span className="t-micro font-bold uppercase tracking-wide text-warning-ink">Próxima acción</span>
                                    <p className="text-sm font-bold text-ink leading-snug break-words">
                                      {campos['Próxima acción'] || msg.contenido}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 rounded-md bg-warning-soft/60 border border-warning/30 px-2.5 py-1.5 min-w-0">
                                      <Calendar className="w-3.5 h-3.5 text-warning-ink shrink-0" />
                                      <div className="min-w-0">
                                        <span className="block t-micro font-medium text-ink-muted leading-none mb-0.5">Fecha del recordatorio</span>
                                        <span className="block text-xs font-semibold text-ink truncate">{campos['Fecha'] || 'Sin fecha'}</span>
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
                              <p className="text-ink text-sm whitespace-pre-wrap leading-relaxed">
                                {renderMessageContentWithMentions(msg.contenido)}
                              </p>
                            )}

                            <div className="flex items-center justify-end pt-2 border-t border-line text-xs">
                              <button
                                type="button"
                                onClick={() => setChatInput(`@${msg.usuario_nombre} `)}
                                className="font-bold text-ink-muted hover:text-accent-ink transition flex items-center gap-1"
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
                          className="flex items-start gap-2.5 py-2 px-3 rounded-md hover:bg-surface-muted transition text-xs sm:text-sm"
                        >
                          <span className="text-accent-ink font-bold text-base select-none shrink-0">•</span>
                          <div className="flex-1 flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-ink-muted">
                              <strong className="text-ink font-bold">{msg.usuario_nombre}</strong>{' '}
                              <span className="text-ink-muted ml-1">{msg.contenido}</span>
                            </span>
                            <span className="text-ink-subtle text-xs font-mono shrink-0 ml-auto">
                              {formattedDate} {formattedTime}
                            </span>
                          </div>
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
                      className="bg-accent hover:bg-accent-hover text-on-accent px-3 py-1.5 rounded-full shadow-md transition flex items-center gap-1.5 text-xs font-bold border border-white/20 active:scale-95"
                      title="Ir a la actividad más reciente"
                    >
                      <span>Ir a la más reciente</span>
                      <ChevronDown className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Input de Comentarios en el Fondo del Panel Lateral (Estilo ClickUp con Barra de Botones) */}
              <div className="pt-3 border-t border-line relative text-sm" ref={mentionRef}>
                {mentionMenuOpen && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-3 left-0 right-0 bg-surface border border-line rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="p-2.5 bg-surface-muted text-ink-muted font-bold text-xs uppercase tracking-normal border-b border-line flex justify-between items-center">
                      <span>Mencionar integrante:</span>
                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(false)}
                        className="text-ink-subtle hover:text-ink font-bold text-xs"
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
                          <span className="font-bold">{usr.nombre}</span>
                          <span className="t-micro opacity-80 uppercase font-mono">{ROL_NOMBRE[usr.rol] ?? usr.rol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isSeguimientoMode && (
                  <div className="bg-warning-soft/70 border border-warning/30 rounded-lg p-3 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-bold text-warning-ink">
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
                      <label className="sm:col-span-2 text-[11px] font-medium text-ink-muted">
                        Próxima acción *
                        <input
                          autoFocus
                          value={seguimientoDraft.accion}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, accion: e.target.value }))}
                          placeholder="Ej: Llamar para confirmar cotización"
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-ink-muted">
                        Fecha y hora
                        <input
                          type="datetime-local"
                          value={seguimientoDraft.fecha}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, fecha: e.target.value }))}
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30 [color-scheme:light]"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-ink-muted">
                        Responsable
                        <select
                          value={seguimientoDraft.responsable}
                          onChange={(e) => setSeguimientoDraft((d) => ({ ...d, responsable: e.target.value }))}
                          className="mt-0.5 block w-full bg-surface border border-line rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus:border-warning/30"
                        >
                          <option value="">Sin responsable</option>
                          {usuariosApp.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
                        </select>
                      </label>
                      <label className="sm:col-span-2 text-[11px] font-medium text-ink-muted">
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
                        className="px-3 py-1.5 text-xs font-bold text-white bg-warning-soft hover:bg-warning-soft rounded-md transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {seguimientoSaving ? 'Guardando...' : 'Guardar recordatorio'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-surface border border-line focus-within:border-accent rounded-lg p-3 shadow-xs space-y-2 transition">
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
                    className="w-full bg-transparent text-ink font-medium text-sm focus:outline-none placeholder-gray-400 min-h-[50px] resize-none"
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
                          <span className="t-micro text-ink-subtle font-mono">({Math.round(f.size / 1024)} KB)</span>
                          <button
                            type="button"
                            onClick={() => setStagedChatFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-ink-subtle hover:text-danger ml-1 font-bold text-xs"
                            title="Quitar archivo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Barra Inferior de Herramientas del Comentario */}
                  <div className="flex items-center justify-between border-t border-line pt-2">
                    <div className="flex items-center gap-2 text-ink-subtle">
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
                        className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs font-bold ${
                          isReclamoMode
                            ? 'bg-danger-soft text-white shadow-xs'
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
                        className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs font-bold ${
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
              </OpportunityActivity>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
                <select
                  required
                  value={nuevoClienteId}
                  onChange={(e) => setNuevoClienteId(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clientes.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.nombre} — RUT: {cli.rut}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Tipo de Venta *</label>
                <select
                  value={nuevoTipoVenta}
                  onChange={(e) => setNuevoTipoVenta(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent"
                >
                  <option value="Instalación">Instalación (Montaje y Trabajo en Obra)</option>
                  <option value="Suministro">Suministro (Producción Directa)</option>
                  <option value="Reventa de Material">Reventa de Material (Distribución)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink mb-1">Origen *</label>
                  <select
                    value={nuevoOrigen}
                    onChange={(e) => setNuevoOrigen(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="">-- Seleccionar Origen --</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Webmail">Webmail</option>
                    <option value="Llamado">Llamado</option>
                    <option value="Visita presencial">Visita presencial</option>
                    <option value="Referido">Referido</option>
                    <option value="Cliente recurrente">Cliente recurrente</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-ink mb-1">Sólo material o instalación</label>
                  <select
                    value={nuevaModalidadRequerimiento}
                    onChange={(e) => setNuevaModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-bold focus:outline-none focus:border-accent"
                  >
                    <option value="solo_material">Sólo material</option>
                    <option value="instalacion">Instalación</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink mb-1">Fecha Límite de Término del Trabajo</label>
                <input
                  type="date"
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
      {/* Modal Confirmación Eliminación de Oportunidad */}
      {opToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
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
                className="px-5 py-2 bg-danger-soft hover:bg-danger-soft disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md transition shadow-sm flex items-center gap-1.5"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
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
                className="px-5 py-2 bg-danger-soft hover:bg-danger-soft text-white font-semibold rounded-md transition shadow-sm flex items-center gap-1.5"
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
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 "
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

              <div className="bg-surface-muted p-3.5 rounded-lg border border-line space-y-2 font-mono text-xs">
                <div className="flex justify-between text-ink-muted">
                  <span>Monto Total Venta:</span>
                  <span className="font-bold text-ink">${abonoWarningModal.montoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Abonado actualmente:</span>
                  <span className="font-bold text-warning-ink">${abonoWarningModal.montoAbonado.toLocaleString('es-CL')} ({abonoWarningModal.porcentajeActual}%)</span>
                </div>
                <div className="flex justify-between text-accent-ink font-bold border-t border-line pt-2 text-xs">
                  <span>Requerido mínimo (50%):</span>
                  <span>${Math.round(abonoWarningModal.montoTotal * 0.5).toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAbonoWarningModal(null)}
                className="px-4 py-2 bg-surface-muted hover:bg-surface-muted text-ink font-bold rounded-md transition"
              >
                Entendido
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetOp = abonoWarningModal.op;
                  setAbonoWarningModal(null);
                  handleOpenOportunidad(targetOp);
                  setOpenSections({
                    contacto: false,
                    productos: false,
                    finanzas: true,
                    antecedentes: false,
                    visita: false,
                    produccionEventos: false,
                    produccionBitacora: false,
                    produccionOc: false,
                    reventaEventos: false,
                    reventaOc: false,
                  });
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
