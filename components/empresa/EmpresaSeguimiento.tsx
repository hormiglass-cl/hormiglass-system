'use client';

import { ROL_NOMBRE } from '../../lib/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  AtSign,
  Calendar,
  Download,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  User,
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
import {
  Panel,
  Button,
  IconButton,
  StatusBadge,
  Dialog,
  Field,
  TextInput,
  Select,
} from '../ui/crm';
import { useToast, useConfirm } from '../ui/feedback';
import { DateInput } from '../ui/FormControls';

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
  tone: 'neutral' | 'info' | 'warning' | 'success';
}[] = [
  { id: 'por_hacer', label: 'Por hacer', tone: 'neutral' },
  { id: 'en_curso', label: 'En curso', tone: 'info' },
  { id: 'requiere_actualizacion', label: 'Requiere actualización', tone: 'warning' },
  { id: 'completada', label: 'Completadas', tone: 'success' },
];

const URGENCIAS_RECORDATORIO: {
  id: UrgenciaRecordatorio;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'danger';
}[] = [
  { id: 'baja', label: 'Baja', tone: 'neutral' },
  { id: 'media', label: 'Media', tone: 'info' },
  { id: 'alta', label: 'Alta', tone: 'warning' },
  { id: 'critica', label: 'Crítica', tone: 'danger' },
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
          className="text-accent-ink font-semibold bg-accent-soft px-1.5 py-0.5 rounded-control border border-accent-line inline-block mx-0.5"
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

export interface EmpresaSeguimientoPartes {
  /** Lista de subcarpetas con sus contadores. */
  seccionesNav: React.ReactNode;
  /** Contenido de la subcarpeta activa: estados, tasks y documentos. */
  contenido: React.ReactNode;
  puedeGestionar: boolean;
  nuevaTask: () => void;
  subirDocumento: () => void;
  documentos: number;
  tasksAbiertas: number;
}

/** Seguimiento administrativo de una empresa: subcarpetas, tasks, recordatorios y documentos. */
export function EmpresaSeguimiento({
  empresa: activeEmpresa,
  children,
}: {
  empresa: EmpresaHormiglass;
  children: (partes: EmpresaSeguimientoPartes) => React.ReactNode;
}) {
  const { currentUser, usersList, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [documentos, setDocumentos] = useState<AdministracionDocumento[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);
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

  const activeSeccion = getSeccionForEmpresa(activeEmpresa, searchParams.get('seccion'));
  const setActiveSeccion = useCallback(
    (seccion: SeccionAdministracionEmpresa) => router.replace(`${pathname}?seccion=${seccion}`, { scroll: false }),
    [pathname, router]
  );

  useEffect(() => {
    if (authLoading) return;
    const loadTimeout = setTimeout(() => {
      void loadDocumentos();
      void loadRecordatorios();
    }, 0);

    const channel = supabase
      .channel(`administracion_${activeEmpresa}_live`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'administracion_documentos' }, () => void loadDocumentos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => void loadRecordatorios())
      .subscribe();

    return () => {
      clearTimeout(loadTimeout);
      void supabase.removeChannel(channel);
    };
  }, [activeEmpresa, authLoading, loadDocumentos, loadRecordatorios, supabase]);

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
    return activeUsers
      .filter((user) => user.nombre.toLowerCase().includes(query))
      .slice(0, 6);
  }, [activityMessage, activeUsers]);

  const getUserName = useCallback((userId?: string | null) => {
    if (!userId) return 'Sin asignar';
    return usersList.find((u) => u.id === userId)?.nombre || 'Usuario';
  }, [usersList]);

  const getEstadoConfig = (estado?: EstadoRecordatorio | null, completado?: boolean) => {
    if (completado) return ESTADOS_RECORDATORIO.find((e) => e.id === 'completada') || ESTADOS_RECORDATORIO[3];
    return ESTADOS_RECORDATORIO.find((e) => e.id === estado) || ESTADOS_RECORDATORIO[0];
  };

  const getUrgenciaConfig = (urgencia?: UrgenciaRecordatorio | null) => {
    return URGENCIAS_RECORDATORIO.find((u) => u.id === urgencia) || URGENCIAS_RECORDATORIO[1];
  };

  const canDeleteTask = (recordatorio: Recordatorio) => {
    if (currentUser?.rol === 'admin') return true;
    return recordatorio.creado_por_id === currentUser?.id;
  };

  const currentEmpresaRecordatorios = useMemo(
    () => recordatorios.filter((r) => r.empresa === activeEmpresa),
    [recordatorios, activeEmpresa]
  );

  const currentSectionRecordatorios = useMemo(
    () =>
      currentEmpresaRecordatorios.filter(
        (r) => (r.seccion || DEFAULT_SECCION_ADMINISTRACION) === activeSeccion
      ),
    [currentEmpresaRecordatorios, activeSeccion]
  );

  const filteredDocs = useMemo(() => {
    if (activeSeccion === DOCUMENTOS_SECCION) {
      return empresaDocs;
    }
    return empresaDocs.filter((doc) => getDocumentoSeccion(doc) === activeSeccion);
  }, [empresaDocs, activeSeccion]);

  const recordatoriosPendientes = useMemo(
    () => currentSectionRecordatorios.filter((r) => !r.completado && r.estado !== 'completada').length,
    [currentSectionRecordatorios]
  );

  const empresaRecordatoriosPendientes = useMemo(
    () => currentEmpresaRecordatorios.filter((r) => !r.completado && r.estado !== 'completada').length,
    [currentEmpresaRecordatorios]
  );

  const recordatoriosVencidos = useMemo(() => {
    const today = todayISO();
    return currentSectionRecordatorios.filter(
      (r) => !r.completado && r.estado !== 'completada' && r.fecha_vencimiento && r.fecha_vencimiento < today
    ).length;
  }, [currentSectionRecordatorios]);

  const taskStatsByStatus = useMemo(() => {
    return ESTADOS_RECORDATORIO.map((item) => {
      const count = currentSectionRecordatorios.filter((r) => {
        const est = r.estado || (r.completado ? 'completada' : 'por_hacer');
        return est === item.id;
      }).length;
      return { ...item, count };
    });
  }, [currentSectionRecordatorios]);

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
      console.error('Error cargando actividades:', err);
      setTaskActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  };

  const insertTaskActivity = async (
    recordatorioId: string,
    contenido: string,
    tipo: TipoRecordatorioActividad,
    archivoMeta?: {
      archivo_nombre?: string | null;
      archivo_path?: string | null;
      archivo_bucket?: string | null;
      archivo_mime_type?: string | null;
      archivo_size_bytes?: number | null;
    }
  ) => {
    const payload = {
      recordatorio_id: recordatorioId,
      usuario_id: currentUser?.id || null,
      usuario_nombre: currentUser?.nombre || 'Usuario',
      tipo,
      contenido,
      archivo_nombre: archivoMeta?.archivo_nombre || null,
      archivo_path: archivoMeta?.archivo_path || null,
      archivo_bucket: archivoMeta?.archivo_bucket || null,
      archivo_mime_type: archivoMeta?.archivo_mime_type || null,
      archivo_size_bytes: archivoMeta?.archivo_size_bytes || null,
    };

    const { data, error } = await supabase
      .from('recordatorio_actividades')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    setTaskActivities((prev) => [...prev, data as RecordatorioActividad]);
    return data as RecordatorioActividad;
  };

  const notifyTaskMentions = async (recordatorio: Recordatorio, message: string) => {
    const mentionRegex = /@([a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ]+)/g;
    const matches = Array.from(message.matchAll(mentionRegex), (m) => m[1].toLowerCase());
    if (matches.length === 0) return;

    const mentionedUsers = activeUsers.filter(
      (user) =>
        matches.includes(user.nombre.toLowerCase().split(' ')[0]) ||
        matches.includes(user.nombre.toLowerCase().replaceAll(' ', '_'))
    );

    const now = new Date().toISOString();
    const notifications = mentionedUsers
      .filter((user) => user.id !== currentUser?.id)
      .map((user) => ({
        usuario_id: user.id,
        titulo: `${currentUser?.nombre || 'Alguien'} te mencionó en una task`,
        mensaje: `En la task "${recordatorio.titulo}": "${message.slice(0, 140)}"`,
        tipo: 'mencion_task',
        entidad_tipo: 'recordatorio',
        entidad_id: recordatorio.id,
        leido: false,
        created_at: now,
      }));

    if (notifications.length > 0) {
      await supabase.from('notificaciones').insert(notifications);
    }
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setFormData({ nombre: '', descripcion: '' });
    setErrorMsg('');
  };

  const handleUploadDocumento = async () => {
    if (!selectedFile) {
      setErrorMsg('Debes seleccionar un archivo.');
      return;
    }

    setUploading(true);
    setErrorMsg('');

    try {
      const ext = selectedFile.name.split('.').pop();
      const sanitizedName = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const storagePath = `empresa/${activeEmpresa}/${Date.now()}_${sanitizedName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('administracion')
        .upload(storagePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const seccionGuardar = activeSeccion === DOCUMENTOS_SECCION ? 'administracion_documentos' : activeSeccion;
      const categoriaGuardar = getCategoriaForSeccion(activeSeccion);

      const nuevoDocPayload = {
        empresa: activeEmpresa,
        seccion: seccionGuardar,
        categoria: categoriaGuardar,
        nombre: formData.nombre.trim() || selectedFile.name,
        descripcion: formData.descripcion.trim() || null,
        storage_path: storagePath,
        mime_type: selectedFile.type || null,
        size_bytes: selectedFile.size,
        subido_por: isUUID(currentUser?.id) ? currentUser?.id : null,
      };

      const { data: insertedDoc, error: insertError } = await supabase
        .from('administracion_documentos')
        .insert([nuevoDocPayload])
        .select()
        .single();

      if (insertError) throw insertError;

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'administracion_documentos',
        entidad_id: insertedDoc.id,
        descripcion: `Documento administrativo subido: "${insertedDoc.nombre}".`,
        usuario_id: currentUser?.id || null,
        datos_nuevos: insertedDoc,
      });

      setShowUploadModal(false);
      resetUploadForm();
      toast({ message: 'Documento guardado con éxito.', tone: 'success' });
      await loadDocumentos();
    } catch (err) {
      console.error('Error subiendo documento:', err);
      setErrorMsg(mensajeError(err, 'No se pudo subir el archivo.'));
    } finally {
      setUploading(false);
    }
  };

  const handleUploadTaskAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedTask) return;

    setUploadingTaskAttachment(true);
    try {
      const ext = file.name.split('.').pop();
      const sanitizedName = file.name
        .replace(/\.[^/.]+$/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      const storagePath = `tasks/${selectedTask.id}/${Date.now()}_${sanitizedName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('administracion')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      await insertTaskActivity(
        selectedTask.id,
        `Documento adjunto: "${file.name}".`,
        'archivo',
        {
          archivo_nombre: file.name,
          archivo_path: storagePath,
          archivo_bucket: 'administracion',
          archivo_mime_type: file.type || null,
          archivo_size_bytes: file.size,
        }
      );
      toast({ message: 'Documento adjuntado.', tone: 'success' });
    } catch (err) {
      console.error('Error adjuntando documento a task:', err);
      toast({ message: mensajeError(err, 'No se pudo adjuntar el documento.'), tone: 'danger' });
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
      toast({ message: mensajeError(err, 'No se pudo abrir el documento.'), tone: 'danger' });
    }
  };

  const openTaskDetail = (recordatorio: Recordatorio) => {
    setSelectedTask(recordatorio);
    setActivityMessage('');
    setTaskMentionMenuOpen(false);
    void loadTaskActivities(recordatorio.id);
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

    if (completedMention) {
      setTaskMentionMenuOpen(false);
      return;
    }

    setTaskMentionMenuOpen(true);
    setSelectedTaskMentionIndex(0);
  };

  const handleInsertTaskMention = (userName: string) => {
    const lastAtIndex = activityMessage.lastIndexOf('@');
    if (lastAtIndex === -1) return;

    const beforeMention = activityMessage.slice(0, lastAtIndex);
    const updated = `${beforeMention}@${userName} `;
    setActivityMessage(updated);
    setTaskMentionMenuOpen(false);
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
      toast({ message: mensajeError(err, 'No se pudo guardar el comentario.'), tone: 'danger' });
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
        event.preventDefault();
        setTaskMentionMenuOpen(false);
        return;
      }
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleAddTaskActivity();
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
      toast({ message: mensajeError(err, 'No se pudo abrir el documento.'), tone: 'danger' });
    }
  };

  const handleDeleteDocumento = async (doc: AdministracionDocumento) => {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: `¿Estás seguro de eliminar "${doc.nombre}" de Administración?`,
      confirmLabel: 'Eliminar documento',
      destructive: true,
    });
    if (!ok) return;

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
      toast({ message: 'Documento eliminado.', tone: 'info' });
    } catch (err) {
      console.error('Error eliminando documento administrativo:', err);
      setDocumentos(previousDocs);
      toast({ message: mensajeError(err, 'No se pudo eliminar el documento.'), tone: 'danger' });
    }
  };

  const openTaskModal = () => {
    setTaskForm(defaultTaskForm(activeUsers[0]?.id || currentUser?.id || '', activeSeccion));
    setTaskErrorMsg('');
    setShowTaskModal(true);
  };

  const handleSaveTask = async () => {
    if (!taskForm.titulo.trim()) {
      setTaskErrorMsg('El título de la task es obligatorio.');
      return;
    }

    setSavingTask(true);
    setTaskErrorMsg('');

    try {
      const now = new Date().toISOString();
      const payload = {
        titulo: taskForm.titulo.trim(),
        descripcion: taskForm.descripcion.trim() || null,
        empresa: activeEmpresa,
        seccion: taskForm.seccion,
        asignado_a_id: isUUID(taskForm.asignado_a_id) ? taskForm.asignado_a_id : null,
        creado_por_id: isUUID(currentUser?.id) ? currentUser?.id : null,
        fecha_vencimiento: taskForm.fecha_vencimiento || todayISO(),
        estado: taskForm.estado,
        urgencia: taskForm.urgencia,
        completado: taskForm.estado === 'completada',
        activo: true,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('recordatorios')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      const created = data as Recordatorio;
      setRecordatorios((prev) => [created, ...prev]);

      await insertTaskActivity(
        created.id,
        `Task creada por ${currentUser?.nombre || 'usuario'} en sección "${getSeccionLabel(activeEmpresa, created.seccion)}".`,
        'actualizacion'
      ).catch((activityError) => {
        console.error('Error registrando actividad inicial:', activityError);
      });

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'recordatorios',
        entidad_id: created.id,
        descripcion: `Task administrativa creada: "${created.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_nuevos: created,
      });

      setShowTaskModal(false);
      toast({ message: 'Task creada exitosamente.', tone: 'success' });
      await loadRecordatorios();
    } catch (err) {
      console.error('Error guardando task administrativa:', err);
      setTaskErrorMsg(mensajeError(err, 'No se pudo guardar la task.'));
    } finally {
      setSavingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (recordatorio: Recordatorio, estado: EstadoRecordatorio) => {
    const canUpdate = currentUser?.rol === 'admin' || recordatorio.asignado_a_id === currentUser?.id;
    if (!canUpdate) return;

    const previous = recordatorios;
    const completado = estado === 'completada';

    setRecordatorios((prev) =>
      prev.map((item) =>
        item.id === recordatorio.id
          ? { ...item, estado, completado }
          : item
      )
    );
    setSelectedTask((prev) => (prev?.id === recordatorio.id ? { ...prev, estado, completado } : prev));

    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .update({ estado, completado, updated_at: new Date().toISOString() })
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
        tipo_accion: 'actualizacion',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Estado de task administrativa actualizado a "${estado}": "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: data,
      });
    } catch (err) {
      console.error('Error actualizando estado de task:', err);
      setRecordatorios(previous);
      setSelectedTask((prev) => (prev?.id === recordatorio.id ? recordatorio : prev));
      toast({ message: mensajeError(err, 'No se pudo actualizar el estado.'), tone: 'danger' });
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
      toast({ message: mensajeError(err, 'No se pudo actualizar la urgencia.'), tone: 'danger' });
    }
  };

  const handleDeleteTask = async (recordatorio: Recordatorio) => {
    if (!canDeleteTask(recordatorio)) return;
    const ok = await confirm({
      title: 'Eliminar task',
      message: `¿Estás seguro de eliminar la task "${recordatorio.titulo}"?`,
      confirmLabel: 'Eliminar task',
      destructive: true,
    });
    if (!ok) return;

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
      toast({ message: 'Task eliminada.', tone: 'info' });
    } catch (err) {
      console.error('Error eliminando task administrativa:', err);
      setRecordatorios(previous);
      if (previousSelectedTask?.id === recordatorio.id) setSelectedTask(previousSelectedTask);
      toast({ message: mensajeError(err, 'No se pudo eliminar la task.'), tone: 'danger' });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="p-12 text-center t-caption font-medium">
        Cargando biblioteca de administración…
      </div>
    );
  }

  return (
    <>
      {children({
        seccionesNav: (
            <div className="space-y-1 text-xs">
              {activeSecciones.map((seccion) => {
                const taskCount = currentEmpresaRecordatorios.filter(
                  (recordatorio) => (recordatorio.seccion || DEFAULT_SECCION_ADMINISTRACION) === seccion.id
                ).length;
                const docCount =
                  seccion.id === DOCUMENTOS_SECCION
                    ? empresaDocs.length
                    : empresaDocs.filter((doc) => getDocumentoSeccion(doc) === seccion.id).length;

                const isSelected = activeSeccion === seccion.id;

                return (
                  <button
                    key={seccion.id}
                    type="button"
                    onClick={() => {
                      setActiveSeccion(seccion.id);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-control font-semibold text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-accent-soft text-accent-ink border border-accent-line'
                        : 'text-ink hover:bg-surface-muted border border-transparent'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{seccion.label}</span>
                    </span>
                    <span className="shrink-0 t-micro text-ink-muted">
                      {taskCount} / {docCount}
                    </span>
                  </button>
                );
              })}
            </div>
        ),
        contenido: (
          <Panel
            title={
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-accent-ink" />
                <span>{activeSeccionConfig.label}</span>
              </span>
            }
          >
            <div className="p-4 space-y-4">
              {/* Contadores de estado de tareas */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {taskStatsByStatus.map((estado) => (
                  <div
                    key={estado.id}
                    className="rounded-control border border-line bg-surface p-3 space-y-1"
                  >
                    <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
                    <p className="t-num text-xl font-bold text-ink">{estado.count}</p>
                  </div>
                ))}
              </div>

              {/* Tasks y recordatorios */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                  <h3 className="t-section text-sm flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-accent-ink" />
                    <span>Tasks y recordatorios</span>
                  </h3>
                  <span className="t-caption">
                    {recordatoriosPendientes} abiertas · {recordatoriosVencidos} vencidas
                  </span>
                </div>

                {currentSectionRecordatorios.length === 0 ? (
                  <div className="p-8 text-center text-ink-muted t-caption border border-dashed border-line rounded-control">
                    No hay tasks activas en esta sección.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="hg-table w-full text-xs">
                      <thead>
                        <tr>
                          <th className="p-3">Urgencia</th>
                          <th className="p-3">Estado</th>
                          <th className="p-3">Task</th>
                          <th className="p-3">Responsable</th>
                          <th className="p-3">Recordatorio</th>
                          <th className="p-3">Última actividad</th>
                          <th className="p-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSectionRecordatorios.map((recordatorio) => {
                          const estado = recordatorio.estado || (recordatorio.completado ? 'completada' : 'por_hacer');
                          const urgencia = recordatorio.urgencia || 'media';
                          const canUpdate = currentUser?.rol === 'admin' || recordatorio.asignado_a_id === currentUser?.id;

                          return (
                            <tr
                              key={recordatorio.id}
                              onClick={() => openTaskDetail(recordatorio)}
                              className="cursor-pointer"
                            >
                              <td className="p-3 align-top min-w-32">
                                {canUpdate ? (
                                  <Select
                                    value={urgencia}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => void handleUpdateTaskUrgencia(recordatorio, event.target.value as UrgenciaRecordatorio)}
                                    className="hg-field py-1 text-xs"
                                  >
                                    {URGENCIAS_RECORDATORIO.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <StatusBadge tone={getUrgenciaConfig(urgencia).tone}>
                                    {getUrgenciaConfig(urgencia).label}
                                  </StatusBadge>
                                )}
                              </td>

                              <td className="p-3 align-top min-w-36">
                                {canUpdate ? (
                                  <Select
                                    value={estado}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => void handleUpdateTaskStatus(recordatorio, event.target.value as EstadoRecordatorio)}
                                    className="hg-field py-1 text-xs"
                                  >
                                    {ESTADOS_RECORDATORIO.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </Select>
                                ) : (
                                  <StatusBadge tone={getEstadoConfig(estado).tone}>
                                    {getEstadoConfig(estado).label}
                                  </StatusBadge>
                                )}
                              </td>

                              <td className="p-3 align-top min-w-56">
                                <p className="font-semibold text-ink">{recordatorio.titulo}</p>
                                {recordatorio.descripcion && (
                                  <p className="t-micro text-ink-muted mt-0.5 line-clamp-2">{recordatorio.descripcion}</p>
                                )}
                              </td>

                              <td className="p-3 align-top text-ink-muted">
                                <span className="inline-flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5" />
                                  <span>{getUserName(recordatorio.asignado_a_id)}</span>
                                </span>
                              </td>

                              <td className="p-3 align-top text-ink-muted t-num">
                                <span className="inline-flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>{formatDate(recordatorio.fecha_vencimiento)}</span>
                                </span>
                              </td>

                              <td className="p-3 align-top text-ink-muted t-num t-micro">
                                {formatDateTime(recordatorio.updated_at || recordatorio.created_at)}
                              </td>

                              <td className="p-3 align-top text-right">
                                {canDeleteTask(recordatorio) && (
                                  <IconButton
                                    icon={Trash2}
                                    label="Eliminar task"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleDeleteTask(recordatorio);
                                    }}
                                  />
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

              {/* Documentos de la sección */}
              <div className="space-y-3 pt-4 border-t border-line-subtle">
                <div className="flex items-center justify-between">
                  <h3 className="t-section text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-accent-ink" />
                    <span>Documentos ({filteredDocs.length})</span>
                  </h3>
                </div>

                {currentUser?.rol !== 'admin' ? (
                  <div className="p-6 text-center">
                    <AlertTriangle className="w-6 h-6 text-warning mx-auto mb-2" />
                    <h4 className="t-section text-sm">Documentos restringidos</h4>
                    <p className="t-caption mt-1">Las carpetas de empresa son exclusivas del rol administrador.</p>
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="p-8 text-center text-ink-muted t-caption border border-dashed border-line rounded-control">
                    No hay documentos en esta sección.
                  </div>
                ) : (
                  <div className="divide-y divide-line-subtle">
                    {filteredDocs.map((doc) => (
                      <div key={doc.id} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-control bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-ink truncate">{doc.nombre}</p>
                            <p className="t-micro text-ink-muted mt-0.5">
                              {getSeccionLabel(doc.empresa, getDocumentoSeccion(doc))} · {getCategoriaLabel(doc.categoria)} · {formatBytes(doc.size_bytes)} · {formatDate(doc.created_at)}
                            </p>
                            {doc.descripcion && (
                              <p className="t-caption mt-0.5 line-clamp-2">{doc.descripcion}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={Download}
                            onClick={() => void handleOpenDocumento(doc)}
                          >
                            Ver / Descargar
                          </Button>
                          <IconButton
                            icon={Trash2}
                            label="Eliminar documento"
                            onClick={() => void handleDeleteDocumento(doc)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ),
        puedeGestionar: currentUser?.rol === 'admin',
        nuevaTask: openTaskModal,
        subirDocumento: () => {
          resetUploadForm();
          setShowUploadModal(true);
        },
        documentos: empresaDocs.length,
        tasksAbiertas: empresaRecordatoriosPendientes,
      })}

      {/* Modal Subir Documento */}
      <Dialog
        open={showUploadModal}
        title="Subir documento"
        description={activeEmpresaConfig.label}
        onClose={() => setShowUploadModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowUploadModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={uploading}
              onClick={() => void handleUploadDocumento()}
            >
              {uploading ? 'Subiendo…' : 'Guardar documento'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          {errorMsg && (
            <p role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger-line text-danger font-semibold">
              {errorMsg}
            </p>
          )}

          <Field label="Archivo" required>
            {({ id }) => (
              <input
                id={id}
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                className="hg-field p-2 w-full"
              />
            )}
          </Field>

          <Field label="Nombre">
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                value={formData.nombre}
                onChange={(event) => setFormData((prev) => ({ ...prev, nombre: event.target.value }))}
                placeholder={selectedFile?.name || 'Nombre visible del documento'}
              />
            )}
          </Field>

          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={3}
                value={formData.descripcion}
                onChange={(event) => setFormData((prev) => ({ ...prev, descripcion: event.target.value }))}
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>
        </div>
      </Dialog>

      {/* Modal Nueva Task */}
      <Dialog
        open={showTaskModal && currentUser?.rol === 'admin'}
        title="Nueva task"
        description={activeEmpresaConfig.label}
        onClose={() => setShowTaskModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowTaskModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={savingTask}
              onClick={() => void handleSaveTask()}
            >
              {savingTask ? 'Guardando…' : 'Guardar task'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          {taskErrorMsg && (
            <p role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger-line text-danger font-semibold">
              {taskErrorMsg}
            </p>
          )}

          <Field label="Título" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                value={taskForm.titulo}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, titulo: event.target.value }))}
              />
            )}
          </Field>

          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={3}
                value={taskForm.descripcion}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>

          <Field label="Sección" required>
            {({ id }) => (
              <Select
                id={id}
                value={taskForm.seccion}
                onChange={(event) =>
                  setTaskForm((prev) => ({
                    ...prev,
                    seccion: event.target.value as SeccionAdministracionEmpresa,
                  }))
                }
              >
                {activeSecciones.map((seccion) => (
                  <option key={seccion.id} value={seccion.id}>
                    {seccion.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Responsable">
              {({ id }) => (
                <Select
                  id={id}
                  value={taskForm.asignado_a_id}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, asignado_a_id: event.target.value }))}
                >
                  <option value="">Seleccionar persona</option>
                  {activeUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Fecha recordatorio">
              {({ id }) => (
                <DateInput
                  id={id}
                  value={taskForm.fecha_vencimiento}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, fecha_vencimiento: event.target.value }))}
                />
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Estado">
              {({ id }) => (
                <Select
                  id={id}
                  value={taskForm.estado}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, estado: event.target.value as EstadoRecordatorio }))}
                >
                  {ESTADOS_RECORDATORIO.map((estado) => (
                    <option key={estado.id} value={estado.id}>
                      {estado.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Urgencia">
              {({ id }) => (
                <Select
                  id={id}
                  value={taskForm.urgencia}
                  onChange={(event) => setTaskForm((prev) => ({ ...prev, urgencia: event.target.value as UrgenciaRecordatorio }))}
                >
                  {URGENCIAS_RECORDATORIO.map((urgencia) => (
                    <option key={urgencia.id} value={urgencia.id}>
                      {urgencia.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Dialog>

      {/* Detalle de Task */}
      {selectedTask && (() => {
        const estado = selectedTask.estado || (selectedTask.completado ? 'completada' : 'por_hacer');
        const urgencia = selectedTask.urgencia || 'media';
        const canUpdate = currentUser?.rol === 'admin' || selectedTask.asignado_a_id === currentUser?.id;

        return (
          <Dialog
            open={!!selectedTask}
            title={selectedTask.titulo}
            description={`${activeEmpresaConfig.label} · ${getSeccionLabel(selectedTask.empresa, selectedTask.seccion || DEFAULT_SECCION_ADMINISTRACION)}`}
            onClose={() => setSelectedTask(null)}
            size="lg"
            footer={
              <div className="flex items-center justify-between w-full">
                {canDeleteTask(selectedTask) ? (
                  <Button
                    variant="destructive"
                    icon={Trash2}
                    onClick={() => void handleDeleteTask(selectedTask)}
                  >
                    Eliminar task
                  </Button>
                ) : <span />}
                <Button
                  variant="secondary"
                  onClick={() => setSelectedTask(null)}
                >
                  Cerrar
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Propiedades */}
              <div className="lg:col-span-5 space-y-3 bg-surface-muted p-3.5 rounded-control border border-line t-caption">
                {selectedTask.descripcion && (
                  <div>
                    <span className="font-semibold text-ink block mb-0.5">Descripción</span>
                    <p className="text-ink-muted">{selectedTask.descripcion}</p>
                  </div>
                )}

                <div className="space-y-2 pt-2 border-t border-line-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Responsable</span>
                    <span className="font-semibold text-ink">{getUserName(selectedTask.asignado_a_id)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Fecha límite</span>
                    <span className="font-semibold text-ink t-num">{formatDate(selectedTask.fecha_vencimiento)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Urgencia</span>
                    {canUpdate ? (
                      <Select
                        value={urgencia}
                        onChange={(event) => void handleUpdateTaskUrgencia(selectedTask, event.target.value as UrgenciaRecordatorio)}
                        className="hg-field py-1 text-xs"
                      >
                        {URGENCIAS_RECORDATORIO.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <StatusBadge tone={getUrgenciaConfig(urgencia).tone}>
                        {getUrgenciaConfig(urgencia).label}
                      </StatusBadge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-muted">Estado</span>
                    {canUpdate ? (
                      <Select
                        value={estado}
                        onChange={(event) => void handleUpdateTaskStatus(selectedTask, event.target.value as EstadoRecordatorio)}
                        className="hg-field py-1 text-xs"
                      >
                        {ESTADOS_RECORDATORIO.map((option) => (
                          <option key={option.id} value={option.id}>{option.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <StatusBadge tone={getEstadoConfig(estado).tone}>
                        {getEstadoConfig(estado).label}
                      </StatusBadge>
                    )}
                  </div>
                </div>
              </div>

              {/* Actividad / Comentarios */}
              <div className="lg:col-span-7 flex flex-col min-h-0 space-y-3">
                <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                  <span className="font-semibold text-ink flex items-center gap-1.5 t-caption">
                    <MessageSquare className="w-3.5 h-3.5 text-accent-ink" />
                    <span>Actividad ({taskActivities.length})</span>
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2.5 p-2 bg-surface-muted rounded-control border border-line">
                  {loadingActivities ? (
                    <p className="t-caption text-center py-4 text-ink-muted">Cargando actividad…</p>
                  ) : taskActivities.length === 0 ? (
                    <p className="t-caption text-center py-4 text-ink-muted">Sin comentarios registrados.</p>
                  ) : (
                    taskActivities.map((act) => (
                      <div key={act.id} className="bg-surface p-2.5 rounded-control border border-line space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink">{act.usuario_nombre || 'Sistema'}</span>
                          <span className="t-micro text-ink-muted t-num">{formatDateTime(act.created_at)}</span>
                        </div>
                        <p className="t-caption whitespace-pre-wrap">{renderMessageContentWithMentions(act.contenido)}</p>
                        {act.archivo_path && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={FileText}
                            onClick={() => void handleOpenTaskAttachment(act)}
                          >
                            <span className="truncate max-w-48">{act.archivo_nombre || 'Documento'}</span>
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Input de comentario */}
                <div className="relative space-y-2">
                  {taskMentionMenuOpen && filteredMentionUsers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-64 bg-surface border border-line rounded-control shadow-md overflow-hidden z-10">
                      {filteredMentionUsers.map((user, idx) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleInsertTaskMention(user.nombre)}
                          className={`w-full text-left px-3 py-1.5 text-xs transition flex items-center justify-between cursor-pointer ${
                            idx === selectedTaskMentionIndex ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink hover:bg-surface-muted'
                          }`}
                        >
                          <span>{user.nombre}</span>
                          <span className="t-micro uppercase text-ink-muted">{ROL_NOMBRE[user.rol] ?? user.rol}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={activityMessage}
                    onChange={(event) => handleActivityMessageChange(event.target.value)}
                    onKeyDown={handleTaskActivityKeyDown}
                    rows={2}
                    placeholder="Escribe un comentario (@ para mencionar)..."
                    className="hg-field w-full p-2.5 text-xs"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <label className="p-1.5 rounded-control border border-line text-ink-muted hover:text-ink hover:bg-surface-muted cursor-pointer transition" title="Adjuntar documento">
                        {uploadingTaskAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                        <input type="file" className="hidden" onChange={handleUploadTaskAttachment} disabled={uploadingTaskAttachment} />
                      </label>
                      <IconButton
                        icon={AtSign}
                        label="Mencionar usuario"
                        onClick={() => {
                          setTaskMentionMenuOpen((prev) => !prev);
                          setSelectedTaskMentionIndex(0);
                        }}
                      />
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      icon={Send}
                      disabled={sendingActivity || !activityMessage.trim()}
                      onClick={() => void handleAddTaskActivity()}
                    >
                      {sendingActivity ? 'Enviando…' : 'Comentar'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Dialog>
        );
      })()}
    </>
  );
}
