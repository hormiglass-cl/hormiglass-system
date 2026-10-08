'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Trabajador,
  TrabajadorDocumento,
  TrabajadorPermisoAusencia,
  TrabajadorLiquidacion,
  TrabajadorNota,
  TrabajadorAsistencia,
  EstadoAsistencia,
  EstadoDisponibilidad,
  CategoriaDocumentoTrabajador,
  TipoPermisoAusencia,
  CARGOS_RRHH_DEFAULT,
  AREAS_RRHH_DEFAULT,
  EventoProduccionLogistica,
  VisitaTerreno,
  Usuario,
  Recordatorio,
  UrgenciaRecordatorio,
  RecurrenciaRecordatorio,
  SeccionAdministracionEmpresa,
} from '../../../lib/types';
import { completeRecordatorio } from '../../../lib/recordatorios';
import {
  ArrowLeft,
  UserCheck,
  Edit,
  Save,
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Briefcase,
  Folder,
  FileText,
  FileCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HardHat,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Download,
  Eye,
  ExternalLink,
  MessageSquare,
  Building2,
  CalendarDays,
  ShieldCheck,
  Lock,
  Send,
  AlertCircle,
  CreditCard,
  Check,
  UserRound,
  ListTodo,
  Fingerprint,
  Timer,
  Bell,
  Link2,
  Unlink,
  CheckSquare,
  Circle,
  Square,
} from 'lucide-react';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../../lib/chile-data';
import { SearchableSelect } from '../../../components/SearchableSelect';

// Configuración visual de Disponibilidad
const DISPONIBILIDAD_CONFIG: Record<
  EstadoDisponibilidad,
  { label: string; bg: string; text: string; border: string }
> = {
  disponible: { label: 'Disponible', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  en_terreno: { label: 'En terreno / obra', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  permiso: { label: 'En permiso', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  licencia: { label: 'Licencia médica', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  vacaciones: { label: 'Vacaciones', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  falta: { label: 'Falta / ausente', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

// Subcategorías de Documentos
const CATEGORIAS_DOCUMENTOS: { id: CategoriaDocumentoTrabajador; label: string; icon: any }[] = [
  { id: 'contratos', label: 'Contratos', icon: FileCheck },
  { id: 'anexos', label: 'Anexos', icon: FileText },
  { id: 'liquidaciones', label: 'Liquidaciones de sueldo', icon: DollarSign },
  { id: 'comprobantes', label: 'Comprobantes de pago', icon: CreditCard },
  { id: 'licencias', label: 'Licencias médicas', icon: AlertCircle },
  { id: 'certificados', label: 'Certificados & antecedentes', icon: ShieldCheck },
  { id: 'otros', label: 'Otros documentos', icon: Folder },
];

export default function TrabajadorDetailPage() {
  const params = useParams();
  const workerId = params?.id as string;
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null);
  const [documentos, setDocumentos] = useState<TrabajadorDocumento[]>([]);
  const [permisos, setPermisos] = useState<TrabajadorPermisoAusencia[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<TrabajadorLiquidacion[]>([]);
  const [notas, setNotas] = useState<TrabajadorNota[]>([]);
  const [asistencias, setAsistencias] = useState<TrabajadorAsistencia[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [eventosAsociados, setEventosAsociados] = useState<EventoProduccionLogistica[]>([]);
  const [visitasAsociadas, setVisitasAsociadas] = useState<VisitaTerreno[]>([]);

  // Pestaña activa en columna central
  const [activeTab, setActiveTab] = useState<
    'documentos' | 'permisos' | 'liquidaciones' | 'recordatorios' | 'asistencia' | 'bitacora'
  >('documentos');
  const [categoriaDocFiltro, setCategoriaDocFiltro] = useState<string>('todas');

  // Acordeones columna izquierda
  const [openContactInfo, setOpenContactInfo] = useState(true);
  const [openBankInfo, setOpenBankInfo] = useState(false);

  // Modales
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [showNewPermisoModal, setShowNewPermisoModal] = useState(false);
  const [showNewLiquidacionModal, setShowNewLiquidacionModal] = useState(false);
  const [showNewRecordatorioModal, setShowNewRecordatorioModal] = useState(false);
  const [showNewAsistenciaModal, setShowNewAsistenciaModal] = useState(false);
  const [showLinkUserModal, setShowLinkUserModal] = useState(false);
  const [selectedLinkUserId, setSelectedLinkUserId] = useState<string>('');

  // Estados de formulario
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [savingPermiso, setSavingPermiso] = useState(false);
  const [savingLiquidacion, setSavingLiquidacion] = useState(false);
  const [savingRecordatorio, setSavingRecordatorio] = useState(false);
  const [savingAsistencia, setSavingAsistencia] = useState(false);
  const [newNotaText, setNewNotaText] = useState('');
  const [newNotaTipo, setNewNotaTipo] = useState<'nota' | 'felicitacion' | 'amonestacion' | 'evaluacion'>('nota');
  const [savingNota, setSavingNota] = useState(false);

  // Formulario Edición de Perfil
  const [editFormData, setEditFormData] = useState({
    nombre: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
    comuna: '',
    region: '',
    cargo: '',
    area: '',
    tipo_contrato: '',
    sueldo_base: 0,
    fecha_ingreso: '',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    banco: '',
    tipo_cuenta: '',
    numero_cuenta: '',
    observaciones: '',
  });

  // Formulario Nuevo Documento
  const [newDocData, setNewDocData] = useState<{
    categoria: CategoriaDocumentoTrabajador;
    nombre_archivo: string;
    url: string;
    fecha_emision: string;
    notas: string;
  }>({
    categoria: 'contratos',
    nombre_archivo: '',
    url: '',
    fecha_emision: new Date().toISOString().split('T')[0],
    notas: '',
  });

  // Formulario Nuevo Permiso
  const [newPermisoData, setNewPermisoData] = useState<{
    tipo: TipoPermisoAusencia;
    fecha_inicio: string;
    fecha_fin: string;
    motivo: string;
    bloquea_calendario: boolean;
  }>({
    tipo: 'permiso',
    fecha_inicio: new Date().toISOString().split('T')[0],
    fecha_fin: new Date().toISOString().split('T')[0],
    motivo: '',
    bloquea_calendario: true,
  });

  // Formulario Nueva Liquidación
  const [newLiquidacionData, setNewLiquidacionData] = useState({
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    monto_sueldo_base: 0,
    bonos: 0,
    descuentos: 0,
    monto_liquido: 0,
    estado_pago: 'pagado' as 'pendiente' | 'pagado',
    comprobante_url: '',
  });

  // Formulario Nuevo Recordatorio
  const [newRecordatorioData, setNewRecordatorioData] = useState<{
    titulo: string;
    descripcion: string;
    urgencia: UrgenciaRecordatorio;
    seccion: SeccionAdministracionEmpresa;
    fecha_vencimiento: string;
    recurrencia: RecurrenciaRecordatorio;
  }>({
    titulo: '',
    descripcion: '',
    urgencia: 'alta',
    seccion: 'sueldos_administrativos',
    fecha_vencimiento: new Date().toISOString().split('T')[0],
    recurrencia: 'ninguna',
  });

  // Formulario Nueva Asistencia
  const [newAsistenciaData, setNewAsistenciaData] = useState<{
    fecha: string;
    hora_entrada: string;
    hora_salida: string;
    estado: EstadoAsistencia;
    minutos_atraso: number;
    observaciones: string;
  }>({
    fecha: new Date().toISOString().split('T')[0],
    hora_entrada: '08:00',
    hora_salida: '17:30',
    estado: 'presente',
    minutos_atraso: 0,
    observaciones: '',
  });

  // Carga completa desde Supabase
  const loadWorkerFullData = async () => {
    if (!workerId) return;

    try {
      // 1. Obtener ficha del trabajador
      const wRes = await supabase.from('trabajadores').select('*').eq('id', workerId).single();
      if (!wRes.data) {
        setLoading(false);
        return;
      }

      const w = wRes.data as Trabajador;
      setTrabajador(w);
      setSelectedLinkUserId(w.usuario_id || '');
      setEditFormData({
        nombre: w.nombre || '',
        rut: w.rut || '',
        email: w.email || '',
        telefono: w.telefono || '',
        direccion: w.direccion || '',
        comuna: w.comuna || '',
        region: w.region || '',
        cargo: w.cargo || '',
        area: w.area || '',
        tipo_contrato: w.tipo_contrato || 'Indefinido',
        sueldo_base: Number(w.sueldo_base || 0),
        fecha_ingreso: w.fecha_ingreso || '',
        contacto_emergencia_nombre: w.contacto_emergencia_nombre || '',
        contacto_emergencia_telefono: w.contacto_emergencia_telefono || '',
        banco: w.banco || '',
        tipo_cuenta: w.tipo_cuenta || '',
        numero_cuenta: w.numero_cuenta || '',
        observaciones: w.observaciones || '',
      });

      setNewLiquidacionData((prev) => ({
        ...prev,
        monto_sueldo_base: Number(w.sueldo_base || 0),
        monto_liquido: Number(w.sueldo_base || 0),
      }));

      // 2. Consultas en paralelo
      const [docRes, permRes, liqRes, notRes, asistRes, usrsRes, evRes, visRes, recRes] = await Promise.all([
        supabase.from('trabajador_documentos').select('*').eq('trabajador_id', workerId).order('created_at', { ascending: false }),
        supabase.from('trabajador_permisos_ausencias').select('*').eq('trabajador_id', workerId).order('fecha_inicio', { ascending: false }),
        supabase.from('trabajador_liquidaciones_sueldos').select('*').eq('trabajador_id', workerId).order('anio', { ascending: false }).order('mes', { ascending: false }),
        supabase.from('trabajador_notas').select('*, usuario:usuarios(*)').eq('trabajador_id', workerId).order('created_at', { ascending: false }),
        supabase.from('trabajador_asistencia').select('*').eq('trabajador_id', workerId).order('fecha', { ascending: false }),
        supabase.from('usuarios').select('id, nombre, email, rol').order('nombre'),
        supabase.from('eventos_produccion_logistica').select('*').order('fecha_inicio', { ascending: false }),
        supabase.from('visitas_terreno').select('*, oportunidad:oportunidades(*)').order('created_at', { ascending: false }),
        w.usuario_id
          ? supabase
              .from('recordatorios')
              .select('*, asignado_a:usuarios!asignado_a_id(*), creado_por:usuarios!creado_por_id(*)')
              .eq('asignado_a_id', w.usuario_id)
              .eq('activo', true)
              .order('fecha_vencimiento', { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);

      if (docRes.data) setDocumentos(docRes.data as TrabajadorDocumento[]);
      if (permRes.data) setPermisos(permRes.data as TrabajadorPermisoAusencia[]);
      if (liqRes.data) setLiquidaciones(liqRes.data as TrabajadorLiquidacion[]);
      if (notRes.data) setNotas(notRes.data as TrabajadorNota[]);
      if (asistRes.data) setAsistencias(asistRes.data as TrabajadorAsistencia[]);
      if (usrsRes.data) setUsuariosList(usrsRes.data as Usuario[]);
      if (recRes.data) setRecordatorios(recRes.data as Recordatorio[]);

      // 3. Filtrar eventos asociados exclusivamente a este trabajador
      if (evRes.data) {
        const evList = evRes.data as EventoProduccionLogistica[];
        const matchedEvs = evList.filter((e) => {
          if (w.usuario_id && (e.responsable_id === w.usuario_id || e.responsable_calendario_id === w.usuario_id || e.registrado_por === w.usuario_id)) {
            return true;
          }
          const nom = w.nombre.toLowerCase();
          return (e.titulo || '').toLowerCase().includes(nom) || (e.observaciones || '').toLowerCase().includes(nom);
        });
        setEventosAsociados(matchedEvs);
      }

      // 4. Filtrar visitas técnicas asociadas exclusivamente a este trabajador
      if (visRes.data) {
        const visList = visRes.data as VisitaTerreno[];
        const matchedVis = visList.filter((v) => {
          if (w.usuario_id && (v.tecnico_id === w.usuario_id || v.responsable_calendario_id === w.usuario_id)) {
            return true;
          }
          const nom = w.nombre.toLowerCase();
          return (v.tecnico_visita || '').toLowerCase().includes(nom);
        });
        setVisitasAsociadas(matchedVis);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error cargando ficha del trabajador:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkerFullData();

    // Supabase Realtime
    const channel = supabase
      .channel(`rrhh_worker_${workerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajadores', filter: `id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_documentos', filter: `trabajador_id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_permisos_ausencias', filter: `trabajador_id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_liquidaciones_sueldos', filter: `trabajador_id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_notas', filter: `trabajador_id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_asistencia', filter: `trabajador_id=eq.${workerId}` }, () => loadWorkerFullData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => loadWorkerFullData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId]);

  // Vincular o desvincular cuenta de usuario del CRM
  const handleLinkUser = async (newUsuarioId: string | null) => {
    if (!trabajador) return;
    const { error } = await supabase
      .from('trabajadores')
      .update({ usuario_id: newUsuarioId, updated_at: new Date().toISOString() })
      .eq('id', trabajador.id);

    if (error) {
      console.error('Error vinculando usuario:', error);
    } else {
      setShowLinkUserModal(false);
      loadWorkerFullData();
    }
  };

  // Completar o reactivar Recordatorio
  const handleToggleRecordatorio = async (rec: Recordatorio) => {
    try {
      await completeRecordatorio(supabase, rec);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error al actualizar recordatorio:', err);
    }
  };

  // Guardar nuevo Recordatorio asignado al colaborador
  const handleSaveRecordatorio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador?.usuario_id || !newRecordatorioData.titulo.trim()) return;

    setSavingRecordatorio(true);
    try {
      const { error } = await supabase.from('recordatorios').insert([
        {
          empresa: 'comercial',
          seccion: newRecordatorioData.seccion,
          titulo: newRecordatorioData.titulo.trim(),
          descripcion: newRecordatorioData.descripcion.trim() || null,
          urgencia: newRecordatorioData.urgencia,
          estado: 'por_hacer',
          fecha_vencimiento: newRecordatorioData.fecha_vencimiento,
          recurrencia: newRecordatorioData.recurrencia,
          recurrencia_dia_mes:
            newRecordatorioData.recurrencia === 'mensual'
              ? Number(newRecordatorioData.fecha_vencimiento.split('-')[2])
              : null,
          asignado_a_id: trabajador.usuario_id,
          creado_por_id: currentUser?.id || null,
          completado: false,
          activo: true,
          veces_completado: 0,
        },
      ]);

      if (error) throw error;

      setShowNewRecordatorioModal(false);
      setNewRecordatorioData({
        titulo: '',
        descripcion: '',
        urgencia: 'alta',
        seccion: 'sueldos_administrativos',
        fecha_vencimiento: new Date().toISOString().split('T')[0],
        recurrencia: 'ninguna',
      });
      loadWorkerFullData();
    } catch (err) {
      console.error('Error creando recordatorio:', err);
    } finally {
      setSavingRecordatorio(false);
    }
  };

  // Desactivar / Eliminar Recordatorio
  const handleDeleteRecordatorio = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este recordatorio?')) return;
    const { error } = await supabase.from('recordatorios').update({ activo: false }).eq('id', id);
    if (error) console.error(error);
    else loadWorkerFullData();
  };

  // Registrar Asistencia Manual
  const handleSaveAsistencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador) return;

    setSavingAsistencia(true);
    try {
      const { error } = await supabase.from('trabajador_asistencia').insert([
        {
          trabajador_id: trabajador.id,
          fecha: newAsistenciaData.fecha,
          hora_entrada: newAsistenciaData.hora_entrada ? `${newAsistenciaData.hora_entrada}:00` : null,
          hora_salida: newAsistenciaData.hora_salida ? `${newAsistenciaData.hora_salida}:00` : null,
          estado: newAsistenciaData.estado,
          minutos_atraso: Number(newAsistenciaData.minutos_atraso || 0),
          origen: 'manual',
          observaciones: newAsistenciaData.observaciones.trim() || null,
          creado_por: currentUser?.id || null,
        },
      ]);

      if (error) throw error;

      setShowNewAsistenciaModal(false);
      setNewAsistenciaData({
        fecha: new Date().toISOString().split('T')[0],
        hora_entrada: '08:00',
        hora_salida: '17:30',
        estado: 'presente',
        minutos_atraso: 0,
        observaciones: '',
      });
      loadWorkerFullData();
    } catch (err) {
      console.error('Error registrando asistencia:', err);
    } finally {
      setSavingAsistencia(false);
    }
  };

  // Eliminar Marcaje de Asistencia
  const handleDeleteAsistencia = async (id: string) => {
    if (!confirm('¿Seguro que deseas eliminar este registro de asistencia?')) return;
    const { error } = await supabase.from('trabajador_asistencia').delete().eq('id', id);
    if (error) console.error(error);
    else loadWorkerFullData();
  };

  // Actualizar disponibilidad
  const handleUpdateDisponibilidad = async (nuevoEstado: EstadoDisponibilidad) => {
    if (!trabajador) return;
    setTrabajador({ ...trabajador, estado_disponibilidad: nuevoEstado });

    const { error } = await supabase
      .from('trabajadores')
      .update({ estado_disponibilidad: nuevoEstado, updated_at: new Date().toISOString() })
      .eq('id', trabajador.id);

    if (error) {
      console.error('Error actualizando disponibilidad:', error);
      loadWorkerFullData();
    }
  };

  // Guardar edición del perfil
  const handleSaveEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador) return;

    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('trabajadores')
        .update({
          nombre: editFormData.nombre.trim(),
          rut: editFormData.rut.trim(),
          email: editFormData.email.trim() || null,
          telefono: editFormData.telefono.trim() || null,
          direccion: editFormData.direccion.trim() || null,
          comuna: editFormData.comuna || null,
          region: editFormData.region || null,
          cargo: editFormData.cargo,
          area: editFormData.area,
          tipo_contrato: editFormData.tipo_contrato,
          sueldo_base: Number(editFormData.sueldo_base || 0),
          fecha_ingreso: editFormData.fecha_ingreso || null,
          contacto_emergencia_nombre: editFormData.contacto_emergencia_nombre.trim() || null,
          contacto_emergencia_telefono: editFormData.contacto_emergencia_telefono.trim() || null,
          banco: editFormData.banco.trim() || null,
          tipo_cuenta: editFormData.tipo_cuenta.trim() || null,
          numero_cuenta: editFormData.numero_cuenta.trim() || null,
          observaciones: editFormData.observaciones.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trabajador.id);

      if (error) throw error;

      setShowEditInfoModal(false);
      setSavingEdit(false);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando perfil:', err);
      setSavingEdit(false);
    }
  };

  // Subir / Registrar Documento
  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador || !newDocData.nombre_archivo.trim()) return;

    setSavingDoc(true);
    try {
      const { error } = await supabase.from('trabajador_documentos').insert([
        {
          trabajador_id: trabajador.id,
          categoria: newDocData.categoria,
          nombre_archivo: newDocData.nombre_archivo.trim(),
          url: newDocData.url.trim() || '#',
          fecha_emision: newDocData.fecha_emision || null,
          subido_por: currentUser?.nombre || 'Administración',
          notas: newDocData.notas.trim() || null,
        },
      ]);

      if (error) throw error;

      setNewDocData({
        categoria: 'contratos',
        nombre_archivo: '',
        url: '',
        fecha_emision: new Date().toISOString().split('T')[0],
        notas: '',
      });
      setShowNewDocModal(false);
      setSavingDoc(false);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando documento:', err);
      setSavingDoc(false);
    }
  };

  // Eliminar Documento
  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('¿Estás seguro de eliminar este documento?')) return;
    try {
      await supabase.from('trabajador_documentos').delete().eq('id', docId);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error eliminando documento:', err);
    }
  };

  // Registrar Permiso / Ausencia
  const handleSavePermiso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador) return;

    setSavingPermiso(true);
    try {
      const { error } = await supabase.from('trabajador_permisos_ausencias').insert([
        {
          trabajador_id: trabajador.id,
          tipo: newPermisoData.tipo,
          fecha_inicio: newPermisoData.fecha_inicio,
          fecha_fin: newPermisoData.fecha_fin,
          motivo: newPermisoData.motivo.trim() || null,
          bloquea_calendario: newPermisoData.bloquea_calendario,
          estado: 'aprobado',
          aprobado_por: currentUser?.id || null,
        },
      ]);

      if (error) throw error;

      // Si el permiso cubre el día de hoy, actualizar estado_disponibilidad automáticamente
      const today = new Date().toISOString().split('T')[0];
      if (today >= newPermisoData.fecha_inicio && today <= newPermisoData.fecha_fin) {
        let nuevoEst: EstadoDisponibilidad = 'permiso';
        if (newPermisoData.tipo === 'licencia_medica') nuevoEst = 'licencia';
        else if (newPermisoData.tipo === 'vacaciones') nuevoEst = 'vacaciones';
        else if (newPermisoData.tipo === 'falta_injustificada') nuevoEst = 'falta';

        await supabase.from('trabajadores').update({ estado_disponibilidad: nuevoEst }).eq('id', trabajador.id);
      }

      setShowNewPermisoModal(false);
      setSavingPermiso(false);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error registrando permiso:', err);
      setSavingPermiso(false);
    }
  };

  // Eliminar Permiso
  const handleDeletePermiso = async (permisoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este registro de permiso?')) return;
    try {
      await supabase.from('trabajador_permisos_ausencias').delete().eq('id', permisoId);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error eliminando permiso:', err);
    }
  };

  // Registrar Liquidación de Sueldo
  const handleSaveLiquidacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador) return;

    setSavingLiquidacion(true);
    try {
      const { error } = await supabase.from('trabajador_liquidaciones_sueldos').insert([
        {
          trabajador_id: trabajador.id,
          mes: newLiquidacionData.mes,
          anio: newLiquidacionData.anio,
          monto_sueldo_base: Number(newLiquidacionData.monto_sueldo_base || 0),
          bonos: Number(newLiquidacionData.bonos || 0),
          descuentos: Number(newLiquidacionData.descuentos || 0),
          monto_liquido: Number(newLiquidacionData.monto_liquido || 0),
          estado_pago: newLiquidacionData.estado_pago,
          comprobante_url: newLiquidacionData.comprobante_url.trim() || null,
        },
      ]);

      if (error) throw error;

      setShowNewLiquidacionModal(false);
      setSavingLiquidacion(false);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando liquidación:', err);
      setSavingLiquidacion(false);
    }
  };

  // Guardar Nota en Bitácora
  const handleSaveNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trabajador || !newNotaText.trim()) return;

    setSavingNota(true);
    try {
      const { error } = await supabase.from('trabajador_notas').insert([
        {
          trabajador_id: trabajador.id,
          usuario_id: currentUser?.id || null,
          tipo: newNotaTipo,
          contenido: newNotaText.trim(),
        },
      ]);

      if (error) throw error;

      setNewNotaText('');
      setSavingNota(false);
      loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando nota:', err);
      setSavingNota(false);
    }
  };

  // Filtrado de documentos por subcategoría
  const filteredDocs = useMemo(() => {
    if (categoriaDocFiltro === 'todas') return documentos;
    return documentos.filter((d) => d.categoria === categoriaDocFiltro);
  }, [documentos, categoriaDocFiltro]);

  // Resumen anual de permisos (año actual)
  const resumenPermisos = useMemo(() => {
    const anioActual = new Date().getFullYear();
    const permisosAnio = permisos.filter((p) => p.fecha_inicio?.startsWith(String(anioActual)));
    const diasAusente = permisosAnio.reduce((acc, p) => {
      const inicio = new Date(p.fecha_inicio).getTime();
      const fin = new Date(p.fecha_fin).getTime();
      const diff = Math.max(1, Math.round((fin - inicio) / (1000 * 60 * 60 * 24)) + 1);
      return acc + diff;
    }, 0);
    const vacaciones = permisosAnio.filter((p) => p.tipo === 'vacaciones').length;
    const licencias = permisosAnio.filter((p) => p.tipo === 'licencia_medica').length;
    const particulares = permisosAnio.filter((p) => p.tipo === 'permiso').length;
    return { anioActual, total: permisosAnio.length, diasAusente, vacaciones, licencias, particulares };
  }, [permisos]);

  // Resumen anual de liquidaciones (año actual)
  const resumenLiquidaciones = useMemo(() => {
    const anioActual = new Date().getFullYear();
    const liqsAnio = liquidaciones.filter((l) => l.anio === anioActual);
    const totalLiquido = liqsAnio.reduce((acc, l) => acc + Number(l.monto_liquido || 0), 0);
    const totalBonos = liqsAnio.reduce((acc, l) => acc + Number(l.bonos || 0), 0);
    const totalDescuentos = liqsAnio.reduce((acc, l) => acc + Number(l.descuentos || 0), 0);
    const pagadas = liqsAnio.filter((l) => l.estado_pago === 'pagado').length;
    return { anioActual, total: liqsAnio.length, totalLiquido, totalBonos, totalDescuentos, pagadas };
  }, [liquidaciones]);

  // Métricas de tareas / recordatorios
  const statsRecordatorios = useMemo(() => {
    const total = recordatorios.length;
    const pendientes = recordatorios.filter((r) => !r.completado).length;
    const completadas = recordatorios.filter((r) => r.completado).length;
    const hoy = new Date().toISOString().split('T')[0];
    const vencidas = recordatorios.filter((r) => !r.completado && r.fecha_vencimiento < hoy).length;
    const criticas = recordatorios.filter((r) => !r.completado && ['alta', 'critica'].includes(r.urgencia)).length;
    return { total, pendientes, completadas, vencidas, criticas };
  }, [recordatorios]);

  // Métricas de asistencia
  const statsAsistencia = useMemo(() => {
    const total = asistencias.length;
    const presentes = asistencias.filter((a) => a.estado === 'presente').length;
    const atrasos = asistencias.filter((a) => a.estado === 'atraso').length;
    const minutosAtraso = asistencias.reduce((acc, a) => acc + (a.minutos_atraso || 0), 0);
    const puntualidad = total > 0 ? Math.round((presentes / total) * 100) : 100;
    return { total, presentes, atrasos, minutosAtraso, puntualidad };
  }, [asistencias]);

  // Usuario vinculado en el CRM
  const linkedUsuario = useMemo(() => {
    if (!trabajador?.usuario_id) return null;
    return usuariosList.find((u) => u.id === trabajador.usuario_id) || null;
  }, [trabajador?.usuario_id, usuariosList]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
        Cargando ficha del colaborador...
      </div>
    );
  }

  if (!trabajador) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-black text-[#213343]">Colaborador no encontrado</h2>
        <Link
          href="/rrhh"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#f97316] text-white rounded-md font-bold text-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al directorio de recursos humanos</span>
        </Link>
      </div>
    );
  }

  const dispCfg =
    DISPONIBILIDAD_CONFIG[trabajador.estado_disponibilidad] ||
    DISPONIBILIDAD_CONFIG.disponible;


  return (
    <div className="space-y-6 text-[#213343] pb-12 ">
      {/* Botón Volver */}
      <div className="flex items-center justify-between">
        <Link
          href="/rrhh"
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#f97316] transition group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver al directorio de recursos humanos</span>
        </Link>
      </div>

      {/* ========================================================= */}
      {/* LAYOUT MODULAR DE 3 COLUMNAS (ESTILO HUBSPOT)             */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* COLUMNA IZQUIERDA: PERFIL & DATOS PERSONALES (~28% / 3.5 cols) */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-5">
          {/* Tarjeta Principal de Perfil */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
            <div className="flex items-start justify-between">
              <div className="w-16 h-16 rounded-lg bg-orange-500 text-white font-black text-2xl flex items-center justify-center shadow-sm">
                <UserRound className="w-8 h-8" />
              </div>

              <button
                onClick={() => setShowEditInfoModal(true)}
                className="p-2 rounded-md bg-gray-100 hover:bg-orange-50 text-gray-600 hover:text-[#f97316] transition cursor-pointer"
                title="Editar información del colaborador"
              >
                <Edit className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h2 className="text-xl font-black text-[#213343]">{trabajador.nombre}</h2>
              <p className="font-mono text-xs text-gray-400 font-semibold mt-0.5">
                RUT: {trabajador.rut}
              </p>
            </div>

            {/* Badges de Cargo, Área y Disponibilidad */}
            <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-semibold">Cargo:</span>
                <span className="font-bold text-[#213343] text-right truncate max-w-[180px]">
                  {trabajador.cargo}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-semibold">Área:</span>
                <span className="font-semibold text-gray-600">{trabajador.area}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-semibold">Contrato:</span>
                <span className="font-bold text-[#f97316]">{trabajador.tipo_contrato}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-400 font-semibold">Cuenta de usuario:</span>
                <span className="font-mono font-bold text-[11px] text-gray-700 truncate max-w-[170px]">
                  {trabajador.email || 'Vinculada'}
                </span>
              </div>
            </div>

            {/* Selector Reactivo de Disponibilidad */}
            <div className="pt-2 border-t border-gray-100 space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 block uppercase tracking-normal">
                Estado de Disponibilidad:
              </label>
              <select
                value={trabajador.estado_disponibilidad}
                onChange={(e) =>
                  handleUpdateDisponibilidad(e.target.value as EstadoDisponibilidad)
                }
                className={`w-full px-3 py-2 rounded-md text-xs font-bold border cursor-pointer focus:outline-none transition shadow-2xs ${dispCfg.bg} ${dispCfg.text} ${dispCfg.border}`}
              >
                <option value="disponible">Disponible</option>
                <option value="en_terreno">En terreno / obra</option>
                <option value="permiso">En permiso</option>
                <option value="licencia">Licencia médica</option>
                <option value="vacaciones">Vacaciones</option>
                <option value="falta">Falta / ausente</option>
              </select>
            </div>

            {/* Botones de Acción Rápida */}
            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setShowNewPermisoModal(true)}
                className="p-2.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Permiso</span>
              </button>

              <button
                onClick={() => setShowNewDocModal(true)}
                className="p-2.5 rounded-md bg-orange-50 hover:bg-orange-100 text-[#f97316] border border-orange-200 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Documento</span>
              </button>

              <button
                onClick={() => setShowNewLiquidacionModal(true)}
                className="p-2.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                <span>Liquidación</span>
              </button>

              <button
                onClick={() => setActiveTab('bitacora')}
                className="p-2.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Nota</span>
              </button>
            </div>
          </div>

          {/* Acordeón 1: Información de Contacto & Personal */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden text-xs">
            <button
              onClick={() => setOpenContactInfo(!openContactInfo)}
              className="w-full p-4 flex items-center justify-between font-extrabold text-[#213343] hover:bg-gray-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#f97316]" />
                <span>Información de Contacto</span>
              </div>
              {openContactInfo ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {openContactInfo && (
              <div className="p-4 pt-0 space-y-2.5 text-xs border-t border-gray-100 ">
                <div>
                  <span className="text-gray-400 font-semibold block">Teléfono:</span>
                  <span className="font-bold text-[#213343]">{trabajador.telefono || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Correo electrónico:</span>
                  <span className="font-bold text-[#213343]">{trabajador.email || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Dirección:</span>
                  <span className="font-bold text-[#213343]">{trabajador.direccion || 'No registrada'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-400 font-semibold block">Comuna:</span>
                    <span className="font-bold text-[#213343]">{trabajador.comuna || 'Sin comuna'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block">Región:</span>
                    <span className="font-bold text-[#213343] truncate block">{trabajador.region || 'Metropolitana'}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-400 font-semibold block">Contacto de emergencia:</span>
                  <span className="font-bold text-red-600 block">
                    {trabajador.contacto_emergencia_nombre || 'Sin contacto de emergencia'}
                  </span>
                  {trabajador.contacto_emergencia_telefono && (
                    <span className="font-mono text-gray-500 font-semibold">
                      {trabajador.contacto_emergencia_telefono}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Acordeón 2: Datos Bancarios & Previsionales */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden text-xs">
            <button
              onClick={() => setOpenBankInfo(!openBankInfo)}
              className="w-full p-4 flex items-center justify-between font-extrabold text-[#213343] hover:bg-gray-50 transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Datos Bancarios & Sueldo</span>
              </div>
              {openBankInfo ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {openBankInfo && (
              <div className="p-4 pt-0 space-y-2.5 text-xs border-t border-gray-100 ">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 font-semibold">Sueldo base pactado:</span>
                  <span className="font-mono font-black text-[#f97316]">
                    ${Number(trabajador.sueldo_base || 0).toLocaleString('es-CL')} CLP
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Banco:</span>
                  <span className="font-bold text-[#213343]">{trabajador.banco || 'No especificado'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-400 font-semibold block">Tipo de cuenta:</span>
                    <span className="font-bold text-[#213343]">{trabajador.tipo_cuenta || 'Cuenta Vista / Rut'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 font-semibold block">N° de cuenta:</span>
                    <span className="font-mono font-bold text-[#213343]">{trabajador.numero_cuenta || 'Sin número'}</span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 font-semibold block">Fecha de ingreso:</span>
                  <span className="font-bold text-[#213343]">{trabajador.fecha_ingreso || 'No registrada'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* COLUMNA CENTRAL: PESTAÑAS MODULARES (~48% / 5 cols)       */}
        {/* ========================================================= */}
        <div className="lg:col-span-5 space-y-5">
          {/* Barra de Pestañas */}
          <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-xs flex items-center gap-1.5 overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setActiveTab('documentos')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'documentos'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <Folder className="w-4 h-4" />
              <span>Carpetas & Contratos</span>
              <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                {documentos.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('permisos')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'permisos'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Permisos & Ausencias</span>
              <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                {permisos.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('liquidaciones')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'liquidaciones'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Sueldos</span>
              <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                {liquidaciones.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('recordatorios')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'recordatorios'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <ListTodo className="w-4 h-4" />
              <span>Tareas</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === 'recordatorios'
                    ? 'bg-white/20'
                    : statsRecordatorios.pendientes > 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {statsRecordatorios.pendientes}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('asistencia')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'asistencia'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <Timer className="w-4 h-4" />
              <span>Asistencia</span>
              <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                {statsAsistencia.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('bitacora')}
              className={`px-3 py-2 rounded-md transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === 'bitacora'
                  ? 'bg-[#f97316] text-white shadow-xs font-black'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Bitácora</span>
              <span className="ml-1 bg-white/20 px-1.5 py-0.2 rounded-full text-[10px]">
                {notas.length}
              </span>
            </button>
          </div>

          {/* TAB 1: CARPETAS DE DOCUMENTOS */}
          {activeTab === 'documentos' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <Folder className="w-4 h-4 text-[#f97316]" />
                    <span>Carpetas de Documentos</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Contratos, anexos, liquidaciones y certificados laborales
                  </p>
                </div>

                <button
                  onClick={() => setShowNewDocModal(true)}
                  className="px-3 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Subir documento</span>
                </button>
              </div>

              {/* Filtro por subcarpetas */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  onClick={() => setCategoriaDocFiltro('todas')}
                  className={`px-3 py-1 rounded-md transition cursor-pointer font-bold ${
                    categoriaDocFiltro === 'todas'
                      ? 'bg-[#213343] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Todos ({documentos.length})
                </button>
                {CATEGORIAS_DOCUMENTOS.map((cat) => {
                  const count = documentos.filter((d) => d.categoria === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoriaDocFiltro(cat.id)}
                      className={`px-3 py-1 rounded-md transition cursor-pointer font-bold ${
                        categoriaDocFiltro === cat.id
                          ? 'bg-[#f97316] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Lista de Documentos */}
              {filteredDocs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  No hay documentos subidos en esta carpeta.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 hover:border-orange-200 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-md bg-orange-100 text-[#f97316] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <span className="font-bold text-[#213343] block truncate">
                            {doc.nombre_archivo}
                          </span>
                          <span className="text-[11px] text-gray-400 font-semibold block capitalize">
                            {doc.categoria} · {doc.fecha_emision || 'Sin fecha'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {doc.url && doc.url !== '#' && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-[#f97316] transition"
                            title="Descargar / Ver archivo"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-red-600 transition cursor-pointer"
                          title="Eliminar documento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PERMISOS Y AUSENCIAS */}
          {activeTab === 'permisos' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Permisos, Licencias y Vacaciones</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Control de ausencias y bloqueo de disponibilidad en calendarios
                  </p>
                </div>

                <button
                  onClick={() => setShowNewPermisoModal(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar permiso</span>
                </button>
              </div>

              {/* Tarjetas Resumen Anual */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Total Solicitudes</span>
                  <span className="text-base font-black text-amber-900">{resumenPermisos.total}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200">
                  <span className="text-[10px] uppercase font-bold text-[#ea580c] block">Días Ausente {resumenPermisos.anioActual}</span>
                  <span className="text-base font-black text-[#c2410c]">{resumenPermisos.diasAusente} días</span>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-[10px] uppercase font-bold text-blue-700 block">Vacaciones</span>
                  <span className="text-base font-black text-blue-900">{resumenPermisos.vacaciones}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase font-bold text-purple-700 block">Licencias</span>
                  <span className="text-base font-black text-purple-900">{resumenPermisos.licencias}</span>
                </div>
              </div>

              {permisos.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  ✓ El colaborador no tiene permisos ni ausencias registradas.
                </div>
              ) : (
                <div className="space-y-3">
                  {permisos.map((p) => (
                    <div
                      key={p.id}
                      className="p-4 rounded-lg bg-amber-50/60 border border-amber-200 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-black text-[#213343] capitalize">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>{p.tipo.replace('_', ' ')}</span>
                          <span className="text-[10.5px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                            {p.estado}
                          </span>
                        </div>

                        <button
                          onClick={() => handleDeletePermiso(p.id)}
                          className="text-gray-400 hover:text-red-600 transition"
                          title="Eliminar permiso"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-4 text-gray-600 font-mono text-[11px]">
                        <span>Desde: <strong>{p.fecha_inicio}</strong></span>
                        <span>Hasta: <strong>{p.fecha_fin}</strong></span>
                      </div>

                      {p.motivo && (
                        <p className="text-gray-600 italic bg-white/70 p-2 rounded-md border border-amber-100">
                          &quot;{p.motivo}&quot;
                        </p>
                      )}

                      {p.bloquea_calendario && (
                        <div className="flex items-center gap-1.5 text-[10.5px] text-amber-900 font-bold">
                          <Lock className="w-3 h-3 text-amber-700" />
                          <span>Bloquea disponibilidad en calendario de faenas</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUELDOS Y LIQUIDACIONES */}
          {activeTab === 'liquidaciones' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Historial de Sueldos & Liquidaciones</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Comprobantes mensuales y control de nómina
                  </p>
                </div>

                <button
                  onClick={() => setShowNewLiquidacionModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar liquidación</span>
                </button>
              </div>

              {/* Tarjetas Resumen Anual Sueldos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Líquido {resumenLiquidaciones.anioActual}</span>
                  <span className="text-sm font-mono font-black text-emerald-900">${resumenLiquidaciones.totalLiquido.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-[10px] uppercase font-bold text-blue-700 block">Bonos Totales</span>
                  <span className="text-sm font-mono font-black text-blue-900">${resumenLiquidaciones.totalBonos.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                  <span className="text-[10px] uppercase font-bold text-red-700 block">Descuentos</span>
                  <span className="text-sm font-mono font-black text-red-900">${resumenLiquidaciones.totalDescuentos.toLocaleString('es-CL')}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase font-bold text-purple-700 block">Liquidaciones</span>
                  <span className="text-sm font-black text-purple-900">{resumenLiquidaciones.pagadas} / {resumenLiquidaciones.total}</span>
                </div>
              </div>

              {liquidaciones.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  No hay liquidaciones de sueldo registradas aún.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {liquidaciones.map((l) => (
                    <div
                      key={l.id}
                      className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-black text-[#213343] block">
                          Período: {l.mes}/{l.anio}
                        </span>
                        <span className="text-[11px] text-gray-400 font-medium">
                          Base: ${l.monto_sueldo_base.toLocaleString('es-CL')} | Bonos: ${l.bonos.toLocaleString('es-CL')} | Desc: ${l.descuentos.toLocaleString('es-CL')}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-700 block text-sm">
                          ${l.monto_liquido.toLocaleString('es-CL')}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 inline-block mt-0.5">
                          {l.estado_pago}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RECORDATORIOS Y TAREAS */}
          {activeTab === 'recordatorios' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-[#f97316]" />
                    <span>Recordatorios & Tareas Asignadas</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Aislamiento estricto de tareas y compromisos operativos asignados al colaborador
                  </p>
                </div>

                {trabajador.usuario_id && (
                  <button
                    onClick={() => setShowNewRecordatorioModal(true)}
                    className="px-3 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nueva tarea</span>
                  </button>
                )}
              </div>

              {/* Tarjetas KPI de Tareas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Pendientes</span>
                  <span className="text-base font-black text-amber-900">{statsRecordatorios.pendientes}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Completadas</span>
                  <span className="text-base font-black text-emerald-900">{statsRecordatorios.completadas}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                  <span className="text-[10px] uppercase font-bold text-red-700 block">Vencidas</span>
                  <span className="text-base font-black text-red-900">{statsRecordatorios.vencidas}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase font-bold text-purple-700 block">Alta / Crítica</span>
                  <span className="text-base font-black text-purple-900">{statsRecordatorios.criticas}</span>
                </div>
              </div>

              {!trabajador.usuario_id ? (
                <div className="p-5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Colaborador sin cuenta de usuario CRM vinculada</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Este trabajador no tiene un usuario del sistema asignado en su ficha. Para poder asignarle recordatorios, tareas operativas y notificaciones en el CRM, vincula su cuenta en la columna derecha.
                  </p>
                  <button
                    onClick={() => setShowLinkUserModal(true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Vincular cuenta de usuario ahora</span>
                  </button>
                </div>
              ) : recordatorios.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  ✓ No hay tareas ni recordatorios pendientes para este colaborador.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recordatorios.map((rec) => {
                    const esVencido = !rec.completado && rec.fecha_vencimiento < new Date().toISOString().split('T')[0];
                    return (
                      <div
                        key={rec.id}
                        className={`p-3.5 rounded-lg border transition space-y-2 text-xs ${
                          rec.completado
                            ? 'bg-gray-50/80 border-gray-200 opacity-70'
                            : esVencido
                            ? 'bg-red-50/50 border-red-200'
                            : 'bg-white border-gray-200 hover:border-orange-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <button
                              onClick={() => handleToggleRecordatorio(rec)}
                              className="mt-0.5 text-gray-400 hover:text-[#f97316] transition cursor-pointer"
                              title={rec.completado ? 'Marcar como pendiente' : 'Marcar como completada'}
                            >
                              {rec.completado ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Circle className="w-4 h-4 text-gray-400 hover:text-[#f97316]" />
                              )}
                            </button>
                            <div>
                              <span
                                className={`font-bold block ${
                                  rec.completado
                                    ? 'line-through text-gray-400'
                                    : 'text-[#213343]'
                                }`}
                              >
                                {rec.titulo}
                              </span>
                              {rec.descripcion && (
                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                                  {rec.descripcion}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                rec.urgencia === 'critica'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : rec.urgencia === 'alta'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {rec.urgencia}
                            </span>
                            <button
                              onClick={() => handleDeleteRecordatorio(rec.id)}
                              className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                              title="Eliminar tarea"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100 text-[11px] text-gray-400 font-medium">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            Vence: <strong className={esVencido ? 'text-red-600' : 'text-gray-700'}>{rec.fecha_vencimiento}</strong>
                          </span>
                          <span className="capitalize bg-gray-100 px-2 py-0.2 rounded-md text-gray-600 font-semibold">
                            {rec.seccion.replace('_', ' ')}
                          </span>
                          {rec.recurrencia && rec.recurrencia !== 'ninguna' && (
                            <span className="text-orange-600 font-bold bg-orange-50 px-2 py-0.2 rounded-md">
                              ↻ Recurrencia {rec.recurrencia}
                            </span>
                          )}
                          {rec.completado && (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.2 rounded-md">
                              ✓ Completada
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ASISTENCIA Y JORNADA */}
          {activeTab === 'asistencia' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <Timer className="w-4 h-4 text-[#f97316]" />
                    <span>Control de Asistencia & Jornada</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Marcajes diarios de entrada/salida y registro de puntualidad
                  </p>
                </div>

                <button
                  onClick={() => setShowNewAsistenciaModal(true)}
                  className="px-3 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo marcaje</span>
                </button>
              </div>

              {/* Banner de Integración Externa */}
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Integración de reloj control biométrico en preparación</span>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Conectores compatibles: <strong>GeoVictoria API / ZKTeco Biométrico</strong>.
                </p>
                <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border border-blue-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>Estado: Integración externa pendiente de credenciales</span>
                </div>
              </div>

              {/* Métricas de Asistencia */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Puntualidad</span>
                  <span className="text-base font-black text-emerald-900">{statsAsistencia.puntualidad}%</span>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                  <span className="text-[10px] uppercase font-bold text-blue-700 block">Presente</span>
                  <span className="text-base font-black text-blue-900">{statsAsistencia.presentes}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Atrasos</span>
                  <span className="text-base font-black text-amber-900">{statsAsistencia.atrasos}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                  <span className="text-[10px] uppercase font-bold text-purple-700 block">Minutos Atraso</span>
                  <span className="text-base font-black text-purple-900">{statsAsistencia.minutosAtraso} min</span>
                </div>
              </div>

              {/* Tabla de Registros */}
              {asistencias.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  No hay marcajes de asistencia registrados para este colaborador.
                </div>
              ) : (
                <div className="space-y-2">
                  {asistencias.map((asist) => {
                    const badgeColor =
                      asist.estado === 'presente'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : asist.estado === 'atraso'
                        ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : asist.estado === 'en_terreno'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-red-100 text-red-800 border-red-200';

                    return (
                      <div
                        key={asist.id}
                        className="p-3.5 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#213343]">{asist.fecha}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${badgeColor}`}>
                              {asist.estado.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono capitalize">
                              ({asist.origen})
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 font-mono flex items-center gap-3">
                            <span>Entrada: <strong>{asist.hora_entrada ? asist.hora_entrada.slice(0, 5) : '--:--'}</strong></span>
                            <span>Salida: <strong>{asist.hora_salida ? asist.hora_salida.slice(0, 5) : '--:--'}</strong></span>
                            {(asist.minutos_atraso || 0) > 0 && (
                              <span className="text-amber-700 font-bold">
                                +{asist.minutos_atraso} min atraso
                              </span>
                            )}
                          </div>
                          {asist.observaciones && (
                            <p className="text-[11px] text-gray-600 italic">
                              &quot;{asist.observaciones}&quot;
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => handleDeleteAsistencia(asist.id)}
                          className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="Eliminar registro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: BITÁCORA Y NOTAS INTERNAS */}
          {activeTab === 'bitacora' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#f97316]" />
                    <span>Bitácora de Recursos Humanos</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Notas de seguimiento, felicitaciones, amonestaciones y desempeño
                  </p>
                </div>
              </div>

              {/* Formulario Agregar Nota */}
              <form onSubmit={handleSaveNota} className="space-y-3 bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-gray-600">Nueva entrada en bitácora:</label>
                  <select
                    value={newNotaTipo}
                    onChange={(e) => setNewNotaTipo(e.target.value as any)}
                    className="bg-white border border-gray-300 rounded-md px-2.5 py-1 font-bold text-xs cursor-pointer focus:outline-none"
                  >
                    <option value="nota">Nota general</option>
                    <option value="felicitacion">Felicitación</option>
                    <option value="amonestacion">Amonestación</option>
                    <option value="evaluacion">Evaluación desempeño</option>
                  </select>
                </div>

                <textarea
                  rows={3}
                  required
                  placeholder="Escribe aquí las observaciones o registro interno de RR.HH..."
                  value={newNotaText}
                  onChange={(e) => setNewNotaText(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md p-3 font-medium text-xs focus:outline-none focus:border-[#f97316]"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingNota || !newNotaText.trim()}
                    className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-bold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{savingNota ? 'Guardando...' : 'Publicar en bitácora'}</span>
                  </button>
                </div>
              </form>

              {/* Lista de Notas */}
              {notas.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-xs italic">
                  No hay registros en la bitácora para este colaborador.
                </div>
              ) : (
                <div className="space-y-3">
                  {notas.map((n) => (
                    <div
                      key={n.id}
                      className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[#213343]">
                            {n.usuario?.nombre || 'Administración'}
                          </span>
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full capitalize bg-white border border-gray-200 text-gray-600">
                            {n.tipo}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {n.created_at?.split('T')[0]}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium whitespace-pre-wrap">
                        {n.contenido}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* COLUMNA DERECHA: ASIGNACIONES OPERATIVAS & CALENDARIO (~26% / 3.5 cols) */}
        {/* ========================================================= */}
        <div className="lg:col-span-3 space-y-5">
          {/* Tarjeta Cuenta de Usuario CRM */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="font-extrabold text-sm text-[#213343] flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-[#f97316]" />
                <span>Cuenta CRM</span>
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  linkedUsuario
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {linkedUsuario ? 'Vinculado' : 'Sin cuenta'}
              </span>
            </div>

            {linkedUsuario ? (
              <div className="space-y-2.5">
                <div className="bg-gray-50 p-2.5 rounded-md border border-gray-200 space-y-1">
                  <span className="font-bold text-[#213343] block truncate">
                    {linkedUsuario.nombre}
                  </span>
                  <span className="text-[11px] text-gray-500 block truncate font-mono">
                    {linkedUsuario.email}
                  </span>
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] uppercase font-bold bg-orange-100 text-[#f97316] px-1.5 py-0.2 rounded">
                      {linkedUsuario.rol}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ID: {linkedUsuario.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedLinkUserId(linkedUsuario.id);
                      setShowLinkUserModal(true);
                    }}
                    className="flex-1 py-1.5 text-center text-xs font-bold text-gray-600 hover:text-[#f97316] bg-gray-100 hover:bg-orange-50 rounded-md transition cursor-pointer"
                  >
                    Cambiar usuario
                  </button>
                  <button
                    onClick={() => handleLinkUser(null)}
                    className="py-1.5 px-2.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-md transition cursor-pointer"
                    title="Desvincular usuario"
                  >
                    Desvincular
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Colaborador operativo sin acceso directo a sesión CRM. Puedes vincularlo a un usuario registrado para activar recordatorios y notificaciones.
                </p>
                <button
                  onClick={() => {
                    setSelectedLinkUserId('');
                    setShowLinkUserModal(true);
                  }}
                  className="w-full py-2 bg-gray-100 hover:bg-[#f97316] hover:text-white text-gray-700 font-bold rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Vincular cuenta CRM</span>
                </button>
              </div>
            )}
          </div>

          {/* Asignaciones en Faenas & Producción */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-[#213343] flex items-center gap-1.5">
                  <HardHat className="w-4 h-4 text-[#f97316]" />
                  <span>Obras & Faenas</span>
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">Asignaciones en planta y terreno</p>
              </div>
              <span className="font-black text-[#f97316] bg-orange-50 px-2 py-0.5 rounded-full">
                {eventosAsociados.length}
              </span>
            </div>

            {eventosAsociados.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2">
                Sin eventos de obra asignados actualmente.
              </div>
            ) : (
              <div className="space-y-2">
                {eventosAsociados.slice(0, 4).map((ev) => (
                  <div key={ev.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                    <span className="font-bold text-[#213343] block truncate">
                      {ev.titulo}
                    </span>
                    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                      <span>{ev.fecha_inicio?.split('T')[0]}</span>
                      <span className="capitalize text-gray-600 font-semibold">{ev.tipo_evento}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visitas a Terreno */}
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-[#213343] flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  <span>Visitas a Terreno</span>
                </h3>
                <p className="text-[11px] text-gray-400 font-medium">Visitas técnicas asignadas</p>
              </div>
              <span className="font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                {visitasAsociadas.length}
              </span>
            </div>

            {visitasAsociadas.length === 0 ? (
              <div className="text-xs text-gray-400 italic py-2">
                Sin visitas técnicas registradas.
              </div>
            ) : (
              <div className="space-y-2">
                {visitasAsociadas.slice(0, 4).map((vis) => (
                  <div key={vis.id} className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 space-y-1">
                    <span className="font-bold text-[#213343] block truncate">
                      {vis.oportunidad?.titulo || 'Visita a terreno'}
                    </span>
                    <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
                      <span>{vis.fecha_visita_terreno}</span>
                      <span className="capitalize text-blue-700 font-bold">{vis.estado_visita || 'programada'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: EDITAR PERFIL Y DATOS DEL TRABAJADOR              */}
      {/* ========================================================= */}
      {showEditInfoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-black text-[#213343]">Editar Colaborador</h2>
              <button
                onClick={() => setShowEditInfoModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Nombre completo *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.nombre}
                    onChange={(e) => setEditFormData({ ...editFormData, nombre: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">RUT *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.rut}
                    onChange={(e) => setEditFormData({ ...editFormData, rut: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Cargo *</label>
                  <select
                    value={editFormData.cargo}
                    onChange={(e) => setEditFormData({ ...editFormData, cargo: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    {CARGOS_RRHH_DEFAULT.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Área</label>
                  <select
                    value={editFormData.area}
                    onChange={(e) => setEditFormData({ ...editFormData, area: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    {AREAS_RRHH_DEFAULT.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={editFormData.telefono}
                    onChange={(e) => setEditFormData({ ...editFormData, telefono: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Correo</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Sueldo base (CLP)</label>
                  <input
                    type="number"
                    value={editFormData.sueldo_base}
                    onChange={(e) => setEditFormData({ ...editFormData, sueldo_base: Number(e.target.value) })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Tipo de contrato</label>
                  <select
                    value={editFormData.tipo_contrato}
                    onChange={(e) => setEditFormData({ ...editFormData, tipo_contrato: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="Indefinido">Indefinido</option>
                    <option value="Plazo fijo">Plazo fijo</option>
                    <option value="Honorarios">Honorarios</option>
                    <option value="Por faena / obra">Por faena / obra</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Banco</label>
                  <input
                    type="text"
                    value={editFormData.banco}
                    onChange={(e) => setEditFormData({ ...editFormData, banco: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">N° de cuenta</label>
                  <input
                    type="text"
                    value={editFormData.numero_cuenta}
                    onChange={(e) => setEditFormData({ ...editFormData, numero_cuenta: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditInfoModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black"
                >
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: SUBIR DOCUMENTO / CONTRATO / ANEXO              */}
      {/* ========================================================= */}
      {showNewDocModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Subir Documento</h2>
              <button
                onClick={() => setShowNewDocModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDocument} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 block mb-1">Categoría / Carpeta *</label>
                <select
                  value={newDocData.categoria}
                  onChange={(e) => setNewDocData({ ...newDocData, categoria: e.target.value as any })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                >
                  {CATEGORIAS_DOCUMENTOS.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Nombre del documento *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Contrato de Trabajo Indefinido 2026.pdf"
                  value={newDocData.nombre_archivo}
                  onChange={(e) => setNewDocData({ ...newDocData, nombre_archivo: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Enlace / URL de descarga</label>
                <input
                  type="text"
                  placeholder="https://... o enlace al documento"
                  value={newDocData.url}
                  onChange={(e) => setNewDocData({ ...newDocData, url: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Fecha de emisión</label>
                <input
                  type="date"
                  value={newDocData.fecha_emision}
                  onChange={(e) => setNewDocData({ ...newDocData, fecha_emision: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewDocModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDoc || !newDocData.nombre_archivo.trim()}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black"
                >
                  {savingDoc ? 'Guardando...' : 'Guardar documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: REGISTRAR PERMISO / LICENCIA                    */}
      {/* ========================================================= */}
      {showNewPermisoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Registrar Permiso o Ausencia</h2>
              <button
                onClick={() => setShowNewPermisoModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePermiso} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 block mb-1">Tipo de ausencia *</label>
                <select
                  value={newPermisoData.tipo}
                  onChange={(e) => setNewPermisoData({ ...newPermisoData, tipo: e.target.value as any })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                >
                  <option value="permiso">Permiso personal / día administrativo</option>
                  <option value="vacaciones">Vacaciones legales</option>
                  <option value="licencia_medica">Licencia médica</option>
                  <option value="falta_injustificada">Falta injustificada</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Fecha inicio *</label>
                  <input
                    type="date"
                    required
                    value={newPermisoData.fecha_inicio}
                    onChange={(e) => setNewPermisoData({ ...newPermisoData, fecha_inicio: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Fecha fin *</label>
                  <input
                    type="date"
                    required
                    value={newPermisoData.fecha_fin}
                    onChange={(e) => setNewPermisoData({ ...newPermisoData, fecha_fin: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Motivo / Detalle</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Cita médica familiar / Trámite personal..."
                  value={newPermisoData.motivo}
                  onChange={(e) => setNewPermisoData({ ...newPermisoData, motivo: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md p-2.5 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkBloquea"
                  checked={newPermisoData.bloquea_calendario}
                  onChange={(e) => setNewPermisoData({ ...newPermisoData, bloquea_calendario: e.target.checked })}
                  className="rounded text-[#f97316] focus:ring-0"
                />
                <label htmlFor="chkBloquea" className="font-bold text-gray-700 cursor-pointer text-[11px]">
                  Bloquear disponibilidad en calendarios durante este período
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewPermisoModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPermiso}
                  className="px-5 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-black"
                >
                  {savingPermiso ? 'Guardando...' : 'Registrar permiso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: REGISTRAR LIQUIDACIÓN DE SUELDO                 */}
      {/* ========================================================= */}
      {showNewLiquidacionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Registrar Liquidación de Sueldo</h2>
              <button
                onClick={() => setShowNewLiquidacionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLiquidacion} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Mes *</label>
                  <select
                    value={newLiquidacionData.mes}
                    onChange={(e) => setNewLiquidacionData({ ...newLiquidacionData, mes: Number(e.target.value) })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>Mes {m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Año *</label>
                  <input
                    type="number"
                    value={newLiquidacionData.anio}
                    onChange={(e) => setNewLiquidacionData({ ...newLiquidacionData, anio: Number(e.target.value) })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Sueldo base (CLP)</label>
                <input
                  type="number"
                  value={newLiquidacionData.monto_sueldo_base}
                  onChange={(e) => {
                    const base = Number(e.target.value);
                    const liq = base + newLiquidacionData.bonos - newLiquidacionData.descuentos;
                    setNewLiquidacionData({ ...newLiquidacionData, monto_sueldo_base: base, monto_liquido: liq });
                  }}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Bonos (CLP)</label>
                  <input
                    type="number"
                    value={newLiquidacionData.bonos}
                    onChange={(e) => {
                      const bonos = Number(e.target.value);
                      const liq = newLiquidacionData.monto_sueldo_base + bonos - newLiquidacionData.descuentos;
                      setNewLiquidacionData({ ...newLiquidacionData, bonos, monto_liquido: liq });
                    }}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Descuentos (CLP)</label>
                  <input
                    type="number"
                    value={newLiquidacionData.descuentos}
                    onChange={(e) => {
                      const desc = Number(e.target.value);
                      const liq = newLiquidacionData.monto_sueldo_base + newLiquidacionData.bonos - desc;
                      setNewLiquidacionData({ ...newLiquidacionData, descuentos: desc, monto_liquido: liq });
                    }}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Total Líquido a Pagar (CLP) *</label>
                <input
                  type="number"
                  required
                  value={newLiquidacionData.monto_liquido}
                  onChange={(e) => setNewLiquidacionData({ ...newLiquidacionData, monto_liquido: Number(e.target.value) })}
                  className="w-full bg-emerald-50 border border-emerald-300 rounded-md px-3 py-2 font-mono font-black text-emerald-900 text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Estado de Pago</label>
                <select
                  value={newLiquidacionData.estado_pago}
                  onChange={(e) => setNewLiquidacionData({ ...newLiquidacionData, estado_pago: e.target.value as any })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                >
                  <option value="pagado">Pagado</option>
                  <option value="pendiente">Pendiente de pago</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewLiquidacionModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLiquidacion}
                  className="px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                >
                  {savingLiquidacion ? 'Guardando...' : 'Registrar sueldo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: REGISTRAR NUEVA TAREA / RECORDATORIO             */}
      {/* ========================================================= */}
      {showNewRecordatorioModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Nueva Tarea / Recordatorio</h2>
              <button
                onClick={() => setShowNewRecordatorioModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecordatorio} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-500 block mb-1">Título de la tarea *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Renovar examen ocupacional de altura"
                  value={newRecordatorioData.titulo}
                  onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, titulo: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Descripción / Detalle</label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales, requisitos o instrucciones..."
                  value={newRecordatorioData.descripcion}
                  onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, descripcion: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md p-2.5 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Urgencia</label>
                  <select
                    value={newRecordatorioData.urgencia}
                    onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, urgencia: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="critica">Crítica</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Sección</label>
                  <select
                    value={newRecordatorioData.seccion}
                    onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, seccion: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="sueldos_administrativos">Sueldos y RRHH</option>
                    <option value="prevencion_riesgos">Prevención de riesgos</option>
                    <option value="documentos">Documentación</option>
                    <option value="obras_faenas">Obras y faenas</option>
                    <option value="pendientes_generales">Pendientes generales</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Fecha vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={newRecordatorioData.fecha_vencimiento}
                    onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, fecha_vencimiento: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Recurrencia</label>
                  <select
                    value={newRecordatorioData.recurrencia}
                    onChange={(e) => setNewRecordatorioData({ ...newRecordatorioData, recurrencia: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="ninguna">Sin recurrencia</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewRecordatorioModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingRecordatorio || !newRecordatorioData.titulo.trim()}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black cursor-pointer"
                >
                  {savingRecordatorio ? 'Guardando...' : 'Asignar tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 6: REGISTRAR ASISTENCIA MANUAL                      */}
      {/* ========================================================= */}
      {showNewAsistenciaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Registrar Marcaje de Asistencia</h2>
              <button
                onClick={() => setShowNewAsistenciaModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsistencia} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={newAsistenciaData.fecha}
                    onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, fecha: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Estado *</label>
                  <select
                    value={newAsistenciaData.estado}
                    onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, estado: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="presente">Presente a tiempo</option>
                    <option value="atraso">Atraso</option>
                    <option value="salida_temprana">Salida temprana</option>
                    <option value="en_terreno">En terreno / faena</option>
                    <option value="ausente_justificado">Ausente justificado</option>
                    <option value="ausente_injustificado">Ausente injustificado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Hora entrada</label>
                  <input
                    type="time"
                    value={newAsistenciaData.hora_entrada}
                    onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, hora_entrada: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-500 block mb-1">Hora salida</label>
                  <input
                    type="time"
                    value={newAsistenciaData.hora_salida}
                    onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, hora_salida: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Minutos de atraso (opcional)</label>
                <input
                  type="number"
                  min="0"
                  value={newAsistenciaData.minutos_atraso}
                  onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, minutos_atraso: Number(e.target.value) })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Ej: Registro manual autorizado por jefatura de planta..."
                  value={newAsistenciaData.observaciones}
                  onChange={(e) => setNewAsistenciaData({ ...newAsistenciaData, observaciones: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md p-2.5 font-medium"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewAsistenciaModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAsistencia}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black cursor-pointer"
                >
                  {savingAsistencia ? 'Guardando...' : 'Guardar marcaje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 7: VINCULAR CUENTA DE USUARIO CRM                   */}
      {/* ========================================================= */}
      {showLinkUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-lg font-black text-[#213343]">Vincular Cuenta CRM</h2>
              <button
                onClick={() => setShowLinkUserModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-gray-600 leading-relaxed">
                Selecciona la cuenta de usuario del sistema para vincular a <strong>{trabajador.nombre}</strong>. Al vincularlo, sus recordatorios, tareas y eventos de calendario se sincronizarán directamente con su cuenta.
              </p>

              <div>
                <label className="font-bold text-gray-500 block mb-1">Usuario del sistema:</label>
                <select
                  value={selectedLinkUserId}
                  onChange={(e) => setSelectedLinkUserId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer"
                >
                  <option value="">-- Sin vincular (Colaborador de campo) --</option>
                  {usuariosList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} ({u.email}) - {u.rol}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLinkUserModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleLinkUser(selectedLinkUserId || null)}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black cursor-pointer"
                >
                  Guardar vinculación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
