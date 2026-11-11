'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useBreadcrumb } from '../../../lib/context/BreadcrumbContext';
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
  ROL_NOMBRE,
  ROLES_ASIGNABLES,
  UserRole,
  OportunidadVenta,
} from '../../../lib/types';
import { mensajeError } from '../../../lib/errores';
import { completeRecordatorio } from '../../../lib/recordatorios';
import {
  ArrowLeft,
  Edit,
  Coins,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  ExternalLink,
  MoreHorizontal,
  Check,
  MessageSquare,
  Lock,
  Send,
  AlertCircle,
  UserRound,
  Link2,
  Circle,
  Hourglass,
} from 'lucide-react';
import { TODAS_COMUNAS_CHILE } from '../../../lib/chile-data';
import {
  RecordLayout,
  PropertyPanel,
  Panel,
  Button,
  IconButton,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  Select,
  Tone,
} from '../../../components/ui/crm';
import { useConfirm, useToast } from '../../../components/ui/feedback';
import { MetricCard } from '../../../components/ui/MetricCard';
import { DateInput } from '../../../components/ui/FormControls';

const DISPONIBILIDAD_LABELS: Record<EstadoDisponibilidad, string> = {
  disponible: 'Disponible',
  en_terreno: 'En terreno / obra',
  permiso: 'En permiso',
  licencia: 'Licencia médica',
  vacaciones: 'Vacaciones',
  falta: 'Falta / ausente',
};

const CATEGORIAS_DOCUMENTOS: { id: CategoriaDocumentoTrabajador; label: string }[] = [
  { id: 'contratos', label: 'Contratos' },
  { id: 'anexos', label: 'Anexos' },
  { id: 'liquidaciones', label: 'Liquidaciones de sueldo' },
  { id: 'comprobantes', label: 'Comprobantes de pago' },
  { id: 'licencias', label: 'Licencias médicas' },
  { id: 'certificados', label: 'Certificados & antecedentes' },
  { id: 'otros', label: 'Otros documentos' },
];

const PERMISO_TONE: Record<TipoPermisoAusencia, Tone> = {
  vacaciones: 'neutral',
  permiso: 'warning',
  licencia_medica: 'accent',
  falta_injustificada: 'danger',
  dia_administrativo: 'warning',
};

const URGENCIA_TONE: Record<UrgenciaRecordatorio, Tone> = {
  baja: 'neutral',
  media: 'info',
  alta: 'warning',
  critica: 'danger',
};

const ASISTENCIA_TONE: Record<EstadoAsistencia, Tone> = {
  presente: 'success',
  atraso: 'warning',
  salida_temprana: 'warning',
  en_terreno: 'info',
  ausente_justificado: 'neutral',
  ausente_injustificado: 'danger',
};

/** Menú ⋯ para elegir qué tipo de documentos mostrar. */
function DocumentosFiltroMenu({
  value,
  onChange,
  total,
  counts,
}: {
  value: string;
  onChange: (value: never) => void;
  total: number;
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const opciones: { id: string; label: string; count: number }[] = [
    { id: 'todas', label: 'Todos', count: total },
    ...CATEGORIAS_DOCUMENTOS.map((c) => ({ id: c.id, label: c.label, count: counts[c.id] ?? 0 })),
  ];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Elegir tipo de documentos"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid h-8 w-8 place-items-center rounded-lg border border-line-subtle bg-surface text-ink shadow-[var(--hg-shadow-card)] transition hover:bg-surface-muted"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 min-w-52 rounded-panel border border-line bg-surface p-1 shadow-[var(--hg-shadow-popover)]"
        >
          <div className="mb-1 border-b border-line-subtle px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted">
            Mostrar documentos de
          </div>
          {opciones.map((op) => (
            <button
              key={op.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === op.id}
              onClick={() => {
                onChange(op.id as never);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-control px-2.5 py-1.5 text-left text-xs font-medium text-ink transition hover:bg-surface-muted"
            >
              <span className="flex items-center gap-2">
                <span className="grid h-4 w-4 place-items-center">
                  {value === op.id && <Check size={14} className="text-accent-ink" aria-hidden />}
                </span>
                {op.label}
              </span>
              <span className="t-num text-ink-muted">{op.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrabajadorDetailPage() {
  const params = useParams();
  const workerId = params?.id as string;
  const { currentUser, addUser, refreshUsers } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [trabajador, setTrabajador] = useState<Trabajador | null>(null);
  const { setCustomTitle: setBreadcrumbTitle } = useBreadcrumb();
  useEffect(() => {
    setBreadcrumbTitle(trabajador?.nombre ?? null);
    return () => setBreadcrumbTitle(null);
  }, [trabajador?.nombre, setBreadcrumbTitle]);
  const [documentos, setDocumentos] = useState<TrabajadorDocumento[]>([]);
  const [permisos, setPermisos] = useState<TrabajadorPermisoAusencia[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<TrabajadorLiquidacion[]>([]);
  const [notas, setNotas] = useState<TrabajadorNota[]>([]);
  const [asistencias, setAsistencias] = useState<TrabajadorAsistencia[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [eventosAsociados, setEventosAsociados] = useState<EventoProduccionLogistica[]>([]);
  const [visitasAsociadas, setVisitasAsociadas] = useState<VisitaTerreno[]>([]);
  const [comisionesVentas, setComisionesVentas] = useState<OportunidadVenta[]>([]);
  const [liquidandoComisionId, setLiquidandoComisionId] = useState<string | null>(null);

  // Pestaña activa
  const [activeTab, setActiveTab] = useState<
    'documentos' | 'permisos' | 'liquidaciones' | 'comisiones' | 'recordatorios' | 'asistencia' | 'bitacora'
  >('documentos');
  const [categoriaDocFiltro, setCategoriaDocFiltro] = useState<string>('todas');

  // Modales
  const [showEditInfoModal, setShowEditInfoModal] = useState(false);
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [showNewPermisoModal, setShowNewPermisoModal] = useState(false);
  const [showNewLiquidacionModal, setShowNewLiquidacionModal] = useState(false);
  const [showNewRecordatorioModal, setShowNewRecordatorioModal] = useState(false);
  const [showNewAsistenciaModal, setShowNewAsistenciaModal] = useState(false);
  const [showLinkUserModal, setShowLinkUserModal] = useState(false);
  const [selectedLinkUserId, setSelectedLinkUserId] = useState<string>('');

  // Estados de guardado
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
  const loadWorkerFullData = useCallback(async () => {
    if (!workerId) return;

    try {
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

      const [docRes, permRes, liqRes, notRes, asistRes, usrsRes, evRes, visRes, recRes, opRes] =
        await Promise.all([
          supabase
            .from('trabajador_documentos')
            .select('*')
            .eq('trabajador_id', workerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('trabajador_permisos_ausencias')
            .select('*')
            .eq('trabajador_id', workerId)
            .order('fecha_inicio', { ascending: false }),
          supabase
            .from('trabajador_liquidaciones_sueldos')
            .select('*')
            .eq('trabajador_id', workerId)
            .order('anio', { ascending: false })
            .order('mes', { ascending: false }),
          supabase
            .from('trabajador_notas')
            .select('*, usuario:usuarios(*)')
            .eq('trabajador_id', workerId)
            .order('created_at', { ascending: false }),
          supabase
            .from('trabajador_asistencia')
            .select('*')
            .eq('trabajador_id', workerId)
            .order('fecha', { ascending: false }),
          supabase.from('usuarios').select('id, nombre, email, rol').order('nombre'),
          supabase
            .from('eventos_produccion_logistica')
            .select('*')
            .order('fecha_inicio', { ascending: false }),
          supabase
            .from('visitas_terreno')
            .select('*, oportunidad:oportunidades(*)')
            .order('created_at', { ascending: false }),
          w.usuario_id
            ? supabase
                .from('recordatorios')
                .select('*, asignado_a:usuarios!asignado_a_id(*), creado_por:usuarios!creado_por_id(*)')
                .eq('asignado_a_id', w.usuario_id)
                .eq('activo', true)
                .order('fecha_vencimiento', { ascending: true })
            : Promise.resolve({ data: [] }),
          supabase
            .from('oportunidades')
            .select('*, cliente:clientes(nombre, apellido_razon_social, rut)')
            // A lost opportunity earns no commission.
            .is('perdida_at', null)
            .order('created_at', { ascending: false }),
        ]);

      if (docRes.data) setDocumentos(docRes.data as TrabajadorDocumento[]);
      if (permRes.data) setPermisos(permRes.data as TrabajadorPermisoAusencia[]);
      if (liqRes.data) setLiquidaciones(liqRes.data as TrabajadorLiquidacion[]);
      if (notRes.data) setNotas(notRes.data as TrabajadorNota[]);
      if (asistRes.data) setAsistencias(asistRes.data as TrabajadorAsistencia[]);
      if (usrsRes.data) setUsuariosList(usrsRes.data as Usuario[]);
      if (recRes.data) setRecordatorios(recRes.data as Recordatorio[]);

      if (opRes?.data) {
        const allOps = opRes.data as OportunidadVenta[];
        const matchedOps = allOps.filter((op) => {
          if (
            w.usuario_id &&
            (op.asignado_a === w.usuario_id || op.responsable_operativo_id === w.usuario_id)
          ) {
            return true;
          }
          const matchedUser = (usrsRes.data as Usuario[])?.find((u) => u.id === op.asignado_a);
          if (matchedUser) {
            if (matchedUser.email && w.email && matchedUser.email.toLowerCase() === w.email.toLowerCase()) {
              return true;
            }
            if (matchedUser.nombre && w.nombre && matchedUser.nombre.toLowerCase().trim() === w.nombre.toLowerCase().trim()) {
              return true;
            }
          }
          return false;
        });
        setComisionesVentas(matchedOps);
      }

      if (evRes.data) {
        const evList = evRes.data as EventoProduccionLogistica[];
        const matchedEvs = evList.filter((e) => {
          if (
            w.usuario_id &&
            (e.responsable_id === w.usuario_id ||
              e.responsable_calendario_id === w.usuario_id ||
              e.registrado_por === w.usuario_id)
          ) {
            return true;
          }
          const nom = w.nombre.toLowerCase();
          return (
            (e.titulo || '').toLowerCase().includes(nom) ||
            (e.observaciones || '').toLowerCase().includes(nom)
          );
        });
        setEventosAsociados(matchedEvs);
      }

      if (visRes.data) {
        const visList = visRes.data as VisitaTerreno[];
        const matchedVis = visList.filter((v) => {
          if (
            w.usuario_id &&
            (v.tecnico_id === w.usuario_id || v.responsable_calendario_id === w.usuario_id)
          ) {
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
  }, [supabase, workerId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadWorkerFullData();
    }, 0);

    const channel = supabase
      .channel(`rrhh_worker_${workerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trabajadores', filter: `id=eq.${workerId}` },
        () => {
          void loadWorkerFullData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajador_documentos',
          filter: `trabajador_id=eq.${workerId}`,
        },
        () => {
          void loadWorkerFullData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajador_permisos_ausencias',
          filter: `trabajador_id=eq.${workerId}`,
        },
        () => {
          void loadWorkerFullData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajador_liquidaciones_sueldos',
          filter: `trabajador_id=eq.${workerId}`,
        },
        () => {
          void loadWorkerFullData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajador_notas',
          filter: `trabajador_id=eq.${workerId}`,
        },
        () => {
          void loadWorkerFullData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trabajador_asistencia',
          filter: `trabajador_id=eq.${workerId}`,
        },
        () => {
          void loadWorkerFullData();
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => {
        void loadWorkerFullData();
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadWorkerFullData, supabase, workerId]);

  // Crear una cuenta CRM nueva para este colaborador (el usuario recibe el código por correo)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState<{
    email: string;
    rol: UserRole;
    calVisitas: boolean;
    calProduccion: boolean;
    calReventa: boolean;
  }>({ email: '', rol: 'user', calVisitas: true, calProduccion: true, calReventa: true });

  const openCreateUser = () => {
    setCreateUserError(null);
    setNewUserForm({ email: trabajador?.email ?? '', rol: 'user', calVisitas: true, calProduccion: true, calReventa: true });
    setShowCreateUserModal(true);
  };

  const handleCreateUser = async () => {
    if (!trabajador) return;
    if (!trabajador.rut) {
      setCreateUserError('Agrega el RUT del colaborador antes de crear su cuenta CRM.');
      return;
    }
    const email = newUserForm.email.trim();
    if (!email || !email.includes('@')) {
      setCreateUserError('Ingresa un correo válido: ahí llegará el código para crear la contraseña.');
      return;
    }
    setCreatingUser(true);
    setCreateUserError(null);
    try {
      // El alta enlaza por correo: la ficha debe tener el mismo correo para no duplicar al colaborador.
      if ((trabajador.email ?? '').toLowerCase() !== email.toLowerCase()) {
        const { error: emailError } = await supabase
          .from('trabajadores')
          .update({ email, updated_at: new Date().toISOString() })
          .eq('id', trabajador.id);
        if (emailError) throw emailError;
      }

      await addUser({
        nombre: trabajador.nombre,
        email,
        rol: newUserForm.rol,
        activo: true,
        calendario_visitas: newUserForm.calVisitas,
        calendario_produccion: newUserForm.calProduccion,
        calendario_reventa: newUserForm.calReventa,
        rut: trabajador.rut,
      });

      const { data: createdUser } = await supabase
        .from('usuarios')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      // El alta automática cambia cargo y área; se conservan los de la ficha.
      await supabase
        .from('trabajadores')
        .update({
          usuario_id: createdUser?.id ?? null,
          cargo: trabajador.cargo,
          area: trabajador.area,
          updated_at: new Date().toISOString(),
        })
        .eq('id', trabajador.id);

      await refreshUsers();
      setShowCreateUserModal(false);
      toast({ message: `Cuenta creada. ${email} recibirá un código para definir su contraseña.`, tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      setCreateUserError(mensajeError(err, 'No se pudo crear la cuenta CRM.'));
    } finally {
      setCreatingUser(false);
    }
  };

  // Vincular o desvincular cuenta de usuario
  const handleLinkUser = async (newUsuarioId: string | null) => {
    if (!trabajador) return;
    const { error } = await supabase
      .from('trabajadores')
      .update({ usuario_id: newUsuarioId, updated_at: new Date().toISOString() })
      .eq('id', trabajador.id);

    if (error) {
      console.error('Error vinculando usuario:', error);
      toast({ message: 'No se pudo vincular la cuenta', tone: 'danger' });
    } else {
      setShowLinkUserModal(false);
      toast({
        message: newUsuarioId ? 'Usuario vinculado exitosamente' : 'Usuario desvinculado',
        tone: 'success',
      });
      void loadWorkerFullData();
    }
  };

  // Completar o reactivar Recordatorio
  const handleToggleRecordatorio = async (rec: Recordatorio) => {
    try {
      await completeRecordatorio(supabase, rec);
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error al actualizar recordatorio:', err);
      toast({ message: 'No se pudo actualizar la tarea', tone: 'danger' });
    }
  };

  // Guardar nuevo Recordatorio
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
      toast({ message: 'Tarea asignada exitosamente', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error creando recordatorio:', err);
      toast({ message: 'No se pudo crear la tarea', tone: 'danger' });
    } finally {
      setSavingRecordatorio(false);
    }
  };

  // Desactivar / Eliminar Recordatorio
  const handleDeleteRecordatorio = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar tarea',
      message: '¿Seguro que deseas eliminar esta tarea asignada al colaborador?',
      destructive: true,
      confirmLabel: 'Eliminar tarea',
    });
    if (!ok) return;

    const { error } = await supabase.from('recordatorios').update({ activo: false }).eq('id', id);
    if (error) {
      console.error(error);
      toast({ message: 'No se pudo eliminar la tarea', tone: 'danger' });
    } else {
      toast({ message: 'Tarea eliminada', tone: 'success' });
      void loadWorkerFullData();
    }
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
          hora_entrada: newAsistenciaData.hora_entrada
            ? `${newAsistenciaData.hora_entrada}:00`
            : null,
          hora_salida: newAsistenciaData.hora_salida
            ? `${newAsistenciaData.hora_salida}:00`
            : null,
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
      toast({ message: 'Marcaje de asistencia guardado', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error registrando asistencia:', err);
      toast({ message: 'No se pudo registrar la asistencia', tone: 'danger' });
    } finally {
      setSavingAsistencia(false);
    }
  };

  // Eliminar Marcaje de Asistencia
  const handleDeleteAsistencia = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar marcaje',
      message: '¿Seguro que deseas eliminar este registro de asistencia?',
      destructive: true,
      confirmLabel: 'Eliminar marcaje',
    });
    if (!ok) return;

    const { error } = await supabase.from('trabajador_asistencia').delete().eq('id', id);
    if (error) {
      console.error(error);
      toast({ message: 'No se pudo eliminar el marcaje', tone: 'danger' });
    } else {
      toast({ message: 'Marcaje eliminado', tone: 'success' });
      void loadWorkerFullData();
    }
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
      toast({ message: 'No se pudo actualizar la disponibilidad', tone: 'danger' });
      void loadWorkerFullData();
    } else {
      toast({
        message: `Disponibilidad actualizada a ${DISPONIBILIDAD_LABELS[nuevoEstado]}`,
        tone: 'success',
      });
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
      toast({ message: 'Ficha actualizada exitosamente', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando perfil:', err);
      toast({ message: 'No se pudo guardar la ficha', tone: 'danger' });
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
      toast({ message: 'Documento registrado exitosamente', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando documento:', err);
      toast({ message: 'No se pudo guardar el documento', tone: 'danger' });
      setSavingDoc(false);
    }
  };

  // Eliminar Documento
  const handleDeleteDocument = async (docId: string) => {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: '¿Estás seguro de que deseas eliminar este documento de la carpeta laboral?',
      destructive: true,
      confirmLabel: 'Eliminar documento',
    });
    if (!ok) return;

    try {
      await supabase.from('trabajador_documentos').delete().eq('id', docId);
      toast({ message: 'Documento eliminado', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error eliminando documento:', err);
      toast({ message: 'No se pudo eliminar el documento', tone: 'danger' });
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

      const today = new Date().toISOString().split('T')[0];
      if (today >= newPermisoData.fecha_inicio && today <= newPermisoData.fecha_fin) {
        let nuevoEst: EstadoDisponibilidad = 'permiso';
        if (newPermisoData.tipo === 'licencia_medica') nuevoEst = 'licencia';
        else if (newPermisoData.tipo === 'vacaciones') nuevoEst = 'vacaciones';
        else if (newPermisoData.tipo === 'falta_injustificada') nuevoEst = 'falta';

        await supabase
          .from('trabajadores')
          .update({ estado_disponibilidad: nuevoEst })
          .eq('id', trabajador.id);
      }

      setShowNewPermisoModal(false);
      setSavingPermiso(false);
      toast({ message: 'Permiso registrado exitosamente', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error registrando permiso:', err);
      toast({ message: 'No se pudo registrar el permiso', tone: 'danger' });
      setSavingPermiso(false);
    }
  };

  // Eliminar Permiso
  const handleDeletePermiso = async (permisoId: string) => {
    const ok = await confirm({
      title: 'Eliminar permiso',
      message: '¿Estás seguro de que deseas eliminar este registro de permiso o ausencia?',
      destructive: true,
      confirmLabel: 'Eliminar permiso',
    });
    if (!ok) return;

    try {
      await supabase.from('trabajador_permisos_ausencias').delete().eq('id', permisoId);
      toast({ message: 'Permiso eliminado', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error eliminando permiso:', err);
      toast({ message: 'No se pudo eliminar el permiso', tone: 'danger' });
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
      toast({ message: 'Liquidación de sueldo registrada', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando liquidación:', err);
      toast({ message: 'No se pudo guardar la liquidación', tone: 'danger' });
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
      toast({ message: 'Nota publicada en la bitácora', tone: 'success' });
      void loadWorkerFullData();
    } catch (err) {
      console.error('Error guardando nota:', err);
      toast({ message: 'No se pudo guardar la nota', tone: 'danger' });
      setSavingNota(false);
    }
  };

  // Liquidar Comisión de Oportunidad desde la Ficha del Trabajador
  const handleLiquidarComisionEnPerfil = async (op: OportunidadVenta) => {
    const pct = typeof op.comision_porcentaje === 'number' && op.comision_porcentaje >= 0 ? op.comision_porcentaje : 3;
    const comisionEstimada =
      typeof op.comision_monto === 'number' && op.comision_monto >= 0
        ? op.comision_monto
        : Math.round(((op.monto_estimado || 0) * pct) / 100);

    const ok = await confirm({
      title: 'Liquidar comisión de venta',
      message: `¿Confirmas liquidar y marcar como pagada la comisión de $${comisionEstimada.toLocaleString('es-CL')} para la oportunidad "${op.titulo || op.codigo || op.id}"? Esta acción registrará el pago bajo tu cuenta.`,
      confirmLabel: 'Confirmar pago',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      setLiquidandoComisionId(op.id);
      const { error } = await supabase.rpc('marcar_comision_pagada', {
        p_oportunidad_id: op.id,
      });
      if (error) throw error;
      toast({ message: 'Comisión liquidada y marcada como pagada exitosamente.', tone: 'success' });
      await loadWorkerFullData();
    } catch (err: unknown) {
      console.error('Error liquidando comisión:', err);
      toast({ message: (err as Error)?.message || 'No se pudo liquidar la comisión.', tone: 'danger' });
    } finally {
      setLiquidandoComisionId(null);
    }
  };

  // Filtrado de documentos por subcategoría
  const filteredDocs = useMemo(() => {
    if (categoriaDocFiltro === 'todas') return documentos;
    return documentos.filter((d) => d.categoria === categoriaDocFiltro);
  }, [documentos, categoriaDocFiltro]);

  // Resumen anual de permisos
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
    return {
      anioActual,
      total: permisosAnio.length,
      diasAusente,
      vacaciones,
      licencias,
      particulares,
    };
  }, [permisos]);

  // Resumen anual de liquidaciones
  const resumenLiquidaciones = useMemo(() => {
    const anioActual = new Date().getFullYear();
    const liqsAnio = liquidaciones.filter((l) => l.anio === anioActual);
    const totalLiquido = liqsAnio.reduce((acc, l) => acc + Number(l.monto_liquido || 0), 0);
    const totalBonos = liqsAnio.reduce((acc, l) => acc + Number(l.bonos || 0), 0);
    const totalDescuentos = liqsAnio.reduce((acc, l) => acc + Number(l.descuentos || 0), 0);
    const pagadas = liqsAnio.filter((l) => l.estado_pago === 'pagado').length;
    return {
      anioActual,
      total: liqsAnio.length,
      totalLiquido,
      totalBonos,
      totalDescuentos,
      pagadas,
    };
  }, [liquidaciones]);

  // Métricas de tareas / recordatorios
  const statsRecordatorios = useMemo(() => {
    const total = recordatorios.length;
    const pendientes = recordatorios.filter((r) => !r.completado).length;
    const completadas = recordatorios.filter((r) => r.completado).length;
    const hoy = new Date().toISOString().split('T')[0];
    const vencidas = recordatorios.filter(
      (r) => !r.completado && r.fecha_vencimiento < hoy
    ).length;
    const criticas = recordatorios.filter(
      (r) => !r.completado && ['alta', 'critica'].includes(r.urgencia)
    ).length;
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

  // Métricas de comisiones comerciales
  const statsComisiones = useMemo(() => {
    const totalVentas = comisionesVentas.length;
    let montoTotalVentas = 0;
    let comisionTotal = 0;
    let comisionPendiente = 0;
    let comisionListaPago = 0;
    let comisionPagada = 0;
    let countPendiente = 0;
    let countListaPago = 0;
    let countPagada = 0;

    for (const op of comisionesVentas) {
      const montoEstimado = Number(op.monto_estimado || 0);
      montoTotalVentas += montoEstimado;
      const pct = typeof op.comision_porcentaje === 'number' && op.comision_porcentaje >= 0 ? op.comision_porcentaje : 3;
      const comision =
        typeof op.comision_monto === 'number' && op.comision_monto >= 0
          ? op.comision_monto
          : Math.round((montoEstimado * pct) / 100);

      comisionTotal += comision;
      const estado = op.comision_estado || 'pendiente';
      if (estado === 'pagada') {
        comisionPagada += comision;
        countPagada += 1;
      } else if (estado === 'lista_para_pago') {
        comisionListaPago += comision;
        countListaPago += 1;
      } else {
        comisionPendiente += comision;
        countPendiente += 1;
      }
    }

    return {
      totalVentas,
      montoTotalVentas,
      comisionTotal,
      comisionPendiente,
      comisionListaPago,
      comisionPagada,
      countPendiente,
      countListaPago,
      countPagada,
    };
  }, [comisionesVentas]);

  const canManageComisiones = currentUser?.rol === 'admin';

  // Usuario vinculado en el CRM
  const linkedUsuario = useMemo(() => {
    if (!trabajador?.usuario_id) return null;
    return usuariosList.find((u) => u.id === trabajador.usuario_id) || null;
  }, [trabajador, usuariosList]);

  if (loading) {
    return (
      <Panel className="p-12 text-center text-ink-muted">
        Cargando ficha del colaborador...
      </Panel>
    );
  }

  if (!trabajador) {
    return (
      <Panel className="p-12 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertCircle size={24} aria-hidden />
        </div>
        <h2 className="t-section">Colaborador no encontrado</h2>
        <Link href="/rrhh">
          <Button variant="primary" icon={ArrowLeft}>
            Volver al directorio de recursos humanos
          </Button>
        </Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {/* 2. RECORD LAYOUT CON 3 COLUMNAS */}
      <RecordLayout
        sidebar={
          <div className="space-y-4">
            {/* Panel Principal de Perfil */}
            <Panel>
              <div className="p-4 space-y-4">
                <Link
                  href="/rrhh"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
                >
                  <ArrowLeft size={15} aria-hidden />
                  <span>Volver</span>
                </Link>

                <div className="flex flex-col items-center text-center space-y-2">
                  <div
                    aria-hidden
                    className="grid h-16 w-16 place-items-center rounded-full border border-accent-line bg-accent-soft text-xl font-semibold text-accent-ink select-none"
                  >
                    <UserRound size={30} aria-hidden />
                  </div>
                  <div className="min-w-0 max-w-full">
                    <h2 className="t-section text-ink truncate">{trabajador.nombre}</h2>
                    <p className="t-caption text-ink-muted truncate">
                      {[trabajador.cargo, trabajador.area].filter(Boolean).join(' · ') || 'Sin cargo'}
                    </p>
                    <div className="mt-1">
                      <CodeStamp title={`RUT: ${trabajador.rut}`}>{trabajador.rut || 'Sin RUT'}</CodeStamp>
                    </div>
                  </div>
                </div>

                {/* Acciones rápidas */}
                <div className="grid grid-cols-4 gap-1 text-center">
                  {[
                    { label: 'Permiso', icon: Clock, onClick: () => setShowNewPermisoModal(true) },
                    { label: 'Documento', icon: FileText, onClick: () => setShowNewDocModal(true) },
                    { label: 'Nota', icon: MessageSquare, onClick: () => setActiveTab('bitacora') },
                    { label: 'Editar', icon: Edit, onClick: () => setShowEditInfoModal(true) },
                  ].map(({ label, icon: Icon, onClick }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={onClick}
                      className="group flex flex-col items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition-colors group-hover:bg-surface-muted">
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="t-micro font-semibold">{label}</span>
                    </button>
                  ))}
                </div>

                <div className="-mx-4 border-t border-line-subtle" />

                <div className="space-y-1 text-xs">
                  <span className="t-caption text-ink-muted block">Disponibilidad</span>
                  <Select
                    value={trabajador.estado_disponibilidad}
                    onChange={(e) =>
                      void handleUpdateDisponibilidad(e.target.value as EstadoDisponibilidad)
                    }
                    className="hg-field-compact w-full"
                  >
                    {Object.entries(DISPONIBILIDAD_LABELS).map(([estado, label]) => (
                      <option key={estado} value={estado}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Panel>

            {/* Información de Contacto */}
            <PropertyPanel title="Información de contacto">
              <div>
                <span className="t-caption block text-ink-muted">Teléfono</span>
                <span className="font-medium text-ink">{trabajador.telefono || 'No registrado'}</span>
              </div>
              <div>
                <span className="t-caption block text-ink-muted">Correo electrónico</span>
                <span className="font-medium text-ink truncate block">
                  {trabajador.email || 'No registrado'}
                </span>
              </div>
              <div>
                <span className="t-caption block text-ink-muted">Dirección</span>
                <span className="font-medium text-ink">{trabajador.direccion || 'No registrada'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="t-caption block text-ink-muted">Comuna</span>
                  <span className="font-medium text-ink">{trabajador.comuna || 'Sin comuna'}</span>
                </div>
                <div>
                  <span className="t-caption block text-ink-muted">Región</span>
                  <span className="font-medium text-ink truncate block">
                    {trabajador.region || 'Metropolitana'}
                  </span>
                </div>
              </div>
              <div className="border-t border-line-subtle pt-2">
                <span className="t-caption block text-ink-muted">Contacto de emergencia</span>
                <span className="font-medium text-danger block">
                  {trabajador.contacto_emergencia_nombre || 'Sin contacto'}
                </span>
                {trabajador.contacto_emergencia_telefono && (
                  <span className="t-caption font-mono text-ink-muted">
                    {trabajador.contacto_emergencia_telefono}
                  </span>
                )}
              </div>
            </PropertyPanel>

            {/* Datos Bancarios & Sueldo */}
            <PropertyPanel title="Datos bancarios & sueldo">
              <div className="flex items-center justify-between">
                <span className="t-caption text-ink-muted">Sueldo base pactado</span>
                <span className="t-num font-semibold text-accent-ink">
                  ${Number(trabajador.sueldo_base || 0).toLocaleString('es-CL')}
                </span>
              </div>
              <div>
                <span className="t-caption block text-ink-muted">Banco</span>
                <span className="font-medium text-ink">{trabajador.banco || 'No especificado'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="t-caption block text-ink-muted">Tipo cuenta</span>
                  <span className="font-medium text-ink">
                    {trabajador.tipo_cuenta || 'Cuenta Vista'}
                  </span>
                </div>
                <div>
                  <span className="t-caption block text-ink-muted">N° de cuenta</span>
                  <span className="font-mono text-ink text-xs">
                    {trabajador.numero_cuenta || 'Sin número'}
                  </span>
                </div>
              </div>
              <div>
                <span className="t-caption block text-ink-muted">Fecha de ingreso</span>
                <span className="font-medium text-ink">
                  {trabajador.fecha_ingreso || 'No registrada'}
                </span>
              </div>
            </PropertyPanel>
          </div>
        }
        aside={
          <div className="space-y-4">
            {/* Tarjeta Cuenta de Usuario CRM */}
            <PropertyPanel title="Cuenta CRM">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Estado</span>
                <StatusBadge tone={linkedUsuario ? 'success' : 'neutral'}>
                  {linkedUsuario ? 'Vinculado' : 'Sin cuenta'}
                </StatusBadge>
              </div>

              {linkedUsuario ? (
                <div className="space-y-3 pt-1">
                  <div className="rounded-control border border-line-subtle bg-surface-muted p-2.5 space-y-1">
                    <span className="font-semibold text-ink block truncate">
                      {linkedUsuario.nombre}
                    </span>
                    <span className="t-caption font-mono text-ink-muted block truncate">
                      {linkedUsuario.email}
                    </span>
                    <div className="pt-1 flex items-center gap-1.5">
                      <StatusBadge tone="info" icon={false}>
                        {ROL_NOMBRE[linkedUsuario.rol] ?? linkedUsuario.rol}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedLinkUserId(linkedUsuario.id);
                        setShowLinkUserModal(true);
                      }}
                    >
                      Cambiar usuario
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleLinkUser(null)}
                    >
                      Desvincular
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <p className="t-caption text-ink-muted">
                    Sin acceso al CRM. Crea su usuario (recibirá un código por correo) o vincula uno existente.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    <Button variant="primary" size="sm" icon={Plus} className="w-full" onClick={openCreateUser}>
                      Crear usuario
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Link2}
                      className="w-full"
                      onClick={() => {
                        setSelectedLinkUserId('');
                        setShowLinkUserModal(true);
                      }}
                    >
                      Vincular existente
                    </Button>
                  </div>
                </div>
              )}
            </PropertyPanel>

            {/* Asignaciones en Faenas & Producción */}
            <PropertyPanel title="Obras & Faenas">
              <div className="flex items-center justify-between">
                <span className="t-caption text-ink-muted">Eventos asignados</span>
                <span className="hg-list-count">{eventosAsociados.length}</span>
              </div>
              {eventosAsociados.length === 0 ? (
                <p className="t-caption text-ink-muted italic py-1">
                  Sin eventos asignados actualmente.
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {eventosAsociados.slice(0, 4).map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-control border border-line-subtle bg-surface-muted p-2.5 space-y-1"
                    >
                      <span className="font-semibold text-ink block truncate">{ev.titulo}</span>
                      <div className="flex items-center justify-between t-caption text-ink-muted">
                        <span className="font-mono tabular-nums">{ev.fecha_inicio?.split('T')[0]}</span>
                        <span className="capitalize font-medium">{ev.tipo_evento}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PropertyPanel>

            {/* Visitas a Terreno */}
            <PropertyPanel title="Visitas a Terreno">
              <div className="flex items-center justify-between">
                <span className="t-caption text-ink-muted">Visitas técnicas</span>
                <span className="hg-list-count">{visitasAsociadas.length}</span>
              </div>
              {visitasAsociadas.length === 0 ? (
                <p className="t-caption text-ink-muted italic py-1">
                  Sin visitas técnicas registradas.
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  {visitasAsociadas.slice(0, 4).map((vis) => (
                    <div
                      key={vis.id}
                      className="rounded-control border border-info-line bg-info-soft p-2.5 space-y-1"
                    >
                      <span className="font-semibold text-ink block truncate">
                        {vis.oportunidad?.titulo || 'Visita a terreno'}
                      </span>
                      <div className="flex items-center justify-between t-caption text-ink-muted">
                        <span className="font-mono tabular-nums">{vis.fecha_visita_terreno}</span>
                        <StatusBadge tone="info">{vis.estado_visita || 'programada'}</StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PropertyPanel>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Barra de Pestañas */}
          <div role="tablist" aria-label="Secciones del colaborador" className="flex w-full items-center gap-0.5 rounded-xl bg-surface-muted p-1">
            {(
              [
                { id: 'documentos', label: 'Carpetas', count: documentos.length },
                { id: 'permisos', label: 'Permisos', count: permisos.length },
                { id: 'liquidaciones', label: 'Sueldos', count: liquidaciones.length },
                {
                  id: 'comisiones',
                  label: 'Comisiones',
                  count: statsComisiones.countListaPago > 0 ? statsComisiones.countListaPago : comisionesVentas.length,
                },
                { id: 'recordatorios', label: 'Tareas', count: statsRecordatorios.pendientes },
                { id: 'asistencia', label: 'Asistencia', count: statsAsistencia.total },
                { id: 'bitacora', label: 'Bitácora', count: notas.length },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                  <span className="t-num text-[11px] font-medium text-ink-muted">{tab.count}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: CARPETAS DE DOCUMENTOS */}
          {activeTab === 'documentos' && (
            <Panel
              title={
                categoriaDocFiltro === 'todas'
                  ? 'Documentos'
                  : `Documentos · ${CATEGORIAS_DOCUMENTOS.find((c) => c.id === categoriaDocFiltro)?.label ?? ''}`
              }
              actions={
                <>
                  <DocumentosFiltroMenu
                    value={categoriaDocFiltro}
                    onChange={setCategoriaDocFiltro}
                    total={documentos.length}
                    counts={Object.fromEntries(
                      CATEGORIAS_DOCUMENTOS.map((c) => [c.id, documentos.filter((d) => d.categoria === c.id).length])
                    )}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => setShowNewDocModal(true)}
                  >
                    Subir documento
                  </Button>
                </>
              }
              className="p-4 space-y-4"
            >
              {/* Lista de Documentos */}
              {filteredDocs.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic border border-dashed border-line-subtle rounded-panel">
                  No hay documentos subidos en esta carpeta.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-control border border-line-subtle bg-surface hover:bg-surface-muted transition-colors flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink font-semibold">
                          <FileText size={16} aria-hidden />
                        </div>
                        <div className="truncate">
                          <span className="font-semibold text-ink block truncate">
                            {doc.nombre_archivo}
                          </span>
                          <span className="t-caption text-ink-muted block capitalize">
                            {doc.categoria} · {doc.fecha_emision || 'Sin fecha'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {doc.url && doc.url !== '#' && (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Ver o descargar archivo"
                            className="inline-grid h-8 w-8 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                          >
                            <ExternalLink size={15} aria-hidden />
                          </a>
                        )}
                        <IconButton
                          icon={Trash2}
                          label="Eliminar documento"
                          onClick={() => void handleDeleteDocument(doc.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* TAB 2: PERMISOS Y AUSENCIAS */}
          {activeTab === 'permisos' && (
            <Panel
              title="Permisos, Licencias y Vacaciones"
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setShowNewPermisoModal(true)}
                >
                  Registrar permiso
                </Button>
              }
              className="p-4 space-y-4"
            >
              {/* Resumen Anual */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Total solicitudes</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {resumenPermisos.total}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">
                    Días ausente {resumenPermisos.anioActual}
                  </span>
                  <span className="t-num text-lg font-semibold text-accent-ink">
                    {resumenPermisos.diasAusente}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Vacaciones</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {resumenPermisos.vacaciones}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Licencias</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {resumenPermisos.licencias}
                  </span>
                </div>
              </div>

              {permisos.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic border border-dashed border-line-subtle rounded-panel">
                  El colaborador no tiene permisos ni ausencias registradas.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {permisos.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-control border border-line-subtle bg-surface space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={PERMISO_TONE[p.tipo]}>
                            {p.tipo.replace('_', ' ')}
                          </StatusBadge>
                          <span className="t-caption text-ink-muted">({p.estado})</span>
                        </div>
                        <IconButton
                          icon={Trash2}
                          label="Eliminar permiso"
                          onClick={() => void handleDeletePermiso(p.id)}
                        />
                      </div>

                      <div className="flex items-center gap-4 text-ink-muted font-mono tabular-nums text-xs">
                        <span>
                          Desde: <strong className="text-ink">{p.fecha_inicio}</strong>
                        </span>
                        <span>
                          Hasta: <strong className="text-ink">{p.fecha_fin}</strong>
                        </span>
                      </div>

                      {p.motivo && (
                        <p className="t-caption text-ink bg-surface-muted p-2 rounded-control border border-line-subtle italic">
                          &quot;{p.motivo}&quot;
                        </p>
                      )}

                      {p.bloquea_calendario && (
                        <div className="flex items-center gap-1.5 t-micro text-warning font-semibold">
                          <Lock size={12} aria-hidden />
                          <span>Bloquea disponibilidad en calendario de faenas</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* TAB 3: SUELDOS Y LIQUIDACIONES */}
          {activeTab === 'liquidaciones' && (
            <Panel
              title="Historial de Sueldos & Liquidaciones"
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setShowNewLiquidacionModal(true)}
                >
                  Registrar liquidación
                </Button>
              }
              className="p-4 space-y-4"
            >
              {/* Resumen Anual Sueldos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">
                    Líquido {resumenLiquidaciones.anioActual}
                  </span>
                  <span className="t-num text-sm font-semibold text-success">
                    ${resumenLiquidaciones.totalLiquido.toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Bonos totales</span>
                  <span className="t-num text-sm font-semibold text-ink">
                    ${resumenLiquidaciones.totalBonos.toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Descuentos</span>
                  <span className="t-num text-sm font-semibold text-ink">
                    ${resumenLiquidaciones.totalDescuentos.toLocaleString('es-CL')}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Liquidaciones</span>
                  <span className="t-num text-sm font-semibold text-ink">
                    {resumenLiquidaciones.pagadas} / {resumenLiquidaciones.total}
                  </span>
                </div>
              </div>

              {liquidaciones.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic border border-dashed border-line-subtle rounded-panel">
                  No hay liquidaciones de sueldo registradas aún.
                </div>
              ) : (
                <div className="space-y-2">
                  {liquidaciones.map((l) => (
                    <div
                      key={l.id}
                      className="p-3 rounded-control border border-line-subtle bg-surface flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-ink block">
                          Período: {l.mes}/{l.anio}
                        </span>
                        <span className="t-caption text-ink-muted">
                          Base: ${l.monto_sueldo_base.toLocaleString('es-CL')} | Bonos: $
                          {l.bonos.toLocaleString('es-CL')} | Desc: $
                          {l.descuentos.toLocaleString('es-CL')}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="t-num font-semibold text-success block text-sm">
                          ${l.monto_liquido.toLocaleString('es-CL')}
                        </span>
                        <StatusBadge
                          tone={l.estado_pago === 'pagado' ? 'success' : 'warning'}
                          icon={false}
                        >
                          {l.estado_pago}
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* TAB: COMISIONES COMERCIALES */}
          {activeTab === 'comisiones' && (
            <Panel
              title="Comisiones Comerciales"
              actions={
                <Link
                  href="/comisiones"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
                >
                  Ver todas las comisiones
                  <ExternalLink size={12} aria-hidden />
                </Link>
              }
              className="p-4 space-y-4"
            >
              {/* KPIs de comisiones: dos filas de dos */}
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  title="Comisión proyectada"
                  value={`$${statsComisiones.comisionTotal.toLocaleString('es-CL')}`}
                  icon={Coins}
                  tone="info"
                  subtitle={`${statsComisiones.totalVentas} ${statsComisiones.totalVentas === 1 ? 'oportunidad' : 'oportunidades'}`}
                />
                <MetricCard
                  title="Listas para pago"
                  value={`$${statsComisiones.comisionListaPago.toLocaleString('es-CL')}`}
                  icon={Clock}
                  tone="warning"
                  subtitle={`${statsComisiones.countListaPago} por liquidar`}
                />
                <MetricCard
                  title="Pagadas"
                  value={`$${statsComisiones.comisionPagada.toLocaleString('es-CL')}`}
                  icon={CheckCircle2}
                  tone="success"
                  subtitle={`${statsComisiones.countPagada} liquidadas`}
                />
                <MetricCard
                  title="Pendientes"
                  value={`$${statsComisiones.comisionPendiente.toLocaleString('es-CL')}`}
                  icon={Hourglass}
                  tone="neutral"
                  subtitle={`${statsComisiones.countPendiente} en proceso`}
                />
              </div>

              {/* Banner de aviso si no tiene usuario CRM vinculado */}
              {!trabajador.usuario_id && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-panel border border-warning/30 bg-warning-soft text-xs text-warning">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      Este colaborador aún no está vinculado a un usuario del sistema CRM. Vincula
                      su cuenta para asociar automáticamente las ventas a su perfil.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Link2}
                    onClick={() => setShowLinkUserModal(true)}
                  >
                    Vincular usuario
                  </Button>
                </div>
              )}

              {/* Lista de comisiones / oportunidades */}
              {comisionesVentas.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic">
                  No hay ventas ni comisiones registradas para este colaborador.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-control border border-line-subtle">
                  <table className="hg-table min-w-max whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>Oportunidad de venta</th>
                        <th>Monto</th>
                        <th>Comisión</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comisionesVentas.map((op) => {
                        const pct =
                          typeof op.comision_porcentaje === 'number' && op.comision_porcentaje >= 0
                            ? op.comision_porcentaje
                            : 3;
                        const montoComision =
                          typeof op.comision_monto === 'number' && op.comision_monto >= 0
                            ? op.comision_monto
                            : Math.round(((op.monto_estimado || 0) * pct) / 100);
                        const estado = op.comision_estado || 'pendiente';
                        const tone: Tone =
                          estado === 'pagada' ? 'success' : estado === 'lista_para_pago' ? 'warning' : 'neutral';
                        const isLiquidando = liquidandoComisionId === op.id;

                        return (
                          <tr key={op.id}>
                            <td>
                              <Link
                                href={`/ventas?oportunidad=${op.id}`}
                                className="font-semibold text-ink hover:text-accent-ink hover:underline"
                              >
                                {op.codigo || op.id.slice(0, 8)}
                              </Link>
                            </td>
                            <td className="t-num text-ink">
                              ${Number(op.monto_estimado || 0).toLocaleString('es-CL')}
                            </td>
                            <td>
                              <span className="t-num font-semibold text-ink">${montoComision.toLocaleString('es-CL')}</span>
                              <span className="t-caption block text-ink-muted">{pct}%</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <StatusBadge tone={tone} icon={false}>
                                  {estado === 'lista_para_pago' ? 'Lista para pago' : estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                                </StatusBadge>
                                {estado === 'lista_para_pago' && canManageComisiones && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    icon={Coins}
                                    disabled={isLiquidando}
                                    onClick={() => void handleLiquidarComisionEnPerfil(op)}
                                  >
                                    {isLiquidando ? 'Pagando...' : 'Liquidar'}
                                  </Button>
                                )}
                              </div>
                              {estado === 'pagada' && op.comision_fecha_pago && (
                                <span className="t-caption t-num block text-ink-muted">
                                  {op.comision_fecha_pago.split('T')[0]}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* TAB 4: RECORDATORIOS Y TAREAS */}
          {activeTab === 'recordatorios' && (
            <Panel
              title="Recordatorios & Tareas Asignadas"
              actions={
                trabajador.usuario_id && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => setShowNewRecordatorioModal(true)}
                  >
                    Nueva tarea
                  </Button>
                )
              }
              className="p-4 space-y-4"
            >
              {/* Tarjetas KPI de Tareas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Pendientes</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {statsRecordatorios.pendientes}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Completadas</span>
                  <span className="t-num text-lg font-semibold text-success">
                    {statsRecordatorios.completadas}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Vencidas</span>
                  <span className="t-num text-lg font-semibold text-danger">
                    {statsRecordatorios.vencidas}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Alta / Crítica</span>
                  <span className="t-num text-lg font-semibold text-warning">
                    {statsRecordatorios.criticas}
                  </span>
                </div>
              </div>

              {!trabajador.usuario_id ? (
                <div className="p-4 rounded-panel border border-warning-line bg-warning-soft text-warning space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <AlertTriangle size={16} aria-hidden />
                    <span>Colaborador sin cuenta de usuario CRM vinculada</span>
                  </div>
                  <p className="t-caption text-ink leading-relaxed">
                    Para asignarle recordatorios, tareas operativas y notificaciones en el CRM, vincula su cuenta en la columna derecha.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Link2}
                    onClick={() => setShowLinkUserModal(true)}
                  >
                    Vincular cuenta de usuario ahora
                  </Button>
                </div>
              ) : recordatorios.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic border border-dashed border-line-subtle rounded-panel">
                  No hay tareas ni recordatorios pendientes para este colaborador.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recordatorios.map((rec) => {
                    const esVencido =
                      !rec.completado &&
                      rec.fecha_vencimiento < new Date().toISOString().split('T')[0];
                    return (
                      <div
                        key={rec.id}
                        className={`p-3.5 rounded-control border transition-colors space-y-2 text-xs ${
                          rec.completado
                            ? 'border-line-subtle bg-surface-muted opacity-60'
                            : esVencido
                            ? 'border-danger-line bg-danger-soft'
                            : 'border-line-subtle bg-surface'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={() => void handleToggleRecordatorio(rec)}
                              className="mt-0.5 text-ink-muted transition-colors hover:text-accent-ink"
                              title={
                                rec.completado
                                  ? 'Marcar como pendiente'
                                  : 'Marcar como completada'
                              }
                            >
                              {rec.completado ? (
                                <CheckCircle2 size={16} className="text-success" aria-hidden />
                              ) : (
                                <Circle size={16} aria-hidden />
                              )}
                            </button>
                            <div>
                              <span
                                className={`font-semibold block ${
                                  rec.completado ? 'line-through text-ink-muted' : 'text-ink'
                                }`}
                              >
                                {rec.titulo}
                              </span>
                              {rec.descripcion && (
                                <p className="t-caption text-ink-muted mt-0.5">{rec.descripcion}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <StatusBadge tone={URGENCIA_TONE[rec.urgencia]}>
                              {rec.urgencia}
                            </StatusBadge>
                            <IconButton
                              icon={Trash2}
                              label="Eliminar tarea"
                              onClick={() => void handleDeleteRecordatorio(rec.id)}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-line-subtle t-caption text-ink-muted">
                          <span className="font-mono tabular-nums">
                            Vence: <strong className={esVencido ? 'text-danger' : 'text-ink'}>{rec.fecha_vencimiento}</strong>
                          </span>
                          <span className="capitalize">{rec.seccion.replace('_', ' ')}</span>
                          {rec.recurrencia && rec.recurrencia !== 'ninguna' && (
                            <span className="text-accent-ink font-semibold">
                              ↻ Recurrencia {rec.recurrencia}
                            </span>
                          )}
                          {rec.completado && (
                            <span className="text-success font-semibold">✓ Completada</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {/* TAB 5: ASISTENCIA Y JORNADA */}
          {activeTab === 'asistencia' && (
            <Panel
              title="Control de Asistencia & Jornada"
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setShowNewAsistenciaModal(true)}
                >
                  Nuevo marcaje
                </Button>
              }
              className="p-4 space-y-4"
            >
              {/* Métricas de Asistencia */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Puntualidad</span>
                  <span className="t-num text-lg font-semibold text-success">
                    {statsAsistencia.puntualidad}%
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Presente</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {statsAsistencia.presentes}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Atrasos</span>
                  <span className="t-num text-lg font-semibold text-warning">
                    {statsAsistencia.atrasos}
                  </span>
                </div>
                <div className="p-3 rounded-panel border border-line-subtle bg-surface-muted">
                  <span className="t-caption block text-ink-muted">Minutos atraso</span>
                  <span className="t-num text-lg font-semibold text-ink">
                    {statsAsistencia.minutosAtraso} min
                  </span>
                </div>
              </div>

              {/* Lista de Registros */}
              {asistencias.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic border border-dashed border-line-subtle rounded-panel">
                  No hay marcajes de asistencia registrados para este colaborador.
                </div>
              ) : (
                <div className="space-y-2">
                  {asistencias.map((asist) => (
                    <div
                      key={asist.id}
                      className="p-3 rounded-control border border-line-subtle bg-surface flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{asist.fecha}</span>
                          <StatusBadge tone={ASISTENCIA_TONE[asist.estado]}>
                            {asist.estado.replace('_', ' ')}
                          </StatusBadge>
                          <span className="t-caption text-ink-muted font-mono capitalize">
                            ({asist.origen})
                          </span>
                        </div>
                        <div className="t-caption text-ink-muted font-mono tabular-nums flex items-center gap-3">
                          <span>
                            Entrada:{' '}
                            <strong className="text-ink">
                              {asist.hora_entrada ? asist.hora_entrada.slice(0, 5) : '--:--'}
                            </strong>
                          </span>
                          <span>
                            Salida:{' '}
                            <strong className="text-ink">
                              {asist.hora_salida ? asist.hora_salida.slice(0, 5) : '--:--'}
                            </strong>
                          </span>
                          {(asist.minutos_atraso || 0) > 0 && (
                            <span className="text-warning font-semibold">
                              +{asist.minutos_atraso} min atraso
                            </span>
                          )}
                        </div>
                        {asist.observaciones && (
                          <p className="t-caption text-ink-muted italic">
                            &quot;{asist.observaciones}&quot;
                          </p>
                        )}
                      </div>

                      <IconButton
                        icon={Trash2}
                        label="Eliminar registro"
                        onClick={() => void handleDeleteAsistencia(asist.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* TAB 6: BITÁCORA Y NOTAS INTERNAS */}
          {activeTab === 'bitacora' && (
            <Panel title="Bitácora de Recursos Humanos" className="p-4 space-y-4">
              {/* Formulario Agregar Nota */}
              <form
                onSubmit={(e) => void handleSaveNota(e)}
                className="space-y-3 rounded-panel border border-line-subtle bg-surface-muted p-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="font-semibold text-ink">Nueva entrada en bitácora:</label>
                  <Select
                    value={newNotaTipo}
                    onChange={(e) =>
                      setNewNotaTipo(
                        e.target.value as 'nota' | 'felicitacion' | 'amonestacion' | 'evaluacion'
                      )
                    }
                    className="text-xs"
                  >
                    <option value="nota">Nota general</option>
                    <option value="felicitacion">Felicitación</option>
                    <option value="amonestacion">Amonestación</option>
                    <option value="evaluacion">Evaluación desempeño</option>
                  </Select>
                </div>

                <textarea
                  rows={3}
                  required
                  placeholder="Escribe aquí las observaciones o registro interno de RR.HH..."
                  value={newNotaText}
                  onChange={(e) => setNewNotaText(e.target.value)}
                  className="hg-field p-3"
                />

                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Send}
                    type="submit"
                    disabled={savingNota || !newNotaText.trim()}
                  >
                    {savingNota ? 'Guardando...' : 'Publicar en bitácora'}
                  </Button>
                </div>
              </form>

              {/* Lista de Notas */}
              {notas.length === 0 ? (
                <div className="p-8 text-center text-ink-muted t-caption italic">
                  No hay registros en la bitácora para este colaborador.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notas.map((n) => (
                    <div
                      key={n.id}
                      className="p-3.5 rounded-control border border-line-subtle bg-surface space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">
                            {n.usuario?.nombre || 'Administración'}
                          </span>
                          <StatusBadge tone="neutral" icon={false}>
                            {n.tipo}
                          </StatusBadge>
                        </div>
                        <span className="t-caption font-mono text-ink-muted">
                          {n.created_at?.split('T')[0]}
                        </span>
                      </div>
                      <p className="text-ink whitespace-pre-wrap">{n.contenido}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      </RecordLayout>

      {/* DIALOG 1: EDITAR PERFIL */}
      <Dialog
        open={showEditInfoModal}
        title="Editar ficha del colaborador"
        description="Actualizar datos personales, contractuales y bancarios."
        size="lg"
        onClose={() => setShowEditInfoModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowEditInfoModal(false)}
              disabled={savingEdit}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveEditProfile(e)}
              disabled={savingEdit}
            >
              {savingEdit ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSaveEditProfile(e)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre completo" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  required
                  value={editFormData.nombre}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, nombre: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="RUT chileno" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  required
                  value={editFormData.rut}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, rut: e.target.value })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>

            <Field label="Correo electrónico">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="email"
                  value={editFormData.email}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, email: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Teléfono">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.telefono}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, telefono: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Dirección">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.direccion}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, direccion: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Comuna">
              {({ id }) => (
                <>
                  <TextInput
                    id={id}
                    list="edit-comunas-datalist"
                    value={editFormData.comuna}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, comuna: e.target.value })
                    }
                  />
                  <datalist id="edit-comunas-datalist">
                    {TODAS_COMUNAS_CHILE.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
          </div>

          <div className="border-t border-line-subtle pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Cargo / Rol" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={editFormData.cargo}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, cargo: e.target.value })
                  }
                >
                  {CARGOS_RRHH_DEFAULT.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Área">
              {({ id }) => (
                <Select
                  id={id}
                  value={editFormData.area}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, area: e.target.value })
                  }
                >
                  {AREAS_RRHH_DEFAULT.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Tipo contrato">
              {({ id }) => (
                <Select
                  id={id}
                  value={editFormData.tipo_contrato}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, tipo_contrato: e.target.value })
                  }
                >
                  <option value="Indefinido">Indefinido</option>
                  <option value="Plazo fijo">Plazo fijo</option>
                  <option value="Honorarios">Honorarios</option>
                  <option value="Por faena / obra">Por faena / obra</option>
                </Select>
              )}
            </Field>

            <Field label="Sueldo base (CLP)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  value={editFormData.sueldo_base}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, sueldo_base: Number(e.target.value) })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>

            <Field label="Fecha de ingreso">
              {({ id }) => (
                <DateInput
                  id={id}
                  value={editFormData.fecha_ingreso}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, fecha_ingreso: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Banco">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.banco}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, banco: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Tipo cuenta bancaria">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.tipo_cuenta}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, tipo_cuenta: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="N° de cuenta">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.numero_cuenta}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, numero_cuenta: e.target.value })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
          </div>

          <div className="border-t border-line-subtle pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Contacto de emergencia (Nombre)">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.contacto_emergencia_nombre}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      contacto_emergencia_nombre: e.target.value,
                    })
                  }
                />
              )}
            </Field>

            <Field label="Teléfono de emergencia">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={editFormData.contacto_emergencia_telefono}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      contacto_emergencia_telefono: e.target.value,
                    })
                  }
                />
              )}
            </Field>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 2: SUBIR DOCUMENTO */}
      <Dialog
        open={showNewDocModal}
        title="Subir Documento"
        description="Registrar documento o anexo a la carpeta del trabajador."
        size="md"
        onClose={() => setShowNewDocModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewDocModal(false)}
              disabled={savingDoc}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveDocument(e)}
              disabled={savingDoc || !newDocData.nombre_archivo.trim()}
            >
              {savingDoc ? 'Guardando...' : 'Guardar documento'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSaveDocument(e)} className="space-y-3">
          <Field label="Categoría / Carpeta" required>
            {({ id }) => (
              <Select
                id={id}
                value={newDocData.categoria}
                onChange={(e) =>
                  setNewDocData({
                    ...newDocData,
                    categoria: e.target.value as CategoriaDocumentoTrabajador,
                  })
                }
              >
                {CATEGORIAS_DOCUMENTOS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Nombre del documento" required>
            {({ id }) => (
              <TextInput
                id={id}
                required
                placeholder="Ej: Contrato de Trabajo Indefinido 2026.pdf"
                value={newDocData.nombre_archivo}
                onChange={(e) =>
                  setNewDocData({ ...newDocData, nombre_archivo: e.target.value })
                }
              />
            )}
          </Field>

          <Field label="Enlace / URL de descarga">
            {({ id }) => (
              <TextInput
                id={id}
                placeholder="https://... o enlace al documento"
                value={newDocData.url}
                onChange={(e) => setNewDocData({ ...newDocData, url: e.target.value })}
                className="font-mono text-xs"
              />
            )}
          </Field>

          <Field label="Fecha de emisión">
            {({ id }) => (
              <DateInput
                id={id}
                value={newDocData.fecha_emision}
                onChange={(e) =>
                  setNewDocData({ ...newDocData, fecha_emision: e.target.value })
                }
              />
            )}
          </Field>
        </form>
      </Dialog>

      {/* DIALOG 3: REGISTRAR PERMISO / AUSENCIA */}
      <Dialog
        open={showNewPermisoModal}
        title="Registrar Permiso o Ausencia"
        description="Control de licencias, vacaciones y bloqueos en el calendario."
        size="md"
        onClose={() => setShowNewPermisoModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewPermisoModal(false)}
              disabled={savingPermiso}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSavePermiso(e)}
              disabled={savingPermiso}
            >
              {savingPermiso ? 'Guardando...' : 'Registrar permiso'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSavePermiso(e)} className="space-y-3">
          <Field label="Tipo de ausencia" required>
            {({ id }) => (
              <Select
                id={id}
                value={newPermisoData.tipo}
                onChange={(e) =>
                  setNewPermisoData({
                    ...newPermisoData,
                    tipo: e.target.value as TipoPermisoAusencia,
                  })
                }
              >
                <option value="permiso">Permiso personal / día administrativo</option>
                <option value="vacaciones">Vacaciones legales</option>
                <option value="licencia_medica">Licencia médica</option>
                <option value="falta_injustificada">Falta injustificada</option>
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha inicio" required>
              {({ id }) => (
                <DateInput
                  id={id}
                  required
                  value={newPermisoData.fecha_inicio}
                  onChange={(e) =>
                    setNewPermisoData({ ...newPermisoData, fecha_inicio: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Fecha fin" required>
              {({ id }) => (
                <DateInput
                  id={id}
                  required
                  value={newPermisoData.fecha_fin}
                  onChange={(e) =>
                    setNewPermisoData({ ...newPermisoData, fecha_fin: e.target.value })
                  }
                />
              )}
            </Field>
          </div>

          <Field label="Motivo / Detalle">
            {({ id }) => (
              <TextInput
                id={id}
                placeholder="Ej: Cita médica / Trámite personal..."
                value={newPermisoData.motivo}
                onChange={(e) =>
                  setNewPermisoData({ ...newPermisoData, motivo: e.target.value })
                }
              />
            )}
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="chkBloquea"
              checked={newPermisoData.bloquea_calendario}
              onChange={(e) =>
                setNewPermisoData({ ...newPermisoData, bloquea_calendario: e.target.checked })
              }
              className="rounded border-line text-accent focus:ring-accent"
            />
            <label htmlFor="chkBloquea" className="t-caption font-semibold text-ink cursor-pointer">
              Bloquear disponibilidad en calendarios durante este período
            </label>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 4: REGISTRAR LIQUIDACIÓN DE SUELDO */}
      <Dialog
        open={showNewLiquidacionModal}
        title="Registrar Liquidación de Sueldo"
        description="Ingresar detalle de haberes, descuentos y monto líquido."
        size="md"
        onClose={() => setShowNewLiquidacionModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewLiquidacionModal(false)}
              disabled={savingLiquidacion}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveLiquidacion(e)}
              disabled={savingLiquidacion}
            >
              {savingLiquidacion ? 'Guardando...' : 'Registrar sueldo'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSaveLiquidacion(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mes" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={newLiquidacionData.mes}
                  onChange={(e) =>
                    setNewLiquidacionData({
                      ...newLiquidacionData,
                      mes: Number(e.target.value),
                    })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                    <option key={m} value={m}>
                      Mes {m}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Año" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  value={newLiquidacionData.anio}
                  onChange={(e) =>
                    setNewLiquidacionData({
                      ...newLiquidacionData,
                      anio: Number(e.target.value),
                    })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
          </div>

          <Field label="Sueldo base (CLP)">
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                value={newLiquidacionData.monto_sueldo_base}
                onChange={(e) => {
                  const base = Number(e.target.value);
                  const liq = base + newLiquidacionData.bonos - newLiquidacionData.descuentos;
                  setNewLiquidacionData({
                    ...newLiquidacionData,
                    monto_sueldo_base: base,
                    monto_liquido: liq,
                  });
                }}
                className="font-mono tabular-nums"
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Bonos (CLP)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  value={newLiquidacionData.bonos}
                  onChange={(e) => {
                    const bonos = Number(e.target.value);
                    const liq =
                      newLiquidacionData.monto_sueldo_base + bonos - newLiquidacionData.descuentos;
                    setNewLiquidacionData({
                      ...newLiquidacionData,
                      bonos,
                      monto_liquido: liq,
                    });
                  }}
                  className="font-mono tabular-nums"
                />
              )}
            </Field>

            <Field label="Descuentos (CLP)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  value={newLiquidacionData.descuentos}
                  onChange={(e) => {
                    const desc = Number(e.target.value);
                    const liq =
                      newLiquidacionData.monto_sueldo_base + newLiquidacionData.bonos - desc;
                    setNewLiquidacionData({
                      ...newLiquidacionData,
                      descuentos: desc,
                      monto_liquido: liq,
                    });
                  }}
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
          </div>

          <Field label="Total Líquido a Pagar (CLP)" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                required
                value={newLiquidacionData.monto_liquido}
                onChange={(e) =>
                  setNewLiquidacionData({
                    ...newLiquidacionData,
                    monto_liquido: Number(e.target.value),
                  })
                }
                className="font-mono tabular-nums font-semibold text-success"
              />
            )}
          </Field>

          <Field label="Estado de Pago">
            {({ id }) => (
              <Select
                id={id}
                value={newLiquidacionData.estado_pago}
                onChange={(e) =>
                  setNewLiquidacionData({
                    ...newLiquidacionData,
                    estado_pago: e.target.value as 'pagado' | 'pendiente',
                  })
                }
              >
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente de pago</option>
              </Select>
            )}
          </Field>
        </form>
      </Dialog>

      {/* DIALOG 5: NUEVA TAREA / RECORDATORIO */}
      <Dialog
        open={showNewRecordatorioModal}
        title="Nueva Tarea / Recordatorio"
        description="Asignar compromiso u obligación operativa al colaborador."
        size="md"
        onClose={() => setShowNewRecordatorioModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewRecordatorioModal(false)}
              disabled={savingRecordatorio}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveRecordatorio(e)}
              disabled={savingRecordatorio || !newRecordatorioData.titulo.trim()}
            >
              {savingRecordatorio ? 'Guardando...' : 'Asignar tarea'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSaveRecordatorio(e)} className="space-y-3">
          <Field label="Título de la tarea" required>
            {({ id }) => (
              <TextInput
                id={id}
                required
                placeholder="Ej: Renovar examen ocupacional de altura"
                value={newRecordatorioData.titulo}
                onChange={(e) =>
                  setNewRecordatorioData({ ...newRecordatorioData, titulo: e.target.value })
                }
              />
            )}
          </Field>

          <Field label="Descripción / Detalle">
            {({ id }) => (
              <TextInput
                id={id}
                placeholder="Detalles adicionales, requisitos o instrucciones..."
                value={newRecordatorioData.descripcion}
                onChange={(e) =>
                  setNewRecordatorioData({
                    ...newRecordatorioData,
                    descripcion: e.target.value,
                  })
                }
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Urgencia">
              {({ id }) => (
                <Select
                  id={id}
                  value={newRecordatorioData.urgencia}
                  onChange={(e) =>
                    setNewRecordatorioData({
                      ...newRecordatorioData,
                      urgencia: e.target.value as UrgenciaRecordatorio,
                    })
                  }
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Select>
              )}
            </Field>

            <Field label="Sección">
              {({ id }) => (
                <Select
                  id={id}
                  value={newRecordatorioData.seccion}
                  onChange={(e) =>
                    setNewRecordatorioData({
                      ...newRecordatorioData,
                      seccion: e.target.value as SeccionAdministracionEmpresa,
                    })
                  }
                >
                  <option value="sueldos_administrativos">Sueldos y RRHH</option>
                  <option value="prevencion_riesgos">Prevención de riesgos</option>
                  <option value="documentos">Documentación</option>
                  <option value="obras_faenas">Obras y faenas</option>
                  <option value="pendientes_generales">Pendientes generales</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha vencimiento" required>
              {({ id }) => (
                <DateInput
                  id={id}
                  required
                  value={newRecordatorioData.fecha_vencimiento}
                  onChange={(e) =>
                    setNewRecordatorioData({
                      ...newRecordatorioData,
                      fecha_vencimiento: e.target.value,
                    })
                  }
                />
              )}
            </Field>

            <Field label="Recurrencia">
              {({ id }) => (
                <Select
                  id={id}
                  value={newRecordatorioData.recurrencia}
                  onChange={(e) =>
                    setNewRecordatorioData({
                      ...newRecordatorioData,
                      recurrencia: e.target.value as RecurrenciaRecordatorio,
                    })
                  }
                >
                  <option value="ninguna">Sin recurrencia</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                </Select>
              )}
            </Field>
          </div>
        </form>
      </Dialog>

      {/* DIALOG 6: REGISTRAR ASISTENCIA MANUAL */}
      <Dialog
        open={showNewAsistenciaModal}
        title="Registrar Marcaje de Asistencia"
        description="Ingreso manual de marcaje y estado de jornada."
        size="md"
        onClose={() => setShowNewAsistenciaModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewAsistenciaModal(false)}
              disabled={savingAsistencia}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveAsistencia(e)}
              disabled={savingAsistencia}
            >
              {savingAsistencia ? 'Guardando...' : 'Guardar marcaje'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleSaveAsistencia(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              {({ id }) => (
                <DateInput
                  id={id}
                  required
                  value={newAsistenciaData.fecha}
                  onChange={(e) =>
                    setNewAsistenciaData({ ...newAsistenciaData, fecha: e.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Estado" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={newAsistenciaData.estado}
                  onChange={(e) =>
                    setNewAsistenciaData({
                      ...newAsistenciaData,
                      estado: e.target.value as EstadoAsistencia,
                    })
                  }
                >
                  <option value="presente">Presente a tiempo</option>
                  <option value="atraso">Atraso</option>
                  <option value="salida_temprana">Salida temprana</option>
                  <option value="en_terreno">En terreno / faena</option>
                  <option value="ausente_justificado">Ausente justificado</option>
                  <option value="ausente_injustificado">Ausente injustificado</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora entrada">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="time"
                  value={newAsistenciaData.hora_entrada}
                  onChange={(e) =>
                    setNewAsistenciaData({ ...newAsistenciaData, hora_entrada: e.target.value })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>

            <Field label="Hora salida">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="time"
                  value={newAsistenciaData.hora_salida}
                  onChange={(e) =>
                    setNewAsistenciaData({ ...newAsistenciaData, hora_salida: e.target.value })
                  }
                  className="font-mono tabular-nums"
                />
              )}
            </Field>
          </div>

          <Field label="Minutos de atraso (opcional)">
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                min="0"
                value={newAsistenciaData.minutos_atraso}
                onChange={(e) =>
                  setNewAsistenciaData({
                    ...newAsistenciaData,
                    minutos_atraso: Number(e.target.value),
                  })
                }
                className="font-mono tabular-nums"
              />
            )}
          </Field>

          <Field label="Observaciones">
            {({ id }) => (
              <TextInput
                id={id}
                placeholder="Ej: Registro manual autorizado por jefatura de planta..."
                value={newAsistenciaData.observaciones}
                onChange={(e) =>
                  setNewAsistenciaData({
                    ...newAsistenciaData,
                    observaciones: e.target.value,
                  })
                }
              />
            )}
          </Field>
        </form>
      </Dialog>


      {/* DIALOG: CREAR USUARIO CRM */}
      <Dialog
        open={showCreateUserModal}
        title="Crear usuario CRM"
        description={`Cuenta de acceso para ${trabajador.nombre}.`}
        size="sm"
        onClose={() => setShowCreateUserModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setShowCreateUserModal(false)} disabled={creatingUser}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void handleCreateUser()} disabled={creatingUser}>
              {creatingUser ? 'Creando...' : 'Crear y enviar código'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {createUserError && (
            <div className="rounded-control border border-danger-line bg-danger-soft px-3 py-2 font-medium text-danger">
              {createUserError}
            </div>
          )}
          <Field label="Correo" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="correo@dominio.cl"
              />
            )}
          </Field>
          <Field label="Rol de acceso">
            {({ id }) => (
              <Select
                id={id}
                value={newUserForm.rol}
                onChange={(e) => setNewUserForm({ ...newUserForm, rol: e.target.value as UserRole })}
              >
                {ROLES_ASIGNABLES.map((rol) => (
                  <option key={rol} value={rol}>
                    {ROL_NOMBRE[rol]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="t-micro uppercase font-semibold text-ink-muted">Calendarios:</span>
            {(
              [
                { key: 'calVisitas', label: 'Visitas' },
                { key: 'calProduccion', label: 'Producción' },
                { key: 'calReventa', label: 'Reventa' },
              ] as const
            ).map(({ key, label }) => (
              <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-ink">
                <input
                  type="checkbox"
                  checked={newUserForm[key]}
                  onChange={(e) => setNewUserForm({ ...newUserForm, [key]: e.target.checked })}
                  className="rounded-control"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="t-caption text-ink-muted leading-relaxed">
            Le llegará un correo con un código de un solo uso. Con él entra a «Recuperar contraseña», define su clave y queda con la cuenta activa.
          </p>
        </div>
      </Dialog>

      {/* DIALOG 7: VINCULAR CUENTA DE USUARIO CRM */}
      <Dialog
        open={showLinkUserModal}
        title="Vincular Cuenta CRM"
        description={`Asociar usuario del sistema a ${trabajador.nombre}.`}
        size="sm"
        onClose={() => setShowLinkUserModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setShowLinkUserModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleLinkUser(selectedLinkUserId || null)}
            >
              Guardar vinculación
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <p className="t-caption text-ink-muted leading-relaxed">
            Selecciona la cuenta de usuario del sistema para vincular. Al vincularlo, sus recordatorios, tareas y eventos de calendario se sincronizarán directamente.
          </p>

          <Field label="Usuario del sistema">
            {({ id }) => (
              <Select
                id={id}
                value={selectedLinkUserId}
                onChange={(e) => setSelectedLinkUserId(e.target.value)}
              >
                <option value="">-- Sin vincular (Colaborador de campo) --</option>
                {usuariosList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.email}) - {ROL_NOMBRE[u.rol] ?? u.rol}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
