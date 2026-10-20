'use client';

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { Usuario, UserRole } from '../../lib/types';
import { createClient } from '../../lib/supabase/client';
import { logSistema } from '../../lib/logger';
import { Pagination } from '../../components/Pagination';
import {
  Trash2,
  Edit2,
  Users,
  UserPlus,
  Shield,
  Briefcase,
  HardHat,
  Landmark,
  ToggleLeft,
  ToggleRight,
  Mail,
  MoreVertical,
  UserCheck,
  UserX,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';
import {
  PageHeader,
  Panel,
  Button,
  IconButton,
  StatusBadge,
  Dialog,
  Field,
  TextInput,
  Select,
  ActionMenu,
  ActionMenuItem,
} from '../../components/ui/crm';
import { useToast, useConfirm } from '../../components/ui/feedback';

export default function ConfiguracionPage() {
  const { currentUser, usersList, addUser, updateUserRole, updateUser, deleteUser, refreshUsers } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const confirm = useConfirm();

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [userNombre, setUserNombre] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRut, setUserRut] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('mano_obra');

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
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resetPasswordForEmail(usr.email, {
        redirectTo: `${origin}/auth/callback?next=/auth/actualizar-password`,
      });
      if (error) throw error;
      toast({
        message: `Correo de invitación / acceso enviado exitosamente a ${usr.email}.`,
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
      setUserRol('mano_obra');
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
  const paginatedUsers = usersList.slice(
    (userCurrentPage - 1) * userItemsPerPage,
    userCurrentPage * userItemsPerPage
  );

  return (
    <div className="hg-page space-y-5 pb-12">
      {/* Cabecera Principal */}
      <PageHeader
        title="Configuración de usuarios y accesos"
        description="Gestión centralizada de colaboradores, roles de acceso, credenciales y vinculación a calendarios operativos."
        actions={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => setShowUserModal(true)}
          >
            Registrar usuario
          </Button>
        }
      />

      {/* ========================================================= */}
      {/* SECCIÓN ÚNICA: USUARIOS, ACCESOS Y CALENDARIOS             */}
      {/* ========================================================= */}
      <div className="space-y-4">
        {/* Matriz Informativa de Roles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              Operación comercial: clientes, cotizaciones, pipeline de ventas y seguimiento.
            </p>
          </Panel>

          <Panel className="p-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-success" />
              <span className="font-semibold text-xs text-ink uppercase">Finanzas y Caja</span>
            </div>
            <p className="t-caption">
              Gestión de caja, validación de abonos, cuentas bancarias, órdenes de compra y reportes.
            </p>
          </Panel>

          <Panel className="p-3.5 space-y-1">
            <div className="flex items-center gap-2">
              <HardHat className="w-4 h-4 text-warning" />
              <span className="font-semibold text-xs text-ink uppercase">Mano de obra</span>
            </div>
            <p className="t-caption">
              Acceso a Recursos Humanos (ficha personal) y calendarios operativos de faena.
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
          <div className="overflow-x-auto min-h-[280px]">
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
                      <div className="w-full min-w-[150px] max-w-[170px]">
                        <Select
                          value={usr.rol}
                          onChange={(e) => void updateUserRole(usr.id, e.target.value as UserRole, usr.activo)}
                          selectClassName="!min-h-[32px] !h-8 !py-1 text-xs font-medium cursor-pointer"
                        >
                          <option value="admin">Administrador</option>
                          <option value="user">Ejecutivo Comercial</option>
                          <option value="finanzas">Finanzas y Caja</option>
                          <option value="mano_obra">Mano de Obra</option>
                        </Select>
                      </div>
                    </td>

                    {/* Cal. Visitas Toggle */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => void handleToggleUserCalendar(usr.id, 'calendario_visitas', usr.calendario_visitas)}
                        className="cursor-pointer transition-transform active:scale-95"
                        title="Alternar presencia en Calendario de Visitas"
                      >
                        {(usr.calendario_visitas ?? true) ? (
                          <span className="inline-flex items-center gap-1 t-micro font-semibold text-success bg-success-soft border border-success-line px-2 py-0.5 rounded-full">
                            <ToggleRight className="w-4 h-4 text-success" />
                            <span>Activo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                            <ToggleLeft className="w-4 h-4 text-ink-muted" />
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
                        className="cursor-pointer transition-transform active:scale-95"
                        title="Alternar presencia en Calendario de Producción"
                      >
                        {(usr.calendario_produccion ?? true) ? (
                          <span className="inline-flex items-center gap-1 t-micro font-semibold text-success bg-success-soft border border-success-line px-2 py-0.5 rounded-full">
                            <ToggleRight className="w-4 h-4 text-success" />
                            <span>Activo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                            <ToggleLeft className="w-4 h-4 text-ink-muted" />
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
                        className="cursor-pointer transition-transform active:scale-95"
                        title="Alternar presencia en Calendario de Reventa"
                      >
                        {(usr.calendario_reventa ?? true) ? (
                          <span className="inline-flex items-center gap-1 t-micro font-semibold text-success bg-success-soft border border-success-line px-2 py-0.5 rounded-full">
                            <ToggleRight className="w-4 h-4 text-success" />
                            <span>Activo</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 t-micro text-ink-muted bg-surface-muted border border-line px-2 py-0.5 rounded-full">
                            <ToggleLeft className="w-4 h-4 text-ink-muted" />
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
                      <div className="flex items-center justify-end">
                        <ActionMenu icon={MoreVertical} label={`Acciones para ${usr.nombre}`}>
                          <ActionMenuItem
                            icon={Edit2}
                            onClick={() => handleOpenEditUser(usr)}
                          >
                            Editar usuario
                          </ActionMenuItem>

                          <ActionMenuItem
                            icon={Mail}
                            onClick={() => void handleResendInvite(usr)}
                          >
                            Reenviar invitación
                          </ActionMenuItem>

                          <ActionMenuItem
                            icon={usr.activo ? UserX : UserCheck}
                            onClick={() => void updateUserRole(usr.id, usr.rol, !usr.activo)}
                          >
                            {usr.activo ? 'Desactivar usuario' : 'Activar usuario'}
                          </ActionMenuItem>

                          <ActionMenuItem
                            icon={Trash2}
                            destructive
                            onClick={() => void handleDeleteUser(usr)}
                          >
                            Eliminar usuario
                          </ActionMenuItem>
                        </ActionMenu>
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
                <option value="mano_obra">Mano de Obra</option>
                <option value="user">Ejecutivo Comercial</option>
                <option value="finanzas">Finanzas y Caja</option>
                <option value="admin">Administrador</option>
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
    </div>
  );
}
