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
  Plus,
  Eye,
  UserX,
  LayoutGrid,
  List,
  Lock,
  UserRound,
} from 'lucide-react';
import { TODAS_COMUNAS_CHILE } from '../../lib/chile-data';
import { mensajeError } from '../../lib/errores';
import {
  PageHeader,
  SummaryLine,
  FilterBar,
  SearchField,
  FilterSelect,
  Panel,
  Button,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  Select,
  Tone,
} from '../../components/ui/crm';
import { useToast } from '../../components/ui/feedback';

const DISPONIBILIDAD_LABELS: Record<EstadoDisponibilidad, string> = {
  disponible: 'Disponible',
  en_terreno: 'En terreno / obra',
  permiso: 'En permiso',
  licencia: 'Licencia médica',
  vacaciones: 'Vacaciones',
  falta: 'Falta / ausente',
};

const DISPONIBILIDAD_TONE: Record<EstadoDisponibilidad, Tone> = {
  disponible: 'success',
  en_terreno: 'info',
  permiso: 'warning',
  licencia: 'accent',
  vacaciones: 'neutral',
  falta: 'danger',
};

const USER_ROLE_TONE: Record<UserRole, Tone> = {
  admin: 'danger',
  user: 'info',
  mano_obra: 'warning',
  finanzas: 'success',
};

export default function RecursosHumanosPage() {
  const { addUser, currentUser, updateUserRole } = useAuth();
  const toast = useToast();
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
    const timer = setTimeout(() => {
      void loadTrabajadores();
    }, 0);

    // Supabase Realtime
    const channel = supabase
      .channel('rrhh_trabajadores_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajadores' }, () => {
        void loadTrabajadores();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => {
        void loadTrabajadores();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajador_permisos_ausencias' }, () => {
        void loadTrabajadores();
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
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
        void loadTrabajadores();
        toast({ message: 'No se pudo actualizar la disponibilidad', tone: 'danger' });
      } else {
        toast({ message: `Disponibilidad actualizada a ${DISPONIBILIDAD_LABELS[nuevoEstado]}`, tone: 'success' });
      }
    } catch (err) {
      console.error('Error:', err);
      toast({ message: 'Ocurrió un error al actualizar la disponibilidad', tone: 'danger' });
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
      toast({ message: `Rol actualizado a ${ROL_NOMBRE[nuevoRol]}`, tone: 'success' });
    } catch (err) {
      console.error('Error actualizando tipo de usuario:', err);
      setUsuarios(previousUsuarios);
      toast({ message: mensajeError(err, 'No se pudo actualizar el tipo de usuario.'), tone: 'danger' });
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
      toast({ message: 'Colaborador creado exitosamente', tone: 'success' });
      void loadTrabajadores();
    } catch (err: unknown) {
      setFormError(mensajeError(err, 'No se pudo guardar la ficha del colaborador.'));
      setSavingNewWorker(false);
    }
  };

  // Filtrado reactivo de trabajadores
  const filteredTrabajadores = useMemo(() => {
    return trabajadores.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = t.nombre.toLowerCase().includes(q);
        const matchRut = (t.rut || '').toLowerCase().includes(q);
        const matchCargo = (t.cargo || '').toLowerCase().includes(q);
        const matchEmail = (t.email || '').toLowerCase().includes(q);
        if (!matchName && !matchRut && !matchCargo && !matchEmail) return false;
      }

      if (filterDisponibilidad !== 'todos') {
        if (t.estado_disponibilidad !== filterDisponibilidad) return false;
      }

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
    <div className="space-y-6">
      {/* 1. CABECERA & ACCIÓN PRINCIPAL */}
      <PageHeader
        title="Recursos Humanos"
        description="Directorio de colaboradores vinculados a cuentas de usuario, asistencia y carpetas laborales."
        actions={
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setFormError(null);
              setShowNewWorkerModal(true);
            }}
          >
            Nuevo colaborador
          </Button>
        }
      />

      {/* 2. KPIS EJECUTIVOS (SummaryLine accionable) */}
      <Panel className="p-3">
        <SummaryLine
          items={[
            {
              label: 'Colaboradores',
              value: totalColaboradores,
              active: filterDisponibilidad === 'todos',
              onClick: () => setFilterDisponibilidad('todos'),
            },
            {
              label: 'Disponibles',
              value: totalDisponibles,
              tone: 'success',
              active: filterDisponibilidad === 'disponible',
              onClick: () =>
                setFilterDisponibilidad(
                  filterDisponibilidad === 'disponible' ? 'todos' : 'disponible'
                ),
            },
            {
              label: 'En terreno',
              value: totalEnTerreno,
              tone: 'info',
              active: filterDisponibilidad === 'en_terreno',
              onClick: () =>
                setFilterDisponibilidad(
                  filterDisponibilidad === 'en_terreno' ? 'todos' : 'en_terreno'
                ),
            },
            {
              label: 'Ausencias / Permisos',
              value: totalAusentes,
              tone: 'warning',
            },
            {
              label: 'Nómina mensual',
              value: `$${totalNominaSueldos.toLocaleString('es-CL')}`,
            },
          ]}
        />
      </Panel>

      {/* 3. BARRA DE FILTROS & BÚSQUEDA */}
      <FilterBar>
        <SearchField
          placeholder="Buscar por nombre, RUT, cargo o correo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect
            label="Estado"
            value={filterDisponibilidad}
            onChange={(e) => setFilterDisponibilidad(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="disponible">Disponible</option>
            <option value="en_terreno">En terreno / obra</option>
            <option value="permiso">En permiso</option>
            <option value="licencia">Licencia médica</option>
            <option value="vacaciones">Vacaciones</option>
            <option value="falta">Falta / ausente</option>
          </FilterSelect>

          <FilterSelect
            label="Área"
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
          >
            <option value="todas">Todas las áreas</option>
            {AREAS_RRHH_DEFAULT.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </FilterSelect>

          {/* Selector de Vista (Tabla vs Cuadrícula) */}
          <div className="flex items-center rounded-control border border-line bg-surface p-0.5" role="group" aria-label="Modo de vista">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-label="Vista tabla"
              aria-pressed={viewMode === 'table'}
              className={`p-1.5 rounded-control transition-colors ${
                viewMode === 'table' ? 'bg-surface-muted text-ink font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <List size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Vista cuadrícula"
              aria-pressed={viewMode === 'grid'}
              className={`p-1.5 rounded-control transition-colors ${
                viewMode === 'grid' ? 'bg-surface-muted text-ink font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <LayoutGrid size={16} aria-hidden />
            </button>
          </div>
        </div>
      </FilterBar>

      {/* 4. LISTADO PRINCIPAL DE TRABAJADORES */}
      {loading ? (
        <Panel className="p-12 text-center text-ink-muted">
          Cargando colaboradores de Hormiglass...
        </Panel>
      ) : filteredTrabajadores.length === 0 ? (
        <Panel className="p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
            <UserX size={24} aria-hidden />
          </div>
          <h3 className="t-section mt-3">No se encontraron colaboradores</h3>
          <p className="t-caption mt-1 max-w-md mx-auto">
            No hay trabajadores que coincidan con los filtros seleccionados. Todos los colaboradores deben tener cuenta de usuario activa.
          </p>
        </Panel>
      ) : viewMode === 'table' ? (
        /* VISTA DE TABLA */
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="hg-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Tipo de usuario</th>
                  <th>Cargo & Área</th>
                  <th>Disponibilidad</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrabajadores.map((t) => {
                  const linkedUser = usuarios.find(
                    (u) =>
                      u.id === t.usuario_id ||
                      (t.email && u.email?.toLowerCase() === t.email?.toLowerCase())
                  );

                  return (
                    <tr key={t.id}>
                      {/* 1. Colaborador */}
                      <td>
                        <Link
                          href={`/rrhh/${t.id}`}
                          className="flex items-center gap-3 transition-colors hover:text-accent-ink"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink font-semibold">
                            <UserRound size={18} aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <span className="block font-semibold text-ink hover:underline">
                              {t.nombre}
                            </span>
                            <div className="mt-0.5">
                              <CodeStamp title={`RUT: ${t.rut}`}>{t.rut || 'Sin RUT'}</CodeStamp>
                            </div>
                          </div>
                        </Link>
                      </td>

                      {/* 2. Tipo de Usuario */}
                      <td>
                        {linkedUser && isAdmin ? (
                          <div className="max-w-[160px]">
                            <Select
                              value={linkedUser.rol}
                              onChange={(e) =>
                                void handleUpdateTipoUsuario(linkedUser, e.target.value as UserRole)
                              }
                              className="text-xs"
                            >
                              {Object.entries(ROL_NOMBRE).map(([role, label]) => (
                                <option key={role} value={role}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : linkedUser ? (
                          <StatusBadge tone={USER_ROLE_TONE[linkedUser.rol]}>
                            {ROL_NOMBRE[linkedUser.rol] ?? linkedUser.rol}
                          </StatusBadge>
                        ) : (
                          <span className="t-caption text-ink-muted">Sin cuenta</span>
                        )}
                      </td>

                      {/* 3. Cargo & Área */}
                      <td>
                        <span className="block font-semibold text-ink">{t.cargo}</span>
                        <span className="t-caption text-ink-muted">{t.area}</span>
                      </td>

                      {/* 4. Disponibilidad */}
                      <td>
                        <div className="max-w-[170px]">
                          <Select
                            value={t.estado_disponibilidad}
                            onChange={(e) =>
                              void handleUpdateDisponibilidad(
                                t.id,
                                e.target.value as EstadoDisponibilidad
                              )
                            }
                            className="text-xs"
                          >
                            {Object.entries(DISPONIBILIDAD_LABELS).map(([estado, label]) => (
                              <option key={estado} value={estado}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </td>

                      {/* 5. Acción */}
                      <td className="text-right">
                        <Link href={`/rrhh/${t.id}`}>
                          <Button variant="secondary" size="sm" icon={Eye}>
                            Ver ficha
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        /* VISTA DE TARJETAS (GRID) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrabajadores.map((t) => {
            const linkedUser = usuarios.find(
              (u) =>
                u.id === t.usuario_id ||
                (t.email && u.email?.toLowerCase() === t.email?.toLowerCase())
            );

            return (
              <Panel key={t.id} className="p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink font-semibold">
                      <UserRound size={22} aria-hidden />
                    </div>
                    <StatusBadge tone={DISPONIBILIDAD_TONE[t.estado_disponibilidad]}>
                      {DISPONIBILIDAD_LABELS[t.estado_disponibilidad]}
                    </StatusBadge>
                  </div>

                  <div>
                    <Link href={`/rrhh/${t.id}`} className="block group">
                      <h3 className="font-semibold text-ink group-hover:underline">
                        {t.nombre}
                      </h3>
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <CodeStamp title={`RUT: ${t.rut}`}>{t.rut || 'Sin RUT'}</CodeStamp>
                      {linkedUser && (
                        <StatusBadge tone={USER_ROLE_TONE[linkedUser.rol]} icon={false}>
                          {ROL_NOMBRE[linkedUser.rol]}
                        </StatusBadge>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-line-subtle pt-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Cargo</span>
                      <span className="font-medium text-ink truncate max-w-[180px]">{t.cargo}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Área</span>
                      <span className="font-medium text-ink truncate max-w-[180px]">{t.area}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink-muted">Sueldo base</span>
                      <span className="t-num font-semibold text-ink">
                        ${Number(t.sueldo_base || 0).toLocaleString('es-CL')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-line-subtle pt-3 flex items-center justify-between">
                  <span className="t-caption text-ink-muted">
                    {t.fecha_ingreso ? `Ingreso: ${t.fecha_ingreso}` : 'Sin fecha'}
                  </span>
                  <Link href={`/rrhh/${t.id}`}>
                    <Button variant="subtle" size="sm" icon={Eye}>
                      Ficha laboral
                    </Button>
                  </Link>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* 5. DIALOG CREAR NUEVO TRABAJADOR */}
      <Dialog
        open={showNewWorkerModal}
        title="Nuevo colaborador"
        description="Registrar ficha laboral vinculada a una cuenta de usuario."
        size="lg"
        onClose={() => setShowNewWorkerModal(false)}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setShowNewWorkerModal(false)}
              disabled={savingNewWorker}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={(e) => void handleCreateWorker(e)}
              disabled={savingNewWorker}
            >
              {savingNewWorker ? 'Guardando...' : 'Guardar colaborador'}
            </Button>
          </div>
        }
      >
        <form onSubmit={(e) => void handleCreateWorker(e)} className="space-y-5">
          {formError && (
            <div className="rounded-control border border-danger-line bg-danger-soft p-3 text-xs text-danger font-medium">
              {formError}
            </div>
          )}

          {/* Sección 0: Cuenta de Usuario Vinculada */}
          <div className="rounded-panel border border-line-subtle bg-surface-muted p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-semibold text-ink flex items-center gap-1.5 text-sm">
                <Lock size={16} className="text-accent-ink" aria-hidden />
                <span>Cuenta de usuario</span>
              </span>

              <div className="inline-flex rounded-control border border-line bg-surface p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setWorkerAccountMode('create')}
                  className={`px-2.5 py-1 rounded-control transition-colors ${
                    workerAccountMode === 'create'
                      ? 'bg-accent text-on-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Crear nueva cuenta
                </button>
                <button
                  type="button"
                  onClick={() => setWorkerAccountMode('link')}
                  className={`px-2.5 py-1 rounded-control transition-colors ${
                    workerAccountMode === 'link'
                      ? 'bg-accent text-on-accent'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Vincular existente
                </button>
              </div>
            </div>

            {workerAccountMode === 'link' ? (
              <Field label="Seleccionar usuario registrado" required>
                {({ id }) => (
                  <Select
                    id={id}
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
                  >
                    <option value="">-- Seleccionar usuario registrado --</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.email}) — Rol: {ROL_NOMBRE[u.rol] ?? u.rol}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Rol de acceso en el sistema" required>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    >
                      <option value="mano_obra">Mano de Obra</option>
                      <option value="user">Ejecutivo Comercial</option>
                      <option value="finanzas">Finanzas y Caja</option>
                      <option value="admin">Administrador</option>
                    </Select>
                  )}
                </Field>

                <Field label="Contraseña inicial" hint="Mínimo 6 caracteres" required>
                  {({ id }) => (
                    <TextInput
                      id={id}
                      type="password"
                      required
                      minLength={6}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>

          {/* Sección 1: Datos Personales */}
          <div className="space-y-3">
            <h4 className="t-caption font-semibold uppercase tracking-wider text-ink-muted">
              1. Datos personales & contacto
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nombre completo" required>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    required
                    placeholder="Ej: Felipe Valverde"
                    value={newWorker.nombre}
                    onChange={(e) => setNewWorker({ ...newWorker, nombre: e.target.value })}
                  />
                )}
              </Field>

              <Field label="RUT chileno" required>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    required
                    placeholder="16.892.341-2"
                    value={newWorker.rut}
                    onChange={(e) => setNewWorker({ ...newWorker, rut: e.target.value })}
                    className="font-mono tabular-nums"
                  />
                )}
              </Field>

              <Field label="Correo electrónico (Login)" required>
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="email"
                    required
                    placeholder="correo@hormiglass.cl"
                    value={newWorker.email}
                    onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Teléfono">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="+56 9 1234 5678"
                    value={newWorker.telefono}
                    onChange={(e) => setNewWorker({ ...newWorker, telefono: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Dirección">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="Av. Las Industrias 1420"
                    value={newWorker.direccion}
                    onChange={(e) => setNewWorker({ ...newWorker, direccion: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Comuna">
                {({ id }) => (
                  <>
                    <TextInput
                      id={id}
                      list="comunas-datalist"
                      placeholder="Seleccionar comuna..."
                      value={newWorker.comuna}
                      onChange={(e) => setNewWorker({ ...newWorker, comuna: e.target.value })}
                    />
                    <datalist id="comunas-datalist">
                      {TODAS_COMUNAS_CHILE.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            </div>
          </div>

          {/* Sección 2: Cargo & Condiciones Laborales */}
          <div className="space-y-3 border-t border-line-subtle pt-3">
            <h4 className="t-caption font-semibold uppercase tracking-wider text-ink-muted">
              2. Cargo & contrato laboral
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Cargo / Rol" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={newWorker.cargo}
                    onChange={(e) => setNewWorker({ ...newWorker, cargo: e.target.value })}
                  >
                    {CARGOS_RRHH_DEFAULT.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Área / Departamento">
                {({ id }) => (
                  <Select
                    id={id}
                    value={newWorker.area}
                    onChange={(e) => setNewWorker({ ...newWorker, area: e.target.value })}
                  >
                    {AREAS_RRHH_DEFAULT.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Tipo de contrato">
                {({ id }) => (
                  <Select
                    id={id}
                    value={newWorker.tipo_contrato}
                    onChange={(e) => setNewWorker({ ...newWorker, tipo_contrato: e.target.value })}
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
                    placeholder="950000"
                    value={newWorker.sueldo_base}
                    onChange={(e) => setNewWorker({ ...newWorker, sueldo_base: e.target.value })}
                    className="font-mono tabular-nums"
                  />
                )}
              </Field>

              <Field label="Fecha de ingreso">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="date"
                    value={newWorker.fecha_ingreso}
                    onChange={(e) => setNewWorker({ ...newWorker, fecha_ingreso: e.target.value })}
                  />
                )}
              </Field>

              <Field label="Disponibilidad inicial">
                {({ id }) => (
                  <Select
                    id={id}
                    value={newWorker.estado_disponibilidad}
                    onChange={(e) =>
                      setNewWorker({
                        ...newWorker,
                        estado_disponibilidad: e.target.value as EstadoDisponibilidad,
                      })
                    }
                  >
                    <option value="disponible">Disponible</option>
                    <option value="en_terreno">En terreno / obra</option>
                    <option value="permiso">En permiso</option>
                    <option value="licencia">Licencia médica</option>
                    <option value="vacaciones">Vacaciones</option>
                  </Select>
                )}
              </Field>
            </div>
          </div>

          {/* Sección 3: Contacto de Emergencia & Datos Bancarios */}
          <div className="space-y-3 border-t border-line-subtle pt-3">
            <h4 className="t-caption font-semibold uppercase tracking-wider text-ink-muted">
              3. Contacto de emergencia & datos bancarios
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Contacto de emergencia (Nombre)">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="Ej: María Valverde (Esposa)"
                    value={newWorker.contacto_emergencia_nombre}
                    onChange={(e) =>
                      setNewWorker({ ...newWorker, contacto_emergencia_nombre: e.target.value })
                    }
                  />
                )}
              </Field>

              <Field label="Teléfono de emergencia">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="+56 9 8765 4321"
                    value={newWorker.contacto_emergencia_telefono}
                    onChange={(e) =>
                      setNewWorker({ ...newWorker, contacto_emergencia_telefono: e.target.value })
                    }
                  />
                )}
              </Field>

              <Field label="Banco">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="BancoEstado / Banco Santander"
                    value={newWorker.banco}
                    onChange={(e) => setNewWorker({ ...newWorker, banco: e.target.value })}
                  />
                )}
              </Field>

              <Field label="N° de cuenta bancaria">
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="text"
                    placeholder="16892341"
                    value={newWorker.numero_cuenta}
                    onChange={(e) => setNewWorker({ ...newWorker, numero_cuenta: e.target.value })}
                    className="font-mono tabular-nums"
                  />
                )}
              </Field>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
