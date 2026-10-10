'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { Usuario, UserRole } from '../../lib/types';
import { createClient } from '../../lib/supabase/client';
import { logSistema } from '../../lib/logger';
import { Pagination } from '../../components/Pagination';
import {
  Plus,
  Trash2,
  Edit2,
  Users,
  Database,
  Sliders,
  UserPlus,
  Shield,
  Briefcase,
  HardHat,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';
import {
  PageHeader,
  Panel,
  Button,
  IconButton,
  Tabs,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  Select,
} from '../../components/ui/crm';
import { useToast, useConfirm } from '../../components/ui/feedback';

export interface FieldDefinition {
  id: string;
  nombre: string;
  campo_supabase: string;
  entidad: 'clientes' | 'oportunidades' | 'cotizaciones';
  tipo: 'texto' | 'numero' | 'fecha' | 'opciones' | 'archivo' | 'relacion';
  opciones?: string[];
  es_sistema: boolean;
  activo: boolean;
}

const SYSTEM_FIELDS_CLIENTES: FieldDefinition[] = [
  { id: 'sys-cli-1', nombre: 'Nombre Comercial / Nombre', campo_supabase: 'nombre', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-2', nombre: 'Razón Social Completa', campo_supabase: 'apellido_razon_social', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-3', nombre: 'RUT Empresa / Persona', campo_supabase: 'rut', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-4', nombre: 'Nicho de Mercado', campo_supabase: 'nicho', entidad: 'clientes', tipo: 'opciones', opciones: ['Constructora B2B', 'Inmobiliaria', 'Contratista General', 'Particular', 'Distribuidor'], es_sistema: true, activo: true },
  { id: 'sys-cli-tipo-venta', nombre: 'Tipo de Venta Habitual', campo_supabase: 'tipo_venta', entidad: 'clientes', tipo: 'opciones', opciones: ['Instalación', 'Suministro', 'Reventa de Material'], es_sistema: true, activo: true },
  { id: 'sys-cli-5', nombre: 'Teléfono Principal', campo_supabase: 'telefono', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-6', nombre: 'Correo Electrónico Primario', campo_supabase: 'correo', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-7', nombre: 'Correos Secundarios (CC)', campo_supabase: 'correos_secundarios', entidad: 'clientes', tipo: 'opciones', es_sistema: true, activo: true },
  { id: 'sys-cli-8', nombre: 'Dirección de Despacho / Obra', campo_supabase: 'direccion', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cli-9', nombre: 'Comuna de Despacho', campo_supabase: 'comuna', entidad: 'clientes', tipo: 'texto', es_sistema: true, activo: true },
];

const SYSTEM_FIELDS_OPORTUNIDADES: FieldDefinition[] = [
  { id: 'sys-op-1', nombre: 'Código de Oportunidad', campo_supabase: 'codigo', entidad: 'oportunidades', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-op-2', nombre: 'Título del Proyecto', campo_supabase: 'titulo', entidad: 'oportunidades', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-op-3', nombre: 'Cliente Vinculado', campo_supabase: 'cliente_id', entidad: 'oportunidades', tipo: 'relacion', es_sistema: true, activo: true },
  { id: 'sys-op-4', nombre: 'Estado en Pipeline', campo_supabase: 'estado_pipeline', entidad: 'oportunidades', tipo: 'opciones', opciones: ['Nueva', 'Pago Validado', 'En Programación', 'Trabajo Entregado'], es_sistema: true, activo: true },
  { id: 'sys-op-tipo-venta', nombre: 'Tipo de Venta', campo_supabase: 'tipo_venta', entidad: 'oportunidades', tipo: 'opciones', opciones: ['Instalación', 'Suministro', 'Reventa de Material'], es_sistema: true, activo: true },
  { id: 'sys-op-prioridad', nombre: 'Prioridad de Oportunidad', campo_supabase: 'prioridad', entidad: 'oportunidades', tipo: 'opciones', opciones: ['Normal / Baja', 'Alta', 'Urgente'], es_sistema: true, activo: true },
  { id: 'sys-op-visita-req', nombre: 'Requiere Visita a Terreno', campo_supabase: 'requiere_visita_terreno', entidad: 'oportunidades', tipo: 'opciones', opciones: ['Sí', 'No'], es_sistema: true, activo: true },
  { id: 'sys-op-visita-tec', nombre: 'Técnico Asignado a Visita', campo_supabase: 'tecnico_id', entidad: 'oportunidades', tipo: 'relacion', es_sistema: true, activo: true },
  { id: 'sys-op-5', nombre: 'Fecha Inicio Trabajo', campo_supabase: 'fecha_inicio', entidad: 'oportunidades', tipo: 'fecha', es_sistema: true, activo: true },
  { id: 'sys-op-6', nombre: 'Fecha Límite Término', campo_supabase: 'fecha_limite', entidad: 'oportunidades', tipo: 'fecha', es_sistema: true, activo: true },
  { id: 'sys-op-7', nombre: 'Categorías de Productos', campo_supabase: 'productos', entidad: 'oportunidades', tipo: 'opciones', es_sistema: true, activo: true },
  { id: 'sys-op-8', nombre: 'Monto Abonado / Depositado', campo_supabase: 'monto_abonado', entidad: 'oportunidades', tipo: 'numero', es_sistema: true, activo: true },
  { id: 'sys-op-9', nombre: 'Comprobantes de Pago', campo_supabase: 'comprobantes_pago', entidad: 'oportunidades', tipo: 'archivo', es_sistema: true, activo: true },
];

const SYSTEM_FIELDS_COTIZACIONES: FieldDefinition[] = [
  { id: 'sys-cot-1', nombre: 'Número de Cotización', campo_supabase: 'numero_cotizacion', entidad: 'cotizaciones', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cot-2', nombre: 'Versión del Documento', campo_supabase: 'version', entidad: 'cotizaciones', tipo: 'numero', es_sistema: true, activo: true },
  { id: 'sys-cot-3', nombre: 'Cliente Vinculado', campo_supabase: 'cliente_id', entidad: 'cotizaciones', tipo: 'relacion', es_sistema: true, activo: true },
  { id: 'sys-cot-4', nombre: 'Oportunidad de Venta', campo_supabase: 'oportunidad_id', entidad: 'cotizaciones', tipo: 'relacion', es_sistema: true, activo: true },
  { id: 'sys-cot-5', nombre: 'Estado Comercial', campo_supabase: 'estado', entidad: 'cotizaciones', tipo: 'opciones', opciones: ['Borrador', 'Enviada', 'Aprobada', 'Declinada'], es_sistema: true, activo: true },
  { id: 'sys-cot-6', nombre: 'Monto Subtotal Neto', campo_supabase: 'subtotal', entidad: 'cotizaciones', tipo: 'numero', es_sistema: true, activo: true },
  { id: 'sys-cot-7', nombre: 'Monto IVA (19%)', campo_supabase: 'monto_iva', entidad: 'cotizaciones', tipo: 'numero', es_sistema: true, activo: true },
  { id: 'sys-cot-8', nombre: 'Monto Total General', campo_supabase: 'monto_total', entidad: 'cotizaciones', tipo: 'numero', es_sistema: true, activo: true },
  { id: 'sys-cot-9', nombre: 'Plazo de Entrega AC', campo_supabase: 'plazo_entrega', entidad: 'cotizaciones', tipo: 'texto', es_sistema: true, activo: true },
  { id: 'sys-cot-10', nombre: 'Condiciones de Pago', campo_supabase: 'condiciones_pago', entidad: 'cotizaciones', tipo: 'texto', es_sistema: true, activo: true },
];

export default function ConfiguracionPage() {
  const { currentUser, usersList, addUser, updateUserRole, updateUser, deleteUser, refreshUsers } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const confirm = useConfirm();

  // Modo de Pestaña Principal (Campos vs Usuarios y Accesos vs Zona de Peligro)
  const [mainTab, setMainTab] = useState<'usuarios' | 'campos' | 'peligro'>('usuarios');

  // Zona de Peligro: Reset de Datos de Operación
  const [resetDryRunLoading, setResetDryRunLoading] = useState(false);
  const [resetDryRunData, setResetDryRunData] = useState<Record<string, number> | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetExecuting, setResetExecuting] = useState(false);

  // Campos Custom State
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);

  const [activeEntityTab, setActiveEntityTab] = useState<'clientes' | 'oportunidades' | 'cotizaciones'>('clientes');
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);

  // Field Form states
  const [nombre, setNombre] = useState('');
  const [campoSupabase, setCampoSupabase] = useState('');
  const [entidad, setEntidad] = useState<'clientes' | 'oportunidades' | 'cotizaciones'>('clientes');
  const [tipo, setTipo] = useState<'texto' | 'numero' | 'fecha' | 'opciones' | 'archivo' | 'relacion'>('texto');
  const [opcionesInput, setOpcionesInput] = useState('');

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('mano_obra');
  const [userCalVisitas, setUserCalVisitas] = useState(true);
  const [userCalProduccion, setUserCalProduccion] = useState(true);
  const [userCalReventa, setUserCalReventa] = useState(true);

  // Edit User State
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editUserNombre, setEditUserNombre] = useState('');
  const [editUserRol, setEditUserRol] = useState<UserRole>('user');
  const [editUserActivo, setEditUserActivo] = useState(true);
  const [editUserCalVisitas, setEditUserCalVisitas] = useState(true);
  const [editUserCalProduccion, setEditUserCalProduccion] = useState(true);
  const [editUserCalReventa, setEditUserCalReventa] = useState(true);
  const [showEditUserModal, setShowEditUserModal] = useState(false);

  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const [userItemsPerPage, setUserItemsPerPage] = useState(10);

  // Load fields from Supabase table campos_personalizados
  useEffect(() => {
    let ignore = false;
    async function loadFieldsFromSupabase() {
      try {
        const { data } = await supabase
          .from('campos_personalizados')
          .select('*')
          .order('created_at', { ascending: true });

        if (ignore) return;

        const defaultSeed = [
          ...SYSTEM_FIELDS_CLIENTES,
          ...SYSTEM_FIELDS_OPORTUNIDADES,
          ...SYSTEM_FIELDS_COTIZACIONES,
        ];

        if (data && data.length > 0) {
          const existingKeys = new Set(data.map((f: { entidad: string; campo_supabase: string }) => `${f.entidad}_${f.campo_supabase}`));
          const missingFields = defaultSeed.filter((sf) => !existingKeys.has(`${sf.entidad}_${sf.campo_supabase}`));

          if (missingFields.length > 0) {
            try {
              await supabase.from('campos_personalizados').upsert(missingFields);
            } catch (uErr) {
              console.error('Error upserting missing system fields:', uErr);
            }
            setFields([...(data as FieldDefinition[]), ...missingFields]);
          } else {
            setFields(data as FieldDefinition[]);
          }
        } else {
          setFields(defaultSeed);
        }
      } catch (err) {
        console.error('Error loading fields from Supabase:', err);
      } finally {
        if (!ignore) setLoadingFields(false);
      }
    }

    const timer = setTimeout(() => {
      void loadFieldsFromSupabase();
    }, 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [supabase]);

  const handleOpenNewField = () => {
    setEditingField(null);
    setNombre('');
    setCampoSupabase('');
    setEntidad(activeEntityTab);
    setTipo('texto');
    setOpcionesInput('');
    setShowFieldModal(true);
  };

  const handleEditField = (field: FieldDefinition) => {
    setEditingField(field);
    setNombre(field.nombre);
    setCampoSupabase(field.campo_supabase);
    setEntidad(field.entidad);
    setTipo(field.tipo);
    setOpcionesInput(field.opciones ? field.opciones.join(', ') : '');
    setShowFieldModal(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !campoSupabase.trim()) {
      toast({ message: 'El nombre y la columna son obligatorios.', tone: 'warning' });
      return;
    }

    const fieldData: FieldDefinition = {
      id: editingField ? editingField.id : `custom-${Date.now()}`,
      nombre: nombre.trim(),
      campo_supabase: campoSupabase.trim().toLowerCase().replace(/\s+/g, '_'),
      entidad,
      tipo,
      opciones: tipo === 'opciones' ? opcionesInput.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
      es_sistema: editingField ? editingField.es_sistema : false,
      activo: editingField ? editingField.activo : true,
    };

    try {
      const { error } = await supabase.from('campos_personalizados').upsert([fieldData]);
      if (error) throw error;

      if (editingField) {
        setFields(fields.map((f) => (f.id === editingField.id ? fieldData : f)));
        toast({ message: `Campo "${nombre}" actualizado correctamente.`, tone: 'success' });
      } else {
        setFields([...fields, fieldData]);
        toast({ message: `Campo personalizado "${nombre}" creado exitosamente.`, tone: 'success' });
      }
      setShowFieldModal(false);
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al persistir el campo.'), tone: 'danger' });
    }
  };

  const handleToggleActive = async (id: string) => {
    const field = fields.find((f) => f.id === id);
    if (!field) return;
    const newStatus = !field.activo;

    try {
      const { error } = await supabase
        .from('campos_personalizados')
        .update({ activo: newStatus })
        .eq('id', id);
      if (error) throw error;

      setFields(fields.map((f) => (f.id === id ? { ...f, activo: newStatus } : f)));
      toast({
        message: `El campo "${field.nombre}" ahora está ${newStatus ? 'Activo' : 'Oculto'}.`,
        tone: 'info',
      });
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al cambiar estado del campo.'), tone: 'danger' });
    }
  };

  const handleDeleteField = async (id: string) => {
    const field = fields.find((f) => f.id === id);
    if (!field || field.es_sistema) return;

    const ok = await confirm({
      title: 'Eliminar campo personalizado',
      message: `¿Estás seguro de eliminar el campo "${field.nombre}"?`,
      confirmLabel: 'Eliminar campo',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('campos_personalizados').delete().eq('id', id);
      if (error) throw error;

      setFields(fields.filter((f) => f.id !== id));
      toast({ message: `Campo "${field.nombre}" eliminado.`, tone: 'info' });
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al eliminar el campo.'), tone: 'danger' });
    }
  };

  // Toggle Calendario directo en la tabla de usuarios
  const handleToggleUserCalendar = async (
    userId: string,
    field: 'calendario_visitas' | 'calendario_produccion' | 'calendario_reventa',
    currentVal?: boolean
  ) => {
    const newVal = !(currentVal ?? true);
    try {
      const { error } = await supabase
        .from('usuarios')
        .update({ [field]: newVal, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      await refreshUsers();
      toast({ message: 'Preferencia de calendario actualizada.', tone: 'success' });
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al actualizar calendario.'), tone: 'danger' });
    }
  };

  // User Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userNombre.trim() || !userEmail.trim() || !userPassword) {
      toast({ message: 'Todos los campos son requeridos para crear el usuario.', tone: 'warning' });
      return;
    }

    try {
      await addUser({
        nombre: userNombre.trim(),
        email: userEmail.trim(),
        password: userPassword,
        rol: userRol,
        activo: true,
      });

      // Actualizar flags de calendarios en el registro recién creado
      await supabase
        .from('usuarios')
        .update({
          calendario_visitas: userCalVisitas,
          calendario_produccion: userCalProduccion,
          calendario_reventa: userCalReventa,
        })
        .eq('email', userEmail.trim());

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'usuarios',
        descripcion: `Usuario ${userNombre.trim()} (${userEmail.trim()}) registrado con rol ${userRol}.`,
        usuario_id: currentUser?.id,
      });

      toast({ message: `Usuario ${userNombre} registrado exitosamente.`, tone: 'success' });
      setShowUserModal(false);
      setUserNombre('');
      setUserEmail('');
      setUserPassword('');
      setUserRol('mano_obra');
      setUserCalVisitas(true);
      setUserCalProduccion(true);
      setUserCalReventa(true);
      await refreshUsers();
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'No se pudo registrar el usuario.'), tone: 'danger' });
    }
  };

  const handleOpenEditUser = (usr: Usuario) => {
    setEditingUser(usr);
    setEditUserNombre(usr.nombre);
    setEditUserRol(usr.rol);
    setEditUserActivo(usr.activo);
    setEditUserCalVisitas(usr.calendario_visitas ?? true);
    setEditUserCalProduccion(usr.calendario_produccion ?? true);
    setEditUserCalReventa(usr.calendario_reventa ?? true);
    setShowEditUserModal(true);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await updateUser(editingUser.id, {
        nombre: editUserNombre.trim(),
        rol: editUserRol,
        activo: editUserActivo,
      });

      await supabase
        .from('usuarios')
        .update({
          calendario_visitas: editUserCalVisitas,
          calendario_produccion: editUserCalProduccion,
          calendario_reventa: editUserCalReventa,
        })
        .eq('id', editingUser.id);

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'usuarios',
        entidad_id: editingUser.id,
        descripcion: `Usuario ${editUserNombre} actualizado (Rol: ${editUserRol}, Activo: ${editUserActivo}).`,
        usuario_id: currentUser?.id,
      });

      toast({ message: `Usuario ${editUserNombre} actualizado exitosamente.`, tone: 'success' });
      setShowEditUserModal(false);
      setEditingUser(null);
      await refreshUsers();
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al actualizar usuario.'), tone: 'danger' });
    }
  };

  const handleDeleteUser = async (usr: Usuario) => {
    const ok = await confirm({
      title: 'Eliminar usuario',
      message: `¿Estás seguro de que deseas eliminar permanentemente a ${usr.nombre} (${usr.email})?`,
      confirmLabel: 'Eliminar usuario',
      destructive: true,
    });
    if (!ok) return;

    try {
      await deleteUser(usr.id);

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'usuarios',
        entidad_id: usr.id,
        descripcion: `Usuario ${usr.nombre} (${usr.email}) eliminado del sistema.`,
        usuario_id: currentUser?.id,
      });

      toast({ message: `Usuario ${usr.nombre} eliminado exitosamente.`, tone: 'info' });
      await refreshUsers();
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'Error al eliminar usuario.'), tone: 'danger' });
    }
  };

  const handleSimularReset = async () => {
    try {
      setResetDryRunLoading(true);
      const { data, error } = await supabase.rpc('reset_datos_operacion', {
        p_confirmacion: '',
        p_dry_run: true,
      });
      if (error) throw error;
      const res = data as { dry_run: boolean; conteos: Record<string, number>; mensaje: string };
      setResetDryRunData(res.conteos);
      toast({
        message: 'Simulación de reset ejecutada con éxito. Revisa el resumen de registros.',
        tone: 'info',
      });
    } catch (err: unknown) {
      console.error('Error al simular reset:', err);
      toast({ message: mensajeError(err, 'Error al simular reset de operaciones.'), tone: 'danger' });
    } finally {
      setResetDryRunLoading(false);
    }
  };

  const handleEjecutarReset = async () => {
    if (resetConfirmText.trim() !== 'BORRAR OPERACION HORMIGLASS') {
      toast({
        message: 'Debe escribir exactamente la frase de confirmación: BORRAR OPERACION HORMIGLASS',
        tone: 'warning',
      });
      return;
    }

    const ok = await confirm({
      title: '¿Confirmar eliminación masiva de datos demo de operación?',
      message: (
        <div className="space-y-2 text-xs text-ink-muted">
          <p className="font-semibold text-danger">
            ¡ATENCIÓN! Esta acción es destructiva e irreversible.
          </p>
          <p>
            Se eliminarán permanentemente todas las oportunidades, cotizaciones, órdenes de compra, guías, abonos y movimientos de caja de prueba. Los 348 productos, cuentas bancarias y catálogos maestros permanecerán intactos.
          </p>
        </div>
      ),
      confirmLabel: 'Sí, borrar datos de operación',
      cancelLabel: 'Cancelar',
      destructive: true,
    });

    if (!ok) return;

    try {
      setResetExecuting(true);
      const { data, error } = await supabase.rpc('reset_datos_operacion', {
        p_confirmacion: 'BORRAR OPERACION HORMIGLASS',
        p_dry_run: false,
      });
      if (error) throw error;
      const res = data as { dry_run: boolean; conteos_eliminados: Record<string, number>; mensaje: string };
      toast({
        message: res?.mensaje || 'Datos operativos eliminados correctamente. El sistema está limpio para iniciar la operación real.',
        tone: 'success',
        duration: 7000,
      });
      setResetConfirmText('');
      setResetDryRunData(null);
    } catch (err: unknown) {
      console.error('Error al ejecutar reset de operaciones:', err);
      toast({ message: mensajeError(err, 'Error al ejecutar la eliminación de datos de operación.'), tone: 'danger' });
    } finally {
      setResetExecuting(false);
    }
  };

  const filteredFields = fields.filter((f) => f.entidad === activeEntityTab);

  // Pagination for Users
  const paginatedUsers = usersList.slice(
    (userCurrentPage - 1) * userItemsPerPage,
    userCurrentPage * userItemsPerPage
  );

  return (
    <div className="hg-page space-y-5 pb-12">
      {/* Cabecera Principal */}
      <PageHeader
        title="Configuración del sistema"
        description="Gestión centralizada de usuarios, permisos, calendarios y campos personalizados."
        actions={
          mainTab === 'usuarios' ? (
            <Button
              variant="primary"
              icon={UserPlus}
              onClick={() => setShowUserModal(true)}
            >
              Registrar usuario
            </Button>
          ) : mainTab === 'campos' ? (
            <Button
              variant="primary"
              icon={Plus}
              onClick={handleOpenNewField}
            >
              Nuevo campo
            </Button>
          ) : null
        }
      />

      {/* Selector de Pestañas Superiores */}
      <Tabs
        items={[
          { id: 'usuarios', label: 'Usuarios, accesos y calendarios', count: usersList.length },
          { id: 'campos', label: 'Campos del sistema y módulos', count: fields.length },
          ...(currentUser?.rol === 'admin'
            ? [{ id: 'peligro', label: 'Zona de peligro (Mantenimiento)' }]
            : []),
        ]}
        active={mainTab}
        onChange={(id) => setMainTab(id as 'usuarios' | 'campos' | 'peligro')}
      />

      {/* ========================================================= */}
      {/* PESTAÑA 1: USUARIOS, ACCESOS Y CALENDARIOS                */}
      {/* ========================================================= */}
      {mainTab === 'usuarios' && (
        <div className="space-y-4">
          {/* Matriz Informativa de Roles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Panel className="p-3.5 space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-ink" />
                <span className="font-semibold text-xs text-ink uppercase">Administrador</span>
              </div>
              <p className="t-caption">
                Control total: configuración, finanzas, ventas, compras y gestión de colaboradores.
              </p>
            </Panel>

            <Panel className="p-3.5 space-y-1">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-info" />
                <span className="font-semibold text-xs text-ink uppercase">Ejecutivo comercial</span>
              </div>
              <p className="t-caption">
                Operación comercial: clientes, cotizaciones, pipeline de ventas y cobros en caja.
              </p>
            </Panel>

            <Panel className="p-3.5 space-y-1">
              <div className="flex items-center gap-2">
                <HardHat className="w-4 h-4 text-warning" />
                <span className="font-semibold text-xs text-ink uppercase">Mano de obra</span>
              </div>
              <p className="t-caption">
                Acceso a Recursos Humanos (ficha personal, carpetas) y calendarios de faena.
              </p>
            </Panel>
          </div>

          {/* Tabla Unificada de Usuarios y Calendarios */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent-ink" />
                <span>Usuarios registrados ({usersList.length})</span>
              </span>
            }
          >
            <div className="overflow-x-auto">
              <table className="hg-table w-full text-left text-xs min-w-[950px]">
                <thead>
                  <tr>
                    <th className="p-3">Usuario / Nombre</th>
                    <th className="p-3">Correo electrónico</th>
                    <th className="p-3">Rol de acceso</th>
                    <th className="p-3 text-center">Cal. Visitas</th>
                    <th className="p-3 text-center">Cal. Producción</th>
                    <th className="p-3 text-center">Cal. Reventa</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((usr) => (
                    <tr key={usr.id}>
                      {/* Usuario / Nombre */}
                      <td className="p-3 font-semibold text-ink">
                        {usr.nombre}
                      </td>

                      {/* Correo Electrónico */}
                      <td className="p-3 font-mono text-ink-muted t-micro">
                        {usr.email}
                      </td>

                      {/* Rol de Acceso */}
                      <td className="p-3">
                        <select
                          value={usr.rol}
                          onChange={(e) => void updateUserRole(usr.id, e.target.value as UserRole, usr.activo)}
                          className="hg-field py-1 text-xs"
                        >
                          <option value="admin">Administrador</option>
                          <option value="user">Ejecutivo Comercial</option>
                          <option value="finanzas">Finanzas y Caja</option>
                          <option value="mano_obra">Mano de Obra</option>
                        </select>
                      </td>

                      {/* Cal. Visitas Toggle */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserCalendar(usr.id, 'calendario_visitas', usr.calendario_visitas)}
                          className="cursor-pointer"
                          title="Alternar presencia en Calendario de Visitas"
                        >
                          {(usr.calendario_visitas ?? true) ? (
                            <span className="inline-flex items-center gap-1 t-micro font-semibold text-accent-ink bg-accent-soft border border-accent-line px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Cal. Producción Toggle */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserCalendar(usr.id, 'calendario_produccion', usr.calendario_produccion)}
                          className="cursor-pointer"
                          title="Alternar presencia en Calendario de Producción"
                        >
                          {(usr.calendario_produccion ?? true) ? (
                            <span className="inline-flex items-center gap-1 t-micro font-semibold text-accent-ink bg-accent-soft border border-accent-line px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Cal. Reventa Toggle */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => void handleToggleUserCalendar(usr.id, 'calendario_reventa', usr.calendario_reventa)}
                          className="cursor-pointer"
                          title="Alternar presencia en Calendario de Reventa"
                        >
                          {(usr.calendario_reventa ?? true) ? (
                            <span className="inline-flex items-center gap-1 t-micro font-semibold text-accent-ink bg-accent-soft border border-accent-line px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Estado */}
                      <td className="p-3 text-center">
                        <StatusBadge tone={usr.activo ? 'success' : 'neutral'}>
                          {usr.activo ? 'Activo' : 'Inactivo'}
                        </StatusBadge>
                      </td>

                      {/* Acciones */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <IconButton
                            icon={Edit2}
                            label="Editar usuario"
                            onClick={() => handleOpenEditUser(usr)}
                          />

                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={() => void updateUserRole(usr.id, usr.rol, !usr.activo)}
                          >
                            {usr.activo ? 'Desactivar' : 'Activar'}
                          </Button>

                          <IconButton
                            icon={Trash2}
                            label="Eliminar usuario"
                            onClick={() => void handleDeleteUser(usr)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t border-line-subtle">
              <Pagination
                currentPage={userCurrentPage}
                totalItems={usersList.length}
                itemsPerPage={userItemsPerPage}
                onPageChange={setUserCurrentPage}
                onItemsPerPageChange={setUserItemsPerPage}
              />
            </div>
          </Panel>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: CAMPOS PERSONALIZADOS DEL SISTEMA              */}
      {/* ========================================================= */}
      {mainTab === 'campos' && (
        <div className="space-y-4">
          {/* Sub-Pestañas de Entidades */}
          <Tabs
            items={[
              { id: 'clientes', label: 'Clientes y contactos' },
              { id: 'oportunidades', label: 'Oportunidades y pipeline' },
              { id: 'cotizaciones', label: 'Cotizaciones' },
            ]}
            active={activeEntityTab}
            onChange={(id) => setActiveEntityTab(id as 'clientes' | 'oportunidades' | 'cotizaciones')}
          />

          {/* Tabla de Campos */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-accent-ink" />
                <span>Campos configurados ({filteredFields.length})</span>
              </span>
            }
          >
            {loadingFields ? (
              <div className="p-8 text-center t-caption">Cargando campos…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="hg-table w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="p-3">Etiqueta / Nombre visible</th>
                      <th className="p-3">Columna en base de datos</th>
                      <th className="p-3">Tipo de dato</th>
                      <th className="p-3">Opciones</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFields.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center t-caption">
                          No hay campos configurados para esta sección.
                        </td>
                      </tr>
                    ) : (
                      filteredFields.map((f, idx) => (
                        <tr key={`${f.entidad}-${f.campo_supabase}-${f.id || idx}`}>
                          <td className="p-3 font-semibold text-ink">
                            {f.nombre}
                          </td>
                          <td className="p-3">
                            <CodeStamp>{f.campo_supabase}</CodeStamp>
                          </td>
                          <td className="p-3 text-ink font-medium capitalize flex items-center gap-1.5">
                            <Database className="w-3.5 h-3.5 text-accent-ink" />
                            <span>{f.tipo}</span>
                          </td>
                          <td className="p-3 text-ink-muted t-micro">
                            {f.opciones && f.opciones.length > 0 ? f.opciones.join(', ') : '—'}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleToggleActive(f.id)}
                              className="cursor-pointer"
                              title="Cambiar estado"
                            >
                              <StatusBadge tone={f.activo ? 'success' : 'neutral'}>
                                {f.activo ? 'Activo' : 'Oculto'}
                              </StatusBadge>
                            </button>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                icon={Edit2}
                                label="Editar campo"
                                onClick={() => handleEditField(f)}
                              />
                              {!f.es_sistema && (
                                <IconButton
                                  icon={Trash2}
                                  label="Eliminar campo"
                                  onClick={() => void handleDeleteField(f.id)}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 3: ZONA DE PELIGRO (RESET DE OPERACIÓN)           */}
      {/* ========================================================= */}
      {mainTab === 'peligro' && currentUser?.rol === 'admin' && (
        <div className="space-y-5">
          {/* Panel Principal de Zona de Peligro */}
          <Panel
            className="border-danger/30 bg-danger-subtle/10"
            title={
              <span className="flex items-center gap-2 text-danger">
                <ShieldAlert className="w-4 h-4 text-danger" />
                <span className="font-semibold">Zona de Peligro: Limpieza y Reinicio de Operación</span>
              </span>
            }
          >
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-container border border-danger/20 bg-surface">
                <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-danger">
                    Depuración masiva de transacciones de prueba (Puesta a punto para operación real)
                  </p>
                  <p className="text-ink-muted leading-relaxed">
                    Esta herramienta ejecuta un reset integral de todas las tablas operativas: clientes de prueba,
                    oportunidades del pipeline, cotizaciones, órdenes de compra, guías de despacho, abonos y movimientos de caja.
                  </p>
                  <div className="pt-2 text-ink text-xs">
                    <span className="font-semibold text-success">Datos protegidos que NO se eliminan:</span>
                    <ul className="list-disc list-inside mt-1 text-ink-muted space-y-0.5">
                      <li>Catálogo maestro de productos (348 ítems).</li>
                      <li>Usuarios y credenciales de acceso al sistema.</li>
                      <li>Empresas del holding y sus 8 cuentas bancarias oficiales.</li>
                      <li>Categorías y subcategorías de caja.</li>
                      <li>Fichas y registros de Recursos Humanos.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Botón de Simulación Dry-Run */}
              <div className="flex items-center justify-between p-3 rounded-container bg-surface border border-line-subtle">
                <div>
                  <h4 className="text-xs font-semibold text-ink">Paso 1: Simulación de conteos (Dry Run)</h4>
                  <p className="text-xs text-ink-muted">
                    Consulta la base de datos para cuantificar con exactitud los registros que se eliminarían, sin alterar ningún dato.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon={RefreshCw}
                  disabled={resetDryRunLoading}
                  onClick={() => void handleSimularReset()}
                >
                  {resetDryRunLoading ? 'Simulando…' : 'Simular reset'}
                </Button>
              </div>

              {/* Resultados de Simulación */}
              {resetDryRunData && (
                <div className="p-4 rounded-container bg-surface border border-line-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">
                      Resumen de registros detectados para depuración:
                    </span>
                    <StatusBadge tone="info">Simulación activa</StatusBadge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                    {Object.entries(resetDryRunData).map(([tabla, conteo]) => (
                      <div
                        key={tabla}
                        className="flex items-center justify-between p-2 rounded border border-line-subtle bg-surface-muted"
                      >
                        <span className="font-mono text-ink-muted truncate mr-2" title={tabla}>
                          {tabla}
                        </span>
                        <span className={conteo > 0 ? 'text-danger font-semibold' : 'text-ink-muted'}>
                          <CodeStamp>{conteo}</CodeStamp>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 2: Ejecución Real con Frase de Confirmación */}
              <div className="p-4 rounded-container bg-surface border border-danger/30 space-y-3">
                <h4 className="text-xs font-semibold text-danger">Paso 2: Confirmación y ejecución definitiva</h4>
                <p className="text-xs text-ink-muted">
                  Para proceder con la eliminación definitiva de todos los datos transaccionales, escriba la siguiente frase exactamente:
                  <br />
                  <span className="font-mono font-bold text-ink select-all bg-surface-muted px-1.5 py-0.5 rounded border border-line-subtle mt-1 inline-block">
                    BORRAR OPERACION HORMIGLASS
                  </span>
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                  <div className="flex-1">
                    <TextInput
                      type="text"
                      placeholder="Escriba aquí la frase de confirmación..."
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    icon={Trash2}
                    disabled={resetConfirmText.trim() !== 'BORRAR OPERACION HORMIGLASS' || resetExecuting}
                    onClick={() => void handleEjecutarReset()}
                  >
                    {resetExecuting ? 'Depurando…' : 'Ejecutar limpieza de operación'}
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* MODAL: REGISTRAR NUEVO USUARIO */}
      <Dialog
        open={showUserModal}
        title="Registrar nuevo usuario"
        onClose={() => setShowUserModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowUserModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleCreateUser(e)}
            >
              Crear usuario
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
          <Field label="Nombre completo" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                required
                value={userNombre}
                onChange={(e) => setUserNombre(e.target.value)}
                placeholder="Ej. Marco Antonio"
              />
            )}
          </Field>

          <Field label="Correo electrónico" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="email"
                required
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="usuario@hormiglass.cl"
              />
            )}
          </Field>

          <Field label="Contraseña inicial" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="password"
                required
                minLength={6}
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                placeholder="••••••••"
              />
            )}
          </Field>

          <Field label="Rol y accesos" required>
            {({ id }) => (
              <Select
                id={id}
                value={userRol}
                onChange={(e) => setUserRol(e.target.value as UserRole)}
              >
                <option value="mano_obra">Mano de Obra</option>
                <option value="user">Ejecutivo Comercial</option>
                <option value="finanzas">Finanzas y Caja</option>
                <option value="admin">Administrador</option>
              </Select>
            )}
          </Field>

          {/* Toggles de los 3 Calendarios */}
          <div className="pt-2 border-t border-line-subtle space-y-2">
            <span className="t-micro uppercase font-semibold text-ink-muted block">
              Asignación en los 3 calendarios:
            </span>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
              <input
                type="checkbox"
                checked={userCalVisitas}
                onChange={(e) => setUserCalVisitas(e.target.checked)}
                className="rounded-control"
              />
              <span>Disponible para Visitas a Terreno</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
              <input
                type="checkbox"
                checked={userCalProduccion}
                onChange={(e) => setUserCalProduccion(e.target.checked)}
                className="rounded-control"
              />
              <span>Disponible para Producción, Obras & Fabricación</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
              <input
                type="checkbox"
                checked={userCalReventa}
                onChange={(e) => setUserCalReventa(e.target.checked)}
                className="rounded-control"
              />
              <span>Disponible para Reventa & Logística</span>
            </label>
          </div>
        </form>
      </Dialog>

      {/* MODAL: EDITAR USUARIO */}
      <Dialog
        open={showEditUserModal && !!editingUser}
        title="Editar usuario y calendarios"
        onClose={() => {
          setShowEditUserModal(false);
          setEditingUser(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowEditUserModal(false);
                setEditingUser(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveEditUser(e)}
            >
              Guardar cambios
            </Button>
          </>
        }
      >
        {editingUser && (
          <form onSubmit={handleSaveEditUser} className="space-y-3 text-xs">
            <Field label="Nombre completo" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="text"
                  required
                  value={editUserNombre}
                  onChange={(e) => setEditUserNombre(e.target.value)}
                />
              )}
            </Field>

            <Field label="Correo electrónico (solo lectura)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="email"
                  disabled
                  value={editingUser.email}
                  className="bg-surface-muted text-ink-muted cursor-not-allowed"
                />
              )}
            </Field>

            <Field label="Rol de acceso / permisos" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={editUserRol}
                  onChange={(e) => setEditUserRol(e.target.value as UserRole)}
                >
                  <option value="admin">Administrador</option>
                  <option value="user">Ejecutivo Comercial</option>
                  <option value="finanzas">Finanzas y Caja</option>
                  <option value="mano_obra">Mano de Obra</option>
                </Select>
              )}
            </Field>

            <Field label="Estado de la cuenta" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={editUserActivo ? 'true' : 'false'}
                  onChange={(e) => setEditUserActivo(e.target.value === 'true')}
                >
                  <option value="true">Activo (Acceso permitido)</option>
                  <option value="false">Inactivo / Bloqueado</option>
                </Select>
              )}
            </Field>

            {/* Toggles de los 3 Calendarios */}
            <div className="pt-2 border-t border-line-subtle space-y-2">
              <span className="t-micro uppercase font-semibold text-ink-muted block">
                Asignación en los 3 calendarios:
              </span>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={editUserCalVisitas}
                  onChange={(e) => setEditUserCalVisitas(e.target.checked)}
                  className="rounded-control"
                />
                <span>Disponible para Visitas a Terreno</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={editUserCalProduccion}
                  onChange={(e) => setEditUserCalProduccion(e.target.checked)}
                  className="rounded-control"
                />
                <span>Disponible para Producción, Obras & Fabricación</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={editUserCalReventa}
                  onChange={(e) => setEditUserCalReventa(e.target.checked)}
                  className="rounded-control"
                />
                <span>Disponible para Reventa & Logística</span>
              </label>
            </div>
          </form>
        )}
      </Dialog>

      {/* MODAL: CREAR / EDITAR CAMPO PERSONALIZADO */}
      <Dialog
        open={showFieldModal}
        title={editingField ? 'Editar campo' : 'Nuevo campo personalizado'}
        onClose={() => setShowFieldModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowFieldModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleSaveField(e)}
            >
              {editingField ? 'Guardar cambios' : 'Crear campo'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveField} className="space-y-3 text-xs">
          <Field label="Nombre / Etiqueta visible" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                required
                placeholder="Ej. Tipo de Vidrio Especial"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            )}
          </Field>

          <Field label="Columna en base de datos" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                required
                disabled={editingField?.es_sistema}
                placeholder="ej. tipo_vidrio_especial"
                value={campoSupabase}
                onChange={(e) => setCampoSupabase(e.target.value)}
                className={editingField?.es_sistema ? 'bg-surface-muted text-ink-muted cursor-not-allowed font-mono' : 'font-mono'}
              />
            )}
          </Field>

          <Field label="Módulo / Sección" required>
            {({ id }) => (
              <Select
                id={id}
                value={entidad}
                onChange={(e) => setEntidad(e.target.value as 'clientes' | 'oportunidades' | 'cotizaciones')}
                disabled={!!editingField}
                className={editingField ? 'bg-surface-muted text-ink-muted cursor-not-allowed' : undefined}
              >
                <option value="clientes">Clientes y Contactos</option>
                <option value="oportunidades">Oportunidades y Pipeline</option>
                <option value="cotizaciones">Cotizaciones</option>
              </Select>
            )}
          </Field>

          <Field label="Tipo de campo" required>
            {({ id }) => (
              <Select
                id={id}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'texto' | 'numero' | 'fecha' | 'opciones' | 'archivo' | 'relacion')}
                disabled={editingField?.es_sistema}
                className={editingField?.es_sistema ? 'bg-surface-muted text-ink-muted cursor-not-allowed' : undefined}
              >
                <option value="texto">Texto Simple</option>
                <option value="numero">Número</option>
                <option value="fecha">Fecha</option>
                <option value="opciones">Lista Desplegable (Opciones)</option>
                <option value="archivo">Archivo / Documento</option>
              </Select>
            )}
          </Field>

          {tipo === 'opciones' && (
            <Field label="Opciones (separadas por coma)" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  type="text"
                  required
                  placeholder="Opción 1, Opción 2, Opción 3"
                  value={opcionesInput}
                  onChange={(e) => setOpcionesInput(e.target.value)}
                />
              )}
            </Field>
          )}
        </form>
      </Dialog>
    </div>
  );
}
