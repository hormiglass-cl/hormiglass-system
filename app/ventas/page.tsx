'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
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
  ProduccionDiaria,
  CotizacionItem,
  AntecedenteDocumento,
  TipoAntecedenteDocumento,
  ContextoEventoProduccionLogistica,
  EstadoEventoProduccionLogistica,
  TipoEventoProduccionLogistica,
} from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { OrdenCompraModal } from '../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../components/OrdenCompraPdfPreviewModal';
import { logSistema } from '../../lib/logger';
import { playNotificationSound } from '../../lib/audio';
import {
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
  AlertTriangle,
  X,
  Bell,
  ThumbsUp,
  Reply,
  Mic,
  MoreHorizontal,
  ListFilter,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
} from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { CotizacionModal } from '../../components/CotizacionModal';

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export default function PipelineVentasPage() {
  const { currentUser, usersList } = useAuth();
  const searchParams = useSearchParams();
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [allCotizaciones, setAllCotizaciones] = useState<Cotizacion[]>([]);
  const [usuariosApp, setUsuariosApp] = useState<Usuario[]>([]);
  const [personalTerrenoList, setPersonalTerrenoList] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');
  const [activeBoardSection, setActiveBoardSection] = useState<string>('ventas');

  // Advanced Filters for List & Board View
  const [filterSearch, setFilterSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterTipoVenta, setFilterTipoVenta] = useState<string>('todos');
  const [filterPrioridad, setFilterPrioridad] = useState<string>('todos');
  const [filterAsignado, setFilterAsignado] = useState<string>('todos');
  const [collapsedParentSections, setCollapsedParentSections] = useState<Record<string, boolean>>({});

  // Sorting & List View Section Collapsing State
  const [sortField, setSortField] = useState<'titulo' | 'cliente' | 'tipo_venta' | 'fecha_inicio' | 'fecha_limite' | 'monto' | 'prioridad'>('titulo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
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

  // Antecedentes Documentación State
  const [nuevoAntecedenteFile, setNuevoAntecedenteFile] = useState<File | null>(null);
  const [nuevoAntecedenteNombre, setNuevoAntecedenteNombre] = useState<string>('');
  const [nuevoAntecedenteTipo, setNuevoAntecedenteTipo] = useState<TipoAntecedenteDocumento>('contrato');
  const [antecedenteUploading, setAntecedenteUploading] = useState(false);
  const [antecedenteErrorMsg, setAntecedenteErrorMsg] = useState('');
  const [opAntecedentesList, setOpAntecedentesList] = useState<AntecedenteDocumento[]>([]);

  // Reclamo Mode in Chat
  const [isReclamoMode, setIsReclamoMode] = useState(false);

  // Area Sections Collapsible State (Secciones 1, 2 y 3) (Todas contraídas por defecto al entrar)
  const [areaExpanded, setAreaExpanded] = useState<{ comercial: boolean; produccion: boolean; reventa: boolean }>({
    comercial: false,
    produccion: false,
    reventa: false,
  });

  // Órdenes de Compra vinculadas a la Oportunidad
  const [opOrdenesCompra, setOpOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [loadingOpOrdenes, setLoadingOpOrdenes] = useState(false);
  const [showCreateOcModal, setShowCreateOcModal] = useState(false);
  const [pdfPreviewOc, setPdfPreviewOc] = useState<OrdenCompra | null>(null);
  const [resolvingRamaChangeOc, setResolvingRamaChangeOc] = useState(false);
  const [ramaChangeOcModal, setRamaChangeOcModal] = useState<{
    op: OportunidadVenta;
    targetState: EstadoPipeline;
    rama: 'produccion' | 'reventa';
    ocCount: number;
  } | null>(null);

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

  // Real File Attachments State (name & url)
  const [pagoFiles, setPagoFiles] = useState<{ name: string; url: string }[]>([]);

  // Activity Search & Filter State
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'comentarios' | 'sistema' | 'reclamos'>('all');
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

  // Helper to render message content with @mentions highlighted in vibrant orange
  const renderMessageContentWithMentions = (content?: string) => {
    if (!content) return null;
    const parts = content.split(/(@[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="text-[#F7931F] font-extrabold bg-[#F7931F]/15 px-1.5 py-0.5 rounded-md border border-[#F7931F]/30 inline-block mx-0.5"
          >
            {part}
          </span>
        );
      }
      return part;
    });
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
      const { data, error } = await supabase
        .from('ordenes_compra')
        .select('*, proveedor:proveedores(*), items:orden_compra_items(*)')
        .eq('oportunidad_id', opId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      const list = (data || []) as OrdenCompra[];
      ordenesCompraCacheRef.current[opId] = list;
      setOpOrdenesCompra(list);
    } catch (err) {
      console.error('Error loading ordenes de compra:', err);
      setOpOrdenesCompra([]);
    } finally {
      setLoadingOpOrdenes(false);
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
    });
    setSelectedOp(op);
    setEditTitleValue(op.titulo);
    loadLatestActivities(op.id);
    loadVisitasOportunidad(op);
    loadEventosProduccionLogistica(op.id);
    loadOrdenesCompraOportunidad(op.id);
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
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('oportunidad');
      url.searchParams.delete('opId');
      const newSearch = url.searchParams.toString();
      window.history.pushState(null, '', url.pathname + (newSearch ? '?' + newSearch : ''));
    }
  };

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
      setShowScrollBottomBtn(false);
      const timer = setTimeout(() => {
        if (activityScrollRef.current) {
          activityScrollRef.current.scrollTop = activityScrollRef.current.scrollHeight;
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [selectedOp?.id, selectedOp?.chat_interno?.length]);

  const supabase = createClient();

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
            const allQuotes = (cotRes.data || []) as Cotizacion[];
            const allDbAct = actRes.data || [];

            mergedOps = rawOps.map((op) => {
              const jsonChat: ChatMensaje[] = Array.isArray(op.chat_interno) ? op.chat_interno : [];
              const tableChat: ChatMensaje[] = allDbAct
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
          } else {
            setOportunidades([]);
          }

          if (cotRes.data) {
            setAllCotizaciones(cotRes.data as Cotizacion[]);
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
              });
              setSelectedOp(found);
              setEditTitleValue(found.titulo);
              loadLatestActivities(found.id);
              loadVisitasOportunidad(found);
              loadEventosProduccionLogistica(found.id);
              loadOrdenesCompraOportunidad(found.id);
              loadAntecedentesOportunidad(found);
            }
          }

          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching oportunidades from Supabase:', err);
        if (!ignore) {
          setOportunidades([]);
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
      const pFiles = (selectedOp.comprobantes_pago || []).map((f) =>
        typeof f === 'string'
          ? { name: f, url: '#' }
          : { name: f.comprobante_nombre || f.nota || 'Comprobante', url: f.comprobante_url || '#' }
      );
      setPagoFiles(pFiles);

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
      badgeBg: 'bg-amber-100 border-amber-300',
      badgeText: 'text-amber-900',
      etapas: [
        { id: 'nueva' as EstadoPipeline, label: 'Nueva Oportunidad', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'pagada' as EstadoPipeline, label: 'Pago Validado', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'entregada' as EstadoPipeline, label: 'Venta Cerrada', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
      ],
    },
    {
      id: 'produccion',
      nombre: 'Producción y Logística',
      descripcion: 'Planificación de fabricación, control de planta y ejecución de instalaciones en terreno.',
      badge: 'Producción',
      badgeBg: 'bg-purple-100 border-purple-300',
      badgeText: 'text-purple-900',
      etapas: [
        { id: 'prod_pendiente' as EstadoPipeline, label: 'Pendiente Planificación', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'prod_cola' as EstadoPipeline, label: 'En Cola de Fabricación', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'prod_fabricacion' as EstadoPipeline, label: 'En Fabricación', color: 'border-purple-300 text-purple-900', bg: 'bg-purple-50' },
        { id: 'prod_listo_instalacion' as EstadoPipeline, label: 'Listo p/ Instalación', color: 'border-indigo-300 text-indigo-900', bg: 'bg-indigo-50' },
        { id: 'prod_instalacion' as EstadoPipeline, label: 'En Instalación', color: 'border-orange-300 text-orange-900', bg: 'bg-orange-50' },
        { id: 'prod_finalizado' as EstadoPipeline, label: 'Finalizado / Entregado', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
      ],
    },
    {
      id: 'reventa',
      nombre: 'Reventa y Logística',
      descripcion: 'Coordinación con proveedores, confirmación de stock y despachos.',
      badge: 'Reventa y Logística',
      badgeBg: 'bg-indigo-100 border-indigo-300',
      badgeText: 'text-indigo-900',
      etapas: [
        { id: 'rev_coordinacion' as EstadoPipeline, label: 'Coordinación Proveedor', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'rev_stock' as EstadoPipeline, label: 'Confirmación Stock', color: 'border-indigo-300 text-indigo-900', bg: 'bg-indigo-50' },
        { id: 'rev_listo_retiro' as EstadoPipeline, label: 'Listo para Retiro', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'rev_listo_despacho' as EstadoPipeline, label: 'Listo para Despacho', color: 'border-orange-300 text-orange-900', bg: 'bg-orange-50' },
        { id: 'rev_entregado' as EstadoPipeline, label: 'Entregado al Cliente', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
        { id: 'rev_postventa' as EstadoPipeline, label: 'Postventa & Seguimiento', color: 'border-purple-300 text-purple-900', bg: 'bg-purple-50' },
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
    if (estado === 'completado') return 'bg-emerald-950 text-emerald-300 border-emerald-800';
    if (estado === 'no_realizado') return 'bg-red-950 text-red-300 border-red-800';
    if (estado === 'reprogramado') return 'bg-purple-950 text-purple-300 border-purple-800';
    if (estado === 'en_curso') return 'bg-amber-950 text-amber-300 border-amber-800';
    return 'bg-blue-950 text-blue-300 border-blue-800';
  };

  const getProdLogTipoClasses = (tipo?: string | null) => {
    if (tipo === 'produccion') return 'bg-purple-950 text-purple-300 border-purple-800';
    if (tipo === 'obra') return 'bg-orange-950 text-orange-300 border-orange-800';
    if (tipo === 'reventa') return 'bg-indigo-950 text-indigo-300 border-indigo-800';
    return 'bg-sky-950 text-sky-300 border-sky-800';
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
    if (!confirm('¿Eliminar este evento del calendario?')) return;
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

  // Delete Oportunidad permanently from Supabase
  const handleDeleteOportunidad = async () => {
    if (!opToDelete) return;
    try {
      await supabase.from('oportunidades').delete().eq('id', opToDelete.id);
    } catch (err) {
      console.error('Error deleting oportunidad from Supabase:', err);
    }

    setOportunidades((prev) => prev.filter((o) => o.id !== opToDelete.id));
    if (selectedOp && selectedOp.id === opToDelete.id) {
      setSelectedOp(null);
    }
    setOpToDelete(null);
  };

  // Delete Cotización in modal from Supabase
  const handleDeleteCotizacionInModal = async () => {
    if (!cotToDeleteInModal) return;
    try {
      await supabase.from('cotizaciones').delete().eq('id', cotToDeleteInModal.id);
    } catch (err) {
      console.error('Error deleting cotizacion from Supabase:', err);
    }

    setAllCotizaciones((prev) => prev.filter((c) => c.id !== cotToDeleteInModal.id));
    if (selectedOp) {
      const updatedCots = (selectedOp.cotizaciones || []).filter((c) => c.id !== cotToDeleteInModal.id);
      setSelectedOp({ ...selectedOp, cotizaciones: updatedCots });
    }
    setCotToDeleteInModal(null);
  };

  const isUUID = (str?: string): boolean => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  // Sort Opportunities Helper for List View
  const sortOpportunities = (ops: OportunidadVenta[]) => {
    return [...ops].sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField === 'titulo') {
        valA = (a.titulo || '').toLowerCase();
        valB = (b.titulo || '').toLowerCase();
      } else if (sortField === 'cliente') {
        valA = (a.cliente?.nombre || '').toLowerCase();
        valB = (b.cliente?.nombre || '').toLowerCase();
      } else if (sortField === 'tipo_venta') {
        valA = (a.tipo_venta || '').toLowerCase();
        valB = (b.tipo_venta || '').toLowerCase();
      } else if (sortField === 'fecha_inicio') {
        valA = a.fecha_inicio || '';
        valB = b.fecha_inicio || '';
      } else if (sortField === 'fecha_limite') {
        valA = a.fecha_limite || '9999-99-99';
        valB = b.fecha_limite || '9999-99-99';
      } else if (sortField === 'monto') {
        valA = getOportunidadTotalValue(a);
        valB = getOportunidadTotalValue(b);
      } else if (sortField === 'prioridad') {
        const priorityOrder: Record<string, number> = { urgente: 3, alta: 2, normal: 1 };
        valA = priorityOrder[a.prioridad || 'normal'] || 0;
        valB = priorityOrder[b.prioridad || 'normal'] || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Column Widths para la Vista de Lista (Ajustable por arrastre)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    codigo: 110,
    titulo: 280,
    cliente: 220,
    tipo_venta: 150,
    prioridad: 130,
    fecha_inicio: 130,
    fecha_limite: 130,
    monto: 140,
  });

  const resizingRef = React.useRef<{ colKey: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDownResize = (colKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizingRef.current = {
      colKey,
      startX: e.clientX,
      startWidth: columnWidths[colKey] || 130,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const deltaX = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(70, resizingRef.current.startWidth + deltaX);
      setColumnWidths((prev) => ({
        ...prev,
        [resizingRef.current!.colKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Modal Split Ratio State (Porcentaje de ancho de la columna izquierda, por defecto 58%)
  const [modalLeftColRatio, setModalLeftColRatio] = useState<number>(58);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedRatio = localStorage.getItem('hormiglass_modal_left_col_ratio');
      if (savedRatio) {
        const parsed = Number(savedRatio);
        if (parsed >= 30 && parsed <= 80) {
          setModalLeftColRatio(parsed);
        }
      }
    }
  }, []);

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
    if (stage === 'nueva') return 'bg-amber-500 border-amber-400 text-amber-500';
    if (stage === 'pagada') return 'bg-blue-500 border-blue-400 text-blue-500';
    if (stage === 'entregada') return 'bg-emerald-500 border-emerald-400 text-emerald-500';
    if (stage.startsWith('prod_')) return 'bg-purple-500 border-purple-400 text-purple-500';
    return 'bg-indigo-500 border-indigo-400 text-indigo-500';
  };

  // Helper for sorting and resizing table headers
  const renderSortHeader = (
    label: string,
    field: 'titulo' | 'cliente' | 'tipo_venta' | 'fecha_inicio' | 'fecha_limite' | 'monto' | 'prioridad',
    colKey: string,
    align: 'left' | 'center' | 'right' = 'left'
  ) => {
    const isActive = sortField === field;
    const width = columnWidths[colKey] || 130;

    return (
      <th
        style={{ width: `${width}px` }}
        onClick={() => {
          if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setSortField(field);
            setSortDirection('asc');
          }
        }}
        className={`py-2.5 px-3 cursor-pointer hover:text-[#F7931F] transition select-none text-${align} text-xs font-extrabold uppercase tracking-wider text-gray-500 relative group border-r border-gray-200/50`}
      >
        <div
          className={`flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span className="truncate">{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 hover:opacity-100 shrink-0" />
          )}
        </div>

        {/* Resizer Handle Bar */}
        <div
          onMouseDown={(e) => handleMouseDownResize(colKey, e)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#F7931F] active:bg-[#F7931F] z-10 transition opacity-0 group-hover:opacity-100"
          title="Arrastrar para cambiar ancho de columna"
        />
      </th>
    );
  };

  // Helper para obtener el valor total de la oportunidad: suma de cotizaciones vinculadas directamente a la oportunidad
  const getOportunidadTotalValue = (op: OportunidadVenta): number => {
    const linkedQuotes = allCotizaciones.filter((c) => c.oportunidad_id === op.id);
    if (linkedQuotes.length > 0) {
      return linkedQuotes.reduce((sum, c) => sum + (c.monto_total || 0), 0);
    }
    return 0;
  };

  // Helper para obtener el monto abonado de una oportunidad
  const getOportunidadAbonadoValue = (op: OportunidadVenta): number => {
    if (op.abonos && Array.isArray(op.abonos) && op.abonos.length > 0) {
      return op.abonos.reduce((acc, a) => acc + (a.monto || 0), 0);
    }
    return op.monto_abonado || 0;
  };

  // Helper para obtener la cotización activa principal para una oportunidad
  const getActiveQuote = (op: OportunidadVenta): Cotizacion | undefined => {
    if (op.cotizacion_actual) return op.cotizacion_actual;
    // Search in allCotizaciones or op.cotizaciones for client or opportunity match
    const candidates = allCotizaciones.filter(
      (c) =>
        c.oportunidad_id === op.id ||
        c.cliente_id === op.cliente_id ||
        (op.cotizaciones && op.cotizaciones.some((sc) => sc.id === c.id))
    );
    if (candidates.length > 0) {
      // Pick approved/enviada first or highest version
      const sorted = [...candidates].sort((a, b) => (b.version || 1) - (a.version || 1));
      return sorted.find((c) => c.estado !== 'borrador') || sorted[0];
    }
    if (op.cotizaciones && op.cotizaciones.length > 0) {
      return [...op.cotizaciones].sort((a, b) => (b.version || 1) - (a.version || 1))[0];
    }
    return undefined;
  };

  // Candidate quote dropdown selection state
  const [selectedCandidateCotId, setSelectedCandidateCotId] = useState<string>('');

  // Abonos state
  const [nuevoAbonoMonto, setNuevoAbonoMonto] = useState<string>('');
  const [nuevoAbonoNota, setNuevoAbonoNota] = useState<string>('');
  const [nuevoAbonoFile, setNuevoAbonoFile] = useState<File | null>(null);
  const [nuevoAbonoFileName, setNuevoAbonoFileName] = useState<string>('');
  const [abonoErrorMsg, setAbonoErrorMsg] = useState<string>('');

  // Editing abono state
  const [editingAbonoId, setEditingAbonoId] = useState<string | null>(null);
  const [editAbonoMonto, setEditAbonoMonto] = useState<string>('');
  const [editAbonoNota, setEditAbonoNota] = useState<string>('');

  // Helper para agregar actividades al historial de la oportunidad y persistir en actividades_op
  const addOportunidadActividad = async (
    opId: string,
    contenido: string,
    tipo: 'comentario' | 'actualizacion' | 'abono' | 'reclamo' = 'actualizacion'
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
          message: 'No se pudo cambiar la rama en Supabase. La oportunidad quedo sin cambios.',
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
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp) return;

    if (targetOp.rama_destino && targetOp.rama_destino !== rama && isUUID(opId)) {
      const { count, error } = await supabase
        .from('ordenes_compra')
        .select('id', { count: 'exact', head: true })
        .eq('oportunidad_id', opId);
      if (error) {
        console.error('Error checking OC count before branch change:', error);
        return;
      }
      const ocCount = count || 0;

      if (ocCount > 0) {
        setRamaChangeOcModal({ op: targetOp, targetState, rama, ocCount });
        return;
      }
    }

    await applyMoveWithRama(opId, targetState, rama);
  };

  const resolveRamaChangeWithOc = async (action: 'desvincular' | 'eliminar') => {
    if (!ramaChangeOcModal || resolvingRamaChangeOc) return;
    const { op, targetState, rama } = ramaChangeOcModal;
    setResolvingRamaChangeOc(true);

    try {
      if (action === 'desvincular') {
        const { error } = await supabase
          .from('ordenes_compra')
          .update({ oportunidad_id: null })
          .eq('oportunidad_id', op.id);
        if (error) throw new Error(error.message);
        await addOportunidadActividad(op.id, 'Ordenes de compra desvinculadas antes de cambiar la rama de la oportunidad.');
      } else {
        const { error } = await supabase
          .from('ordenes_compra')
          .delete()
          .eq('oportunidad_id', op.id);
        if (error) throw new Error(error.message);
        await addOportunidadActividad(op.id, 'Ordenes de compra eliminadas antes de cambiar la rama de la oportunidad.');
      }

      setOpOrdenesCompra([]);
      ordenesCompraCacheRef.current[op.id] = [];
      setRamaChangeOcModal(null);
      await applyMoveWithRama(op.id, targetState, rama);
    } catch (err) {
      console.error('Error resolving OC branch change:', err);
      setToastAlert({
        id: Date.now().toString(),
        message: action === 'desvincular'
          ? 'No se pudo desvincular la orden de compra. Intenta nuevamente.'
          : 'No se pudo eliminar la orden de compra. Intenta nuevamente.',
        user: 'Sistema CRM',
      });
      setTimeout(() => setToastAlert(null), 5000);
    } finally {
      setResolvingRamaChangeOc(false);
    }
  };

  // Mover Oportunidad en el Pipeline (Sin gates bloqueantes de abono)
  const moveOportunidadToState = async (opId: string, targetState: EstadoPipeline) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp || targetOp.estado_pipeline === targetState) return;

    if (currentUser?.rol !== 'admin') {
      setToastAlert({
        id: Date.now().toString(),
        message: 'Solo un usuario admin puede cambiar la etapa o rama de una oportunidad.',
        user: 'Sistema CRM',
      });
      setTimeout(() => setToastAlert(null), 5000);
      return;
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

    // Si se mueve a Venta Cerrada (entregada) y no tiene rama_destino aún, abrir modal de elección
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
        await supabase
          .from('oportunidades')
          .update({ estado_pipeline: targetState })
          .eq('id', opId);
      } catch (err) {
        console.error('Error updating oportunidad state in Supabase:', err);
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

  // Chat message & @ Mentions Handling
  const handleSendChatMessage = async () => {
    if (!selectedOp || !chatInput.trim()) return;

    const msgContent = chatInput;
    const msgTipo = isReclamoMode ? 'reclamo' : 'comentario';
    setChatInput('');
    setIsReclamoMode(false);
    setMentionMenuOpen(false);

    // Add activity (saves to actividades_op table and logs_sistema)
    await addOportunidadActividad(selectedOp.id, msgContent, msgTipo);

    // Detect @ mentions in text
    const mentionsFound = usuariosApp.filter((u) =>
      msgContent.toLowerCase().includes(`@${u.nombre.toLowerCase()}`)
    );

    if (mentionsFound.length > 0) {
      const mentionedNames = mentionsFound.map((m) => m.nombre).join(', ');

      for (const u of mentionsFound) {
        if (isUUID(u.id)) {
          try {
            await supabase.from('notificaciones').insert([{
              usuario_id: u.id,
              tipo: 'mencion',
              mensaje: `@${currentUser?.nombre || 'Usuario'} te mencionó en la oportunidad ${selectedOp.codigo}: "${msgContent}"`,
              link_url: `/ventas?oportunidad=${selectedOp.id}`,
              leido: false,
              fecha: new Date().toISOString(),
            }]);
          } catch (err) {
            console.error('Error inserting notification in Supabase:', err);
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

  // Real File Upload Handler for Financial Documents
  const handleRealFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOp) return;

    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `comprobantes/${selectedOp.id}/${Date.now()}_${cleanFileName}`;
      const { data, error } = await supabase.storage.from('documentos').upload(fileName, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error || !data) {
        throw new Error(error?.message || 'Supabase Storage no confirmó la subida.');
      }

      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(fileName);
      const publicUrl = urlData?.publicUrl || '#';
      const fileObj = { name: file.name, url: publicUrl };
      const updated = [...pagoFiles, fileObj];
      setPagoFiles(updated);
      updateOportunidadField(
        selectedOp.id,
        'comprobantes_pago',
        updated.map((f) => ({ comprobante_nombre: f.name, comprobante_url: f.url }))
      );
    } catch (err: any) {
      console.error('Error uploading payment document:', err);
      setAbonoErrorMsg(`Error al subir comprobante a Supabase: ${err?.message || 'Error al subir.'}`);
    }
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
        throw new Error('La oportunidad debe estar guardada en Supabase antes de adjuntar antecedentes.');
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
        throw new Error(uploadError?.message || 'Supabase Storage no confirmó la subida.');
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
        throw new Error(insertError?.message || 'No se pudo registrar la metadata del antecedente.');
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
      setAntecedenteErrorMsg(`Error al subir archivo: ${err?.message || 'Error al subir.'}`);
    } finally {
      setAntecedenteUploading(false);
    }
  };

  const handleDeleteAntecedente = async (docId: string) => {
    if (!selectedOp || !confirm('¿Eliminar este documento de antecedentes?')) return;
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
        alert('No se pudo crear la oportunidad. Revisa los datos e intenta nuevamente.');
      }
    } catch (err: any) {
      console.error('Error creating oportunidad:', err);
      alert('No se pudo conectar con la base de datos. Intenta nuevamente.');
    }
  };

  const handleSaveTitleEdit = () => {
    if (selectedOp && editTitleValue.trim()) {
      updateOportunidadField(selectedOp.id, 'titulo', editTitleValue);
    }
    setIsEditingTitle(false);
  };

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

  return (
    <div className="space-y-6 text-[#363636] relative">
      {/* Toast Alert Flotante Superior Derecho */}
      {toastAlert && (
        <div className="fixed top-20 right-6 z-50 bg-[#363636] text-white p-4 rounded-2xl shadow-2xl border border-[#F7931F] flex items-center gap-3 animate-slideDown max-w-sm">
          <div className="bg-[#F7931F] p-2 rounded-xl text-white shrink-0">
            <AtSign className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 text-xs">
            <span className="font-extrabold text-[#F7931F] block">{toastAlert.user}</span>
            <p className="font-medium text-gray-200">{toastAlert.message}</p>
          </div>
          <button onClick={() => setToastAlert(null)} className="text-gray-400 hover:text-white p-1 ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#F7931F]" />
            <span>Pipeline de Oportunidades de Venta</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Arrastra oportunidades entre estados, gestiona productos, cotizaciones, archivos de finanzas y comunícate con menciones @.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setShowNewOpModal(true)}
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Oportunidad</span>
          </button>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'lista' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tablero' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Avanzados (Ajustes 11 - Req 5) */}
      <div className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Búsqueda por Texto */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código, cliente, título, RUT..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-[#363636] font-medium placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
            />
            {filterSearch && (
              <button
                onClick={() => setFilterSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtro Estado */}
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#363636] focus:outline-none focus:border-[#F7931F] cursor-pointer"
          >
            <option value="todos">Todos los Estados</option>
            <optgroup label="Comercial">
              <option value="nueva">Nueva Oportunidad</option>
              <option value="pagada">Pago Validado</option>
              <option value="entregada">Venta Cerrada</option>
            </optgroup>
            <optgroup label="Producción">
              <option value="prod_pendiente">Pendiente Planificación</option>
              <option value="prod_cola">En Cola de Fabricación</option>
              <option value="prod_fabricacion">En Fabricación</option>
              <option value="prod_listo_instalacion">Listo p/ Instalación</option>
              <option value="prod_instalacion">En Instalación</option>
              <option value="prod_finalizado">Finalizado / Entregado</option>
            </optgroup>
            <optgroup label="Reventa">
              <option value="rev_coordinacion">Coordinación Proveedor</option>
              <option value="rev_stock">Confirmación Stock</option>
              <option value="rev_listo_retiro">Listo para Retiro</option>
              <option value="rev_listo_despacho">Listo para Despacho</option>
              <option value="rev_entregado">Entregado al Cliente</option>
              <option value="rev_postventa">Postventa & Seguimiento</option>
            </optgroup>
          </select>

          {/* Filtro Tipo Venta */}
          <select
            value={filterTipoVenta}
            onChange={(e) => setFilterTipoVenta(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#363636] focus:outline-none focus:border-[#F7931F] cursor-pointer"
          >
            <option value="todos">Todos los Tipos de Venta</option>
            <option value="Instalación">Instalación</option>
            <option value="Suministro">Suministro</option>
            <option value="Reventa de Material">Reventa de Material</option>
          </select>

          {/* Filtro Prioridad */}
          <select
            value={filterPrioridad}
            onChange={(e) => setFilterPrioridad(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#363636] focus:outline-none focus:border-[#F7931F] cursor-pointer"
          >
            <option value="todos">Todas las Prioridades</option>
            <option value="Normal / Baja">Normal / Baja</option>
            <option value="Alta">Alta</option>
            <option value="Urgente">Urgente</option>
          </select>

          {/* Filtro Asignado */}
          <select
            value={filterAsignado}
            onChange={(e) => setFilterAsignado(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#363636] focus:outline-none focus:border-[#F7931F] cursor-pointer"
          >
            <option value="todos">Todos los Asignados</option>
            {currentUser && <option value="me">👤 Asignados a mí</option>}
            {usuariosApp.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Acciones de Filtro y Contador */}
        <div className="flex items-center gap-3">
          {(filterSearch || filterEstado !== 'todos' || filterTipoVenta !== 'todos' || filterPrioridad !== 'todos' || filterAsignado !== 'todos') && (
            <button
              onClick={() => {
                setFilterSearch('');
                setFilterEstado('todos');
                setFilterTipoVenta('todos');
                setFilterPrioridad('todos');
                setFilterAsignado('todos');
              }}
              className="text-gray-500 hover:text-red-600 font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpiar Filtros</span>
            </button>
          )}

          <span className="font-extrabold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200">
            Mostrando <strong className="text-[#F7931F]">{filteredOportunidades.length}</strong> de {oportunidades.length}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : activeTab === 'tablero' ? (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <div className="flex min-w-max divide-x divide-gray-200">
              {SECCIONES_PIPELINE.map((sec) => {
                const sectionCount = filteredOportunidades.filter((o) =>
                  sec.etapas.some((stage) => stage.id === o.estado_pipeline)
                ).length;
                const isActiveSection = activeBoardSection === sec.id;

                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveBoardSection(sec.id)}
                    className={`px-5 py-3 text-left min-w-[220px] transition border-b-2 ${
                      isActiveSection
                        ? 'bg-[#363636] text-white border-[#F7931F]'
                        : 'bg-white text-[#363636] border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <span className="block text-xs font-extrabold uppercase">{sec.nombre}</span>
                    <span className={`block text-[11px] mt-1 ${isActiveSection ? 'text-gray-200' : 'text-gray-500'}`}>
                      {sectionCount} {sectionCount === 1 ? 'oportunidad' : 'oportunidades'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(() => {
            const activeSection = SECCIONES_PIPELINE.find((sec) => sec.id === activeBoardSection) || SECCIONES_PIPELINE[0];

            return (
              <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-4 min-h-[560px]">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <h3 className="text-base font-extrabold text-[#363636]">{activeSection.nombre}</h3>
                  <span className="text-xs font-mono font-bold text-gray-500">
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

                    return (
                      <div
                        key={stage.id}
                        onDragOver={(e) => handleDragOver(e, stage.id)}
                        onDrop={(e) => handleDrop(e, stage.id)}
                        className={`rounded-lg border p-3 min-h-[470px] transition ${
                          isTargetColumn
                            ? 'bg-orange-50 border-[#F7931F] ring-2 ring-[#F7931F]/20'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full border ${stage.color}`} />
                            <h4 className="text-xs font-black uppercase text-[#363636]">{stage.label}</h4>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-gray-500">{colOps.length}</span>
                        </div>

                        <div className="space-y-3">
                          {colOps.map((op) => {
                            const latestQuote = getActiveQuote(op);
                            const montoTotal = getOportunidadTotalValue(op);
                            const montoAbonado = op.monto_abonado || 0;
                            const saldoPendiente = Math.max(0, montoTotal - montoAbonado);
                            const isBeingDragged = draggedOpId === op.id;

                            return (
                              <div
                                key={op.id}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, op.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleOpenOportunidad(op)}
                                className={`bg-white p-3 rounded-lg border border-gray-200 space-y-3 shadow-sm hover:shadow-md hover:border-[#F7931F] transition cursor-pointer active:cursor-grabbing relative group ${
                                  isBeingDragged ? 'opacity-40 border-dashed border-[#F7931F]' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span className="font-mono font-bold text-[#363636] text-xs">{op.codigo}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {latestQuote && (
                                      <span className="text-[10px] font-extrabold text-blue-700">
                                        Cot. v{latestQuote.version || 1}
                                      </span>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpToDelete(op);
                                      }}
                                      className="p-1 text-gray-400 hover:text-red-600 rounded transition"
                                      title="Eliminar Oportunidad"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <p className="text-sm font-extrabold text-[#363636] leading-snug group-hover:text-[#F7931F] transition">
                                    {op.titulo}
                                  </p>
                                  <div className="mt-1 flex items-center gap-1 text-xs text-[#F7931F] font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
                                    <Building className="w-3.5 h-3.5 shrink-0" />
                                    <Link href={`/clientes/${op.cliente_id}`}>
                                      {op.cliente?.nombre || 'Ver Ficha Cliente'}
                                    </Link>
                                  </div>
                                </div>

                                <div className="bg-gray-50 p-3 rounded-md text-[11px] space-y-1 border border-gray-100">
                                  <div className="flex items-center justify-between text-gray-600">
                                    <span>Inicio</span>
                                    <span className="font-mono font-semibold">{op.fecha_inicio}</span>
                                  </div>
                                  {op.fecha_limite && (
                                    <div className="flex items-center justify-between text-gray-600">
                                      <span>Límite</span>
                                      <span className="font-mono font-bold text-amber-900">{op.fecha_limite}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1.5 border-t border-gray-100 text-xs space-y-1">
                                  <div className="flex justify-between text-gray-700 font-bold">
                                    <span>Total</span>
                                    <span>${montoTotal.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="flex justify-between text-emerald-700 font-bold">
                                    <span>Abonado</span>
                                    <span>${montoAbonado.toLocaleString('es-CL')}</span>
                                  </div>
                                  {saldoPendiente > 0 && (
                                    <div className="flex justify-between text-[#F7931F] font-black">
                                      <span>Saldo</span>
                                      <span>${saldoPendiente.toLocaleString('es-CL')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {colOps.length === 0 && (
                            <div className="min-h-32 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400 font-medium bg-gray-50">
                              Sin oportunidades
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* Vista Lista Agrupada por Secciones del Pipeline */
        <div className="space-y-8 animate-fadeIn">
          {SECCIONES_PIPELINE.map((sec) => {
            const isSecCollapsed = !!collapsedParentSections[sec.id];
            const secOps = filteredOportunidades.filter((o) =>
              sec.etapas.some((e) => e.id === o.estado_pipeline)
            );

            return (
              <div key={sec.id} className="space-y-4">
                {/* Header de Sección Colapsable */}
                <div
                  onClick={() =>
                    setCollapsedParentSections((prev) => ({
                      ...prev,
                      [sec.id]: !prev[sec.id],
                    }))
                  }
                  className="p-4 rounded-lg border border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs cursor-pointer hover:border-[#F7931F]/60 transition select-none"
                >
                  <div className="flex items-center gap-3">
                    <button type="button" className="text-[#363636] cursor-pointer">
                      {isSecCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    <h3 className="text-base font-extrabold text-[#363636]">{sec.nombre}</h3>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 border border-gray-200 bg-gray-50 text-[#363636]">
                      {secOps.length} {secOps.length === 1 ? 'oportunidad' : 'oportunidades'}
                    </span>
                  </div>
                </div>

                {/* Tablas por etapa dentro de esta sección */}
                {!isSecCollapsed && (
                  <div className="space-y-4">
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
                          className={`space-y-2 mb-4 p-2 rounded-lg transition-all duration-200 ${
                            isTargetColumn
                              ? 'bg-orange-100/60 border-2 border-[#F7931F] ring-2 ring-[#F7931F]/30 scale-[1.005]'
                              : 'border border-transparent'
                          }`}
                        >
                          <div
                            onClick={() =>
                              setCollapsedSections((prev) => ({
                                ...prev,
                                [col.id]: !prev[col.id],
                              }))
                            }
                            className="flex items-center justify-between py-2 px-1 border-b border-gray-200/80 cursor-pointer select-none transition group"
                          >
                            <div className="flex items-center gap-2.5">
                              <button type="button" className="text-gray-400 group-hover:text-[#363636] transition cursor-pointer">
                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>

                              <span className={`px-2.5 py-1 text-xs font-black uppercase tracking-wider flex items-center gap-2 ${col.bg} ${col.color} border border-transparent shadow-2xs`}>
                                <div className="w-2 h-2 rounded-full border border-current shadow-xs" />
                                <span>{col.label}</span>
                              </span>

                              <span className="font-mono text-xs text-gray-500 font-extrabold bg-gray-100 px-2 py-0.5 border border-gray-200">
                                {rawOps.length}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowNewOpModal(true);
                              }}
                              className="text-xs font-bold text-gray-500 hover:text-[#F7931F] transition flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Agregar Oportunidad</span>
                            </button>
                          </div>

                          {!isCollapsed && (
                            <div>
                              {colOps.length === 0 ? (
                                <div className="py-4 px-2 text-xs text-gray-400 italic">
                                  No hay oportunidades en esta etapa.
                                </div>
                              ) : (
                                <div className="overflow-x-auto bg-white rounded-lg border border-gray-200/80 shadow-xs">
                                  <table className="w-full text-left text-xs min-w-[1000px] table-fixed border-collapse">
                                    <thead className="text-gray-500 uppercase text-xs font-extrabold border-b border-gray-200 bg-gray-50/60">
                                      <tr>
                                        <th className="py-3 px-2 w-10 text-center align-middle"></th>
                                        <th
                                          style={{ width: `${columnWidths.codigo}px` }}
                                          className="py-3 px-3 text-left text-xs font-extrabold uppercase tracking-wider align-middle relative group border-r border-gray-200/50"
                                        >
                                          <span>Código</span>
                                          <div
                                            onMouseDown={(e) => handleMouseDownResize('codigo', e)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#F7931F] active:bg-[#F7931F] z-10 transition opacity-0 group-hover:opacity-100"
                                            title="Arrastrar para cambiar ancho de columna"
                                          />
                                        </th>
                                        {renderSortHeader('Oportunidad / Nombre', 'titulo', 'titulo', 'left')}
                                        {renderSortHeader('Cliente', 'cliente', 'cliente', 'left')}
                                        {renderSortHeader('Tipo Venta', 'tipo_venta', 'tipo_venta', 'left')}
                                        {renderSortHeader('Prioridad', 'prioridad', 'prioridad', 'left')}
                                        {renderSortHeader('Fecha Inicio', 'fecha_inicio', 'fecha_inicio', 'left')}
                                        {renderSortHeader('Fecha Límite', 'fecha_limite', 'fecha_limite', 'left')}
                                        {renderSortHeader('Monto Total', 'monto', 'monto', 'right')}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 font-semibold text-[#363636]">
                                      {colOps.map((op) => {
                                        const montoTotal = getOportunidadTotalValue(op);
                                        const isBeingDragged = draggedOpId === op.id;

                                        return (
                                          <tr
                                            key={op.id}
                                            draggable={true}
                                            onDragStart={(e) => handleDragStart(e, op.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleOpenOportunidad(op)}
                                            className={`hover:bg-orange-50/40 transition group cursor-grab active:cursor-grabbing text-xs ${
                                              isBeingDragged ? 'opacity-40 bg-amber-50 border-dashed border-[#F7931F]' : ''
                                            }`}
                                          >
                                            <td className="py-3 px-2 w-10 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex items-center justify-center gap-1">
                                                <GripVertical className="w-3.5 h-3.5 text-gray-400 opacity-50 group-hover:opacity-100 transition shrink-0 cursor-grab" />
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setStageMenuPos({
                                                      opId: op.id,
                                                      top: rect.bottom + 4,
                                                      left: rect.left,
                                                    });
                                                  }}
                                                  className={`w-3.5 h-3.5 rounded-full border shadow-2xs transition hover:scale-110 cursor-pointer ${getStageDotColor(op.estado_pipeline)}`}
                                                  title="Hacer clic para cambiar el estado del pipeline"
                                                />
                                              </div>
                                            </td>

                                        <td style={{ width: `${columnWidths.codigo}px` }} className="py-3 px-3 font-mono font-bold text-gray-600 text-xs align-middle truncate">
                                          {op.codigo}
                                        </td>

                                        <td style={{ width: `${columnWidths.titulo}px` }} className="py-3 px-3 font-bold text-[#363636] group-hover:text-[#F7931F] transition text-xs truncate align-middle" title={op.titulo}>
                                          {op.titulo}
                                        </td>

                                        <td style={{ width: `${columnWidths.cliente}px` }} className="py-3 px-3 text-xs align-middle truncate" onClick={(e) => e.stopPropagation()}>
                                          <Link
                                            href={`/clientes/${op.cliente_id}`}
                                            className="font-bold text-[#F7931F] hover:underline flex items-center gap-1.5 truncate"
                                            title={op.cliente?.nombre || 'Ver Cliente'}
                                          >
                                            <Building className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
                                            <span className="truncate">{op.cliente?.nombre || 'Ver Cliente'}</span>
                                          </Link>
                                        </td>

                                        <td style={{ width: `${columnWidths.tipo_venta}px` }} className="py-3 px-3 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
                                          <select
                                            value={op.tipo_venta || 'Instalación'}
                                            onChange={async (e) => {
                                              const newTipo = e.target.value;
                                              updateOportunidadField(op.id, 'tipo_venta', newTipo);
                                              await addOportunidadActividad(op.id, `Tipo de venta cambiado a "${newTipo}" desde la lista.`);
                                            }}
                                            className="text-xs font-bold px-2 py-1 rounded-xl border bg-purple-50 text-purple-900 border-purple-200 cursor-pointer focus:outline-none w-full"
                                          >
                                            <option value="Instalación">Instalación</option>
                                            <option value="Suministro">Suministro</option>
                                            <option value="Reventa de Material">Reventa Material</option>
                                          </select>
                                        </td>

                                        <td style={{ width: `${columnWidths.prioridad}px` }} className="py-3 px-3 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
                                          <select
                                            value={op.prioridad || 'normal'}
                                            onChange={async (e) => {
                                              const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                                              updateOportunidadField(op.id, 'prioridad', newPrio);
                                              await addOportunidadActividad(op.id, `Prioridad cambiada a "${newPrio.toUpperCase()}" desde la lista.`);
                                            }}
                                            className={`text-xs font-bold px-2 py-1 rounded-xl border cursor-pointer focus:outline-none w-full ${
                                              op.prioridad === 'urgente'
                                                ? 'bg-red-50 text-red-700 border-red-200'
                                                : op.prioridad === 'alta'
                                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                : 'bg-blue-50 text-blue-700 border-blue-200'
                                            }`}
                                          >
                                            <option value="normal">Baja / Normal</option>
                                            <option value="alta">Alta</option>
                                            <option value="urgente">Urgente</option>
                                          </select>
                                        </td>

                                        <td style={{ width: `${columnWidths.fecha_inicio}px` }} className="py-3 px-3 font-mono text-gray-600 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            type="date"
                                            value={op.fecha_inicio || ''}
                                            onChange={async (e) => {
                                              const newDate = e.target.value;
                                              updateOportunidadField(op.id, 'fecha_inicio', newDate);
                                              await addOportunidadActividad(op.id, `Fecha de inicio actualizada a ${newDate} desde la lista.`);
                                            }}
                                            className="bg-transparent hover:bg-gray-100 border border-transparent hover:border-gray-300 rounded-lg px-1.5 py-1 font-mono text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-[#F7931F] w-full"
                                          />
                                        </td>

                                        <td style={{ width: `${columnWidths.fecha_limite}px` }} className="py-3 px-3 font-mono font-bold text-amber-800 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
                                          <input
                                            type="date"
                                            value={op.fecha_limite || ''}
                                            onChange={async (e) => {
                                              const newDate = e.target.value;
                                              updateOportunidadField(op.id, 'fecha_limite', newDate);
                                              await addOportunidadActividad(op.id, `Fecha límite actualizada a ${newDate} desde la lista.`);
                                            }}
                                            className="bg-transparent hover:bg-amber-50 border border-transparent hover:border-amber-300 rounded-lg px-1.5 py-1 font-mono font-bold text-amber-800 cursor-pointer focus:outline-none focus:border-[#F7931F] w-full"
                                          />
                                        </td>

                                        <td style={{ width: `${columnWidths.monto}px` }} className="py-3 px-3 text-right font-bold text-[#363636] text-xs align-middle">
                                          ${montoTotal.toLocaleString('es-CL')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
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

      {/* Pop Up / Modal Enriquecido Oportunidad de Venta (Diseño ClickUp 2 Columnas - Rediseño & Fonts Ampliados) */}
      {selectedOp && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 z-50 animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseOportunidad();
          }}
        >
          <div
            ref={modalContainerRef}
            className="bg-[#18181b] text-gray-100 border border-gray-800 rounded-3xl max-w-[84vw] w-full p-4 sm:p-6 shadow-2xl h-[95vh] overflow-hidden flex flex-col lg:flex-row gap-0 relative"
          >
            {/* Columna Izquierda: Breadcrumb + Título + Accordions (Ancho Resizable) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${modalLeftColRatio}%` : '100%' }}
              className="flex flex-col h-full overflow-hidden pr-3 shrink-0"
            >
              {/* Header Superior con Breadcrumb y Botón Eliminar Oportunidad */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3 text-sm shrink-0">
                <div className="flex items-center gap-2.5 text-gray-300 font-medium">
                  <Building className="w-4 h-4 text-[#F7931F]" />
                  <Link href={`/clientes/${selectedOp.cliente_id}`} className="hover:text-[#F7931F] transition underline font-bold text-sm">
                    {selectedOp.cliente?.nombre || 'Cliente'}
                  </Link>
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-200 font-bold font-mono text-sm">{selectedOp.codigo}</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setOpToDelete(selectedOp)}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl transition border border-red-500/30 font-bold text-xs flex items-center gap-1.5"
                    title="Eliminar esta oportunidad de Supabase"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>

              {/* Título Principal Editable Inline */}
              <div className="py-3 border-b border-gray-800 flex items-center justify-between shrink-0 mb-4">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2.5 w-full">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      className="bg-[#27272a] text-2xl font-black text-white border border-[#F7931F] rounded-xl px-3.5 py-1.5 w-full focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitleEdit}
                      className="bg-[#F7931F] hover:bg-[#e08316] text-white p-2.5 rounded-xl transition font-bold"
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
                    <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight group-hover:text-[#F7931F] transition">
                      {selectedOp.titulo}
                    </h2>
                    <Edit className="w-5 h-5 text-gray-500 group-hover:text-[#F7931F] transition opacity-0 group-hover:opacity-100" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 text-sm">
              {/* Strip de Datos Clave Editables Directamente: Etapa, Tipo de Venta, Prioridad, Vendedor, Fechas */}
              <div className="p-3.5 bg-[#222226] rounded-2xl border border-gray-800 text-xs text-gray-300 mb-4 shadow-sm space-y-2.5">
                <div className="grid gap-3 items-start [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  {/* 1. Etapa del Pipeline */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Etapa del pipeline:</span>
                    <select
                      value={selectedOp.estado_pipeline}
                      onChange={async (e) => {
                        const newStage = e.target.value as EstadoPipeline;
                        await moveOportunidadToState(selectedOp.id, newStage);
                      }}
                      className="bg-[#27272a] text-[#F7931F] border border-[#F7931F]/70 rounded-xl px-2.5 py-1.5 text-xs font-black cursor-pointer focus:outline-none shadow-xs truncate"
                    >
                      {SECCIONES_PIPELINE.map((sec) => (
                        <optgroup key={sec.id} label={sec.nombre}>
                          {sec.etapas.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* 2. Tipo de Venta */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Tipo de venta:</span>
                    <select
                      value={selectedOp.tipo_venta || 'Instalación'}
                      onChange={async (e) => {
                        const newTipo = e.target.value;
                        updateOportunidadField(selectedOp.id, 'tipo_venta', newTipo);
                        await addOportunidadActividad(selectedOp.id, `Tipo de venta cambiado a "${newTipo}" desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-[#F7931F] border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold focus:outline-none cursor-pointer text-xs truncate"
                    >
                      <option value="Instalación">Instalación</option>
                      <option value="Suministro">Suministro</option>
                      <option value="Reventa de Material">Reventa de Material</option>
                    </select>
                  </div>

                  {/* 3. Origen */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Origen:</span>
                    <input
                      type="text"
                      defaultValue={selectedOp.origen || ''}
                      onBlur={async (e) => {
                        const origen = e.target.value.trim();
                        if ((selectedOp.origen || '') === origen) return;
                        updateOportunidadField(selectedOp.id, 'origen', origen || null);
                        await addOportunidadActividad(
                          selectedOp.id,
                          origen ? `Origen actualizado a "${origen}".` : 'Origen de la oportunidad eliminado.'
                        );
                      }}
                      placeholder="Ej: WhatsApp, referido, web..."
                      className="bg-[#27272a] text-gray-200 border border-gray-700 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none focus:border-[#F7931F] text-xs"
                    />
                  </div>

                  {/* 4. Sólo material o instalación */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Requerimiento:</span>
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
                      className="bg-[#27272a] text-[#F7931F] border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold focus:outline-none cursor-pointer text-xs"
                    >
                      <option value="solo_material">Sólo material</option>
                      <option value="instalacion">Instalación</option>
                    </select>
                  </div>

                  {/* 5. Prioridad */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Prioridad:</span>
                    <select
                      value={selectedOp.prioridad || 'normal'}
                      onChange={async (e) => {
                        const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                        updateOportunidadField(selectedOp.id, 'prioridad', newPrio);
                        await addOportunidadActividad(selectedOp.id, `Prioridad cambiada a "${newPrio}" desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-gray-200 border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold focus:outline-none cursor-pointer text-xs"
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>

                  {/* 6. Vendedor Asignado */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Vendedor:</span>
                    <select
                      value={selectedOp.asignado_a || ''}
                      onChange={async (e) => {
                        const newUserId = e.target.value || null;
                        updateOportunidadField(selectedOp.id, 'asignado_a', newUserId);
                        const userObj = usuariosApp.find((u) => u.id === newUserId);
                        await addOportunidadActividad(selectedOp.id, `Vendedor asignado actualizado a "${userObj?.nombre || 'Sin asignar'}".`);
                      }}
                      className="bg-[#27272a] text-[#F7931F] border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none cursor-pointer text-xs truncate"
                    >
                      <option value="">-- Sin asignar --</option>
                      {usuariosApp.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 7. Fecha de Inicio */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Fecha de inicio:</span>
                    <input
                      type="date"
                      value={selectedOp.fecha_inicio || ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        updateOportunidadField(selectedOp.id, 'fecha_inicio', newDate);
                        await addOportunidadActividad(selectedOp.id, `Fecha de inicio actualizada a ${newDate} desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-gray-200 border border-gray-700 rounded-xl px-2 py-1.5 font-mono font-semibold focus:outline-none cursor-pointer text-xs"
                    >
                    </input>
                  </div>

                  {/* 8. Fecha Límite */}
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-400 text-xs">Fecha límite:</span>
                    <input
                      type="date"
                      value={selectedOp.fecha_limite || ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        updateOportunidadField(selectedOp.id, 'fecha_limite', newDate);
                        await addOportunidadActividad(selectedOp.id, `Fecha límite actualizada a ${newDate} desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-amber-400 border border-amber-500/40 rounded-xl px-2 py-1.5 font-mono font-bold focus:outline-none cursor-pointer text-xs"
                    >
                    </input>
                  </div>
                </div>
              </div>

              {(() => {
                const activeClient = clientes.find((c) => c.id === selectedOp.cliente_id) || selectedOp.cliente;
                const ejecutivoCliente = usuariosApp.find((u) => u.id === (activeClient?.usuario_id || selectedOp.asignado_a));
                const currentPipelineSection = SECCIONES_PIPELINE.find((sec) =>
                  sec.etapas.some((stage) => stage.id === selectedOp.estado_pipeline)
                );
                const currentPipelineStage = currentPipelineSection?.etapas.find(
                  (stage) => stage.id === selectedOp.estado_pipeline
                );

                return (
                  <div className="mb-4 bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                    <div className="w-full p-3.5 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                      <span className="flex items-center gap-2.5">
                        <User className="w-4 h-4 text-[#F7931F]" />
                        <span>Información del cliente</span>
                      </span>
                      {selectedOp.cliente_id && (
                        <Link
                          href={`/clientes/${selectedOp.cliente_id}`}
                          className="text-xs font-bold bg-[#F7931F]/20 hover:bg-[#F7931F] text-[#F7931F] hover:text-white px-3 py-1.5 rounded-xl transition normal-case"
                        >
                          Editar ficha del cliente
                        </Link>
                      )}
                    </div>

                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300 text-sm">
                      <div className="md:col-span-2 bg-[#18181b] border border-gray-800 rounded-2xl p-3.5 grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr] gap-3 items-end">
                        <div>
                          <span className="text-gray-400 font-semibold text-xs block mb-1">Área actual</span>
                          <span className="text-white text-sm font-black block">
                            {currentPipelineSection?.nombre || 'Sin área definida'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 font-semibold text-xs block mb-1">Etapa actual</span>
                          <span className="text-[#F7931F] text-sm font-black block">
                            {currentPipelineStage?.label || selectedOp.estado_pipeline}
                          </span>
                        </div>
                        <div>
                          <label className="text-gray-400 font-semibold text-xs block mb-1">
                            Cambiar etapa de la oportunidad
                          </label>
                          <select
                            value={selectedOp.estado_pipeline}
                            onChange={async (e) => {
                              const newStage = e.target.value as EstadoPipeline;
                              await moveOportunidadToState(selectedOp.id, newStage);
                            }}
                            className="w-full bg-[#27272a] text-white border border-[#F7931F]/60 rounded-xl px-3 py-2 text-xs font-extrabold focus:outline-none focus:border-[#F7931F] cursor-pointer"
                          >
                            {SECCIONES_PIPELINE.map((sec) => (
                              <optgroup key={sec.id} label={sec.nombre}>
                                {sec.etapas.map((st) => (
                                  <option key={st.id} value={st.id}>
                                    {st.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Razón social / Nombre</span>
                        <strong className="text-white text-base block font-bold">{activeClient?.nombre || 'Hormiglass Cliente'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Encargado del cliente</span>
                        <span className="text-white text-base block font-bold">{ejecutivoCliente?.nombre || 'Sin encargado asignado'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">RUT registrado</span>
                        <span className="font-mono text-amber-400 font-bold text-sm block">{activeClient?.rut || 'Sin RUT'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Teléfono</span>
                        <span className="flex items-center gap-1.5 font-bold text-white text-sm">
                          <Phone className="w-4 h-4 text-[#F7931F]" />
                          {activeClient?.telefono || 'No indicado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Dirección de despacho / Obra</span>
                        <span className="text-white text-sm font-bold block" title={activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}>
                          {activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Comuna / Región</span>
                        <span className="text-white text-sm font-bold block">
                          {[activeClient?.comuna || selectedOp.comuna, activeClient?.region || selectedOp.region || 'Región Metropolitana'].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Correos electrónicos</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="bg-[#18181b] px-3 py-1.5 rounded-xl border border-gray-700 text-white font-mono text-xs flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[#F7931F]" />
                            {activeClient?.correo || 'Sin correo principal'}
                          </span>
                          {activeClient?.correos_secundarios?.map((sec, idx) => (
                            <span key={idx} className="bg-[#18181b] px-3 py-1.5 rounded-xl border border-gray-700 text-gray-300 font-mono text-xs flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-gray-400" />
                              {sec}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Listas Desplegables (Accordions) */}
                {/* Banner Header: SECCIÓN 1: ÁREA COMERCIAL & VENTAS (Contraíble con Jerarquía) */}
                <button
                  type="button"
                  onClick={() => setAreaExpanded((prev) => ({ ...prev, comercial: !prev.comercial }))}
                  className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] border border-amber-500/40 rounded-2xl flex items-center justify-between font-black text-sm sm:text-base uppercase tracking-wide text-amber-400 transition shadow-md cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-[#F7931F] group-hover:scale-110 transition-transform" />
                    <span>Área Comercial & Ventas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {areaExpanded.comercial ? (
                      <ChevronUp className="w-5 h-5 text-amber-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                </button>

                {areaExpanded.comercial && (
                  <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-amber-500/40 space-y-3.5 my-2.5 animate-fadeIn relative">

                {/* Accordion 1: Cotizaciones de la Oportunidad */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex items-center justify-between border-b border-gray-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[#F7931F]" />
                      <span>Cotizaciones de la Oportunidad</span>
                    </span>
                    {openSections.productos ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
                  </button>

                  {openSections.productos && (
                    <div className="p-5 space-y-4 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
                        <div>
                          <h4 className="text-white font-extrabold text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#F7931F]" />
                            <span>Cotizaciones del Cliente:</span>
                          </h4>
                          <p className="text-xs text-gray-400 mt-1">
                            Marca la casilla para considerar la cotización en esta oportunidad. Las cotizaciones en estado <strong>Enviada</strong> o <strong>Aprobada</strong> se sumarán al valor total.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowUnifiedCotModal(true)}
                          className="bg-[#F7931F] hover:bg-[#e08316] text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-sm"
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
                              <div className="bg-[#18181b] p-4 rounded-2xl border border-gray-800 space-y-3 shadow-inner">
                                <label className="text-gray-300 font-extrabold text-xs flex items-center gap-2 uppercase tracking-wider">
                                  <FileText className="w-4 h-4 text-[#F7931F]" />
                                  <span>Seleccionar Cotización Disponible para Agregar:</span>
                                </label>

                                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                                  <select
                                    value={selectedCandidateCotId}
                                    onChange={(e) => setSelectedCandidateCotId(e.target.value)}
                                    className="w-full bg-[#27272a] text-white border border-gray-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#F7931F]"
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
                                      className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 border border-gray-600 shadow-sm"
                                      title="Previsualizar PDF antes de vincular"
                                    >
                                      <Eye className="w-4 h-4 text-[#F7931F]" />
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

                                      const updatedCots = allCotizaciones.map((c) =>
                                        c.id === targetCot.id ? { ...c, oportunidad_id: selectedOp.id } : c
                                      );
                                      setAllCotizaciones(updatedCots);
                                      setSelectedCandidateCotId('');

                                      if (isUUID(targetCot.id)) {
                                        try {
                                          await supabase
                                            .from('cotizaciones')
                                            .update({ oportunidad_id: selectedOp.id })
                                            .eq('id', targetCot.id);
                                        } catch (err) {
                                          console.error('Error adding quote to op in Supabase:', err);
                                        }
                                      }
                                      await addOportunidadActividad(
                                        selectedOp.id,
                                        `Cotización ${targetCot.numero_cotizacion} agregada y vinculada a la oportunidad.`
                                      );
                                    }}
                                    className="w-full sm:w-auto bg-[#F7931F] hover:bg-[#e08316] disabled:opacity-50 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 shadow-md"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Agregar</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Lista de Cotizaciones Agregadas a la Oportunidad */}
                            {linkedQuotes.length === 0 ? (
                              <div className="p-5 bg-[#18181b] rounded-2xl border border-dashed border-gray-800 text-gray-400 text-center text-xs">
                                No hay cotizaciones agregadas a esta oportunidad. {unassignedQuotes.length > 0 ? 'Selecciona una del desplegable de arriba o haz' : 'Haz'} clic en "Crear Nueva Cotización".
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {linkedQuotes.map((cot) => {
                                  const isLinked = true;
                                  const isSummed = cot.estado === 'aprobada' || cot.estado === 'enviada';

                                  return (
                                    <div
                                      key={cot.id}
                                      className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        isLinked
                                          ? 'bg-[#18181b] border-[#F7931F]/60 shadow-md'
                                          : 'bg-[#18181b] border-gray-800 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3.5">
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={async (e) => {
                                            const checked = e.target.checked;
                                            const newOpId = checked ? selectedOp.id : undefined;

                                            const updatedCots = allCotizaciones.map((c) =>
                                              c.id === cot.id ? { ...c, oportunidad_id: newOpId } : c
                                            );
                                            setAllCotizaciones(updatedCots);

                                            if (isUUID(cot.id)) {
                                              try {
                                                await supabase
                                                  .from('cotizaciones')
                                                  .update({ oportunidad_id: newOpId || null })
                                                  .eq('id', cot.id);
                                              } catch (err) {
                                                console.error('Error updating quote oportunidad_id in Supabase:', err);
                                              }
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} ${checked ? 'vinculada a' : 'desvinculada de'} la oportunidad.`
                                            );
                                          }}
                                          className="w-4 h-4 rounded text-[#F7931F] focus:ring-[#F7931F] accent-[#F7931F] cursor-pointer shrink-0"
                                        />

                                        <div className="space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono font-black text-white text-sm">
                                              {cot.numero_cotizacion}
                                            </span>
                                            <span className="text-xs font-extrabold uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                                              v{cot.version || 1}
                                            </span>
                                            {isSummed ? (
                                              <span className="text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                                                Sumando a Oportunidad
                                              </span>
                                            ) : isLinked ? (
                                              <span className="text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                                                Agregada ({cot.estado})
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-bold text-gray-400">
                                                Sin asignar
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-black text-[#F7931F] text-sm block">
                                            ${(cot.monto_total || 0).toLocaleString('es-CL')} CLP
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2.5 self-end sm:self-auto">
                                        <select
                                          value={cot.estado}
                                          onChange={async (e) => {
                                            const newStatus = e.target.value as EstadoCotizacion;

                                            const updatedCots = allCotizaciones.map((c) =>
                                              c.id === cot.id ? { ...c, estado: newStatus } : c
                                            );
                                            setAllCotizaciones(updatedCots);

                                            if (isUUID(cot.id)) {
                                              try {
                                                await supabase
                                                  .from('cotizaciones')
                                                  .update({ estado: newStatus })
                                                  .eq('id', cot.id);
                                              } catch (err) {
                                                console.error('Error updating quote status in Supabase:', err);
                                              }
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Estado de cotización ${cot.numero_cotizacion} cambiado a "${newStatus.toUpperCase()}"`
                                            );
                                          }}
                                          className={`text-xs font-extrabold uppercase px-3 py-1.5 rounded-xl border cursor-pointer focus:outline-none ${
                                            cot.estado === 'aprobada'
                                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                              : cot.estado === 'enviada'
                                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                              : cot.estado === 'declinada' || cot.estado === 'rechazada'
                                              ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                          }`}
                                        >
                                          <option value="borrador" className="bg-[#18181b] text-white">Borrador</option>
                                          <option value="enviada" className="bg-[#18181b] text-white">Enviada</option>
                                          <option value="aprobada" className="bg-[#18181b] text-white">Aprobada</option>
                                          <option value="declinada" className="bg-[#18181b] text-white">Declinada</option>
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() => setPreviewCotizacion(cot)}
                                          className="p-2 bg-white/10 hover:bg-[#F7931F] text-white rounded-xl font-bold transition text-xs flex items-center gap-1.5"
                                          title="Previsualizar PDF"
                                        >
                                          <Eye className="w-4 h-4" />
                                          <span className="hidden sm:inline">PDF</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const updatedCots = allCotizaciones.map((c) =>
                                              c.id === cot.id ? { ...c, oportunidad_id: undefined } : c
                                            );
                                            setAllCotizaciones(updatedCots);

                                            if (isUUID(cot.id)) {
                                              try {
                                                await supabase
                                                  .from('cotizaciones')
                                                  .update({ oportunidad_id: null })
                                                  .eq('id', cot.id);
                                              } catch (err) {
                                                console.error('Error unlinking quote in Supabase:', err);
                                              }
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} desvinculada de esta oportunidad.`
                                            );
                                          }}
                                          className="p-2 bg-[#27272a] hover:bg-amber-500/20 text-gray-400 hover:text-amber-300 rounded-xl transition border border-gray-700"
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
                            <div className="p-4 bg-[#18181b] border border-gray-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm shadow-inner">
                              <div>
                                <span className="text-gray-200 font-extrabold text-sm block">Valor Total de la Oportunidad:</span>
                                <span className="text-xs text-gray-400">
                                  Suma de cotizaciones marcadas en estado <strong>Enviada</strong> o <strong>Aprobada</strong>.
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-2xl font-black text-[#F7931F] block">
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
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex items-center justify-between border-b border-gray-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-[#F7931F]" />
                      <span>Finanzas & Comprobantes de Pago</span>
                    </span>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
                  </button>

                  {openSections.finanzas && (
                    <div className="p-5 space-y-5 animate-fadeIn">
                      {/* Resumen de Saldo */}
                      {(() => {
                        const totalCot = getOportunidadTotalValue(selectedOp);
                        const abonado = selectedOp.monto_abonado || 0;
                        const saldo = Math.max(0, totalCot - abonado);

                        return (
                          <div className="space-y-4">
                            {/* Resumen Financiero Calculado */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#18181b] p-4 rounded-2xl border border-gray-800 text-center shadow-inner">
                              <div>
                                <span className="text-gray-400 block text-xs font-semibold mb-1">Valor Total Cotizado:</span>
                                <strong className="text-white text-lg font-black">${totalCot.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-xs font-semibold mb-1">Monto Abonado Acumulado:</span>
                                <strong className="text-emerald-400 text-lg font-black">${abonado.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-xs font-semibold mb-1">Saldo Pendiente:</span>
                                <strong className="text-amber-400 text-lg font-black">${saldo.toLocaleString('es-CL')}</strong>
                              </div>
                            </div>

                            {/* Registro de Abonos e Historial Acumulativo */}
                            <div className="bg-[#18181b] p-4 rounded-2xl border border-gray-800 space-y-4 shadow-inner">
                              <h4 className="text-white font-extrabold text-sm flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-[#F7931F]" />
                                <span>Ingresar Nuevo Abono o Pago (Comprobante Obligatorio)</span>
                              </h4>

                              {abonoErrorMsg && (
                                <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold animate-fadeIn">
                                  {abonoErrorMsg}
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="text-xs text-gray-300 font-bold block mb-1">Monto Abono ($ CLP) *</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-400 font-bold text-xs">$</span>
                                    <input
                                      type="text"
                                      placeholder="500.000"
                                      value={nuevoAbonoMonto ? Number(nuevoAbonoMonto).toLocaleString('es-CL') : ''}
                                      onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        setNuevoAbonoMonto(digits);
                                        setAbonoErrorMsg('');
                                      }}
                                      className="w-full bg-[#27272a] text-white border border-gray-700 rounded-xl pl-7 pr-3 py-2 text-xs font-bold focus:outline-none focus:border-[#F7931F]"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-xs text-gray-300 font-bold block mb-1">Comprobante de Pago *</label>
                                  <label className="w-full bg-[#27272a] hover:bg-[#323236] text-gray-200 border border-gray-700 rounded-xl px-3 py-2 text-xs font-bold cursor-pointer flex items-center justify-between transition truncate">
                                    <span className="truncate">{nuevoAbonoFileName || 'Subir Comprobante'}</span>
                                    <Paperclip className="w-4 h-4 text-[#F7931F] shrink-0 ml-1" />
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
                                  <label className="text-xs text-gray-300 font-bold block mb-1">Nota / Referencia</label>
                                  <input
                                    type="text"
                                    placeholder="Ej. Transferencia #9842"
                                    value={nuevoAbonoNota}
                                    onChange={(e) => setNuevoAbonoNota(e.target.value)}
                                    className="w-full bg-[#27272a] text-white border border-gray-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
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

                                      let publicUrl = '#';
                                      try {
                                        const cleanFileName = nuevoAbonoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                                        const fileName = `abonos/${selectedOp.id}/${Date.now()}_${cleanFileName}`;
                                        const { data, error } = await supabase.storage.from('documentos').upload(fileName, nuevoAbonoFile, {
                                          contentType: nuevoAbonoFile.type || undefined,
                                          upsert: false,
                                        });
                                        if (error || !data) {
                                          throw new Error(error?.message || 'Supabase Storage no confirmó la subida.');
                                        }
                                        const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(fileName);
                                        if (urlData) publicUrl = urlData.publicUrl;
                                      } catch (err: any) {
                                        console.error('Error uploading abono comprobante:', err);
                                        setAbonoErrorMsg(`Error al subir comprobante a Supabase: ${err?.message || 'Error al subir.'}`);
                                        return;
                                      }

                                      const existingComprobantes = selectedOp.comprobantes_pago || [];
                                      const newAbonoRecord = {
                                        id: `abono-${Date.now()}`,
                                        monto: rawVal,
                                        fecha: new Date().toLocaleDateString('es-CL') + ' ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
                                        fecha_iso: new Date().toISOString(),
                                        nota: nuevoAbonoNota || 'Abono registrado',
                                        creado_por: currentUser?.nombre || 'Vendedor',
                                        comprobante_nombre: nuevoAbonoFile.name,
                                        comprobante_url: publicUrl,
                                      };

                                      const updatedComprobantes = [...existingComprobantes, newAbonoRecord];
                                      const updatedAbonado = updatedComprobantes.reduce(
                                        (sum: number, item: any) => sum + (Number(item.monto) || 0),
                                        0
                                      );

                                      updateOportunidadField(selectedOp.id, 'monto_abonado', updatedAbonado);
                                      updateOportunidadField(selectedOp.id, 'comprobantes_pago', updatedComprobantes);

                                      setNuevoAbonoMonto('');
                                      setNuevoAbonoNota('');
                                      setNuevoAbonoFile(null);
                                      setNuevoAbonoFileName('');
                                      setAbonoErrorMsg('');

                                      if (isUUID(selectedOp.id)) {
                                        try {
                                          await supabase
                                            .from('oportunidades')
                                            .update({
                                              monto_abonado: updatedAbonado,
                                              comprobantes_pago: updatedComprobantes,
                                            })
                                            .eq('id', selectedOp.id);
                                        } catch (err) {
                                          console.error('Error updating abono in Supabase:', err);
                                        }
                                      }

                                      await addOportunidadActividad(
                                        selectedOp.id,
                                        `Abono de $${rawVal.toLocaleString('es-CL')} ingresado con comprobante "${nuevoAbonoFile.name}". Total acumulado: $${updatedAbonado.toLocaleString('es-CL')}`,
                                        'abono'
                                      );
                                    }}
                                    className="w-full bg-[#F7931F] hover:bg-[#e08316] text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Agregar Abono</span>
                                  </button>
                                </div>
                              </div>

                              {/* Historial de Abonos Registrados */}
                              <div className="pt-4 border-t border-gray-800 space-y-3">
                                <span className="text-gray-300 text-xs font-extrabold uppercase tracking-wider block">Historial de Abonos Registrados:</span>
                                {(() => {
                                  const abonosList = (selectedOp.comprobantes_pago || []).filter(
                                    (item: any) => typeof item === 'object' && item !== null && 'monto' in item
                                  );

                                  if (abonosList.length === 0) {
                                    return (
                                      <p className="text-gray-500 italic text-xs">No hay abonos registrados en el historial.</p>
                                    );
                                  }

                                  return (
                                    <div className="space-y-2.5">
                                      {abonosList.map((ab: any, idx: number) => {
                                        const isEditingThis = editingAbonoId === ab.id;

                                        if (isEditingThis) {
                                          return (
                                            <div key={ab.id || idx} className="bg-[#27272a] p-3.5 rounded-xl border border-[#F7931F] space-y-2 text-xs">
                                              <span className="font-bold text-[#F7931F] text-xs">Editar Abono:</span>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <input
                                                  type="text"
                                                  value={editAbonoMonto ? Number(editAbonoMonto).toLocaleString('es-CL') : ''}
                                                  onChange={(e) => setEditAbonoMonto(e.target.value.replace(/\D/g, ''))}
                                                  className="bg-[#18181b] text-white border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                                />
                                                <input
                                                  type="text"
                                                  value={editAbonoNota}
                                                  onChange={(e) => setEditAbonoNota(e.target.value)}
                                                  className="bg-[#18181b] text-white border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs"
                                                />
                                                <div className="flex items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      const rawNum = Number(editAbonoMonto);
                                                      if (!rawNum || rawNum <= 0) return;

                                                      const updatedComprobantes = (selectedOp.comprobantes_pago || []).map((item: any) =>
                                                        item.id === ab.id ? { ...item, monto: rawNum, nota: editAbonoNota } : item
                                                      );
                                                      const updatedAbonado = updatedComprobantes.reduce(
                                                        (sum: number, item: any) => sum + (Number(item.monto) || 0),
                                                        0
                                                      );

                                                      updateOportunidadField(selectedOp.id, 'monto_abonado', updatedAbonado);
                                                      updateOportunidadField(selectedOp.id, 'comprobantes_pago', updatedComprobantes);
                                                      setEditingAbonoId(null);

                                                      if (isUUID(selectedOp.id)) {
                                                        try {
                                                          await supabase
                                                            .from('oportunidades')
                                                            .update({
                                                              monto_abonado: updatedAbonado,
                                                              comprobantes_pago: updatedComprobantes,
                                                            })
                                                            .eq('id', selectedOp.id);
                                                        } catch (err) {
                                                          console.error('Error updating edited abono in Supabase:', err);
                                                        }
                                                      }

                                                      await addOportunidadActividad(
                                                        selectedOp.id,
                                                        `Abono editado a $${rawNum.toLocaleString('es-CL')} (${editAbonoNota}). Total acumulado: $${updatedAbonado.toLocaleString('es-CL')}`
                                                      );
                                                    }}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Guardar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingAbonoId(null)}
                                                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={ab.id || idx} className="bg-[#27272a] p-3 rounded-xl border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <span className="font-bold text-emerald-400 text-sm">
                                                  ${Number(ab.monto || 0).toLocaleString('es-CL')} CLP
                                                </span>
                                                <span className="text-gray-200 text-xs font-semibold">
                                                  — {ab.nota || 'Abono'}
                                                </span>
                                              </div>

                                              {ab.comprobante_url && (
                                                <a
                                                  href={ab.comprobante_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-amber-400 hover:underline text-xs font-mono flex items-center gap-1.5 mt-0.5"
                                                >
                                                  <FileCheck className="w-3.5 h-3.5 text-[#F7931F]" />
                                                  <span>Comprobante: {ab.comprobante_nombre || 'Ver archivo'}</span>
                                                </a>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                              <div className="text-right text-xs text-gray-400 mr-2">
                                                <span>{ab.fecha}</span>
                                                {ab.creado_por && <span className="block text-gray-500 font-semibold">{ab.creado_por}</span>}
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingAbonoId(ab.id);
                                                  setEditAbonoMonto(String(ab.monto || ''));
                                                  setEditAbonoNota(ab.nota || '');
                                                }}
                                                className="p-1.5 bg-[#18181b] hover:bg-blue-600/30 text-blue-400 rounded-lg transition border border-gray-700"
                                                title="Editar Abono"
                                              >
                                                <Edit className="w-4 h-4" />
                                              </button>

                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  const updatedComprobantes = (selectedOp.comprobantes_pago || []).filter(
                                                    (item: any) => item.id !== ab.id
                                                  );
                                                  const updatedAbonado = updatedComprobantes.reduce(
                                                    (sum: number, item: any) => sum + (Number(item.monto) || 0),
                                                    0
                                                  );

                                                  updateOportunidadField(selectedOp.id, 'monto_abonado', updatedAbonado);
                                                  updateOportunidadField(selectedOp.id, 'comprobantes_pago', updatedComprobantes);

                                                  if (isUUID(selectedOp.id)) {
                                                    try {
                                                      await supabase
                                                        .from('oportunidades')
                                                        .update({
                                                          monto_abonado: updatedAbonado,
                                                          comprobantes_pago: updatedComprobantes,
                                                        })
                                                        .eq('id', selectedOp.id);
                                                    } catch (err) {
                                                      console.error('Error deleting abono in Supabase:', err);
                                                    }
                                                  }

                                                  await addOportunidadActividad(
                                                    selectedOp.id,
                                                    `Abono de $${Number(ab.monto || 0).toLocaleString('es-CL')} eliminado del historial. Total acumulado: $${updatedAbonado.toLocaleString('es-CL')}`
                                                  );
                                                }}
                                                className="p-1.5 bg-[#18181b] hover:bg-red-600/30 text-red-400 rounded-lg transition border border-gray-700"
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

                {/* Accordion 3.5: Antecedentes & Documentación Exigida */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <div className="w-full p-3.5 bg-[#27272a] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, antecedentes: !openSections.antecedentes })}
                      className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-[#F7931F]"
                    >
                      <FileCheck className="w-4 h-4 text-[#F7931F]" />
                      <span>Antecedentes & Documentación</span>
                      {opAntecedentesList.length > 0 && (
                        <span className="text-xs bg-[#F7931F] text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opAntecedentesList.length}
                        </span>
                      )}
                      {openSections.antecedentes ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
                    </button>

                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedOp.requiere_antecedentes ?? false}
                          onChange={async (e) => {
                            const checked = e.target.checked;
                            updateOportunidadField(selectedOp.id, 'requiere_antecedentes', checked);
                            if (checked) {
                              setOpenSections((prev) => ({ ...prev, antecedentes: true }));
                            }
                            if (isUUID(selectedOp.id)) {
                              await supabase
                                .from('oportunidades')
                                .update({ requiere_antecedentes: checked })
                                .eq('id', selectedOp.id);
                            }
                            await addOportunidadActividad(
                              selectedOp.id,
                              checked
                                ? 'Se marcó la oportunidad como: Requiere enviar antecedentes (contratos, anexos, docs empresa/trabajador).'
                                : 'Se desmarcó el requerimiento de antecedentes.'
                            );
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#F7931F]"></div>
                        <span className="ml-2 text-xs font-bold text-gray-300 capitalize">
                          {selectedOp.requiere_antecedentes ? 'Requiere Antecedentes' : 'Sin Antecedentes'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {openSections.antecedentes && (
                    <div className="p-5 space-y-4 animate-fadeIn text-xs">
                      {selectedOp.requiere_antecedentes ? (
                        <div className="space-y-4">
                          {/* Formulario de Carga */}
                          <div className="bg-[#1c1c1f] p-4 rounded-2xl border border-gray-800 space-y-3">
                            <h5 className="font-extrabold text-white flex items-center gap-2">
                              <Plus className="w-4 h-4 text-[#F7931F]" />
                              <span>Adjuntar Nuevo Antecedente</span>
                            </h5>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-gray-400 font-bold text-[11px] mb-1">
                                  Tipo de Documento *
                                </label>
                                <select
                                  value={nuevoAntecedenteTipo}
                                  onChange={(e) => setNuevoAntecedenteTipo(e.target.value as TipoAntecedenteDocumento)}
                                  className="w-full bg-[#27272a] border border-gray-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-[#F7931F]"
                                >
                                  <option value="contrato">Contrato de Prestación</option>
                                  <option value="anexo">Anexo de Contrato</option>
                                  <option value="documento_empresa">Documento Empresa (RUT, Certificados)</option>
                                  <option value="documento_trabajador">Documento Trabajador (EPP, Mutual, Cédula)</option>
                                  <option value="otro">Otro Documento</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-gray-400 font-bold text-[11px] mb-1">
                                  Nombre / Descripción Documento
                                </label>
                                <input
                                  type="text"
                                  placeholder="Ej: Contrato Marco 2026 / Nómina Cuadrilla"
                                  value={nuevoAntecedenteNombre}
                                  onChange={(e) => setNuevoAntecedenteNombre(e.target.value)}
                                  className="w-full bg-[#27272a] border border-gray-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-[#F7931F]"
                                />
                              </div>

                              <div>
                                <label className="block text-gray-400 font-bold text-[11px] mb-1">
                                  Archivo (PDF, Imagen, Doc) *
                                </label>
                                <input
                                  type="file"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0] || null;
                                    setNuevoAntecedenteFile(f);
                                    if (f && !nuevoAntecedenteNombre) {
                                      setNuevoAntecedenteNombre(f.name);
                                    }
                                  }}
                                  className="w-full text-xs text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gray-800 file:text-[#F7931F] hover:file:bg-gray-700 cursor-pointer"
                                />
                              </div>
                            </div>

                            {antecedenteErrorMsg && (
                              <p className="text-red-400 font-bold text-xs">{antecedenteErrorMsg}</p>
                            )}

                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                disabled={antecedenteUploading || !nuevoAntecedenteFile}
                                onClick={handleUploadAntecedente}
                                className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>{antecedenteUploading ? 'Subiendo Documento...' : 'Adjuntar Documento'}</span>
                              </button>
                            </div>
                          </div>

                          {/* Listado de Antecedentes */}
                          <div className="space-y-2">
                            <h5 className="font-extrabold text-white text-xs">Documentos Adjuntos ({opAntecedentesList.length}):</h5>
                            {opAntecedentesList.length === 0 ? (
                              <div className="p-4 text-center text-gray-500 bg-[#1c1c1f] rounded-xl border border-gray-800">
                                No se han adjuntado documentos de antecedentes todavía.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {opAntecedentesList.map((doc) => {
                                  const tipoLabels: Record<TipoAntecedenteDocumento, { label: string; color: string }> = {
                                    contrato: { label: 'Contrato', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                                    anexo: { label: 'Anexo', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
                                    documento_empresa: { label: 'Doc. Empresa', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
                                    documento_trabajador: { label: 'Doc. Trabajador', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
                                    otro: { label: 'Otro', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
                                  };
                                  const tipoConfig = tipoLabels[doc.tipo] || tipoLabels.otro;

                                  return (
                                    <div
                                      key={doc.id}
                                      className="bg-[#27272a] p-3 rounded-xl border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    >
                                      <div className="flex items-center gap-3">
                                        <FileCheck className="w-5 h-5 text-[#F7931F] shrink-0" />
                                        <div>
                                          <div className="flex items-center gap-2">
                                            <span className="font-extrabold text-white text-xs">{doc.nombre}</span>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${tipoConfig.color}`}>
                                              {tipoConfig.label}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-gray-400 mt-0.5">
                                            <span>Subido por: {doc.subido_por || 'Usuario'}</span>
                                            {doc.fecha_iso && (
                                              <span className="ml-2 text-gray-500 font-mono">
                                                {new Date(doc.fecha_iso).toLocaleDateString('es-CL')}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <a
                                          href={doc.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-3 py-1.5 bg-[#18181b] hover:bg-orange-500/20 text-[#F7931F] rounded-xl font-bold border border-gray-700 transition text-xs flex items-center gap-1"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Ver / Descargar</span>
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteAntecedente(doc.id)}
                                          className="p-1.5 bg-[#18181b] hover:bg-red-500/20 text-red-400 rounded-xl border border-gray-700 transition"
                                          title="Eliminar Antecedente"
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
                        </div>
                      ) : (
                        <div className="p-4 text-center text-gray-400 bg-[#1c1c1f] rounded-2xl border border-gray-800">
                          Esta oportunidad está marcada como <strong>Sin Antecedentes exigidos</strong>. Activa la casilla arriba si el cliente solicita envío de contratos, anexos o documentación técnica de trabajadores.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 4: Visita a Terreno */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <div className="w-full p-3.5 bg-[#27272a] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                      className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-[#F7931F]"
                    >
                      <Calendar className="w-4 h-4 text-[#F7931F]" />
                      <span>Visita a Terreno</span>
                      {opVisitasList.length > 0 && (
                        <span className="text-xs bg-[#F7931F] text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opVisitasList.length}
                        </span>
                      )}
                      {openSections.visita ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
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
                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#F7931F]"></div>
                        <span className="ml-2 text-xs font-bold text-gray-200 capitalize tracking-normal">
                          {selectedOp.requiere_visita_terreno ? 'Habilitado' : 'No Requiere'}
                        </span>
                      </label>
                      {selectedOp.requiere_visita_terreno && (
                        <Link
                          href={`/visitas?opId=${selectedOp.id}`}
                          className="text-[11px] bg-[#F7931F] hover:bg-[#e08316] text-white px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 transition lowercase tracking-normal"
                        >
                          <span>Ver en Calendario</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {openSections.visita && selectedOp.requiere_visita_terreno && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      {/* Botón para agregar una nueva visita */}
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                        <span className="font-bold text-white text-xs">Visitas Programadas para este Proyecto:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddVisitaForm(!showAddVisitaForm);
                            if (!newVisitaFecha) {
                              setNewVisitaFecha(new Date().toISOString().split('T')[0]);
                            }
                          }}
                          className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Visita a Terreno</span>
                        </button>
                      </div>

                      {/* Formulario Inline para Registrar Nueva Visita */}
                      {showAddVisitaForm && (
                        <div className="bg-[#27272a] p-4 rounded-2xl border border-[#F7931F]/40 space-y-3 animate-fadeIn">
                          <h4 className="font-extrabold text-white text-xs uppercase text-[#F7931F] flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Nueva Visita</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Responsable *</label>
                              <select
                                value={newVisitaTecnico}
                                onChange={(e) => setNewVisitaTecnico(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#F7931F]"
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
                              <label className="block font-bold text-gray-400 mb-1">Fecha de Visita *</label>
                              <input
                                type="date"
                                required
                                value={newVisitaFecha}
                                onChange={(e) => setNewVisitaFecha(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#F7931F]"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Hora de Visita</label>
                              <input
                                type="time"
                                value={newVisitaHora}
                                onChange={(e) => setNewVisitaHora(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#F7931F]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Estado Inicial</label>
                              <select
                                value={newVisitaEstado}
                                onChange={(e) => setNewVisitaEstado(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-[#F7931F]"
                              >
                                <option value="programada">Programada</option>
                                <option value="realizada">Realizada</option>
                                <option value="cancelada">Cancelada</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: Medir acceso y toma de plantilla..."
                                value={newVisitaNotas}
                                onChange={(e) => setNewVisitaNotas(e.target.value)}
                                className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#F7931F]"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                            <button
                              type="button"
                              onClick={() => setShowAddVisitaForm(false)}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl font-bold transition"
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
                              className="px-4 py-1.5 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-sm"
                            >
                              Guardar Visita
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lista de Visitas Registradas */}
                      {opVisitasList.length === 0 ? (
                        <div className="py-4 text-center text-gray-500 italic text-xs bg-[#27272a]/50 rounded-2xl border border-gray-800">
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
                                  className="bg-[#27272a] p-4 rounded-2xl border border-[#F7931F]/50 space-y-3 animate-fadeIn"
                                >
                                  <h4 className="font-extrabold text-white text-xs uppercase text-[#F7931F] flex items-center gap-1.5">
                                    <Edit className="w-4 h-4" />
                                    <span>Editar Visita a Terreno</span>
                                  </h4>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block font-bold text-gray-400 mb-1">Responsable</label>
                                      <select
                                        value={editVisitaTecnico}
                                        onChange={(e) => setEditVisitaTecnico(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#F7931F]"
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
                                      <label className="block font-bold text-gray-400 mb-1">Fecha</label>
                                      <input
                                        type="date"
                                        value={editVisitaFecha}
                                        onChange={(e) => setEditVisitaFecha(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#F7931F]"
                                      />
                                    </div>

                                    <div>
                                      <label className="block font-bold text-gray-400 mb-1">Hora</label>
                                      <input
                                        type="time"
                                        value={editVisitaHora}
                                        onChange={(e) => setEditVisitaHora(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#F7931F]"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block font-bold text-gray-400 mb-1">Estado</label>
                                      <select
                                        value={editVisitaEstado}
                                        onChange={(e) => setEditVisitaEstado(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-[#F7931F]"
                                      >
                                        <option value="programada">Programada</option>
                                        <option value="realizada">Realizada</option>
                                        <option value="cancelada">Cancelada</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block font-bold text-gray-400 mb-1">Notas / Observaciones</label>
                                      <input
                                        type="text"
                                        value={editVisitaNotas}
                                        onChange={(e) => setEditVisitaNotas(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#F7931F]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                                    <button
                                      type="button"
                                      onClick={() => setEditingVisitaId(null)}
                                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl font-bold transition text-xs"
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
                                      className="px-4 py-1.5 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-sm text-xs"
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
                                className="bg-[#27272a] p-3.5 rounded-2xl border border-gray-800 flex flex-col gap-3 hover:border-gray-700 transition"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-md bg-orange-950 text-orange-300 border border-orange-800">
                                      {responsableNombre}
                                    </span>

                                    <span className="text-[11px] font-black px-2 py-1 rounded-md border bg-[#18181b] text-gray-300 border-gray-700">
                                      Visitas a terreno
                                    </span>

                                    <span
                                      className={`text-[11px] font-extrabold px-2 py-1 rounded-md border ${
                                        vis.estado_visita === 'realizada'
                                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                          : vis.estado_visita === 'cancelada'
                                          ? 'bg-red-950 text-red-300 border-red-800'
                                          : 'bg-amber-950 text-amber-300 border-amber-800'
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
                                      className="p-1.5 bg-[#18181b] hover:bg-blue-600/30 text-blue-400 rounded-lg transition border border-gray-700"
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
                                      className="p-1.5 bg-[#18181b] hover:bg-red-600/30 text-red-400 rounded-lg transition border border-gray-700"
                                      title="Eliminar Visita"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <strong className="text-white text-sm block">Visita a terreno</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300 font-bold">
                                    <span className="font-mono flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5 text-[#F7931F]" />
                                      {vis.fecha_visita_terreno}
                                    </span>

                                    <span className="font-mono flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                                      {vis.hora_visita_terreno || '09:00'} hrs
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-400 font-semibold">
                                    {[selectedOp.codigo, selectedOp.cliente?.nombre].filter(Boolean).join(' · ')}
                                  </div>

                                  {vis.observaciones_visita && (
                                    <p className="text-gray-400 text-xs pt-1">
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

            {/* Banner & Acordeón de Producción y Logística */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAreaExpanded((prev) => ({ ...prev, produccion: !prev.produccion }))}
                className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] border border-purple-500/40 rounded-2xl flex items-center justify-between font-black text-sm sm:text-base uppercase tracking-wide text-purple-400 transition shadow-md cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Factory className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span>Producción y Logística</span>
                </div>
                <div className="flex items-center gap-2">
                  {areaExpanded.produccion ? (
                    <ChevronUp className="w-5 h-5 text-purple-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-purple-400" />
                  )}
                </div>
              </button>

              {areaExpanded.produccion && (
                <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-purple-500/40 space-y-3.5 my-2.5 animate-fadeIn relative">
                  <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                    <div className="w-full p-3.5 bg-[#27272a] text-purple-400 font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionEventos: !openSections.produccionEventos })}
                        className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-purple-400"
                      >
                        <Calendar className="w-4 h-4 text-purple-400" />
                        <span>Eventos de Producción y Logística</span>
                        {produccionEventos.length > 0 && (
                          <span className="text-xs bg-purple-600 text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {produccionEventos.length}
                          </span>
                        )}
                        {openSections.produccionEventos ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={produccionEventosEnabled}
                            onChange={(e) => setProduccionEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
                          <span className="ml-2 text-xs font-bold text-gray-200 capitalize tracking-normal">
                            {produccionEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {produccionEventosEnabled && (
                          <Link
                            href={`/planificacion/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>

                    </div>

                    {openSections.produccionEventos && produccionEventosEnabled && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                        <span className="font-bold text-white text-xs">Eventos registrados para esta oportunidad:</span>
                        <button
                          type="button"
                          onClick={() => {
                            resetProdLogForm('produccion_logistica', 'produccion');
                            setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'produccion_logistica');
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Evento</span>
                        </button>
                      </div>

                      {showAddProdLogEventForm && newProdLogContexto === 'produccion_logistica' && (
                        <div className="bg-[#27272a] p-4 rounded-2xl border border-purple-500/40 space-y-3 animate-fadeIn">
                          <h4 className="font-extrabold text-white text-xs uppercase text-purple-400 flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Evento</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Tipo de evento *</label>
                              <select
                                value={newProdLogTipo}
                                onChange={(e) => {
                                  const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                  setNewProdLogTipo(nextTipo);
                                }}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-purple-400"
                              >
                                <option value="obra">Obra</option>
                                <option value="logistica">Logística</option>
                                <option value="produccion">Producción</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Fecha *</label>
                              <input
                                type="date"
                                required
                                value={newProdLogFecha}
                                onChange={(e) => setNewProdLogFecha(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-purple-400"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Hora</label>
                              <input
                                type="time"
                                value={newProdLogHora}
                                onChange={(e) => setNewProdLogHora(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-purple-400"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Título *</label>
                              <input
                                type="text"
                                value={newProdLogTitulo}
                                onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-3 py-1.5 font-bold focus:outline-none focus:border-purple-400"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-400 mb-1">Responsable</label>
                              <select
                                value={newProdLogResponsableId}
                                onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-purple-400"
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
                              <label className="block font-bold text-gray-400 mb-1">Estado Inicial</label>
                              <select
                                value={newProdLogEstado}
                                onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-purple-400"
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
                            <label className="block font-bold text-gray-400 mb-1">Notas / Instrucciones</label>
                            <input
                              type="text"
                              placeholder="Ej: coordinar retiro, despacho, fabricación o instalación..."
                              value={newProdLogNotas}
                              onChange={(e) => setNewProdLogNotas(e.target.value)}
                              className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-3 py-1.5 focus:outline-none focus:border-purple-400"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                            <button
                              type="button"
                              onClick={() => setShowAddProdLogEventForm(false)}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl font-bold transition"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveProdLogEvent('produccion_logistica')}
                              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-extrabold transition shadow-sm"
                            >
                              {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                            </button>
                          </div>
                        </div>
                      )}

                      {produccionEventos.length === 0 ? (
                        <div className="py-4 text-center text-gray-500 italic text-xs bg-[#27272a]/50 rounded-2xl border border-gray-800">
                          No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {produccionEventos.map((event) => {
                            const { fecha, hora } = getEventDateParts(event);

                            return (
                              <div
                                key={event.id}
                                className="bg-[#27272a] p-3.5 rounded-2xl border border-gray-800 flex flex-col gap-3 text-gray-200 hover:border-gray-700 transition shadow-sm"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-black uppercase tracking-wider text-[11px] px-2 py-1 rounded-md text-orange-300 bg-orange-950 border border-orange-800">
                                      {getResponsableEventoNombre(event)}
                                    </span>
                                    <span className={`text-[11px] font-black px-2 py-1 rounded-md border ${getProdLogTipoClasses(event.tipo_evento)}`}>
                                      {getProdLogTipoLabel(event.tipo_evento)}
                                    </span>
                                    <span className={`text-[11px] font-extrabold px-2 py-1 rounded-md border ${getProdLogEstadoClasses(event.estado)}`}>
                                      {getProdLogEstadoLabel(event.estado)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => startEditProdLogEvent(event)}
                                      className="p-1.5 bg-[#18181b] hover:bg-purple-600/30 text-purple-400 border border-gray-700 rounded-lg transition"
                                      title="Editar evento"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteProdLogEvent(event)}
                                      className="p-1.5 bg-[#18181b] hover:bg-red-600/30 text-red-400 border border-gray-700 rounded-lg transition"
                                      title="Eliminar evento"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <strong className="text-white text-sm block">{event.titulo}</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300 font-bold">
                                    <span className="font-mono flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                                      {fecha}
                                    </span>
                                    <span className="font-mono flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                                      {hora}
                                    </span>
                                  </div>
                                  {event.observaciones && (
                                    <span className="block text-xs text-gray-400">{event.observaciones}</span>
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
                      <div className="p-4 text-xs text-gray-400 bg-[#1e1e22]">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 2.2: Bitácora de Producción Diaria & Control de Stock de Obra (Ajustes 11 - Req 2) */}
                  <div className="hidden">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, produccionBitacora: !openSections.produccionBitacora })}
                      className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] text-purple-400 font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 text-left">
                        <HardHat className="w-4 h-4 text-purple-400" />
                        <span>Bitácora de Producción Diaria & Stock de Obra</span>
                        <span className="text-xs text-purple-300 font-mono font-bold">
                          {opProduccionDiaria.length} {opProduccionDiaria.length === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>
                      {openSections.produccionBitacora ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                    </button>

                    {openSections.produccionBitacora && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      {/* Tabla de Comparación contra Ítems Cotizados */}
                      <div>
                        <h5 className="font-extrabold text-gray-200 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-400" />
                          <span>Control de Avance vs Cotización</span>
                        </h5>

                        {cotizacionItemsOp.length === 0 ? (
                          <div className="p-3 bg-[#18181b] rounded-lg text-gray-400 text-center italic border border-gray-800">
                            No hay ítems de cotización registrados para contrastar el avance.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-gray-800">
                            <table className="w-full text-left text-xs bg-[#18181b]">
                              <thead className="bg-[#27272a] text-gray-400 font-bold uppercase text-[10px] border-b border-gray-800">
                                <tr>
                                  <th className="py-2.5 px-3">Producto / Ítem</th>
                                  <th className="py-2.5 px-3 text-center">Cant. Cotizada</th>
                                  <th className="py-2.5 px-3 text-center">Fabricado</th>
                                  <th className="py-2.5 px-3 text-center">Saldo Pendiente</th>
                                  <th className="py-2.5 px-3 text-center">Avance</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800">
                                {cotizacionItemsOp.map((item, idx) => {
                                  const cotizada = Number(item.cantidad) || 0;
                                  const fabricado = opProduccionDiaria
                                    .filter((p) => p.producto?.toLowerCase().trim() === item.producto?.toLowerCase().trim())
                                    .reduce((sum, p) => sum + Number(p.cantidad_producida || 0), 0);
                                  const saldo = Math.max(0, cotizada - fabricado);
                                  const pct = cotizada > 0 ? Math.min(100, Math.round((fabricado / cotizada) * 100)) : 100;

                                  return (
                                    <tr key={item.id || idx} className="hover:bg-white/5">
                                      <td className="py-2.5 px-3 font-bold text-white">
                                        {item.producto}
                                        {item.descripcion && (
                                          <span className="block text-[10px] text-gray-400 font-normal">{item.descripcion}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-300">
                                        {cotizada}
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-purple-400">
                                        {fabricado}
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono font-bold text-purple-300">
                                        {saldo}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          <div className="w-16 bg-gray-800 h-2 overflow-hidden border border-gray-700">
                                            <div
                                              className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-purple-500'}`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className="font-mono text-[10px] font-bold text-gray-300">{pct}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Formulario para Registrar Producción Diaria */}
                      <form onSubmit={handleRegisterProduccionDiaria} className="p-3.5 bg-[#18181b] rounded-lg border border-gray-800 space-y-3">
                        <h5 className="font-extrabold text-white text-xs uppercase text-purple-400 flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          <span>Registrar Tanda de Fabricación Diaria</span>
                        </h5>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block font-bold text-gray-400 mb-1">Producto Fabricado *</label>
                            {cotizacionItemsOp.length > 0 ? (
                              <select
                                required
                                value={newProdProducto}
                                onChange={(e) => setNewProdProducto(e.target.value)}
                                className="w-full bg-[#27272a] text-white border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-purple-400"
                              >
                                <option value="">-- Seleccionar Producto --</option>
                                {cotizacionItemsOp.map((it, idx) => (
                                  <option key={it.id || idx} value={it.producto}>
                                    {it.producto} ({it.cantidad} cotizados)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                required
                                placeholder="Ej. Pastelón 50x50 Gris"
                                value={newProdProducto}
                                onChange={(e) => setNewProdProducto(e.target.value)}
                                className="w-full bg-[#27272a] text-white border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block font-bold text-gray-400 mb-1">Cantidad Producida *</label>
                            <input
                              type="number"
                              required
                              min={1}
                              step={1}
                              value={newProdCantidad || ''}
                              onChange={(e) => setNewProdCantidad(Number(e.target.value))}
                              placeholder="Ej. 25"
                              className="w-full bg-[#27272a] text-white font-mono border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-gray-400 mb-1">Fecha de Fabricación</label>
                            <input
                              type="date"
                              value={newProdFecha}
                              onChange={(e) => setNewProdFecha(e.target.value)}
                              className="w-full bg-[#27272a] text-white font-mono border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-gray-400 mb-1">Encargado / Responsable</label>
                            <select
                              value={newProdResponsableId}
                              onChange={(e) => setNewProdResponsableId(e.target.value)}
                              className="w-full bg-[#27272a] text-gray-200 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-purple-400"
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
                            <label className="block font-bold text-gray-400 mb-1">Observaciones / Lote</label>
                            <input
                              type="text"
                              placeholder="Lote #, detalle de mezcla, fraguado..."
                              value={newProdObservaciones}
                              onChange={(e) => setNewProdObservaciones(e.target.value)}
                              className="w-full bg-[#27272a] text-white border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-400"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold px-4 py-1.5 rounded-lg transition text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Registrar Tanda</span>
                          </button>
                        </div>
                      </form>

                      {/* Historial de Fabricación Diaria */}
                      {opProduccionDiaria.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <h6 className="font-extrabold text-gray-400 text-[11px] uppercase tracking-wider">Historial de Tandas Registradas</h6>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {opProduccionDiaria.map((prod) => (
                              <div
                                key={prod.id}
                                className="p-2.5 bg-[#18181b] rounded-lg border border-gray-800 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="font-mono text-purple-400 font-bold bg-purple-950/60 px-2 py-0.5 border border-purple-800/40">
                                    +{prod.cantidad_producida} un.
                                  </span>
                                  <div>
                                    <strong className="text-white">{prod.producto}</strong>
                                    {prod.observaciones && <span className="text-gray-400 block text-[10px]">{prod.observaciones}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-gray-400 font-mono text-[11px]">
                                  {prod.responsable && <span>👤 {prod.responsable.nombre}</span>}
                                  <span>{prod.fecha_produccion}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                  {/* Accordion 2.3: Órdenes de Compra (OC) en Producción (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('prod_') && (
                  <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                    <div className="w-full p-3.5 bg-[#27272a] text-purple-400 font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionOc: !openSections.produccionOc })}
                        className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-purple-400"
                      >
                        <ShoppingCart className="w-4 h-4 text-purple-400" />
                        <span>Órdenes de Compra (OC) — Insumos de Fabricación</span>
                        <span className="text-xs text-purple-300 font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.produccionOc ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.produccionOc && (
                    <div className="p-4 space-y-3 text-xs bg-[#1e1e22]">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-gray-400">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-[#18181b] rounded-lg text-gray-400 text-center italic border border-gray-800">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-800">
                          <table className="w-full text-left text-xs bg-[#18181b]">
                            <thead className="bg-[#27272a] text-gray-400 font-bold uppercase text-[10px] border-b border-gray-800">
                              <tr>
	                                <th className="py-2.5 px-3">Folio OC</th>
	                                <th className="py-2.5 px-3 text-center">Version</th>
	                                <th className="py-2.5 px-3">Proveedor</th>
                                <th className="py-2.5 px-3 text-center">Fecha</th>
                                <th className="py-2.5 px-3 text-right">Total</th>
                                <th className="py-2.5 px-3 text-center">Estado</th>
                                <th className="py-2.5 px-3 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-white/5">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-purple-300">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-gray-300">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-white">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-gray-300">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                                    ${(oc.monto_total || 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#27272a] text-purple-300 border border-gray-700">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-[#27272a] hover:bg-purple-600 text-white rounded-lg transition border border-gray-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
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

            {/* Banner & Acordeón de Sección 3: Reventa y Logística (Ajustes 11) */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setAreaExpanded((prev) => ({ ...prev, reventa: !prev.reventa }))}
                className="w-full p-3.5 bg-[#27272a] hover:bg-[#323236] border border-indigo-500/40 rounded-2xl flex items-center justify-between font-black text-sm sm:text-base uppercase tracking-wide text-indigo-400 transition shadow-md cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span>Reventa y Logística</span>
                </div>
                <div className="flex items-center gap-2">
                  {areaExpanded.reventa ? (
                    <ChevronUp className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
              </button>

              {areaExpanded.reventa && (
                <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-indigo-500/40 space-y-3.5 my-2.5 animate-fadeIn relative">
                  <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                    <div className="w-full p-3.5 bg-[#27272a] text-indigo-400 font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaEventos: !openSections.reventaEventos })}
                        className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-indigo-400"
                      >
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        <span>Eventos de Reventa y Logística</span>
                        {reventaEventos.length > 0 && (
                          <span className="text-xs bg-indigo-600 text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {reventaEventos.length}
                          </span>
                        )}
                        {openSections.reventaEventos ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reventaEventosEnabled}
                            onChange={(e) => setReventaEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                          <span className="ml-2 text-xs font-bold text-gray-200 capitalize tracking-normal">
                            {reventaEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {reventaEventosEnabled && (
                          <Link
                            href={`/reventa/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    {openSections.reventaEventos && reventaEventosEnabled && (
                      <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                          <span className="font-bold text-white text-xs">Eventos registrados para esta oportunidad:</span>
                          <button
                            type="button"
                            onClick={() => {
                              resetProdLogForm('reventa_logistica', 'reventa');
                              setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'reventa_logistica');
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Agregar Evento</span>
                          </button>
                        </div>

                        {showAddProdLogEventForm && newProdLogContexto === 'reventa_logistica' && (
                          <div className="bg-[#27272a] p-4 rounded-2xl border border-indigo-500/40 space-y-3 animate-fadeIn">
                            <h4 className="font-extrabold text-white text-xs uppercase text-indigo-400 flex items-center gap-1.5">
                              <Plus className="w-4 h-4" />
                              <span>Registrar Evento</span>
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-gray-400 mb-1">Tipo de evento *</label>
                                <select
                                  value={newProdLogTipo}
                                  onChange={(e) => {
                                    const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                    setNewProdLogTipo(nextTipo);
                                  }}
                                  className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-400"
                                >
                                  <option value="logistica">Logística</option>
                                  <option value="reventa">Reventa</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-bold text-gray-400 mb-1">Fecha *</label>
                                <input
                                  type="date"
                                  required
                                  value={newProdLogFecha}
                                  onChange={(e) => setNewProdLogFecha(e.target.value)}
                                  className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-400"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-gray-400 mb-1">Hora</label>
                                <input
                                  type="time"
                                  value={newProdLogHora}
                                  onChange={(e) => setNewProdLogHora(e.target.value)}
                                  className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-400"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-gray-400 mb-1">Título *</label>
                                <input
                                  type="text"
                                  value={newProdLogTitulo}
                                  onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                  className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-3 py-1.5 font-bold focus:outline-none focus:border-indigo-400"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-gray-400 mb-1">Responsable</label>
                                <select
                                  value={newProdLogResponsableId}
                                  onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                  className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-400"
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
                                <label className="block font-bold text-gray-400 mb-1">Estado Inicial</label>
                                <select
                                  value={newProdLogEstado}
                                  onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                  className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-indigo-400"
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
                              <label className="block font-bold text-gray-400 mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: coordinar proveedor, retiro, despacho o entrega..."
                                value={newProdLogNotas}
                                onChange={(e) => setNewProdLogNotas(e.target.value)}
                                className="w-full bg-[#1e1e22] text-gray-200 border border-gray-700 rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-400"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
                              <button
                                type="button"
                                onClick={() => setShowAddProdLogEventForm(false)}
                                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-xl font-bold transition"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => saveProdLogEvent('reventa_logistica')}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold transition shadow-sm"
                              >
                                {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                              </button>
                            </div>
                          </div>
                        )}

                        {reventaEventos.length === 0 ? (
                          <div className="py-4 text-center text-gray-500 italic text-xs bg-[#27272a]/50 rounded-2xl border border-gray-800">
                            No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {reventaEventos.map((event) => {
                              const { fecha, hora } = getEventDateParts(event);

                              return (
                                <div
                                  key={event.id}
                                  className="bg-[#27272a] p-3.5 rounded-2xl border border-gray-800 flex flex-col gap-3 text-gray-200 hover:border-gray-700 transition shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-black uppercase tracking-wider text-[11px] px-2 py-1 rounded-md text-orange-300 bg-orange-950 border border-orange-800">
                                        {getResponsableEventoNombre(event)}
                                      </span>
                                      <span className={`text-[11px] font-black px-2 py-1 rounded-md border ${getProdLogTipoClasses(event.tipo_evento)}`}>
                                        {getProdLogTipoLabel(event.tipo_evento)}
                                      </span>
                                      <span className={`text-[11px] font-extrabold px-2 py-1 rounded-md border ${getProdLogEstadoClasses(event.estado)}`}>
                                        {getProdLogEstadoLabel(event.estado)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => startEditProdLogEvent(event)}
                                        className="p-1.5 bg-[#18181b] hover:bg-indigo-600/30 text-indigo-400 border border-gray-700 rounded-lg transition"
                                        title="Editar evento"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteProdLogEvent(event)}
                                        className="p-1.5 bg-[#18181b] hover:bg-red-600/30 text-red-400 border border-gray-700 rounded-lg transition"
                                        title="Eliminar evento"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <strong className="text-white text-sm block">{event.titulo}</strong>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300 font-bold">
                                      <span className="font-mono flex items-center gap-1">
                                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                        {fecha}
                                      </span>
                                      <span className="font-mono flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                                        {hora}
                                      </span>
                                    </div>
                                    {event.observaciones && (
                                      <span className="block text-xs text-gray-400">{event.observaciones}</span>
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
                      <div className="p-4 text-xs text-gray-400 bg-[#1e1e22]">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 3.2: Órdenes de Compra (OC) en Reventa (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('rev_') && (
                  <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                    <div className="w-full p-3.5 bg-[#27272a] text-indigo-400 font-extrabold text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaOc: !openSections.reventaOc })}
                        className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-xs uppercase tracking-wider text-indigo-400"
                      >
                        <ShoppingCart className="w-4 h-4 text-indigo-400" />
                        <span>Órdenes de Compra a Proveedores / Distribución</span>
                        <span className="text-xs text-indigo-300 font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.reventaOc ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.reventaOc && (
                    <div className="p-4 space-y-3 text-xs bg-[#1e1e22]">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-gray-400">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-[#18181b] rounded-lg text-gray-400 text-center italic border border-gray-800">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-800">
                          <table className="w-full text-left text-xs bg-[#18181b]">
                            <thead className="bg-[#27272a] text-gray-400 font-bold uppercase text-[10px] border-b border-gray-800">
                              <tr>
	                                <th className="py-2.5 px-3">Folio OC</th>
	                                <th className="py-2.5 px-3 text-center">Version</th>
	                                <th className="py-2.5 px-3">Proveedor</th>
                                <th className="py-2.5 px-3 text-center">Fecha</th>
                                <th className="py-2.5 px-3 text-right">Total</th>
                                <th className="py-2.5 px-3 text-center">Estado</th>
                                <th className="py-2.5 px-3 text-center">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-white/5">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-indigo-300">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-gray-300">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-white">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-gray-300">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                                    ${(oc.monto_total || 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#27272a] text-indigo-300 border border-gray-700">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-[#27272a] hover:bg-indigo-600 text-white rounded-lg transition border border-gray-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
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
              </div>
            </div>

            {/* Separador Vertical Resizable (Barra para arrastrar y cambiar ancho) */}
            <div
              onMouseDown={handleMouseDownModalResizer}
              className="hidden lg:flex w-4 hover:w-4 bg-transparent hover:bg-amber-500/20 active:bg-amber-500/30 cursor-col-resize select-none items-center justify-center group z-20 relative mx-1 transition-all rounded-full shrink-0"
              title="Arrastrar para ajustar el ancho entre Información y Actividad (Tu configuración se guardará automáticamente)"
            >
              <div className="w-1.5 h-14 rounded-full bg-gray-700 group-hover:bg-[#F7931F] group-active:bg-[#F7931F] transition-colors shadow-sm" />
            </div>

            {/* Columna Derecha: Feed de Actividades (Ancho Resizable) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - modalLeftColRatio}%` : '100%' }}
              className="flex-1 bg-[#222226] rounded-2xl border border-gray-800 p-4 sm:p-5 flex flex-col justify-between h-full overflow-hidden shadow-xl shrink-0"
            >
              <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
                {/* Header de Actividad con Título e Íconos ClickUp */}
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-black text-base sm:text-lg text-white uppercase tracking-wider flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-[#F7931F]" />
                      <span>Actividad</span>
                    </h3>
                    <span className="text-xs bg-[#18181b] text-gray-300 font-bold px-2.5 py-0.5 rounded-full border border-gray-700 font-mono">
                      {(selectedOp.chat_interno || []).length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Cerrar Modal */}
                    <button
                      onClick={handleCloseOportunidad}
                      className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition font-bold text-lg leading-none ml-1"
                      title="Cerrar Modal"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Barra de Filtros de Actividad (Todos / Comentarios / Acciones / Reclamos) */}
                <div className="flex items-center gap-1.5 p-1 bg-[#18181b] rounded-xl border border-gray-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActivityFilter('all')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'all'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('comentarios')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'comentarios'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>Comentarios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('sistema')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'sistema'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>Acciones</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('reclamos')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'reclamos'
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'text-red-400 hover:text-white hover:bg-red-500/10'
                    }`}
                  >
                    <span>Reclamos</span>
                  </button>
                </div>

                {/* Input de Búsqueda Flotante de Actividad */}
                {showActivitySearch && (
                  <div className="animate-fadeIn">
                    <input
                      type="text"
                      placeholder="Filtrar mensajes o cambios..."
                      value={activitySearchQuery}
                      onChange={(e) => setActivitySearchQuery(e.target.value)}
                      className="w-full bg-[#18181b] text-white border border-gray-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#F7931F]"
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
                        (m) => (m.tipo === 'comentario' || (!m.tipo && !m.contenido?.startsWith('['))) && m.tipo !== 'reclamo'
                      );
                    } else if (activityFilter === 'sistema') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo !== 'comentario' && m.tipo !== 'reclamo' && (m.tipo || m.contenido?.startsWith('['))
                      );
                    } else if (activityFilter === 'reclamos') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo === 'reclamo'
                      );
                    }

                    // Ordenar por fecha ascendente (lo más antiguo arriba, lo más reciente abajo)
                    const sortedList = [...filteredList].sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    );

                    if (sortedList.length === 0) {
                      return (
                        <div className="text-center py-14 text-gray-400 italic text-xs space-y-2">
                          <MessageSquare className="w-10 h-10 text-gray-600 mx-auto opacity-40" />
                          <p className="font-semibold text-gray-300">No hay actividades registradas.</p>
                          <p className="text-[11px] text-gray-500">
                            Escribe un comentario abajo usando @ para mencionar a un integrante. El historial se guarda automáticamente.
                          </p>
                        </div>
                      );
                    }

                    return sortedList.map((msg) => {
                      const isReclamoMsg = msg.tipo === 'reclamo';
                      const isUserComment =
                        msg.tipo === 'comentario' ||
                        isReclamoMsg ||
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
                        // Tarjeta de Comentario de Usuario (Estilo ClickUp de tus Imágenes)
                        return (
                          <div
                            key={msg.id}
                            className={`p-4 rounded-2xl border shadow-md space-y-3 transition ${
                              isReclamoMsg
                                ? 'bg-red-950/25 border-red-500/50 hover:border-red-400'
                                : 'bg-[#1c1c1f] border-gray-800/80 hover:border-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full font-black text-xs flex items-center justify-center border shrink-0 ${
                                    isReclamoMsg
                                      ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                      : 'bg-[#F7931F]/20 text-[#F7931F] border-[#F7931F]/40'
                                  }`}
                                >
                                  {isReclamoMsg ? (
                                    <AlertTriangle className="w-4 h-4 text-red-400" />
                                  ) : (
                                    <User className="w-4 h-4 text-[#F7931F]" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-white text-sm block leading-none">
                                      {msg.usuario_nombre}
                                    </span>
                                    {isReclamoMsg && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-500/20 text-red-400 border border-red-500/40">
                                        Reclamo / Postventa
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <span className="text-gray-400 text-xs font-mono">
                                {formattedDate} {formattedTime}
                              </span>
                            </div>

                            <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                              {renderMessageContentWithMentions(msg.contenido)}
                            </p>

                            <div className="flex items-center justify-end pt-2 border-t border-gray-800 text-xs">
                              <button
                                type="button"
                                onClick={() => setChatInput(`@${msg.usuario_nombre} `)}
                                className="font-bold text-gray-300 hover:text-[#F7931F] transition flex items-center gap-1"
                              >
                                <Reply className="w-3.5 h-3.5" />
                                <span>Respuesta</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Evento / Actualización de Sistema (Estilo Viñetas Limpias de tus Imágenes)
                      return (
                        <div
                          key={msg.id}
                          className="flex items-start gap-2.5 py-2 px-3 rounded-xl hover:bg-white/5 transition text-xs sm:text-sm"
                        >
                          <span className="text-[#F7931F] font-bold text-base select-none shrink-0">•</span>
                          <div className="flex-1 flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-gray-300">
                              <strong className="text-white font-bold">{msg.usuario_nombre}</strong>{' '}
                              <span className="text-gray-300 ml-1">{msg.contenido}</span>
                            </span>
                            <span className="text-gray-500 text-xs font-mono shrink-0 ml-auto">
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
                  <div className="flex justify-end -mt-8 mb-2 mr-2 relative z-10 pointer-events-auto animate-fadeIn">
                    <button
                      type="button"
                      onClick={scrollToBottomActivity}
                      className="bg-[#F7931F] hover:bg-[#e08316] text-white px-3 py-1.5 rounded-full shadow-lg transition flex items-center gap-1.5 text-xs font-black border border-white/20 active:scale-95"
                      title="Ir a la actividad más reciente"
                    >
                      <span>Ir a la más reciente</span>
                      <ChevronDown className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Input de Comentarios en el Fondo del Panel Lateral (Estilo ClickUp con Barra de Botones) */}
              <div className="pt-3 border-t border-gray-800 relative text-sm" ref={mentionRef}>
                {mentionMenuOpen && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-3 left-0 right-0 bg-[#27272a] border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                    <div className="p-2.5 bg-[#18181b] text-gray-400 font-bold text-xs uppercase tracking-wider border-b border-gray-700 flex justify-between items-center">
                      <span>Mencionar integrante:</span>
                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(false)}
                        className="text-gray-400 hover:text-white font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-700/50">
                      {filteredMentionUsers.map((usr, idx) => (
                        <button
                          key={usr.id}
                          type="button"
                          onClick={() => handleInsertMention(usr.nombre)}
                          className={`w-full text-left px-3.5 py-2.5 text-xs transition flex items-center justify-between ${
                            idx === selectedMentionIndex ? 'bg-[#F7931F] text-white' : 'text-gray-200 hover:bg-[#F7931F]/30'
                          }`}
                        >
                          <span className="font-bold">{usr.nombre}</span>
                          <span className="text-[10px] opacity-80 uppercase font-mono">{usr.rol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-[#18181b] border border-gray-700/80 focus-within:border-[#F7931F] rounded-2xl p-3 shadow-inner space-y-2 transition">
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
                    className="w-full bg-transparent text-white font-medium text-sm focus:outline-none placeholder-gray-500 min-h-[50px] resize-none"
                  />

                  {/* Barra Inferior de Herramientas del Comentario (Barra de Íconos de tus Imágenes) */}
                  <div className="flex items-center justify-between border-t border-gray-800/80 pt-2">
                    <div className="flex items-center gap-2 text-gray-400">
                      <label className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition cursor-pointer" title="Adjuntar archivo">
                        <Plus className="w-4 h-4" />
                        <input type="file" className="hidden" onChange={(e) => handleRealFileUpload(e)} />
                      </label>

                      <label className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition cursor-pointer" title="Adjuntar documento">
                        <Paperclip className="w-4 h-4" />
                        <input type="file" className="hidden" onChange={(e) => handleRealFileUpload(e)} />
                      </label>

                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(!mentionMenuOpen)}
                        className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition"
                        title="Mencionar a alguien"
                      >
                        <AtSign className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsReclamoMode(!isReclamoMode)}
                        className={`px-2.5 py-1 rounded-xl transition flex items-center gap-1 text-xs font-black ${
                          isReclamoMode
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'text-gray-400 hover:text-red-400 hover:bg-white/5'
                        }`}
                        title="Marcar este mensaje como Reclamo / Postventa"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{isReclamoMode ? 'Modo Reclamo' : 'Reclamo'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendChatMessage}
                      className={`${
                        isReclamoMode ? 'bg-red-500 hover:bg-red-600' : 'bg-[#F7931F] hover:bg-[#e08316]'
                      } text-white p-2.5 rounded-xl transition flex items-center justify-center shadow-md shrink-0`}
                      title={isReclamoMode ? 'Registrar Reclamo' : 'Enviar comentario'}
                    >
                      <Send className="w-4 h-4" />
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
            setSelectedOp((prev) => (prev ? { ...prev } : null));
            setOportunidades((prev) => [...prev]);
            await addOportunidadActividad(selectedOp.id, 'Nueva cotización creada y vinculada a la oportunidad');
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
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#F7931F]" />
                <span>Registrar Nueva Oportunidad de Venta</span>
              </h3>
              <button onClick={() => setShowNewOpModal(false)} className="text-gray-400 hover:text-[#363636] text-lg font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOportunidad} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Título de la Oportunidad *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Pavimentación Pastelones Obra Apoquindo"
                  value={nuevoTitulo}
                  onChange={(e) => setNuevoTitulo(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Cliente Asociado *</label>
                <select
                  required
                  value={nuevoClienteId}
                  onChange={(e) => setNuevoClienteId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
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
                <label className="block font-bold text-gray-700 mb-1">Tipo de Venta *</label>
                <select
                  value={nuevoTipoVenta}
                  onChange={(e) => setNuevoTipoVenta(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="Instalación">Instalación (Montaje y Trabajo en Obra)</option>
                  <option value="Suministro">Suministro (Producción Directa)</option>
                  <option value="Reventa de Material">Reventa de Material (Distribución)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Origen</label>
                  <input
                    type="text"
                    placeholder="Ej: WhatsApp, referido, web..."
                    value={nuevoOrigen}
                    onChange={(e) => setNuevoOrigen(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Sólo material o instalación</label>
                  <select
                    value={nuevaModalidadRequerimiento}
                    onChange={(e) => setNuevaModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-bold focus:outline-none focus:border-[#F7931F]"
                  >
                    <option value="solo_material">Sólo material</option>
                    <option value="instalacion">Instalación</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Fecha Límite de Término del Trabajo</label>
                <input
                  type="date"
                  value={nuevaFechaLimite}
                  onChange={(e) => setNuevaFechaLimite(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowNewOpModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Oportunidad de Supabase</span>
              </h3>
              <button onClick={() => setOpToDelete(null)} className="text-gray-400 hover:text-[#363636] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar la oportunidad <strong className="font-mono text-[#363636]">{opToDelete.codigo}</strong> (&quot;{opToDelete.titulo}&quot;)?
              </p>
              <p className="bg-red-50 p-3 rounded-xl border border-red-200 text-red-900 font-medium">
                Esta acción eliminará permanentemente la oportunidad de la base de datos de Supabase.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOpToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteOportunidad}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Oportunidad</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmación Eliminación de Cotización desde Modal */}
      {cotToDeleteInModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Cotización de Supabase</span>
              </h3>
              <button onClick={() => setCotToDeleteInModal(null)} className="text-gray-400 hover:text-[#363636] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar la cotización <strong className="font-mono text-[#363636]">{cotToDeleteInModal.numero_cotizacion}</strong> por <strong className="text-emerald-700">${(cotToDeleteInModal.monto_total || 0).toLocaleString('es-CL')}</strong>?
              </p>
              <p className="bg-red-50 p-3 rounded-xl border border-red-200 text-red-900 font-medium">
                Esta acción la eliminará de Supabase.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCotToDeleteInModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCotizacionInModal}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5"
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
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn"
          onClick={() => setAbonoWarningModal(null)}
        >
          <div
            className="bg-white text-[#363636] border border-gray-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-2xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#363636]">Requisito de Abono Mínimo (50%)</h3>
                <p className="text-xs text-gray-500 font-medium">No se puede mover la oportunidad de estado</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-700 font-medium leading-relaxed">
                Para cambiar la oportunidad <strong className="font-mono text-[#F7931F]">{abonoWarningModal.op.codigo}</strong> al estado de Venta Cerrada o Producción, se requiere registrar un abono equivalente a al menos el <strong className="text-amber-800 font-bold">50% o 100%</strong> del monto total.
              </p>

              <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 space-y-2 font-mono text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Monto Total Venta:</span>
                  <span className="font-bold text-[#363636]">${abonoWarningModal.montoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Abonado actualmente:</span>
                  <span className="font-bold text-amber-700">${abonoWarningModal.montoAbonado.toLocaleString('es-CL')} ({abonoWarningModal.porcentajeActual}%)</span>
                </div>
                <div className="flex justify-between text-[#F7931F] font-black border-t border-gray-200 pt-2 text-xs">
                  <span>Requerido mínimo (50%):</span>
                  <span>${Math.round(abonoWarningModal.montoTotal * 0.5).toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAbonoWarningModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
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
                className="px-4 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold rounded-xl transition shadow-sm flex items-center gap-1.5"
              >
                <DollarSign className="w-4 h-4" />
                <span>Registrar Abono Ahora</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {ramaChangeOcModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[120] animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#F7931F]" />
                <span>Resolver OC antes de cambiar de rama</span>
              </h3>
              <button
                type="button"
                onClick={() => setRamaChangeOcModal(null)}
                className="text-gray-400 hover:text-[#363636] font-bold"
              >
                x
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <p>
                La oportunidad <strong>{ramaChangeOcModal.op.codigo}</strong> tiene <strong>{ramaChangeOcModal.ocCount}</strong> orden(es) de compra vinculada(s).
              </p>
              <p className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-orange-950 font-medium">
                Para moverla a {ramaChangeOcModal.rama === 'produccion' ? 'Produccion e Instalacion' : 'Reventa y Logistica'}, primero debes desvincular o eliminar esas OCs. No pueden quedar asignadas a ambas ramas.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRamaChangeOcModal(null)}
                disabled={resolvingRamaChangeOc}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => resolveRamaChangeWithOc('desvincular')}
                disabled={resolvingRamaChangeOc}
                className="px-4 py-2 bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-[#363636] border border-gray-300 font-extrabold rounded-xl transition"
              >
                {resolvingRamaChangeOc ? 'Resolviendo...' : 'Desvincular OC y Cambiar Rama'}
              </button>
              {currentUser?.rol === 'admin' && (
                <button
                  type="button"
                  onClick={() => resolveRamaChangeWithOc('eliminar')}
                  disabled={resolvingRamaChangeOc}
                  className="px-4 py-2 bg-[#363636] hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold rounded-xl transition"
                >
                  Eliminar OC y Cambiar Rama
                </button>
              )}
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
            className="fixed z-[101] bg-[#1c1c1f] text-gray-100 border border-gray-800 rounded-2xl shadow-2xl p-3 min-w-[280px] space-y-3 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Popover con Buscador ClickUp */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2 px-1">
                <span className="text-[11px] font-black uppercase text-gray-300 tracking-wider">Estado del Pipeline</span>
                <button
                  onClick={() => {
                    setStageMenuPos(null);
                    setStatusSearchQuery('');
                  }}
                  className="text-gray-500 hover:text-gray-300 p-0.5 rounded-lg transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Buscador de estados Buscar... */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={statusSearchQuery}
                  onChange={(e) => setStatusSearchQuery(e.target.value)}
                  className="w-full bg-[#27272a] text-gray-200 border border-gray-700 focus:border-[#F7931F] text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none transition placeholder-gray-500 font-medium"
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
                    <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-wider px-2 py-0.5 block">
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
                          className={`w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition flex items-center justify-between group ${
                            isCurrent
                              ? 'bg-[#27272a] text-[#F7931F] border border-[#F7931F]/40 shadow-sm'
                              : 'hover:bg-white/5 text-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-3 h-3 rounded-full border border-current shadow-2xs ${
                                st.id === 'nueva'
                                  ? 'bg-amber-500 border-amber-400'
                                  : st.id === 'pagada'
                                  ? 'bg-blue-500 border-blue-400'
                                  : st.id === 'entregada'
                                  ? 'bg-emerald-500 border-emerald-400'
                                  : st.id.startsWith('prod_')
                                  ? 'bg-purple-500 border-purple-400'
                                  : 'bg-indigo-500 border-indigo-400'
                              }`}
                            />
                            <span className="text-[11px] font-extrabold uppercase tracking-wider">{st.label}</span>
                          </div>
                          {isCurrent && <Check className="w-4 h-4 text-[#F7931F]" />}
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
