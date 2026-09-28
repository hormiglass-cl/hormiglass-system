'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import {
  Trabajador,
  EstadoDisponibilidad,
  CARGOS_RRHH_DEFAULT,
  AREAS_RRHH_DEFAULT,
  Usuario,
  UserRole,
  ROL_NOMBRE,
} from '../../lib/types';
import {
  Users,
  UserCheck,
  Plus,
  Search,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  HardHat,
  ChevronRight,
  Eye,
  UserX,
  Grid,
  List,
  X,
  Save,
  Lock,
  UserRound,
} from 'lucide-react';
import { TODAS_COMUNAS_CHILE } from '../../lib/chile-data';
import { SearchableSelect } from '../../components/SearchableSelect';
import { mensajeError } from '../../lib/errores';

// Configuración visual de los estados de disponibilidad
const DISPONIBILIDAD_CONFIG: Record<
  EstadoDisponibilidad,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  disponible: {
    label: 'Disponible',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  en_terreno: {
    label: 'En terreno / obra',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  permiso: {
    label: 'En permiso',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  licencia: {
    label: 'Licencia médica',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  vacaciones: {
    label: 'Vacaciones',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
  },
  falta: {
    label: 'Falta / ausente',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
};

const USER_ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: {
    label: ROL_NOMBRE.admin,
    className: 'bg-red-50 text-red-800 border-red-200',
  },
  user: {
    label: ROL_NOMBRE.user,
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  mano_obra: {
    label: ROL_NOMBRE.mano_obra,
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

export default function RecursosHumanosPage() {
  const { addUser, currentUser, updateUserRole } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = currentUser?.rol === 'admin';

  const [loading, setLoading] = useState(true);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDisponibilidad, setFilterDisponibilidad] = useState<string>('todos');
  const [filterArea, setFilterArea] = useState<string>('todas');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Modal Nuevo Trabajador
  const [showNewWorkerModal, setShowNewWorkerModal] = useState(false);
  const [savingNewWorker, setSavingNewWorker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modo de cuenta de usuario al crear trabajador
  const [workerAccountMode, setWorkerAccountMode] = useState<'create' | 'link'>('create');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('mano_obra');
  const [newUserPassword, setNewUserPassword] = useState<string>('Hormiglass2026!');

  const [newWorker, setNewWorker] = useState<{
    nombre: string;
    rut: string;
    email: string;
    telefono: string;
    direccion: string;
    comuna: string;
    region: string;
    cargo: string;
    area: string;
    tipo_contrato: string;
    fecha_ingreso: string;
    sueldo_base: string;
    estado_disponibilidad: EstadoDisponibilidad;
    contacto_emergencia_nombre: string;
    contacto_emergencia_telefono: string;
    banco: string;
    tipo_cuenta: string;
    numero_cuenta: string;
    observaciones: string;
  }>({
    nombre: '',
    rut: '',
    email: '',
    telefono: '',
    direccion: '',
    comuna: 'San Bernardo',
    region: 'Metropolitana de Santiago',
    cargo: 'Maestro de Obra & Instalación',
    area: 'Operaciones & Terreno',
    tipo_contrato: 'Indefinido',
    fecha_ingreso: new Date().toISOString().split('T')[0],
    sueldo_base: '',
    estado_disponibilidad: 'disponible',
    contacto_emergencia_nombre: '',
    contacto_emergencia_telefono: '',
    banco: 'BancoEstado',
    tipo_cuenta: 'Cuenta Rut',
    numero_cuenta: '',
    observaciones: '',
  });

  // Carga de datos en vivo desde Supabase
  const loadTrabajadores = useCallback(async () => {
    try {
      const [trabRes, userRes] = await Promise.all([
        supabase
          .from('trabajadores')
          .select('*, documentos:trabajador_documentos(*), permisos:trabajador_permisos_ausencias(*), liquidaciones:trabajador_liquidaciones_sueldos(*)')
          .order('nombre', { ascending: true }),
        supabase.from('usuarios').select('*').eq('activo', true),
      ]);

      if (trabRes.data) {
        setTrabajadores(trabRes.data as Trabajador[]);
      } else {
        setTrabajadores([]);
      }

      if (userRes.data) {
        setUsuarios(userRes.data as Usuario[]);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error cargando trabajadores de Supabase:', err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const loadTimeout = window.setTimeout(() => {
      loadTrabajadores();
    }, 0);

    // Supabase Realtime
    const channel = supabase
      .channel('rrhh_trabajadores_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajadores' }, () => loadTrabajadores())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => loadTrabajadores())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_permisos_ausencias' }, () => loadTrabajadores())
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeout);
      supabase.removeChannel(channel);
    };
  }, [loadTrabajadores, supabase]);

  // Actualizar disponibilidad rápida desde la vista
  const handleUpdateDisponibilidad = async (id: string, nuevoEstado: EstadoDisponibilidad) => {
    try {
      setTrabajadores((prev) =>
        prev.map((t) => (t.id === id ? { ...t, estado_disponibilidad: nuevoEstado } : t))
      );

      const { error } = await supabase
        .from('trabajadores')
        .update({ estado_disponibilidad: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        console.error('Error actualizando disponibilidad:', error);
        loadTrabajadores();
      }
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const handleUpdateTipoUsuario = async (usuario: Usuario, nuevoRol: UserRole) => {
    if (!isAdmin || usuario.rol === nuevoRol) return;

    const previousUsuarios = usuarios;
    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, rol: nuevoRol } : u))
    );

    try {
      await updateUserRole(usuario.id, nuevoRol, usuario.activo);
    } catch (err) {
      console.error('Error actualizando tipo de usuario:', err);
      setUsuarios(previousUsuarios);
      alert(mensajeError(err, 'No se pudo actualizar el tipo de usuario.'));
    }
  };

  // Crear nuevo trabajador vinculado a usuario
  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newWorker.nombre.trim() || !newWorker.rut.trim() || !newWorker.cargo.trim()) {
      setFormError('Nombre, RUT y cargo son obligatorios.');
      return;
    }

    if (!newWorker.email.trim()) {
      setFormError('El correo electrónico es obligatorio para vincular la cuenta de usuario.');
      return;
    }

    setSavingNewWorker(true);
    try {
      let finalUserId: string | null = null;

      if (workerAccountMode === 'link') {
        if (!selectedUserId) {
          setFormError('Debes seleccionar un usuario registrado para vincular.');
          setSavingNewWorker(false);
          return;
        }
        finalUserId = selectedUserId;
      } else {
        // Modo Crear Nueva Cuenta de Usuario
        if (!newUserPassword || newUserPassword.length < 6) {
          setFormError('La contraseña debe tener al menos 6 caracteres.');
          setSavingNewWorker(false);
          return;
        }

        // Crear usuario en Auth y public.usuarios
        try {
          await addUser({
            nombre: newWorker.nombre.trim(),
            email: newWorker.email.trim(),
            password: newUserPassword,
            rol: newUserRole,
            activo: true,
          });

          // Obtener el ID del usuario recién creado
          const { data: createdUser } = await supabase
            .from('usuarios')
            .select('id')
            .eq('email', newWorker.email.trim())
            .single();

          if (createdUser?.id) {
            finalUserId = createdUser.id;
          }
        } catch (authErr: unknown) {
          // Si el usuario ya existe, intentamos vincularlo
          const { data: existingUser } = await supabase
            .from('usuarios')
            .select('id')
            .eq('email', newWorker.email.trim())
            .single();

          if (existingUser?.id) {
            finalUserId = existingUser.id;
          } else {
            throw authErr;
          }
        }
      }

      // Insertar en trabajadores
      const { error } = await supabase
        .from('trabajadores')
        .insert([
          {
            nombre: newWorker.nombre.trim(),
            rut: newWorker.rut.trim(),
            email: newWorker.email.trim() || null,
            telefono: newWorker.telefono.trim() || null,
            direccion: newWorker.direccion.trim() || null,
            comuna: newWorker.comuna,
            region: newWorker.region,
            cargo: newWorker.cargo,
            area: newWorker.area,
            tipo_contrato: newWorker.tipo_contrato,
            fecha_ingreso: newWorker.fecha_ingreso || null,
            sueldo_base: newWorker.sueldo_base ? Number(newWorker.sueldo_base) : 0,
            estado_disponibilidad: newWorker.estado_disponibilidad,
            contacto_emergencia_nombre: newWorker.contacto_emergencia_nombre.trim() || null,
            contacto_emergencia_telefono: newWorker.contacto_emergencia_telefono.trim() || null,
            banco: newWorker.banco.trim() || null,
            tipo_cuenta: newWorker.tipo_cuenta.trim() || null,
            numero_cuenta: newWorker.numero_cuenta.trim() || null,
            usuario_id: finalUserId,
            observaciones: newWorker.observaciones.trim() || null,
            activo: true,
          },
        ]);

      if (error) {
        setFormError(mensajeError(error, 'No se pudo guardar la ficha del colaborador.'));
        setSavingNewWorker(false);
        return;
      }

      setShowNewWorkerModal(false);
      setSavingNewWorker(false);
      loadTrabajadores();
    } catch (err: unknown) {
      setFormError(mensajeError(err, 'No se pudo guardar la ficha del colaborador.'));
      setSavingNewWorker(false);
    }
  };

  // Filtrado reactivo de trabajadores
  const filteredTrabajadores = useMemo(() => {
    return trabajadores.filter((t) => {
      // Búsqueda por texto
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = t.nombre.toLowerCase().includes(q);
        const matchRut = (t.rut || '').toLowerCase().includes(q);
        const matchCargo = (t.cargo || '').toLowerCase().includes(q);
        const matchEmail = (t.email || '').toLowerCase().includes(q);
        if (!matchName && !matchRut && !matchCargo && !matchEmail) return false;
      }

      // Filtro disponibilidad
      if (filterDisponibilidad !== 'todos') {
        if (t.estado_disponibilidad !== filterDisponibilidad) return false;
      }

      // Filtro área
      if (filterArea !== 'todas') {
        if (t.area !== filterArea) return false;
      }

      return true;
    });
  }, [trabajadores, searchQuery, filterDisponibilidad, filterArea]);

  // Cálculos de KPIs
  const totalColaboradores = trabajadores.length;
  const totalDisponibles = trabajadores.filter((t) => t.estado_disponibilidad === 'disponible').length;
  const totalEnTerreno = trabajadores.filter((t) => t.estado_disponibilidad === 'en_terreno').length;
  const totalAusentes = trabajadores.filter((t) =>
    ['permiso', 'licencia', 'vacaciones', 'falta'].includes(t.estado_disponibilidad)
  ).length;
  const totalNominaSueldos = trabajadores.reduce((sum, t) => sum + Number(t.sueldo_base || 0), 0);

  return (
    <div className="space-y-7 text-[#213343] pb-12 ">
      {/* ========================================================= */}
      {/* 1. CABECERA & ACCIÓN PRINCIPAL                            */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-orange-50 text-[#f97316]">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#213343] tracking-normal">
                Recursos Humanos
              </h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Directorio de colaboradores vinculados a cuentas de usuario, asistencia y carpetas laborales.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setFormError(null);
            setShowNewWorkerModal(true);
          }}
          className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2.5 rounded-lg font-black text-xs transition shadow-sm flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo colaborador</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 2. KPIS EJECUTIVOS DE RECURSOS HUMANOS                    */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Total Colaboradores */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Colaboradores</span>
            <div className="w-8 h-8 rounded-lg bg-gray-100 text-[#213343] flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-[#213343]">{totalColaboradores}</span>
            <span className="text-[11px] text-gray-400 font-medium block">Cuentas activas</span>
          </div>
        </div>

        {/* KPI 2: Disponibles en Planta */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">Disponibles</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-emerald-950">{totalDisponibles}</span>
            <span className="text-[11px] text-emerald-700 font-semibold block">Listos para faenas</span>
          </div>
        </div>

        {/* KPI 3: En Terreno / Obras */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800">En terreno</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-blue-950">{totalEnTerreno}</span>
            <span className="text-[11px] text-blue-700 font-semibold block">Instalación y visitas</span>
          </div>
        </div>

        {/* KPI 4: Permiso / Licencia / Vacaciones */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">Ausencias / Permisos</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-amber-950">{totalAusentes}</span>
            <span className="text-[11px] text-amber-700 font-semibold block">Permisos y licencias</span>
          </div>
        </div>

        {/* KPI 5: Nómina Total */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Nómina mensual</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#f97316] flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-black text-[#213343] truncate">
              ${totalNominaSueldos.toLocaleString('es-CL')}
            </span>
            <span className="text-[11px] text-gray-400 font-medium block">Sueldos base</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. BARRA DE FILTROS & BÚSQUEDA                            */}
      {/* ========================================================= */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        {/* Campo de búsqueda */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, RUT, cargo o correo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-4 py-2 font-bold text-xs focus:outline-none focus:border-[#f97316]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtros desplegables */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Filtro Disponibilidad */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-bold">Estado:</span>
            <select
              value={filterDisponibilidad}
              onChange={(e) => setFilterDisponibilidad(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 font-bold text-xs cursor-pointer focus:outline-none focus:border-[#f97316]"
            >
              <option value="todos">Todos los estados</option>
              <option value="disponible">Disponible</option>
              <option value="en_terreno">En terreno / obra</option>
              <option value="permiso">En permiso</option>
              <option value="licencia">Licencia médica</option>
              <option value="vacaciones">Vacaciones</option>
              <option value="falta">Falta / ausente</option>
            </select>
          </div>

          {/* Filtro Área */}
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 font-bold">Área:</span>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 font-bold text-xs cursor-pointer focus:outline-none focus:border-[#f97316]"
            >
              <option value="todas">Todas las áreas</option>
              {AREAS_RRHH_DEFAULT.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Vista (Tabla vs Grid) */}
          <div className="inline-flex bg-gray-100 p-1 rounded-md">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#f97316] shadow-xs' : 'text-gray-500 hover:text-[#213343]'
              }`}
              title="Vista de tabla"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-[#f97316] shadow-xs' : 'text-gray-500 hover:text-[#213343]'
              }`}
              title="Vista de tarjetas"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. LISTADO PRINCIPAL DE TRABAJADORES                     */}
      {/* ========================================================= */}
      {loading ? (
        <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
          Cargando colaboradores de Hormiglass...
        </div>
      ) : filteredTrabajadores.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center space-y-3">
          <UserX className="w-10 h-10 text-gray-300 mx-auto" />
          <h3 className="font-extrabold text-base text-[#213343]">
            No se encontraron colaboradores
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            No hay trabajadores que coincidan con los filtros seleccionados. Todos los colaboradores deben tener cuenta de usuario activa.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* VISTA DE TABLA */
        <div className="hg-list-group">
          <div className="overflow-x-auto">
            <table className="hg-list-table w-full min-w-[920px] text-left text-xs">
              <thead>
                <tr className="bg-gray-50/80 text-gray-500 font-bold border-b border-gray-200">
                  <th className="py-3.5 px-4">Colaborador</th>
                  <th className="py-3.5 px-4">Tipo de Usuario</th>
                  <th className="py-3.5 px-4">Cargo & Área</th>
                  <th className="py-3.5 px-4">Disponibilidad / Asistencia</th>
                  <th className="py-3.5 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[#213343]">
                {filteredTrabajadores.map((t) => {
                  const dispCfg =
                    DISPONIBILIDAD_CONFIG[t.estado_disponibilidad] ||
                    DISPONIBILIDAD_CONFIG.disponible;

                  const linkedUser = usuarios.find(
                    (u) =>
                      u.id === t.usuario_id ||
                      (t.email && u.email?.toLowerCase() === t.email?.toLowerCase())
                  );
                  const userRoleConfig = linkedUser ? USER_ROLE_CONFIG[linkedUser.rol] : null;

                  return (
                    <tr key={t.id} className="hover:bg-orange-50/30 transition group">
                      {/* 1. Colaborador */}
                      <td className="py-3 px-4">
                        <Link
                          href={`/rrhh/${t.id}`}
                          className="flex items-center gap-3 group-hover:text-[#f97316] transition"
                        >
                          <div className="w-9 h-9 rounded-lg bg-orange-500 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                            <UserRound className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-extrabold text-[#213343] block group-hover:text-[#f97316] transition">
                              {t.nombre}
                            </span>
                            <span className="font-mono text-[11px] text-gray-400">
                              RUT: {t.rut}
                            </span>
                          </div>
                        </Link>
                      </td>

                      {/* 3. Tipo de Usuario */}
                      <td className="py-3 px-4">
                        {linkedUser && userRoleConfig && isAdmin ? (
                          <select
                            value={linkedUser.rol}
                            onChange={(e) => handleUpdateTipoUsuario(linkedUser, e.target.value as UserRole)}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer focus:outline-none transition shadow-2xs ${userRoleConfig.className}`}
                          >
                            {Object.entries(USER_ROLE_CONFIG).map(([role, config]) => (
                              <option key={role} value={role}>
                                {config.label}
                              </option>
                            ))}
                          </select>
                        ) : userRoleConfig ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-block border ${userRoleConfig.className}`}>
                            {userRoleConfig.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">Sin tipo</span>
                        )}
                      </td>

                      {/* 4. Cargo & Área */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-[#213343] block">{t.cargo}</span>
                        <span className="text-[11px] text-gray-400 font-semibold">{t.area}</span>
                      </td>

                      {/* 5. Disponibilidad / Asistencia */}
                      <td className="py-3 px-4">
                        <select
                          value={t.estado_disponibilidad}
                          onChange={(e) =>
                            handleUpdateDisponibilidad(t.id, e.target.value as EstadoDisponibilidad)
                          }
                          className={`px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer focus:outline-none transition shadow-2xs ${dispCfg.bg} ${dispCfg.text} ${dispCfg.border}`}
                        >
                          <option value="disponible">Disponible</option>
                          <option value="en_terreno">En terreno / obra</option>
                          <option value="permiso">En permiso</option>
                          <option value="licencia">Licencia médica</option>
                          <option value="vacaciones">Vacaciones</option>
                          <option value="falta">Falta / ausente</option>
                        </select>
                      </td>

                      {/* 7. Acción */}
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/rrhh/${t.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gray-100 hover:bg-[#f97316] text-gray-700 hover:text-white font-bold transition text-xs cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver ficha</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA DE TARJETAS (GRID) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTrabajadores.map((t) => {
            const dispCfg =
              DISPONIBILIDAD_CONFIG[t.estado_disponibilidad] ||
              DISPONIBILIDAD_CONFIG.disponible;

            return (
              <div
                key={t.id}
                className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:border-[#f97316] transition flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-lg bg-orange-500 text-white font-black text-base flex items-center justify-center shadow-xs">
                      <UserRound className="w-6 h-6" />
                    </div>

                    <select
                      value={t.estado_disponibilidad}
                      onChange={(e) =>
                        handleUpdateDisponibilidad(t.id, e.target.value as EstadoDisponibilidad)
                      }
                      className={`px-2.5 py-1 rounded-md text-xs font-bold border cursor-pointer focus:outline-none transition shadow-2xs ${dispCfg.bg} ${dispCfg.text} ${dispCfg.border}`}
                    >
                      <option value="disponible">Disponible</option>
                      <option value="en_terreno">En terreno</option>
                      <option value="permiso">Permiso</option>
                      <option value="licencia">Licencia</option>
                      <option value="vacaciones">Vacaciones</option>
                      <option value="falta">Falta</option>
                    </select>
                  </div>

                  <Link href={`/rrhh/${t.id}`} className="group">
                    <h3 className="font-black text-base text-[#213343] group-hover:text-[#f97316] transition">
                      {t.nombre}
                    </h3>
                    <p className="font-mono text-xs text-gray-400">RUT: {t.rut}</p>
                  </Link>

                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 font-semibold">Cargo:</span>
                      <span className="font-bold text-[#213343] truncate max-w-[180px]">
                        {t.cargo}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 font-semibold">Sueldo base:</span>
                      <span className="font-bold font-mono text-[#f97316]">
                        ${Number(t.sueldo_base || 0).toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    Ingreso: {t.fecha_ingreso || 'No registrado'}
                  </span>
                  <Link
                    href={`/rrhh/${t.id}`}
                    className="text-xs font-bold text-[#f97316] hover:underline flex items-center gap-1"
                  >
                    <span>Ficha laboral</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODAL CREAR NUEVO TRABAJADOR                           */}
      {/* ========================================================= */}
      {showNewWorkerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 ">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 shadow-sm p-6 space-y-5">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-orange-50 text-[#f97316]">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-[#213343]">
                    Nuevo colaborador
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">
                    Registrar ficha personal vinculada a una cuenta de usuario
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowNewWorkerModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Formulario */}
            <form onSubmit={handleCreateWorker} className="space-y-4 text-xs">
              {/* Sección 0: Cuenta de Usuario Vinculada (OBLIGATORIA) */}
              <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-lg space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-extrabold text-[#213343] flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-[#f97316]" />
                    <span>Cuenta de usuario *</span>
                  </span>

                  <div className="inline-flex bg-white p-1 rounded-md border border-orange-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setWorkerAccountMode('create')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                        workerAccountMode === 'create'
                          ? 'bg-[#f97316] text-white shadow-xs'
                          : 'text-gray-600 hover:text-[#213343]'
                      }`}
                    >
                      Crear nueva cuenta
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkerAccountMode('link')}
                      className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                        workerAccountMode === 'link'
                          ? 'bg-[#f97316] text-white shadow-xs'
                          : 'text-gray-600 hover:text-[#213343]'
                      }`}
                    >
                      Vincular existente
                    </button>
                  </div>
                </div>

                {workerAccountMode === 'link' ? (
                  <div>
                    <label className="text-[11px] font-bold text-gray-600 block mb-1">
                      Seleccionar usuario registrado:
                    </label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setSelectedUserId(uid);
                        const u = usuarios.find((usr) => usr.id === uid);
                        if (u) {
                          setNewWorker((prev) => ({
                            ...prev,
                            nombre: u.nombre,
                            email: u.email,
                          }));
                        }
                      }}
                      className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold text-xs focus:outline-none focus:border-[#f97316]"
                    >
                      <option value="">-- Seleccionar usuario registrado --</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nombre} ({u.email}) — Rol: {ROL_NOMBRE[u.rol] ?? u.rol}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-gray-600 block mb-1">
                        Rol de Acceso en Sistema *
                      </label>
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold text-xs focus:outline-none focus:border-[#f97316]"
                      >
                        <option value="mano_obra">Mano de Obra</option>
                        <option value="user">Ejecutivo Comercial</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-gray-600 block mb-1">
                        Contraseña Inicial *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold text-xs focus:outline-none focus:border-[#f97316]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección 1: Datos Personales */}
              <div className="space-y-3 pt-1">
                <h4 className="font-black text-gray-700 uppercase tracking-normal text-[11px]">
                  1. Datos Personales & Contacto
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Nombre completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Felipe Valverde"
                      value={newWorker.nombre}
                      onChange={(e) => setNewWorker({ ...newWorker, nombre: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">RUT chileno *</label>
                    <input
                      type="text"
                      required
                      placeholder="16.892.341-2"
                      value={newWorker.rut}
                      onChange={(e) => setNewWorker({ ...newWorker, rut: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold font-mono focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Correo electrónico (Login) *</label>
                    <input
                      type="email"
                      required
                      placeholder="correo@hormiglass.cl"
                      value={newWorker.email}
                      onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Teléfono</label>
                    <input
                      type="text"
                      placeholder="+56 9 1234 5678"
                      value={newWorker.telefono}
                      onChange={(e) => setNewWorker({ ...newWorker, telefono: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Dirección</label>
                    <input
                      type="text"
                      placeholder="Av. Las Industrias 1420"
                      value={newWorker.direccion}
                      onChange={(e) => setNewWorker({ ...newWorker, direccion: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Comuna</label>
                    <SearchableSelect
                      options={TODAS_COMUNAS_CHILE}
                      value={newWorker.comuna}
                      onChange={(val) => setNewWorker({ ...newWorker, comuna: val })}
                      placeholder="Seleccionar comuna..."
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Cargo & Condiciones Laborales */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <h4 className="font-black text-gray-700 uppercase tracking-normal text-[11px]">
                  2. Cargo & Contrato Laboral
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Cargo / Rol *</label>
                    <select
                      value={newWorker.cargo}
                      onChange={(e) => setNewWorker({ ...newWorker, cargo: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer focus:outline-none focus:border-[#f97316]"
                    >
                      {CARGOS_RRHH_DEFAULT.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Área / Departamento</label>
                    <select
                      value={newWorker.area}
                      onChange={(e) => setNewWorker({ ...newWorker, area: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer focus:outline-none focus:border-[#f97316]"
                    >
                      {AREAS_RRHH_DEFAULT.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Tipo de contrato</label>
                    <select
                      value={newWorker.tipo_contrato}
                      onChange={(e) => setNewWorker({ ...newWorker, tipo_contrato: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer focus:outline-none focus:border-[#f97316]"
                    >
                      <option value="Indefinido">Indefinido</option>
                      <option value="Plazo fijo">Plazo fijo</option>
                      <option value="Honorarios">Honorarios</option>
                      <option value="Por faena / obra">Por faena / obra</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Sueldo base (CLP)</label>
                    <input
                      type="number"
                      placeholder="950000"
                      value={newWorker.sueldo_base}
                      onChange={(e) => setNewWorker({ ...newWorker, sueldo_base: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold font-mono focus:outline-none focus:border-[#f97316]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Fecha de ingreso</label>
                    <input
                      type="date"
                      value={newWorker.fecha_ingreso}
                      onChange={(e) => setNewWorker({ ...newWorker, fecha_ingreso: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Disponibilidad inicial</label>
                    <select
                      value={newWorker.estado_disponibilidad}
                      onChange={(e) =>
                        setNewWorker({
                          ...newWorker,
                          estado_disponibilidad: e.target.value as EstadoDisponibilidad,
                        })
                      }
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-bold cursor-pointer focus:outline-none focus:border-[#f97316]"
                    >
                      <option value="disponible">Disponible</option>
                      <option value="en_terreno">En terreno / obra</option>
                      <option value="permiso">En permiso</option>
                      <option value="licencia">Licencia médica</option>
                      <option value="vacaciones">Vacaciones</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 3: Contacto de Emergencia & Datos Bancarios */}
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <h4 className="font-black text-gray-700 uppercase tracking-normal text-[11px]">
                  3. Contacto de Emergencia & Pago
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Contacto de emergencia (Nombre)</label>
                    <input
                      type="text"
                      placeholder="Ej: María Valverde (Esposa)"
                      value={newWorker.contacto_emergencia_nombre}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, contacto_emergencia_nombre: e.target.value })
                      }
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Teléfono de emergencia</label>
                    <input
                      type="text"
                      placeholder="+56 9 8765 4321"
                      value={newWorker.contacto_emergencia_telefono}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, contacto_emergencia_telefono: e.target.value })
                      }
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">Banco</label>
                    <input
                      type="text"
                      placeholder="BancoEstado / Banco Santander"
                      value={newWorker.banco}
                      onChange={(e) => setNewWorker({ ...newWorker, banco: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-500 block mb-1">N° de cuenta bancaria</label>
                    <input
                      type="text"
                      placeholder="16892341"
                      value={newWorker.numero_cuenta}
                      onChange={(e) => setNewWorker({ ...newWorker, numero_cuenta: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 font-mono font-semibold focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewWorkerModal(false)}
                  className="px-4 py-2 rounded-md text-gray-600 font-bold hover:bg-gray-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNewWorker}
                  className="px-5 py-2 rounded-md bg-[#f97316] hover:bg-[#ea580c] text-white font-black transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingNewWorker ? 'Guardando...' : 'Guardar colaborador'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
