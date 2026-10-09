'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Notificacion } from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import {
  Bell,
  CheckCheck,
  Trash2,
  AtSign,
  AlarmClock,
  Info,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  IconButton,
  FilterSelect,
  EmptyState,
} from '../../components/ui';
import { useConfirm, useToast } from '../../components/ui/feedback';

const TIPO_LABELS: Record<string, string> = {
  mencion: 'Menciones',
  asignacion: 'Asignaciones',
  seguimiento: 'Seguimientos',
  recordatorio: 'Recordatorios',
  cobro_pendiente: 'Cobros pendientes',
  cobro_vencido: 'Cobros vencidos',
  reprogramacion: 'Reprogramaciones',
  excepcion_pendiente: 'Excepciones pendientes',
  excepcion_resuelta: 'Excepciones resueltas',
  general: 'General',
  info: 'Información',
};

function tipoLabel(tipo: string): string {
  return TIPO_LABELS[tipo] || tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ');
}

/** Agrupa fechas por día: Hoy, Ayer, Esta semana o fecha completa */
function getDayGroupLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Hoy';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Ayer';

  // Días de diferencia
  const diffDays = Math.round((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
  if (diffDays <= 7) return 'Esta semana';

  return date.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterType, setFilterType] = useState<'todas' | 'no_leidas' | 'leidas' | 'menciones' | 'sistema'>('todas');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState('');

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const confirm = useConfirm();
  const toast = useToast();

  useEffect(() => {
    let ignore = false;
    if (!currentUserId) return;

    async function loadNotificaciones() {
      try {
        const { data, error } = await supabase
          .from('notificaciones')
          .select('*')
          .eq('usuario_id', currentUserId)
          .order('fecha', { ascending: false });

        if (!ignore) {
          if (!error && data) {
            setNotificaciones(data as Notificacion[]);
            setErrorMessage('');
          } else {
            setErrorMessage('No se pudieron cargar las notificaciones. Reintenta en unos segundos.');
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching notifications from Supabase:', err);
        if (!ignore) {
          setErrorMessage('No se pudieron cargar las notificaciones. Reintenta en unos segundos.');
          setLoading(false);
        }
      }
    }

    void loadNotificaciones();

    const channel = supabase
      .channel('realtime_notificaciones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${currentUserId}`,
        },
        () => {
          void loadNotificaciones();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  const handleMarkAsReadAndNavigate = async (n: Notificacion) => {
    if (!n.leido && currentUserId) {
      try {
        const { error } = await supabase
          .from('notificaciones')
          .update({ leido: true })
          .eq('id', n.id)
          .eq('usuario_id', currentUserId);
        if (error) throw error;
        setNotificaciones((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, leido: true } : item))
        );
      } catch {
        setErrorMessage('No se pudo marcar la notificación como leída.');
      }
    }

    if (n.link_url) {
      router.push(n.link_url);
    }
  };

  const handleToggleReadSingle = async (e: React.MouseEvent, n: Notificacion) => {
    e.stopPropagation();
    if (!currentUserId) return;
    const nextLeido = !n.leido;

    try {
      const { error } = await supabase
        .from('notificaciones')
        .update({ leido: nextLeido })
        .eq('id', n.id)
        .eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, leido: nextLeido } : item))
      );
      toast(nextLeido ? 'Notificación marcada como leída' : 'Notificación marcada como no leída');
    } catch {
      setErrorMessage('No se pudo actualizar el estado de la notificación.');
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('notificaciones')
        .delete()
        .eq('id', id)
        .eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      toast({ message: 'Notificación eliminada', tone: 'info' });
    } catch {
      setErrorMessage('No se pudo eliminar la notificación.');
    }
  };

  const handleClearAll = async () => {
    if (!currentUserId) return;
    const ok = await confirm({
      title: '¿Eliminar todas tus notificaciones?',
      message: 'Esta acción borrará todas las notificaciones de tu bandeja de entrada. No se puede deshacer.',
      confirmLabel: 'Eliminar todas',
      destructive: true,
    });
    if (!ok) return;

    const { error } = await supabase
      .from('notificaciones')
      .delete()
      .eq('usuario_id', currentUserId);

    if (error) {
      setErrorMessage('No se pudieron eliminar las notificaciones.');
      return;
    }
    setNotificaciones([]);
    setSelectedIds([]);
    toast({ message: 'Bandeja de notificaciones vaciada', tone: 'info' });
  };

  const handleBulkMarkAsRead = async () => {
    if (selectedIds.length === 0 || !currentUserId) return;

    try {
      const { error } = await supabase
        .from('notificaciones')
        .update({ leido: true })
        .in('id', selectedIds)
        .eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) =>
        prev.map((n) => (selectedIds.includes(n.id) ? { ...n, leido: true } : n))
      );
      toast(`${selectedIds.length} notificaciones marcadas como leídas`);
    } catch (err) {
      console.error('Error marking notifications as read:', err);
      setErrorMessage('No se pudieron marcar las notificaciones.');
    }
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || !currentUserId) return;
    const count = selectedIds.length;
    const ok = await confirm({
      title: `¿Eliminar ${count} notificaciones?`,
      message: 'Se eliminarán permanentemente de tu cuenta.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase
        .from('notificaciones')
        .delete()
        .in('id', selectedIds)
        .eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.filter((n) => !selectedIds.includes(n.id)));
      toast({ message: `${count} notificaciones eliminadas`, tone: 'info' });
    } catch (err) {
      console.error('Error deleting notifications:', err);
      setErrorMessage('No se pudieron eliminar las notificaciones.');
    }
    setSelectedIds([]);
  };

  const handleMarkAllAsRead = async () => {
    if (!currentUserId) return;
    try {
      const { error } = await supabase
        .from('notificaciones')
        .update({ leido: true })
        .eq('leido', false)
        .eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      toast('Todas las notificaciones marcadas como leídas');
    } catch (err) {
      console.error('Error marking all as read:', err);
      setErrorMessage('No se pudieron marcar todas las notificaciones.');
    }
    setSelectedIds([]);
  };

  // Filtrado
  const filteredNotifications = useMemo(() => {
    return notificaciones.filter((n) => {
      if (tipoFilter && (n.tipo || 'general') !== tipoFilter) return false;
      if (filterType === 'no_leidas') return !n.leido;
      if (filterType === 'leidas') return !!n.leido;
      if (filterType === 'menciones') return n.tipo === 'mencion' || n.mensaje.includes('@');
      if (filterType === 'sistema') return n.tipo !== 'mencion' && !n.mensaje.includes('@');
      return true;
    });
  }, [notificaciones, tipoFilter, filterType]);

  // Agrupación por día
  const groupedNotifications = useMemo(() => {
    const groups: { label: string; items: Notificacion[] }[] = [];
    filteredNotifications.forEach((n) => {
      const groupLabel = getDayGroupLabel(n.fecha);
      const existing = groups.find((g) => g.label === groupLabel);
      if (existing) {
        existing.items.push(n);
      } else {
        groups.push({ label: groupLabel, items: [n] });
      }
    });
    return groups;
  }, [filteredNotifications]);

  const toggleSelectAll = () => {
    const allFilteredIds = filteredNotifications.map((n) => n.id);
    const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFilteredIds);
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const tiposDisponibles = Array.from(new Set(notificaciones.map((n) => String(n.tipo || 'general'))))
    .sort((a, b) => tipoLabel(a).localeCompare(tipoLabel(b), 'es'));

  const counts = {
    todas: notificaciones.length,
    no_leidas: notificaciones.filter((n) => !n.leido).length,
    leidas: notificaciones.filter((n) => n.leido).length,
    menciones: notificaciones.filter((n) => n.tipo === 'mencion' || n.mensaje.includes('@')).length,
    sistema: notificaciones.filter((n) => n.tipo !== 'mencion' && !n.mensaje.includes('@')).length,
  };

  const filters: { id: typeof filterType; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'no_leidas', label: 'No leídas' },
    { id: 'leidas', label: 'Leídas' },
    { id: 'menciones', label: 'Menciones' },
    { id: 'sistema', label: 'Sistema' },
  ];

  const allSelected = filteredNotifications.length > 0 && filteredNotifications.every((n) => selectedIds.includes(n.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Notificaciones"
        description="Menciones, recordatorios y avisos del sistema. Haz clic en una notificación para ir a su origen."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={CheckCheck}
              onClick={handleMarkAllAsRead}
              disabled={counts.no_leidas === 0}
            >
              Marcar todas como leídas
            </Button>
            {notificaciones.length > 0 && (
              <Button
                variant="destructive"
                icon={Trash2}
                onClick={handleClearAll}
              >
                Vaciar bandeja
              </Button>
            )}
          </div>
        }
      />

      {errorMessage && (
        <div role="alert" className="rounded-control border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        {/* Pestañas de estado */}
        <div className="inline-flex rounded-control border border-line bg-surface p-1 text-xs font-medium overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => { setFilterType(f.id); setSelectedIds([]); }}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-control px-3 py-1.5 transition ${
                filterType === f.id
                  ? 'bg-accent text-on-accent font-semibold shadow-xs'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`t-micro rounded-full px-1.5 font-mono ${
                  filterType === f.id ? 'bg-surface/30 text-on-accent' : 'bg-surface-muted text-ink-muted'
                }`}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        {/* Filtro por tipo específico */}
        <div className="w-full sm:w-56">
          <FilterSelect
            label="Tipo"
            value={tipoFilter}
            onChange={(e) => { setTipoFilter(e.target.value); setSelectedIds([]); }}
          >
            <option value="">Todos los tipos</option>
            {tiposDisponibles.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipoLabel(tipo)} ({notificaciones.filter((n) => String(n.tipo || 'general') === tipo).length})
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>

      {/* Contenedor Principal de Lista */}
      <div className="rounded-panel border border-line bg-surface overflow-hidden">
        {/* Barra de selección masiva */}
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle bg-surface-muted px-4 py-2.5 text-xs">
          <label className="flex cursor-pointer items-center gap-2.5 font-medium text-ink">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={filteredNotifications.length === 0}
              className="h-4 w-4 rounded accent-accent cursor-pointer"
            />
            <span>
              {selectedIds.length > 0
                ? `${selectedIds.length} seleccionada(s)`
                : `${filteredNotifications.length} notificaciones`}
            </span>
          </label>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" icon={CheckCheck} onClick={handleBulkMarkAsRead}>
                Marcar leídas
              </Button>
              <Button size="sm" variant="destructive" icon={Trash2} onClick={handleBulkDelete}>
                Eliminar
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-ink-muted">Cargando notificaciones…</p>
        ) : filteredNotifications.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Bell}
              title="Bandeja de notificaciones al día"
              description="No hay avisos pendientes en esta categoría. Te notificaremos cuando tengas nuevas menciones, recordatorios o despachos en riesgo."
              action={
                <Button variant="primary" onClick={() => router.push('/')}>
                  Ir al panel operativo
                </Button>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-line-subtle">
            {groupedNotifications.map((group) => (
              <div key={group.label} className="space-y-1">
                {/* Encabezado de Grupo por Día */}
                <div className="sticky top-14 z-10 bg-surface-muted/90 px-4 py-1.5 backdrop-blur-xs">
                  <h3 className="t-micro font-semibold uppercase text-ink-muted">
                    {group.label}
                  </h3>
                </div>

                <ul className="divide-y divide-line-subtle">
                  {group.items.map((n) => {
                    const isMention = n.tipo === 'mencion' || n.mensaje.includes('@');
                    const isReminder =
                      String(n.tipo) === 'seguimiento' ||
                      n.tipo === 'recordatorio' ||
                      n.mensaje.toUpperCase().includes('RECORDATORIO');

                    // Ubicación / contexto
                    const opMatch = n.mensaje.match(/oportunidad ([A-Z0-9-]+)/i);
                    const recMatch = n.mensaje.match(/RECORDATORIO \((.*?)\):/);
                    const cliMatch = n.mensaje.match(/cliente ([\w\s]+)/i);
                    let ubicacionNombre = 'Sistema';
                    if (opMatch) ubicacionNombre = `Oportunidad ${opMatch[1]}`;
                    else if (recMatch) ubicacionNombre = `Cliente: ${recMatch[1]}`;
                    else if (cliMatch) ubicacionNombre = `Cliente: ${cliMatch[1]}`;
                    else if (n.link_url?.includes('/ventas')) ubicacionNombre = 'Pipeline de ventas';
                    else if (n.link_url?.includes('/clientes')) ubicacionNombre = 'Clientes';

                    const tipoCfg = isMention
                      ? { label: 'Mención', Icon: AtSign, badgeTone: 'text-accent-ink bg-accent-soft' }
                      : isReminder
                        ? { label: 'Recordatorio', Icon: AlarmClock, badgeTone: 'text-warning bg-warning-soft' }
                        : { label: 'Sistema', Icon: Info, badgeTone: 'text-info bg-info-soft' };

                    const isSelected = selectedIds.includes(n.id);

                    return (
                      <li
                        key={n.id}
                        className={`group flex items-start gap-3 px-4 py-3 transition ${
                          isSelected
                            ? 'bg-surface-muted'
                            : !n.leido
                              ? 'bg-accent-soft/30 hover:bg-surface-muted'
                              : 'bg-surface hover:bg-surface-muted/60'
                        }`}
                      >
                        {/* Selector checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(n.id)}
                          aria-label="Seleccionar notificación"
                          className="mt-2.5 h-4 w-4 shrink-0 rounded accent-accent cursor-pointer"
                        />

                        {/* Botón principal de la notificación */}
                        <button
                          type="button"
                          onClick={() => handleMarkAsReadAndNavigate(n)}
                          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
                        >
                          {/* Ícono semántico con forma */}
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-control ${tipoCfg.badgeTone}`}
                          >
                            <tipoCfg.Icon className="h-4 w-4" aria-hidden />
                          </span>

                          <span className="min-w-0 flex-1 space-y-1">
                            <span className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-ink-muted">{tipoCfg.label}</span>
                              <span className="text-ink-muted/50" aria-hidden>·</span>
                              <span className="t-micro truncate text-ink-muted">{ubicacionNombre}</span>
                              {!n.leido && (
                                <span className="t-micro rounded-full border border-accent-line bg-accent-soft px-1.5 font-semibold text-accent-ink">
                                  No leída
                                </span>
                              )}
                            </span>
                            <span
                              className={`block text-sm leading-snug break-words ${
                                n.leido ? 'text-ink-muted' : 'font-semibold text-ink'
                              }`}
                            >
                              {n.mensaje}
                            </span>
                          </span>

                          {/* Fecha y navegación */}
                          <span className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
                            <span className="t-micro t-num whitespace-nowrap text-ink-muted">
                              {new Date(n.fecha).toLocaleDateString('es-CL', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span className="flex items-center gap-1.5">
                              {n.link_url && (
                                <ChevronRight className="h-4 w-4 text-ink-muted transition group-hover:text-ink" aria-hidden />
                              )}
                            </span>
                          </span>
                        </button>

                        {/* Acciones en línea rápidas */}
                        <div className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100 sm:opacity-0 sm:transition-opacity">
                          <IconButton
                            icon={n.leido ? Check : CheckCheck}
                            label={n.leido ? 'Marcar como no leída' : 'Marcar como leída'}
                            onClick={(e) => handleToggleReadSingle(e, n)}
                          />
                          <IconButton
                            icon={Trash2}
                            label="Eliminar notificación"
                            onClick={(e) => handleDeleteSingle(e, n.id)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
