'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '../lib/supabase/client';
import {
  EventoProduccionLogistica,
  Usuario,
  TipoEventoProduccionLogistica,
  EstadoEventoProduccionLogistica,
  ContextoEventoProduccionLogistica,
  OportunidadVenta,
  ROL_NOMBRE,
} from '../lib/types';
import { useAuth } from '../lib/context/AuthContext';
import { logSistema } from '../lib/logger';
import { claveVehiculo, eventosEnConflicto, produccionesPendientesAntesDe } from '../lib/calendario-conflictos';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Building,
  HardHat,
  Factory,
  Truck,
  ShoppingCart,
  Trash2,
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { mensajeError } from '../lib/errores';
import {
  Button,
  IconButton,
  Dialog,
  StatusBadge,
  Tone,
} from './ui/crm';
import { useConfirm, useToast } from './ui/feedback';

export const ESTADOS_EVENTO_CONFIG: Record<
  string,
  { label: string; tone: Tone; icon: React.ElementType }
> = {
  por_hacer: {
    label: 'Por hacer',
    tone: 'info',
    icon: Clock,
  },
  en_curso: {
    label: 'En curso',
    tone: 'accent',
    icon: RotateCcw,
  },
  reprogramado: {
    label: 'Reprogramado',
    tone: 'warning',
    icon: AlertTriangle,
  },
  completado: {
    label: 'Completado',
    tone: 'success',
    icon: CheckCircle2,
  },
  no_realizado: {
    label: 'No realizado',
    tone: 'danger',
    icon: XCircle,
  },
};

export const TIPOS_EVENTO_CONFIG: Record<
  TipoEventoProduccionLogistica,
  { label: string; icon: React.ElementType; tone: Tone }
> = {
  obra: { label: 'Obra / Instalación', icon: HardHat, tone: 'accent' },
  produccion: { label: 'Fabricación Planta', icon: Factory, tone: 'info' },
  reventa: { label: 'Reventa / Coordinación', icon: ShoppingCart, tone: 'info' },
  logistica: { label: 'Despacho & Logística', icon: Truck, tone: 'success' },
  retiro_proveedor: { label: 'Retiro de proveedor', icon: Truck, tone: 'warning' },
  despacho_cliente: { label: 'Despacho a cliente', icon: Truck, tone: 'success' },
  instalacion: { label: 'Instalación', icon: HardHat, tone: 'accent' },
  postventa: { label: 'Postventa', icon: HardHat, tone: 'danger' },
  logistica_interna: { label: 'Logística interna', icon: Truck, tone: 'neutral' },
};

const CALENDARIOS_OPERACIONALES = [
  { id: 'visitas_terreno', label: 'Visitas a terreno' },
  { id: 'produccion_logistica', label: 'Producción y logística' },
  { id: 'reventa_logistica', label: 'Reventa y logística' },
];

interface CalendarioEventosProps {
  contexto: ContextoEventoProduccionLogistica;
  titulo: string;
  subtitulo?: string;
  tiposPermitidos: TipoEventoProduccionLogistica[];
  filtroPersonalField?: string;
  highlightedOpId?: string | null;
}

export function CalendarioEventos({
  contexto,
  titulo,
  subtitulo,
  tiposPermitidos,
  filtroPersonalField,
  highlightedOpId,
}: CalendarioEventosProps) {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();

  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);
  const [allEventos, setAllEventos] = useState<EventoProduccionLogistica[]>([]);
  const [guideOptions, setGuideOptions] = useState<{ id: string; oportunidad_id: string; numero_guia: string }[]>([]);
  const [ocOptions, setOcOptions] = useState<{ orden_compra_id: string; oportunidad_id: string; ordenes_compra: { numero_oc: string } | null }[]>([]);
  const [personalList, setPersonalList] = useState<Usuario[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [, setLoading] = useState(true);

  // Filters (Multi-selection for Responsables)
  const [selectedResponsables, setSelectedResponsables] = useState<string[]>([]);
  const [showResponsableMenu, setShowResponsableMenu] = useState(false);
  const [selectedEstado, setSelectedEstado] = useState<string>('todos');
  const [selectedTipo, setSelectedTipo] = useState<string>('todos');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals & Selection
  const [selectedEvento, setSelectedEvento] = useState<EventoProduccionLogistica | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // New/Edit form state
  const [formOpId, setFormOpId] = useState<string>('');
  const [formTipo, setFormTipo] = useState<TipoEventoProduccionLogistica>(tiposPermitidos[0]);
  const [formTitulo, setFormTitulo] = useState<string>('');
  const [formFechaInicio, setFormFechaInicio] = useState<string>('');
  const [formFechaFin, setFormFechaFin] = useState<string>('');
  const [formResponsableId, setFormResponsableId] = useState<string>('');
  const [formEstado, setFormEstado] = useState<EstadoEventoProduccionLogistica>('por_hacer');
  const [formObservaciones, setFormObservaciones] = useState<string>('');
  const [formVehiculo, setFormVehiculo] = useState('');
  const [formGuideId, setFormGuideId] = useState('');
  const [formOcId, setFormOcId] = useState('');
  const [formMotivo, setFormMotivo] = useState('');
  const [reprogramaciones, setReprogramaciones] = useState<{ id: string; fecha_inicio_anterior: string; fecha_inicio_nueva: string; motivo: string; created_at: string; actor_id: string | null }[]>([]);
  const [historialError, setHistorialError] = useState('');
  const [savingLoading, setSavingLoading] = useState(false);

  const fetchEventos = useCallback(async () => {
    try {
      setLoading(true);
      const [eventRes, userRes, opRes, guideRes, ocRes] = await Promise.all([
        supabase
          .from('eventos_produccion_logistica')
          .select('*, oportunidad:oportunidades(*, cliente:clientes(*)), responsable:usuarios!responsable_id(*)')
          .order('fecha_inicio', { ascending: true }),
        supabase
          .from('usuarios')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('oportunidades')
          .select('id, codigo, titulo, cliente:clientes(nombre)')
          .order('created_at', { ascending: false }),
        supabase.from('guias_despacho').select('id, oportunidad_id, numero_guia').neq('estado', 'cancelada'),
        supabase.from('orden_compra_asignaciones').select('orden_compra_id, oportunidad_id, ordenes_compra(numero_oc)'),
      ]);

      if (eventRes.data) {
        const all = eventRes.data as EventoProduccionLogistica[];
        setAllEventos(all);
        setEventos(all.filter((event) => event.contexto === contexto));
      }

      if (userRes.data) {
        const users = userRes.data as Usuario[];
        const isReventa = contexto === 'reventa_logistica' || (filtroPersonalField && filtroPersonalField.includes('reventa'));
        const filteredUsers = isReventa
          ? users.filter((u) => u.calendario_reventa !== false)
          : users.filter((u) => u.calendario_produccion !== false);
        setPersonalList(filteredUsers.length > 0 ? filteredUsers : users);
      }

      if (opRes.data) {
        setOportunidades(opRes.data as OportunidadVenta[]);
      }
      if (guideRes.data) setGuideOptions(guideRes.data);
      if (ocRes.data) setOcOptions(ocRes.data as typeof ocOptions);
    } catch (err) {
      console.error('Error fetching calendar events:', err);
    } finally {
      setLoading(false);
    }
  }, [contexto, filtroPersonalField, supabase]);

  useEffect(() => {
    let ignore = false;
    const loadTimer = window.setTimeout(() => {
      if (!ignore) void fetchEventos();
    }, 0);

    const channel = supabase
      .channel(`realtime_cal_${contexto}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eventos_produccion_logistica' },
        () => {
          if (!ignore) void fetchEventos();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        () => {
          if (!ignore) void fetchEventos();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      window.clearTimeout(loadTimer);
      void supabase.removeChannel(channel);
    };
  }, [contexto, fetchEventos, supabase]);

  const handleOpenNewModal = (dateStr?: string) => {
    const now = dateStr ? new Date(`${dateStr}T09:00:00`) : new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toIsoLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setFormOpId(highlightedOpId || (oportunidades[0]?.id || ''));
    setFormTipo(tiposPermitidos[0]);
    setFormTitulo('');
    setFormFechaInicio(toIsoLocal(now));
    setFormFechaFin(toIsoLocal(end));
    setFormResponsableId('');
    setFormEstado('por_hacer');
    setFormObservaciones('');
    setFormVehiculo('');
    setFormGuideId('');
    setFormOcId('');
    setFormMotivo('');
    setIsNewModalOpen(true);
  };

  const handleOpenEditModal = (ev: EventoProduccionLogistica) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const toIsoLocal = (dateVal?: string) => {
      if (!dateVal) return '';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setFormOpId(ev.oportunidad_id);
    setFormTipo(ev.tipo_evento);
    setFormTitulo(ev.titulo);
    setFormFechaInicio(toIsoLocal(ev.fecha_inicio) || toIsoLocal(ev.fecha_evento));
    setFormFechaFin(toIsoLocal(ev.fecha_fin) || toIsoLocal(ev.fecha_inicio));
    setFormResponsableId(ev.responsable_id || '');
    setFormEstado((ev.estado as EstadoEventoProduccionLogistica) || 'por_hacer');
    setFormObservaciones(ev.observaciones || '');
    setFormVehiculo(ev.recurso_vehiculo || '');
    setFormGuideId(ev.guia_despacho_id || '');
    setFormOcId(ev.orden_compra_id || '');
    setFormMotivo('');
    setSelectedEvento(ev);
    setIsEditModalOpen(true);
    setReprogramaciones([]);
    setHistorialError('');
    void (async () => {
      const { data, error } = await supabase.from('evento_reprogramaciones')
        .select('id, fecha_inicio_anterior, fecha_inicio_nueva, motivo, created_at, actor_id')
        .eq('evento_id', ev.id)
        .order('created_at', { ascending: false });
      if (error) setHistorialError('No se pudo cargar el historial de reprogramaciones.');
      else setReprogramaciones(data || []);
    })();
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOpId || !formTitulo.trim() || !formFechaInicio) return;

    try {
      setSavingLoading(true);
      const startD = new Date(formFechaInicio);
      const endD = formFechaFin ? new Date(formFechaFin) : new Date(startD.getTime() + 3600000);
      if (endD <= startD) throw new Error('La hora de término debe ser posterior al inicio.');
      const conflicts = eventosEnConflicto({
        id: 'nuevo',
        oportunidad_id: formOpId,
        tipo_evento: formTipo,
        titulo: formTitulo,
        fecha_inicio: startD.toISOString(),
        fecha_fin: endD.toISOString(),
        responsable_id: formResponsableId || null,
        recurso_vehiculo: formVehiculo || null,
        estado: formEstado,
      }, allEventos);
      const unfinishedProduction = produccionesPendientesAntesDe({
        id: 'nuevo',
        oportunidad_id: formOpId,
        tipo_evento: formTipo,
        titulo: formTitulo,
        fecha_inicio: startD.toISOString(),
        fecha_fin: endD.toISOString(),
        estado: formEstado,
      }, allEventos).length > 0;

      if (conflicts.length || unfinishedProduction) {
        if (!formMotivo.trim()) {
          throw new Error('Indica el motivo del conflicto o dependencia para continuar.');
        }
        const ok = await confirm({
          title: 'Confirmar conflicto de programación',
          message: `${conflicts.length ? `Posible conflicto con ${conflicts.map((item) => item.titulo).join(', ')}. ` : ''}${unfinishedProduction ? 'La producción programada termina después de este evento. ' : ''}¿Confirmar programación?`,
          confirmLabel: 'Confirmar programación',
          destructive: false,
        });
        if (!ok) return;
      }

      const dateOnly = startD.toISOString().split('T')[0];
      const timeOnly = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('eventos_produccion_logistica')
        .insert([{
          contexto,
          oportunidad_id: formOpId,
          tipo_evento: formTipo,
          titulo: formTitulo.trim(),
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: dateOnly,
          hora_evento: timeOnly,
          responsable_id: formResponsableId || null,
          estado: formEstado,
          observaciones: formObservaciones.trim() || null,
          recurso_vehiculo: formVehiculo.trim() || null,
          guia_despacho_id: formGuideId || null,
          orden_compra_id: formOcId || null,
          conflicto_confirmado_motivo: conflicts.length || unfinishedProduction ? formMotivo.trim() : null,
          registrado_por: currentUser?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'eventos_produccion_logistica',
        entidad_id: data.id,
        descripcion: `Evento de ${formTipo} "${formTitulo}" creado en ${contexto}`,
        usuario_id: currentUser?.id,
        datos_nuevos: data,
      });

      toast({ message: `Evento "${formTitulo}" programado exitosamente.`, tone: 'success' });
      setIsNewModalOpen(false);
      void fetchEventos();
    } catch (err: unknown) {
      console.error('Error creating calendar event:', err);
      toast({ message: mensajeError(err, 'No se pudo guardar el evento. Revisa los campos.'), tone: 'danger' });
    } finally {
      setSavingLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvento || !formTitulo.trim() || !formFechaInicio) return;

    try {
      setSavingLoading(true);
      const startD = new Date(formFechaInicio);
      const endD = formFechaFin ? new Date(formFechaFin) : new Date(startD.getTime() + 3600000);
      if (endD <= startD) throw new Error('La hora de término debe ser posterior al inicio.');
      const reprogramado = startD.toISOString() !== selectedEvento.fecha_inicio ||
        endD.toISOString() !== selectedEvento.fecha_fin;
      if (reprogramado && !formMotivo.trim()) throw new Error('Indica el motivo de la reprogramación.');
      const conflicts = eventosEnConflicto({
        ...selectedEvento,
        fecha_inicio: startD.toISOString(),
        fecha_fin: endD.toISOString(),
        responsable_id: formResponsableId || null,
        recurso_vehiculo: formVehiculo || null,
      }, allEventos);
      const unfinishedProduction = produccionesPendientesAntesDe({
        ...selectedEvento,
        tipo_evento: formTipo,
        fecha_inicio: startD.toISOString(),
        fecha_fin: endD.toISOString(),
      }, allEventos).length > 0;
      const affected = allEventos.filter((item) => item.id !== selectedEvento.id &&
        (item.oportunidad_id === selectedEvento.oportunidad_id ||
         (formOcId && item.orden_compra_id === formOcId) ||
         (claveVehiculo(formVehiculo) && claveVehiculo(item.recurso_vehiculo) === claveVehiculo(formVehiculo))) &&
        new Date(item.fecha_inicio).getTime() >= Math.min(new Date(selectedEvento.fecha_inicio).getTime(), startD.getTime()) &&
        new Date(item.fecha_inicio).getTime() <= Math.max(new Date(selectedEvento.fecha_fin).getTime(), endD.getTime()) + 7 * 86400000);

      if ((conflicts.length || unfinishedProduction) && !formMotivo.trim()) {
        throw new Error('Indica el motivo del conflicto o dependencia.');
      }

      if (reprogramado || conflicts.length || unfinishedProduction) {
        const ok = await confirm({
          title: 'Confirmar reprogramación o conflicto',
          message: `Eventos que podrían verse afectados: ${affected.length ? affected.map((item) => item.titulo).join(', ') : 'ninguno adicional'}. Conflictos de recursos: ${conflicts.length ? conflicts.map((item) => item.titulo).join(', ') : 'ninguno'}. ${unfinishedProduction ? 'La producción termina después del despacho o instalación. ' : ''}¿Confirmar el cambio?`,
          confirmLabel: 'Confirmar cambio',
          destructive: false,
        });
        if (!ok) return;
      }

      const dateOnly = startD.toISOString().split('T')[0];
      const timeOnly = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;

      const { error } = await supabase
        .from('eventos_produccion_logistica')
        .update({
          tipo_evento: formTipo,
          titulo: formTitulo.trim(),
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: dateOnly,
          hora_evento: timeOnly,
          responsable_id: formResponsableId || null,
          estado: reprogramado ? 'reprogramado' : formEstado,
          observaciones: formObservaciones.trim() || null,
          recurso_vehiculo: formVehiculo.trim() || null,
          guia_despacho_id: formGuideId || null,
          orden_compra_id: formOcId || null,
          conflicto_confirmado_motivo: conflicts.length || unfinishedProduction ? formMotivo.trim() : null,
          motivo_reprogramacion: reprogramado ? formMotivo.trim() : selectedEvento.motivo_reprogramacion || null,
        })
        .eq('id', selectedEvento.id);

      if (error) throw error;

      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'eventos_produccion_logistica',
        entidad_id: selectedEvento.id,
        descripcion: `Evento "${formTitulo}" actualizado a estado "${formEstado}"`,
        usuario_id: currentUser?.id,
        datos_anteriores: selectedEvento,
        datos_nuevos: { titulo: formTitulo, estado: formEstado, fecha_inicio: startD },
      });

      toast({ message: `Evento "${formTitulo}" actualizado.`, tone: 'success' });
      setIsEditModalOpen(false);
      setSelectedEvento(null);
      void fetchEventos();
    } catch (err: unknown) {
      console.error('Error updating calendar event:', err);
      toast({ message: mensajeError(err, 'No se pudo actualizar el evento. Revisa los campos.'), tone: 'danger' });
    } finally {
      setSavingLoading(false);
    }
  };

  const handleDeleteEvento = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar evento del calendario',
      message: '¿Seguro que deseas eliminar este evento del calendario? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar evento',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('eventos_produccion_logistica').delete().eq('id', id);
      if (error) throw error;
      toast({ message: 'Evento eliminado del calendario.', tone: 'success' });
      setIsEditModalOpen(false);
      setSelectedEvento(null);
      void fetchEventos();
    } catch (err: unknown) {
      console.error('Error deleting event:', err);
      toast({ message: 'No se pudo eliminar el evento.', tone: 'danger' });
    }
  };

  // Month navigation helpers
  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };
  const goToToday = () => setCurrentDate(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Filtered events
  const filteredEventos = eventos.filter((ev) => {
    if (selectedResponsables.length > 0 && (!ev.responsable_id || !selectedResponsables.includes(ev.responsable_id))) {
      return false;
    }
    if (selectedEstado !== 'todos' && ev.estado !== selectedEstado) return false;
    if (selectedTipo !== 'todos' && ev.tipo_evento !== selectedTipo) return false;
    return true;
  });

  const dayOf = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const todayKey = dayOf(new Date().toISOString());

  const upcomingEventos = filteredEventos
    .filter((event) => dayOf(event.fecha_fin || event.fecha_inicio) >= todayKey)
    .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
    .slice(0, 6);

  const alertEventos = filteredEventos.filter((event) =>
    event.estado === 'reprogramado' || eventosEnConflicto(event, allEventos).length > 0
  ).slice(0, 6);

  const conflictosFormulario = eventosEnConflicto({
    id: selectedEvento?.id || 'nuevo',
    oportunidad_id: formOpId,
    tipo_evento: formTipo,
    titulo: formTitulo,
    fecha_inicio: formFechaInicio,
    fecha_fin: formFechaFin,
    responsable_id: formResponsableId || null,
    recurso_vehiculo: formVehiculo || null,
    estado: formEstado,
  }, allEventos);

  const produccionPosteriorFormulario = produccionesPendientesAntesDe({
    id: selectedEvento?.id || 'nuevo',
    oportunidad_id: formOpId,
    tipo_evento: formTipo,
    titulo: formTitulo,
    fecha_inicio: formFechaInicio,
    fecha_fin: formFechaFin,
    estado: formEstado,
  }, allEventos).length > 0;

  const linkedOcOptions = Array.from(new Map(ocOptions.filter((item) => item.oportunidad_id === formOpId)
    .map((item) => [item.orden_compra_id, item])).values());

  const linkFields = (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="block text-xs font-semibold text-ink mb-1">Orden de compra vinculada</label>
        <select value={formOcId} onChange={(e) => setFormOcId(e.target.value)} className="hg-field">
          <option value="">Sin OC</option>
          {linkedOcOptions.map((item) => (
            <option key={item.orden_compra_id} value={item.orden_compra_id}>
              {item.ordenes_compra?.numero_oc || item.orden_compra_id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-ink mb-1">Guía vinculada</label>
        <select value={formGuideId} onChange={(e) => setFormGuideId(e.target.value)} className="hg-field">
          <option value="">Sin guía</option>
          {guideOptions.filter((item) => item.oportunidad_id === formOpId).map((item) => (
            <option key={item.id} value={item.id}>
              {item.numero_guia}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 text-ink">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="t-page flex items-center gap-2">
            <span>{titulo}</span>
          </h1>
          {subtitulo && <p className="t-caption mt-1">{subtitulo}</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => handleOpenNewModal()}
          >
            Programar evento
          </Button>
        </div>
      </div>

      {/* Control Bar: Mes + Filtros */}
      <div className="hg-panel flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
        {/* Navegación de Mes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-control border border-line bg-surface p-1">
            <IconButton
              icon={ChevronLeft}
              label="Mes anterior"
              onClick={prevMonth}
              className="h-7 w-7"
            />
            <span className="min-w-36 text-center font-semibold text-ink text-xs capitalize">
              {monthNames[month]} {year}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Mes siguiente"
              onClick={nextMonth}
              className="h-7 w-7"
            />
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={goToToday}
          >
            Hoy
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tipo de evento */}
          <div className="flex items-center gap-1.5">
            <span className="text-ink-muted text-xs font-medium">Tipo:</span>
            <select
              value={selectedTipo}
              aria-label="Filtrar por tipo de evento"
              onChange={(e) => setSelectedTipo(e.target.value)}
              className="hg-field !w-auto min-w-32 text-xs"
            >
              <option value="todos">Todos los tipos</option>
              {tiposPermitidos.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_EVENTO_CONFIG[t]?.label || t}
                </option>
              ))}
            </select>
          </div>

          {/* Responsable (Multi-Selección Desplegable) */}
          <div className="relative">
            <div className="flex items-center gap-1.5">
              <span className="text-ink-muted text-xs font-medium">Responsable:</span>
              <button
                type="button"
                onClick={() => setShowResponsableMenu(!showResponsableMenu)}
                className="hg-field !w-auto flex items-center justify-between gap-2 min-w-[170px] text-xs font-semibold cursor-pointer"
              >
                <span className="truncate">
                  {selectedResponsables.length === 0
                    ? 'Todos los responsables'
                    : selectedResponsables.length === 1
                    ? personalList.find((p) => p.id === selectedResponsables[0])?.nombre || '1 seleccionado'
                    : `${selectedResponsables.length} seleccionados`}
                </span>
                <ChevronDown size={14} className="text-ink-muted shrink-0" />
              </button>
            </div>

            {showResponsableMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-surface border border-line rounded-panel shadow-[var(--hg-shadow-popover)] p-3 z-30 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-line-subtle pb-1.5">
                  <span className="font-semibold text-ink text-[11px] uppercase tracking-normal">
                    Filtrar responsables
                  </span>
                  {selectedResponsables.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedResponsables([])}
                      className="text-[11px] text-accent-ink font-semibold hover:underline"
                    >
                      Limpiar
                    </button>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded-md cursor-pointer font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={selectedResponsables.length === 0}
                      onChange={() => setSelectedResponsables([])}
                      className="accent-accent rounded"
                    />
                    <span>Todos los responsables</span>
                  </label>

                  {personalList.map((p) => {
                    const isChecked = selectedResponsables.includes(p.id);
                    const count = eventos.filter((ev) => ev.responsable_id === p.id).length;
                    return (
                      <label
                        key={p.id}
                        className="flex items-center justify-between p-1.5 hover:bg-surface-muted rounded-md cursor-pointer font-medium text-ink"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedResponsables(selectedResponsables.filter((id) => id !== p.id));
                              } else {
                                setSelectedResponsables([...selectedResponsables, p.id]);
                              }
                            }}
                            className="accent-accent rounded"
                          />
                          <span className="truncate">{p.nombre}</span>
                        </div>
                        <span className="text-[11px] bg-surface-muted px-1.5 py-0.5 rounded-full font-mono text-ink-muted font-semibold shrink-0">
                          {count}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Estado */}
          <div className="flex items-center gap-1.5">
            <span className="text-ink-muted text-xs font-medium">Estado:</span>
            <select
              value={selectedEstado}
              aria-label="Filtrar por estado del evento"
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="hg-field !w-auto min-w-32 text-xs"
            >
              <option value="todos">Todos los estados</option>
              {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                <option key={key} value={key}>
                  {conf.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calendario y agenda contextual */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="hg-panel overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Cabecera de días de la semana */}
            <div className="grid grid-cols-7 border-b border-line-subtle bg-surface-muted text-center text-xs font-semibold text-ink-muted">
              {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
                <div key={d} className="py-2.5 border-r last:border-r-0 border-line-subtle">
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas de días */}
            <div className="grid grid-cols-7 auto-rows-fr min-h-[580px]">
              {/* Celdas vacías previas */}
              {Array.from({ length: firstDayIndex }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="bg-surface-muted/50 border-r border-b border-line-subtle min-h-[110px]"
                />
              ))}

              {/* Días del mes actual */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const currentDayDate = new Date(year, month, dayNum);
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isToday = dayOf(currentDayDate.toISOString()) === todayKey;

                // Eventos que caen en este día
                const dayEvents = filteredEventos.filter((ev) => {
                  return dayOf(ev.fecha_inicio) <= dateStr && dayOf(ev.fecha_fin || ev.fecha_inicio) >= dateStr;
                });

                return (
                  <div
                    key={`day-${dayNum}`}
                    className={`border-r border-b border-line-subtle p-2 min-h-[110px] flex flex-col justify-between group transition hover:bg-surface-muted/60 relative ${
                      isToday ? 'bg-accent-soft/30' : 'bg-surface'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                            isToday ? 'bg-accent text-on-accent' : 'text-ink'
                          }`}
                        >
                          {dayNum}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOpenNewModal(dateStr)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-ink-muted hover:text-accent-ink transition rounded-md cursor-pointer"
                          title="Agregar evento este día"
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      {/* Listado de eventos en el día */}
                      <div className="space-y-1.5">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const tipoConf = TIPOS_EVENTO_CONFIG[ev.tipo_evento] || TIPOS_EVENTO_CONFIG.obra;
                          const TipoIcon = tipoConf.icon;
                          const estadoConf = ESTADOS_EVENTO_CONFIG[ev.estado] || ESTADOS_EVENTO_CONFIG.por_hacer;

                          const startTime = ev.fecha_inicio
                            ? new Date(ev.fecha_inicio).toLocaleTimeString('es-CL', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ev.hora_evento || '09:00';

                          const isHighlighted = highlightedOpId && ev.oportunidad_id === highlightedOpId;

                          return (
                            <button
                              type="button"
                              key={ev.id}
                              onClick={() => handleOpenEditModal(ev)}
                              className={`block w-full text-left p-2 rounded-md border text-[11px] leading-tight cursor-pointer transition space-y-1 bg-surface-muted border-line hover:border-accent ${
                                isHighlighted ? 'ring-2 ring-accent' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-semibold text-[11px] px-1.5 py-0.5 rounded-md text-ink bg-surface border border-line truncate max-w-[120px]">
                                  {ev.responsable?.nombre || 'Sin responsable'}
                                </span>
                                <span className="font-mono text-[11px] text-ink-muted font-medium flex items-center gap-0.5 shrink-0">
                                  <Clock size={11} className="text-ink-muted" />
                                  {startTime}
                                </span>
                              </div>

                              <div className="font-semibold text-ink truncate leading-tight flex items-center gap-1">
                                <TipoIcon size={13} className="shrink-0 text-accent-ink" />
                                <span className="truncate">{ev.titulo}</span>
                              </div>

                              {ev.oportunidad && (
                                <div className="text-[11px] text-ink-muted truncate flex items-center gap-1">
                                  <Building size={11} className="text-ink-muted shrink-0" />
                                  <span className="truncate">
                                    {ev.oportunidad.cliente?.nombre || ev.oportunidad.codigo}
                                  </span>
                                </div>
                              )}

                              <div className="mt-1 flex items-center justify-between">
                                <StatusBadge tone={estadoConf.tone}>
                                  {estadoConf.label}
                                </StatusBadge>
                              </div>
                            </button>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="block text-[11px] text-ink-muted">+{dayEvents.length - 3} eventos</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="hg-panel p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Próxima agenda</h2>
            {upcomingEventos.length === 0 ? (
              <p className="text-xs text-ink-muted">Sin eventos próximos.</p>
            ) : (
              <div className="space-y-1.5">
                {upcomingEventos.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handleOpenEditModal(event)}
                    className="block w-full rounded-md p-2 text-left hover:bg-surface-muted transition"
                  >
                    <span className="block truncate text-xs font-semibold text-ink">{event.titulo}</span>
                    <span className="text-[11px] text-ink-muted">
                      {new Date(event.fecha_inicio).toLocaleDateString('es-CL')} · {event.responsable?.nombre || 'Sin responsable'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="hg-panel p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Alertas</h2>
              {alertEventos.length > 0 && (
                <StatusBadge tone="warning">{alertEventos.length}</StatusBadge>
              )}
            </div>
            {alertEventos.length === 0 ? (
              <p className="text-xs text-ink-muted">Sin conflictos ni reprogramaciones visibles.</p>
            ) : (
              <div className="space-y-1.5">
                {alertEventos.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => handleOpenEditModal(event)}
                    className="block w-full rounded-md border border-warning-line bg-warning-soft p-2 text-left hover:bg-warning-soft/80 transition"
                  >
                    <span className="block truncate text-xs font-semibold text-ink">{event.titulo}</span>
                    <span className="text-[11px] text-warning font-medium">
                      {event.estado === 'reprogramado' ? 'Reprogramado' : 'Choque de recurso'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Modal Nuevo Evento */}
      <Dialog
        open={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title={`Programar Nuevo Evento (${titulo})`}
        description="Asigna la oportunidad, horario y recursos de este evento operativo."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsNewModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={savingLoading} onClick={handleSaveNew}>
              <Save size={15} />
              <span>{savingLoading ? 'Guardando...' : 'Crear Evento'}</span>
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveNew} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-ink mb-1">Oportunidad de Venta *</label>
            <select
              required
              value={formOpId}
              onChange={(e) => setFormOpId(e.target.value)}
              className="hg-field font-semibold"
            >
              <option value="">-- Seleccionar Oportunidad --</option>
              {oportunidades.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.codigo} — {op.titulo} ({op.cliente?.nombre || 'Cliente'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Calendario</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CALENDARIOS_OPERACIONALES.map((cal) => {
                const isCurrent = cal.id === contexto;
                return (
                  <div
                    key={cal.id}
                    className={`px-3 py-2 rounded-md border font-semibold text-xs text-center ${
                      isCurrent
                        ? 'bg-accent-soft text-accent-ink border-accent-line'
                        : 'bg-surface-muted text-ink-muted border-line'
                    }`}
                  >
                    {cal.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-ink mb-1">Tipo de evento *</label>
              <select
                required
                value={formTipo}
                onChange={(e) => setFormTipo(e.target.value as TipoEventoProduccionLogistica)}
                className="hg-field"
              >
                {tiposPermitidos.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_EVENTO_CONFIG[t]?.label || t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Estado Inicial *</label>
              <select
                required
                value={formEstado}
                onChange={(e) => setFormEstado(e.target.value as EstadoEventoProduccionLogistica)}
                className="hg-field"
              >
                {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                  <option key={key} value={key}>
                    {conf.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Título del Evento *</label>
            <input
              type="text"
              required
              placeholder="Ej: Montaje e Instalación Cierros"
              value={formTitulo}
              onChange={(e) => setFormTitulo(e.target.value)}
              className="hg-field"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-ink mb-1">Fecha y Hora Inicio *</label>
              <input
                type="datetime-local"
                required
                value={formFechaInicio}
                onChange={(e) => setFormFechaInicio(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Fecha y Hora Término *</label>
              <input
                type="datetime-local"
                required
                value={formFechaFin}
                onChange={(e) => setFormFechaFin(e.target.value)}
                className="hg-field"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Responsable Asignado</label>
            <select
              value={formResponsableId}
              onChange={(e) => setFormResponsableId(e.target.value)}
              className="hg-field"
            >
              <option value="">-- Sin Asignar --</option>
              {personalList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({ROL_NOMBRE[p.rol] ?? p.rol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Notas e Instrucciones</label>
            <textarea
              rows={2}
              placeholder="Detalles operacionales, contacto en terreno o materiales..."
              value={formObservaciones}
              onChange={(e) => setFormObservaciones(e.target.value)}
              className="hg-field"
            />
          </div>

          <div>
            <label className="block font-semibold text-ink mb-1">Vehículo o recurso</label>
            <input
              value={formVehiculo}
              onChange={(e) => setFormVehiculo(e.target.value)}
              placeholder="Ej. Camión 1"
              className="hg-field"
            />
          </div>

          {linkFields}

          {(conflictosFormulario.length > 0 || produccionPosteriorFormulario) && (
            <div>
              <label className="block font-semibold text-ink mb-1">
                Motivo para confirmar conflicto o dependencia *
              </label>
              <input
                value={formMotivo}
                onChange={(e) => setFormMotivo(e.target.value)}
                className="hg-field"
              />
            </div>
          )}

          {conflictosFormulario.length > 0 && (
            <p className="t-caption text-warning bg-warning-soft border border-warning-line rounded-md p-2">
              Posible choque de responsable o vehículo con: {conflictosFormulario.map((ev) => ev.titulo).join(', ')}.
            </p>
          )}

          {produccionPosteriorFormulario && (
            <p className="t-caption text-warning bg-warning-soft border border-warning-line rounded-md p-2">
              La producción pendiente de esta venta termina después del despacho o instalación. Para continuar, indica un motivo y confirma la dependencia.
            </p>
          )}
        </form>
      </Dialog>

      {/* Modal Editar / Eliminar Evento */}
      {selectedEvento && (
        <Dialog
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Editar Evento"
          description="Actualiza el estado, fecha o recursos del evento operativo."
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="destructive"
                onClick={() => handleDeleteEvento(selectedEvento.id)}
              >
                <Trash2 size={15} />
                <span>Eliminar Evento</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" disabled={savingLoading} onClick={handleSaveEdit}>
                  <Save size={15} />
                  <span>{savingLoading ? 'Guardando...' : 'Guardar Cambios'}</span>
                </Button>
              </div>
            </div>
          }
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">Tipo de Evento</label>
                <select
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value as TipoEventoProduccionLogistica)}
                  className="hg-field"
                >
                  {tiposPermitidos.map((t) => (
                    <option key={t} value={t}>
                      {TIPOS_EVENTO_CONFIG[t]?.label || t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Estado del Evento</label>
                <select
                  value={formEstado}
                  onChange={(e) => setFormEstado(e.target.value as EstadoEventoProduccionLogistica)}
                  className="hg-field"
                >
                  {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                    <option key={key} value={key}>
                      {conf.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Título del Evento *</label>
              <input
                type="text"
                required
                value={formTitulo}
                onChange={(e) => setFormTitulo(e.target.value)}
                className="hg-field"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-ink mb-1">Fecha y Hora Inicio *</label>
                <input
                  type="datetime-local"
                  required
                  value={formFechaInicio}
                  onChange={(e) => setFormFechaInicio(e.target.value)}
                  className="hg-field"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Fecha y Hora Término *</label>
                <input
                  type="datetime-local"
                  required
                  value={formFechaFin}
                  onChange={(e) => setFormFechaFin(e.target.value)}
                  className="hg-field"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Responsable Asignado</label>
              <select
                value={formResponsableId}
                onChange={(e) => setFormResponsableId(e.target.value)}
                className="hg-field"
              >
                <option value="">-- Sin Asignar --</option>
                {personalList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({ROL_NOMBRE[p.rol] ?? p.rol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Notas e Instrucciones</label>
              <textarea
                rows={2}
                value={formObservaciones}
                onChange={(e) => setFormObservaciones(e.target.value)}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Vehículo o recurso</label>
              <input
                value={formVehiculo}
                onChange={(e) => setFormVehiculo(e.target.value)}
                placeholder="Ej. Camión 1"
                className="hg-field"
              />
            </div>

            {linkFields}

            <div>
              <label className="block font-semibold text-ink mb-1">
                Motivo de reprogramación si cambias la fecha u hora
              </label>
              <input
                value={formMotivo}
                onChange={(e) => setFormMotivo(e.target.value)}
                className="hg-field"
              />
            </div>

            {conflictosFormulario.length > 0 && (
              <p className="t-caption text-warning bg-warning-soft border border-warning-line rounded-md p-2">
                Posible choque de responsable o vehículo con: {conflictosFormulario.map((ev) => ev.titulo).join(', ')}.
              </p>
            )}

            {produccionPosteriorFormulario && (
              <p className="t-caption text-warning bg-warning-soft border border-warning-line rounded-md p-2">
                La producción pendiente de esta venta termina después del despacho o instalación. Para continuar, indica un motivo y confirma la dependencia.
              </p>
            )}

            <section aria-label="Historial de reprogramaciones" className="rounded-md border border-line p-3 text-xs">
              <h4 className="font-semibold text-ink">Historial de reprogramaciones</h4>
              {historialError && <p role="alert" className="mt-2 text-danger">{historialError}</p>}
              {!historialError && reprogramaciones.length === 0 && (
                <p className="mt-2 text-ink-muted">Sin reprogramaciones registradas.</p>
              )}
              {reprogramaciones.map((cambio) => (
                <p key={cambio.id} className="mt-2 border-t border-line-subtle pt-2 text-ink-muted">
                  {new Date(cambio.fecha_inicio_anterior).toLocaleString('es-CL')} → {new Date(cambio.fecha_inicio_nueva).toLocaleString('es-CL')}: {cambio.motivo}
                </p>
              ))}
            </section>
          </form>
        </Dialog>
      )}
    </div>
  );
}
