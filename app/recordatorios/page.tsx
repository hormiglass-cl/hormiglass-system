'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Edit,
  ListChecks,
  Loader2,
  Plus,
  Repeat,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import { completeRecordatorio } from '../../lib/recordatorios';
import type {
  EmpresaHormiglass,
  EstadoRecordatorio,
  Recordatorio,
  RecurrenciaRecordatorio,
  UrgenciaRecordatorio,
  Usuario,
} from '../../lib/types';

type Tab = 'mis' | 'todos';

interface RecordatorioForm {
  empresa: EmpresaHormiglass;
  estado: EstadoRecordatorio;
  urgencia: UrgenciaRecordatorio;
  titulo: string;
  descripcion: string;
  asignado_a_id: string;
  fecha_vencimiento: string;
  recurrencia: RecurrenciaRecordatorio;
  recurrencia_dia_mes: string;
  recurrencia_dia_semana: string;
}

const EMPRESAS: { id: EmpresaHormiglass; label: string; rut: string; subtitle: string }[] = [
  { id: 'comercial', label: 'Soc Comercial', rut: '76.391.215-9', subtitle: 'Gestión comercial y ventas' },
  { id: 'transportes', label: 'Soc Transportes', rut: '77.148.997-4', subtitle: 'Flota, rutas y operación' },
  { id: 'inmobiliaria', label: 'Soc Inmobiliaria', rut: '77.615.313-3', subtitle: 'Obras, documentación y cierres' },
];

const RECURRENCIA_LABELS: Record<RecurrenciaRecordatorio, string> = {
  ninguna: 'Sin recurrencia',
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
};

const ESTADOS_RECORDATORIO: {
  id: EstadoRecordatorio;
  label: string;
  className: string;
}[] = [
  { id: 'por_hacer', label: 'Por hacer', className: 'bg-slate-100 text-slate-700' },
  { id: 'en_curso', label: 'En curso', className: 'bg-blue-50 text-blue-700' },
  { id: 'requiere_actualizacion', label: 'Requiere actualización', className: 'bg-amber-50 text-amber-700' },
  { id: 'completada', label: 'Completada', className: 'bg-emerald-50 text-emerald-700' },
];

const URGENCIAS_RECORDATORIO: {
  id: UrgenciaRecordatorio;
  label: string;
  className: string;
}[] = [
  { id: 'baja', label: 'Baja', className: 'bg-gray-100 text-gray-600' },
  { id: 'media', label: 'Media', className: 'bg-sky-50 text-sky-700' },
  { id: 'alta', label: 'Alta', className: 'bg-orange-50 text-orange-700' },
  { id: 'critica', label: 'Crítica', className: 'bg-red-50 text-red-700' },
];

const DIAS_SEMANA = [
  { id: 0, label: 'Domingo' },
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function defaultForm(userId = ''): RecordatorioForm {
  return {
    empresa: 'inmobiliaria',
    estado: 'por_hacer',
    urgencia: 'media',
    titulo: '',
    descripcion: '',
    asignado_a_id: userId,
    fecha_vencimiento: todayISO(),
    recurrencia: 'ninguna',
    recurrencia_dia_mes: String(new Date().getDate()),
    recurrencia_dia_semana: String(new Date().getDay()),
  };
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function getStats(items: Recordatorio[]) {
  const activos = items.filter((item) => item.activo);
  const completados = activos.filter((item) => item.completado || item.estado === 'completada').length;
  const pendientes = activos.filter((item) => !item.completado && item.estado !== 'completada').length;
  const vencidos = activos.filter((item) => !item.completado && item.estado !== 'completada' && item.fecha_vencimiento < todayISO()).length;
  const total = completados + pendientes;
  const cumplimiento = total > 0 ? Math.round((completados / total) * 100) : 100;

  return { activos: activos.length, completados, pendientes, vencidos, cumplimiento };
}

function getUserName(users: Usuario[], id: string) {
  return users.find((user) => user.id === id)?.nombre || 'Usuario sin nombre';
}

export default function RecordatoriosPage() {
  const { currentUser, usersList } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<Tab>('mis');
  const [misRecordatorios, setMisRecordatorios] = useState<Recordatorio[]>([]);
  const [todosRecordatorios, setTodosRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState<EmpresaHormiglass>('inmobiliaria');
  const [personaFiltro, setPersonaFiltro] = useState('todos');
  const [showModal, setShowModal] = useState(false);
  const [editingRecordatorio, setEditingRecordatorio] = useState<Recordatorio | null>(null);
  const [formData, setFormData] = useState<RecordatorioForm>(defaultForm());

  const isAdmin = currentUser?.rol === 'admin';
  const activeUsers = useMemo(() => usersList.filter((user) => user.activo), [usersList]);

  const loadRecordatorios = useCallback(async () => {
    if (!currentUser?.id) return;

    setLoading(true);
    try {
      const { data: mine, error: mineError } = await supabase
        .from('recordatorios')
        .select('*')
        .eq('asignado_a_id', currentUser.id)
        .eq('activo', true)
        .order('completado', { ascending: true })
        .order('fecha_vencimiento', { ascending: true });

      if (mineError) throw mineError;
      setMisRecordatorios((mine || []) as Recordatorio[]);

      if (currentUser.rol === 'admin') {
        const { data: all, error: allError } = await supabase
          .from('recordatorios')
          .select('*')
          .order('activo', { ascending: false })
          .order('fecha_vencimiento', { ascending: true });

        if (allError) throw allError;
        setTodosRecordatorios((all || []) as Recordatorio[]);
      } else {
        setTodosRecordatorios([]);
      }
    } catch (err) {
      console.error('Error cargando recordatorios:', err);
      setMisRecordatorios([]);
      setTodosRecordatorios([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, supabase]);

  useEffect(() => {
    if (!currentUser?.id) {
      const loadingTimeout = window.setTimeout(() => {
        setLoading(false);
      }, 0);
      return () => {
        window.clearTimeout(loadingTimeout);
      };
    }

    const loadTimeout = window.setTimeout(() => {
      loadRecordatorios();
    }, 0);

    if (currentUser.rol !== 'admin') {
      const userId = currentUser.id;
      const userChannel = supabase
        .channel(`recordatorios_page_${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recordatorios', filter: `asignado_a_id=eq.${userId}` },
          () => loadRecordatorios()
        )
        .subscribe();

      return () => {
        window.clearTimeout(loadTimeout);
        supabase.removeChannel(userChannel);
      };
    }

    const channel = supabase
      .channel('recordatorios_page_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recordatorios' },
        () => loadRecordatorios()
      )
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeout);
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, currentUser?.rol, loadRecordatorios, supabase]);

  const misRecordatoriosFiltrados = useMemo(
    () => misRecordatorios.filter((item) => item.empresa === empresaFiltro),
    [misRecordatorios, empresaFiltro]
  );
  const misStatsEmpresa = useMemo(() => getStats(misRecordatoriosFiltrados), [misRecordatoriosFiltrados]);
  const adminRecordatoriosFiltrados = useMemo(() => {
    const activos = todosRecordatorios.filter((item) => item.activo && item.empresa === empresaFiltro);
    if (personaFiltro === 'todos') return activos;
    return activos.filter((item) => item.asignado_a_id === personaFiltro);
  }, [todosRecordatorios, empresaFiltro, personaFiltro]);

  const resumenPorPersona = useMemo(() => {
    return activeUsers
      .map((user) => {
        const items = todosRecordatorios.filter((item) => item.asignado_a_id === user.id && item.empresa === empresaFiltro);
        return { user, ...getStats(items) };
      })
      .filter((row) => row.activos > 0 || row.user.id === personaFiltro)
      .sort((a, b) => b.pendientes - a.pendientes || a.user.nombre.localeCompare(b.user.nombre));
  }, [activeUsers, todosRecordatorios, empresaFiltro, personaFiltro]);

  const openNewModal = () => {
    setEditingRecordatorio(null);
    setFormData({ ...defaultForm(activeUsers[0]?.id || currentUser?.id || ''), empresa: empresaFiltro });
    setErrorMsg('');
    setShowModal(true);
  };

  const openEditModal = (recordatorio: Recordatorio) => {
    setEditingRecordatorio(recordatorio);
    setFormData({
      empresa: recordatorio.empresa,
      estado: recordatorio.estado || (recordatorio.completado ? 'completada' : 'por_hacer'),
      urgencia: recordatorio.urgencia || 'media',
      titulo: recordatorio.titulo,
      descripcion: recordatorio.descripcion || '',
      asignado_a_id: recordatorio.asignado_a_id,
      fecha_vencimiento: recordatorio.fecha_vencimiento,
      recurrencia: recordatorio.recurrencia,
      recurrencia_dia_mes: String(recordatorio.recurrencia_dia_mes || new Date().getDate()),
      recurrencia_dia_semana: String(recordatorio.recurrencia_dia_semana || new Date().getDay()),
    });
    setErrorMsg('');
    setShowModal(true);
  };
  const buildPayload = () => {
    const weeklyDay = formData.recurrencia === 'semanal'
      ? Number(formData.recurrencia_dia_semana)
      : null;
    const monthlyDay = formData.recurrencia === 'mensual'
      ? Number(formData.recurrencia_dia_mes)
      : null;

    return {
      titulo: formData.titulo.trim(),
      empresa: formData.empresa,
      estado: formData.estado,
      urgencia: formData.urgencia,
      descripcion: formData.descripcion.trim() || null,
      asignado_a_id: formData.asignado_a_id,
      fecha_vencimiento: formData.fecha_vencimiento,
      recurrencia: formData.recurrencia,
      recurrencia_dia_mes: monthlyDay,
      recurrencia_dia_semana: weeklyDay,
    };
  };

  const handleSaveRecordatorio = async () => {
    if (!isAdmin) return;
    if (!formData.titulo.trim()) {
      setErrorMsg('El título es obligatorio.');
      return;
    }
    if (!formData.asignado_a_id) {
      setErrorMsg('Debes seleccionar una persona.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const payload = buildPayload();
      const estadoCompletado = payload.estado === 'completada';
      const completionPayload = {
        completado: estadoCompletado,
        completado_en: estadoCompletado ? (editingRecordatorio?.completado_en || new Date().toISOString()) : null,
      };

      if (editingRecordatorio) {
        const { data, error } = await supabase
          .from('recordatorios')
          .update({
            ...payload,
            ...completionPayload,
          })
          .eq('id', editingRecordatorio.id)
          .select()
          .single();

        if (error || !data) throw error || new Error('No se pudo actualizar el recordatorio.');

        await logSistema({
          tipo_accion: 'actualizacion',
          entidad: 'recordatorios',
          entidad_id: editingRecordatorio.id,
          descripcion: `Recordatorio actualizado: "${payload.titulo}".`,
          usuario_id: currentUser?.id || null,
          datos_anteriores: editingRecordatorio,
          datos_nuevos: data,
        });
      } else {
        const { data, error } = await supabase
          .from('recordatorios')
          .insert({
            ...payload,
            creado_por_id: currentUser?.id || null,
            completado: estadoCompletado,
            completado_en: estadoCompletado ? new Date().toISOString() : null,
          })
          .select()
          .single();

        if (error || !data) throw error || new Error('No se pudo crear el recordatorio.');

        await logSistema({
          tipo_accion: 'creacion',
          entidad: 'recordatorios',
          entidad_id: data.id,
          descripcion: `Recordatorio creado: "${payload.titulo}" para ${getUserName(usersList, payload.asignado_a_id)} (${payload.empresa}).`,
          usuario_id: currentUser?.id || null,
          datos_nuevos: data,
        });
      }

      setShowModal(false);
      setEditingRecordatorio(null);
      await loadRecordatorios();
    } catch (err) {
      console.error('Error guardando recordatorio:', err);
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar el recordatorio.');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (recordatorio: Recordatorio) => {
    if (recordatorio.completado || recordatorio.estado === 'completada') return;

    const previousMine = misRecordatorios;
    const previousAll = todosRecordatorios;
    setMisRecordatorios((prev) => prev.map((item) => (item.id === recordatorio.id ? { ...item, completado: true, estado: 'completada' } : item)));
    setTodosRecordatorios((prev) => prev.map((item) => (item.id === recordatorio.id ? { ...item, completado: true, estado: 'completada' } : item)));

    try {
      const { data, error } = await completeRecordatorio(supabase, recordatorio);
      if (error || !data) throw error || new Error('No se pudo completar el recordatorio.');

      await logSistema({
        tipo_accion: 'estado_cambiado',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Recordatorio completado: "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: data,
      });

      await loadRecordatorios();
    } catch (err) {
      console.error('Error completando recordatorio:', err);
      setMisRecordatorios(previousMine);
      setTodosRecordatorios(previousAll);
      alert(err instanceof Error ? err.message : 'No se pudo completar el recordatorio.');
    }
  };

  const handleDeactivate = async (recordatorio: Recordatorio) => {
    if (!isAdmin || !confirm(`¿Desactivar "${recordatorio.titulo}"?`)) return;

    try {
      const { error } = await supabase
        .from('recordatorios')
        .update({ activo: false })
        .eq('id', recordatorio.id);

      if (error) throw error;

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Recordatorio desactivado: "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
        datos_nuevos: { activo: false },
      });

      await loadRecordatorios();
    } catch (err) {
      console.error('Error desactivando recordatorio:', err);
      alert(err instanceof Error ? err.message : 'No se pudo desactivar el recordatorio.');
    }
  };

  const handleDelete = async (recordatorio: Recordatorio) => {
    if (!isAdmin || !confirm(`¿Eliminar definitivamente "${recordatorio.titulo}"?`)) return;

    try {
      const { error } = await supabase.from('recordatorios').delete().eq('id', recordatorio.id);
      if (error) throw error;

      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'recordatorios',
        entidad_id: recordatorio.id,
        descripcion: `Recordatorio eliminado: "${recordatorio.titulo}".`,
        usuario_id: currentUser?.id || null,
        datos_anteriores: recordatorio,
      });

      await loadRecordatorios();
    } catch (err) {
      console.error('Error eliminando recordatorio:', err);
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el recordatorio.');
    }
  };

  const renderRecordatorio = (recordatorio: Recordatorio, showPersona = false) => {
    const estado = recordatorio.estado || (recordatorio.completado ? 'completada' : 'por_hacer');
    const estadoConfig = ESTADOS_RECORDATORIO.find((item) => item.id === estado) || ESTADOS_RECORDATORIO[0];
    const urgenciaConfig = URGENCIAS_RECORDATORIO.find((item) => item.id === (recordatorio.urgencia || 'media')) || URGENCIAS_RECORDATORIO[1];
    const completado = recordatorio.completado || estado === 'completada';
    const vencido = !completado && recordatorio.fecha_vencimiento < todayISO();

    return (
      <div
        key={recordatorio.id}
        className={`p-4 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 transition ${
          vencido ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:border-orange-200'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => handleComplete(recordatorio)}
            disabled={completado}
            className="mt-0.5 text-[#f97316] disabled:text-emerald-600"
            title="Marcar como completado"
          >
            {completado ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
          </button>
          <div className="min-w-0">
            <p className={`font-extrabold text-sm ${completado ? 'line-through text-gray-400' : 'text-[#213343]'}`}>
              {recordatorio.titulo}
            </p>
            {recordatorio.descripcion && (
              <p className="text-xs text-gray-500 mt-1">{recordatorio.descripcion}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(recordatorio.fecha_vencimiento)}
              </span>
              {showPersona && (
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {getUserName(usersList, recordatorio.asignado_a_id)}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {(() => {
                  const empresa = EMPRESAS.find((item) => item.id === recordatorio.empresa);
                  return empresa ? `${empresa.label} ${empresa.rut}` : recordatorio.empresa;
                })()}
              </span>
              <span className={`px-2 py-0.5 rounded-full ${estadoConfig.className}`}>
                {estadoConfig.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full ${urgenciaConfig.className}`}>
                Urgencia {urgenciaConfig.label}
              </span>
              {recordatorio.recurrencia !== 'ninguna' && (
                <span className="px-2 py-0.5 rounded-full bg-orange-50 text-[#f97316] flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  {RECURRENCIA_LABELS[recordatorio.recurrencia]}
                </span>
              )}
              {vencido && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white">Vencido</span>
              )}
              {recordatorio.veces_completado > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {recordatorio.veces_completado} completado{recordatorio.veces_completado === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </div>

        {isAdmin && activeTab === 'todos' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openEditModal(recordatorio)}
              className="p-2 rounded-md bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#f97316] transition"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDeactivate(recordatorio)}
              className="px-3 py-2 rounded-md bg-amber-50 text-amber-700 text-xs font-extrabold hover:bg-amber-100 transition"
            >
              Desactivar
            </button>
            <button
              type="button"
              onClick={() => handleDelete(recordatorio)}
              className="p-2 rounded-md bg-red-50 text-red-600 hover:bg-red-100 transition"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
        Cargando recordatorios...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#213343]  pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-[#f97316]" />
            <span>Recordatorios</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Planificación personal, cumplimiento y tareas asignadas.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openNewModal}
            className="self-start lg:self-auto px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg font-extrabold text-xs transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo recordatorio</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-gray-100 p-1.5 rounded-lg border border-gray-200 w-fit text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('mis')}
          className={`px-4 py-2 rounded-md font-extrabold transition flex items-center gap-1.5 ${
            activeTab === 'mis' ? 'bg-[#f97316] text-white shadow-sm' : 'text-gray-600 hover:text-[#213343]'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>Mis Recordatorios</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('todos')}
            className={`px-4 py-2 rounded-md font-extrabold transition flex items-center gap-1.5 ${
              activeTab === 'todos' ? 'bg-[#f97316] text-white shadow-sm' : 'text-gray-600 hover:text-[#213343]'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Todos</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {EMPRESAS.map((empresa) => {
          const source = isAdmin ? todosRecordatorios : misRecordatorios;
          const stats = getStats(source.filter((item) => item.empresa === empresa.id));
          const active = empresaFiltro === empresa.id;

          return (
            <button
              key={empresa.id}
              type="button"
              onClick={() => setEmpresaFiltro(empresa.id)}
              className={`text-left bg-white border rounded-lg p-4 transition shadow-sm ${
                active ? 'border-[#f97316] ring-2 ring-orange-100' : 'border-gray-200 hover:border-orange-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 text-[#f97316] flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-black text-gray-400">{stats.pendientes} pendientes</span>
              </div>
              <p className="font-black text-sm mt-3">{empresa.label}</p>
              <p className="text-[11px] text-gray-600 font-black mt-0.5">RUT {empresa.rut}</p>
              <p className="text-[11px] text-gray-500 font-medium mt-0.5">{empresa.subtitle}</p>
            </button>
          );
        })}
      </div>

      {activeTab === 'mis' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-500">Pendientes</p>
              <p className="text-3xl font-black mt-1">{misStatsEmpresa.pendientes}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-500">Cumplimiento</p>
              <p className="text-3xl font-black mt-1 text-emerald-700">{misStatsEmpresa.cumplimiento}%</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-500">Vencidos</p>
              <p className="text-3xl font-black mt-1 text-red-600">{misStatsEmpresa.vencidos}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-black text-base">Mis Recordatorios</h2>
                <p className="text-xs text-gray-500 font-medium">
                  {misStatsEmpresa.pendientes} pendientes · {misStatsEmpresa.cumplimiento}% cumplimiento · {EMPRESAS.find((empresa) => empresa.id === empresaFiltro)?.label}
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>

            {misRecordatoriosFiltrados.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                No tienes recordatorios activos.
              </div>
            ) : (
              <div className="space-y-2.5">
                {misRecordatoriosFiltrados.map((recordatorio) => renderRecordatorio(recordatorio))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'todos' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-black text-base">Resumen por persona</h2>
                <p className="text-xs text-gray-500 font-medium">Cumplimiento calculado sobre recordatorios activos.</p>
              </div>
              <select
                value={personaFiltro}
                onChange={(event) => setPersonaFiltro(event.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-bold focus:outline-none focus:border-[#f97316]"
              >
                <option value="todos">Todas las personas</option>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nombre}
                  </option>
                ))}
              </select>
            </div>

            {resumenPorPersona.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                No hay recordatorios activos asignados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="py-2 font-black">Persona</th>
                      <th className="py-2 font-black">Activos</th>
                      <th className="py-2 font-black">Completados</th>
                      <th className="py-2 font-black">Pendientes</th>
                      <th className="py-2 font-black">Vencidos</th>
                      <th className="py-2 font-black">% Cumplimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {resumenPorPersona.map((row) => (
                      <tr key={row.user.id}>
                        <td className="py-3 font-extrabold">{row.user.nombre}</td>
                        <td className="py-3">{row.activos}</td>
                        <td className="py-3 text-emerald-700 font-bold">{row.completados}</td>
                        <td className="py-3 text-amber-700 font-bold">{row.pendientes}</td>
                        <td className="py-3 text-red-600 font-bold">{row.vencidos}</td>
                        <td className="py-3 font-black">{row.cumplimiento}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-black text-base">Recordatorios activos</h2>
                <p className="text-xs text-gray-500 font-medium">
                  {adminRecordatoriosFiltrados.length} visibles con el filtro actual.
                </p>
              </div>
            </div>

            {adminRecordatoriosFiltrados.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-xs italic border border-dashed border-gray-200 rounded-lg">
                No hay recordatorios para mostrar.
              </div>
            ) : (
              <div className="space-y-2.5">
                {adminRecordatoriosFiltrados.map((recordatorio) => renderRecordatorio(recordatorio, true))}
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-lg">{editingRecordatorio ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h3>
                <p className="text-xs text-gray-500 font-medium">Asignación y planificación personal</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMsg && (
                <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Empresa</span>
                <select
                  value={formData.empresa}
                  onChange={(event) => setFormData((prev) => ({ ...prev, empresa: event.target.value as EmpresaHormiglass }))}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                >
                  {EMPRESAS.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Título</span>
                <input
                  type="text"
                  value={formData.titulo}
                  onChange={(event) => setFormData((prev) => ({ ...prev, titulo: event.target.value }))}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:border-[#f97316]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Estado</span>
                <select
                  value={formData.estado}
                  onChange={(event) => setFormData((prev) => ({ ...prev, estado: event.target.value as EstadoRecordatorio }))}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                >
                  {ESTADOS_RECORDATORIO.map((estado) => (
                    <option key={estado.id} value={estado.id}>
                      {estado.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Urgencia</span>
                <select
                  value={formData.urgencia}
                  onChange={(event) => setFormData((prev) => ({ ...prev, urgencia: event.target.value as UrgenciaRecordatorio }))}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                >
                  {URGENCIAS_RECORDATORIO.map((urgencia) => (
                    <option key={urgencia.id} value={urgencia.id}>
                      {urgencia.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-extrabold text-gray-600">Descripción</span>
                <textarea
                  value={formData.descripcion}
                  onChange={(event) => setFormData((prev) => ({ ...prev, descripcion: event.target.value }))}
                  rows={3}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold resize-none focus:outline-none focus:border-[#f97316]"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Asignado a</span>
                  <select
                    value={formData.asignado_a_id}
                    onChange={(event) => setFormData((prev) => ({ ...prev, asignado_a_id: event.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                  >
                    <option value="">Seleccionar persona</option>
                    {activeUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Fecha</span>
                  <input
                    type="date"
                    value={formData.fecha_vencimiento}
                    onChange={(event) => setFormData((prev) => ({ ...prev, fecha_vencimiento: event.target.value }))}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:border-[#f97316]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-extrabold text-gray-600">Recurrencia</span>
                  <select
                    value={formData.recurrencia}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        recurrencia: event.target.value as RecurrenciaRecordatorio,
                      }))
                    }
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                  >
                    {(Object.keys(RECURRENCIA_LABELS) as RecurrenciaRecordatorio[]).map((value) => (
                      <option key={value} value={value}>
                        {RECURRENCIA_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>

                {formData.recurrencia === 'semanal' && (
                  <label className="block">
                    <span className="text-xs font-extrabold text-gray-600">Día de semana</span>
                    <select
                      value={formData.recurrencia_dia_semana}
                      onChange={(event) => setFormData((prev) => ({ ...prev, recurrencia_dia_semana: event.target.value }))}
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold bg-white focus:outline-none focus:border-[#f97316]"
                    >
                      {DIAS_SEMANA.map((day) => (
                        <option key={day.id} value={day.id}>
                          {day.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {formData.recurrencia === 'mensual' && (
                  <label className="block">
                    <span className="text-xs font-extrabold text-gray-600">Día del mes</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={formData.recurrencia_dia_mes}
                      onChange={(event) => setFormData((prev) => ({ ...prev, recurrencia_dia_mes: event.target.value }))}
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-bold focus:outline-none focus:border-[#f97316]"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-extrabold text-gray-600 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRecordatorio}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#f97316] text-white text-xs font-extrabold hover:bg-[#ea580c] disabled:opacity-60 transition flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>{saving ? 'Guardando...' : 'Guardar recordatorio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
