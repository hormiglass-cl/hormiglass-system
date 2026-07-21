'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { CotizacionModal } from '../../components/CotizacionModal';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'kanban' | 'tabla'>('kanban');

  // Deletion Modal State for Oportunidad
  const [opToDelete, setOpToDelete] = useState<OportunidadVenta | null>(null);
  const [cotToDeleteInModal, setCotToDeleteInModal] = useState<Cotizacion | null>(null);

  // Accordion Sections State in Modal
  const [openSections, setOpenSections] = useState<{ contacto: boolean; productos: boolean; finanzas: boolean }>({
    contacto: true,
    productos: true,
    finanzas: true,
  });

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
  const [notaFiles, setNotaFiles] = useState<{ name: string; url: string }[]>([]);
  const [ocFiles, setOcFiles] = useState<{ name: string; url: string }[]>([]);

  // Cotización seleccionada para previsualización modal
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);

  // Form para Nueva Oportunidad
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [nuevoTitulo, setNuevoTitulo] = useState('');
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevaFechaLimite, setNuevaFechaLimite] = useState('');
  const [isActividadesExpanded, setIsActividadesExpanded] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    let ignore = false;
    async function fetchPipelineData() {
      try {
        const [opRes, cliRes, usrRes, cotRes] = await Promise.all([
          supabase
            .from('oportunidades')
            .select('*, cliente:clientes(*), cotizaciones(*)')
            .order('created_at', { ascending: false }),
          supabase.from('clientes').select('*'),
          supabase.from('usuarios').select('*').eq('activo', true),
          supabase.from('cotizaciones').select('*, cliente:clientes(*), items:cotizacion_items(*)'),
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
            setOportunidades(opRes.data as OportunidadVenta[]);
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
              setSelectedOp(found as OportunidadVenta);
              setEditTitleValue(found.titulo);
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
    return () => {
      ignore = true;
    };
  }, [usersList, searchParams]);

  // Synchronize file attachments and chats when selecting an opportunity
  useEffect(() => {
    let ignore = false;
    if (selectedOp) {
      const pFiles = (selectedOp.comprobantes_pago || []).map((f) =>
        typeof f === 'string' ? { name: f, url: '#' } : f
      );
      const nFiles = (selectedOp.notas_venta || []).map((f) =>
        typeof f === 'string' ? { name: f, url: '#' } : f
      );
      const oFiles = (selectedOp.ordenes_compra || []).map((f) =>
        typeof f === 'string' ? { name: f, url: '#' } : f
      );
      setPagoFiles(pFiles);
      setNotaFiles(nFiles);
      setOcFiles(oFiles);

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

  const pipelineStates: { id: EstadoPipeline; label: string; color: string; bg: string }[] = [
    { id: 'nueva', label: '1. Nueva Oportunidad', color: 'border-amber-300 text-amber-900', bg: 'bg-amber-50' },
    { id: 'pagada', label: '2. Pago Validado', color: 'border-blue-300 text-blue-900', bg: 'bg-blue-50' },
    { id: 'programada', label: '3. En Programación', color: 'border-purple-300 text-purple-900', bg: 'bg-purple-50' },
    { id: 'entregada', label: '4. Trabajo Entregado & Cierre', color: 'border-emerald-300 text-emerald-900', bg: 'bg-emerald-50' },
  ];

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
      setSelectedOp((prev) => prev ? { ...prev, chat_interno: [...(prev.chat_interno || []), newMsg] } : prev);
    }
    setOportunidades((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, chat_interno: [...(o.chat_interno || []), newMsg] } : o))
    );

    if (isUUID(opId)) {
      try {
        // Fetch current chat to avoid overwriting with stale state
        const { data: currentOpData } = await supabase.from('oportunidades').select('chat_interno').eq('id', opId).single();
        const currentChat = currentOpData?.chat_interno || [];
        const finalChat = [...currentChat, newMsg];

        // 1. Save in actividades_op table in Supabase
        await supabase.from('actividades_op').insert([{
          oportunidad_id: opId,
          usuario_id: userId,
          usuario_nombre: userName,
          contenido,
          tipo,
        }]);

        // 2. Also keep chat_interno updated
        await supabase
          .from('oportunidades')
          .update({ chat_interno: finalChat })
          .eq('id', opId);
      } catch (err) {
        console.error('Error updating actividades_op in Supabase:', err);
      }
    }

    // 3. Always log to logs_sistema (Ajustes-8 Req 8)
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

      // Save notification to Supabase notificaciones table for each mentioned user (Ajustes-8 Req)
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

      // Play audio chime and trigger Toast Alert
      playNotificationSound();
      setToastAlert({
        id: Date.now().toString(),
        message: `Mención enviada a ${mentionedNames} en ${selectedOp.codigo}`,
        user: currentUser?.nombre || 'Vendedor',
      });
      setTimeout(() => setToastAlert(null), 5000);
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
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'pago' | 'nota' | 'oc'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOp) return;

    let publicUrl = '#';
    try {
      const fileName = `${type}_${Date.now()}_${file.name}`;
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

    if (type === 'pago') {
      const updated = [...pagoFiles, fileObj];
      setPagoFiles(updated);
      updateOportunidadField(selectedOp.id, 'comprobantes_pago', updated.map((f) => f.name));
    } else if (type === 'nota') {
      const updated = [...notaFiles, fileObj];
      setNotaFiles(updated);
      updateOportunidadField(selectedOp.id, 'notas_venta', updated.map((f) => f.name));
    } else {
      const updated = [...ocFiles, fileObj];
      setOcFiles(updated);
      updateOportunidadField(selectedOp.id, 'ordenes_compra', updated.map((f) => f.name));
    }
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
              onClick={() => setActiveTab('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'kanban' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setActiveTab('tabla')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'tabla' ? 'bg-[#F7931F] text-white shadow-xs' : 'text-gray-600 hover:text-[#363636]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista por Estado</span>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500 font-medium text-xs">
          Cargando oportunidades de venta...
        </div>
      ) : activeTab === 'kanban' ? (
        /* Vista Kanban de Oportunidades */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {pipelineStates.map((col) => {
            const colOps = oportunidades.filter((o) => o.estado_pipeline === col.id);
            const isTargetColumn = dragOverColumn === col.id;

            return (
              <div
                key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`p-4 rounded-3xl border transition-all duration-200 space-y-4 flex flex-col justify-between shadow-sm min-h-[480px] ${
                  isTargetColumn
                    ? 'bg-orange-100/60 border-[#F7931F] ring-2 ring-[#F7931F]/30 scale-[1.01]'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div>
                  <div className={`p-2.5 rounded-2xl border ${col.color} ${col.bg} flex items-center justify-between mb-3 shadow-xs`}>
                    <span className="font-extrabold text-xs">{col.label}</span>
                    <span className="text-[11px] font-black bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-2xs">
                      {colOps.length}
                    </span>
                  </div>

                  <div className="space-y-3 min-h-[380px]">
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
                          onClick={() => {
                            setSelectedOp(op);
                            setEditTitleValue(op.titulo);
                          }}
                          className={`bg-white p-4 rounded-2xl border border-gray-200 space-y-3 shadow-sm hover:shadow-md hover:border-[#F7931F] transition cursor-pointer active:cursor-grabbing relative group ${
                            isBeingDragged ? 'opacity-40 border-dashed border-[#F7931F]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-1.5">
                              <GripVertical className="w-4 h-4 text-gray-400 shrink-0" />
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
                          <div className="bg-gray-50 p-2 rounded-xl text-[11px] space-y-1 border border-gray-100">
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
                                  <span>Límite Término:</span>
                                </span>
                                <span className="font-mono font-bold text-amber-900">{op.fecha_limite}</span>
                              </div>
                            )}
                          </div>

                          {/* Resumen Financiero */}
                          <div className="pt-2 border-t border-gray-100 text-xs space-y-1">
                            <div className="flex justify-between text-gray-700">
                              <span>Total Venta:</span>
                              <span className="font-black text-[#363636]">${montoTotal.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex justify-between text-gray-600 text-[11px]">
                              <span>Abonado:</span>
                              <span className="text-emerald-600 font-bold">${montoAbonado.toLocaleString('es-CL')}</span>
                            </div>
                            {saldoPendiente > 0 && (
                              <div className="flex justify-between text-gray-600 text-[11px]">
                                <span>Saldo Pendiente:</span>
                                <span className="text-amber-600 font-bold">${saldoPendiente.toLocaleString('es-CL')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {colOps.length === 0 && (
                      <div className="h-40 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center text-xs text-gray-400 font-medium">
                        Arrastra una oportunidad aquí
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Vista Lista Agrupada por Estados del Pipeline */
        <div className="space-y-6">
          {pipelineStates.map((col) => {
            const colOps = oportunidades.filter((o) => o.estado_pipeline === col.id);
            return (
              <div key={col.id} className="bg-white rounded-3xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div className={`p-3 rounded-2xl border ${col.color} ${col.bg} flex items-center justify-between`}>
                  <h3 className="font-black text-sm uppercase tracking-wider">{col.label}</h3>
                  <span className="font-mono text-xs bg-white px-3 py-1 rounded-full border border-gray-200 font-bold">
                    {colOps.length} Oportunidades
                  </span>
                </div>

                {colOps.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">No hay oportunidades en esta etapa.</p>
                ) : (
                  <div className="overflow-visible">
                    <table className="w-full text-left text-xs min-w-[800px]">
                      <thead className="bg-gray-100 text-gray-700 uppercase text-[10px]">
                        <tr>
                          <th className="py-2.5 px-3">Código</th>
                          <th className="py-2.5 px-3">Oportunidad</th>
                          <th className="py-2.5 px-3">Cliente</th>
                          <th className="py-2.5 px-3">Estado Pipeline</th>
                          <th className="py-2.5 px-3">Fecha Inicio</th>
                          <th className="py-2.5 px-3">Fecha Límite</th>
                          <th className="py-2.5 px-3 text-right">Monto Total</th>
                          <th className="py-2.5 px-3 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {colOps.map((op) => {
                          const latestQuote = getActiveQuote(op);
                          const montoTotal = getOportunidadTotalValue(op);
                          return (
                            <tr key={op.id} className="hover:bg-orange-50/40 transition">
                              <td className="py-3 px-3 font-mono font-bold text-[#363636]">{op.codigo}</td>
                              <td className="py-3 px-3 font-extrabold text-[#363636]">{op.titulo}</td>
                              <td className="py-3 px-3">
                                <Link href={`/clientes/${op.cliente_id}`} className="font-bold text-[#F7931F] hover:underline">
                                  {op.cliente?.nombre || 'Ver Cliente'}
                                </Link>
                              </td>
                              <td className="py-3 px-3">
                                <select
                                  value={op.estado_pipeline}
                                  onChange={async (e) => {
                                    const newStage = e.target.value as EstadoPipeline;
                                    updateOportunidadField(op.id, 'estado_pipeline', newStage);
                                    if (isUUID(op.id)) {
                                      try {
                                        await supabase
                                          .from('oportunidades')
                                          .update({ estado_pipeline: newStage })
                                          .eq('id', op.id);
                                      } catch (err) {
                                        console.error('Error updating stage in list view:', err);
                                      }
                                    }
                                    await addOportunidadActividad(
                                      op.id,
                                      `Estado del pipeline actualizado a "${newStage.toUpperCase()}" desde la vista de lista.`
                                    );
                                  }}
                                  className="bg-orange-50 border border-orange-200 text-[#F7931F] font-bold text-xs px-2 py-1 rounded-xl focus:outline-none focus:border-[#F7931F] cursor-pointer uppercase"
                                >
                                  <option value="nueva">Nueva</option>
                                  <option value="pagada">Pago Validado</option>
                                  <option value="programada">En Programación</option>
                                  <option value="entregada">Trabajo Entregado</option>
                                </select>
                              </td>
                              <td className="py-3 px-3 font-mono text-gray-600">{op.fecha_inicio}</td>
                              <td className="py-3 px-3 font-mono font-bold text-amber-800">{op.fecha_limite || 'Sin fecha'}</td>
                              <td className="py-3 px-3 text-right font-black text-[#363636]">${montoTotal.toLocaleString('es-CL')}</td>
                              <td className="py-3 px-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setSelectedOp(op);
                                      setEditTitleValue(op.titulo);
                                    }}
                                    className="px-3 py-1 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-lg font-bold text-xs shadow-xs"
                                  >
                                    Abrir Modal
                                  </button>
                                  <button
                                    onClick={() => setOpToDelete(op)}
                                    className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-lg transition border border-red-200"
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
            );
          })}
        </div>
      )}

      {/* Pop Up / Modal Enriquecido Oportunidad de Venta (Diseño ClickUp 2 Columnas - Full Height Sidebar) */}
      {selectedOp && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 z-50 animate-fadeIn">
          <div className="bg-[#1e1e1e] text-gray-100 border border-gray-800 rounded-3xl max-w-7xl w-full p-4 shadow-2xl h-[94vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Columna Izquierda (75% - 8/12 Cols): Breadcrumb + Título + Accordions */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden pr-1 border-r border-gray-800/80">
              {/* Header Superior con Breadcrumb, Selector de Estado de Pipeline y Botón Eliminar Oportunidad */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2 text-xs shrink-0">
                <div className="flex items-center gap-2 text-gray-400 font-medium">
                  <Building className="w-3.5 h-3.5 text-[#F7931F]" />
                  <Link href={`/clientes/${selectedOp.cliente_id}`} className="hover:text-[#F7931F] transition underline font-bold">
                    {selectedOp.cliente?.nombre || 'Cliente'}
                  </Link>
                  <span>/</span>
                  <span className="text-gray-200 font-bold font-mono">{selectedOp.codigo}</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-gray-400 font-extrabold text-[11px]">Etapa Pipeline:</label>
                  <select
                    value={selectedOp.estado_pipeline}
                    onChange={async (e) => {
                      const newStage = e.target.value as EstadoPipeline;
                      updateOportunidadField(selectedOp.id, 'estado_pipeline', newStage);
                      if (isUUID(selectedOp.id)) {
                        try {
                          await supabase
                            .from('oportunidades')
                            .update({ estado_pipeline: newStage })
                            .eq('id', selectedOp.id);
                        } catch (err) {
                          console.error('Error updating stage from pop-up:', err);
                        }
                      }
                      await addOportunidadActividad(
                        selectedOp.id,
                        `Estado del pipeline actualizado a "${newStage.toUpperCase()}" desde el detalle.`
                      );
                    }}
                    className="bg-[#2a2a2a] text-[#F7931F] border border-[#F7931F] rounded-xl px-2.5 py-1 text-xs font-black uppercase cursor-pointer focus:outline-none shadow-xs"
                  >
                    <option value="nueva">Nueva</option>
                    <option value="pagada">Pago Validado</option>
                    <option value="programada">En Programación</option>
                    <option value="entregada">Trabajo Entregado</option>
                  </select>

                  <button
                    onClick={() => setOpToDelete(selectedOp)}
                    className="px-2.5 py-1 bg-red-500/20 hover:bg-red-600 text-red-300 hover:text-white rounded-xl transition border border-red-500/30 font-bold flex items-center gap-1"
                    title="Eliminar esta oportunidad de Supabase"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>

              {/* Título Principal Editable Inline */}
              <div className="py-2 border-b border-gray-800 flex items-center justify-between shrink-0 mb-3">
                {isEditingTitle ? (
                  <div className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      className="bg-[#2a2a2a] text-xl font-black text-white border border-[#F7931F] rounded-xl px-3 py-1 w-full focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitleEdit}
                      className="bg-[#F7931F] hover:bg-[#e08316] text-white p-2 rounded-xl transition font-bold"
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
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <h2 className="text-xl font-black text-white leading-tight group-hover:text-[#F7931F] transition">
                      {selectedOp.titulo}
                    </h2>
                    <Edit className="w-4 h-4 text-gray-500 group-hover:text-[#F7931F] transition opacity-0 group-hover:opacity-100" />
                  </div>
                )}
              </div>

              {/* Listas Desplegables (Accordions) con Scroll Independiente */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 text-xs">
                {/* Accordion 1: Contacto del Cliente */}
                <div className="bg-[#2a2a2a] rounded-2xl border border-gray-700 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, contacto: !openSections.contacto })}
                    className="w-full p-3.5 bg-[#252525] hover:bg-[#2f2f2f] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex items-center justify-between border-b border-gray-700 transition"
                  >
                    <span className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>Contacto del Cliente</span>
                    </span>
                    {openSections.contacto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.contacto && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-gray-300 animate-fadeIn">
                      <div>
                        <span className="text-gray-400 font-semibold block">Razón Social / Nombre:</span>
                        <strong className="text-white text-xs">{selectedOp.cliente?.nombre || 'Hormiglass Cliente'}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block">RUT Registrado:</span>
                        <span className="font-mono text-amber-400 font-bold">{selectedOp.cliente?.rut || 'Sin RUT'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold block">Teléfono:</span>
                        <span className="flex items-center gap-1 font-bold text-white">
                          <Phone className="w-3 h-3 text-[#F7931F]" />
                          {selectedOp.cliente?.telefono || 'No indicado'}
                        </span>
                      </div>
                      <div className="md:col-span-3">
                        <span className="text-gray-400 font-semibold block">Correos Electrónicos:</span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="bg-[#1e1e1e] px-2.5 py-1 rounded-lg border border-gray-600 text-white font-mono flex items-center gap-1">
                            <Mail className="w-3 h-3 text-[#F7931F]" />
                            {selectedOp.cliente?.correo || 'Sin correo principal'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 2: Cotizaciones de la Oportunidad */}
                <div className="bg-[#2a2a2a] rounded-2xl border border-gray-700 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, productos: !openSections.productos })}
                    className="w-full p-3.5 bg-[#252525] hover:bg-[#2f2f2f] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex items-center justify-between border-b border-gray-700 transition"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>Cotizaciones de la Oportunidad</span>
                    </span>
                    {openSections.productos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.productos && (
                    <div className="p-4 space-y-4 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-700 pb-3">
                        <div>
                          <h4 className="text-white font-extrabold text-xs flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#F7931F]" />
                            <span>Cotizaciones del Cliente:</span>
                          </h4>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Marca la casilla (checkbox) para considerar la cotización en esta oportunidad. Solo las cotizaciones marcadas en estado <strong>Enviada</strong> o <strong>Aprobada</strong> se sumarán al valor total.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowUnifiedCotModal(true)}
                          className="bg-[#F7931F] hover:bg-[#e08316] text-white text-[11px] font-extrabold px-3 py-1.5 rounded-xl transition flex items-center gap-1 self-start sm:self-auto shrink-0 shadow-sm"
                        >
                          <FilePlus className="w-3.5 h-3.5" />
                          <span>Crear Nueva Cotización</span>
                        </button>
                      </div>

                      {(() => {
                        // Candidate quotes for this client
                        const candidateQuotes = allCotizaciones.filter(
                          (c) => c.cliente_id === selectedOp.cliente_id
                        );
                        const unassignedQuotes = candidateQuotes.filter(
                          (c) => !c.oportunidad_id || c.oportunidad_id !== selectedOp.id
                        );
                        const linkedQuotes = candidateQuotes.filter(
                          (c) => c.oportunidad_id === selectedOp.id
                        );

                        // Total opportunity value = sum of linked quotes in 'enviada' or 'aprobada' status
                        const totalValorOportunidad = getOportunidadTotalValue(selectedOp);

                        return (
                          <div className="space-y-4">
                            {/* Desplegable de Selección y Previsualización de Cotizaciones Disponibles */}
                            {unassignedQuotes.length > 0 && (
                              <div className="bg-[#181818] p-3.5 rounded-2xl border border-gray-700 space-y-2.5 shadow-inner">
                                <label className="text-gray-300 font-extrabold text-xs flex items-center gap-1.5">
                                  <FileText className="w-4 h-4 text-[#F7931F]" />
                                  <span>Seleccionar Cotización Disponible para Agregar:</span>
                                </label>

                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                  <select
                                    value={selectedCandidateCotId}
                                    onChange={(e) => setSelectedCandidateCotId(e.target.value)}
                                    className="w-full bg-[#252525] text-white border border-gray-700 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#F7931F]"
                                  >
                                    <option value="">-- Escoger Cotización Disponible ({unassignedQuotes.length}) --</option>
                                    {unassignedQuotes.map((cot) => (
                                      <option key={cot.id} value={cot.id}>
                                        {cot.numero_cotizacion} (v{cot.version || 1}) — ${(cot.monto_total || 0).toLocaleString('es-CL')} CLP [{cot.estado}]
                                      </option>
                                    ))}
                                  </select>

                                  {/* Botón Previsualizar PDF antes de agregar */}
                                  {selectedCandidateCotId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const found = unassignedQuotes.find((c) => c.id === selectedCandidateCotId);
                                        if (found) setPreviewCotizacion(found);
                                      }}
                                      className="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-white text-xs font-extrabold px-3 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 border border-gray-600 shadow-sm"
                                      title="Previsualizar PDF antes de vincular"
                                    >
                                      <Eye className="w-4 h-4 text-[#F7931F]" />
                                      <span>Previsualizar</span>
                                    </button>
                                  )}

                                  {/* Botón Agregar Cotización a la Oportunidad */}
                                  <button
                                    type="button"
                                    disabled={!selectedCandidateCotId}
                                    onClick={async () => {
                                      if (!selectedCandidateCotId) return;
                                      const targetCot = unassignedQuotes.find((c) => c.id === selectedCandidateCotId);
                                      if (!targetCot) return;

                                      // 1. Update state
                                      const updatedCots = allCotizaciones.map((c) =>
                                        c.id === targetCot.id ? { ...c, oportunidad_id: selectedOp.id } : c
                                      );
                                      setAllCotizaciones(updatedCots);
                                      setSelectedCandidateCotId('');

                                      // 2. Update Supabase
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
                                    className="w-full sm:w-auto bg-[#F7931F] hover:bg-[#e08316] disabled:opacity-50 text-white text-xs font-extrabold px-4 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 shadow-md"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>Agregar</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Lista de Cotizaciones Agregadas a la Oportunidad */}
                            {linkedQuotes.length === 0 ? (
                              <div className="p-4 bg-[#1e1e1e] rounded-2xl border border-dashed border-gray-700 text-gray-400 text-center text-xs">
                                No hay cotizaciones agregadas a esta oportunidad. {unassignedQuotes.length > 0 ? 'Selecciona una del desplegable de arriba o haz' : 'Haz'} clic en "Crear Nueva Cotización".
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {linkedQuotes.map((cot) => {
                                  const isLinked = true;
                                  const isSummed = cot.estado === 'aprobada' || cot.estado === 'enviada';

                                  return (
                                    <div
                                      key={cot.id}
                                      className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        isLinked
                                          ? 'bg-[#1e1e1e] border-[#F7931F]/60 shadow-md'
                                          : 'bg-[#181818] border-gray-700/70 opacity-80 hover:opacity-100'
                                      }`}
                                    >
                                      {/* Checkbox para agregar/vincular a oportunidad + Datos Cotización */}
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={isLinked}
                                          onChange={async (e) => {
                                            const checked = e.target.checked;
                                            const newOpId = checked ? selectedOp.id : undefined;

                                            // 1. Update allCotizaciones local state
                                            const updatedCots = allCotizaciones.map((c) =>
                                              c.id === cot.id ? { ...c, oportunidad_id: newOpId } : c
                                            );
                                            setAllCotizaciones(updatedCots);

                                            // 2. Update Supabase backend
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

                                        <div className="space-y-0.5">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono font-black text-white text-xs">
                                              {cot.numero_cotizacion}
                                            </span>
                                            <span className="text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                                              v{cot.version || 1}
                                            </span>
                                            {isSummed ? (
                                              <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                                Sumando a Oportunidad
                                              </span>
                                            ) : isLinked ? (
                                              <span className="text-[9px] font-black uppercase bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                                                Agregada ({cot.estado})
                                              </span>
                                            ) : (
                                              <span className="text-[9px] font-bold text-gray-400">
                                                Sin asignar
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-black text-[#F7931F] text-xs block">
                                            ${(cot.monto_total || 0).toLocaleString('es-CL')} CLP
                                          </span>
                                        </div>
                                      </div>

                                      {/* Selector de Estado + Acciones */}
                                      <div className="flex items-center gap-2 self-end sm:self-auto">
                                        <label className="text-[11px] text-gray-400 font-bold hidden sm:inline">Estado:</label>
                                        <select
                                          value={cot.estado}
                                          onChange={async (e) => {
                                            const newStatus = e.target.value as EstadoCotizacion;

                                            // 1. Update allCotizaciones local state
                                            const updatedCots = allCotizaciones.map((c) =>
                                              c.id === cot.id ? { ...c, estado: newStatus } : c
                                            );
                                            setAllCotizaciones(updatedCots);

                                            // 2. Update Supabase backend
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
                                          className={`text-xs font-extrabold uppercase px-2.5 py-1 rounded-xl border cursor-pointer focus:outline-none ${
                                            cot.estado === 'aprobada'
                                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                              : cot.estado === 'enviada'
                                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                              : cot.estado === 'declinada' || cot.estado === 'rechazada'
                                              ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                          }`}
                                        >
                                          <option value="borrador" className="bg-[#1e1e1e] text-white">Borrador</option>
                                          <option value="enviada" className="bg-[#1e1e1e] text-white">Enviada</option>
                                          <option value="aprobada" className="bg-[#1e1e1e] text-white">Aprobada</option>
                                          <option value="declinada" className="bg-[#1e1e1e] text-white">Declinada</option>
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() => setPreviewCotizacion(cot)}
                                          className="p-1.5 bg-white/10 hover:bg-[#F7931F] text-white rounded-xl font-bold transition text-xs flex items-center gap-1"
                                          title="Previsualizar PDF"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span className="hidden sm:inline">PDF</span>
                                        </button>

                                        {/* Botón Desvincular de la Oportunidad (No borra la cotización del sistema) */}
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
                                          className="p-1.5 bg-[#252525] hover:bg-amber-500/20 text-gray-400 hover:text-amber-300 rounded-xl transition border border-gray-700"
                                          title="Desvincular cotización de la oportunidad"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Resumen Total Sumado de Oportunidad */}
                            <div className="p-4 bg-[#181818] border border-gray-700 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-inner">
                              <div>
                                <span className="text-gray-300 font-extrabold text-xs block">Valor Total de la Oportunidad:</span>
                                <span className="text-[11px] text-gray-400">
                                  Suma de cotizaciones marcadas en estado <strong>Enviada</strong> o <strong>Aprobada</strong>.
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-xl font-black text-[#F7931F] block">
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

                {/* Accordion 3: Finanzas & Documentos Adjuntos (Archivos Reales) */}
                <div className="bg-[#2a2a2a] rounded-2xl border border-gray-700 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setOpenSections({ ...openSections, finanzas: !openSections.finanzas })}
                    className="w-full p-3.5 bg-[#252525] hover:bg-[#2f2f2f] text-[#F7931F] font-extrabold text-xs uppercase tracking-wider flex items-center justify-between border-b border-gray-700 transition"
                  >
                    <span className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      <span>Finanzas & Documentos Adjuntos (Archivos Reales)</span>
                    </span>
                    {openSections.finanzas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {openSections.finanzas && (
                    <div className="p-4 space-y-4 animate-fadeIn">
                      {/* Resumen de Saldo */}
                      {(() => {
                        const totalCot = getOportunidadTotalValue(selectedOp);
                        const abonado = selectedOp.monto_abonado || 0;
                        const saldo = Math.max(0, totalCot - abonado);

                        return (
                          <div className="space-y-4">
                            {/* Resumen Financiero Calculado de la Oportunidad */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#1e1e1e] p-3.5 rounded-2xl border border-gray-700 text-center shadow-inner">
                              <div>
                                <span className="text-gray-400 block text-[11px] font-semibold">Valor Total Cotizado:</span>
                                <strong className="text-white text-base font-black">${totalCot.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-[11px] font-semibold">Monto Abonado Acumulado:</span>
                                <strong className="text-emerald-400 text-base font-black">${abonado.toLocaleString('es-CL')}</strong>
                              </div>
                              <div>
                                <span className="text-gray-400 block text-[11px] font-semibold">Saldo Pendiente:</span>
                                <strong className="text-amber-400 text-base font-black">${saldo.toLocaleString('es-CL')}</strong>
                              </div>
                            </div>

                            {/* Registro de Abonos e Historial Acumulativo */}
                            <div className="bg-[#1e1e1e] p-3.5 rounded-2xl border border-gray-700 space-y-3 shadow-inner">
                              <h4 className="text-white font-extrabold text-xs flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-[#F7931F]" />
                                <span>Ingresar Nuevo Abono o Pago (Comprobante Obligatorio)</span>
                              </h4>

                              {abonoErrorMsg && (
                                <div className="p-2.5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-xs font-bold animate-fadeIn">
                                  ⚠️ {abonoErrorMsg}
                                </div>
                              )}

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                <div>
                                  <label className="text-[11px] text-gray-400 font-bold block mb-1">Monto Abono ($ CLP) *</label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-400 font-bold text-xs">$</span>
                                    <input
                                      type="text"
                                      placeholder="500.000"
                                      value={nuevoAbonoMonto ? Number(nuevoAbonoMonto).toLocaleString('es-CL') : ''}
                                      onChange={(e) => {
                                        const digits = e.target.value.replace(/\D/g, '');
                                        setNuevoAbonoMonto(digits);
                                        setAbonoErrorMsg('');
                                      }}
                                      className="w-full bg-[#252525] text-white border border-gray-700 rounded-xl pl-7 pr-3 py-1.5 text-xs font-bold focus:outline-none focus:border-[#F7931F]"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[11px] text-gray-400 font-bold block mb-1">Comprobante de Pago *</label>
                                  <label className="w-full bg-[#252525] hover:bg-[#2d2d2d] text-gray-300 border border-gray-700 rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer flex items-center justify-between transition truncate">
                                    <span className="truncate">{nuevoAbonoFileName || 'Subir Comprobante'}</span>
                                    <Paperclip className="w-3.5 h-3.5 text-[#F7931F] shrink-0 ml-1" />
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
                                  <label className="text-[11px] text-gray-400 font-bold block mb-1">Nota / Referencia</label>
                                  <input
                                    type="text"
                                    placeholder="Ej. Transferencia #9842"
                                    value={nuevoAbonoNota}
                                    onChange={(e) => setNuevoAbonoNota(e.target.value)}
                                    className="w-full bg-[#252525] text-white border border-gray-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-[#F7931F]"
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

                                      // Upload file to Supabase storage
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
                                    className="w-full bg-[#F7931F] hover:bg-[#e08316] text-white text-xs font-extrabold px-3 py-2 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Agregar Abono</span>
                                  </button>
                                </div>
                              </div>

                              {/* Historial de Abonos Registrados con Editar y Eliminar */}
                              <div className="pt-3 border-t border-gray-700/80 space-y-2">
                                <span className="text-gray-400 text-[11px] font-bold block">Historial de Abonos Registrados:</span>
                                {(() => {
                                  const abonosList = (selectedOp.comprobantes_pago || []).filter(
                                    (item: any) => typeof item === 'object' && item !== null && 'monto' in item
                                  );

                                  if (abonosList.length === 0) {
                                    return (
                                      <p className="text-gray-500 italic text-[11px]">No hay abonos registrados en el historial.</p>
                                    );
                                  }

                                  return (
                                    <div className="space-y-2">
                                      {abonosList.map((ab: any, idx: number) => {
                                        const isEditingThis = editingAbonoId === ab.id;

                                        if (isEditingThis) {
                                          return (
                                            <div key={ab.id || idx} className="bg-[#2a2a2a] p-3 rounded-xl border border-[#F7931F] space-y-2 text-xs">
                                              <span className="font-bold text-[#F7931F] text-[11px]">Editar Abono:</span>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <input
                                                  type="text"
                                                  value={editAbonoMonto ? Number(editAbonoMonto).toLocaleString('es-CL') : ''}
                                                  onChange={(e) => setEditAbonoMonto(e.target.value.replace(/\D/g, ''))}
                                                  className="bg-[#1e1e1e] text-white border border-gray-700 rounded-lg px-2 py-1 text-xs font-bold"
                                                />
                                                <input
                                                  type="text"
                                                  value={editAbonoNota}
                                                  onChange={(e) => setEditAbonoNota(e.target.value)}
                                                  className="bg-[#1e1e1e] text-white border border-gray-700 rounded-lg px-2 py-1 text-xs"
                                                />
                                                <div className="flex items-center gap-1">
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
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2 py-1 rounded-lg"
                                                  >
                                                    Guardar
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingAbonoId(null)}
                                                    className="bg-gray-700 text-white font-bold text-[11px] px-2 py-1 rounded-lg"
                                                  >
                                                    Cancelar
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={ab.id || idx} className="bg-[#252525] p-2.5 rounded-xl border border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                            <div className="space-y-0.5">
                                              <div className="flex items-center gap-2">
                                                <span className="font-bold text-emerald-400 text-sm">
                                                  ${Number(ab.monto || 0).toLocaleString('es-CL')} CLP
                                                </span>
                                                <span className="text-gray-300 text-xs font-semibold">
                                                  — {ab.nota || 'Abono'}
                                                </span>
                                              </div>

                                              {ab.comprobante_url && (
                                                <a
                                                  href={ab.comprobante_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-amber-400 hover:underline text-[11px] font-mono flex items-center gap-1 mt-0.5"
                                                >
                                                  <FileCheck className="w-3 h-3 text-[#F7931F]" />
                                                  <span>Comprobante: {ab.comprobante_nombre || 'Ver archivo'}</span>
                                                </a>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                              <div className="text-right text-[10px] text-gray-400 mr-2">
                                                <span>{ab.fecha}</span>
                                                {ab.creado_por && <span className="block text-gray-500 font-semibold">{ab.creado_por}</span>}
                                              </div>

                                              {/* Botón Editar Abono */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingAbonoId(ab.id);
                                                  setEditAbonoMonto(String(ab.monto || ''));
                                                  setEditAbonoNota(ab.nota || '');
                                                }}
                                                className="p-1 bg-[#1e1e1e] hover:bg-blue-600/30 text-blue-400 rounded-lg transition border border-gray-700"
                                                title="Editar Abono"
                                              >
                                                <Edit className="w-3.5 h-3.5" />
                                              </button>

                                              {/* Botón Eliminar Abono */}
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
                                                className="p-1 bg-[#1e1e1e] hover:bg-red-600/30 text-red-400 rounded-lg transition border border-gray-700"
                                                title="Eliminar Abono"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
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

                      {/* Adjuntos Reales con Input type="file" (Nota de Venta & Orden de Compra) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Nota de Venta */}
                        <div className="bg-[#1e1e1e] p-3 rounded-xl border border-gray-700 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-200">Nota de Venta</span>
                            <label className="text-[#F7931F] hover:underline font-bold text-[11px] cursor-pointer flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              <span>Subir</span>
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleRealFileUpload(e, 'nota')}
                              />
                            </label>
                          </div>
                          {notaFiles.length > 0 ? (
                            <div className="space-y-1">
                              {notaFiles.map((f, i) => (
                                <a
                                  key={i}
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-blue-400 font-mono text-[10px] truncate flex items-center gap-1 transition"
                                >
                                  <FileCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{f.name}</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-[11px]">Sin nota de venta</p>
                          )}
                        </div>

                        {/* Orden de Compra */}
                        <div className="bg-[#1e1e1e] p-3 rounded-xl border border-gray-700 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-200">Orden Compra</span>
                            <label className="text-[#F7931F] hover:underline font-bold text-[11px] cursor-pointer flex items-center gap-1">
                              <Paperclip className="w-3 h-3" />
                              <span>Subir</span>
                              <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleRealFileUpload(e, 'oc')}
                              />
                            </label>
                          </div>
                          {ocFiles.length > 0 ? (
                            <div className="space-y-1">
                              {ocFiles.map((f, i) => (
                                <a
                                  key={i}
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-purple-400 font-mono text-[10px] truncate flex items-center gap-1 transition"
                                >
                                  <FileCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{f.name}</span>
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 italic text-[11px]">Sin orden compra</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Columna Derecha (25% - 4/12 Cols): Lateral COMPLETO a todo el alto desde arriba hasta el fondo */}
            <div className="lg:col-span-4 bg-[#252525] rounded-2xl border border-gray-700 p-4 flex flex-col justify-between h-full overflow-hidden shadow-md">
              <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-gray-700 pb-2.5">
                  <h3 className="font-extrabold text-sm text-[#F7931F] uppercase tracking-wider flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#F7931F]" />
                    <span>Actividades</span>
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-[#1e1e1e] text-gray-400 font-bold px-2 py-0.5 rounded-full border border-gray-700">
                      {(selectedOp.chat_interno || []).length} comentarios
                    </span>
                    <button
                      onClick={() => setSelectedOp(null)}
                      className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition font-bold text-base"
                      title="Cerrar Modal"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Feed de Actividades & Comentarios con Scroll */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
                  {(() => {
                    const chatList = selectedOp.chat_interno || [];
                    const hasMany = chatList.length > 5;
                    const displayChat = (hasMany && !isActividadesExpanded) ? chatList.slice(-5) : chatList;

                    if (chatList.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500 italic text-[11px] space-y-2">
                          <MessageSquare className="w-8 h-8 text-gray-600 mx-auto opacity-40" />
                          <p>No hay actividades registradas.</p>
                          <p className="text-[10px] text-gray-600">Escribe un comentario abajo usando @ para mencionar a un integrante.</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {hasMany && (
                          <div className="text-center pb-2">
                            <button
                              onClick={() => setIsActividadesExpanded(!isActividadesExpanded)}
                              className="text-xs text-[#F7931F] hover:text-[#e08316] font-bold transition underline"
                            >
                              {isActividadesExpanded ? 'Ver menos actividades' : `Ver ${chatList.length - 5} actividades anteriores`}
                            </button>
                          </div>
                        )}
                        {displayChat.map((msg) => {
                          const isUserComment =
                            msg.tipo === 'comentario' ||
                            (!msg.tipo && !msg.contenido?.startsWith('['));

                      if (isUserComment) {
                        return (
                          <div key={msg.id} className="bg-[#1e1e1e] p-3 rounded-xl border border-gray-700 space-y-1 shadow-sm">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-extrabold text-[#F7931F] flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
                                <span>{msg.usuario_nombre}</span>
                              </span>
                              <span className="text-gray-500 text-[10px]">
                                {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-gray-200 leading-normal text-xs">{msg.contenido}</p>
                          </div>
                        );
                      }

                      return (
                        <div key={msg.id} className="bg-[#272118] p-2.5 rounded-xl border border-[#F7931F]/40 space-y-1 shadow-sm">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-[#F7931F]" />
                              <span>Actualización de Sistema — {msg.usuario_nombre}</span>
                            </span>
                            <span className="text-gray-500 text-[10px]">
                              {new Date(msg.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-amber-200/90 leading-normal text-[11px] font-medium">{msg.contenido}</p>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
              </div>

              {/* Input de Comentarios en el Fondo del Panel Lateral */}
              <div className="pt-3 border-t border-gray-700 relative text-xs" ref={mentionRef}>
                {mentionMenuOpen && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#363636] border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fadeIn">
                    <div className="p-2 bg-[#252525] text-gray-400 font-bold text-[10px] uppercase border-b border-gray-700 flex justify-between items-center">
                      <span>Mencionar integrante:</span>
                      <button
                        type="button"
                        onClick={() => setMentionMenuOpen(false)}
                        className="text-gray-400 hover:text-white font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-gray-700/50">
                      {filteredMentionUsers.map((usr, idx) => (
                        <button
                          key={usr.id}
                          type="button"
                          onClick={() => handleInsertMention(usr.nombre)}
                          className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between ${
                            idx === selectedMentionIndex ? 'bg-[#F7931F] text-white' : 'text-gray-200 hover:bg-[#F7931F]/30'
                          }`}
                        >
                          <span className="font-bold">{usr.nombre}</span>
                          <span className="text-[10px] opacity-80 uppercase">{usr.rol}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Escribe un comentario o actividad... Usa @ para mencionar a alguien"
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
                    className="w-full bg-[#1c1c1c] text-white font-medium border border-gray-700 rounded-xl p-2.5 text-xs focus:outline-none focus:border-[#F7931F] placeholder-gray-500 min-h-[60px] resize-y"
                  />

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMentionMenuOpen(!mentionMenuOpen)}
                      className="p-1.5 bg-gray-800 hover:bg-gray-700 text-[#F7931F] rounded-lg transition text-xs font-bold flex items-center gap-1"
                    >
                      <AtSign className="w-3.5 h-3.5" />
                      <span>Mencionar</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendChatMessage}
                      className="bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold text-xs px-4 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Comentar</span>
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
    </div>
  );
}

