'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { Usuario, UserRole } from '../../lib/types';
import { createClient } from '../../lib/supabase/client';
import { logSistema } from '../../lib/logger';
import { Pagination } from '../../components/Pagination';
import {
  Settings,
  Plus,
  Trash2,
  Edit,
  Save,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Users,
  Database,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Sliders,
  UserRound,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';

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
  const supabase = createClient();

  // Modo de Pestaña Principal (Campos vs Usuarios y Accesos)
  const [mainTab, setMainTab] = useState<'campos' | 'usuarios'>('usuarios');

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
  const [successMsg, setSuccessMsg] = useState('');
  const [userErrorMsg, setUserErrorMsg] = useState('');

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('mano_obra');
  const [userCalVisitas, setUserCalVisitas] = useState(true);
  const [userCalProduccion, setUserCalProduccion] = useState(true);
  const [userCalReventa, setUserCalReventa] = useState(true);
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);

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
        const { data, error } = await supabase
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
          const existingKeys = new Set(data.map((f: any) => `${f.entidad}_${f.campo_supabase}`));
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

    loadFieldsFromSupabase();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenNewField = () => {
    setEditingField(null);
    setNombre('');
    setCampoSupabase('');
    setEntidad(activeEntityTab);
    setTipo('texto');
    setOpcionesInput('');
    setUserErrorMsg('');
    setShowFieldModal(true);
  };

  const handleEditField = (field: FieldDefinition) => {
    setEditingField(field);
    setNombre(field.nombre);
    setCampoSupabase(field.campo_supabase);
    setEntidad(field.entidad);
    setTipo(field.tipo);
    setOpcionesInput(field.opciones ? field.opciones.join(', ') : '');
    setUserErrorMsg('');
    setShowFieldModal(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !campoSupabase.trim()) {
      setUserErrorMsg('El nombre y la columna son obligatorios.');
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
        setSuccessMsg(`Campo "${nombre}" actualizado correctamente.`);
      } else {
        setFields([...fields, fieldData]);
        setSuccessMsg(`Campo personalizado "${nombre}" creado exitosamente.`);
      }
      setShowFieldModal(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'Error al persistir el campo.'));
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
      setSuccessMsg(`El campo "${field.nombre}" ahora está ${newStatus ? 'Activo' : 'Oculto'}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'Error al cambiar estado del campo.'));
    }
  };

  const handleDeleteField = async (id: string) => {
    const field = fields.find((f) => f.id === id);
    if (!field || field.es_sistema) return;

    if (confirm(`¿Estás seguro de eliminar el campo "${field.nombre}"?`)) {
      try {
        const { error } = await supabase.from('campos_personalizados').delete().eq('id', id);
        if (error) throw error;

        setFields(fields.filter((f) => f.id !== id));
        setSuccessMsg(`Campo "${field.nombre}" eliminado.`);
        setTimeout(() => setSuccessMsg(''), 3000);
      } catch (err: any) {
        setUserErrorMsg(mensajeError(err, 'Error al eliminar el campo.'));
      }
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
      setSuccessMsg(`Preferencia de calendario actualizada para el usuario.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'Error al actualizar calendario.'));
    }
  };

  // User Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMsg('');

    if (!userNombre.trim() || !userEmail.trim() || !userPassword) {
      setUserErrorMsg('Todos los campos son requeridos para crear el usuario.');
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

      setSuccessMsg(`Usuario ${userNombre} registrado exitosamente.`);
      setShowUserModal(false);
      setUserNombre('');
      setUserEmail('');
      setUserPassword('');
      setUserRol('mano_obra');
      setUserCalVisitas(true);
      setUserCalProduccion(true);
      setUserCalReventa(true);
      await refreshUsers();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'No se pudo registrar el usuario.'));
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
    setUserErrorMsg('');

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

      setSuccessMsg(`Usuario ${editUserNombre} actualizado exitosamente.`);
      setShowEditUserModal(false);
      setEditingUser(null);
      await refreshUsers();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'Error al actualizar usuario.'));
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setUserErrorMsg('');

    try {
      await deleteUser(userToDelete.id);

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'usuarios',
        entidad_id: userToDelete.id,
        descripcion: `Usuario ${userToDelete.nombre} (${userToDelete.email}) eliminado del sistema.`,
        usuario_id: currentUser?.id,
      });

      setSuccessMsg(`Usuario ${userToDelete.nombre} eliminado exitosamente.`);
      setUserToDelete(null);
      await refreshUsers();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setUserErrorMsg(mensajeError(err, 'Error al eliminar usuario.'));
    }
  };

  const filteredFields = fields.filter((f) => f.entidad === activeEntityTab);

  // Pagination for Users
  const totalUserPages = Math.ceil(usersList.length / userItemsPerPage) || 1;
  const paginatedUsers = usersList.slice(
    (userCurrentPage - 1) * userItemsPerPage,
    userCurrentPage * userItemsPerPage
  );

  return (
    <div className="space-y-6 pb-12 text-[#213343] ">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-50 text-[#f97316] rounded-lg">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#213343] tracking-normal">
              Configuración del Sistema
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Gestión centralizada de usuarios, permisos, 3 calendarios y campos personalizados.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        {mainTab === 'usuarios' && (
          <button
            onClick={() => {
              setUserErrorMsg('');
              setShowUserModal(true);
            }}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2.5 rounded-lg font-black text-xs transition shadow-sm flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Registrar Usuario</span>
          </button>
        )}

        {mainTab === 'campos' && (
          <button
            onClick={handleOpenNewField}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2.5 rounded-lg font-black text-xs transition shadow-sm flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Campo</span>
          </button>
        )}
      </div>

      {/* Mensajes de Éxito / Error */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2.5 text-emerald-800 text-xs font-bold ">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {userErrorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-red-800 text-xs font-bold ">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{userErrorMsg}</span>
        </div>
      )}

      {/* Selector de Pestañas Superiores */}
      <div className="bg-white p-2 rounded-lg border border-gray-200 shadow-xs flex items-center gap-2">
        <button
          onClick={() => setMainTab('usuarios')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-xs font-black transition cursor-pointer ${
            mainTab === 'usuarios'
              ? 'bg-[#f97316] text-white shadow-sm'
              : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuarios, Accesos & 3 Calendarios ({usersList.length})</span>
        </button>

        <button
          onClick={() => setMainTab('campos')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-xs font-black transition cursor-pointer ${
            mainTab === 'campos'
              ? 'bg-[#f97316] text-white shadow-sm'
              : 'text-gray-600 hover:bg-orange-50 hover:text-[#f97316]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Campos del Sistema & Módulos</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* PESTAÑA 1: USUARIOS, ACCESOS Y CALENDARIOS                */}
      {/* ========================================================= */}
      {mainTab === 'usuarios' && (
        <div className="space-y-6 ">
          {/* Matriz Informativa de Roles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center font-black shrink-0">
                A
              </div>
              <div>
                <span className="font-extrabold text-red-700 block text-xs mb-0.5">ADMINISTRADOR</span>
                <p className="text-gray-600 text-[11px] leading-relaxed">
                  Control total: configuración, finanzas, ventas, compras y gestión de colaboradores.
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black shrink-0">
                U
              </div>
              <div>
                <span className="font-extrabold text-blue-700 block text-xs mb-0.5">EJECUTIVO COMERCIAL</span>
                <p className="text-gray-600 text-[11px] leading-relaxed">
                  Operación comercial: clientes, cotizaciones, pipeline de ventas y movimientos de caja.
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black shrink-0">
                M
              </div>
              <div>
                <span className="font-extrabold text-amber-800 block text-xs mb-0.5">MANO DE OBRA</span>
                <p className="text-gray-600 text-[11px] leading-relaxed">
                  Acceso exclusivo a Recursos Humanos (ficha personal, carpetas, permisos) y Calendarios de faenas.
                </p>
              </div>
            </div>
          </div>

          {/* Tabla Unificada de Usuarios y Calendarios */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-gray-200 font-extrabold text-sm text-[#213343] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#f97316]" />
                <span>Usuarios Registrados ({usersList.length})</span>
              </div>
              <span className="text-xs font-semibold text-gray-400">
                Sincronización 1-a-1 con Recursos Humanos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="hg-list-table w-full text-left text-xs min-w-[950px]">
                <thead className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="py-3.5 px-4">Usuario / Nombre</th>
                    <th className="py-3.5 px-4">Correo Electrónico</th>
                    <th className="py-3.5 px-4">Rol de Acceso</th>
                    <th className="py-3.5 px-4 text-center">Cal. Visitas</th>
                    <th className="py-3.5 px-4 text-center">Cal. Producción</th>
                    <th className="py-3.5 px-4 text-center">Cal. Reventa</th>
                    <th className="py-3.5 px-4 text-center">Estado</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[#213343]">
                  {paginatedUsers.map((usr) => (
                    <tr key={usr.id} className="hover:bg-orange-50/30 transition">
                      {/* Usuario / Nombre */}
                      <td className="py-3 px-4 font-bold text-[#213343] flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-[#213343] text-white rounded-md flex items-center justify-center font-black text-xs">
                          <UserRound className="w-4 h-4" />
                        </div>
                        <span>{usr.nombre}</span>
                      </td>

                      {/* Correo Electrónico */}
                      <td className="py-3 px-4 text-gray-700 font-mono font-medium">{usr.email}</td>

                      {/* Rol de Acceso */}
                      <td className="py-3 px-4">
                        <select
                          value={usr.rol}
                          onChange={(e) => updateUserRole(usr.id, e.target.value as UserRole, usr.activo)}
                          className="bg-white text-[#213343] font-bold text-xs border border-gray-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#f97316] cursor-pointer"
                        >
                          <option value="admin">Administrador</option>
                          <option value="user">Ejecutivo Comercial</option>
                          <option value="mano_obra">Mano de Obra</option>
                        </select>
                      </td>

                      {/* Cal. Visitas Toggle (Naranja) */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleUserCalendar(usr.id, 'calendario_visitas', usr.calendario_visitas)}
                          className="cursor-pointer"
                          title="Activar/Desactivar presencia en Calendario de Visitas a Terreno"
                        >
                          {(usr.calendario_visitas ?? true) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#f97316] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4 text-[#f97316]" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Cal. Producción Toggle (Naranja) */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleUserCalendar(usr.id, 'calendario_produccion', usr.calendario_produccion)}
                          className="cursor-pointer"
                          title="Activar/Desactivar presencia en Calendario de Producción & Logística"
                        >
                          {(usr.calendario_produccion ?? true) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#f97316] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4 text-[#f97316]" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Cal. Reventa Toggle (Naranja) */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleUserCalendar(usr.id, 'calendario_reventa', usr.calendario_reventa)}
                          className="cursor-pointer"
                          title="Activar/Desactivar presencia en Calendario de Reventa & Logística"
                        >
                          {(usr.calendario_reventa ?? true) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#f97316] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                              <ToggleRight className="w-4 h-4 text-[#f97316]" />
                              <span>Activo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                              <span>Oculto</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4 text-center">
                        {usr.activo ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 bg-red-100 border border-red-300 px-2.5 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3 text-red-600" /> Inactivo
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditUser(usr)}
                            className="p-1.5 bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white rounded-md transition border border-orange-200 cursor-pointer"
                            title="Editar Usuario"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => updateUserRole(usr.id, usr.rol, !usr.activo)}
                            className={`text-xs px-2.5 py-1 rounded-md font-bold transition cursor-pointer ${
                              usr.activo
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {usr.activo ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            onClick={() => setUserToDelete(usr)}
                            className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-md transition border border-red-200 cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={userCurrentPage}
              totalItems={usersList.length}
              itemsPerPage={userItemsPerPage}
              onPageChange={setUserCurrentPage}
              onItemsPerPageChange={setUserItemsPerPage}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: CAMPOS PERSONALIZADOS DEL SISTEMA              */}
      {/* ========================================================= */}
      {mainTab === 'campos' && (
        <div className="space-y-4 ">
          {/* Sub-Pestañas de Entidades */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <button
              onClick={() => setActiveEntityTab('clientes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeEntityTab === 'clientes'
                  ? 'bg-orange-100 text-[#f97316]'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Clientes & Contactos</span>
            </button>

            <button
              onClick={() => setActiveEntityTab('oportunidades')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeEntityTab === 'oportunidades'
                  ? 'bg-orange-100 text-[#f97316]'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Oportunidades & Pipeline</span>
            </button>

            <button
              onClick={() => setActiveEntityTab('cotizaciones')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeEntityTab === 'cotizaciones'
                  ? 'bg-orange-100 text-[#f97316]'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Cotizaciones</span>
            </button>
          </div>

          {/* Tabla de Campos */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="hg-list-table w-full text-left text-xs min-w-[700px]">
                <thead className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="py-3.5 px-4">Etiqueta / Nombre Visible</th>
                    <th className="py-3.5 px-4">Columna en Base de Datos</th>
                    <th className="py-3.5 px-4">Tipo de Dato</th>
                    <th className="py-3.5 px-4">Opciones</th>
                    <th className="py-3.5 px-4 text-center">Estado</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[#213343]">
                  {filteredFields.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                        No hay campos configurados para esta sección.
                      </td>
                    </tr>
                  ) : (
                    filteredFields.map((f, idx) => (
                      <tr key={`${f.entidad}-${f.campo_supabase}-${f.id || idx}`} className="hover:bg-orange-50/30 transition">
                        <td className="py-3.5 px-4 font-extrabold text-[#213343]">
                          {f.nombre}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-gray-600">
                          <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200 text-[11px]">
                            {f.campo_supabase}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-700 capitalize flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-[#f97316]" />
                          <span>{f.tipo}</span>
                        </td>
                        <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                          {f.opciones && f.opciones.length > 0 ? f.opciones.join(', ') : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleActive(f.id)}
                            className="text-xs font-bold focus:outline-none cursor-pointer"
                          >
                            {f.activo ? (
                              <span className="text-emerald-700 font-black flex items-center justify-center gap-1">
                                <ToggleRight className="w-5 h-5 text-emerald-600" />
                                <span>Activo</span>
                              </span>
                            ) : (
                              <span className="text-gray-400 font-medium flex items-center justify-center gap-1">
                                <ToggleLeft className="w-5 h-5 text-gray-400" />
                                <span>Oculto</span>
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleEditField(f)}
                            className="p-1.5 bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white rounded-md transition border border-orange-200 cursor-pointer"
                            title="Editar Campo"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {!f.es_sistema && (
                            <button
                              onClick={() => handleDeleteField(f.id)}
                              className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-md transition border border-red-200 cursor-pointer"
                              title="Eliminar Campo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: REGISTRAR NUEVO USUARIO                            */}
      {/* ========================================================= */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-extrabold text-[#213343] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#f97316]" />
                <span>Registrar Nuevo Usuario</span>
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-[#213343] text-lg font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={userNombre}
                  onChange={(e) => setUserNombre(e.target.value)}
                  placeholder="Ej. Marco Antonio"
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="usuario@hormiglass.cl"
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Contraseña Inicial *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Rol y Accesos *</label>
                <select
                  value={userRol}
                  onChange={(e) => setUserRol(e.target.value as UserRole)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316] cursor-pointer"
                >
                  <option value="mano_obra">Mano de Obra</option>
                  <option value="user">Ejecutivo Comercial</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {/* Toggles de los 3 Calendarios */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <span className="text-[11px] font-bold text-gray-500 block uppercase tracking-normal">
                  Asignación en los 3 Calendarios:
                </span>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={userCalVisitas}
                    onChange={(e) => setUserCalVisitas(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Visitas a Terreno</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={userCalProduccion}
                    onChange={(e) => setUserCalProduccion(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Producción, Obras & Fabricación</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={userCalReventa}
                    onChange={(e) => setUserCalReventa(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Reventa & Logística</span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm cursor-pointer"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EDITAR USUARIO                                     */}
      {/* ========================================================= */}
      {showEditUserModal && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50  text-[#213343]">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#f97316]" />
                <span>Editar Usuario & Calendarios</span>
              </h3>
              <button
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUser(null);
                }}
                className="text-gray-400 hover:text-[#213343] font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={editUserNombre}
                  onChange={(e) => setEditUserNombre(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-medium text-[#213343] focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Correo Electrónico (Solo Lectura)</label>
                <input
                  type="email"
                  disabled
                  value={editingUser.email}
                  className="w-full bg-gray-100 border border-gray-200 rounded-md px-3 py-2 font-mono text-gray-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Rol de Acceso / Permisos</label>
                <select
                  value={editUserRol}
                  onChange={(e) => setEditUserRol(e.target.value as UserRole)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
                >
                  <option value="admin">Administrador</option>
                  <option value="user">Ejecutivo Comercial</option>
                  <option value="mano_obra">Mano de Obra</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Estado de la Cuenta</label>
                <select
                  value={editUserActivo ? 'true' : 'false'}
                  onChange={(e) => setEditUserActivo(e.target.value === 'true')}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold text-[#213343] focus:outline-none focus:border-[#f97316] cursor-pointer"
                >
                  <option value="true">Activo (Acceso Permitido)</option>
                  <option value="false">Inactivo / Bloqueado</option>
                </select>
              </div>

              {/* Toggles de los 3 Calendarios */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <span className="text-[11px] font-bold text-gray-500 block uppercase tracking-normal">
                  Asignación en los 3 Calendarios:
                </span>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={editUserCalVisitas}
                    onChange={(e) => setEditUserCalVisitas(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Visitas a Terreno</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={editUserCalProduccion}
                    onChange={(e) => setEditUserCalProduccion(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Producción, Obras & Fabricación</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-700 hover:text-[#f97316]">
                  <input
                    type="checkbox"
                    checked={editUserCalReventa}
                    onChange={(e) => setEditUserCalReventa(e.target.checked)}
                    className="w-4 h-4 accent-[#F7931F] rounded"
                  />
                  <span>Disponible para Reventa & Logística</span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CONFIRMAR ELIMINACIÓN DE USUARIO                   */}
      {/* ========================================================= */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Usuario</span>
              </h3>
              <button onClick={() => setUserToDelete(null)} className="text-gray-400 hover:text-[#213343] font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar permanentemente al usuario <strong className="text-[#213343]">{userToDelete.nombre}</strong> (<span className="font-mono text-gray-900">{userToDelete.email}</span>)?
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-md transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmar Eliminación</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREAR / EDITAR CAMPO PERSONALIZADO                 */}
      {/* ========================================================= */}
      {showFieldModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#f97316]" />
                <span>{editingField ? 'Editar Campo' : 'Nuevo Campo Personalizado'}</span>
              </h3>
              <button onClick={() => setShowFieldModal(false)} className="text-gray-400 hover:text-[#213343] font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveField} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre / Etiqueta Visible *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Tipo de Vidrio Especial"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Columna en Base de Datos *</label>
                <input
                  type="text"
                  required
                  disabled={editingField?.es_sistema}
                  placeholder="ej. tipo_vidrio_especial"
                  value={campoSupabase}
                  onChange={(e) => setCampoSupabase(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono text-gray-700 focus:outline-none focus:border-[#f97316] disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Módulo / Sección *</label>
                <select
                  value={entidad}
                  onChange={(e) => setEntidad(e.target.value as any)}
                  disabled={!!editingField}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] disabled:bg-gray-100 cursor-pointer"
                >
                  <option value="clientes">Clientes & Contactos</option>
                  <option value="oportunidades">Oportunidades & Pipeline</option>
                  <option value="cotizaciones">Cotizaciones</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Tipo de Campo *</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as any)}
                  disabled={editingField?.es_sistema}
                  className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] disabled:bg-gray-100 cursor-pointer"
                >
                  <option value="texto">Texto Simple</option>
                  <option value="numero">Número</option>
                  <option value="fecha">Fecha</option>
                  <option value="opciones">Lista Desplegable (Opciones)</option>
                  <option value="archivo">Archivo / Documento</option>
                </select>
              </div>

              {tipo === 'opciones' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Opciones (Separadas por coma) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Opción 1, Opción 2, Opción 3"
                    value={opcionesInput}
                    onChange={(e) => setOpcionesInput(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                  />
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowFieldModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingField ? 'Guardar Cambios' : 'Crear Campo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
