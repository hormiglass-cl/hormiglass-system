'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Notificacion } from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import {
  Inbox,
  Activity,
  Clock,
  Archive,
  Trash2,
  CheckCheck,
  Check,
  Filter,
  Search,
  RotateCcw,
  CheckCircle2,
  Circle,
  Bell,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import {
  PageHeader,
  Button,
  EmptyState,
} from '../../components/ui';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { useConfirm, useToast } from '../../components/ui/feedback';

export type InboxTab = 'principal' | 'otras' | 'mas_tarde' | 'borradas';
export type FilterCategory = 'todas' | 'no_leidas' | 'menciones' | 'recordatorios' | 'finanzas' | 'despacho';

/** Agrupa fechas al estilo ClickUp Inbox: Hoy, Últimos 7 días, Meses en minúsculas */
function getClickUpDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffTime = startOfToday.getTime() - dateMidnight.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hoy';
  if (diffDays <= 7) return 'Últimos 7 días';

  const monthNames = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  if (date.getFullYear() === now.getFullYear()) {
    return monthNames[date.getMonth()];
  }

  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

/** Formatea fecha corta a la derecha estilo ClickUp: "14:30", "sep. 4", "jul. 20" */
function formatClickUpDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  const monthShort = date.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
  const day = date.getDate();
  return `${monthShort}. ${day}`;
}

/** Identifica si un aviso pertenece a la bandeja "Principal" (alta prioridad) o a "Otras" */
function isPrincipalNotification(n: Notificacion): boolean {
  if (n.tipo === 'mencion' || n.mensaje.includes('@')) return true;
  if (n.tipo === 'recordatorio' || n.mensaje.startsWith('RECORDATORIO')) return true;
  if (n.tipo === 'asignacion') return true;
  const msgLower = n.mensaje.toLowerCase();
  if (msgLower.includes('cobro') || msgLower.includes('abono') || msgLower.includes('pago')) return true;
  if (msgLower.includes('despacho') || msgLower.includes('guía') || msgLower.includes('reprogramac')) return true;
  if (msgLower.includes('garantía') || msgLower.includes('reclamo')) return true;
  return false;
}

/** Desglosa el mensaje en título, extracto y autor/iniciales para la fila tipo ClickUp */
function parseNotificationContent(n: Notificacion) {
  let title = 'Aviso del sistema';
  let body = n.mensaje;
  let initials = 'HG';
  let category: 'mencion' | 'recordatorio' | 'cobro' | 'despacho' | 'sistema' = 'sistema';

  if (n.tipo === 'mencion' || n.mensaje.includes('@')) {
    category = 'mencion';
    const match = n.mensaje.match(/@([a-zA-Z0-9_-]+)/);
    if (match) {
      title = `Mención de @${match[1]}`;
      initials = match[1].slice(0, 2).toUpperCase();
    } else {
      title = 'Mención en actividad';
      initials = '@';
    }
  } else if (n.mensaje.startsWith('RECORDATORIO')) {
    category = 'recordatorio';
    const match = n.mensaje.match(/RECORDATORIO \((.*?)\):\s*(.*)/);
    if (match) {
      title = match[1] || 'Compromiso comercial';
      body = match[2] || n.mensaje;
      initials = title.slice(0, 2).toUpperCase();
    } else {
      title = 'Recordatorio de tarea';
      initials = 'RC';
    }
  } else if (
    n.mensaje.toLowerCase().includes('abono') ||
    n.mensaje.toLowerCase().includes('cobro') ||
    n.mensaje.toLowerCase().includes('pago')
  ) {
    category = 'cobro';
    title = 'Finanzas & Cobranza';
    initials = '$';
  } else if (
    n.mensaje.toLowerCase().includes('despacho') ||
    n.mensaje.toLowerCase().includes('guía') ||
    n.mensaje.toLowerCase().includes('entrega')
  ) {
    category = 'despacho';
    title = 'Logística & Despacho';
    initials = 'GD';
  } else if (n.tipo === 'asignacion') {
    category = 'recordatorio';
    title = 'Asignación comercial';
    initials = 'AS';
  }

  const opMatch = n.mensaje.match(/oportunidad ([A-Z0-9-]+)/i);
  if (opMatch) {
    title = `Oportunidad ${opMatch[1]}`;
  }

  return { title, body, initials, category };
}

export default function NotificacionesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const confirm = useConfirm();
  const toast = useToast();

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Pestañas estilo ClickUp Inbox: Principal, Otras, Más tarde, Borradas
  const [activeTab, setActiveTab] = useState<InboxTab>('principal');
  const [snoozedIds, setSnoozedIds] = useState<string[]>([]);
  const [clearedIds, setClearedIds] = useState<string[]>([]);

  // Filtro y búsqueda
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('todas');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Claves de almacenamiento por usuario
  const SNOOZED_KEY = currentUserId ? `hg_notif_snoozed_${currentUserId}` : '';
  const CLEARED_KEY = currentUserId ? `hg_notif_cleared_${currentUserId}` : '';

  // Cargar IDs de pospuestas y borradas desde localStorage
  useEffect(() => {
    if (!currentUserId) return;
    try {
      const s = localStorage.getItem(`hg_notif_snoozed_${currentUserId}`);
      if (s) setSnoozedIds(JSON.parse(s));
      const c = localStorage.getItem(`hg_notif_cleared_${currentUserId}`);
      if (c) setClearedIds(JSON.parse(c));
    } catch {}
  }, [currentUserId]);

  const updateSnoozed = (newIds: string[]) => {
    setSnoozedIds(newIds);
    if (SNOOZED_KEY) {
      try {
        localStorage.setItem(SNOOZED_KEY, JSON.stringify(newIds));
      } catch {}
    }
  };

  const updateCleared = (newIds: string[]) => {
    setClearedIds(newIds);
    if (CLEARED_KEY) {
      try {
        localStorage.setItem(CLEARED_KEY, JSON.stringify(newIds));
      } catch {}
    }
  };

  // Carga y suscripción debounced a Supabase
  useEffect(() => {
    let ignore = false;
    let debounceTimer: number | null = null;
    if (!currentUserId) return;

    async function loadNotificaciones() {
      try {
        const { data, error } = await supabase
          .from('notificaciones')
          .select('*')
          .eq('usuario_id', currentUserId)
          .order('fecha', { ascending: false })
          .limit(200);

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
      .channel(`notificaciones_user_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${currentUserId}`,
        },
        () => {
          if (debounceTimer) window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            void loadNotificaciones();
          }, 300);
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  // Contadores por Pestaña
  const counts = useMemo(() => {
    const unreadPrincipal = notificaciones.filter(
      (n) => !clearedIds.includes(n.id) && !snoozedIds.includes(n.id) && isPrincipalNotification(n) && !n.leido
    ).length;

    const unreadOtras = notificaciones.filter(
      (n) => !clearedIds.includes(n.id) && !snoozedIds.includes(n.id) && !isPrincipalNotification(n) && !n.leido
    ).length;

    const totalPrincipal = notificaciones.filter(
      (n) => !clearedIds.includes(n.id) && !snoozedIds.includes(n.id) && isPrincipalNotification(n)
    ).length;

    const totalOtras = notificaciones.filter(
      (n) => !clearedIds.includes(n.id) && !snoozedIds.includes(n.id) && !isPrincipalNotification(n)
    ).length;

    const snoozed = notificaciones.filter(
      (n) => !clearedIds.includes(n.id) && snoozedIds.includes(n.id)
    ).length;

    const cleared = notificaciones.filter((n) => clearedIds.includes(n.id)).length;

    return {
      unreadPrincipal,
      unreadOtras,
      totalPrincipal,
      totalOtras,
      snoozed,
      cleared,
    };
  }, [notificaciones, clearedIds, snoozedIds]);

  // Filtrado según pestaña activa y categorías
  const currentTabItems = useMemo(() => {
    return notificaciones.filter((n) => {
      const isCleared = clearedIds.includes(n.id);
      const isSnoozed = !isCleared && snoozedIds.includes(n.id);

      if (activeTab === 'borradas') {
        if (!isCleared) return false;
      } else if (activeTab === 'mas_tarde') {
        if (!isSnoozed) return false;
      } else if (activeTab === 'principal') {
        if (isCleared || isSnoozed || !isPrincipalNotification(n)) return false;
      } else if (activeTab === 'otras') {
        if (isCleared || isSnoozed || isPrincipalNotification(n)) return false;
      }

      // Filtro por categoría
      if (filterCategory === 'no_leidas' && n.leido) return false;
      if (filterCategory === 'menciones' && !(n.tipo === 'mencion' || n.mensaje.includes('@'))) return false;
      if (
        filterCategory === 'recordatorios' &&
        !(n.tipo === 'recordatorio' || n.mensaje.includes('RECORDATORIO') || n.tipo === 'asignacion')
      )
        return false;
      if (
        filterCategory === 'finanzas' &&
        !(
          n.mensaje.toLowerCase().includes('abono') ||
          n.mensaje.toLowerCase().includes('cobro') ||
          n.mensaje.toLowerCase().includes('pago')
        )
      )
        return false;
      if (
        filterCategory === 'despacho' &&
        !(
          n.mensaje.toLowerCase().includes('despacho') ||
          n.mensaje.toLowerCase().includes('guía') ||
          n.mensaje.toLowerCase().includes('entrega')
        )
      )
        return false;

      // Filtro por búsqueda
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!n.mensaje.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [notificaciones, clearedIds, snoozedIds, activeTab, filterCategory, searchQuery]);

  // Agrupación cronológica estilo ClickUp Inbox
  const groupedNotifications = useMemo(() => {
    const groups: { label: string; items: Notificacion[] }[] = [];
    currentTabItems.forEach((n) => {
      const groupLabel = getClickUpDateGroup(n.fecha);
      const existing = groups.find((g) => g.label === groupLabel);
      if (existing) {
        existing.items.push(n);
      } else {
        groups.push({ label: groupLabel, items: [n] });
      }
    });
    return groups;
  }, [currentTabItems]);

  // Navegar y marcar leída
  const handleMarkAsReadAndNavigate = async (n: Notificacion) => {
    if (!n.leido && currentUserId) {
      try {
        await supabase
          .from('notificaciones')
          .update({ leido: true })
          .eq('id', n.id)
          .eq('usuario_id', currentUserId);

        setNotificaciones((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, leido: true } : item))
        );
      } catch {}
    }

    if (n.link_url) {
      router.push(n.link_url);
    }
  };

  // Alternar leído / no leído
  const handleToggleReadSingle = async (e: React.MouseEvent, n: Notificacion) => {
    e.stopPropagation();
    if (!currentUserId) return;
    const nextLeido = !n.leido;

    try {
      await supabase
        .from('notificaciones')
        .update({ leido: nextLeido })
        .eq('id', n.id)
        .eq('usuario_id', currentUserId);

      setNotificaciones((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, leido: nextLeido } : item))
      );
      toast(nextLeido ? 'Aviso marcado como leído' : 'Aviso marcado como no leído');
    } catch {
      setErrorMessage('No se pudo actualizar el estado.');
    }
  };

  // Mover a "Borradas" (Botón morado ✓ Borrar estilo ClickUp)
  const handleClearSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!currentUserId) return;

    const nextCleared = Array.from(new Set([...clearedIds, id]));
    const nextSnoozed = snoozedIds.filter((sId) => sId !== id);
    updateCleared(nextCleared);
    updateSnoozed(nextSnoozed);
    setSelectedIds((prev) => prev.filter((sId) => sId !== id));

    try {
      await supabase
        .from('notificaciones')
        .update({ leido: true })
        .eq('id', id)
        .eq('usuario_id', currentUserId);

      setNotificaciones((prev) =>
        prev.map((item) => (item.id === id ? { ...item, leido: true } : item))
      );
    } catch {}

    toast({ message: 'Aviso movido a Borradas', tone: 'info' });
  };

  // Restaurar desde "Borradas"
  const handleRestoreSingle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const nextCleared = clearedIds.filter((cId) => cId !== id);
    updateCleared(nextCleared);
    toast({ message: 'Aviso restaurado a la bandeja', tone: 'info' });
  };

  // Posponer a "Más tarde"
  const handleSnoozeSingle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const nextSnoozed = Array.from(new Set([...snoozedIds, id]));
    updateSnoozed(nextSnoozed);
    setSelectedIds((prev) => prev.filter((sId) => sId !== id));
    toast({ message: 'Aviso pospuesto para Más tarde', tone: 'info' });
  };

  // Reactivar todas las pospuestas
  const handleReactivateAllSnoozed = () => {
    updateSnoozed([]);
    toast({ message: 'Todos los avisos reactivados', tone: 'info' });
  };

  // Limpiar pestaña actual (Mover a Borradas)
  const handleClearCurrentTab = async () => {
    if (!currentUserId || currentTabItems.length === 0) return;
    const ok = await confirm({
      title: '¿Limpiar todos los avisos de esta pestaña?',
      message: 'Los avisos se moverán a la sección de Borradas. Podrás consultarlos o restaurarlos cuando lo necesites.',
      confirmLabel: 'Borrar todo',
    });
    if (!ok) return;

    const idsToClear = currentTabItems.map((n) => n.id);
    const nextCleared = Array.from(new Set([...clearedIds, ...idsToClear]));
    const nextSnoozed = snoozedIds.filter((sId) => !idsToClear.includes(sId));
    updateCleared(nextCleared);
    updateSnoozed(nextSnoozed);
    setSelectedIds([]);

    try {
      await supabase
        .from('notificaciones')
        .update({ leido: true })
        .in('id', idsToClear)
        .eq('usuario_id', currentUserId);

      setNotificaciones((prev) =>
        prev.map((n) => (idsToClear.includes(n.id) ? { ...n, leido: true } : n))
      );
    } catch {}

    toast({ message: `${idsToClear.length} avisos movidos a Borradas`, tone: 'info' });
  };

  // Vaciar definitivamente la papelera
  const handleEmptyTrash = async () => {
    if (!currentUserId || clearedIds.length === 0) return;
    const ok = await confirm({
      title: '¿Vaciar historial de borradas permanentemente?',
      message: 'Se eliminarán de forma definitiva todas las notificaciones en la papelera.',
      confirmLabel: 'Vaciar papelera',
      destructive: true,
    });
    if (!ok) return;

    try {
      await supabase
        .from('notificaciones')
        .delete()
        .in('id', clearedIds)
        .eq('usuario_id', currentUserId);

      setNotificaciones((prev) => prev.filter((n) => !clearedIds.includes(n.id)));
      updateCleared([]);
      setSelectedIds([]);
      toast({ message: 'Historial de borradas vaciado permanentemente', tone: 'info' });
    } catch {
      setErrorMessage('No se pudieron eliminar definitivamente los avisos.');
    }
  };

  // Selección múltiple
  const toggleSelectAll = () => {
    const allFilteredIds = currentTabItems.map((n) => n.id);
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

  const handleBulkClear = async () => {
    if (selectedIds.length === 0 || !currentUserId) return;
    const nextCleared = Array.from(new Set([...clearedIds, ...selectedIds]));
    const nextSnoozed = snoozedIds.filter((sId) => !selectedIds.includes(sId));
    updateCleared(nextCleared);
    updateSnoozed(nextSnoozed);

    try {
      await supabase
        .from('notificaciones')
        .update({ leido: true })
        .in('id', selectedIds)
        .eq('usuario_id', currentUserId);

      setNotificaciones((prev) =>
        prev.map((n) => (selectedIds.includes(n.id) ? { ...n, leido: true } : n))
      );
    } catch {}

    toast({ message: `${selectedIds.length} avisos movidos a Borradas`, tone: 'info' });
    setSelectedIds([]);
  };

  const allSelected = currentTabItems.length > 0 && currentTabItems.every((n) => selectedIds.includes(n.id));

  const filterOptions: { id: FilterCategory; label: string }[] = [
    { id: 'todas', label: 'Todos los avisos' },
    { id: 'no_leidas', label: 'Solo no leídas' },
    { id: 'menciones', label: 'Menciones (@)' },
    { id: 'recordatorios', label: 'Recordatorios y Tareas' },
    { id: 'finanzas', label: 'Cobros y Finanzas' },
    { id: 'despacho', label: 'Logística y Despacho' },
  ];

  const tabCards: {
    id: InboxTab;
    title: string;
    description: string;
    icon: typeof Inbox;
    count: number;
    unitLabel: string;
    badgeText: string;
    badgeTone: 'accent' | 'info' | 'warning' | 'muted' | 'success';
    iconTone: 'accent' | 'info' | 'warning' | 'muted';
  }[] = [
    {
      id: 'principal',
      title: 'Principal',
      description: 'Menciones (@), tareas y cobros clave',
      icon: Inbox,
      count: counts.totalPrincipal,
      unitLabel: counts.totalPrincipal === 1 ? 'aviso activo' : 'avisos activos',
      badgeText: counts.unreadPrincipal > 0 ? `${counts.unreadPrincipal} sin leer` : 'Al día',
      badgeTone: counts.unreadPrincipal > 0 ? 'accent' : 'success',
      iconTone: 'accent',
    },
    {
      id: 'otras',
      title: 'Otras',
      description: 'Alertas automáticas y cambios de estado',
      icon: Activity,
      count: counts.totalOtras,
      unitLabel: counts.totalOtras === 1 ? 'aviso de sistema' : 'avisos de sistema',
      badgeText: counts.unreadOtras > 0 ? `${counts.unreadOtras} sin leer` : 'Al día',
      badgeTone: counts.unreadOtras > 0 ? 'info' : 'muted',
      iconTone: 'info',
    },
    {
      id: 'mas_tarde',
      title: 'Más tarde',
      description: 'Guardadas para revisar en otro momento',
      icon: Clock,
      count: counts.snoozed,
      unitLabel: counts.snoozed === 1 ? 'pospuesta' : 'pospuestas',
      badgeText: counts.snoozed > 0 ? `${counts.snoozed} pendientes` : 'Ninguna',
      badgeTone: counts.snoozed > 0 ? 'warning' : 'muted',
      iconTone: 'warning',
    },
    {
      id: 'borradas',
      title: 'Borradas',
      description: 'Historial de notificaciones resueltas',
      icon: Archive,
      count: counts.cleared,
      unitLabel: counts.cleared === 1 ? 'en papelera' : 'en papelera',
      badgeText: counts.cleared > 0 ? `${counts.cleared} archivadas` : 'Vacía',
      badgeTone: 'muted',
      iconTone: 'muted',
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* Cabecera */}
      <PageHeader
        title="Bandeja de entrada"
        description="Menciones, tareas, cobros y avisos operativos de Hormiglass."
        actions={
          <div className="flex items-center gap-2">
            <Button
              icon={CheckCheck}
              onClick={handleClearCurrentTab}
              disabled={currentTabItems.length === 0}
            >
              Marcar y limpiar todo
            </Button>
          </div>
        }
      />

      {errorMessage && (
        <div role="alert" className="rounded-control border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          {errorMessage}
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. SECCIONES PRINCIPALES COMO KPIS INTERACTIVOS           */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabCards.map((card) => {
          const isActive = activeTab === card.id;
          const CardIcon = card.icon;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setActiveTab(card.id);
                setSelectedIds([]);
              }}
              className={clsx(
                'group relative flex flex-col justify-between p-5 rounded-panel border text-left transition-all duration-200 cursor-pointer overflow-hidden select-none',
                isActive
                  ? 'border-accent bg-surface ring-2 ring-accent/25 shadow-sm'
                  : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted/30 shadow-2xs'
              )}
            >
              {/* Indicador inferior de pestaña activa */}
              {isActive && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-accent" />
              )}

              {/* Fila superior: Ícono y Badge de estado */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className={clsx(
                    'grid h-11 w-11 place-items-center rounded-control transition-colors shrink-0',
                    isActive
                      ? card.id === 'principal'
                        ? 'bg-accent text-on-accent'
                        : card.id === 'otras'
                        ? 'bg-info-soft text-info ring-1 ring-info-line'
                        : card.id === 'mas_tarde'
                        ? 'bg-warning-soft text-warning ring-1 ring-warning-line'
                        : 'bg-surface-muted text-ink ring-1 ring-line-strong'
                      : card.id === 'principal'
                      ? 'bg-accent-soft text-accent-ink group-hover:bg-accent/20'
                      : card.id === 'otras'
                      ? 'bg-info-soft/70 text-info group-hover:bg-info-soft'
                      : card.id === 'mas_tarde'
                      ? 'bg-warning-soft/70 text-warning group-hover:bg-warning-soft'
                      : 'bg-surface-muted text-ink-muted group-hover:text-ink'
                  )}
                >
                  <CardIcon size={20} />
                </span>

                {/* Badge de estado */}
                <span
                  className={clsx(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 border transition-colors',
                    card.badgeTone === 'accent' && 'bg-accent-soft text-accent-ink border-accent/30',
                    card.badgeTone === 'info' && 'bg-info-soft text-info border-info-line',
                    card.badgeTone === 'warning' && 'bg-warning-soft text-warning border-warning-line',
                    card.badgeTone === 'success' && 'bg-success-soft text-success border-success-line',
                    card.badgeTone === 'muted' && 'bg-surface-muted text-ink-muted border-line'
                  )}
                >
                  {card.badgeTone === 'accent' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  )}
                  <span>{card.badgeText}</span>
                </span>
              </div>

              {/* Fila media: Cifra grande y Título */}
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-ink t-num">
                    {card.count}
                  </span>
                  <span className="text-xs text-ink-muted font-normal">
                    {card.unitLabel}
                  </span>
                </div>
                <h3
                  className={clsx(
                    'mt-1 text-base font-bold transition-colors leading-tight',
                    isActive ? 'text-accent-ink' : 'text-ink group-hover:text-ink'
                  )}
                >
                  {card.title}
                </h3>
              </div>

              {/* Fila inferior: Descripción clara */}
              <p className="mt-2 text-xs text-ink-muted font-normal leading-relaxed">
                {card.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* 2. PANEL DE BANDEJA: ACCIONES Y FEED DE AVISOS            */}
      {/* ========================================================= */}
      <div className="rounded-panel border border-line bg-surface shadow-xs overflow-hidden">
        {/* Barra superior de la lista con Título de la sección, Búsqueda, Filtros y Acciones */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 border-b border-line bg-surface-muted/30">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Título de la vista activa */}
            <div className="flex items-center gap-2 pr-2 border-r border-line/60">
              <span className="text-sm font-semibold text-ink">
                {activeTab === 'principal' && 'Bandeja Principal'}
                {activeTab === 'otras' && 'Otras Notificaciones'}
                {activeTab === 'mas_tarde' && 'Guardadas para más tarde'}
                {activeTab === 'borradas' && 'Papelera de Borradas'}
              </span>
              <span className="text-xs text-ink-muted t-num">
                ({currentTabItems.length})
              </span>
            </div>

            {/* Botón Filtro */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-xs',
                  filterCategory !== 'todas'
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-surface text-ink hover:bg-surface-muted'
                )}
              >
                <Filter size={13} />
                <span>
                  Filtro
                  {filterCategory !== 'todas' &&
                    `: ${filterOptions.find((o) => o.id === filterCategory)?.label}`}
                </span>
              </button>

              {/* Menú de Filtro desplegable */}
              {showFilterMenu && (
                <div className="absolute left-0 mt-1.5 z-20 w-52 rounded-panel border border-line bg-surface p-1 shadow-lg space-y-0.5">
                  {filterOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setFilterCategory(opt.id);
                        setShowFilterMenu(false);
                      }}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-1.5 rounded-control text-xs transition cursor-pointer text-left',
                        filterCategory === opt.id
                          ? 'bg-accent-soft text-accent-ink font-semibold'
                          : 'text-ink hover:bg-surface-muted'
                      )}
                    >
                      <span>{opt.label}</span>
                      {filterCategory === opt.id && <Check size={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Búsqueda rápida */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                placeholder="Buscar aviso…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-full border border-line bg-surface pl-8 pr-3 py-1 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent w-40 sm:w-52 shadow-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Acciones de la derecha: Borrar todo / Vaciar */}
          <div className="flex items-center gap-2">
            {activeTab === 'borradas' ? (
              counts.cleared > 0 && (
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  className="inline-flex items-center gap-1.5 rounded-full border border-danger-line bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft/80 transition cursor-pointer shadow-xs"
                >
                  <Trash2 size={13} />
                  <span>Vaciar borradas</span>
                </button>
              )
            ) : activeTab === 'mas_tarde' ? (
              counts.snoozed > 0 && (
                <button
                  type="button"
                  onClick={handleReactivateAllSnoozed}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted transition cursor-pointer shadow-xs"
                >
                  <RotateCcw size={13} />
                  <span>Reactivar todas</span>
                </button>
              )
            ) : (
              currentTabItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCurrentTab}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted transition cursor-pointer shadow-xs"
                  title="Mueve todos los avisos de esta pestaña a Borradas"
                >
                  <CheckCheck size={13} className="text-accent-ink" />
                  <span>Borrar todo</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Barra de Selección Masiva (visible si hay selección) */}
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted px-5 py-2 text-xs">
            <span className="font-semibold text-ink">
              {selectedIds.length} notificación(es) seleccionada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={Check} onClick={handleBulkClear}>
                Mover a borradas
              </Button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* 3. FEED DE NOTIFICACIONES AGRUPADO POR TIEMPO             */}
        {/* ========================================================= */}
        {loading ? (
          <p className="py-16 text-center text-sm text-ink-muted">Cargando bandeja de entrada…</p>
        ) : currentTabItems.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              icon={Bell}
              title={
                activeTab === 'principal'
                  ? 'Bandeja principal al día'
                  : activeTab === 'otras'
                  ? 'Sin avisos secundarios'
                  : activeTab === 'mas_tarde'
                  ? 'No hay avisos pospuestos'
                  : 'Papelera vacía'
              }
              description={
                activeTab === 'principal'
                  ? 'No tienes tareas pendientes ni menciones por atender en este momento.'
                  : activeTab === 'otras'
                  ? 'Las notificaciones informativas y del sistema aparecerán aquí.'
                  : activeTab === 'mas_tarde'
                  ? 'Puedes posponer avisos con el ícono de reloj para revisarlos después.'
                  : 'Los avisos que limpies o borres se archivarán aquí antes de eliminarse.'
              }
            />
          </div>
        ) : (
          <div>
            {groupedNotifications.map((group) => (
              <div key={group.label} className="border-b border-line-subtle last:border-b-0">
                {/* Encabezado Cronológico de Grupo (estilo ClickUp: "septiembre", "julio", etc.) */}
                <div className="sticky top-0 z-10 bg-surface-muted/95 px-5 py-2 backdrop-blur-xs border-y border-line-subtle flex items-center justify-between">
                  <h3 className="t-caption font-semibold text-ink-muted capitalize">
                    {group.label}
                  </h3>
                  <span className="t-micro text-ink-muted">
                    {group.items.length} {group.items.length === 1 ? 'aviso' : 'avisos'}
                  </span>
                </div>

                {/* Lista de Filas */}
                <ul className="divide-y divide-line-subtle">
                  {group.items.map((n) => {
                    const parsed = parseNotificationContent(n);
                    const isSelected = selectedIds.includes(n.id);

                    return (
                      <li
                        key={n.id}
                        onClick={() => handleMarkAsReadAndNavigate(n)}
                        className={clsx(
                          'group relative flex items-center justify-between gap-3 px-5 py-3 transition cursor-pointer select-none',
                          isSelected
                            ? 'bg-surface-muted'
                            : !n.leido
                            ? 'bg-accent-soft/20 hover:bg-surface-muted'
                            : 'bg-surface hover:bg-surface-muted/60'
                        )}
                      >
                        {/* Bloque Izquierdo: Checkbox + Estado Circular + Título + Avatar + Descripción */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Checkbox de Selección */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectOne(n.id);
                            }}
                            aria-label="Seleccionar aviso"
                            className="h-4 w-4 shrink-0 rounded accent-accent cursor-pointer"
                          />

                          {/* Ícono de Estado Circular tipo ClickUp */}
                          <span
                            className={clsx(
                              'grid h-6 w-6 shrink-0 place-items-center rounded-full border',
                              n.leido
                                ? 'border-line text-ink-muted bg-surface-muted'
                                : parsed.category === 'mencion'
                                ? 'border-accent-line text-accent-ink bg-accent-soft'
                                : parsed.category === 'cobro'
                                ? 'border-success-line text-success bg-success-soft'
                                : parsed.category === 'recordatorio' || parsed.category === 'despacho'
                                ? 'border-warning-line text-warning bg-warning-soft'
                                : 'border-info-line text-info bg-info-soft'
                            )}
                          >
                            {n.leido ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <Circle size={9} className="fill-current" />
                            )}
                          </span>

                          {/* Título en Negrita */}
                          <span className="truncate text-xs sm:text-sm font-semibold text-ink shrink-0 max-w-[170px] sm:max-w-[260px]">
                            {parsed.title}
                          </span>

                          {/* Avatar con Iniciales del Autor / Entidad */}
                          <AvatarBadge name={parsed.initials} size="xs" className="shrink-0" />

                          {/* Texto del Mensaje / Preview */}
                          <span className="truncate text-xs text-ink-muted min-w-0 flex-1 hidden md:inline">
                            {parsed.body}
                          </span>
                        </div>

                        {/* Bloque Derecho: Acciones al Hover + Fecha */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Acciones Rápidas (visibles siempre en móvil, al hover en desktop) */}
                          <div className="flex items-center gap-1.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Posponer (Clock) */}
                            {activeTab !== 'mas_tarde' && activeTab !== 'borradas' && (
                              <button
                                type="button"
                                onClick={(e) => handleSnoozeSingle(e, n.id)}
                                className="cursor-pointer p-1.5 rounded-control text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition"
                                title="Más tarde (posponer aviso)"
                                aria-label="Posponer aviso"
                              >
                                <Clock size={14} />
                              </button>
                            )}

                            {/* Alternar Leído */}
                            <button
                              type="button"
                              onClick={(e) => handleToggleReadSingle(e, n)}
                              className="cursor-pointer p-1.5 rounded-control text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition"
                              title={n.leido ? 'Marcar como no leída' : 'Marcar como leída'}
                              aria-label={n.leido ? 'Marcar como no leída' : 'Marcar como leída'}
                            >
                              {n.leido ? <Check size={14} /> : <CheckCheck size={14} />}
                            </button>

                            {/* Botón Borrar Píldora (como en ClickUp: "✓ Borrar") */}
                            {activeTab !== 'borradas' ? (
                              <button
                                type="button"
                                onClick={(e) => handleClearSingle(e, n.id)}
                                className="cursor-pointer rounded-control bg-accent text-on-accent px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 flex items-center gap-1 shadow-2xs transition"
                                title="Borrar / Limpiar aviso"
                                aria-label="Borrar aviso"
                              >
                                <Check size={12} strokeWidth={2.5} />
                                <span>Borrar</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleRestoreSingle(e, n.id)}
                                className="cursor-pointer rounded-control border border-line bg-surface text-ink px-2.5 py-1 text-[11px] font-semibold hover:bg-surface-muted flex items-center gap-1 shadow-2xs transition"
                                title="Restaurar a principal"
                                aria-label="Restaurar aviso"
                              >
                                <RotateCcw size={12} />
                                <span>Restaurar</span>
                              </button>
                            )}
                          </div>

                          {/* Fecha corta a la derecha */}
                          <span className="t-micro text-ink-muted whitespace-nowrap pl-2">
                            {formatClickUpDate(n.fecha)}
                          </span>

                          {/* Flecha indicador de link */}
                          {n.link_url && (
                            <ChevronRight
                              className="h-3.5 w-3.5 text-ink-muted/50 group-hover:text-ink transition shrink-0"
                              aria-hidden
                            />
                          )}
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
