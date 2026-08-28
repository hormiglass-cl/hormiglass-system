'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Notificacion } from '../../lib/types';
import { Bell, Info, Trash2, Calendar, AtSign, ExternalLink, Filter, CheckSquare, Square, CheckCircle2 } from 'lucide-react';

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'todas' | 'no_leidas' | 'leidas' | 'menciones' | 'sistema'>('todas');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let ignore = false;
    async function loadNotificaciones() {
      try {
        const { data, error } = await supabase
          .from('notificaciones')
          .select('*')
          .order('fecha', { ascending: false });

        if (!ignore) {
          if (!error && data) {
            setNotificaciones(data as Notificacion[]);
          } else {
            setNotificaciones([]);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching notifications from Supabase:', err);
        if (!ignore) {
          setNotificaciones([]);
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
  }, []);

  const handleMarkAsReadAndNavigate = async (n: Notificacion) => {
    setNotificaciones((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, leido: true } : item))
    );

    try {
      await supabase.from('notificaciones').update({ leido: true }).eq('id', n.id);
    } catch {
      // ignore
    }

    if (n.link_url) {
      router.push(n.link_url);
    }
  };

  const handleClearAll = () => {
    setNotificaciones([]);
  };

  // Filter notifications
  const filteredNotifications = notificaciones.filter((n) => {
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

    setNotificaciones((prev) =>
      prev.map((n) => (selectedIds.includes(n.id) ? { ...n, leido: true } : n))
    );

    try {
      await supabase.from('notificaciones').update({ leido: true }).in('id', selectedIds);
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
    setSelectedIds([]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    setNotificaciones((prev) => prev.filter((n) => !selectedIds.includes(n.id)));

    try {
      await supabase.from('notificaciones').delete().in('id', selectedIds);
    } catch (err) {
      console.error('Error deleting notifications:', err);
    }
    setSelectedIds([]);
  };

  const handleMarkAllAsRead = async () => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));

    try {
      await supabase.from('notificaciones').update({ leido: true }).eq('leido', false);
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
    setSelectedIds([]);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-[#213343] relative">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#213343] flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#f97316]" />
            <span>Centro de Notificaciones & Recordatorios</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Visualización clasificada por Tipo, Cliente y Detalle con navegación directa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleMarkAllAsRead}
            className="text-xs text-[#f97316] hover:text-[#e08316] font-extrabold flex items-center gap-1.5 bg-orange-50 px-3.5 py-2 rounded-md border border-orange-200 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Marcar Todas Leídas</span>
          </button>

          {notificaciones.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 bg-red-50 px-3 py-2 rounded-md border border-red-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar</span>
            </button>
          )}
        </div>
      </div>

      {/* Bar de Acciones Masivas y Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Tabs de Filtrado */}
        <div className="flex flex-wrap items-center gap-2 bg-gray-100 p-1.5 rounded-lg border border-gray-200 text-xs">
          <button
            onClick={() => setFilterType('todas')}
            className={`px-3.5 py-1.5 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              filterType === 'todas'
                ? 'bg-[#f97316] text-white shadow-xs'
                : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Todas ({notificaciones.length})</span>
          </button>

          <button
            onClick={() => setFilterType('no_leidas')}
            className={`px-3.5 py-1.5 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              filterType === 'no_leidas'
                ? 'bg-[#f97316] text-white shadow-xs'
                : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span>No Leídas ({notificaciones.filter((n) => !n.leido).length})</span>
          </button>

          <button
            onClick={() => setFilterType('leidas')}
            className={`px-3.5 py-1.5 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              filterType === 'leidas'
                ? 'bg-[#f97316] text-white shadow-xs'
                : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Leídas ({notificaciones.filter((n) => n.leido).length})</span>
          </button>

          <button
            onClick={() => setFilterType('menciones')}
            className={`px-3.5 py-1.5 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              filterType === 'menciones'
                ? 'bg-[#f97316] text-white shadow-xs'
                : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <AtSign className="w-3.5 h-3.5" />
            <span>@ Menciones ({notificaciones.filter((n) => n.tipo === 'mencion' || n.mensaje.includes('@')).length})</span>
          </button>

          <button
            onClick={() => setFilterType('sistema')}
            className={`px-3.5 py-1.5 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              filterType === 'sistema'
                ? 'bg-[#f97316] text-white shadow-xs'
                : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Sistema ({notificaciones.filter((n) => n.tipo !== 'mencion' && !n.mensaje.includes('@')).length})</span>
          </button>
        </div>

        {/* Acciones Masivas cuando hay ítems seleccionados */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 p-2 rounded-lg  text-xs">
            <span className="font-extrabold text-[#f97316] px-1">
              {selectedIds.length} seleccionada(s)
            </span>

            <button
              onClick={handleBulkMarkAsRead}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1 shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Marcar Leídas</span>
            </button>

            <button
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-3 py-1.5 rounded-md transition flex items-center gap-1 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabla de Notificaciones estructurada por Seleccionar, Tipo, Cliente, Descripción */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden text-xs">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#213343] text-white uppercase text-[10px] tracking-normal">
            <tr>
              <th className="py-3.5 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={
                    filteredNotifications.length > 0 &&
                    filteredNotifications.every((n) => selectedIds.includes(n.id))
                  }
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded text-[#f97316] focus:ring-[#F7931F] accent-[#F7931F] cursor-pointer"
                />
              </th>
              <th className="py-3.5 px-4 w-32">Tipo</th>
              <th className="py-3.5 px-4 w-48">Ubicación / Ficha Origen</th>
              <th className="py-3.5 px-4">Descripción o Detalle del Recordatorio</th>
              <th className="py-3.5 px-4 w-36 text-right">Fecha & Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-[#213343]">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400 font-medium">
                  Cargando notificaciones...
                </td>
              </tr>
            ) : filteredNotifications.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400 font-medium">
                  No hay notificaciones registradas en esta categoría.
                </td>
              </tr>
            ) : (
              filteredNotifications.map((n) => {
                const isMention = n.tipo === 'mencion' || n.mensaje.includes('@');
                const isReminder = n.mensaje.toUpperCase().includes('RECORDATORIO');
                
                // Extract exact location / context where the mention or notification occurred
                const opMatch = n.mensaje.match(/oportunidad ([A-Z0-9-]+)/i);
                const recMatch = n.mensaje.match(/RECORDATORIO \((.*?)\):/);
                const cliMatch = n.mensaje.match(/cliente ([\w\s]+)/i);

                let ubicacionNombre = 'Sistema CRM';
                if (opMatch) {
                  ubicacionNombre = `Oportunidad ${opMatch[1]}`;
                } else if (recMatch) {
                  ubicacionNombre = `Ficha Cliente: ${recMatch[1]}`;
                } else if (cliMatch) {
                  ubicacionNombre = `Ficha Cliente: ${cliMatch[1]}`;
                } else if (n.link_url?.includes('/ventas')) {
                  ubicacionNombre = 'Pipeline de Ventas';
                } else if (n.link_url?.includes('/clientes')) {
                  ubicacionNombre = 'Módulo Clientes';
                }

                const isSelected = selectedIds.includes(n.id);

                return (
                  <tr
                    key={n.id}
                    className={`hover:bg-orange-100/60 transition ${
                      isSelected
                        ? 'bg-orange-200/60 font-bold'
                        : !n.leido
                        ? 'bg-orange-50/90 border-l-4 border-l-[#F7931F] font-extrabold text-[#213343] shadow-xs'
                        : 'bg-white text-gray-600 opacity-75'
                    }`}
                  >
                    {/* Checkbox de Selección */}
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(n.id)}
                        className="w-4 h-4 rounded text-[#f97316] focus:ring-[#F7931F] accent-[#F7931F] cursor-pointer"
                      />
                    </td>

                    {/* Column 1: Tipo & Estado No Leída */}
                    <td className="py-3.5 px-4 cursor-pointer" onClick={() => handleMarkAsReadAndNavigate(n)}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            isMention
                              ? 'bg-orange-100 text-[#f97316] border-orange-300'
                              : isReminder
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}
                        >
                          {isMention ? <AtSign className="w-3 h-3" /> : isReminder ? <Calendar className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                          <span>{isMention ? 'Mención' : isReminder ? 'Recordatorio' : 'Sistema'}</span>
                        </span>
                        {!n.leido && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-[#f97316] text-white px-2 py-0.5 rounded-full shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span>No Leída</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Ubicación / Ficha de Origen */}
                    <td className="py-3.5 px-4 font-extrabold text-[#213343] cursor-pointer" onClick={() => handleMarkAsReadAndNavigate(n)}>
                      <span className="bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 inline-block text-xs">
                        {ubicacionNombre}
                      </span>
                    </td>

                    {/* Column 3: Descripción o Detalle del Recordatorio */}
                    <td className="py-3.5 px-4 cursor-pointer" onClick={() => handleMarkAsReadAndNavigate(n)}>
                      <p className="text-xs text-[#213343] font-medium leading-relaxed flex items-center gap-1.5">
                        <span>{n.mensaje}</span>
                        {n.link_url && <ExternalLink className="w-3 h-3 text-[#f97316] shrink-0" />}
                      </p>
                    </td>

                    {/* Column 4: Fecha & Hora */}
                    <td className="py-3.5 px-4 text-right font-mono text-gray-500 text-[11px] cursor-pointer" onClick={() => handleMarkAsReadAndNavigate(n)}>
                      {new Date(n.fecha).toLocaleDateString('es-CL', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

