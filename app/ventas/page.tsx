'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { MOCK_OPORTUNIDADES, MOCK_CLIENTES, MOCK_USUARIOS } from '../../lib/supabase/mock-data';
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
} from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
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
  Smile,
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'lista' | 'tablero'>('lista');

  // Sorting & List View Section Collapsing State
  const [sortField, setSortField] = useState<'titulo' | 'cliente' | 'tipo_venta' | 'fecha_inicio' | 'fecha_limite' | 'monto' | 'prioridad'>('titulo');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [stageMenuPos, setStageMenuPos] = useState<{ opId: string; top: number; left: number } | null>(null);

  // Deletion Modal State for Oportunidad
  const [opToDelete, setOpToDelete] = useState<OportunidadVenta | null>(null);
  const [cotToDeleteInModal, setCotToDeleteInModal] = useState<Cotizacion | null>(null);

  // Accordion Sections State in Modal (Todas cerradas por defecto)
  const [openSections, setOpenSections] = useState<{ contacto: boolean; productos: boolean; finanzas: boolean; visita: boolean; produccion: boolean; reventa: boolean }>({
    contacto: false,
    productos: false,
    finanzas: false,
    visita: false,
    produccion: false,
    reventa: false,
  });

  const [planificacionData, setPlanificacionData] = useState<{
    id?: string;
    estado?: string;
    fecha_estimada_produccion?: string;
    fecha_estimada_instalacion?: string;
    observaciones?: string;
  } | null>(null);

  const [reventaData, setReventaData] = useState<{
    id?: string;
    estado?: string;
    proveedor_nombre?: string;
    fecha_despacho?: string;
    observaciones?: string;
    notas_postventa?: string;
  } | null>(null);

  // Modal Cotización Unificado State
  const [showUnifiedCotModal, setShowUnifiedCotModal] = useState(false);

  // Drag & Drop State
  const [draggedOpId, setDraggedOpId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<EstadoPipeline | null>(null);

  // Toast / Mention Notifications
  const [toastAlert, setToastAlert] = useState<{ id: string; message: string; user: string } | null>(null);

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
  const [activityFilter, setActivityFilter] = useState<'all' | 'comentarios' | 'sistema'>('all');
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
    try {
      const { data } = await supabase
        .from('visitas_terreno')
        .select('*')
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
          tecnico_visita: op.tecnico_visita || 'Felipe Valverde',
          fecha_visita_terreno: op.fecha_visita_terreno,
          hora_visita_terreno: op.hora_visita_terreno || '09:00',
          estado_visita: op.estado_visita || 'programada',
          observaciones_visita: op.observaciones_visita || '',
        });
      }

      setOpVisitasList(list);
    } catch (err) {
      console.error('Error loading visitas:', err);
      setOpVisitasList([]);
    }
  };

  const loadPlanificacionYReventa = async (opId: string) => {
    if (!isUUID(opId)) return;
    try {
      const [planRes, revRes] = await Promise.all([
        supabase.from('proyectos_planificacion').select('*').eq('oportunidad_id', opId).maybeSingle(),
        supabase.from('ordenes_reventa').select('*').eq('oportunidad_id', opId).maybeSingle(),
      ]);

      if (planRes.data) {
        setPlanificacionData(planRes.data);
      } else {
        setPlanificacionData(null);
      }

      if (revRes.data) {
        setReventaData(revRes.data);
      } else {
        setReventaData(null);
      }
    } catch (err) {
      console.error('Error loading planificacion and reventa data:', err);
    }
  };

  // Helper to open opportunity and update URL
  const handleOpenOportunidad = (op: OportunidadVenta) => {
    setOpenSections({
      contacto: false,
      productos: false,
      finanzas: false,
      visita: false,
      produccion: false,
      reventa: false,
    });
    setSelectedOp(op);
    setEditTitleValue(op.titulo);
    loadLatestActivities(op.id);
    loadVisitasOportunidad(op);
    loadPlanificacionYReventa(op.id);
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
  const [isActividadesExpanded, setIsActividadesExpanded] = useState(false);

  // Visitas a Terreno Múltiples State
  const [opVisitasList, setOpVisitasList] = useState<VisitaTerreno[]>([]);
  const [showAddVisitaForm, setShowAddVisitaForm] = useState(false);
  const [newVisitaTecnico, setNewVisitaTecnico] = useState<string>('Felipe Valverde');
  const [newVisitaFecha, setNewVisitaFecha] = useState<string>('');
  const [newVisitaHora, setNewVisitaHora] = useState<string>('09:00');
  const [newVisitaEstado, setNewVisitaEstado] = useState<string>('programada');
  const [newVisitaNotas, setNewVisitaNotas] = useState<string>('');

  // Editing Visita State
  const [editingVisitaId, setEditingVisitaId] = useState<string | null>(null);
  const [editVisitaTecnico, setEditVisitaTecnico] = useState<string>('Felipe Valverde');
  const [editVisitaFecha, setEditVisitaFecha] = useState<string>('');
  const [editVisitaHora, setEditVisitaHora] = useState<string>('09:00');
  const [editVisitaEstado, setEditVisitaEstado] = useState<string>('programada');
  const [editVisitaNotas, setEditVisitaNotas] = useState<string>('');

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
            .select('*, cliente:clientes(*), cotizaciones(*)')
            .order('created_at', { ascending: false }),
          supabase.from('clientes').select('*'),
          supabase.from('usuarios').select('*').eq('activo', true),
          supabase.from('cotizaciones').select('*, cliente:clientes(*), items:cotizacion_items(*)'),
          supabase.from('actividades_op').select('*').order('created_at', { ascending: true }),
        ]);

        if (!ignore) {
          if (cliRes.data) {
            setClientes(cliRes.data as Cliente[]);
          } else {
            setClientes([]);
          }

          if (usrRes.data) {
            setUsuariosApp(usrRes.data as Usuario[]);
          } else if (usersList && usersList.length > 0) {
            setUsuariosApp(usersList);
          } else {
            setUsuariosApp([]);
          }

          if (opRes.data) {
            const rawOps = opRes.data as OportunidadVenta[];
            const allDbAct = actRes.data || [];

            const mergedOps = rawOps.map((op) => {
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

              return { ...op, chat_interno: mergedChat };
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
            const found = opRes.data.find((o: any) => o.id === targetOpId);
            if (found) {
              setOpenSections({
                contacto: false,
                productos: false,
                finanzas: false,
                visita: false,
                produccion: false,
                reventa: false,
              });
              setSelectedOp(found as OportunidadVenta);
              setEditTitleValue(found.titulo);
              loadLatestActivities(found.id);
              loadVisitasOportunidad(found as OportunidadVenta);
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
        (payload) => {
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
        (payload) => {
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
            if (prev) loadVisitasOportunidad(prev);
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
        },
        (payload) => {
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
        typeof f === 'string' ? { name: f, url: '#' } : f
      );
      setPagoFiles(pFiles);

      // Fetch persistent activities from actividades_op table in Supabase
      if (isUUID(selectedOp.id)) {
        supabase
          .from('actividades_op')
          .select('*')
          .eq('oportunidad_id', selectedOp.id)
          .order('created_at', { ascending: true })
          .then(({ data, error }) => {
            if (!ignore && !error && data && data.length > 0) {
              const actMsgs: ChatMensaje[] = data.map((d: any) => ({
                id: d.id,
                usuario_id: d.usuario_id || 'sistema',
                usuario_nombre: d.usuario_nombre || 'Sistema',
                contenido: d.contenido,
                created_at: d.created_at,
                tipo: d.tipo || 'actualizacion',
              }));
              setSelectedOp((prev) => (prev ? { ...prev, chat_interno: actMsgs } : null));
            }
          });
      }
    }
    return () => {
      ignore = true;
    };
  }, [selectedOp?.id]);

  const SECCIONES_PIPELINE = [
    {
      id: 'ventas',
      nombre: 'Sección 1: Área Comercial & Ventas',
      descripcion: 'Gestión de prospección, cotizaciones, validación de pago y cierre comercial.',
      badge: '💼 Comercial',
      badgeBg: 'bg-amber-100 border-amber-300',
      badgeText: 'text-amber-900',
      etapas: [
        { id: 'nueva' as EstadoPipeline, label: '1. Nueva Oportunidad', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'pagada' as EstadoPipeline, label: '2. Pago Validado', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'entregada' as EstadoPipeline, label: '3. Venta Cerrada', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
      ],
    },
    {
      id: 'produccion',
      nombre: 'Sección 2: Área de Producción & Instalación',
      descripcion: 'Planificación de fabricación, control de planta y ejecución de instalaciones en terreno.',
      badge: '🏭 Producción',
      badgeBg: 'bg-purple-100 border-purple-300',
      badgeText: 'text-purple-900',
      etapas: [
        { id: 'prod_pendiente' as EstadoPipeline, label: '4. Pendiente Planificación', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'prod_cola' as EstadoPipeline, label: '5. En Cola de Fabricación', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'prod_fabricacion' as EstadoPipeline, label: '6. En Fabricación', color: 'border-purple-300 text-purple-900', bg: 'bg-purple-50' },
        { id: 'prod_listo_instalacion' as EstadoPipeline, label: '7. Listo p/ Instalación', color: 'border-indigo-300 text-indigo-900', bg: 'bg-indigo-50' },
        { id: 'prod_instalacion' as EstadoPipeline, label: '8. En Instalación', color: 'border-orange-300 text-orange-900', bg: 'bg-orange-50' },
        { id: 'prod_finalizado' as EstadoPipeline, label: '9. Finalizado / Entregado', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
      ],
    },
    {
      id: 'reventa',
      nombre: 'Sección 3: Área de Reventa & Logística',
      descripcion: 'Coordinación con proveedores, confirmación de stock y despachos.',
      badge: '🚚 Logística & Reventa',
      badgeBg: 'bg-indigo-100 border-indigo-300',
      badgeText: 'text-indigo-900',
      etapas: [
        { id: 'rev_coordinacion' as EstadoPipeline, label: '10. Coordinación Proveedor', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
        { id: 'rev_stock' as EstadoPipeline, label: '11. Confirmación Stock', color: 'border-indigo-300 text-indigo-900', bg: 'bg-indigo-50' },
        { id: 'rev_listo_retiro' as EstadoPipeline, label: '12. Listo para Retiro', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
        { id: 'rev_listo_despacho' as EstadoPipeline, label: '13. Listo para Despacho', color: 'border-orange-300 text-orange-900', bg: 'bg-orange-50' },
        { id: 'rev_entregado' as EstadoPipeline, label: '14. Entregado al Cliente', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
        { id: 'rev_postventa' as EstadoPipeline, label: '15. Postventa & Seguimiento', color: 'border-purple-300 text-purple-900', bg: 'bg-purple-50' },
      ],
    },
  ];

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

  // Helper for sorting table headers
  const renderSortHeader = (
    label: string,
    field: 'titulo' | 'cliente' | 'tipo_venta' | 'fecha_inicio' | 'fecha_limite' | 'monto' | 'prioridad',
    align: 'left' | 'center' | 'right' = 'left',
    widthClass?: string
  ) => {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => {
          if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
          } else {
            setSortField(field);
            setSortDirection('asc');
          }
        }}
        className={`py-2.5 px-3 cursor-pointer hover:text-[#F7931F] transition select-none text-${align} text-xs font-extrabold uppercase tracking-wider text-gray-500 ${widthClass || ''}`}
      >
        <div
          className={`flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[#F7931F]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[#F7931F]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-40 hover:opacity-100" />
          )}
        </div>
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
    tipo: 'comentario' | 'actualizacion' | 'abono' = 'actualizacion'
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

  // Mover Oportunidad en el Pipeline
  const moveOportunidadToState = async (opId: string, targetState: EstadoPipeline) => {
    const targetOp = oportunidades.find((o) => o.id === opId);
    if (!targetOp || targetOp.estado_pipeline === targetState) return;

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

    if (targetState === 'entregada') {
      const isReventa = targetOp.tipo_venta === 'Suministro' || targetOp.tipo_venta === 'Reventa de Material';

      if (isReventa) {
        setToastAlert({
          id: Date.now().toString(),
          message: `Venta cerrada transferida automáticamente al Pipeline de Reventa & Proveedores.`,
          user: 'Sistema CRM',
        });
        if (isUUID(opId)) {
          try {
            await supabase.from('ordenes_reventa').upsert([
              {
                oportunidad_id: opId,
                codigo: targetOp.codigo,
                titulo: targetOp.titulo,
                cliente_id: targetOp.cliente_id,
                estado: 'coordinacion_proveedor',
                observaciones: 'Transferido automáticamente al cerrar venta de Suministro/Reventa.',
              },
            ], { onConflict: 'oportunidad_id' });
          } catch (e) {
            console.error('Error auto-creating reventa:', e);
          }
        }
      } else {
        setToastAlert({
          id: Date.now().toString(),
          message: `Venta cerrada transferida automáticamente al Pipeline de Producción.`,
          user: 'Sistema CRM',
        });
        if (isUUID(opId)) {
          try {
            await supabase.from('proyectos_planificacion').upsert([
              {
                oportunidad_id: opId,
                codigo: targetOp.codigo,
                titulo: targetOp.titulo,
                cliente_id: targetOp.cliente_id,
                estado: 'pendiente',
                observaciones: 'Transferido automáticamente al cerrar venta de Instalación.',
              },
            ], { onConflict: 'oportunidad_id' });
          } catch (e) {
            console.error('Error auto-creating planificacion:', e);
          }
        }
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
    setChatInput('');
    setMentionMenuOpen(false);

    // Add activity (saves to actividades_op table and logs_sistema)
    await addOportunidadActividad(selectedOp.id, msgContent, 'comentario');

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

    let publicUrl = '#';
    try {
      const fileName = `pago_${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage.from('documentos').upload(fileName, file);
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(fileName);
        if (urlData) publicUrl = urlData.publicUrl;
      } else {
        publicUrl = URL.createObjectURL(file);
      }
    } catch {
      publicUrl = URL.createObjectURL(file);
    }

    const fileObj = { name: file.name, url: publicUrl };
    const updated = [...pagoFiles, fileObj];
    setPagoFiles(updated);
    updateOportunidadField(selectedOp.id, 'comprobantes_pago', updated.map((f) => f.name));
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
      } else {
        console.error('Error creating oportunidad in Supabase:', error?.message || error);
        alert(`Error al crear la oportunidad en Supabase: ${error?.message || 'Comprueba los datos ingresados.'}`);
      }
    } catch (err: any) {
      console.error('Error creating oportunidad:', err);
      alert(`Error al conectar con Supabase: ${err?.message || 'Error inesperado.'}`);
    }
  };

  const handleSaveTitleEdit = () => {
    if (selectedOp && editTitleValue.trim()) {
      updateOportunidadField(selectedOp.id, 'titulo', editTitleValue);
    }
    setIsEditingTitle(false);
  };

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
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Oportunidad</span>
          </button>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => setActiveTab('lista')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 ${
                activeTab === 'lista' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setActiveTab('tablero')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 ${
                activeTab === 'tablero' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Tablero</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : activeTab === 'tablero' ? (
        /* Vista Tablero Kanban agrupada por Secciones */
        <div className="space-y-8 animate-fadeIn">
          {SECCIONES_PIPELINE.map((sec) => (
            <div key={sec.id} className="space-y-4">
              {/* Header de Sección */}
              <div className={`p-4 rounded-3xl border ${sec.badgeBg} flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase tracking-wider ${sec.badgeText} px-3 py-1 rounded-xl bg-white border border-current shadow-2xs`}>
                    {sec.badge}
                  </span>
                  <h3 className="text-base font-extrabold text-[#363636]">{sec.nombre}</h3>
                </div>
                <p className="text-xs text-gray-600 font-medium">{sec.descripcion}</p>
              </div>

              {/* Columnas Kanban de esta Sección */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
                {sec.etapas.map((col) => {
                  const colOps = oportunidades.filter((o) => o.estado_pipeline === col.id);
                  const isTargetColumn = dragOverColumn === col.id;

                  return (
                    <div
                      key={col.id}
                      onDragOver={(e) => handleDragOver(e, col.id)}
                      onDrop={(e) => handleDrop(e, col.id)}
                      className={`p-3.5 rounded-3xl border transition-all duration-200 space-y-3 flex flex-col justify-between shadow-sm min-h-[420px] ${
                        isTargetColumn
                          ? 'bg-orange-100/60 border-[#F7931F] ring-2 ring-[#F7931F]/30 scale-[1.01]'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div>
                        <div className={`p-2 rounded-2xl border ${col.color} ${col.bg} flex items-center justify-between mb-3 shadow-xs`}>
                          <span className="font-extrabold text-[11px] truncate">{col.label}</span>
                          <span className="text-[10px] font-black bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-2xs shrink-0">
                            {colOps.length}
                          </span>
                        </div>

                        <div className="space-y-3 min-h-[320px]">
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
                                className={`bg-white p-3.5 rounded-2xl border border-gray-200 space-y-2.5 shadow-sm hover:shadow-md hover:border-[#F7931F] transition cursor-pointer active:cursor-grabbing relative group ${
                                  isBeingDragged ? 'opacity-40 border-dashed border-[#F7931F]' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <GripVertical className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <span className="font-mono font-bold text-[#363636] text-xs">{op.codigo}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {latestQuote && (
                                      <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
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
                                  <p className="text-xs font-extrabold text-[#363636] leading-snug group-hover:text-[#F7931F] transition">
                                    {op.titulo}
                                  </p>
                                  <div className="mt-1 flex items-center gap-1 text-[11px] text-[#F7931F] font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
                                    <Building className="w-3 h-3 shrink-0" />
                                    <Link href={`/clientes/${op.cliente_id}`}>
                                      {op.cliente?.nombre || 'Ver Ficha Cliente'}
                                    </Link>
                                  </div>
                                </div>

                                {/* Fechas */}
                                <div className="bg-gray-50 p-2 rounded-xl text-[10px] space-y-1 border border-gray-100">
                                  <div className="flex items-center justify-between text-gray-600">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-emerald-600" />
                                      <span>Inicio:</span>
                                    </span>
                                    <span className="font-mono font-semibold">{op.fecha_inicio}</span>
                                  </div>
                                  {op.fecha_limite && (
                                    <div className="flex items-center justify-between text-gray-600">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-600" />
                                        <span>Límite:</span>
                                      </span>
                                      <span className="font-mono font-bold text-amber-900">{op.fecha_limite}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Resumen Financiero */}
                                <div className="pt-1.5 border-t border-gray-100 text-[11px] space-y-1">
                                  <div className="flex justify-between text-gray-700 font-bold">
                                    <span>Total:</span>
                                    <span>${montoTotal.toLocaleString('es-CL')}</span>
                                  </div>
                                  <div className="flex justify-between text-emerald-700 font-bold">
                                    <span>Abonado:</span>
                                    <span>${montoAbonado.toLocaleString('es-CL')}</span>
                                  </div>
                                  {saldoPendiente > 0 && (
                                    <div className="flex justify-between text-[#F7931F] font-black">
                                      <span>Saldo:</span>
                                      <span>${saldoPendiente.toLocaleString('es-CL')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {colOps.length === 0 && (
                            <div className="h-32 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center text-xs text-gray-400 font-medium">
                              Sin oportunidades
                            </div>
                          )}
                        </div>
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
        <div className="space-y-8 animate-fadeIn">
          {SECCIONES_PIPELINE.map((sec) => (
            <div key={sec.id} className="space-y-4">
              {/* Header de Sección Banner */}
              <div className={`p-4 rounded-3xl border ${sec.badgeBg} flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase tracking-wider ${sec.badgeText} px-3 py-1 rounded-xl bg-white border border-current shadow-2xs`}>
                    {sec.badge}
                  </span>
                  <h3 className="text-base font-extrabold text-[#363636]">{sec.nombre}</h3>
                </div>
                <p className="text-xs text-gray-600 font-medium">{sec.descripcion}</p>
              </div>

              {/* Tablas por etapa dentro de esta sección */}
              <div className="space-y-4">
                {sec.etapas.map((col) => {
                  const isCollapsed = !!collapsedSections[col.id];
                  const rawOps = oportunidades.filter((o) => o.estado_pipeline === col.id);
                  const colOps = sortOpportunities(rawOps);

                  return (
                    <div key={col.id} className="space-y-2 mb-4 transition">
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
                          <button type="button" className="text-gray-400 group-hover:text-[#363636] transition">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 ${col.bg} ${col.color} border border-transparent shadow-2xs`}>
                            <div className="w-2 h-2 rounded-full border border-current shadow-xs" />
                            <span>{col.label}</span>
                          </span>

                          <span className="font-mono text-xs text-gray-500 font-extrabold bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                            {rawOps.length}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNewOpModal(true);
                          }}
                          className="text-xs font-bold text-gray-500 hover:text-[#F7931F] transition flex items-center gap-1"
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
                            <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200/80 shadow-xs">
                              <table className="w-full text-left text-xs min-w-[1050px] table-fixed border-collapse">
                                <thead className="text-gray-500 uppercase text-xs font-extrabold border-b border-gray-200 bg-gray-50/50">
                                  <tr>
                                    <th className="py-3 px-3 w-10 text-center align-middle"></th>
                                    <th className="py-3 px-3 w-28 text-left text-xs font-extrabold uppercase tracking-wider align-middle">Código</th>
                                    {renderSortHeader('Oportunidad / Nombre', 'titulo', 'left', 'w-72')}
                                    {renderSortHeader('Cliente', 'cliente', 'left', 'w-56')}
                                    {renderSortHeader('Tipo Venta', 'tipo_venta', 'left', 'w-36')}
                                    {renderSortHeader('Prioridad', 'prioridad', 'left', 'w-28')}
                                    {renderSortHeader('Fecha Inicio', 'fecha_inicio', 'left', 'w-32')}
                                    {renderSortHeader('Fecha Límite', 'fecha_limite', 'left', 'w-32')}
                                    {renderSortHeader('Monto Total', 'monto', 'right', 'w-32')}
                                    <th className="py-3 px-3 w-16 text-center text-xs font-extrabold uppercase tracking-wider align-middle">Acción</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-semibold text-[#363636]">
                                  {colOps.map((op) => {
                                    const montoTotal = getOportunidadTotalValue(op);

                                    return (
                                      <tr
                                        key={op.id}
                                        className="hover:bg-orange-50/40 transition group cursor-pointer text-xs"
                                        onClick={() => handleOpenOportunidad(op)}
                                      >
                                        <td className="py-3 px-3 w-10 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                          <div className="flex items-center justify-center">
                                            <div className="w-3 h-3 rounded-full border border-gray-400 bg-white group-hover:border-[#F7931F] mx-auto" />
                                          </div>
                                        </td>

                                        <td className="py-3 px-3 w-28 font-mono font-bold text-gray-600 text-xs align-middle">
                                          {op.codigo}
                                        </td>

                                        <td className="py-3 px-3 w-72 font-bold text-[#363636] group-hover:text-[#F7931F] transition text-xs truncate align-middle" title={op.titulo}>
                                          {op.titulo}
                                        </td>

                                        <td className="py-3 px-3 w-56 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
                                          <Link
                                            href={`/clientes/${op.cliente_id}`}
                                            className="font-bold text-[#F7931F] hover:underline flex items-center gap-1.5 truncate"
                                            title={op.cliente?.nombre || 'Ver Cliente'}
                                          >
                                            <Building className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
                                            <span className="truncate">{op.cliente?.nombre || 'Ver Cliente'}</span>
                                          </Link>
                                        </td>

                                        <td className="py-3 px-3 w-36 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
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

                                        <td className="py-3 px-3 w-28 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
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

                                        <td className="py-3 px-3 w-32 font-mono text-gray-600 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
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

                                        <td className="py-3 px-3 w-32 font-mono font-bold text-amber-800 text-xs align-middle" onClick={(e) => e.stopPropagation()}>
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

                                        <td className="py-3 px-3 w-32 text-right font-bold text-[#363636] text-xs align-middle">
                                          ${montoTotal.toLocaleString('es-CL')}
                                        </td>

                                        <td className="py-3 px-3 w-16 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                          <div className="flex items-center justify-center">
                                            <button
                                              type="button"
                                              onClick={() => setOpToDelete(op)}
                                              className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl transition border border-red-200"
                                              title="Eliminar Oportunidad"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
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
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
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
          <div className="bg-[#18181b] text-gray-100 border border-gray-800 rounded-3xl max-w-7xl w-full p-4 sm:p-6 shadow-2xl h-[95vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Columna Izquierda (7/12 Cols): Breadcrumb + Título + Accordions */}
            <div className="lg:col-span-7 flex flex-col h-full overflow-hidden pr-2 border-r border-gray-800/80">
              {/* Header Superior con Breadcrumb, Selector de Estado de Pipeline y Botón Eliminar Oportunidad */}
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
                  <label className="text-gray-300 font-extrabold text-xs uppercase tracking-wider">Etapa Pipeline:</label>
                  <select
                    value={selectedOp.estado_pipeline}
                    onChange={async (e) => {
                      const newStage = e.target.value as EstadoPipeline;
                      await moveOportunidadToState(selectedOp.id, newStage);
                    }}
                    className="bg-[#27272a] text-[#F7931F] border border-[#F7931F]/80 rounded-xl px-3 py-1.5 text-xs font-black uppercase cursor-pointer focus:outline-none shadow-sm"
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

              {/* Strip de Datos Clave Editables Directamente: Prioridad y Tipo Venta (Izquierda) | Fechas (Derecha) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-3 px-4 bg-[#222226] rounded-2xl border border-gray-800 text-xs text-gray-300 mb-4 shadow-sm">
                {/* Columna Izquierda: Tipo de Venta y Prioridad */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Tipo Venta */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-400 uppercase text-[11px]">Tipo Venta:</span>
                    <select
                      value={selectedOp.tipo_venta || 'Instalación'}
                      onChange={async (e) => {
                        const newTipo = e.target.value;
                        updateOportunidadField(selectedOp.id, 'tipo_venta', newTipo);
                        await addOportunidadActividad(selectedOp.id, `Tipo de venta cambiado a "${newTipo}" desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-[#F7931F] border border-gray-700 rounded-xl px-2.5 py-1 font-extrabold uppercase focus:outline-none cursor-pointer text-xs"
                    >
                      <option value="Instalación">Instalación</option>
                      <option value="Suministro">Suministro</option>
                      <option value="Reventa de Material">Reventa de Material</option>
                    </select>
                  </div>

                  {/* Prioridad */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-400 uppercase text-[11px]">Prioridad:</span>
                    <select
                      value={selectedOp.prioridad || 'normal'}
                      onChange={async (e) => {
                        const newPrio = e.target.value as 'normal' | 'alta' | 'urgente';
                        updateOportunidadField(selectedOp.id, 'prioridad', newPrio);
                        await addOportunidadActividad(selectedOp.id, `Prioridad cambiada a "${newPrio.toUpperCase()}" desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-gray-200 border border-gray-700 rounded-xl px-2.5 py-1 font-extrabold uppercase focus:outline-none cursor-pointer text-xs"
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                {/* Columna Derecha: Fechas (Fecha Inicio & Fecha Límite) */}
                <div className="flex flex-wrap items-center justify-start md:justify-end gap-3">
                  {/* Fecha Inicio */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-400 uppercase text-[11px]">Fecha Inicio:</span>
                    <input
                      type="date"
                      value={selectedOp.fecha_inicio || ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        updateOportunidadField(selectedOp.id, 'fecha_inicio', newDate);
                        await addOportunidadActividad(selectedOp.id, `Fecha de inicio actualizada a ${newDate} desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-gray-200 border border-gray-700 rounded-xl px-2 py-1 font-mono font-semibold focus:outline-none cursor-pointer text-xs"
                    />
                  </div>

                  {/* Fecha Límite */}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-400 uppercase text-[11px]">Fecha Límite:</span>
                    <input
                      type="date"
                      value={selectedOp.fecha_limite || ''}
                      onChange={async (e) => {
                        const newDate = e.target.value;
                        updateOportunidadField(selectedOp.id, 'fecha_limite', newDate);
                        await addOportunidadActividad(selectedOp.id, `Fecha límite actualizada a ${newDate} desde el detalle.`);
                      }}
                      className="bg-[#27272a] text-amber-400 border border-amber-500/40 rounded-xl px-2 py-1 font-mono font-bold focus:outline-none cursor-pointer text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Listas Desplegables (Accordions) con Scroll Independiente */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 text-sm">
                {/* Accordion 1: Contacto del Cliente */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, contacto: !openSections.contacto })}
                    className="w-full p-4 bg-[#27272a] hover:bg-[#323236] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <User className="w-4 h-4" />
                      <span>Contacto del Cliente</span>
                    </span>
                    {openSections.contacto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.contacto && (
                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-300 animate-fadeIn">
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Razón Social / Nombre:</span>
                        <strong className="text-white text-sm block font-bold">{selectedOp.cliente?.nombre || 'Hormiglass Cliente'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">RUT Registrado:</span>
                        <span className="font-mono text-amber-400 font-bold text-sm block">{selectedOp.cliente?.rut || 'Sin RUT'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Teléfono:</span>
                        <span className="flex items-center gap-1.5 font-bold text-white text-sm">
                          <Phone className="w-3.5 h-3.5 text-[#F7931F]" />
                          {selectedOp.cliente?.telefono || 'No indicado'}
                        </span>
                      </div>
                      <div className="md:col-span-3">
                        <span className="text-gray-400 font-semibold text-xs block mb-1">Correos Electrónicos:</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="bg-[#18181b] px-3 py-1.5 rounded-xl border border-gray-700 text-white font-mono text-xs flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-[#F7931F]" />
                            {selectedOp.cliente?.correo || 'Sin correo principal'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 2: Cotizaciones de la Oportunidad */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-4 bg-[#27272a] hover:bg-[#323236] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4" />
                      <span>Cotizaciones de la Oportunidad</span>
                    </span>
                    {openSections.productos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                    className="w-full p-4 bg-[#27272a] hover:bg-[#323236] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex items-center justify-between border-b border-gray-800 transition"
                  >
                    <span className="flex items-center gap-2.5">
                      <DollarSign className="w-4 h-4" />
                      <span>Finanzas & Comprobantes de Pago</span>
                    </span>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                                  ⚠️ {abonoErrorMsg}
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
                                          setNuevoAbonoFile(file);
                                          setNuevoAbonoFileName(file.name);
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
                                        const fileName = `abono_${Date.now()}_${nuevoAbonoFile.name}`;
                                        const { data, error } = await supabase.storage.from('documentos').upload(fileName, nuevoAbonoFile);
                                        if (!error && data) {
                                          const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(fileName);
                                          if (urlData) publicUrl = urlData.publicUrl;
                                        } else {
                                          publicUrl = URL.createObjectURL(nuevoAbonoFile);
                                        }
                                      } catch {
                                        publicUrl = URL.createObjectURL(nuevoAbonoFile);
                                      }

                                      const existingComprobantes = selectedOp.comprobantes_pago || [];
                                      const newAbonoRecord = {
                                        id: `abono-${Date.now()}`,
                                        monto: rawVal,
                                        fecha: new Date().toLocaleDateString('es-CL') + ' ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
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

                {/* Accordion 4: Visita a Terreno (De último, debajo de Finanzas, con el mismo formato que los demás acordeones) */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <div className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, visita: !openSections.visita })}
                      className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-sm uppercase tracking-wider text-[#F7931F]"
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
                              <label className="block font-bold text-gray-400 mb-1">Técnico Asignado *</label>
                              <select
                                value={newVisitaTecnico}
                                onChange={(e) => setNewVisitaTecnico(e.target.value)}
                                className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#F7931F]"
                              >
                                <option value="Felipe Valverde">Felipe Valverde</option>
                                <option value="Marcos Catalán">Marcos Catalán</option>
                                <option value="Edith Tapia">Edith Tapia</option>
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
                                <option value="programada">📅 Programada</option>
                                <option value="realizada">✅ Realizada</option>
                                <option value="cancelada">❌ Cancelada</option>
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
                                if (!selectedOp || !newVisitaFecha) return;
                                const payload = {
                                  oportunidad_id: selectedOp.id,
                                  tecnico_visita: newVisitaTecnico,
                                  fecha_visita_terreno: newVisitaFecha,
                                  hora_visita_terreno: newVisitaHora,
                                  estado_visita: newVisitaEstado,
                                  observaciones_visita: newVisitaNotas,
                                };

                                try {
                                  const { data, error } = await supabase
                                    .from('visitas_terreno')
                                    .insert([payload])
                                    .select('*')
                                    .single();

                                  if (!error && data) {
                                    setOpVisitasList((prev) => [...prev, data as VisitaTerreno]);
                                    updateOportunidadField(selectedOp.id, 'requiere_visita_terreno', true);
                                    updateOportunidadField(selectedOp.id, 'tecnico_visita', newVisitaTecnico);
                                    updateOportunidadField(selectedOp.id, 'fecha_visita_terreno', newVisitaFecha);
                                    updateOportunidadField(selectedOp.id, 'hora_visita_terreno', newVisitaHora);
                                    updateOportunidadField(selectedOp.id, 'estado_visita', newVisitaEstado);
                                    updateOportunidadField(selectedOp.id, 'observaciones_visita', newVisitaNotas);

                                    await supabase
                                      .from('oportunidades')
                                      .update({
                                        requiere_visita_terreno: true,
                                        tecnico_visita: newVisitaTecnico,
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
                                      `Nueva Visita a Terreno programada para ${newVisitaFecha} a las ${newVisitaHora} hrs con el técnico ${newVisitaTecnico}.`
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
                          No hay visitas a terreno registradas en este momento. Haz clic en <strong>"+ Agregar Visita a Terreno"</strong> para programar una.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {opVisitasList.map((vis, vIdx) => {
                            const isFelipe = vis.tecnico_visita === 'Felipe Valverde';
                            const isMarcos = vis.tecnico_visita === 'Marcos Catalán';
                            const isEdith = vis.tecnico_visita === 'Edith Tapia';
                            const isEditingThis = editingVisitaId === vis.id;

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
                                      <label className="block font-bold text-gray-400 mb-1">Técnico Asignado</label>
                                      <select
                                        value={editVisitaTecnico}
                                        onChange={(e) => setEditVisitaTecnico(e.target.value)}
                                        className="w-full bg-[#1e1e22] text-white border border-gray-700 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none focus:border-[#F7931F]"
                                      >
                                        <option value="Felipe Valverde">Felipe Valverde</option>
                                        <option value="Marcos Catalán">Marcos Catalán</option>
                                        <option value="Edith Tapia">Edith Tapia</option>
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
                                        <option value="programada">📅 Programada</option>
                                        <option value="realizada">✅ Realizada</option>
                                        <option value="cancelada">❌ Cancelada</option>
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
                                        const updatedVis = {
                                          ...vis,
                                          tecnico_visita: editVisitaTecnico,
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
                                                tecnico_visita: editVisitaTecnico,
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
                                                tecnico_visita: editVisitaTecnico,
                                                fecha_visita_terreno: editVisitaFecha,
                                                hora_visita_terreno: editVisitaHora,
                                                estado_visita: editVisitaEstado,
                                                observaciones_visita: editVisitaNotas,
                                              })
                                              .eq('id', selectedOp.id);
                                          }

                                          await addOportunidadActividad(
                                            selectedOp.id,
                                            `Visita a terreno actualizada: ${editVisitaFecha} (${editVisitaTecnico}).`
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
                                className="bg-[#27272a] p-3.5 rounded-2xl border border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-700 transition"
                              >
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                        isFelipe
                                          ? 'bg-blue-900/40 text-blue-300 border-blue-700'
                                          : isMarcos
                                          ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                                          : isEdith
                                          ? 'bg-purple-900/40 text-purple-300 border-purple-700'
                                          : 'bg-orange-900/40 text-orange-300 border-orange-700'
                                      }`}
                                    >
                                      {vis.tecnico_visita || 'Técnico'}
                                    </span>

                                    <span className="font-mono text-gray-300 font-bold flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5 text-[#F7931F]" />
                                      {vis.fecha_visita_terreno}
                                    </span>

                                    <span className="font-mono text-gray-400 font-semibold flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                                      {vis.hora_visita_terreno || '09:00'} hrs
                                    </span>

                                    <span
                                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
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

                                  {vis.observaciones_visita && (
                                    <p className="text-gray-300 text-xs italic pt-1">
                                      "{vis.observaciones_visita}"
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingVisitaId(vis.id);
                                      setEditVisitaTecnico(vis.tecnico_visita || 'Felipe Valverde');
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
                                        await supabase.from('visitas_terreno').delete().eq('id', vis.id);
                                        setOpVisitasList((prev) => prev.filter((v) => v.id !== vis.id));
                                        await addOportunidadActividad(selectedOp.id, 'Una Visita a Terreno fue eliminada.');
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
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 5: Datos de Producción & Fabricación */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <div className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, produccion: !openSections.produccion })}
                      className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-sm uppercase tracking-wider text-[#F7931F]"
                    >
                      <Factory className="w-4 h-4 text-[#F7931F]" />
                      <span>Datos de Producción & Fabricación</span>
                      {planificacionData && (
                        <span className="text-xs bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-0.5 rounded-full border border-amber-500/30 capitalize">
                          {planificacionData.estado || 'Activo'}
                        </span>
                      )}
                      {openSections.produccion ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
                    </button>
                  </div>

                  {openSections.produccion && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estado de Producción</label>
                          <select
                            value={planificacionData?.estado || 'pendiente'}
                            onChange={async (e) => {
                              const newEst = e.target.value;
                              setPlanificacionData((prev) => ({ ...prev, estado: newEst }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('proyectos_planificacion').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    estado: newEst,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                                await addOportunidadActividad(selectedOp.id, `Estado de Producción actualizado a "${newEst.toUpperCase()}"`);
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-amber-400 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          >
                            <option value="pendiente">1. Pendiente Planificación</option>
                            <option value="cola_produccion">2. En Cola de Fabricación</option>
                            <option value="fabricacion">3. En Fabricación</option>
                            <option value="listo_instalacion">4. Listo p/ Instalación</option>
                            <option value="instalacion">5. En Instalación</option>
                            <option value="finalizado">6. Finalizado / Entregado</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estimación Fabricación</label>
                          <input
                            type="date"
                            value={planificacionData?.fecha_estimada_produccion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setPlanificacionData((prev) => ({ ...prev, fecha_estimada_produccion: val }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('proyectos_planificacion').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    fecha_estimada_produccion: val,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estimación Instalación</label>
                          <input
                            type="date"
                            value={planificacionData?.fecha_estimada_instalacion || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setPlanificacionData((prev) => ({ ...prev, fecha_estimada_instalacion: val }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('proyectos_planificacion').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    fecha_estimada_instalacion: val,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-300 mb-1">Observaciones Técnicas / Planta</label>
                        <textarea
                          rows={2}
                          placeholder="Instrucciones específicas de corte, templado, armado o logística de instalación..."
                          value={planificacionData?.observaciones || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setPlanificacionData((prev) => ({ ...prev, observaciones: val }));
                            if (isUUID(selectedOp.id)) {
                              await supabase.from('proyectos_planificacion').upsert([
                                {
                                  oportunidad_id: selectedOp.id,
                                  codigo: selectedOp.codigo,
                                  titulo: selectedOp.titulo,
                                  cliente_id: selectedOp.cliente_id,
                                  observaciones: val,
                                },
                              ], { onConflict: 'oportunidad_id' });
                            }
                          }}
                          className="w-full bg-[#18181b] border border-gray-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#F7931F]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 6: Datos de Logística & Reventa */}
                <div className="bg-[#222226] rounded-2xl border border-gray-800 overflow-hidden shadow-sm">
                  <div className="w-full p-4 bg-[#27272a] text-[#F7931F] font-extrabold text-sm uppercase tracking-wider flex flex-wrap items-center justify-between gap-3 border-b border-gray-800">
                    <button
                      type="button"
                      onClick={() => setOpenSections({ ...openSections, reventa: !openSections.reventa })}
                      className="flex items-center gap-2.5 hover:text-white transition cursor-pointer text-left font-extrabold text-sm uppercase tracking-wider text-[#F7931F]"
                    >
                      <Truck className="w-4 h-4 text-[#F7931F]" />
                      <span>Datos de Logística & Reventa</span>
                      {reventaData && (
                        <span className="text-xs bg-indigo-500/20 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded-full border border-indigo-500/30 capitalize">
                          {reventaData.estado || 'Activo'}
                        </span>
                      )}
                      {openSections.reventa ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-[#F7931F]" />}
                    </button>
                  </div>

                  {openSections.reventa && (
                    <div className="p-4 space-y-4 text-xs text-gray-300 bg-[#1e1e22]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Estado Logístico</label>
                          <select
                            value={reventaData?.estado || 'coordinacion_proveedor'}
                            onChange={async (e) => {
                              const newEst = e.target.value;
                              setReventaData((prev) => ({ ...prev, estado: newEst }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('ordenes_reventa').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    estado: newEst,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                                await addOportunidadActividad(selectedOp.id, `Estado Logístico de Reventa actualizado a "${newEst.toUpperCase()}"`);
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-indigo-400 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          >
                            <option value="coordinacion_proveedor">1. Coordinación Proveedor</option>
                            <option value="confirmacion_stock">2. Confirmación Stock</option>
                            <option value="listo_retiro">3. Listo para Retiro</option>
                            <option value="listo_despacho">4. Listo para Despacho</option>
                            <option value="entregado">5. Entregado al Cliente</option>
                            <option value="postventa">6. Postventa & Seguimiento</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Proveedor Asignado</label>
                          <input
                            type="text"
                            placeholder="Nombre del proveedor o distribuidor..."
                            value={reventaData?.proveedor_nombre || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setReventaData((prev) => ({ ...prev, proveedor_nombre: val }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('ordenes_reventa').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    proveedor_nombre: val,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-300 mb-1">Fecha Despacho</label>
                          <input
                            type="date"
                            value={reventaData?.fecha_despacho || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setReventaData((prev) => ({ ...prev, fecha_despacho: val }));
                              if (isUUID(selectedOp.id)) {
                                await supabase.from('ordenes_reventa').upsert([
                                  {
                                    oportunidad_id: selectedOp.id,
                                    codigo: selectedOp.codigo,
                                    titulo: selectedOp.titulo,
                                    cliente_id: selectedOp.cliente_id,
                                    fecha_despacho: val,
                                  },
                                ], { onConflict: 'oportunidad_id' });
                              }
                            }}
                            className="w-full bg-[#18181b] border border-gray-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#F7931F]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-gray-300 mb-1">Notas de Postventa & Seguimiento</label>
                        <textarea
                          rows={2}
                          placeholder="Añadir observaciones de entrega, garantías o postventa..."
                          value={reventaData?.notas_postventa || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setReventaData((prev) => ({ ...prev, notas_postventa: val }));
                            if (isUUID(selectedOp.id)) {
                              await supabase.from('ordenes_reventa').upsert([
                                {
                                  oportunidad_id: selectedOp.id,
                                  codigo: selectedOp.codigo,
                                  titulo: selectedOp.titulo,
                                  cliente_id: selectedOp.cliente_id,
                                  notas_postventa: val,
                                },
                              ], { onConflict: 'oportunidad_id' });
                            }
                          }}
                          className="w-full bg-[#18181b] border border-gray-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#F7931F]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha (5/12 Cols): Feed de Actividades Estilo ClickUp Completo */}
            <div className="lg:col-span-5 bg-[#222226] rounded-2xl border border-gray-800 p-4 sm:p-5 flex flex-col justify-between h-full overflow-hidden shadow-xl">
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

                {/* Barra de Filtros de Actividad (Todos / Comentarios / Acciones de Sistema) */}
                <div className="flex items-center gap-1.5 p-1 bg-[#18181b] rounded-xl border border-gray-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setActivityFilter('all')}
                    className={`flex-1 py-1 px-2 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'all'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>🌐 Todos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('comentarios')}
                    className={`flex-1 py-1 px-2 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'comentarios'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>💬 Comentarios</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('sistema')}
                    className={`flex-1 py-1 px-2 rounded-lg font-extrabold transition flex items-center justify-center gap-1 ${
                      activityFilter === 'sistema'
                        ? 'bg-[#F7931F] text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>⚡ Acciones</span>
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
                        (m) => m.tipo === 'comentario' || (!m.tipo && !m.contenido?.startsWith('['))
                      );
                    } else if (activityFilter === 'sistema') {
                      filteredList = filteredList.filter(
                        (m) => m.tipo !== 'comentario' && (m.tipo || m.contenido?.startsWith('['))
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
                      const isUserComment =
                        msg.tipo === 'comentario' ||
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
                            className="bg-[#1c1c1f] p-4 rounded-2xl border border-gray-800/80 shadow-md space-y-3 transition hover:border-gray-700"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#F7931F]/20 text-[#F7931F] font-black text-xs flex items-center justify-center border border-[#F7931F]/40 shrink-0">
                                  <User className="w-4 h-4 text-[#F7931F]" />
                                </div>
                                <div>
                                  <span className="font-extrabold text-white text-sm block leading-none">
                                    {msg.usuario_nombre}
                                  </span>
                                </div>
                              </div>

                              <span className="text-gray-400 text-xs font-mono">
                                {formattedDate} {formattedTime}
                              </span>
                            </div>

                            <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                              {renderMessageContentWithMentions(msg.contenido)}
                            </p>

                            <div className="flex items-center justify-between pt-2 border-t border-gray-800 text-xs">
                              <div className="flex items-center gap-2 text-gray-400">
                                <button
                                  type="button"
                                  className="hover:text-[#F7931F] transition flex items-center gap-1 p-1 rounded hover:bg-white/5"
                                  title="Reaccionar"
                                >
                                  <Smile className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                        className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition"
                        title="Asignar integrante"
                      >
                        <User className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition"
                        title="Emojis"
                      >
                        <Smile className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        className="p-1.5 hover:text-[#F7931F] hover:bg-white/5 rounded-lg transition"
                        title="Grabación de voz"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendChatMessage}
                      className="bg-[#F7931F] hover:bg-[#e08316] text-white p-2.5 rounded-xl transition flex items-center justify-center shadow-md shrink-0"
                      title="Enviar comentario"
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
                ¿Estás seguro de que deseas eliminar la oportunidad <strong className="font-mono text-[#363636]">{opToDelete.codigo}</strong> ("{opToDelete.titulo}")?
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

      {/* Floating Status Popover Overlay (Estilo ClickUp fuera de la tabla sin recortes ni scroll) */}
      {stageMenuPos && (
        <div
          className="fixed inset-0 z-[100]"
          onClick={() => setStageMenuPos(null)}
        >
          <div
            style={{
              top: `${Math.min(stageMenuPos.top, typeof window !== 'undefined' ? window.innerHeight - 300 : stageMenuPos.top)}px`,
              left: `${Math.min(stageMenuPos.left, typeof window !== 'undefined' ? window.innerWidth - 260 : stageMenuPos.left)}px`,
            }}
            className="fixed z-[101] bg-[#1c1c1f] text-gray-100 border border-gray-800 rounded-2xl shadow-2xl p-2.5 min-w-[240px] space-y-2 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 px-1">
              <span className="text-[11px] font-black uppercase text-gray-300 tracking-wider">Estado del Pipeline</span>
              <button
                onClick={() => setStageMenuPos(null)}
                className="text-gray-500 hover:text-gray-300 p-0.5 rounded-lg transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
              {SECCIONES_PIPELINE.map((sec) => (
                <div key={sec.id} className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider px-2 py-1 block bg-black/40 rounded-lg">
                    {sec.nombre}
                  </span>
                  {sec.etapas.map((st) => {
                    const targetOp = oportunidades.find((o) => o.id === stageMenuPos.opId);
                    const isCurrent = targetOp?.estado_pipeline === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={async () => {
                          const opId = stageMenuPos.opId;
                          setStageMenuPos(null);
                          await moveOportunidadToState(opId, st.id as EstadoPipeline);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-bold rounded-xl transition flex items-center justify-between ${
                          isCurrent
                            ? 'bg-[#27272a] text-[#F7931F] border border-[#F7931F]/40 shadow-sm'
                            : 'hover:bg-white/5 text-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#F7931F] border border-orange-300" />
                          <span className="text-[11px] font-bold">{st.label}</span>
                        </div>
                        {isCurrent && <Check className="w-4 h-4 text-[#F7931F]" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

