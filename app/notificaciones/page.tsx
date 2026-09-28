'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Notificacion } from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import { Bell, Info, Trash2, AtSign, ChevronRight, CheckCheck, AlarmClock, ChevronDown } from 'lucide-react';

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

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterType, setFilterType] = useState<'todas' | 'no_leidas' | 'leidas' | 'menciones' | 'sistema'>('todas');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState('');
  const router = useRouter();
  const supabase = createClient();
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;

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

    loadNotificaciones();

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
          loadNotificaciones();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleMarkAsReadAndNavigate = async (n: Notificacion) => {
    try {
      const { error } = await supabase.from('notificaciones').update({ leido: true })
        .eq('id', n.id).eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.map((item) => item.id === n.id ? { ...item, leido: true } : item));
      setErrorMessage('');
    } catch {
      setErrorMessage('No se pudo marcar la notificación como leída.');
    }

    if (n.link_url) {
      router.push(n.link_url);
    }
  };

  const handleClearAll = async () => {
    if (!currentUserId || !window.confirm('¿Eliminar todas tus notificaciones?')) return;
    const { error } = await supabase.from('notificaciones').delete().eq('usuario_id', currentUserId);
    if (error) { setErrorMessage('No se pudieron eliminar las notificaciones.'); return; }
    setNotificaciones([]);
    setSelectedIds([]);
    setErrorMessage('');
  };

  // Filter notifications
  const filteredNotifications = notificaciones.filter((n) => {
    if (tipoFilter && (n.tipo || 'general') !== tipoFilter) return false;
    if (filterType === 'no_leidas') {
      return !n.leido;
    }
    if (filterType === 'leidas') {
      return !!n.leido;
    }
    if (filterType === 'menciones') {
      return n.tipo === 'mencion' || n.mensaje.includes('@');
    }
    if (filterType === 'sistema') {
      return n.tipo !== 'mencion' && !n.mensaje.includes('@');
    }
    return true;
  });

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

  const handleBulkMarkAsRead = async () => {
    if (selectedIds.length === 0) return;

    try {
      const { error } = await supabase.from('notificaciones').update({ leido: true })
        .in('id', selectedIds).eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.map((n) => selectedIds.includes(n.id) ? { ...n, leido: true } : n));
      setErrorMessage('');
    } catch (err) {
      console.error('Error marking notifications as read:', err);
      setErrorMessage('No se pudieron marcar las notificaciones.');
    }
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    try {
      const { error } = await supabase.from('notificaciones').delete()
        .in('id', selectedIds).eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.filter((n) => !selectedIds.includes(n.id)));
      setErrorMessage('');
    } catch (err) {
      console.error('Error deleting notifications:', err);
      setErrorMessage('No se pudieron eliminar las notificaciones.');
    }
    setSelectedIds([]);
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { error } = await supabase.from('notificaciones').update({ leido: true })
        .eq('leido', false).eq('usuario_id', currentUserId);
      if (error) throw error;
      setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
      setErrorMessage('');
    } catch (err) {
      console.error('Error marking all as read:', err);
      setErrorMessage('No se pudieron marcar todas las notificaciones.');
    }
    setSelectedIds([]);
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
    <div className="space-y-5 text-[#213343]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#f97316]" />
            <span>Notificaciones</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">Menciones, recordatorios y avisos del sistema. Haz clic en una notificación para ir a su origen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={counts.no_leidas === 0}
            className="bg-white hover:bg-gray-50 border border-gray-200 text-[#213343] font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCheck className="w-4 h-4 text-[#f97316]" />
            <span>Marcar todas como leídas</span>
          </button>
          <div className="relative">
            <select
              aria-label="Filtrar por tipo de notificación"
              value={tipoFilter}
              onChange={(e) => { setTipoFilter(e.target.value); setSelectedIds([]); }}
              className={`appearance-none bg-white hover:bg-gray-50 border rounded-md shadow-sm pl-4 pr-9 py-2.5 text-xs font-bold cursor-pointer transition focus:outline-none focus:border-[#f97316] ${
                tipoFilter ? 'border-[#f97316] text-[#ea580c]' : 'border-gray-200 text-[#213343]'
              }`}
            >
              <option value="">Todos los tipos</option>
              {tiposDisponibles.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipoLabel(tipo)} ({notificaciones.filter((n) => String(n.tipo || 'general') === tipo).length})
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {notificaciones.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 text-red-600 font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar todas</span>
            </button>
          )}
        </div>
      </div>

      {errorMessage && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}

      {/* Filtros */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-md border border-gray-200 text-xs overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFilterType(f.id); setSelectedIds([]); }}
            className={`shrink-0 flex-1 py-1.5 px-3 rounded-md font-bold transition flex items-center justify-center gap-1.5 ${
              filterType === f.id ? 'bg-[#f97316] text-white shadow-xs' : 'text-gray-500 hover:text-[#213343] hover:bg-gray-100'
            }`}
          >
            <span>{f.label}</span>
            <span className={`rounded-full px-1.5 text-[10px] font-mono ${filterType === f.id ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {/* Listado */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs">
          <label className="flex items-center gap-2.5 font-semibold text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={filteredNotifications.length === 0}
              className="w-4 h-4 rounded accent-[#f97316] cursor-pointer"
            />
            <span>{selectedIds.length > 0 ? `${selectedIds.length} seleccionada(s)` : `${filteredNotifications.length} notificaciones`}</span>
          </label>
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleBulkMarkAsRead} className="bg-white hover:bg-orange-50 border border-gray-200 text-[#213343] font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1.5">
                <CheckCheck className="w-3.5 h-3.5 text-[#f97316]" />
                <span>Marcar leídas</span>
              </button>
              <button type="button" onClick={handleBulkDelete} className="bg-white hover:bg-red-50 border border-gray-200 text-red-600 font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">Cargando notificaciones...</p>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <Bell className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm font-semibold text-gray-600">No hay notificaciones en esta categoría.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredNotifications.map((n) => {
              const isMention = n.tipo === 'mencion' || n.mensaje.includes('@');
              const isReminder = String(n.tipo) === 'seguimiento' || n.tipo === 'recordatorio' || n.mensaje.toUpperCase().includes('RECORDATORIO');

              // Ubicación / ficha de origen de la notificación
              const opMatch = n.mensaje.match(/oportunidad ([A-Z0-9-]+)/i);
              const recMatch = n.mensaje.match(/RECORDATORIO \((.*?)\):/);
              const cliMatch = n.mensaje.match(/cliente ([\w\s]+)/i);
              let ubicacionNombre = 'Sistema CRM';
              if (opMatch) ubicacionNombre = `Oportunidad ${opMatch[1]}`;
              else if (recMatch) ubicacionNombre = `Cliente: ${recMatch[1]}`;
              else if (cliMatch) ubicacionNombre = `Cliente: ${cliMatch[1]}`;
              else if (n.link_url?.includes('/ventas')) ubicacionNombre = 'Pipeline de ventas';
              else if (n.link_url?.includes('/clientes')) ubicacionNombre = 'Clientes';

              const tipoCfg = isMention
                ? { label: 'Mención', Icon: AtSign, box: 'bg-orange-50 text-[#f97316] border-orange-200' }
                : isReminder
                  ? { label: 'Recordatorio', Icon: AlarmClock, box: 'bg-amber-50 text-amber-600 border-amber-200' }
                  : { label: 'Sistema', Icon: Info, box: 'bg-gray-50 text-gray-500 border-gray-200' };
              const isSelected = selectedIds.includes(n.id);

              return (
                <li
                  key={n.id}
                  className={`group flex items-start gap-3 px-4 py-3.5 transition ${
                    isSelected ? 'bg-orange-50' : !n.leido ? 'bg-orange-50/40 hover:bg-orange-50/70' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectOne(n.id)}
                    aria-label="Seleccionar notificación"
                    className="mt-2.5 w-4 h-4 rounded accent-[#f97316] cursor-pointer shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleMarkAsReadAndNavigate(n)}
                    className="flex flex-1 min-w-0 items-start gap-3 text-left"
                  >
                    <span className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tipoCfg.box}`}>
                      <tipoCfg.Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-bold text-gray-500">{tipoCfg.label}</span>
                        <span className="text-gray-300">·</span>
                        <span className="font-semibold text-gray-500 truncate">{ubicacionNombre}</span>
                      </span>
                      <span className={`block text-sm leading-snug break-words ${n.leido ? 'text-gray-600' : 'font-semibold text-[#213343]'}`}>
                        {n.mensaje}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5 shrink-0 pl-2">
                      <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap">
                        {new Date(n.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {!n.leido && <span className="w-2 h-2 rounded-full bg-[#f97316]" aria-label="No leída" />}
                        {n.link_url && <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#f97316] transition" />}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
