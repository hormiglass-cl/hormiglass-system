'use client';

import { ROL_NOMBRE } from '../../lib/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  AtSign,
  Building2,
  Calendar,
  Clock,
  Download,
  FileText,
  Flag,
  FolderOpen,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import type {
  AdministracionDocumento,
  CategoriaDocumentoAdministracion,
  EmpresaHormiglass,
  EstadoRecordatorio,
  Recordatorio,
  RecordatorioActividad,
  SeccionAdministracionEmpresa,
  TipoRecordatorioActividad,
  UrgenciaRecordatorio,
} from '../../lib/types';
import { mensajeError } from '../../lib/errores';

const DOCUMENTOS_SECCION: SeccionAdministracionEmpresa = 'documentos';
const LEGAL_SECCION: SeccionAdministracionEmpresa = 'legal';
const PREVENCION_RIESGOS_SECCION: SeccionAdministracionEmpresa = 'prevencion_riesgos';
const DEFAULT_SECCION_ADMINISTRACION: SeccionAdministracionEmpresa = 'pendientes_generales';

const EMPRESAS: { id: EmpresaHormiglass; label: string; rut: string; subtitle: string }[] = [
  { id: 'comercial', label: 'Soc Comercial', rut: '76.391.215-9', subtitle: 'Documentos comerciales y generales' },
  { id: 'transportes', label: 'Soc Transportes', rut: '77.148.997-4', subtitle: 'Flota, operación y respaldo legal' },
  { id: 'inmobiliaria', label: 'Soc Inmobiliaria', rut: '77.615.313-3', subtitle: 'Obras, carpetas legales y trabajadores' },
];

const SECCIONES_EMPRESA: { id: SeccionAdministracionEmpresa; label: string; description: string }[] = [
  { id: 'cuentas_por_cobrar', label: 'Cuentas por cobrar', description: 'Cobros pendientes, facturación y seguimiento de pagos.' },
  { id: 'sueldos_administrativos', label: 'Sueldos administrativos', description: 'Gestión de sueldos, pagos internos y respaldos.' },
  { id: 'pendientes_generales', label: 'Pendientes generales', description: 'Tareas transversales sin categoría administrativa específica.' },
  { id: 'contabilidad_impuestos', label: 'Contabilidad e impuestos', description: 'Declaraciones, impuestos, cierres y coordinación contable.' },
  { id: 'finiquitos', label: 'Finiquitos', description: 'Cierres laborales, documentos y seguimiento de finiquitos.' },
  { id: LEGAL_SECCION, label: 'Legal', description: 'Carpeta legal y documentos societarios.' },
  { id: PREVENCION_RIESGOS_SECCION, label: 'Prevención de Riesgos', description: 'Prevención, seguridad, cumplimiento y respaldos operativos.' },
  { id: DOCUMENTOS_SECCION, label: 'Documentos', description: 'Todos los documentos adjuntos de la empresa.' },
  { id: 'obras_faenas', label: 'Obras y Faenas', description: 'Pendientes administrativos asociados a obras y faenas.' },
];

const SECCIONES_ADMINISTRACION: Record<
  EmpresaHormiglass,
  { id: SeccionAdministracionEmpresa; label: string; description: string }[]
> = {
  comercial: SECCIONES_EMPRESA,
  transportes: SECCIONES_EMPRESA,
  inmobiliaria: SECCIONES_EMPRESA,
};

const ESTADOS_RECORDATORIO: {
  id: EstadoRecordatorio;
  label: string;
  className: string;
}[] = [
  { id: 'por_hacer', label: 'Por hacer', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'en_curso', label: 'En curso', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'requiere_actualizacion', label: 'Requiere actualización', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'completada', label: 'Completadas', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

const URGENCIAS_RECORDATORIO: {
  id: UrgenciaRecordatorio;
  label: string;
  className: string;
}[] = [
  { id: 'baja', label: 'Baja', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  { id: 'media', label: 'Media', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'alta', label: 'Alta', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'critica', label: 'Crítica', className: 'bg-red-50 text-red-700 border-red-200' },
];

function formatBytes(bytes?: number | null) {
  if (!bytes) return 'Sin tamaño';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderMessageContentWithMentions(content?: string) {
  if (!content) return null;
  const parts = content.split(/(@[a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={idx}
          className="text-[#f97316] font-extrabold bg-orange-50 px-1.5 py-0.5 rounded-md border border-orange-200 inline-block mx-0.5"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isUUID(id?: string | null) {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getEmpresaFromParam(value?: string | null): EmpresaHormiglass {
  return value === 'comercial' || value === 'transportes' || value === 'inmobiliaria' ? value : 'inmobiliaria';
}

function isSeccionForEmpresa(empresa: EmpresaHormiglass, seccion?: string | null): seccion is SeccionAdministracionEmpresa {
  return SECCIONES_ADMINISTRACION[empresa].some((item) => item.id === seccion);
}

function getSeccionForEmpresa(empresa: EmpresaHormiglass, seccion?: string | null): SeccionAdministracionEmpresa {
  if (isSeccionForEmpresa(empresa, seccion)) return seccion;
  return SECCIONES_ADMINISTRACION[empresa][0]?.id || DEFAULT_SECCION_ADMINISTRACION;
}

function getSeccionLabel(empresa: EmpresaHormiglass, seccion?: string | null) {
  return SECCIONES_ADMINISTRACION[empresa].find((item) => item.id === seccion)?.label || 'Pendientes generales';
}

function getAdminHref(
  empresa: EmpresaHormiglass,
  seccion: SeccionAdministracionEmpresa
) {
  return `/administracion?empresa=${empresa}&seccion=${seccion}`;
}

function getCategoriaForSeccion(seccion: SeccionAdministracionEmpresa): CategoriaDocumentoAdministracion {
  if (seccion === LEGAL_SECCION) return 'legal';
  if (seccion === PREVENCION_RIESGOS_SECCION) return 'prevencion_riesgo';
  return 'general';
}

function getCategoriaLabel(categoria?: CategoriaDocumentoAdministracion | null) {
  if (categoria === 'legal') return 'Legal';
  if (categoria === 'prevencion_riesgo') return 'Prevención de Riesgos';
  return 'General';
}

function getDocumentoSeccion(doc: AdministracionDocumento): SeccionAdministracionEmpresa {
  const legacySeccion = doc.seccion as string;
  if (legacySeccion === 'administracion_documentos') {
    if (doc.categoria === 'legal') return LEGAL_SECCION;
    if (doc.categoria === 'prevencion_riesgo') return PREVENCION_RIESGOS_SECCION;
    return DOCUMENTOS_SECCION;
  }

  return isSeccionForEmpresa(doc.empresa, legacySeccion) ? doc.seccion : DOCUMENTOS_SECCION;
}

function defaultTaskForm(
  userId = '',
  seccion: SeccionAdministracionEmpresa = DEFAULT_SECCION_ADMINISTRACION
) {
  return {
    titulo: '',
    descripcion: '',
    seccion,
    asignado_a_id: userId,
    fecha_vencimiento: todayISO(),
    estado: 'por_hacer' as EstadoRecordatorio,
    urgencia: 'media' as UrgenciaRecordatorio,
  };
}

export default function AdministracionPage() {
  const { currentUser, usersList, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [documentos, setDocumentos] = useState<AdministracionDocumento[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEmpresa, setActiveEmpresa] = useState<EmpresaHormiglass>('inmobiliaria');
  const [activeSeccion, setActiveSeccion] = useState<SeccionAdministracionEmpresa>(DEFAULT_SECCION_ADMINISTRACION);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Recordatorio | null>(null);
  const [taskActivities, setTaskActivities] = useState<RecordatorioActividad[]>([]);
  const [activityMessage, setActivityMessage] = useState('');
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [sendingActivity, setSendingActivity] = useState(false);
  const [uploadingTaskAttachment, setUploadingTaskAttachment] = useState(false);
  const [taskMentionMenuOpen, setTaskMentionMenuOpen] = useState(false);
  const [selectedTaskMentionIndex, setSelectedTaskMentionIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [taskErrorMsg, setTaskErrorMsg] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
  });
  const [taskForm, setTaskForm] = useState(defaultTaskForm());

  const loadDocumentos = useCallback(async () => {
    if (currentUser?.rol !== 'admin') {
      setDocumentos([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('administracion_documentos')
        .select('*')
        .eq('eliminado', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocumentos((data || []) as AdministracionDocumento[]);
    } catch (err) {
      console.error('Error cargando documentos administrativos:', err);
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, supabase]);

  const loadRecordatorios = useCallback(async () => {
    if (!currentUser?.id) {
      setRecordatorios([]);
      return;
    }

    try {
      let query = supabase
        .from('recordatorios')
        .select('*')
        .eq('activo', true)
        .order('fecha_vencimiento', { ascending: true });

      if (currentUser.rol !== 'admin') {
        query = query.eq('asignado_a_id', currentUser.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecordatorios((data || []) as Recordatorio[]);
    } catch (err) {
      console.error('Error cargando recordatorios administrativos:', err);
      setRecordatorios([]);
    }
  }, [currentUser, supabase]);

  useEffect(() => {
    if (authLoading) return;
    const parsedEmpresa = getEmpresaFromParam(searchParams.get('empresa'));
    const legacyTab = searchParams.get('tab');
    const legacyDocTab = legacyTab === 'legal' || legacyTab === 'prevencion_riesgo' || legacyTab === 'general';
    const legacyCategoria = searchParams.get('categoria') || legacyTab;
    const legacyCategoriaSeccion =
      legacyCategoria === 'legal'
        ? LEGAL_SECCION
        : legacyCategoria === 'prevencion_riesgo'
          ? PREVENCION_RIESGOS_SECCION
          : DOCUMENTOS_SECCION;
    const parsedSeccion = getSeccionForEmpresa(
      parsedEmpresa,
      legacyDocTab ? legacyCategoriaSeccion : searchParams.get('seccion')
    );
    const canonicalHref = getAdminHref(parsedEmpresa, parsedSeccion);
    const currentHref = `/administracion?${searchParams.toString()}`;

    const loadTimeout = window.setTimeout(() => {
      setActiveEmpresa(parsedEmpresa);
      setActiveSeccion(parsedSeccion);
      loadDocumentos();
      loadRecordatorios();
    }, 0);

    if (currentHref !== canonicalHref) {
      router.replace(canonicalHref, { scroll: false });
    }

    const channel = supabase
      .channel('administracion_documentos_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'administracion_documentos' }, () => loadDocumentos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => loadRecordatorios())
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeout);
      supabase.removeChannel(channel);
    };
  }, [authLoading, loadDocumentos, loadRecordatorios, router, searchParams, supabase]);

  const empresaDocs = useMemo(
    () => documentos.filter((doc) => doc.empresa === activeEmpresa),
    [documentos, activeEmpresa]
  );

  const activeEmpresaConfig = EMPRESAS.find((empresa) => empresa.id === activeEmpresa) || EMPRESAS[0];
  const activeSecciones = SECCIONES_ADMINISTRACION[activeEmpresa];
  const activeSeccionConfig = activeSecciones.find((seccion) => seccion.id === activeSeccion) || activeSecciones[0];
  const activeUsers = useMemo(() => usersList.filter((user) => user.activo), [usersList]);
  const filteredMentionUsers = useMemo(() => {
    const lastAtIndex = activityMessage.lastIndexOf('@');
    if (lastAtIndex === -1) return activeUsers.slice(0, 6);

    const query = activityMessage.slice(lastAtIndex + 1).toLowerCase();
    if (query.includes('\n')) return [];

    const completedMention = activeUsers.some((user) =>
      query.startsWith(`${user.nombre.toLowerCase()} `)
    );
    if (completedMention) return [];

    return activeUsers
      .filter((user) =>
        user.nombre.toLowerCase().includes(query) ||
        user.rol.toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [activityMessage, activeUsers]);

  const filteredDocs = useMemo(() => {
    if (activeSeccion === DOCUMENTOS_SECCION) return empresaDocs;
    return empresaDocs.filter((doc) => getDocumentoSeccion(doc) === activeSeccion);
  }, [empresaDocs, activeSeccion]);
  const currentEmpresaRecordatorios = useMemo(
    () => recordatorios.filter((recordatorio) => recordatorio.empresa === activeEmpresa),
    [recordatorios, activeEmpresa]
  );
  const currentSectionRecordatorios = useMemo(
    () => currentEmpresaRecordatorios.filter((recordatorio) => (recordatorio.seccion || DEFAULT_SECCION_ADMINISTRACION) === activeSeccion),
    [currentEmpresaRecordatorios, activeSeccion]
  );
  const empresaRecordatoriosPendientes = currentEmpresaRecordatorios.filter((recordatorio) => !recordatorio.completado && recordatorio.estado !== 'completada').length;
  const recordatoriosPendientes = currentSectionRecordatorios.filter((recordatorio) => !recordatorio.completado && recordatorio.estado !== 'completada').length;
  const recordatoriosVencidos = currentSectionRecordatorios.filter(
    (recordatorio) => !recordatorio.completado && recordatorio.estado !== 'completada' && recordatorio.fecha_vencimiento < todayISO()
  ).length;
  const taskStatsByStatus = ESTADOS_RECORDATORIO.map((estado) => ({
    ...estado,
    count: currentSectionRecordatorios.filter((recordatorio) => {
      const recordatorioEstado = recordatorio.estado || (recordatorio.completado ? 'completada' : 'por_hacer');
      return recordatorioEstado === estado.id;
    }).length,
  }));

  const getUserName = (id?: string | null) => {
    if (!id) return 'Sin responsable';
    return usersList.find((user) => user.id === id)?.nombre || 'Sin responsable';
  };

  const getEstadoConfig = (estado?: EstadoRecordatorio | null, completado = false) => {
    const resolved = estado || (completado ? 'completada' : 'por_hacer');
    return ESTADOS_RECORDATORIO.find((item) => item.id === resolved) || ESTADOS_RECORDATORIO[0];
  };

  const getUrgenciaConfig = (urgencia?: UrgenciaRecordatorio | null) => {
    return URGENCIAS_RECORDATORIO.find((item) => item.id === (urgencia || 'media')) || URGENCIAS_RECORDATORIO[1];
  };

  const canDeleteTask = (recordatorio: Recordatorio) => {
    return !!currentUser?.id && (currentUser.rol === 'admin' || recordatorio.creado_por_id === currentUser.id);
  };

  const loadTaskActivities = async (recordatorioId: string) => {
    setLoadingActivities(true);
    try {
      const { data, error } = await supabase
        .from('recordatorio_actividades')
        .select('*')
        .eq('recordatorio_id', recordatorioId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTaskActivities((data || []) as RecordatorioActividad[]);
    } catch (err) {
      console.error('Error cargando actividad de task:', err);
      setTaskActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  };

  const insertTaskActivity = async (
    recordatorioId: string,
    contenido: string,
    tipo: TipoRecordatorioActividad = 'actualizacion',
    archivo?: Pick<
      RecordatorioActividad,
      'archivo_bucket' | 'archivo_path' | 'archivo_nombre' | 'archivo_mime_type' | 'archivo_size_bytes'
    >
  ) => {
    const { data, error } = await supabase
      .from('recordatorio_actividades')
      .insert({
        recordatorio_id: recordatorioId,
        tipo,
        contenido,
        usuario_id: isUUID(currentUser?.id) ? currentUser?.id : null,
        usuario_nombre: currentUser?.nombre || 'Sistema',
        ...archivo,
      })
      .select()
      .single();

    if (error || !data) throw error || new Error('No se pudo registrar la actividad.');

    if (selectedTask?.id === recordatorioId) {
      setTaskActivities((prev) => [...prev, data as RecordatorioActividad]);
    }

    return data as RecordatorioActividad;
  };

  const handleUploadTaskAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !selectedTask) return;
    const canUpdate = currentUser?.rol === 'admin' || selectedTask.asignado_a_id === currentUser?.id;
    if (!canUpdate) return;

    setUploadingTaskAttachment(true);
    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `recordatorios/${selectedTask.id}/${Date.now()}_${cleanFileName}`;
      const { data, error } = await supabase.storage
        .from('administracion')
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (error || !data) {
        throw new Error(mensajeError(error, 'No se pudo subir el archivo.'));
      }

      await insertTaskActivity(
        selectedTask.id,
        `Documento adjuntado: "${file.name}".`,
        'archivo',
        {
          archivo_bucket: 'administracion',
          archivo_path: storagePath,
          archivo_nombre: file.name,
          archivo_mime_type: file.type || null,
          archivo_size_bytes: file.size,
        }
      );
    } catch (err) {
      console.error('Error adjuntando documento a task:', err);
      alert(mensajeError(err, 'No se pudo adjuntar el documento.'));
    } finally {
      setUploadingTaskAttachment(false);
    }
  };

  const handleOpenTaskAttachment = async (activity: RecordatorioActividad) => {
    if (!activity.archivo_path) return;

    try {
      const { data, error } = await supabase.storage
        .from(activity.archivo_bucket || 'administracion')
        .createSignedUrl(activity.archivo_path, 300);

      if (error || !data?.signedUrl) {
        throw new Error(mensajeError(error, 'No se pudo generar el enlace privado.'));
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Error abriendo adjunto de task:', err);
      alert(mensajeError(err, 'No se pudo abrir el documento.'));
    }
  };

  const openTaskDetail = (recordatorio: Recordatorio) => {
    setSelectedTask(recordatorio);
    setActivityMessage('');
    setTaskMentionMenuOpen(false);
    loadTaskActivities(recordatorio.id);
  };

  const handleActivityMessageChange = (value: string) => {
    setActivityMessage(value);

    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex === -1) {
      setTaskMentionMenuOpen(false);
      return;
    }

    const query = value.slice(lastAtIndex + 1);
    const completedMention = activeUsers.some((user) =>
      query.toLowerCase().startsWith(`${user.nombre.toLowerCase()} `)
    );

    setTaskMentionMenuOpen(!query.includes('\n') && !completedMention);
    setSelectedTaskMentionIndex(0);
  };

  const handleInsertTaskMention = (userName: string) => {
    const lastAtIndex = activityMessage.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const prefix = activityMessage.slice(0, lastAtIndex);
      setActivityMessage(`${prefix}@${userName} `);
    } else {
      setActivityMessage((prev) => `${prev}@${userName} `);
    }
    setTaskMentionMenuOpen(false);
  };

  const notifyTaskMentions = async (recordatorio: Recordatorio, content: string) => {
    const mentionsFound = activeUsers.filter((user) =>
      content.toLowerCase().includes(`@${user.nombre.toLowerCase()}`)
    );

    const uniqueMentions = mentionsFound.filter(
      (user, index, list) => list.findIndex((item) => item.id === user.id) === index
    );

    for (const user of uniqueMentions) {
      if (!isUUID(user.id) || user.id === currentUser?.id) continue;

      try {
        await supabase.from('notificaciones').insert({
          usuario_id: user.id,
          tipo: 'mencion',
          mensaje: `@${currentUser?.nombre || 'Usuario'} te mencionó en la task "${recordatorio.titulo}": "${content}"`,
          link_url: getAdminHref(recordatorio.empresa, recordatorio.seccion || DEFAULT_SECCION_ADMINISTRACION),
          leido: false,
          fecha: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Error creando notificación de mención en task:', err);
      }
    }
  };

  const handleAddTaskActivity = async () => {
    if (!selectedTask || !activityMessage.trim()) return;

    setSendingActivity(true);
    try {
      const message = activityMessage.trim();
      await insertTaskActivity(selectedTask.id, message, 'comentario');
      await notifyTaskMentions(selectedTask, message);
      setActivityMessage('');
      setTaskMentionMenuOpen(false);
    } catch (err) {
      console.error('Error agregando comentario de task:', err);
      alert(mensajeError(err, 'No se pudo guardar el comentario.'));
    } finally {
      setSendingActivity(false);
    }
  };

  const handleTaskActivityKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (taskMentionMenuOpen && filteredMentionUsers.length > 0) {
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        const targetUser = filteredMentionUsers[selectedTaskMentionIndex] || filteredMentionUsers[0];
        if (targetUser) handleInsertTaskMention(targetUser.nombre);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedTaskMentionIndex((prev) => (prev + 1) % filteredMentionUsers.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedTaskMentionIndex((prev) => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
        return;
      }

      if (event.key === 'Escape') {
        setTaskMentionMenuOpen(false);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !taskMentionMenuOpen) {
      event.preventDefault();
      handleAddTaskActivity();
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setFormData({ nombre: '', descripcion: '' });
    setErrorMsg('');
  };

  const handleUploadDocumento = async () => {
    if (!selectedFile) {
      setErrorMsg('Debes seleccionar un archivo para subir.');
      return;
    }

    setUploading(true);
    setErrorMsg('');

    try {
      const documentCategory = getCategoriaForSeccion(activeSeccion);
      const cleanFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `administracion/${activeEmpresa}/${activeSeccion}/${documentCategory}/${Date.now()}_${cleanFileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('administracion')
        .upload(storagePath, selectedFile, {
          contentType: selectedFile.type || undefined,
          upsert: false,
        });

      if (uploadError || !uploadData) {
        throw new Error(mensajeError(uploadError, 'No se pudo subir el archivo.'));
      }

      const { data: inserted, error: insertError } = await supabase
        .from('administracion_documentos')
        .insert({
          empresa: activeEmpresa,
          seccion: activeSeccion,
          categoria: documentCategory,
          nombre: formData.nombre.trim() || selectedFile.name,
          descripcion: formData.descripcion.trim() || null,
          bucket_id: 'administracion',
          storage_path: storagePath,
          mime_type: selectedFile.type || null,
          size_bytes: selectedFile.size,
          subido_por_id: isUUID(currentUser?.id) ? currentUser?.id : null,
          subido_por_nombre: currentUser?.nombre || 'Administración',
        })
        .select()
        .single();

      if (insertError || !inserted) {
        await supabase.storage.from('administracion').remove([storagePath]);
        throw new Error(mensajeError(insertError, 'No se pudo registrar la metadata del documento.'));
      }

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'administracion_documentos',
        entidad_id: inserted.id,
        descripcion: `Documento administrativo subido: "${inserted.nombre}" (${activeEmpresa}/${activeSeccion}/${documentCategory}).`,
        usuario_id: currentUser?.id || null,
        datos_nuevos: inserted,
      });

      setDocumentos((prev) => [inserted as AdministracionDocumento, ...prev]);
      resetUploadForm();
      setShowUploadModal(false);
    } catch (err) {
      console.error('Error subiendo documento administrativo:', err);
      setErrorMsg(mensajeError(err, 'Error al subir el documento.'));
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDocumento = async (doc: AdministracionDocumento) => {
    try {
      const { data, error } = await supabase.storage
        .from('administracion')
        .createSignedUrl(doc.storage_path, 300);

      if (error || !data?.signedUrl) {
        throw new Error(mensajeError(error, 'No se pudo generar el enlace privado.'));
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Error generando signed URL:', err);
      alert(mensajeError(err, 'No se pudo abrir el documento.'));
    }
  };

  const handleDeleteDocumento = async (doc: AdministracionDocumento) => {
    if (!confirm(`¿Eliminar "${doc.nombre}" de Administración?`)) return;

    const now = new Date().toISOString();
    const previousDocs = documentos;
    setDocumentos((prev) => prev.filter((item) => item.id !== doc.id));

    try {
      const { error } = await supabase
        .from('administracion_documentos')
        .update({
          eliminado: true,
          eliminado_en: now,
          eliminado_por: isUUID(currentUser?.id) ? currentUser?.id : null,
        })
        .eq('id', doc.id);

      if (error) throw error;

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'administracion_documentos',
        entidad_id: doc.id,
        descripcion: `Documento administrativo eliminado: "${doc.nombre}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: doc,
      });
    } catch (err) {
      console.error('Error eliminando documento administrativo:', err);
      setDocumentos(previousDocs);
      alert(mensajeError(err, 'No se pudo eliminar el documento.'));
    }
  };

  const openTaskModal = () => {
    setTaskForm(defaultTaskForm(activeUsers[0]?.id || currentUser?.id || '', activeSeccion));
    setTaskErrorMsg('');
    setShowTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (currentUser?.rol !== 'admin') return;
    if (!taskForm.titulo.trim()) {
      setTaskErrorMsg('El título es obligatorio.');
      return;
    }
    if (!taskForm.asignado_a_id) {
      setTaskErrorMsg('Debes seleccionar una persona responsable.');
      return;
    }
    if (!isSeccionForEmpresa(activeEmpresa, taskForm.seccion)) {
      setTaskErrorMsg('La sección seleccionada no corresponde a esta empresa.');
      return;
    }

    setSavingTask(true);
    setTaskErrorMsg('');

    try {
      const completed = taskForm.estado === 'completada';
      const payload = {
        empresa: activeEmpresa,
        seccion: taskForm.seccion,
        estado: taskForm.estado,
        urgencia: taskForm.urgencia,
        titulo: taskForm.titulo.trim(),
        descripcion: taskForm.descripcion.trim() || null,
        asignado_a_id: taskForm.asignado_a_id,
        creado_por_id: currentUser?.id || null,
        fecha_vencimiento: taskForm.fecha_vencimiento,
        recurrencia: 'ninguna',
        completado: completed,
        completado_en: completed ? new Date().toISOString() : null,
      };

      const { data, error } = await supabase
        .from('recordatorios')
        .insert(payload)
        .select()
        .single();

      if (error || !data) throw error || new Error('No se pudo crear la task.');

      await insertTaskActivity(data.id, `Task creada en ${getSeccionLabel(activeEmpresa, taskForm.seccion)} con urgencia ${taskForm.urgencia}.`, 'creacion').catch((activityError) => {
        console.error('Error registrando actividad inicial de task:', activityError);
      });

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'recordatorios',
        entidad_id: data.id,
        descripcion: `Task administrativa creada: "${payload.titulo}" (${activeEmpresaConfig.label} / ${getSeccionLabel(activeEmpresa, taskForm.seccion)}).`,
        usuario_id: currentUser?.id || null,
        datos_nuevos: data,
      });

      setRecordatorios((prev) => [data as Recordatorio, ...prev]);
      setShowTaskModal(false);
    } catch (err) {
      console.error('Error creando task administrativa:', err);
      setTaskErrorMsg(mensajeError(err, 'No se pudo crear la task.'));
    } finally {
      setSavingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (recordatorio: Recordatorio, estado: EstadoRecordatorio) => {
    const canUpdate = currentUser?.rol === 'admin' || recordatorio.asignado_a_id === currentUser?.id;
    if (!canUpdate) return;

    const previous = recordatorios;
    const completed = estado === 'completada';
    const completadoEn = completed ? (recordatorio.completado_en || new Date().toISOString()) : null;

    setRecordatorios((prev) =>
      prev.map((item) =>
        item.id === recordatorio.id
          ? { ...item, estado, completado: completed, completado_en: completadoEn }
          : item
      )
    );

    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .update({
          estado,
          completado: completed,
          completado_en: completadoEn,
        })
        .eq('id', recordatorio.id)
        .select()
        .single();

      if (error || !data) throw error || new Error('No se pudo actualizar el estado.');

      const updatedRecordatorio = data as Recordatorio;
      setRecordatorios((prev) => prev.map((item) => (item.id === recordatorio.id ? updatedRecordatorio : item)));
      setSelectedTask((prev) => (prev?.id === recordatorio.id ? updatedRecordatorio : prev));

      await insertTaskActivity(
        recordatorio.id,
        `Estado cambiado a "${getEstadoConfig(estado).label}".`,
        'estado_cambiado'
      ).catch((activityError) => {
        console.error('Error registrando actividad de estado:', activityError);
      });

      await logSistema({
        tipo_accion: 'estado_cambiado',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Task administrativa actualizada a estado "${estado}": "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: data,
      });
    } catch (err) {
      console.error('Error actualizando estado de task:', err);
      setRecordatorios(previous);
      setSelectedTask((prev) => (prev?.id === recordatorio.id ? recordatorio : prev));
      alert(mensajeError(err, 'No se pudo actualizar el estado.'));
    }
  };

  const handleUpdateTaskUrgencia = async (recordatorio: Recordatorio, urgencia: UrgenciaRecordatorio) => {
    const canUpdate = currentUser?.rol === 'admin' || recordatorio.asignado_a_id === currentUser?.id;
    if (!canUpdate) return;

    const previous = recordatorios;

    setRecordatorios((prev) =>
      prev.map((item) =>
        item.id === recordatorio.id
          ? { ...item, urgencia }
          : item
      )
    );
    setSelectedTask((prev) => (prev?.id === recordatorio.id ? { ...prev, urgencia } : prev));

    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .update({ urgencia })
        .eq('id', recordatorio.id)
        .select()
        .single();

      if (error || !data) throw error || new Error('No se pudo actualizar la urgencia.');

      const updatedRecordatorio = data as Recordatorio;
      setRecordatorios((prev) => prev.map((item) => (item.id === recordatorio.id ? updatedRecordatorio : item)));
      setSelectedTask((prev) => (prev?.id === recordatorio.id ? updatedRecordatorio : prev));

      await insertTaskActivity(
        recordatorio.id,
        `Urgencia cambiada a "${getUrgenciaConfig(urgencia).label}".`,
        'urgencia_cambiada'
      ).catch((activityError) => {
        console.error('Error registrando actividad de urgencia:', activityError);
      });

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Urgencia de task administrativa actualizada a "${urgencia}": "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: updatedRecordatorio,
      });
    } catch (err) {
      console.error('Error actualizando urgencia de task:', err);
      setRecordatorios(previous);
      setSelectedTask((prev) => (prev?.id === recordatorio.id ? recordatorio : prev));
      alert(mensajeError(err, 'No se pudo actualizar la urgencia.'));
    }
  };

  const handleDeleteTask = async (recordatorio: Recordatorio) => {
    if (!canDeleteTask(recordatorio)) return;
    if (!confirm(`¿Eliminar la task "${recordatorio.titulo}"?`)) return;

    const previous = recordatorios;
    const previousSelectedTask = selectedTask;
    setRecordatorios((prev) => prev.filter((item) => item.id !== recordatorio.id));
    setSelectedTask((prev) => (prev?.id === recordatorio.id ? null : prev));

    try {
      let query = supabase
        .from('recordatorios')
        .update({ activo: false })
        .eq('id', recordatorio.id);

      if (currentUser?.rol !== 'admin') {
        query = query.eq('creado_por_id', currentUser?.id || '');
      }

      const { data, error } = await query.select().single();

      if (error || !data) {
        throw error || new Error('No se pudo eliminar la task.');
      }

      await insertTaskActivity(
        recordatorio.id,
        `Task eliminada por ${currentUser?.nombre || 'usuario'}.`,
        'actualizacion'
      ).catch((activityError) => {
        console.error('Error registrando eliminación de task:', activityError);
      });

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Task administrativa eliminada: "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: data,
      });
    } catch (err) {
      console.error('Error eliminando task administrativa:', err);
      setRecordatorios(previous);
      if (previousSelectedTask?.id === recordatorio.id) setSelectedTask(previousSelectedTask);
      alert(mensajeError(err, 'No se pudo eliminar la task.'));
    }
  };

  if (authLoading || loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
        Cargando biblioteca de administración...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#213343]  pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col items-center text-center space-y-2 pt-2">
              <div className="w-16 h-16 rounded-full bg-orange-50 text-[#f97316] border border-orange-100 flex items-center justify-center shadow-sm">
                <Building2 className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-lg font-black leading-tight">{activeEmpresaConfig.label}</h1>
                <p className="text-xs text-gray-500 mt-0.5">RUT {activeEmpresaConfig.rut}</p>
                <p className="text-xs font-mono font-bold text-gray-600 mt-0.5">Grupo Hormiglass</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100 text-center">
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                <p className="text-xl font-black">{empresaDocs.length}</p>
                <p className="text-[10px] font-bold text-gray-500">Docs empresa</p>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                <p className="text-xl font-black">{empresaRecordatoriosPendientes}</p>
                <p className="text-[10px] font-bold text-gray-500">Tasks abiertas</p>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-gray-100 text-xs">
              {activeSecciones.map((seccion) => {
                const taskCount = currentEmpresaRecordatorios.filter(
                  (recordatorio) => (recordatorio.seccion || DEFAULT_SECCION_ADMINISTRACION) === seccion.id
                ).length;
                const docCount =
                  seccion.id === DOCUMENTOS_SECCION
                    ? empresaDocs.length
                    : empresaDocs.filter((doc) => getDocumentoSeccion(doc) === seccion.id).length;

                return (
                  <button
                    key={seccion.id}
                    type="button"
                    onClick={() => {
                      setActiveSeccion(seccion.id);
                      router.push(getAdminHref(activeEmpresa, seccion.id), { scroll: false });
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg font-extrabold text-left transition ${
                      activeSeccion === seccion.id ? 'bg-orange-50 text-[#f97316]' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span className="truncate">{seccion.label}</span>
                    </span>
                    <span className="shrink-0 text-[10px] font-black text-gray-400">
                      {taskCount} / {docCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-5">
          <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#f97316]" />
                  <span>{activeSeccionConfig.label}</span>
                </h2>
                <p className="text-xs text-gray-500 font-medium mt-1">
                  {activeEmpresaConfig.label} · {activeSeccionConfig.description}
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto">
                {currentUser?.rol === 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      resetUploadForm();
                      setShowUploadModal(true);
                    }}
                    className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg font-extrabold text-xs transition flex items-center gap-2 shadow-sm"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Subir documento</span>
                  </button>
                )}
                {currentUser?.rol === 'admin' && (
                  <button
                    type="button"
                    onClick={openTaskModal}
                    className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg font-extrabold text-xs transition flex items-center gap-2 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nueva task</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {taskStatsByStatus.map((estado) => (
                <div key={estado.id} className={`rounded-lg border p-4 ${estado.className}`}>
                  <p className="text-[11px] font-black uppercase">{estado.label}</p>
                  <p className="text-2xl font-black mt-1">{estado.count}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-black text-base flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-[#f97316]" />
                    <span>Tasks y recordatorios</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {recordatoriosPendientes} abiertas · {recordatoriosVencidos} requieren atención por fecha.
                  </p>
                </div>
              </div>

              {currentSectionRecordatorios.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  No hay tasks activas en esta sección.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="hg-list-table w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-2 pr-3 font-black">Urgencia</th>
                        <th className="py-2 pr-3 font-black">Estado</th>
                        <th className="py-2 pr-3 font-black">Task</th>
                        <th className="py-2 pr-3 font-black">Responsable</th>
                        <th className="py-2 pr-3 font-black">Recordatorio</th>
                        <th className="py-2 pr-3 font-black">Última actividad</th>
                        <th className="py-2 pl-3 font-black text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentSectionRecordatorios.map((recordatorio) => {
                        const estado = recordatorio.estado || (recordatorio.completado ? 'completada' : 'por_hacer');
                        const estadoConfig = getEstadoConfig(estado, recordatorio.completado);
                        const urgencia = recordatorio.urgencia || 'media';
                        const urgenciaConfig = getUrgenciaConfig(urgencia);
                        const canUpdate = currentUser?.rol === 'admin' || recordatorio.asignado_a_id === currentUser?.id;

                        return (
                          <tr
                            key={recordatorio.id}
                            onClick={() => openTaskDetail(recordatorio)}
                            className="align-top cursor-pointer hover:bg-gray-50 transition"
                          >
                            <td className="py-3 pr-3 min-w-36">
                              {canUpdate ? (
                                <select
                                  value={urgencia}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => handleUpdateTaskUrgencia(recordatorio, event.target.value as UrgenciaRecordatorio)}
                                  className={`w-full px-2.5 py-1.5 rounded-md border text-[11px] font-black ${urgenciaConfig.className}`}
                                >
                                  {URGENCIAS_RECORDATORIO.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`inline-flex px-2.5 py-1 rounded-md border text-[11px] font-black ${urgenciaConfig.className}`}>
                                  {urgenciaConfig.label}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3 min-w-48">
                              {canUpdate ? (
                                <select
                                  value={estado}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => handleUpdateTaskStatus(recordatorio, event.target.value as EstadoRecordatorio)}
                                  className={`w-full px-2.5 py-1.5 rounded-md border text-[11px] font-black ${estadoConfig.className}`}
                                >
                                  {ESTADOS_RECORDATORIO.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`inline-flex px-2.5 py-1 rounded-md border text-[11px] font-black ${estadoConfig.className}`}>
                                  {estadoConfig.label}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3 min-w-64">
                              <p className="font-extrabold text-[#213343]">{recordatorio.titulo}</p>
                              {recordatorio.descripcion && (
                                <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{recordatorio.descripcion}</p>
                              )}
                            </td>
                            <td className="py-3 pr-3 min-w-44 font-bold text-gray-600">
                              <span className="inline-flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-gray-400" />
                                {getUserName(recordatorio.asignado_a_id)}
                              </span>
                            </td>
                            <td className="py-3 pr-3 min-w-36 font-bold text-gray-600">
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                {formatDate(recordatorio.fecha_vencimiento)}
                              </span>
                            </td>
                            <td className="py-3 pr-3 min-w-40 font-bold text-gray-600">
                              {formatDateTime(recordatorio.updated_at || recordatorio.created_at)}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              {canDeleteTask(recordatorio) && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteTask(recordatorio);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition"
                                  title="Eliminar task"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#f97316]" />
                    <span>Documentos</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {activeSeccion === DOCUMENTOS_SECCION
                      ? 'Todos los documentos adjuntos de la empresa.'
                      : `${activeSeccionConfig.label} · Adjuntos asociados a esta carpeta.`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                  <FolderOpen className="w-4 h-4 text-[#f97316]" />
                  <span>{filteredDocs.length} documentos</span>
                </div>
              </div>

              {currentUser?.rol !== 'admin' ? (
                <div className="p-8 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                  <h3 className="text-lg font-black">Documentos restringidos</h3>
                  <p className="text-sm text-gray-500 mt-1">Las carpetas de empresa son exclusivas del rol admin.</p>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                  No hay documentos en esta sección.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredDocs.map((doc) => (
                    <div key={doc.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-orange-50 text-[#f97316] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm truncate">{doc.nombre}</p>
                          <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
                            {getSeccionLabel(doc.empresa, getDocumentoSeccion(doc))} · {getCategoriaLabel(doc.categoria)} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                          </p>
                          {doc.descripcion && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{doc.descripcion}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenDocumento(doc)}
                          className="px-3 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-extrabold hover:border-orange-200 hover:text-[#f97316] transition flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Ver/Descargar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocumento(doc)}
                          className="p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition"
                          title="Eliminar documento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">Subir documento</h3>
                <p className="text-xs text-gray-500 font-medium">{activeEmpresaConfig.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {errorMsg}
                </div>
              )}

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Archivo</span>
                <input
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  className="mt-1.5 w-full text-xs font-semibold border border-gray-200 rounded-lg p-3"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Nombre</span>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(event) => setFormData((prev) => ({ ...prev, nombre: event.target.value }))}
                  placeholder={selectedFile?.name || 'Nombre visible del documento'}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Descripción</span>
                <textarea
                  value={formData.descripcion}
                  onChange={(event) => setFormData((prev) => ({ ...prev, descripcion: event.target.value }))}
                  rows={3}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold resize-none focus:outline-none focus:border-[#f97316]"
                />
              </label>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-extrabold text-gray-600 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUploadDocumento}
                disabled={uploading}
                className="px-4 py-2 rounded-lg bg-[#f97316] text-white text-xs font-extrabold hover:bg-[#ea580c] disabled:opacity-60 transition flex items-center gap-2"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{uploading ? 'Subiendo...' : 'Guardar documento'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTask && (() => {
        const estado = selectedTask.estado || (selectedTask.completado ? 'completada' : 'por_hacer');
        const estadoConfig = getEstadoConfig(estado, selectedTask.completado);
        const urgencia = selectedTask.urgencia || 'media';
        const urgenciaConfig = getUrgenciaConfig(urgencia);
        const canUpdate = currentUser?.rol === 'admin' || selectedTask.asignado_a_id === currentUser?.id;

        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
            <div className="bg-white w-full max-w-6xl h-full shadow-sm border-l border-gray-200 flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-gray-500 uppercase">{activeEmpresaConfig.label}</p>
                  <h3 className="text-xl font-black mt-1 leading-tight">{selectedTask.titulo}</h3>
                  {selectedTask.descripcion && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{selectedTask.descripcion}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canDeleteTask(selectedTask) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(selectedTask)}
                      className="px-3 py-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 text-xs font-black transition flex items-center gap-2"
                      title="Eliminar task"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedTask(null)}
                    className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition"
                    title="Cerrar detalle"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                <aside className="lg:col-span-4 border-r border-gray-100 p-6 space-y-4 overflow-y-auto bg-gray-50">
                  <div>
                    <h4 className="text-sm font-black flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-[#f97316]" />
                      Datos de la task
                    </h4>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Propiedades administrativas de seguimiento.
                    </p>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">Sección</span>
                      <span className="text-xs font-black text-right">
                        {getSeccionLabel(selectedTask.empresa, selectedTask.seccion || DEFAULT_SECCION_ADMINISTRACION)}
                      </span>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">Responsable</span>
                      <span className="text-xs font-black text-right">{getUserName(selectedTask.asignado_a_id)}</span>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">Recordatorio</span>
                      <span className="text-xs font-black text-right">{formatDate(selectedTask.fecha_vencimiento)}</span>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">Creada</span>
                      <span className="text-xs font-black text-right">{formatDateTime(selectedTask.created_at)}</span>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">Empresa</span>
                      <span className="text-xs font-black text-right">{activeEmpresaConfig.label}</span>
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">RUT</span>
                      <span className="text-xs font-black text-right">{activeEmpresaConfig.rut}</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                        <Flag className="w-3.5 h-3.5" />
                        Urgencia
                      </span>
                      {canUpdate ? (
                        <select
                          value={urgencia}
                          onChange={(event) => handleUpdateTaskUrgencia(selectedTask, event.target.value as UrgenciaRecordatorio)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-black ${urgenciaConfig.className}`}
                        >
                          {URGENCIAS_RECORDATORIO.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-md border text-[11px] font-black ${urgenciaConfig.className}`}>
                          {urgenciaConfig.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Estado
                      </span>
                      {canUpdate ? (
                        <select
                          value={estado}
                          onChange={(event) => handleUpdateTaskStatus(selectedTask, event.target.value as EstadoRecordatorio)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-black ${estadoConfig.className}`}
                        >
                          {ESTADOS_RECORDATORIO.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-md border text-[11px] font-black ${estadoConfig.className}`}>
                          {estadoConfig.label}
                        </span>
                      )}
                    </div>
                  </div>
                </aside>

                <section className="lg:col-span-8 flex flex-col min-h-0 bg-white">
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#f97316]" />
                        Actividad
                      </h4>
                      <p className="text-xs text-gray-500 font-medium">
                        Comentarios y cambios registrados automáticamente.
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-gray-400">{taskActivities.length} eventos</span>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3 bg-gray-50">
                    {loadingActivities ? (
                      <div className="p-8 text-center text-xs font-bold text-gray-400">Cargando actividad...</div>
                    ) : taskActivities.length === 0 ? (
                      <div className="p-8 text-center text-xs italic text-gray-400 border border-dashed border-gray-200 rounded-lg bg-white">
                        Esta task aún no tiene actividad registrada.
                      </div>
                    ) : (
                      taskActivities.map((activity) => (
                        <div key={activity.id} className="bg-white rounded-lg border border-gray-200 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#213343] text-white text-[10px] font-black flex items-center justify-center">
                                {(activity.usuario_nombre || 'HG').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-black">{activity.usuario_nombre || 'Sistema'}</p>
                                <p className="text-[10px] font-bold text-gray-400">{formatDateTime(activity.created_at)}</p>
                              </div>
                            </div>
                          <span className="px-2 py-0.5 rounded-md bg-gray-100 text-[10px] font-black text-gray-500">
                              {activity.tipo.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {renderMessageContentWithMentions(activity.contenido)}
                          </p>
                          {activity.archivo_path && (
                            <button
                              type="button"
                              onClick={() => handleOpenTaskAttachment(activity)}
                              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-xs font-black text-[#213343] hover:border-orange-200 hover:text-[#f97316] transition"
                            >
                              <FileText className="w-4 h-4" />
                              <span className="truncate max-w-72">{activity.archivo_nombre || 'Documento adjunto'}</span>
                              <span className="text-[10px] text-gray-400">{formatBytes(activity.archivo_size_bytes)}</span>
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-4 border-t border-gray-100 bg-white">
                    <div className="relative">
                      {taskMentionMenuOpen && filteredMentionUsers.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden z-10">
                          {filteredMentionUsers.map((user, idx) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => handleInsertTaskMention(user.nombre)}
                              className={`w-full text-left px-3 py-2 text-xs transition flex items-center justify-between ${
                                idx === selectedTaskMentionIndex ? 'bg-[#f97316] text-white' : 'text-gray-700 hover:bg-orange-50 hover:text-[#f97316]'
                              }`}
                            >
                              <span className="font-black">{user.nombre}</span>
                              <span className="text-[10px] uppercase font-mono opacity-75">{ROL_NOMBRE[user.rol] ?? user.rol}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-stretch gap-2">
                        <label className="h-11 w-11 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-[#f97316] hover:border-orange-200 transition flex items-center justify-center cursor-pointer" title="Adjuntar documento">
                          {uploadingTaskAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                          <input type="file" className="hidden" onChange={handleUploadTaskAttachment} disabled={uploadingTaskAttachment} />
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            setTaskMentionMenuOpen((prev) => !prev);
                            setSelectedTaskMentionIndex(0);
                          }}
                          className="h-11 w-11 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-[#f97316] hover:border-orange-200 transition flex items-center justify-center"
                          title="Mencionar persona"
                        >
                          <AtSign className="w-4 h-4" />
                        </button>

                        <textarea
                          value={activityMessage}
                          onChange={(event) => handleActivityMessageChange(event.target.value)}
                          onKeyDown={handleTaskActivityKeyDown}
                          rows={1}
                          placeholder="Escribe un comentario..."
                          className="h-11 min-h-11 max-h-28 px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-medium resize-y focus:outline-none focus:border-[#f97316]"
                        />

                      <button
                        type="button"
                        onClick={handleAddTaskActivity}
                        disabled={sendingActivity || !activityMessage.trim()}
                          className="h-11 px-4 rounded-lg bg-[#f97316] text-white text-xs font-black hover:bg-[#ea580c] disabled:opacity-50 transition flex items-center justify-center gap-2"
                      >
                        {sendingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        <span>Enviar</span>
                      </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      })()}

      {showTaskModal && currentUser?.rol === 'admin' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">Nueva task</h3>
                <p className="text-xs text-gray-500 font-medium">{activeEmpresaConfig.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {taskErrorMsg && (
                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{taskErrorMsg}</span>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Título</span>
                <input
                  type="text"
                  value={taskForm.titulo}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, titulo: event.target.value }))}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Descripción</span>
                <textarea
                  value={taskForm.descripcion}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                  rows={3}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold resize-none focus:outline-none focus:border-[#f97316]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Sección</span>
                <select
                  value={taskForm.seccion}
                  onChange={(event) =>
                    setTaskForm((prev) => ({
                      ...prev,
                      seccion: event.target.value as SeccionAdministracionEmpresa,
                    }))
                  }
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                >
                  {activeSecciones.map((seccion) => (
                    <option key={seccion.id} value={seccion.id}>
                      {seccion.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Responsable</span>
                  <select
                    value={taskForm.asignado_a_id}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, asignado_a_id: event.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                  >
                    <option value="">Seleccionar persona</option>
                    {activeUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Fecha recordatorio</span>
                  <input
                    type="date"
                    value={taskForm.fecha_vencimiento}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, fecha_vencimiento: event.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:border-[#f97316]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Estado</span>
                  <select
                    value={taskForm.estado}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, estado: event.target.value as EstadoRecordatorio }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                  >
                    {ESTADOS_RECORDATORIO.map((estado) => (
                      <option key={estado.id} value={estado.id}>
                        {estado.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Urgencia</span>
                  <select
                    value={taskForm.urgencia}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, urgencia: event.target.value as UrgenciaRecordatorio }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                  >
                    {URGENCIAS_RECORDATORIO.map((urgencia) => (
                      <option key={urgencia.id} value={urgencia.id}>
                        {urgencia.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTaskModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-extrabold text-gray-600 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTask}
                disabled={savingTask}
                className="px-4 py-2 rounded-lg bg-[#f97316] text-white text-xs font-extrabold hover:bg-[#ea580c] disabled:opacity-60 transition flex items-center gap-2"
              >
                {savingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{savingTask ? 'Guardando...' : 'Guardar task'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
