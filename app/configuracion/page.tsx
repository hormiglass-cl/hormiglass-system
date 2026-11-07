'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useBreadcrumb } from '../../lib/context/BreadcrumbContext';
import { useAuth } from '../../lib/context/AuthContext';
import { Usuario, UserRole } from '../../lib/types';
import { createClient } from '../../lib/supabase/client';
import { logSistema } from '../../lib/logger';
import { Pagination } from '../../components/Pagination';
import {
  Trash2,
  Edit2,
  Users,
  Mail,
  MoreVertical,
  UserCheck,
  UserX,
  ExternalLink,
  ChevronRight,
  Building2,
  FileText,
  Coins,
  Compass,
  Tag,
  UserRound,
  Lock,
  GitBranch,
  Bell,
  AlarmClock,
  Shield,
  History,
  DatabaseBackup,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';
import { recoveryRedirectUrl } from '../../lib/site-url';
import {
  SearchField,
  Button,
  StatusBadge,
  Dialog,
  Field,
  TextInput,
  Select,
  ActionMenu,
  ActionMenuItem,
} from '../../components/ui/crm';
import { SeccionEmpresa, SeccionCotizaciones, SeccionComisiones, SeccionOrigenes, SeccionTiposVenta, SeccionPerfil, SeccionSeguridad, SeccionPipeline, SeccionAvisos, SeccionRecordatorios } from '../../components/configuracion/Secciones';
import { SeccionRoles, SeccionActividad, SeccionRespaldo } from '../../components/configuracion/Sistema';
import { Fab } from '../../components/ui/Fab';
import { useToast, useConfirm } from '../../components/ui/feedback';

type SeccionId = 'roles' | 'actividad' | 'respaldo' | 'perfil' | 'seguridad' | 'avisos' | 'recordatorios' | 'pipeline' | 'usuarios' | 'empresa' | 'cotizaciones' | 'comisiones' | 'origenes' | 'tipos_venta';

const GRUPOS: { titulo: string; filas: { id: SeccionId; label: string; icono: typeof Users }[] }[] = [
  {
    titulo: 'Cuenta',
    filas: [
      { id: 'perfil', label: 'Mi perfil', icono: UserRound },
      { id: 'seguridad', label: 'Seguridad', icono: Lock },
      { id: 'usuarios', label: 'Usuarios', icono: Users },
      { id: 'roles', label: 'Roles y permisos', icono: Shield },
    ],
  },
  { titulo: 'Empresa', filas: [{ id: 'empresa', label: 'Datos de la empresa', icono: Building2 }] },
  {
    titulo: 'Comercial',
    filas: [
      { id: 'cotizaciones', label: 'Cotizaciones', icono: FileText },
      { id: 'comisiones', label: 'Comisiones', icono: Coins },
      { id: 'origenes', label: 'Orígenes de oportunidad', icono: Compass },
      { id: 'tipos_venta', label: 'Tipos de venta', icono: Tag },
      { id: 'pipeline', label: 'Etapas del pipeline', icono: GitBranch },
    ],
  },
  {
    titulo: 'Notificaciones',
    filas: [
      { id: 'avisos', label: 'Preferencias de avisos', icono: Bell },
      { id: 'recordatorios', label: 'Recordatorios automáticos', icono: AlarmClock },
    ],
  },
  {
    titulo: 'Sistema',
    filas: [
      { id: 'actividad', label: 'Registro de actividad', icono: History },
      { id: 'respaldo', label: 'Respaldo y exportación', icono: DatabaseBackup },
    ],
  },
];

export default function ConfiguracionPage() {
  const { currentUser, usersList, addUser, updateUserRole, updateUser, deleteUser, refreshUsers } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const confirm = useConfirm();

  // User Management State
  const [seccion, setSeccion] = useState<SeccionId | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const { setCustomTitle, setOnBack } = useBreadcrumb();

  // El menú superior muestra "Sistema › Configuración › Usuarios"; "Configuración" vuelve a la lista.
  useEffect(() => {
    window.setTimeout(() => {
      if (seccion) {
        setCustomTitle(GRUPOS.flatMap((g) => g.filas).find((f) => f.id === seccion)?.label ?? 'Configuración');
        setOnBack(() => () => setSeccion(null));
      } else {
        setCustomTitle(null);
        setOnBack(null);
      }
    }, 0);
    return () => {
      setCustomTitle(null);
      setOnBack(null);
    };
  }, [seccion, setCustomTitle, setOnBack]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRut, setUserRut] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('user');

  // Edit User State
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [editUserNombre, setEditUserNombre] = useState('');
  const [editUserRol, setEditUserRol] = useState<UserRole>('user');
  const [editUserActivo, setEditUserActivo] = useState(true);
  const [editUserCalVisitas, setEditUserCalVisitas] = useState(true);
  const [editUserCalProduccion, setEditUserCalProduccion] = useState(true);
  const [editUserCalReventa, setEditUserCalReventa] = useState(true);
  const [showEditUserModal, setShowEditUserModal] = useState(false);

  // Pagination for Users
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const [userItemsPerPage, setUserItemsPerPage] = useState(10);

  // Directorio RR.HH. vinculado para enlace directo a fichas laborales
  const [trabajadoresMap, setTrabajadoresMap] = useState<
    Record<string, { id: string; rut: string; cargo: string }>
  >({});

  const loadTrabajadoresLinks = useCallback(async () => {
    const { data } = await supabase
      .from('trabajadores')
      .select('id, usuario_id, email, rut, cargo');
    if (!data) return;
    const map: Record<string, { id: string; rut: string; cargo: string }> = {};
    for (const row of data as Array<{
      id: string;
      usuario_id: string | null;
      email: string | null;
      rut: string | null;
      cargo: string | null;
    }>) {
      const info = { id: row.id, rut: row.rut || '', cargo: row.cargo || '' };
      if (row.usuario_id) map[row.usuario_id] = info;
      if (row.email) map[row.email.toLowerCase()] = info;
    }
    setTrabajadoresMap(map);
  }, [supabase]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadTrabajadoresLinks();
    }, 0);
    return () => clearTimeout(t);
  }, [loadTrabajadoresLinks, usersList.length]);

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

  // Reenviar correo de invitación / acceso
  const handleResendInvite = async (usr: Usuario) => {
    try {
      // El correo trae un código de un solo uso; el usuario lo ingresa en "Recuperar contraseña".
      const { error } = await supabase.auth.resetPasswordForEmail(usr.email, {
        redirectTo: recoveryRedirectUrl(),
      });
      if (error) throw error;
      toast({
        message: `Código de acceso enviado a ${usr.email}. Debe ingresarlo en «Recuperar contraseña» → «Ya tengo un código».`,
        tone: 'success',
      });
    } catch (err: unknown) {
      toast({
        message: mensajeError(err, 'No se pudo enviar el correo de invitación.'),
        tone: 'danger',
      });
    }
  };

  // User Handlers
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userNombre.trim() || !userEmail.trim()) {
      toast({ message: 'El nombre completo y correo electrónico son obligatorios.', tone: 'warning' });
      return;
    }

    setSubmittingUser(true);
    try {
      await addUser({
        nombre: userNombre.trim(),
        email: userEmail.trim(),
        rol: userRol,
        activo: true,
        calendario_visitas: true,
        calendario_produccion: true,
        calendario_reventa: true,
        rut: userRut.trim() || undefined,
      });

      toast({
        message: `Usuario registrado. Se ha enviado un correo a ${userEmail.trim()} para que defina su contraseña y acceda al CRM.`,
        tone: 'success',
        duration: 7000,
      });
      setShowUserModal(false);
      setUserNombre('');
      setUserEmail('');
      setUserRut('');
      setUserRol('user');
      await refreshUsers();
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'No se pudo registrar el usuario.'), tone: 'danger' });
    } finally {
      setSubmittingUser(false);
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

  // Pagination for Users
  const usuariosFiltrados = usersList.filter((u) => {
    const q = busqueda.trim().toLowerCase();
    return !q || u.nombre.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q);
  });
  const paginatedUsers = usuariosFiltrados.slice(
    (userCurrentPage - 1) * userItemsPerPage,
    userCurrentPage * userItemsPerPage
  );

  return (
    <div className="hg-page pb-12">
      {seccion === null ? (
        /* Pantalla inicial al estilo Ajustes de iOS: grupos de filas, cada fila abre una sección */
        <div className="mx-auto max-w-2xl space-y-6 pt-2">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="space-y-1.5">
              <h2 className="px-4 text-xs font-medium uppercase tracking-wide text-ink-muted">{grupo.titulo}</h2>
              <div className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line-subtle bg-surface shadow-[var(--hg-shadow-card)]">
                {grupo.filas.map((fila) => {
                  const Icono = fila.icono;
                  return (
                    <button
                      key={fila.id}
                      type="button"
                      onClick={() => setSeccion(fila.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-muted active:bg-surface-muted"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
                        <Icono size={18} aria-hidden />
                      </span>
                      <span className="flex-1 text-sm font-medium text-ink">{fila.label}</span>
                      {fila.id === 'usuarios' && <span className="t-num text-sm text-ink-muted">{usersList.length}</span>}
                      <ChevronRight size={18} className="text-ink-subtle" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : seccion !== 'usuarios' ? (
        <>
          {seccion === 'empresa' && <SeccionEmpresa />}
          {seccion === 'cotizaciones' && <SeccionCotizaciones />}
          {seccion === 'comisiones' && <SeccionComisiones />}
          {seccion === 'origenes' && <SeccionOrigenes />}
          {seccion === 'tipos_venta' && <SeccionTiposVenta />}
          {seccion === 'perfil' && <SeccionPerfil />}
          {seccion === 'seguridad' && <SeccionSeguridad />}
          {seccion === 'pipeline' && <SeccionPipeline />}
          {seccion === 'roles' && <SeccionRoles />}
          {seccion === 'actividad' && <SeccionActividad />}
          {seccion === 'respaldo' && <SeccionRespaldo />}
          {seccion === 'avisos' && <SeccionAvisos />}
          {seccion === 'recordatorios' && <SeccionRecordatorios />}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              placeholder="Buscar usuario…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setUserCurrentPage(1);
              }}
              className="max-w-sm"
            />
          </div>

          <section className="hg-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="hg-table min-w-max whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Ficha RR.HH.</th>
                    <th>Rol de acceso</th>
                    <th>Cal. visitas</th>
                    <th>Cal. producción</th>
                    <th>Cal. reventa</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((usr) => {
                    const linkedWorker =
                      trabajadoresMap[usr.id] ||
                      (usr.email ? trabajadoresMap[usr.email.toLowerCase()] : undefined);
                    const calendarios = [
                      ['calendario_visitas', usr.calendario_visitas, 'Calendario de visitas'],
                      ['calendario_produccion', usr.calendario_produccion, 'Calendario de producción'],
                      ['calendario_reventa', usr.calendario_reventa, 'Calendario de reventa'],
                    ] as const;

                    return (
                      <tr key={usr.id}>
                        <td>
                          <span className="flex items-center gap-3">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                              {usr.nombre.trim().slice(0, 2).toUpperCase()}
                            </span>
                            <span>
                              <span className="block font-semibold text-ink">{usr.nombre}</span>
                              <span className="t-caption block">{usr.email}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          {linkedWorker ? (
                            <Link
                              href={`/rrhh/${linkedWorker.id}`}
                              className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                            >
                              {linkedWorker.rut || 'Ver ficha'}
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </Link>
                          ) : (
                            <Link href="/rrhh" className="text-ink-muted hover:text-accent-ink hover:underline">
                              Vincular
                            </Link>
                          )}
                        </td>
                        <td>
                          <div className="w-40">
                            <Select
                              value={usr.rol}
                              onChange={(e) => void updateUserRole(usr.id, e.target.value as UserRole, usr.activo)}
                              selectClassName="!min-h-[32px] !h-8 !py-1 text-xs font-medium cursor-pointer"
                            >
                              <option value="admin">Administrador</option>
                              <option value="user">Colaborador</option>
                            </Select>
                          </div>
                        </td>
                        {calendarios.map(([campo, valor, nombre]) => {
                          const on = valor ?? true;
                          return (
                            <td key={campo}>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                aria-label={`${nombre} de ${usr.nombre}`}
                                title={on ? 'Aparece en el calendario' : 'Oculto en el calendario'}
                                onClick={() => void handleToggleUserCalendar(usr.id, campo, valor)}
                                className={`relative h-[22px] w-10 cursor-pointer rounded-full transition-colors ${on ? 'bg-success' : 'bg-line-strong'}`}
                              >
                                <span
                                  className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[20px]' : 'left-0.5'}`}
                                />
                              </button>
                            </td>
                          );
                        })}
                        <td>
                          <StatusBadge tone={usr.activo ? 'success' : 'neutral'}>
                            {usr.activo ? 'Activo' : 'Inactivo'}
                          </StatusBadge>
                        </td>
                        <td>
                          <ActionMenu icon={MoreVertical} label={`Acciones para ${usr.nombre}`}>
                            <ActionMenuItem icon={Edit2} onClick={() => handleOpenEditUser(usr)}>
                              Editar usuario
                            </ActionMenuItem>
                            <ActionMenuItem icon={Mail} onClick={() => void handleResendInvite(usr)}>
                              Reenviar invitación
                            </ActionMenuItem>
                            <ActionMenuItem
                              icon={usr.activo ? UserX : UserCheck}
                              onClick={() => void updateUserRole(usr.id, usr.rol, !usr.activo)}
                            >
                              {usr.activo ? 'Desactivar usuario' : 'Activar usuario'}
                            </ActionMenuItem>
                            <ActionMenuItem icon={Trash2} destructive onClick={() => void handleDeleteUser(usr)}>
                              Eliminar usuario
                            </ActionMenuItem>
                          </ActionMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-ink-muted">
                        No hay usuarios que coincidan con la búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line-subtle p-3">
              <Pagination
                currentPage={userCurrentPage}
                totalItems={usuariosFiltrados.length}
                itemsPerPage={userItemsPerPage}
                onPageChange={setUserCurrentPage}
                onItemsPerPageChange={setUserItemsPerPage}
              />
            </div>
          </section>
          <Fab label="Registrar usuario" onClick={() => setShowUserModal(true)} />
        </div>
      )}

      {/* MODAL: REGISTRAR NUEVO USUARIO */}
      <Dialog
        open={showUserModal}
        title="Registrar nuevo usuario"
        onClose={() => {
          if (!submittingUser) setShowUserModal(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              disabled={submittingUser}
              onClick={() => setShowUserModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={submittingUser}
              onClick={(e) => void handleCreateUser(e)}
            >
              {submittingUser ? 'Enviando invitación...' : 'Enviar invitación'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
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

          <Field label="RUT chileno (opcional)">
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                value={userRut}
                onChange={(e) => setUserRut(e.target.value)}
                placeholder="12.345.678-9 (opcional para RRHH)"
              />
            )}
          </Field>

          <Field label="Rol de acceso y permisos" required>
            {({ id }) => (
              <Select
                id={id}
                value={userRol}
                onChange={(e) => setUserRol(e.target.value as UserRole)}
              >
                <option value="admin">Administrador</option>
                <option value="user">Colaborador</option>
              </Select>
            )}
          </Field>

          <div className="rounded-control bg-surface-muted border border-line-subtle p-3 text-ink-muted">
            <p className="text-xs leading-relaxed">
              No es necesario ingresar una contraseña. Al registrar al colaborador se le enviará un correo a <strong>{userEmail || 'su cuenta de correo'}</strong> con un enlace seguro para que defina su clave de acceso personal y se una al espacio de trabajo.
            </p>
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
                  <option value="user">Colaborador</option>
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
    </div>
  );
}
