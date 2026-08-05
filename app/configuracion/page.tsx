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
  TrendingUp,
  Database,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  UserPlus,
  Mail,
  User,
  Sliders,
} from 'lucide-react';

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
  { id: 'sys-op-visita-tec', nombre: 'Técnico Asignado a Visita', campo_supabase: 'tecnico_visita', entidad: 'oportunidades', tipo: 'opciones', opciones: ['Felipe Valverde', 'Marcos Catalán', 'Edith Tapia'], es_sistema: true, activo: true },
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
  const { currentUser, usersList, addUser, updateUserRole, deleteUser } = useAuth();
  const supabase = createClient();

  // Top Section Mode (Campos vs Usuarios)
  const [mainTab, setMainTab] = useState<'campos' | 'usuarios'>('campos');

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

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('ventas');
  const [userToDelete, setUserToDelete] = useState<Usuario | null>(null);
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

        if (error || !data || data.length === 0) {
          // Seed defaults into Supabase
          await supabase.from('campos_personalizados').upsert(defaultSeed);
          setFields(defaultSeed);
        } else {
          // Check if any system fields from defaultSeed are missing in DB
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

  // Protección: Solo Admin puede acceder
  if (currentUser?.rol !== 'admin') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-8 rounded-2xl text-center space-y-3 my-8 shadow-sm">
        <AlertTriangle className="w-12 h-12 mx-auto text-red-500" />
        <h2 className="text-xl font-extrabold text-red-900">Acceso Restringido</h2>
        <p className="text-xs text-red-700">
          Solo los usuarios con rol <strong>Administrador</strong> tienen permisos para acceder a la configuración del sistema.
        </p>
      </div>
    );
  }

  // Handle Field Saving in Supabase
  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const opcArray = tipo === 'opciones' ? opcionesInput.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const keySupabase = campoSupabase.trim() || nombre.toLowerCase().replace(/\s+/g, '_');

    if (editingField) {
      const updatedField: FieldDefinition = {
        ...editingField,
        nombre: nombre.trim(),
        campo_supabase: keySupabase,
        entidad,
        tipo,
        opciones: opcArray,
      };

      setFields((prev) => prev.map((f) => (f.id === editingField.id ? updatedField : f)));
      setSuccessMsg(`Campo "${nombre}" actualizado correctamente en Supabase.`);

      try {
        await supabase
          .from('campos_personalizados')
          .update({
            nombre: updatedField.nombre,
            campo_supabase: updatedField.campo_supabase,
            entidad: updatedField.entidad,
            tipo: updatedField.tipo,
            opciones: updatedField.opciones,
          })
          .eq('id', editingField.id);

        await logSistema({
          tipo_accion: 'actualizacion',
          entidad: 'sistema',
          entidad_id: editingField.id,
          descripcion: `Campo personalizado "${nombre}" actualizado`,
          usuario_id: currentUser?.id,
          datos_nuevos: updatedField,
        });
      } catch (err) {
        console.error('Error updating field in Supabase:', err);
      }
    } else {
      const newF: FieldDefinition = {
        id: `cf-${Date.now()}`,
        nombre: nombre.trim(),
        campo_supabase: keySupabase,
        entidad,
        tipo,
        opciones: opcArray,
        es_sistema: false,
        activo: true,
      };

      setFields((prev) => [...prev, newF]);
      setSuccessMsg(`Campo "${nombre}" creado y guardado exitosamente en Supabase.`);

      try {
        await supabase.from('campos_personalizados').insert([newF]);

        await logSistema({
          tipo_accion: 'creacion',
          entidad: 'sistema',
          entidad_id: newF.id,
          descripcion: `Nuevo campo personalizado "${nombre}" creado para ${entidad}`,
          usuario_id: currentUser?.id,
          datos_nuevos: newF,
        });
      } catch (err) {
        console.error('Error inserting new field into Supabase:', err);
      }
    }

    setShowFieldModal(false);
    setEditingField(null);
    setNombre('');
    setCampoSupabase('');
    setOpcionesInput('');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleToggleActive = async (id: string) => {
    const target = fields.find((f) => f.id === id);
    if (!target) return;
    const newStatus = !target.activo;

    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, activo: newStatus } : f))
    );

    try {
      await supabase
        .from('campos_personalizados')
        .update({ activo: newStatus })
        .eq('id', id);
    } catch (err) {
      console.error('Error toggling field status in Supabase:', err);
    }
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

  const handleDeleteField = async (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSuccessMsg('Campo eliminado permanentemente de Supabase.');

    try {
      await supabase.from('campos_personalizados').delete().eq('id', id);
    } catch (err) {
      console.error('Error deleting field from Supabase:', err);
    }

    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Handle User Creation & Deletion
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userNombre || !userEmail) return;

    await addUser({
      nombre: userNombre,
      email: userEmail,
      rol: userRol,
      activo: true,
    });

    setSuccessMsg(`Usuario ${userEmail} registrado exitosamente en Supabase.`);
    setUserNombre('');
    setUserEmail('');
    setUserRol('ventas');
    setShowUserModal(false);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    await deleteUser(userToDelete.id);
    setSuccessMsg(`Usuario ${userToDelete.nombre} (${userToDelete.email}) eliminado permanentemente de Supabase.`);
    setUserToDelete(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const filteredFields = fields.filter((f) => f.entidad === activeEntityTab);
  const paginatedUsers = usersList.slice(
    (userCurrentPage - 1) * userItemsPerPage,
    userCurrentPage * userItemsPerPage
  );

  return (
    <div className="space-y-6 text-[#363636]">
      {/* Header General de Configuración */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2">
            <Settings className="w-6 h-6 text-[#F7931F]" />
            <span>Configuración General del Sistema</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Gestión centralizada de usuarios, accesos, roles y mapeo de campos de la base de datos de Supabase.
          </p>
        </div>

        {/* Botón según pestaña principal activa */}
        {mainTab === 'campos' ? (
          <button
            onClick={() => {
              setEditingField(null);
              setNombre('');
              setCampoSupabase('');
              setEntidad(activeEntityTab);
              setTipo('texto');
              setOpcionesInput('');
              setShowFieldModal(true);
            }}
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Nuevo Campo</span>
          </button>
        ) : (
          <button
            onClick={() => setShowUserModal(true)}
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 self-start md:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Nuevo Usuario</span>
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Selector de Pestaña Principal (Campos vs Usuarios) */}
      <div className="flex gap-2 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 text-xs font-extrabold w-fit">
        <button
          onClick={() => setMainTab('campos')}
          className={`px-5 py-2.5 rounded-xl transition flex items-center gap-2 ${
            mainTab === 'campos'
              ? 'bg-[#F7931F] text-white shadow-xs'
              : 'text-gray-600 hover:text-[#363636]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Configuración & Mapeo de Campos</span>
        </button>

        <button
          onClick={() => setMainTab('usuarios')}
          className={`px-5 py-2.5 rounded-xl transition flex items-center gap-2 ${
            mainTab === 'usuarios'
              ? 'bg-[#F7931F] text-white shadow-xs'
              : 'text-gray-600 hover:text-[#363636]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Usuarios y Accesos ({usersList.length})</span>
        </button>
      </div>

      {/* CONTENIDO PESTAÑA 1: CAMPOS DE SUPABASE */}
      {mainTab === 'campos' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Tabs por Entidad */}
          <div className="flex gap-2 border-b border-gray-200 text-xs font-bold">
            <button
              onClick={() => setActiveEntityTab('clientes')}
              className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition ${
                activeEntityTab === 'clientes'
                  ? 'border-[#F7931F] text-[#F7931F]'
                  : 'border-transparent text-gray-500 hover:text-[#363636]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Campos de Clientes ({fields.filter((f) => f.entidad === 'clientes').length})</span>
            </button>

            <button
              onClick={() => setActiveEntityTab('oportunidades')}
              className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition ${
                activeEntityTab === 'oportunidades'
                  ? 'border-[#F7931F] text-[#F7931F]'
                  : 'border-transparent text-gray-500 hover:text-[#363636]'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Campos de Oportunidades ({fields.filter((f) => f.entidad === 'oportunidades').length})</span>
            </button>

            <button
              onClick={() => setActiveEntityTab('cotizaciones')}
              className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition ${
                activeEntityTab === 'cotizaciones'
                  ? 'border-[#F7931F] text-[#F7931F]'
                  : 'border-transparent text-gray-500 hover:text-[#363636]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Campos de Cotizaciones ({fields.filter((f) => f.entidad === 'cotizaciones').length})</span>
            </button>
          </div>

          {/* Tabla de Campos */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#363636] text-white uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3.5 px-6">Etiqueta del Campo</th>
                  <th className="py-3.5 px-6">Columna Supabase</th>
                  <th className="py-3.5 px-6">Tipo</th>
                  <th className="py-3.5 px-6">Opciones / Detalles</th>
                  <th className="py-3.5 px-6 text-center">Estado</th>
                  <th className="py-3.5 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-[#363636]">
                {filteredFields.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                      No hay campos configurados para esta sección.
                    </td>
                  </tr>
                ) : (
                  filteredFields.map((f, idx) => (
                    <tr key={`${f.entidad}-${f.campo_supabase}-${f.id || idx}`} className="hover:bg-orange-50/40 transition">
                      <td className="py-4 px-6 font-extrabold text-[#363636]">
                        {f.nombre}
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-gray-600">
                        <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded border border-gray-200">
                          {f.campo_supabase}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold text-gray-700 capitalize flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-[#F7931F]" />
                        <span>{f.tipo}</span>
                      </td>
                      <td className="py-4 px-6 text-gray-500 text-[11px]">
                        {f.opciones && f.opciones.length > 0 ? f.opciones.join(', ') : '-'}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleToggleActive(f.id)}
                          className="text-xs font-bold focus:outline-none"
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
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleEditField(f)}
                          className="p-1.5 bg-orange-50 hover:bg-[#F7931F] text-[#F7931F] hover:text-white rounded-lg transition border border-orange-200"
                          title="Editar Campo"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        {!f.es_sistema && (
                          <button
                            onClick={() => handleDeleteField(f.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-lg transition border border-red-200"
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
      )}

      {/* CONTENIDO PESTAÑA 2: USUARIOS Y ACCESOS */}
      {mainTab === 'usuarios' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Matriz Informativa de Roles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
              <span className="font-extrabold text-red-600 block mb-1">ADMIN</span>
              <p className="text-gray-600 text-[11px]">Acceso total a todos los módulos y configuración del sistema.</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
              <span className="font-extrabold text-blue-600 block mb-1">VENTAS</span>
              <p className="text-gray-600 text-[11px]">Directorio de clientes, creación de cotizaciones e ingreso a pipeline.</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
              <span className="font-extrabold text-emerald-600 block mb-1">FINANZAS</span>
              <p className="text-gray-600 text-[11px]">Validación de pagos, facturación, movimientos de caja y OC proveedores.</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
              <span className="font-extrabold text-purple-600 block mb-1">ADMINISTRACIÓN</span>
              <p className="text-gray-600 text-[11px]">Control previo, registro de comisiones y pólizas de garantía.</p>
            </div>
            <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
              <span className="font-extrabold text-amber-600 block mb-1">PROGRAMACIÓN</span>
              <p className="text-gray-600 text-[11px]">Agenda de despachos, orden de fabricación e instalaciones.</p>
            </div>
          </div>

          {/* Tabla de Usuarios */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-visible shadow-sm">
            <div className="p-4 border-b border-gray-200 font-extrabold text-sm text-[#363636] flex items-center justify-between">
              <span>Usuarios Registrados en Supabase ({usersList.length})</span>
              <span className="text-xs font-semibold text-gray-500">Edición en tiempo real</span>
            </div>

            <div className="overflow-visible">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-[#363636] text-white uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Usuario / Nombre</th>
                    <th className="p-3.5">Correo Electrónico</th>
                    <th className="p-3.5">Rol de Acceso / Permisos</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-[#363636]">
                  {paginatedUsers.map((usr) => (
                    <tr key={usr.id} className="hover:bg-orange-50/50 transition">
                      <td className="p-3.5 font-bold text-[#363636] flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#363636] text-white rounded-lg flex items-center justify-center font-black text-xs">
                          {usr.nombre.charAt(0)}
                        </div>
                        <span>{usr.nombre}</span>
                      </td>
                      <td className="p-3.5 text-gray-700 font-mono font-medium">{usr.email}</td>
                      <td className="p-3.5">
                        <select
                          value={usr.rol}
                          onChange={(e) => updateUserRole(usr.id, e.target.value as UserRole, usr.activo)}
                          className="bg-white text-[#363636] font-bold text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#F7931F] cursor-pointer"
                        >
                          <option value="admin">Admin (Acceso Total)</option>
                          <option value="ventas">Ventas (Comercial)</option>
                          <option value="finanzas">Finanzas (Facturación & Caja)</option>
                          <option value="administracion">Administración (Control & Pólizas)</option>
                          <option value="programacion">Programación (Agenda & Logística)</option>
                        </select>
                      </td>
                      <td className="p-3.5">
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
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateUserRole(usr.id, usr.rol, !usr.activo)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-bold transition ${
                              usr.activo
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {usr.activo ? 'Desactivar' : 'Activar'}
                          </button>

                          <button
                            onClick={() => setUserToDelete(usr)}
                            className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-lg transition border border-red-200"
                            title="Eliminar usuario permanentemente de Supabase"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Modal Crear / Editar Campo */}
      {showFieldModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#F7931F]" />
                <span>{editingField ? 'Editar Campo' : 'Crear & Cruzar Nuevo Campo'}</span>
              </h3>
              <button onClick={() => setShowFieldModal(false)} className="text-gray-400 hover:text-[#363636] font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveField} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre / Etiqueta del Campo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Giro Comercial, Orden de Compra Interna"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Columna Supabase (Key DB)</label>
                <input
                  type="text"
                  placeholder="ej. giro_comercial, orden_compra_cliente"
                  value={campoSupabase}
                  onChange={(e) => setCampoSupabase(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 font-mono text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Sección / Módulo *</label>
                <select
                  value={entidad}
                  onChange={(e) => setEntidad(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-semibold focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="clientes">Clientes</option>
                  <option value="oportunidades">Oportunidades de Venta</option>
                  <option value="cotizaciones">Cotizaciones</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Tipo de Dato *</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as any)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-semibold focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="texto">Texto Simple</option>
                  <option value="numero">Número / Monto</option>
                  <option value="fecha">Fecha</option>
                  <option value="opciones">Lista Desplegable de Opciones</option>
                  <option value="archivo">Archivo Adjunto / Documento</option>
                  <option value="relacion">Relación / Clave Foránea</option>
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
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                  />
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowFieldModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingField ? 'Guardar Cambios' : 'Crear Campo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Usuario */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#F7931F]" />
                <span>Registrar Nuevo Usuario en Supabase</span>
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-[#363636] text-lg font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={userNombre}
                  onChange={(e) => setUserNombre(e.target.value)}
                  placeholder="Ej. Mariela Valverde"
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
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
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Rol y Accesos *</label>
                <select
                  value={userRol}
                  onChange={(e) => setUserRol(e.target.value as UserRole)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-semibold focus:outline-none focus:border-[#F7931F]"
                >
                  <option value="ventas">Ventas (Comercial)</option>
                  <option value="finanzas">Finanzas (Facturación & Caja)</option>
                  <option value="administracion">Administración (Control)</option>
                  <option value="programacion">Programación (Agenda & Logística)</option>
                  <option value="admin">Admin (Acceso Total)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md"
                >
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmación Eliminación de Usuario */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Usuario de Supabase</span>
              </h3>
              <button onClick={() => setUserToDelete(null)} className="text-gray-400 hover:text-[#363636] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar permanentemente al usuario <strong className="text-[#363636]">{userToDelete.nombre}</strong> (<span className="font-mono text-gray-900">{userToDelete.email}</span>)?
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirmar Eliminación</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
