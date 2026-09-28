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
  OrdenCompraAsignacion,
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
import { cotizacionVigente, totalAbonado, totalComercial } from '../../lib/oportunidad-finanzas';
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
  Flag,
  Tag,
  Compass,
  Disc,
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
  const [deliveryAccreditation, setDeliveryAccreditation] = useState<Record<string, boolean>>({});
  const [allCotizaciones, setAllCotizaciones] = useState<Cotizacion[]>([]);
  const [usuariosApp, setUsuariosApp] = useState<Usuario[]>([]);
  const [personalTerrenoList, setPersonalTerrenoList] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');

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
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#27272a] hover:bg-[#323236] border border-gray-700 hover:border-[#f97316]/50 rounded-lg text-xs text-white transition my-1 group shadow-sm"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#f97316] group-hover:scale-110 transition-transform shrink-0" />
                <span className="font-semibold underline decoration-gray-600 group-hover:decoration-white truncate max-w-xs">{fileName}</span>
                <span className="text-[10px] text-gray-400 font-mono flex items-center gap-0.5 shrink-0">
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
                      className="text-[#f97316] font-extrabold bg-[#f97316]/15 px-1.5 py-0.5 rounded-md border border-[#f97316]/30 inline-block mx-0.5"
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

      if (error) throw new Error(error.message);
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
            const closedIds = rawOps.filter((op) => ['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline)).map((op) => op.id);
            const { data: accreditationRows, error: accreditationError } = closedIds.length
              ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
              : { data: [], error: null };
            if (accreditationError) throw accreditationError;
            setDeliveryAccreditation(Object.fromEntries(((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [row.venta_id, row.acreditada])));
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
            setDeliveryAccreditation({});
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
  const SECCION_COMERCIAL = SECCIONES_PIPELINE[0];
  const ETAPAS_COMERCIALES = SECCION_COMERCIAL.etapas;
  const esEtapaComercial = (estado: EstadoPipeline) =>
    ETAPAS_COMERCIALES.some((etapa) => etapa.id === estado);

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
    const { error } = await supabase.from('cotizaciones').delete().eq('id', cotToDeleteInModal.id);
    if (error) {
      setCotizacionErrorMsg(error.message);
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

  // Modal Split Ratio State (Porcentaje de ancho de la columna izquierda, por defecto 64%)
  const [modalLeftColRatio, setModalLeftColRatio] = useState<number>(64);

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
        className={`py-2.5 px-3 cursor-pointer hover:text-[#f97316] transition select-none text-${align} text-xs font-extrabold uppercase tracking-normal text-gray-500 relative group border-r border-gray-200/50`}
      >
        <div
          className={`flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span className="truncate">{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 hover:opacity-100 shrink-0" />
          )}
        </div>

        {/* Resizer Handle Bar */}
        <div
          onMouseDown={(e) => handleMouseDownResize(colKey, e)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#f97316] active:bg-[#f97316] z-10 transition opacity-0 group-hover:opacity-100"
          title="Arrastrar para cambiar ancho de columna"
        />
      </th>
    );
  };

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

  const [cotizacionErrorMsg, setCotizacionErrorMsg] = useState('');
  const guardarCambioCotizacion = async (
    cotizacion: Cotizacion,
    cambios: { oportunidad_id?: string | null; estado?: EstadoCotizacion },
  ) => {
    const { data, error } = await supabase.from('cotizaciones')
      .update(cambios).eq('id', cotizacion.id).select().single();
    if (error || !data) throw new Error(error?.message || 'No se confirmó el cambio de cotización.');
    const { data: oportunidad, error: opError } = await supabase.from('oportunidades')
      .select('cotizacion_actual_id').eq('id', selectedOp!.id).single();
    if (opError || !oportunidad) throw new Error(opError?.message || 'No se pudo actualizar la cotización vigente.');
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
    if (error || !data) throw new Error(error?.message || 'No se confirmó el abono.');
    const updated = data as { comprobantes_pago: OportunidadVenta['comprobantes_pago']; monto_abonado: number };
    setSelectedOp((prev) => prev ? { ...prev, ...updated } : null);
    setOportunidades((prev) => prev.map((op) => op.id === selectedOp.id ? { ...op, ...updated } : op));
    setAbonoErrorMsg('');
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
      setAbonoErrorMsg(error?.message || 'No se pudo abrir el comprobante.');
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
    // Una OC puede distribuirse entre varias ventas y no se borra al cambiar de ruta.
    await applyMoveWithRama(opId, targetState, rama);
  };

  // Mover Oportunidad en el Pipeline (Sin gates bloqueantes de abono)
  const moveOportunidadToState = async (opId: string, targetState: EstadoPipeline) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp || targetOp.estado_pipeline === targetState) return;

    if (['entregada', 'prod_finalizado', 'rev_entregado'].includes(targetState)) {
      const { data: accredited, error: deliveryError } = await supabase.rpc('entrega_acreditada', { p_venta: opId });
      if (deliveryError || !accredited) {
        window.alert(deliveryError?.message || 'La venta aún no tiene entrega completa acreditada. Revisa guías y excepciones en la vista operativa.');
        return;
      }
      if (!window.confirm('¿Confirmar el cierre de esta venta con entrega acreditada?')) return;
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
        const { error } = await supabase
          .from('oportunidades')
          .update({ estado_pipeline: targetState })
          .eq('id', opId);
        if (error) throw error;
      } catch (err) {
        console.error('Error updating oportunidad state in Supabase:', err);
        setOportunidades((prev) => prev.map((o) => o.id === opId ? targetOp : o));
        if (selectedOp?.id === opId) setSelectedOp(targetOp);
        window.alert(err instanceof Error ? err.message : 'No se pudo actualizar la etapa.');
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

  const oportunidadesComerciales = oportunidades.filter((op) => esEtapaComercial(op.estado_pipeline));
  const isUnaccreditedClose = (op: OportunidadVenta) =>
    ['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) && deliveryAccreditation[op.id] !== true;
  const filteredOportunidades = oportunidadesComerciales.filter((op) => {
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
    <div className="space-y-6 text-[#213343] relative">
      {/* Toast Alert Flotante Superior Derecho */}
      {toastAlert && (
        <div className="fixed top-20 right-6 z-50 bg-[#213343] text-white p-4 rounded-lg shadow-sm border border-[#f97316] flex items-center gap-3 animate-slideDown max-w-sm">
          <div className="bg-[#f97316] p-2 rounded-md text-white shrink-0">
            <AtSign className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 text-xs">
            <span className="font-extrabold text-[#f97316] block">{toastAlert.user}</span>
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
          <h1 className="text-2xl font-extrabold text-[#213343] flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#f97316]" />
            <span>Pipeline de Oportunidades de Venta</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Gestiona oportunidades desde la captación hasta el cierre comercial.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            Después del cierre, continúa en
            <Link href="/planificacion" className="font-semibold text-[#c9621d] hover:underline">Planificación</Link>
            o
            <Link href="/reventa" className="font-semibold text-[#c9621d] hover:underline">Reventa</Link>.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setShowNewOpModal(true)}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Oportunidad</span>
          </button>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md border border-gray-200">
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'lista' ? 'bg-[#f97316] text-white shadow-xs' : 'text-gray-600 hover:text-[#213343]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'tablero' ? 'bg-[#f97316] text-white shadow-xs' : 'text-gray-600 hover:text-[#213343]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Avanzados (Ajustes 11 - Req 5) */}
      <div className="hg-list-toolbar text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Búsqueda por Texto */}
          <div className="relative flex-[2] min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código, cliente, título, RUT..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="hg-list-search w-full pl-9 pr-8 py-2 text-[#252b2d] font-medium placeholder-gray-400"
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
            className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
          >
            <option value="todos">Todos los Estados</option>
            {ETAPAS_COMERCIALES.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>{etapa.label}</option>
            ))}
          </select>

          {/* Filtro Tipo Venta */}
          <select
            value={filterTipoVenta}
            onChange={(e) => setFilterTipoVenta(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
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
            className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
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
            className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
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

          <span className="font-extrabold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200">
            Mostrando <strong className="text-[#f97316]">{filteredOportunidades.length}</strong> de {oportunidadesComerciales.length}
          </span>
        </div>
      </div>

      {activeTab === 'lista' && (filterEstado !== 'todos' || filterTipoVenta !== 'todos' || filterPrioridad !== 'todos' || filterAsignado !== 'todos') && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
          {filterEstado !== 'todos' && <button type="button" onClick={() => setFilterEstado('todos')} className="hg-list-meta hover:bg-[#ecefed]">Estado: {SECCIONES_PIPELINE.flatMap((section) => section.etapas).find((stage) => stage.id === filterEstado)?.label || filterEstado} <X className="h-3 w-3" /></button>}
          {filterTipoVenta !== 'todos' && <button type="button" onClick={() => setFilterTipoVenta('todos')} className="hg-list-meta hover:bg-[#ecefed]">{filterTipoVenta} <X className="h-3 w-3" /></button>}
          {filterPrioridad !== 'todos' && <button type="button" onClick={() => setFilterPrioridad('todos')} className="hg-list-meta hover:bg-[#ecefed]">Prioridad: {filterPrioridad} <X className="h-3 w-3" /></button>}
          {filterAsignado !== 'todos' && <button type="button" onClick={() => setFilterAsignado('todos')} className="hg-list-meta hover:bg-[#ecefed]">{filterAsignado === 'me' ? 'Asignadas a mí' : usuariosApp.find((user) => user.id === filterAsignado)?.nombre || 'Responsable'} <X className="h-3 w-3" /></button>}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500 font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : activeTab === 'tablero' ? (
        <div className="space-y-4 ">
          {(() => {
            const activeSection = SECCION_COMERCIAL;

            return (
              <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-4 min-h-[560px]">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <h3 className="text-base font-semibold text-[#26313a]">{activeSection.nombre}</h3>
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
                        className={`rounded-xl border p-3 min-h-[470px] transition ${
                          isTargetColumn
                            ? 'bg-orange-50 border-[#f97316] ring-2 ring-[#F7931F]/20'
                            : 'bg-[#f7f7f5] border-[#ececeb]'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full border ${stage.color}`} />
                            <h4 className="text-sm font-semibold text-[#26313a]">{stage.label}</h4>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-gray-500">
                            {stage.id === 'entregada'
                              ? `${colOps.filter((op) => !isUnaccreditedClose(op)).length} acreditadas · ${colOps.length} registros`
                              : colOps.length}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {colOps.map((op) => {
                            const latestQuote = getActiveQuote(op);
                            const montoTotal = getOportunidadTotalValue(op);
                            const montoAbonado = getOportunidadAbonadoValue(op);
                            const saldoPendiente = Math.max(0, montoTotal - montoAbonado);
                            const isBeingDragged = draggedOpId === op.id;

                            return (
                              <div
                                key={op.id}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, op.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => handleOpenOportunidad(op)}
                                onKeyDown={(event) => {
                                  if (event.target !== event.currentTarget) return;
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleOpenOportunidad(op);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-label={`Abrir oportunidad ${op.codigo}: ${op.titulo}`}
                                className={`bg-white p-3 rounded-xl border border-gray-200 space-y-3 shadow-sm hover:shadow-md hover:border-[#f97316] transition cursor-pointer active:cursor-grabbing relative group ${
                                  isBeingDragged ? 'opacity-40 border-dashed border-[#f97316]' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-1.5">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span className="font-mono font-bold text-[#213343] text-xs">{op.codigo}</span>
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
                                  <p className="text-sm font-extrabold text-[#213343] leading-snug group-hover:text-[#f97316] transition">
                                    {op.titulo}
                                  </p>
                                  {isUnaccreditedClose(op) && <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Entrega sin acreditar</span>}
                                  <div className="mt-1 flex items-center gap-1 text-xs text-[#f97316] font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
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
                                    <div className="flex justify-between text-[#f97316] font-black">
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
        <div className="space-y-5">
          {[SECCION_COMERCIAL].map((sec) => {
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
                  className="hg-list-group-heading w-full cursor-pointer select-none text-left hover:bg-[#fafaf8]"
                >
                    {isSecCollapsed ? <ChevronRight className="w-5 h-5 text-[#66716f]" /> : <ChevronDown className="w-5 h-5 text-[#66716f]" />}
                    <span className="text-sm font-semibold text-[#252b2d]">{sec.nombre}</span>
                    <span className="hg-list-count">{secOps.length}</span>
                </button>

                {/* Tablas por etapa dentro de esta sección */}
                {!isSecCollapsed && (
                  <div className="divide-y divide-[#eff0ee]">
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
                              ? 'bg-orange-50 ring-2 ring-inset ring-[#f97316]'
                              : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between px-4 py-3 transition group hover:bg-[#fafaf8]">
                            <button
                              type="button"
                              onClick={() => setCollapsedSections((prev) => ({ ...prev, [col.id]: !prev[col.id] }))}
                              aria-expanded={!isCollapsed}
                              className="flex min-w-0 items-center gap-2.5 text-left"
                            >
                              <span className="text-gray-400 group-hover:text-[#213343] transition">
                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>

                              <span className="flex items-center gap-2 text-sm font-semibold text-[#252b2d]">
                                <span className={`h-2.5 w-2.5 rounded-full border ${col.color} ${col.bg}`} />
                                <span>{col.label}</span>
                              </span>

                              <span className="hg-list-count">
                                {col.id === 'entregada'
                                  ? `${rawOps.filter((op) => !isUnaccreditedClose(op)).length} acreditadas · ${rawOps.length} registros`
                                  : rawOps.length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setShowNewOpModal(true)}
                              className="text-xs font-bold text-gray-500 hover:text-[#f97316] transition flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Agregar Oportunidad</span>
                            </button>
                          </div>

                          {!isCollapsed && (
                            <div className="border-t border-[#eff0ee]">
                              {colOps.length > 0 && <div>
                                {colOps.map((op) => {
                                  const responsable = usuariosApp.find((user) => user.id === op.asignado_a)?.nombre || 'Sin asignar';
                                  const monto = getOportunidadTotalValue(op);
                                  return <div key={op.id} className="hg-list-row">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setStageMenuPos({ opId: op.id, top: rect.bottom + 4, left: rect.left });
                                      }}
                                      className={`h-3.5 w-3.5 shrink-0 rounded-full border ${getStageDotColor(op.estado_pipeline)}`}
                                      aria-label={`Cambiar etapa de ${op.codigo}`}
                                    />
                                    <button type="button" onClick={() => handleOpenOportunidad(op)} className="min-w-0 flex-1 text-left">
                                      <span className="block truncate text-sm font-semibold text-[#252b2d] hover:text-[#c9621d]">{op.titulo}</span>
                                      <span className="block truncate text-xs text-[#8a9390]">{op.codigo} · {op.cliente?.nombre || 'Cliente sin nombre'}</span>
                                      {isUnaccreditedClose(op) && <span className="block text-xs font-semibold text-amber-800">Entrega sin acreditar</span>}
                                    </button>
                                    <div className="hidden items-center gap-2 lg:flex">
                                      <span className="hg-list-meta" title={`Responsable: ${responsable}`}>{responsable}</span>
                                      {op.fecha_limite && <span className="hg-list-meta">Límite {op.fecha_limite}</span>}
                                      <span className="hg-list-meta font-semibold text-[#252b2d]">${monto.toLocaleString('es-CL')}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[#a8afac]" aria-hidden="true" />
                                  </div>;
                                })}
                              </div>}
                              {colOps.length === 0 ? (
                                <div className="px-5 py-4 text-xs text-[#8a9390]">
                                  No hay oportunidades en esta etapa.
                                </div>
                              ) : (
                                <details className="border-t border-[#eff0ee]">
                                  <summary className="cursor-pointer px-5 py-2.5 text-xs font-semibold text-[#66716f] hover:bg-[#fafaf8]">Mostrar columnas y edición rápida</summary>
                                <div className="overflow-x-auto bg-white">
                                  <table className="hg-list-table w-full text-left text-xs min-w-[1000px] table-fixed">
                                    <thead className="text-gray-500 uppercase text-xs font-extrabold border-b border-gray-200 bg-gray-50/60">
                                      <tr>
                                        <th className="py-3 px-2 w-10 text-center align-middle"></th>
                                        <th
                                          style={{ width: `${columnWidths.codigo}px` }}
                                          className="py-3 px-3 text-left text-xs font-extrabold uppercase tracking-normal align-middle relative group border-r border-gray-200/50"
                                        >
                                          <span>Código</span>
                                          <div
                                            onMouseDown={(e) => handleMouseDownResize('codigo', e)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-[#f97316] active:bg-[#f97316] z-10 transition opacity-0 group-hover:opacity-100"
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
                                    <tbody className="divide-y divide-gray-100 font-semibold text-[#213343]">
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
                                              isBeingDragged ? 'opacity-40 bg-amber-50 border-dashed border-[#f97316]' : ''
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

                                        <td style={{ width: `${columnWidths.titulo}px` }} className="py-3 px-3 font-bold text-[#213343] group-hover:text-[#f97316] transition text-xs truncate align-middle" title={op.titulo}>
                                          {op.titulo}
                                        </td>

                                        <td style={{ width: `${columnWidths.cliente}px` }} className="py-3 px-3 text-xs align-middle truncate" onClick={(e) => e.stopPropagation()}>
                                          <Link
                                            href={`/clientes/${op.cliente_id}`}
                                            className="font-bold text-[#f97316] hover:underline flex items-center gap-1.5 truncate"
                                            title={op.cliente?.nombre || 'Ver Cliente'}
                                          >
                                            <Building className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
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
                                            className="text-xs font-bold px-2 py-1 rounded-md border bg-purple-50 text-purple-900 border-purple-200 cursor-pointer focus:outline-none w-full"
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
                                            className={`text-xs font-bold px-2 py-1 rounded-md border cursor-pointer focus:outline-none w-full ${
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
                                            className="bg-transparent hover:bg-gray-100 border border-transparent hover:border-gray-300 rounded-lg px-1.5 py-1 font-mono text-xs text-gray-700 cursor-pointer focus:outline-none focus:border-[#f97316] w-full"
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
                                            className="bg-transparent hover:bg-amber-50 border border-transparent hover:border-amber-300 rounded-lg px-1.5 py-1 font-mono font-bold text-amber-800 cursor-pointer focus:outline-none focus:border-[#f97316] w-full"
                                          />
                                        </td>

                                        <td style={{ width: `${columnWidths.monto}px` }} className="py-3 px-3 text-right font-bold text-[#213343] text-xs align-middle">
                                          ${montoTotal.toLocaleString('es-CL')}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            </details>
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

      {/* Pop Up / Modal Enriquecido Oportunidad de Venta (Estilo Workspace Minimalista Homologado con Tasks) */}
      {selectedOp && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseOportunidad();
          }}
        >
          <div
            ref={modalContainerRef}
            className="bg-white text-[#213343] border border-gray-200 rounded-lg max-w-[96vw] lg:max-w-[86vw] w-full p-4 sm:p-6 shadow-2xl h-[95vh] overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-0 relative"
          >
            {/* Columna Izquierda: Breadcrumb + Título + Accordions (Ancho Resizable) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${modalLeftColRatio}%` : '100%' }}
              className="flex flex-col h-[70vh] lg:h-full overflow-hidden pr-3 shrink-0"
            >
              {/* Header Superior con Breadcrumb y Botón Eliminar Oportunidad */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3 text-sm shrink-0">
                <div className="flex items-center gap-2.5 text-gray-500 font-medium">
                  <Building className="w-4 h-4 text-[#f97316]" />
                  <Link href={`/clientes/${selectedOp.cliente_id}`} className="hover:text-[#f97316] text-[#213343] transition underline font-bold text-sm">
                    {selectedOp.cliente?.nombre || 'Cliente'}
                  </Link>
                  <span className="text-gray-400">/</span>
                  <span className="text-gray-500 font-bold font-mono text-sm">{selectedOp.codigo}</span>
                  <button
                    type="button"
                    onClick={() => setOpenSections((prev) => ({ ...prev, antecedentes: true }))}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-gray-100 hover:bg-orange-50 text-gray-700 hover:text-[#f97316] border border-gray-200 hover:border-orange-200 font-mono transition"
                    title={`${opAntecedentesList.length} archivo(s) adjunto(s) - Clic para ver`}
                  >
                    <Paperclip className="w-3 h-3 text-[#f97316]" />
                    <span>{opAntecedentesList.length}</span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <Link href={`/ventas/${selectedOp.id}/operacion`} className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#f97316] rounded-md border border-orange-200 font-bold text-xs">Producción y entregas</Link>
                  <button
                    onClick={() => setOpToDelete(selectedOp)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md transition border border-red-200 font-bold text-xs flex items-center gap-1.5"
                    title="Eliminar esta oportunidad de Supabase"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseOportunidad}
                    className="rounded-md border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 lg:hidden"
                    aria-label="Cerrar oportunidad"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Título Principal Editable Inline */}
              <div className="py-3 border-b border-gray-100 flex items-center justify-between shrink-0 mb-4">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2.5 w-full">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      className="bg-white text-2xl font-black text-[#213343] border border-[#f97316] rounded-md px-3.5 py-1.5 w-full focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitleEdit}
                      className="bg-[#f97316] hover:bg-[#ea580c] text-white p-2.5 rounded-md transition font-bold"
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
                    <h2 className="text-2xl sm:text-3xl font-black text-[#213343] leading-tight group-hover:text-[#f97316] transition">
                      {selectedOp.titulo}
                    </h2>
                    <Edit className="w-5 h-5 text-gray-400 group-hover:text-[#f97316] transition opacity-0 group-hover:opacity-100" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2 text-sm">
              {isUnaccreditedClose(selectedOp) && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Esta venta figura cerrada en el historial, pero su entrega no tiene respaldo acreditado. La cobranza automática permanece suspendida.</p>}
              {/* Resumen visible: campos de decisión y seguimiento rápido */}
              <section aria-label="Resumen de la oportunidad" className="rounded-xl border border-gray-200 bg-[#fafaf8] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Resumen de la oportunidad</h3>
                  <span className="text-[11px] text-gray-400">Datos principales</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-2 text-xs">
                  <div className="min-w-0">
                    {/* 1. Status */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Disc className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>Estado</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        {esEtapaComercial(selectedOp.estado_pipeline) ? (
                          <>
                            <select
                              value={selectedOp.estado_pipeline}
                              onChange={async (e) => {
                                const newStage = e.target.value as EstadoPipeline;
                                await moveOportunidadToState(selectedOp.id, newStage);
                              }}
                              className="w-full h-full appearance-none bg-gray-100 hover:bg-gray-200 text-[#213343] font-bold text-xs pl-3 pr-8 rounded-md border border-gray-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#f97316] transition shadow-xs"
                            >
                              {ETAPAS_COMERCIALES.map((etapa) => (
                                <option key={etapa.id} value={etapa.id}>{etapa.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </>
                        ) : (
                          <Link
                            href={selectedOp.rama_destino === 'reventa' || selectedOp.estado_pipeline.startsWith('rev_') ? '/reventa' : '/planificacion'}
                            className="flex h-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-100 px-3 text-xs font-semibold text-[#213343] hover:border-[#f97316]"
                            title="Abrir el pipeline operativo correspondiente"
                          >
                            <span className="truncate">{pipelineStates.find((etapa) => etapa.id === selectedOp.estado_pipeline)?.label || 'Etapa operativa'}</span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#f97316]" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 1. Vendedor (anteriormente Assignees) */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <User className="w-4 h-4 text-gray-400 shrink-0" />
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
                          className={`w-full h-full appearance-none bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md pl-3 pr-8 text-xs font-bold truncate focus:outline-none focus:border-[#f97316] transition shadow-xs cursor-pointer ${
                            selectedOp.asignado_a ? 'text-[#213343]' : 'text-gray-400 font-normal'
                          }`}
                        >
                          <option value="">Sin asignar</option>
                          {usuariosApp.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* Fechas */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3 min-h-[40px]">
                      <div className="w-full sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>Fechas</span>
                      </div>
                      <div className="w-full sm:w-auto min-w-0 flex-1 h-8 bg-white border border-gray-200 hover:border-gray-300 rounded-md px-2.5 flex items-center justify-between text-xs text-[#213343] shadow-xs">
                        <input
                          type="date"
                          value={selectedOp.fecha_inicio || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            updateOportunidadField(selectedOp.id, 'fecha_inicio', newDate);
                            await addOportunidadActividad(selectedOp.id, `Fecha de inicio actualizada a ${newDate} desde el detalle.`);
                          }}
                          className="bg-transparent text-[#213343] font-mono text-xs w-[95px] min-w-0 focus:outline-none cursor-pointer [color-scheme:light]"
                          title="Fecha de inicio"
                        />
                        <span className="text-gray-400 font-bold">→</span>
                        <input
                          type="date"
                          value={selectedOp.fecha_limite || ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            updateOportunidadField(selectedOp.id, 'fecha_limite', newDate);
                            await addOportunidadActividad(selectedOp.id, `Fecha límite actualizada a ${newDate} desde el detalle.`);
                          }}
                          className="bg-transparent text-amber-800 font-mono text-xs w-[95px] min-w-0 focus:outline-none cursor-pointer [color-scheme:light]"
                          title="Fecha límite"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 2. Priority */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Flag className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>Prioridad</span>
                      </div>
                      <div className="relative min-w-0 flex-1 h-8">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                          <Flag className={`w-3.5 h-3.5 ${
                            selectedOp.prioridad === 'urgente' ? 'text-red-500' : selectedOp.prioridad === 'alta' ? 'text-amber-500' : selectedOp.prioridad === 'normal' ? 'text-blue-500' : 'text-gray-400'
                          }`} />
                        </div>
                        <select
                          value={selectedOp.prioridad || ''}
                          onChange={async (e) => {
                            const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                            updateOportunidadField(selectedOp.id, 'prioridad', newPrio || null);
                            await addOportunidadActividad(selectedOp.id, `Prioridad cambiada a "${newPrio || 'normal'}" desde el detalle.`);
                          }}
                          className={`w-full h-full appearance-none bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md pl-8 pr-8 text-xs font-bold focus:outline-none focus:border-[#f97316] transition shadow-xs cursor-pointer ${
                            selectedOp.prioridad ? 'text-[#213343]' : 'text-gray-400 font-normal'
                          }`}
                        >
                          <option value="">Sin prioridad</option>
                          <option value="normal">Normal</option>
                          <option value="alta">Alta</option>
                          <option value="urgente">Urgente</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <details key={`seguimiento-panel-${selectedOp.id}`} className="group rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#213343] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#f97316] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-[#f97316]" />Seguimiento comercial</span>
                  <span className="ml-auto hidden truncate text-xs font-normal text-gray-500 sm:block">{selectedOp.proxima_accion || 'Sin próxima acción'}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-gray-100 p-3">
                  <div className="space-y-2" key={`seguimiento-${selectedOp.id}`}>
                    <p className="text-xs text-gray-500">Registra el último contacto y define el siguiente paso.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        aria-label="Resultado del último contacto"
                        placeholder="Resultado del último contacto"
                        defaultValue={selectedOp.seguimiento_resultado || ''}
                        onBlur={async (e) => {
                          const value = e.target.value.trim();
                          if (value === (selectedOp.seguimiento_resultado || '')) return;
                          await updateOportunidadField(selectedOp.id, 'seguimiento_resultado', value || null);
                          await addOportunidadActividad(selectedOp.id, `Contacto comercial registrado: ${value || 'sin resultado'}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      />
                      <input
                        aria-label="Próxima acción"
                        placeholder="Próxima acción"
                        defaultValue={selectedOp.proxima_accion || ''}
                        onBlur={async (e) => {
                          const value = e.target.value.trim();
                          if (value === (selectedOp.proxima_accion || '')) return;
                          await updateOportunidadField(selectedOp.id, 'proxima_accion', value || null);
                          await addOportunidadActividad(selectedOp.id, `Próxima acción: ${value || 'sin definir'}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      />
                      <input
                        type="datetime-local"
                        aria-label="Fecha de próxima acción"
                        defaultValue={selectedOp.proxima_accion_fecha ? new Date(selectedOp.proxima_accion_fecha).toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T').slice(0, 16) : ''}
                        onChange={async (e) => {
                          const date = e.target.value ? new Date(e.target.value).toISOString() : null;
                          await updateOportunidadField(selectedOp.id, 'proxima_accion_fecha', date);
                          await addOportunidadActividad(selectedOp.id, `Fecha de próxima acción ${date ? 'programada' : 'eliminada'}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      />
                      <select
                        aria-label="Responsable del seguimiento"
                        defaultValue={selectedOp.seguimiento_responsable_id || selectedOp.asignado_a || ''}
                        onChange={async (e) => {
                          const user = usuariosApp.find((u) => u.id === e.target.value);
                          await updateOportunidadField(selectedOp.id, 'seguimiento_responsable_id', e.target.value || null);
                          await addOportunidadActividad(selectedOp.id, `Seguimiento asignado a ${user?.nombre || 'sin responsable'}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      >
                        <option value="">Sin responsable</option>
                        {usuariosApp.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </details>

              <details key={`clasificacion-panel-${selectedOp.id}`} className="group rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#213343] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#f97316] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Tag className="h-4 w-4 text-[#f97316]" />Clasificación comercial</span>
                  <span className="ml-auto hidden truncate text-xs font-normal text-gray-500 sm:block">{selectedOp.tipo_venta || 'Instalación'} · {selectedOp.origen || 'Sin origen'}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t border-gray-100 p-4 text-xs xl:grid-cols-2">
                  <div className="min-w-0">
                    {/* 3. Origen */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Compass className="w-4 h-4 text-gray-400 shrink-0" />
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
                          className={`w-full h-full appearance-none bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md pl-3 pr-8 text-xs font-bold focus:outline-none focus:border-[#f97316] transition shadow-xs cursor-pointer ${
                            selectedOp.origen ? 'text-[#213343]' : 'text-gray-400 font-normal'
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
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 4. Tipo de Venta / Tags */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
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
                          className="w-full h-full appearance-none bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md pl-3 pr-8 text-xs font-bold text-[#213343] focus:outline-none focus:border-[#f97316] transition shadow-xs cursor-pointer"
                        >
                          <option value="Instalación">Instalación</option>
                          <option value="Suministro">Suministro</option>
                          <option value="Reventa de Material">Reventa de Material</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {/* 5. Requerimiento (debajo de Tipo de venta) */}
                    <div className="flex min-w-0 items-center gap-3 min-h-[40px]">
                      <div className="w-24 sm:w-28 flex items-center gap-2 text-gray-500 font-medium shrink-0">
                        <Layers className="w-4 h-4 text-gray-400 shrink-0" />
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
                          className="w-full h-full appearance-none bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-md pl-3 pr-8 text-xs font-bold text-[#213343] focus:outline-none focus:border-[#f97316] transition shadow-xs cursor-pointer"
                        >
                          <option value="instalacion">Instalación</option>
                          <option value="solo_material">Sólo material</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              <details key={`cierre-panel-${selectedOp.id}`} className="group rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#213343] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#f97316] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#f97316]" />Preparación del cierre</span>
                  <span className="ml-auto text-xs font-normal text-gray-500">
                    {[
                      getOportunidadTotalValue(selectedOp) > 0,
                      Boolean(selectedOp.direccion && selectedOp.comuna),
                      Boolean(selectedOp.fecha_limite),
                      Boolean(selectedOp.modalidad_entrega),
                      Boolean(selectedOp.condicion_pago),
                      Boolean(selectedOp.rama_destino),
                    ].filter(Boolean).length}/6 completos
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-gray-100 p-3">
                  <div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {([
                        ['Cotización vigente', getOportunidadTotalValue(selectedOp) > 0],
                        ['Dirección y comuna', Boolean(selectedOp.direccion && selectedOp.comuna)],
                        ['Fecha estimada', Boolean(selectedOp.fecha_limite)],
                        ['Modalidad de entrega', Boolean(selectedOp.modalidad_entrega)],
                        ['Condición de pago', Boolean(selectedOp.condicion_pago)],
                        ['Ruta operacional', Boolean(selectedOp.rama_destino)],
                      ] as [string, boolean][]).map(([label, ready]) => (
                        <span key={label} className={`text-xs ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {ready ? '✓' : '○'} {label}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">
                      Abonos registrados: ${getOportunidadAbonadoValue(selectedOp).toLocaleString('es-CL')}. Los pendientes no impiden avanzar.
                    </p>
                  </div>
                </div>
              </details>

              <details key={`ruta-panel-${selectedOp.id}`} className="group rounded-xl border border-gray-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#213343] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#f97316] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#f97316]" />Ruta operativa</span>
                  <span className="ml-auto hidden text-xs font-normal text-gray-500 sm:block">Abastecimiento, entrega y responsables</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-gray-100 p-3">
                  <div className="space-y-2" key={`ruta-${selectedOp.id}`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        aria-label="Abastecimiento"
                        defaultValue={selectedOp.abastecimiento || ''}
                        onChange={async (e) => {
                          await updateOportunidadField(selectedOp.id, 'abastecimiento', e.target.value || null);
                          await addOportunidadActividad(selectedOp.id, `Abastecimiento: ${e.target.selectedOptions[0].text}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      >
                        <option value="">Definir abastecimiento</option>
                        <option value="fabricar">Fabricar</option>
                        <option value="compra_proveedor">Comprar a proveedor</option>
                        <option value="stock">Stock disponible</option>
                      </select>
                      <select
                        aria-label="Forma de entrega"
                        defaultValue={selectedOp.forma_entrega || ''}
                        onChange={async (e) => {
                          await updateOportunidadField(selectedOp.id, 'forma_entrega', e.target.value || null);
                          await addOportunidadActividad(selectedOp.id, `Entrega: ${e.target.selectedOptions[0].text}.`);
                        }}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      >
                        <option value="">Definir entrega</option>
                        <option value="retiro_cliente">Retiro por cliente</option>
                        <option value="retiro_proveedor">Retiro en proveedor</option>
                        <option value="despacho_propio">Despacho propio</option>
                        <option value="despacho_subcontratado">Despacho subcontratado</option>
                      </select>
                      {([
                        ['fecha_prometida', 'Fecha prometida'],
                        ['fecha_tentativa_produccion', 'Producción tentativa'],
                        ['fecha_tentativa_entrega', 'Entrega tentativa'],
                      ] as [keyof OportunidadVenta, string][]).map(([field, label]) => (
                        <label key={field} className="text-[11px] text-gray-600">
                          {label}
                          <input
                            type="date"
                            defaultValue={String(selectedOp[field] || '').slice(0, 10)}
                            onChange={(e) => updateOportunidadField(selectedOp.id, field, e.target.value || null)}
                            className="block w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                          />
                        </label>
                      ))}
                      <input
                        aria-label="Dirección de obra"
                        placeholder="Dirección de obra"
                        defaultValue={selectedOp.direccion_obra || ''}
                        onBlur={(e) => updateOportunidadField(selectedOp.id, 'direccion_obra', e.target.value.trim() || null)}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      />
                      <input
                        aria-label="Vehículo o transporte"
                        placeholder="Vehículo o transporte"
                        defaultValue={selectedOp.transporte || ''}
                        onBlur={(e) => updateOportunidadField(selectedOp.id, 'transporte', e.target.value.trim() || null)}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      />
                      <select
                        aria-label="Responsable operativo"
                        defaultValue={selectedOp.responsable_operativo_id || ''}
                        onChange={(e) => updateOportunidadField(selectedOp.id, 'responsable_operativo_id', e.target.value || null)}
                        className="bg-white border border-gray-200 rounded-md px-3 py-2 text-xs"
                      >
                        <option value="">Sin responsable operativo</option>
                        {usuariosApp.map((user) => <option key={user.id} value={user.id}>{user.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </details>

              {(() => {
                const activeClient = clientes.find((c) => c.id === selectedOp.cliente_id) || selectedOp.cliente;
                const ejecutivoCliente = usuariosApp.find((u) => u.id === (activeClient?.usuario_id || selectedOp.asignado_a));

                return (
                  <div className="mb-4 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-white hover:bg-gray-50 text-[#213343] font-semibold text-sm flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 transition">
                      <button
                        type="button"
                        onClick={() => setOpenSections((prev) => ({ ...prev, contacto: !prev.contacto }))}
                        className="flex items-center gap-2.5 hover:text-[#ea580c] transition cursor-pointer text-left font-semibold text-sm text-[#213343]"
                      >
                        <User className="w-4 h-4 text-[#f97316]" />
                        <span>Información del cliente</span>
                        {openSections.contacto ? (
                          <ChevronUp className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                      {selectedOp.cliente_id && (
                        <Link
                          href={`/clientes/${selectedOp.cliente_id}`}
                          className="text-xs font-semibold bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white border border-orange-200 px-3 py-1.5 rounded-md transition flex items-center gap-1.5"
                        >
                          Editar ficha del cliente
                        </Link>
                      )}
                    </div>

                    {openSections.contacto && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5 text-[#213343] text-xs">
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">Razón social / Nombre</span>
                        <strong className="text-[#213343] text-xs font-bold block">{activeClient?.nombre || 'Hormiglass Cliente'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">Encargado del cliente</span>
                        <span className="text-[#213343] text-xs font-bold block">{ejecutivoCliente?.nombre || 'Sin encargado asignado'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">RUT registrado</span>
                        <span className="font-mono text-amber-700 font-bold text-xs block">{activeClient?.rut || 'Sin RUT'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">Teléfono</span>
                        <span className="flex items-center gap-1.5 font-bold text-[#213343] text-xs">
                          <Phone className="w-3.5 h-3.5 text-[#f97316]" />
                          {activeClient?.telefono || 'No indicado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">Dirección de despacho / Obra</span>
                        <span className="text-[#213343] text-xs font-bold block" title={activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}>
                          {activeClient?.direccion || selectedOp.direccion || 'Sin dirección'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium text-xs block mb-0.5">Comuna / Región</span>
                        <span className="text-[#213343] text-xs font-bold block">
                          {[activeClient?.comuna || selectedOp.comuna, activeClient?.region || selectedOp.region || 'Región Metropolitana'].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-gray-500 font-medium text-xs block mb-1">Correos electrónicos</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200 text-[#213343] font-mono text-xs flex items-center gap-1.5 font-semibold">
                            <Mail className="w-3.5 h-3.5 text-[#f97316]" />
                            {activeClient?.correo || 'Sin correo principal'}
                          </span>
                          {activeClient?.correos_secundarios?.map((sec, idx) => (
                            <span key={idx} className="bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 font-mono text-xs flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-gray-400" />
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
                {/* Banner Header: SECCIÓN 1: Área Comercial & Ventas (Contraíble con Jerarquía) */}
                <button
                  type="button"
                  onClick={() => setAreaExpanded((prev) => ({ ...prev, comercial: !prev.comercial }))}
                  className="w-full p-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-amber-300 rounded-lg flex items-center justify-between font-semibold text-sm text-[#213343] transition shadow-xs cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <TrendingUp className="w-4 h-4 text-[#f97316] group-hover:scale-110 transition-transform" />
                    <span>Área Comercial & Ventas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {areaExpanded.comercial ? (
                      <ChevronUp className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                </button>

                {areaExpanded.comercial && (
                  <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-amber-300 space-y-3.5 my-2.5 relative">

                {/* Accordion 1: Cotizaciones de la Oportunidad */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                  <button
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-3 bg-gray-50 hover:bg-gray-100/80 text-[#213343] font-semibold text-xs flex items-center justify-between border-b border-gray-200 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-[#f97316]" />
                      <span>Cotizaciones de la Oportunidad</span>
                    </span>
                    {openSections.productos ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>

                  {openSections.productos && (
                    <div className="p-5 space-y-4 bg-white text-[#213343]">
                      {cotizacionErrorMsg && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{cotizacionErrorMsg}</p>}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div>
                          <h4 className="text-[#213343] font-extrabold text-sm flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#f97316]" />
                            <span>Cotizaciones del Cliente:</span>
                          </h4>
                          <p className="text-xs text-gray-500 mt-1">
                            Vincula las cotizaciones a esta oportunidad. Solo la última versión <strong>Enviada</strong> o <strong>Aprobada</strong> determina el valor total.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowUnifiedCotModal(true)}
                          className="bg-[#f97316] hover:bg-[#ea580c] text-white text-xs font-extrabold px-3.5 py-2 rounded-md transition flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-xs"
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
                              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                                <label className="text-[#213343] font-extrabold text-xs flex items-center gap-2 uppercase tracking-normal">
                                  <FileText className="w-4 h-4 text-[#f97316]" />
                                  <span>Seleccionar Cotización Disponible para Agregar:</span>
                                </label>

                                <div className="flex flex-col sm:flex-row items-center gap-2.5">
                                  <select
                                    value={selectedCandidateCotId}
                                    onChange={(e) => setSelectedCandidateCotId(e.target.value)}
                                    className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
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
                                      className="w-full sm:w-auto bg-white hover:bg-gray-100 text-[#213343] text-xs font-extrabold px-3.5 py-2.5 rounded-md transition flex items-center justify-center gap-1.5 shrink-0 border border-gray-200 shadow-xs"
                                      title="Previsualizar PDF antes de vincular"
                                    >
                                      <Eye className="w-4 h-4 text-[#f97316]" />
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
                                        setCotizacionErrorMsg(err?.message || 'No se pudo vincular la cotización.');
                                        return;
                                      }
                                      await addOportunidadActividad(
                                        selectedOp.id,
                                        `Cotización ${targetCot.numero_cotizacion} agregada y vinculada a la oportunidad.`
                                      );
                                    }}
                                    className="w-full sm:w-auto bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white text-xs font-extrabold px-4 py-2.5 rounded-md transition flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Agregar</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Lista de Cotizaciones Agregadas a la Oportunidad */}
                            {linkedQuotes.length === 0 ? (
                              <div className="p-5 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-gray-500 text-center text-xs">
                                No hay cotizaciones agregadas a esta oportunidad. {unassignedQuotes.length > 0 ? 'Selecciona una del desplegable de arriba o haz' : 'Haz'} clic en "Crear Nueva Cotización".
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
                                          ? 'bg-white border-orange-300 shadow-xs'
                                          : 'bg-white border-gray-200 opacity-80 hover:opacity-100'
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
                                              setCotizacionErrorMsg(err?.message || 'No se pudo cambiar el vínculo.');
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} ${checked ? 'vinculada a' : 'desvinculada de'} la oportunidad.`
                                            );
                                          }}
                                          className="w-4 h-4 rounded text-[#f97316] focus:ring-[#f97316] accent-[#f97316] cursor-pointer shrink-0"
                                        />

                                        <div className="space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono font-black text-[#213343] text-sm">
                                              {cot.numero_cotizacion}
                                            </span>
                                            <span className="text-xs font-extrabold uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                                              v{cot.version || 1}
                                            </span>
                                            {isSummed ? (
                                              <span className="text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                                Cotización vigente
                                              </span>
                                            ) : isLinked ? (
                                              <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-200">
                                                Agregada ({cot.estado})
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-bold text-gray-400">
                                                Sin asignar
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-black text-[#f97316] text-sm block">
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
                                              setCotizacionErrorMsg(err?.message || 'No se pudo cambiar el estado.');
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Estado de cotización ${cot.numero_cotizacion} cambiado a "${newStatus.toUpperCase()}"`
                                            );
                                          }}
                                          className={`text-xs font-extrabold uppercase px-3 py-1.5 rounded-md border cursor-pointer focus:outline-none ${
                                            cot.estado === 'aprobada'
                                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              : cot.estado === 'enviada'
                                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                                              : cot.estado === 'declinada' || cot.estado === 'rechazada'
                                              ? 'bg-red-50 text-red-700 border-red-200'
                                              : 'bg-amber-50 text-amber-700 border-amber-200'
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
                                          className="p-2 bg-white hover:bg-orange-50 text-gray-700 hover:text-[#f97316] rounded-md font-bold transition text-xs flex items-center gap-1.5 border border-gray-200"
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
                                              setCotizacionErrorMsg(err?.message || 'No se pudo desvincular la cotización.');
                                              return;
                                            }

                                            await addOportunidadActividad(
                                              selectedOp.id,
                                              `Cotización ${cot.numero_cotizacion} desvinculada de esta oportunidad.`
                                            );
                                          }}
                                          className="p-2 bg-white hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-md transition border border-gray-200"
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
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                              <div>
                                <span className="text-[#213343] font-extrabold text-sm block">Valor Total de la Oportunidad:</span>
                                <span className="text-xs text-gray-500">
                                  Solo la última versión vinculada en estado <strong>Enviada</strong> o <strong>Aprobada</strong>.
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-2xl font-black text-[#f97316] block">
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
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                  <button
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-3 bg-gray-50 hover:bg-gray-100/80 text-[#213343] font-semibold text-xs flex items-center justify-between border-b border-gray-200 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4 text-[#f97316]" />
                      <span>Finanzas & Comprobantes de Pago</span>
                    </span>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>

                  {openSections.finanzas && (
                    <div className="p-5 space-y-5 bg-white text-[#213343]">
                      {/* Resumen de Saldo */}
                      {(() => {
                        const totalCot = getOportunidadTotalValue(selectedOp);
                        const abonado = getOportunidadAbonadoValue(selectedOp);
                        const saldo = Math.max(0, totalCot - abonado);

                        return (
                          <div className="space-y-4">
                            {/* Resumen Financiero Calculado */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                              <div>
                                <span className="text-gray-500 block text-xs font-semibold mb-1">Valor Total Cotizado:</span>
                                <strong className="text-[#213343] text-lg font-black">${totalCot.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-xs font-semibold mb-1">Monto Abonado Acumulado:</span>
                                <strong className="text-emerald-600 text-lg font-black">${abonado.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-500 block text-xs font-semibold mb-1">Saldo Pendiente:</span>
                                <strong className="text-amber-700 text-lg font-black">${saldo.toLocaleString('es-CL')}</strong>
                              </div>
                            </div>

                            {/* Registro de Abonos e Historial Acumulativo */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
                              <h4 className="text-[#213343] font-extrabold text-sm flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-[#f97316]" />
                                <span>Ingresar Nuevo Abono o Pago (Comprobante Obligatorio)</span>
                              </h4>

                              {abonoErrorMsg && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs font-bold">
                                  {abonoErrorMsg}
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="text-xs text-gray-600 font-bold block mb-1">Monto Abono ($ CLP) *</label>
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
                                      className="w-full bg-white text-[#213343] border border-gray-200 rounded-md pl-7 pr-3 py-2 text-xs font-bold focus:outline-none focus:border-[#f97316]"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-xs text-gray-600 font-bold block mb-1">Comprobante de Pago *</label>
                                  <label className="w-full bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-md px-3 py-2 text-xs font-bold cursor-pointer flex items-center justify-between transition truncate">
                                    <span className="truncate">{nuevoAbonoFileName || 'Subir Comprobante'}</span>
                                    <Paperclip className="w-4 h-4 text-[#f97316] shrink-0 ml-1" />
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
                                  <label className="text-xs text-gray-600 font-bold block mb-1">Nota / Referencia</label>
                                  <input
                                    type="text"
                                    placeholder="Ej. Transferencia #9842"
                                    value={nuevoAbonoNota}
                                    onChange={(e) => setNuevoAbonoNota(e.target.value)}
                                    className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]"
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
                                        if (uploadError || !upload) throw new Error(uploadError?.message || 'Storage no confirmó la subida.');
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
                                        setAbonoErrorMsg(err?.message || 'No se pudo registrar el abono.');
                                      } finally {
                                        setAbonoSaving(false);
                                      }
                                    }}
                                    disabled={abonoSaving}
                                    className="w-full bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white text-xs font-extrabold px-3.5 py-2 rounded-md transition flex items-center justify-center gap-1.5 shadow-xs"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>{abonoSaving ? 'Guardando...' : 'Agregar Abono'}</span>
                                  </button>
                                </div>
                              </div>

                              {/* Historial de Abonos Registrados */}
                              <div className="pt-4 border-t border-gray-200 space-y-3">
                                <span className="text-[#213343] text-xs font-extrabold uppercase tracking-normal block">Historial de Abonos Registrados:</span>
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
                                            <div key={ab.id || idx} className="bg-white p-3.5 rounded-md border border-[#f97316] space-y-2 text-xs">
                                              <span className="font-bold text-[#f97316] text-xs">Editar Abono:</span>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <input
                                                  type="text"
                                                  value={editAbonoMonto ? Number(editAbonoMonto).toLocaleString('es-CL') : ''}
                                                  onChange={(e) => setEditAbonoMonto(e.target.value.replace(/\D/g, ''))}
                                                  className="bg-white text-[#213343] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                                                />
                                                <input
                                                  type="text"
                                                  value={editAbonoNota}
                                                  onChange={(e) => setEditAbonoNota(e.target.value)}
                                                  className="bg-white text-[#213343] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
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
                                                        setAbonoErrorMsg(err?.message || 'No se pudo editar el abono.');
                                                      } finally {
                                                        setAbonoSaving(false);
                                                      }
                                                    }}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Guardar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingAbonoId(null)}
                                                    className="bg-gray-200 hover:bg-gray-300 text-[#213343] font-bold text-xs px-3 py-1.5 rounded-lg"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={ab.id || idx} className="bg-white p-3 rounded-md border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shadow-xs">
                                            <div className="space-y-1">
                                              <div className="flex items-center gap-2">
                                                <span className="font-bold text-emerald-700 text-sm">
                                                  ${Number(ab.monto || 0).toLocaleString('es-CL')} CLP
                                                </span>
                                                <span className="text-gray-700 text-xs font-semibold">
                                                  — {ab.nota || 'Abono'}
                                                </span>
                                              </div>

                                              {ab.comprobante_url && (
                                                <button
                                                  type="button"
                                                  onClick={() => void abrirComprobante(ab.comprobante_url)}
                                                  className="text-[#f97316] hover:underline text-xs font-mono flex items-center gap-1.5 mt-0.5"
                                                >
                                                  <FileCheck className="w-3.5 h-3.5 text-[#f97316]" />
                                                  <span>Comprobante: {ab.comprobante_nombre || 'Ver archivo'}</span>
                                                </button>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                              <div className="text-right text-xs text-gray-500 mr-2">
                                                <span>{ab.fecha}</span>
                                                {ab.creado_por && <span className="block text-gray-400 font-semibold">{ab.creado_por}</span>}
                                              </div>

                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingAbonoId(ab.id);
                                                  setEditAbonoMonto(String(ab.monto || ''));
                                                  setEditAbonoNota(ab.nota || '');
                                                }}
                                                className="p-1.5 bg-white hover:bg-blue-50 text-blue-600 rounded-lg transition border border-gray-200"
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
                                                    setAbonoErrorMsg(err?.message || 'No se pudo eliminar el abono.');
                                                  } finally {
                                                    setAbonoSaving(false);
                                                  }
                                                }}
                                                className="p-1.5 bg-white hover:bg-red-50 text-red-600 rounded-lg transition border border-gray-200"
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
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                  <div className="w-full p-3 bg-gray-50 text-[#213343] font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                      className="flex items-center gap-2.5 hover:text-[#f97316] transition cursor-pointer text-left font-semibold text-xs text-[#213343]"
                    >
                      <Calendar className="w-4 h-4 text-[#f97316]" />
                      <span>Visita a Terreno</span>
                      {opVisitasList.length > 0 && (
                        <span className="text-xs bg-[#f97316] text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opVisitasList.length}
                        </span>
                      )}
                      {openSections.visita ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
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
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f97316]"></div>
                        <span className="ml-2 text-xs font-bold text-gray-700 capitalize tracking-normal">
                          {selectedOp.requiere_visita_terreno ? 'Habilitado' : 'No Requiere'}
                        </span>
                      </label>
                      {selectedOp.requiere_visita_terreno && (
                        <Link
                          href={`/visitas?opId=${selectedOp.id}`}
                          className="text-[11px] bg-[#f97316] hover:bg-[#ea580c] text-white px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                        >
                          <span>Ver en Calendario</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {openSections.visita && selectedOp.requiere_visita_terreno && (
                    <div className="p-4 space-y-4 text-xs text-gray-700 bg-white">
                      {/* Botón para agregar una nueva visita */}
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <span className="font-bold text-[#213343] text-xs">Visitas Programadas para este Proyecto:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddVisitaForm(!showAddVisitaForm);
                            if (!newVisitaFecha) {
                              setNewVisitaFecha(new Date().toISOString().split('T')[0]);
                            }
                          }}
                          className="bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Visita a Terreno</span>
                        </button>
                      </div>

                      {/* Formulario Inline para Registrar Nueva Visita */}
                      {showAddVisitaForm && (
                        <div className="bg-gray-50 p-4 rounded-lg border border-orange-300 space-y-3">
                          <h4 className="font-extrabold text-[#f97316] text-xs uppercase flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Nueva Visita</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Responsable *</label>
                              <select
                                value={newVisitaTecnico}
                                onChange={(e) => setNewVisitaTecnico(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#f97316]"
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
                              <label className="block font-bold text-gray-600 mb-1">Fecha de Visita *</label>
                              <input
                                type="date"
                                required
                                value={newVisitaFecha}
                                onChange={(e) => setNewVisitaFecha(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#f97316]"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Hora de Visita</label>
                              <input
                                type="time"
                                value={newVisitaHora}
                                onChange={(e) => setNewVisitaHora(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#f97316]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Estado Inicial</label>
                              <select
                                value={newVisitaEstado}
                                onChange={(e) => setNewVisitaEstado(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-[#f97316]"
                              >
                                <option value="programada">Programada</option>
                                <option value="realizada">Realizada</option>
                                <option value="cancelada">Cancelada</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: Medir acceso y toma de plantilla..."
                                value={newVisitaNotas}
                                onChange={(e) => setNewVisitaNotas(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-[#f97316]"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => setShowAddVisitaForm(false)}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-[#213343] rounded-md font-bold transition"
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
                              className="px-4 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-xs"
                            >
                              Guardar Visita
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Lista de Visitas Registradas */}
                      {opVisitasList.length === 0 ? (
                        <div className="py-4 text-center text-gray-500 italic text-xs bg-gray-50 rounded-lg border border-dashed border-gray-200">
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
                                  className="bg-white p-4 rounded-lg border border-[#f97316] space-y-3 shadow-xs"
                                >
                                  <h4 className="font-extrabold text-[#f97316] text-xs uppercase flex items-center gap-1.5">
                                    <Edit className="w-4 h-4" />
                                    <span>Editar Visita a Terreno</span>
                                  </h4>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block font-bold text-gray-600 mb-1">Responsable</label>
                                      <select
                                        value={editVisitaTecnico}
                                        onChange={(e) => setEditVisitaTecnico(e.target.value)}
                                        className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#f97316]"
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
                                      <label className="block font-bold text-gray-600 mb-1">Fecha</label>
                                      <input
                                        type="date"
                                        value={editVisitaFecha}
                                        onChange={(e) => setEditVisitaFecha(e.target.value)}
                                        className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#f97316]"
                                      />
                                    </div>

                                    <div>
                                      <label className="block font-bold text-gray-600 mb-1">Hora</label>
                                      <input
                                        type="time"
                                        value={editVisitaHora}
                                        onChange={(e) => setEditVisitaHora(e.target.value)}
                                        className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#f97316]"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                      <label className="block font-bold text-gray-600 mb-1">Estado</label>
                                      <select
                                        value={editVisitaEstado}
                                        onChange={(e) => setEditVisitaEstado(e.target.value)}
                                        className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-[#f97316]"
                                      >
                                        <option value="programada">Programada</option>
                                        <option value="realizada">Realizada</option>
                                        <option value="cancelada">Cancelada</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block font-bold text-gray-600 mb-1">Notas / Observaciones</label>
                                      <input
                                        type="text"
                                        value={editVisitaNotas}
                                        onChange={(e) => setEditVisitaNotas(e.target.value)}
                                        className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-[#f97316]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                                    <button
                                      type="button"
                                      onClick={() => setEditingVisitaId(null)}
                                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-[#213343] rounded-md font-bold transition text-xs"
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
                                      className="px-4 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-xs text-xs"
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
                                className="bg-white p-3.5 rounded-lg border border-gray-200 flex flex-col gap-3 hover:border-gray-300 transition shadow-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-normal px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
                                      {responsableNombre}
                                    </span>

                                    <span className="text-[11px] font-black px-2 py-1 rounded-md border bg-gray-50 text-gray-700 border-gray-200">
                                      Visitas a terreno
                                    </span>

                                    <span
                                      className={`text-[11px] font-extrabold px-2 py-1 rounded-md border ${
                                        vis.estado_visita === 'realizada'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : vis.estado_visita === 'cancelada'
                                          ? 'bg-red-50 text-red-700 border-red-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
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
                                      className="p-1.5 bg-white hover:bg-blue-50 text-blue-600 rounded-lg transition border border-gray-200"
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
                                      className="p-1.5 bg-white hover:bg-red-50 text-red-600 rounded-lg transition border border-gray-200"
                                      title="Eliminar Visita"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <strong className="text-[#213343] text-sm block">Visita a terreno</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 font-bold">
                                    <span className="font-mono flex items-center gap-1 text-[#213343]">
                                      <Calendar className="w-3.5 h-3.5 text-[#f97316]" />
                                      {vis.fecha_visita_terreno}
                                    </span>

                                    <span className="font-mono flex items-center gap-1 text-gray-500">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      {vis.hora_visita_terreno || '09:00'} hrs
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 font-semibold">
                                    {[selectedOp.codigo, selectedOp.cliente?.nombre].filter(Boolean).join(' · ')}
                                  </div>

                                  {vis.observaciones_visita && (
                                    <p className="text-gray-600 text-xs pt-1">
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
                className="w-full p-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-purple-300 rounded-lg flex items-center justify-between font-semibold text-sm text-[#213343] transition shadow-xs cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Factory className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform" />
                  <span>Producción y Logística</span>
                </div>
                <div className="flex items-center gap-2">
                  {areaExpanded.produccion ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </button>

              {areaExpanded.produccion && (
                <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-purple-300 space-y-3.5 my-2.5 relative">
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-gray-50 text-[#213343] font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionEventos: !openSections.produccionEventos })}
                        className="flex items-center gap-2.5 hover:text-purple-900 transition cursor-pointer text-left font-semibold text-xs text-[#213343]"
                      >
                        <Calendar className="w-4 h-4 text-purple-600" />
                        <span>Eventos de Producción y Logística</span>
                        {produccionEventos.length > 0 && (
                          <span className="text-xs bg-purple-600 text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {produccionEventos.length}
                          </span>
                        )}
                        {openSections.produccionEventos ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={produccionEventosEnabled}
                            onChange={(e) => setProduccionEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                          <span className="ml-2 text-xs font-bold text-gray-700 capitalize tracking-normal">
                            {produccionEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {produccionEventosEnabled && (
                          <Link
                            href={`/planificacion/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>

                    </div>

                    {openSections.produccionEventos && produccionEventosEnabled && (
                    <div className="p-4 space-y-4 text-xs text-gray-700 bg-white">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <span className="font-bold text-[#213343] text-xs">Eventos registrados para esta oportunidad:</span>
                        <button
                          type="button"
                          onClick={() => {
                            resetProdLogForm('produccion_logistica', 'produccion');
                            setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'produccion_logistica');
                          }}
                          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Agregar Evento</span>
                        </button>
                      </div>

                      {showAddProdLogEventForm && newProdLogContexto === 'produccion_logistica' && (
                        <div className="bg-gray-50 p-4 rounded-lg border border-purple-300 space-y-3">
                          <h4 className="font-extrabold text-purple-700 text-xs uppercase flex items-center gap-1.5">
                            <Plus className="w-4 h-4" />
                            <span>Registrar Evento</span>
                          </h4>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Tipo de evento *</label>
                              <select
                                value={newProdLogTipo}
                                onChange={(e) => {
                                  const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                  setNewProdLogTipo(nextTipo);
                                }}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-purple-500"
                              >
                                <option value="obra">Obra</option>
                                <option value="logistica">Logística</option>
                                <option value="produccion">Producción</option>
                              </select>
                            </div>

                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Fecha *</label>
                              <input
                                type="date"
                                required
                                value={newProdLogFecha}
                                onChange={(e) => setNewProdLogFecha(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-purple-500"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Hora</label>
                              <input
                                type="time"
                                value={newProdLogHora}
                                onChange={(e) => setNewProdLogHora(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Título *</label>
                              <input
                                type="text"
                                value={newProdLogTitulo}
                                onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 font-bold focus:outline-none focus:border-purple-500"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-gray-600 mb-1">Responsable</label>
                              <select
                                value={newProdLogResponsableId}
                                onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-purple-500"
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
                              <label className="block font-bold text-gray-600 mb-1">Estado Inicial</label>
                              <select
                                value={newProdLogEstado}
                                onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-purple-500"
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
                            <label className="block font-bold text-gray-600 mb-1">Notas / Instrucciones</label>
                            <input
                              type="text"
                              placeholder="Ej: coordinar retiro, despacho, fabricación o instalación..."
                              value={newProdLogNotas}
                              onChange={(e) => setNewProdLogNotas(e.target.value)}
                              className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-purple-500"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => setShowAddProdLogEventForm(false)}
                              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-[#213343] rounded-md font-bold transition"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => saveProdLogEvent('produccion_logistica')}
                              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-extrabold transition shadow-xs"
                            >
                              {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                            </button>
                          </div>
                        </div>
                      )}

                      {produccionEventos.length === 0 ? (
                        <div className="py-4 text-center text-gray-500 italic text-xs bg-gray-50 rounded-lg border border-dashed border-gray-200">
                          No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {produccionEventos.map((event) => {
                            const { fecha, hora } = getEventDateParts(event);

                            return (
                              <div
                                key={event.id}
                                className="bg-white p-3.5 rounded-lg border border-gray-200 flex flex-col gap-3 text-[#213343] hover:border-gray-300 transition shadow-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-black uppercase tracking-normal text-[11px] px-2 py-1 rounded-md text-orange-700 bg-orange-50 border border-orange-200">
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
                                      className="p-1.5 bg-white hover:bg-purple-50 text-purple-600 border border-gray-200 rounded-lg transition"
                                      title="Editar evento"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteProdLogEvent(event)}
                                      className="p-1.5 bg-white hover:bg-red-50 text-red-600 border border-gray-200 rounded-lg transition"
                                      title="Eliminar evento"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <strong className="text-[#213343] text-sm block">{event.titulo}</strong>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 font-bold">
                                    <span className="font-mono flex items-center gap-1 text-[#213343]">
                                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                      {fecha}
                                    </span>
                                    <span className="font-mono flex items-center gap-1 text-gray-500">
                                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                                      {hora}
                                    </span>
                                  </div>
                                  {event.observaciones && (
                                    <span className="block text-xs text-gray-500">{event.observaciones}</span>
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
                      <div className="p-4 text-xs text-gray-500 bg-white">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 2.3: Órdenes de Compra (OC) en Producción (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('prod_') && (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-gray-50 text-[#213343] font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, produccionOc: !openSections.produccionOc })}
                        className="flex items-center gap-2.5 hover:text-purple-900 transition cursor-pointer text-left font-semibold text-xs text-[#213343]"
                      >
                        <ShoppingCart className="w-4 h-4 text-purple-600" />
                        <span>Órdenes de Compra (OC) — Insumos de Fabricación</span>
                        <span className="text-xs text-purple-700 font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.produccionOc ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.produccionOc && (
                    <div className="p-4 space-y-3 text-xs bg-white text-[#213343]">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-gray-500">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-gray-500 text-center italic border border-gray-200">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-left text-xs bg-white">
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-200">
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
                            <tbody className="divide-y divide-gray-100">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-gray-50">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-purple-700">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-gray-500">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-[#213343]">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-gray-500">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#213343]">
                                    ${(oc.asignaciones || []).reduce((sum, a) => sum + Number(a.costo_asignado), 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 rounded-lg transition border border-gray-200 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
                                    <Link href={`/ordenes-compra/${oc.id}/asignaciones`} className="block text-[11px] text-[#f97316] font-bold mt-1">Ver asignaciones</Link>
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
                className="w-full p-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-indigo-300 rounded-lg flex items-center justify-between font-semibold text-sm text-[#213343] transition shadow-xs cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span>Reventa y Logística</span>
                </div>
                <div className="flex items-center gap-2">
                  {areaExpanded.reventa ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </div>
              </button>

              {areaExpanded.reventa && (
                <div className="ml-4 sm:ml-6 pl-4 border-l-2 border-indigo-300 space-y-3.5 my-2.5 relative">
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-gray-50 text-[#213343] font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaEventos: !openSections.reventaEventos })}
                        className="flex items-center gap-2.5 hover:text-indigo-900 transition cursor-pointer text-left font-semibold text-xs text-[#213343]"
                      >
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Eventos de Reventa y Logística</span>
                        {reventaEventos.length > 0 && (
                          <span className="text-xs bg-indigo-600 text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                            {reventaEventos.length}
                          </span>
                        )}
                        {openSections.reventaEventos ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>

                      <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={reventaEventosEnabled}
                            onChange={(e) => setReventaEventosEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          <span className="ml-2 text-xs font-bold text-gray-700 capitalize tracking-normal">
                            {reventaEventosEnabled ? 'Habilitado' : 'No Requiere'}
                          </span>
                        </label>
                        {reventaEventosEnabled && (
                          <Link
                            href={`/reventa/calendario?opId=${selectedOp.id}`}
                            className="text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md font-bold flex items-center gap-1 transition lowercase tracking-normal"
                          >
                            <span>Ver Calendario</span>
                          </Link>
                        )}
                      </div>
                    </div>

                    {openSections.reventaEventos && reventaEventosEnabled && (
                      <div className="p-4 space-y-4 text-xs text-gray-700 bg-white">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                          <span className="font-bold text-[#213343] text-xs">Eventos registrados para esta oportunidad:</span>
                          <button
                            type="button"
                            onClick={() => {
                              resetProdLogForm('reventa_logistica', 'reventa');
                              setShowAddProdLogEventForm(!showAddProdLogEventForm || newProdLogContexto !== 'reventa_logistica');
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-xs"
                          >
                            <Plus className="w-4 h-4" />
                            <span>Agregar Evento</span>
                          </button>
                        </div>

                        {showAddProdLogEventForm && newProdLogContexto === 'reventa_logistica' && (
                          <div className="bg-gray-50 p-4 rounded-lg border border-indigo-300 space-y-3">
                            <h4 className="font-extrabold text-indigo-700 text-xs uppercase flex items-center gap-1.5">
                              <Plus className="w-4 h-4" />
                              <span>Registrar Evento</span>
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-gray-600 mb-1">Tipo de evento *</label>
                                <select
                                  value={newProdLogTipo}
                                  onChange={(e) => {
                                    const nextTipo = e.target.value as TipoEventoProduccionLogistica;
                                    setNewProdLogTipo(nextTipo);
                                  }}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500"
                                >
                                  <option value="logistica">Logística</option>
                                  <option value="reventa">Reventa</option>
                                </select>
                              </div>

                              <div>
                                <label className="block font-bold text-gray-600 mb-1">Fecha *</label>
                                <input
                                  type="date"
                                  required
                                  value={newProdLogFecha}
                                  onChange={(e) => setNewProdLogFecha(e.target.value)}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-gray-600 mb-1">Hora</label>
                                <input
                                  type="time"
                                  value={newProdLogHora}
                                  onChange={(e) => setNewProdLogHora(e.target.value)}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block font-bold text-gray-600 mb-1">Título *</label>
                                <input
                                  type="text"
                                  value={newProdLogTitulo}
                                  onChange={(e) => setNewProdLogTitulo(e.target.value)}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 font-bold focus:outline-none focus:border-indigo-500"
                                />
                              </div>

                              <div>
                                <label className="block font-bold text-gray-600 mb-1">Responsable</label>
                                <select
                                  value={newProdLogResponsableId}
                                  onChange={(e) => setNewProdLogResponsableId(e.target.value)}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-bold focus:outline-none focus:border-indigo-500"
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
                                <label className="block font-bold text-gray-600 mb-1">Estado Inicial</label>
                                <select
                                  value={newProdLogEstado}
                                  onChange={(e) => setNewProdLogEstado(e.target.value as EstadoEventoProduccionLogistica)}
                                  className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-2.5 py-1.5 font-extrabold uppercase focus:outline-none focus:border-indigo-500"
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
                              <label className="block font-bold text-gray-600 mb-1">Notas / Instrucciones</label>
                              <input
                                type="text"
                                placeholder="Ej: coordinar proveedor, retiro, despacho o entrega..."
                                value={newProdLogNotas}
                                onChange={(e) => setNewProdLogNotas(e.target.value)}
                                className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
                              <button
                                type="button"
                                onClick={() => setShowAddProdLogEventForm(false)}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-[#213343] rounded-md font-bold transition"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => saveProdLogEvent('reventa_logistica')}
                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-extrabold transition shadow-xs"
                              >
                                {editingProdLogEventId ? 'Guardar cambios' : 'Guardar evento'}
                              </button>
                            </div>
                          </div>
                        )}

                        {reventaEventos.length === 0 ? (
                          <div className="py-4 text-center text-gray-500 italic text-xs bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            No hay eventos registrados. Haz clic en <strong>&quot;+ Agregar Evento&quot;</strong> para programar obra, logística o producción.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {reventaEventos.map((event) => {
                              const { fecha, hora } = getEventDateParts(event);

                              return (
                                <div
                                  key={event.id}
                                  className="bg-white p-3.5 rounded-lg border border-gray-200 flex flex-col gap-3 text-[#213343] hover:border-gray-300 transition shadow-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-black uppercase tracking-normal text-[11px] px-2 py-1 rounded-md text-orange-700 bg-orange-50 border border-orange-200">
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
                                        className="p-1.5 bg-white hover:bg-indigo-50 text-indigo-600 border border-gray-200 rounded-lg transition"
                                        title="Editar evento"
                                      >
                                        <Edit className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteProdLogEvent(event)}
                                        className="p-1.5 bg-white hover:bg-red-50 text-red-600 border border-gray-200 rounded-lg transition"
                                        title="Eliminar evento"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <strong className="text-[#213343] text-sm block">{event.titulo}</strong>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 font-bold">
                                      <span className="font-mono flex items-center gap-1 text-[#213343]">
                                        <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                                        {fecha}
                                      </span>
                                      <span className="font-mono flex items-center gap-1 text-gray-500">
                                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                                        {hora}
                                      </span>
                                    </div>
                                    {event.observaciones && (
                                      <span className="block text-xs text-gray-500">{event.observaciones}</span>
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
                      <div className="p-4 text-xs text-gray-500 bg-white">
                        Habilita eventos para registrar obra, logística o producción.
                      </div>
                    )}
                  </div>

                  {/* Accordion 3.2: Órdenes de Compra (OC) en Reventa (Ajustes 11 - Req 7) */}
                  {selectedOp.estado_pipeline?.startsWith('rev_') && (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                    <div className="w-full p-3 bg-gray-50 text-[#213343] font-semibold text-xs flex flex-wrap items-center justify-between gap-3 border-b border-gray-200">
                      <button
                        type="button"
                        onClick={() => setOpenSections({ ...openSections, reventaOc: !openSections.reventaOc })}
                        className="flex items-center gap-2.5 hover:text-indigo-900 transition cursor-pointer text-left font-semibold text-xs text-[#213343]"
                      >
                        <ShoppingCart className="w-4 h-4 text-indigo-600" />
                        <span>Órdenes de Compra a Proveedores / Distribución</span>
                        <span className="text-xs text-indigo-700 font-mono font-bold">
                          {opOrdenesCompra.length} {opOrdenesCompra.length === 1 ? 'OC' : 'OCs'}
                        </span>
                        {openSections.reventaOc ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCreateOcModal(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear Orden de Compra</span>
                      </button>
                    </div>

                    {openSections.reventaOc && (
                    <div className="p-4 space-y-3 text-xs bg-white text-[#213343]">
                      {loadingOpOrdenes ? (
                        <div className="text-center py-4 text-gray-500">Cargando órdenes de compra...</div>
                      ) : opOrdenesCompra.length === 0 ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-gray-500 text-center italic border border-gray-200">
                          No hay órdenes de compra emitidas para esta oportunidad.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="w-full text-left text-xs bg-white">
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] border-b border-gray-200">
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
                            <tbody className="divide-y divide-gray-100">
                              {opOrdenesCompra.map((oc) => (
                                <tr key={oc.id} className="hover:bg-gray-50">
	                                  <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
	                                    {oc.numero_oc}
	                                  </td>
	                                  <td className="py-2.5 px-3 text-center font-mono text-gray-500">
	                                    v{oc.version || 1}
	                                  </td>
	                                  <td className="py-2.5 px-3 font-bold text-[#213343]">
                                    {oc.proveedor?.nombre || 'Proveedor'}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-gray-500">
                                    {oc.fecha_emision}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#213343]">
                                    ${(oc.asignaciones || []).reduce((sum, a) => sum + Number(a.costo_asignado), 0).toLocaleString('es-CL')}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">
                                      {oc.estado}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPdfPreviewOc(oc)}
                                      className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 rounded-lg transition border border-gray-200 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>Ver / Imprimir OC</span>
                                    </button>
                                    <Link href={`/ordenes-compra/${oc.id}/asignaciones`} className="block text-[11px] text-[#f97316] font-bold mt-1">Ver asignaciones</Link>
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

                {/* Accordion: Archivos Adjuntos (Ubicado debajo de Reventa y Logística) */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                  <div className="w-full p-3 bg-white hover:bg-gray-50 text-[#213343] font-semibold text-sm flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 transition">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, antecedentes: !openSections.antecedentes })}
                      className="flex items-center gap-2.5 hover:text-[#ea580c] transition cursor-pointer text-left font-semibold text-sm text-[#213343]"
                    >
                      <Paperclip className="w-4 h-4 text-[#f97316]" />
                      <span>Archivos adjuntos</span>
                      {opAntecedentesList.length > 0 && (
                        <span className="text-xs bg-[#f97316] text-white font-mono font-bold px-2 py-0.5 rounded-full lowercase tracking-normal">
                          {opAntecedentesList.length}
                        </span>
                      )}
                      {openSections.antecedentes ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </button>

                    <label className="text-xs font-semibold bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white border border-orange-200 px-3 py-1.5 rounded-md transition flex items-center gap-1.5 cursor-pointer">
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
                            alert(`Error al subir archivo: ${err?.message || 'Error desconocido'}`);
                          } finally {
                            setAntecedenteUploading(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>

                  {openSections.antecedentes && (
                    <div className="p-4 space-y-3 text-xs bg-white text-[#213343]">
                      {opAntecedentesList.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200 space-y-2">
                          <Paperclip className="w-8 h-8 text-gray-400 mx-auto opacity-50" />
                          <p className="font-semibold text-gray-700">No hay archivos adjuntos en esta oportunidad.</p>
                          <p className="text-[11px] text-gray-500">
                            Puedes adjuntar archivos desde el botón superior o enviándolos directamente en el chat de actividad.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100 bg-white rounded-lg border border-gray-200 overflow-hidden shadow-xs">
                          {opAntecedentesList.map((doc) => {
                            const isImg = doc.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(doc.nombre);
                            const isPdf = doc.mime_type?.includes('pdf') || /\.pdf$/i.test(doc.nombre);

                            return (
                              <div
                                key={doc.id}
                                className="p-3 hover:bg-gray-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                                    {isPdf ? (
                                      <FileText className="w-4 h-4 text-red-500" />
                                    ) : isImg ? (
                                      <Paperclip className="w-4 h-4 text-blue-500" />
                                    ) : (
                                      <FileCheck className="w-4 h-4 text-[#f97316]" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-[#213343] text-xs truncate max-w-xs sm:max-w-md block" title={doc.nombre}>
                                        {doc.nombre}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5 font-mono">
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
                                    className="px-3 py-1.5 bg-white hover:bg-orange-50 text-gray-700 hover:text-[#f97316] rounded-md font-bold border border-gray-200 transition text-xs flex items-center gap-1.5"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Ver / Descargar</span>
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAntecedente(doc.id)}
                                    className="p-1.5 bg-white hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-md border border-gray-200 transition"
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
            </div>
              </div>
            </div>

            {/* Separador Vertical Resizable (Barra para arrastrar y cambiar ancho) */}
            <div
              onMouseDown={handleMouseDownModalResizer}
              className="hidden lg:flex w-4 hover:w-4 bg-transparent hover:bg-amber-500/20 active:bg-amber-500/30 cursor-col-resize select-none items-center justify-center group z-20 relative mx-1 transition-all rounded-full shrink-0"
              title="Arrastrar para ajustar el ancho entre Información y Actividad (Tu configuración se guardará automáticamente)"
            >
              <div className="w-1.5 h-14 rounded-full bg-gray-300 group-hover:bg-[#f97316] group-active:bg-[#f97316] transition-colors shadow-xs" />
            </div>

            {/* Columna Derecha: Feed de Actividades (Ancho Resizable) */}
            <div
              style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${100 - modalLeftColRatio}%` : '100%' }}
              className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-4 sm:p-5 flex flex-col justify-between h-[45vh] lg:h-full overflow-hidden shadow-xs shrink-0"
            >
              <div className="space-y-3.5 flex-1 flex flex-col overflow-hidden">
                {/* Header de Actividad con Título e Íconos ClickUp */}
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-black text-base sm:text-lg text-[#213343] uppercase tracking-normal flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-[#f97316]" />
                      <span>Actividad</span>
                    </h3>
                    <span className="text-xs bg-white text-gray-700 font-bold px-2.5 py-0.5 rounded-full border border-gray-200 font-mono">
                      {(selectedOp.chat_interno || []).length}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botón Cerrar Modal */}
                    <button
                      onClick={handleCloseOportunidad}
                      className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-200 transition font-bold text-lg leading-none ml-1"
                      title="Cerrar Modal"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Barra de Filtros de Actividad (Todos / Comentarios / Acciones / Reclamos) */}
                <div className="flex items-center gap-1.5 p-1 bg-white rounded-md border border-gray-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setActivityFilter('all')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'all'
                        ? 'bg-[#f97316] text-white shadow-xs'
                        : 'text-gray-500 hover:text-[#213343] hover:bg-gray-100'
                    }`}
                  >
                    <span>Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('comentarios')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'comentarios'
                        ? 'bg-[#f97316] text-white shadow-xs'
                        : 'text-gray-500 hover:text-[#213343] hover:bg-gray-100'
                    }`}
                  >
                    <span>Comentarios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('sistema')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'sistema'
                        ? 'bg-[#f97316] text-white shadow-xs'
                        : 'text-gray-500 hover:text-[#213343] hover:bg-gray-100'
                    }`}
                  >
                    <span>Acciones</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('reclamos')}
                    className={`flex-1 py-1 px-1.5 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'reclamos'
                        ? 'bg-red-500 text-white shadow-xs'
                        : 'text-red-500 hover:text-red-700 hover:bg-red-50'
                    }`}
                  >
                    <span>Reclamos</span>
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
                      className="w-full bg-white text-[#213343] border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-[#f97316]"
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
                        <div className="text-center py-14 text-gray-500 italic text-xs space-y-2">
                          <MessageSquare className="w-10 h-10 text-gray-300 mx-auto opacity-60" />
                          <p className="font-semibold text-gray-700">No hay actividades registradas.</p>
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
                        // Tarjeta de Comentario de Usuario (Estilo ClickUp / HubSpot Minimalista)
                        return (
                          <div
                            key={msg.id}
                            className={`p-4 rounded-lg border shadow-xs space-y-3 transition ${
                              isReclamoMsg
                                ? 'bg-red-50/70 border-red-200 hover:border-red-300'
                                : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full font-black text-xs flex items-center justify-center border shrink-0 ${
                                    isReclamoMsg
                                      ? 'bg-red-100 text-red-600 border-red-200'
                                      : 'bg-orange-50 text-[#f97316] border-orange-200'
                                  }`}
                                >
                                  {isReclamoMsg ? (
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                  ) : (
                                    <User className="w-4 h-4 text-[#f97316]" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-[#213343] text-sm block leading-none">
                                      {msg.usuario_nombre}
                                    </span>
                                    {isReclamoMsg && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-700 border border-red-200">
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

                            <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                              {renderMessageContentWithMentions(msg.contenido)}
                            </p>

                            <div className="flex items-center justify-end pt-2 border-t border-gray-100 text-xs">
                              <button
                                type="button"
                                onClick={() => setChatInput(`@${msg.usuario_nombre} `)}
                                className="font-bold text-gray-500 hover:text-[#f97316] transition flex items-center gap-1"
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
                          className="flex items-start gap-2.5 py-2 px-3 rounded-md hover:bg-gray-100 transition text-xs sm:text-sm"
                        >
                          <span className="text-[#f97316] font-bold text-base select-none shrink-0">•</span>
                          <div className="flex-1 flex flex-wrap items-center justify-between gap-1.5">
                            <span className="text-gray-600">
                              <strong className="text-[#213343] font-bold">{msg.usuario_nombre}</strong>{' '}
                              <span className="text-gray-600 ml-1">{msg.contenido}</span>
                            </span>
                            <span className="text-gray-400 text-xs font-mono shrink-0 ml-auto">
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
                      className="bg-[#f97316] hover:bg-[#ea580c] text-white px-3 py-1.5 rounded-full shadow-md transition flex items-center gap-1.5 text-xs font-black border border-white/20 active:scale-95"
                      title="Ir a la actividad más reciente"
                    >
                      <span>Ir a la más reciente</span>
                      <ChevronDown className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Input de Comentarios en el Fondo del Panel Lateral (Estilo ClickUp con Barra de Botones) */}
              <div className="pt-3 border-t border-gray-200 relative text-sm" ref={mentionRef}>
                {mentionMenuOpen && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-3 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="p-2.5 bg-gray-50 text-gray-600 font-bold text-xs uppercase tracking-normal border-b border-gray-200 flex justify-between items-center">
                      <span>Mencionar integrante:</span>
                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(false)}
                        className="text-gray-400 hover:text-gray-700 font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                      {filteredMentionUsers.map((usr, idx) => (
                        <button
                          key={usr.id}
                          type="button"
                          onClick={() => handleInsertMention(usr.nombre)}
                          className={`w-full text-left px-3.5 py-2.5 text-xs transition flex items-center justify-between ${
                            idx === selectedMentionIndex ? 'bg-[#f97316] text-white' : 'text-gray-700 hover:bg-orange-50 hover:text-[#f97316]'
                          }`}
                        >
                          <span className="font-bold">{usr.nombre}</span>
                          <span className="text-[10px] opacity-80 uppercase font-mono">{usr.rol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-white border border-gray-200 focus-within:border-[#f97316] rounded-lg p-3 shadow-xs space-y-2 transition">
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
                    className="w-full bg-transparent text-[#213343] font-medium text-sm focus:outline-none placeholder-gray-400 min-h-[50px] resize-none"
                  />

                  {/* Fichas de archivos encolados para enviar con este comentario */}
                  {stagedChatFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 pb-1">
                      {stagedChatFiles.map((f, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-md text-xs text-gray-700 shadow-xs"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
                          <span className="font-medium truncate max-w-[160px]">{f.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">({Math.round(f.size / 1024)} KB)</span>
                          <button
                            type="button"
                            onClick={() => setStagedChatFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-400 hover:text-red-500 ml-1 font-bold text-xs"
                            title="Quitar archivo"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Barra Inferior de Herramientas del Comentario */}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                    <div className="flex items-center gap-2 text-gray-400">
                      {/* Botón Adjuntar Archivos al mensaje */}
                      <label className="p-1.5 hover:text-[#f97316] hover:bg-gray-100 rounded-lg transition cursor-pointer" title="Adjuntar archivo(s) al mensaje">
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
                        className="p-1.5 hover:text-[#f97316] hover:bg-gray-100 rounded-lg transition"
                        title="Mencionar a alguien"
                      >
                        <AtSign className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsReclamoMode(!isReclamoMode)}
                        className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 text-xs font-black ${
                          isReclamoMode
                            ? 'bg-red-500 text-white shadow-xs'
                            : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                        }`}
                        title="Marcar este mensaje como Reclamo / Postventa"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{isReclamoMode ? 'Modo Reclamo' : 'Reclamo'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={(!chatInput.trim() && stagedChatFiles.length === 0) || isUploadingChatFiles}
                      onClick={handleSendChatMessage}
                      className={`${
                        isReclamoMode ? 'bg-red-500 hover:bg-red-600' : 'bg-[#f97316] hover:bg-[#ea580c]'
                      } text-white p-2.5 rounded-md transition flex items-center justify-center shadow-xs shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
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
            if (opError) setCotizacionErrorMsg(opError.message);
            setSelectedOp((prev) => prev ? { ...prev, cotizacion_actual_id: opData?.cotizacion_actual_id || undefined } : null);
            setOportunidades((prev) => prev.map((op) => op.id === selectedOp.id
              ? { ...op, cotizacion_actual_id: opData?.cotizacion_actual_id || undefined } : op));
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
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-extrabold text-[#213343] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#f97316]" />
                <span>Registrar Nueva Oportunidad de Venta</span>
              </h3>
              <button onClick={() => setShowNewOpModal(false)} className="text-gray-400 hover:text-[#213343] text-lg font-bold">
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
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] placeholder-gray-400 focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Cliente Asociado *</label>
                <select
                  required
                  value={nuevoClienteId}
                  onChange={(e) => setNuevoClienteId(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
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
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316]"
                >
                  <option value="Instalación">Instalación (Montaje y Trabajo en Obra)</option>
                  <option value="Suministro">Suministro (Producción Directa)</option>
                  <option value="Reventa de Material">Reventa de Material (Distribución)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Origen *</label>
                  <select
                    value={nuevoOrigen}
                    onChange={(e) => setNuevoOrigen(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316] cursor-pointer"
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
                  <label className="block font-bold text-gray-700 mb-1">Sólo material o instalación</label>
                  <select
                    value={nuevaModalidadRequerimiento}
                    onChange={(e) => setNuevaModalidadRequerimiento(e.target.value as 'solo_material' | 'instalacion')}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316]"
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
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowNewOpModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm"
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
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Oportunidad de Supabase</span>
              </h3>
              <button onClick={() => setOpToDelete(null)} className="text-gray-400 hover:text-[#213343] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar la oportunidad <strong className="font-mono text-[#213343]">{opToDelete.codigo}</strong> (&quot;{opToDelete.titulo}&quot;)?
              </p>
              <p className="bg-red-50 p-3 rounded-md border border-red-200 text-red-900 font-medium">
                Esta acción eliminará permanentemente la oportunidad de la base de datos de Supabase.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setOpToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteOportunidad}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-md transition shadow-sm flex items-center gap-1.5"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Cotización de Supabase</span>
              </h3>
              <button onClick={() => setCotToDeleteInModal(null)} className="text-gray-400 hover:text-[#213343] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar la cotización <strong className="font-mono text-[#213343]">{cotToDeleteInModal.numero_cotizacion}</strong> por <strong className="text-emerald-700">${(cotToDeleteInModal.monto_total || 0).toLocaleString('es-CL')}</strong>?
              </p>
              <p className="bg-red-50 p-3 rounded-md border border-red-200 text-red-900 font-medium">
                Esta acción la eliminará de Supabase.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCotToDeleteInModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCotizacionInModal}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-md transition shadow-sm flex items-center gap-1.5"
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
            className="bg-white text-[#213343] border border-gray-200 rounded-lg max-w-md w-full p-6 shadow-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#213343]">Requisito de Abono Mínimo (50%)</h3>
                <p className="text-xs text-gray-500 font-medium">No se puede mover la oportunidad de estado</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-gray-700 font-medium leading-relaxed">
                Para cambiar la oportunidad <strong className="font-mono text-[#f97316]">{abonoWarningModal.op.codigo}</strong> al estado de Venta Cerrada o Producción, se requiere registrar un abono equivalente a al menos el <strong className="text-amber-800 font-bold">50% o 100%</strong> del monto total.
              </p>

              <div className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 space-y-2 font-mono text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Monto Total Venta:</span>
                  <span className="font-bold text-[#213343]">${abonoWarningModal.montoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Abonado actualmente:</span>
                  <span className="font-bold text-amber-700">${abonoWarningModal.montoAbonado.toLocaleString('es-CL')} ({abonoWarningModal.porcentajeActual}%)</span>
                </div>
                <div className="flex justify-between text-[#f97316] font-black border-t border-gray-200 pt-2 text-xs">
                  <span>Requerido mínimo (50%):</span>
                  <span>${Math.round(abonoWarningModal.montoTotal * 0.5).toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAbonoWarningModal(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition"
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
                className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold rounded-md transition shadow-sm flex items-center gap-1.5"
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
            className="fixed z-[101] bg-[#1c1c1f] text-gray-100 border border-gray-800 rounded-lg shadow-sm p-3 min-w-[280px] space-y-3 "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Popover con Buscador ClickUp */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2 px-1">
                <span className="text-[11px] font-black uppercase text-gray-300 tracking-normal">Estado del Pipeline</span>
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
                  className="w-full bg-[#27272a] text-gray-200 border border-gray-700 focus:border-[#f97316] text-xs rounded-md pl-8 pr-3 py-1.5 focus:outline-none transition placeholder-gray-500 font-medium"
                  autoFocus
                />
              </div>
            </div>

            {/* Listado Agrupado de Estados con Filtro */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
              {[SECCION_COMERCIAL].map((sec) => {
                const filteredEtapas = sec.etapas.filter((st) =>
                  st.label.toLowerCase().includes(statusSearchQuery.toLowerCase())
                );
                if (filteredEtapas.length === 0) return null;

                return (
                  <div key={sec.id} className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-gray-400 tracking-normal px-2 py-0.5 block">
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
                              ? 'bg-[#27272a] text-[#f97316] border border-[#f97316]/40 shadow-sm'
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
                            <span className="text-[11px] font-extrabold uppercase tracking-normal">{st.label}</span>
                          </div>
                          {isCurrent && <Check className="w-4 h-4 text-[#f97316]" />}
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
