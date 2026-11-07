'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Save, Trash2 } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import { mensajeError } from '../../lib/errores';
import { claveVehiculo, eventosEnConflicto, produccionesPendientesAntesDe } from '../../lib/calendario-conflictos';
import {
  ESTADOS_EVENTO_CONFIG,
  ESTADO_LABELS,
  TIPOS_EVENTO_CONFIG,
  type OrdenItemRow,
  type OrdenRow,
  type VisitaRow,
} from '../../lib/calendario-tipos';
import {
  ROL_NOMBRE,
  type EstadoEventoProduccionLogistica,
  type EventoProduccionLogistica,
  type TipoEventoProduccionLogistica,
  type Usuario,
} from '../../lib/types';
import { Button, CodeStamp, Dialog, StatusBadge } from '../ui/crm';
import { useConfirm, useToast } from '../ui/feedback';
import { DateInput, DateTimeInput, Select } from '../ui/FormControls';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function useUsuarios(campo: 'calendario_visitas' | 'calendario_produccion' | 'calendario_reventa') {
  const supabase = useMemo(() => createClient(), []);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true });
      if (ignore || !data) return;
      const todos = data as Usuario[];
      const filtrados = todos.filter((u) => u[campo] !== false);
      setUsuarios(filtrados.length ? filtrados : todos);
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [supabase, campo]);
  return usuarios;
}

/* ───────────────────────── Evento de producción o reventa ───────────────────────── */

export function EventoLogisticoDialog({
  evento,
  eventos,
  onClose,
  onChanged,
}: {
  evento: EventoProduccionLogistica;
  eventos: EventoProduccionLogistica[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const reventa = evento.contexto === 'reventa_logistica';
  const personal = useUsuarios(reventa ? 'calendario_reventa' : 'calendario_produccion');

  const tipos = (reventa
    ? ['reventa', 'logistica', 'retiro_proveedor', 'despacho_cliente', 'postventa', 'logistica_interna']
    : ['obra', 'produccion', 'logistica', 'despacho_cliente', 'instalacion', 'postventa', 'logistica_interna']) as TipoEventoProduccionLogistica[];
  const tiposConActual = tipos.includes(evento.tipo_evento) ? tipos : [evento.tipo_evento, ...tipos];

  const [tipo, setTipo] = useState<TipoEventoProduccionLogistica>(evento.tipo_evento);
  const [titulo, setTitulo] = useState(evento.titulo);
  const [inicio, setInicio] = useState(toLocalInput(evento.fecha_inicio) || toLocalInput(evento.fecha_evento));
  const [fin, setFin] = useState(toLocalInput(evento.fecha_fin) || toLocalInput(evento.fecha_inicio));
  const [responsableId, setResponsableId] = useState(evento.responsable_id || '');
  const [estado, setEstado] = useState<EstadoEventoProduccionLogistica>((evento.estado as EstadoEventoProduccionLogistica) || 'por_hacer');
  const [notas, setNotas] = useState(evento.observaciones || '');
  const [vehiculo, setVehiculo] = useState(evento.recurso_vehiculo || '');
  const [ocId, setOcId] = useState(evento.orden_compra_id || '');
  const [guiaId, setGuiaId] = useState(evento.guia_despacho_id || '');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [guias, setGuias] = useState<{ id: string; oportunidad_id: string; numero_guia: string }[]>([]);
  const [ocs, setOcs] = useState<{ orden_compra_id: string; oportunidad_id: string; ordenes_compra: { numero_oc: string } | null }[]>([]);
  const [historial, setHistorial] = useState<{ id: string; fecha_inicio_anterior: string; fecha_inicio_nueva: string; motivo: string }[]>([]);
  const [historialError, setHistorialError] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(async () => {
      const [g, o, h] = await Promise.all([
        supabase.from('guias_despacho').select('id, oportunidad_id, numero_guia').neq('estado', 'cancelada'),
        supabase.from('orden_compra_asignaciones').select('orden_compra_id, oportunidad_id, ordenes_compra(numero_oc)'),
        supabase
          .from('evento_reprogramaciones')
          .select('id, fecha_inicio_anterior, fecha_inicio_nueva, motivo')
          .eq('evento_id', evento.id)
          .order('created_at', { ascending: false }),
      ]);
      if (ignore) return;
      if (g.data) setGuias(g.data);
      if (o.data) setOcs(o.data as unknown as typeof ocs);
      if (h.error) setHistorialError('No se pudo cargar el historial de reprogramaciones.');
      else setHistorial(h.data || []);
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [supabase, evento.id]);

  const borrador = {
    ...evento,
    tipo_evento: tipo,
    titulo,
    fecha_inicio: inicio,
    fecha_fin: fin,
    responsable_id: responsableId || null,
    recurso_vehiculo: vehiculo || null,
    estado,
  };
  const conflictos = inicio ? eventosEnConflicto(borrador, eventos) : [];
  const produccionPendiente = inicio ? produccionesPendientesAntesDe(borrador, eventos).length > 0 : false;
  const ocsDeLaVenta = Array.from(new Map(ocs.filter((o) => o.oportunidad_id === evento.oportunidad_id).map((o) => [o.orden_compra_id, o])).values());
  const guiasDeLaVenta = guias.filter((g) => g.oportunidad_id === evento.oportunidad_id);

  const guardar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!titulo.trim() || !inicio) return;
    try {
      setSaving(true);
      const startD = new Date(inicio);
      const endD = fin ? new Date(fin) : new Date(startD.getTime() + 3600000);
      if (endD <= startD) throw new Error('La hora de término debe ser posterior al inicio.');
      const reprogramado =
        startD.toISOString() !== new Date(evento.fecha_inicio).toISOString() ||
        endD.toISOString() !== new Date(evento.fecha_fin).toISOString();
      if (reprogramado && !motivo.trim()) throw new Error('Indica el motivo de la reprogramación.');
      if ((conflictos.length || produccionPendiente) && !motivo.trim()) {
        throw new Error('Indica el motivo del conflicto o dependencia.');
      }
      const afectados = eventos.filter(
        (item) =>
          item.id !== evento.id &&
          (item.oportunidad_id === evento.oportunidad_id ||
            (ocId && item.orden_compra_id === ocId) ||
            (claveVehiculo(vehiculo) && claveVehiculo(item.recurso_vehiculo) === claveVehiculo(vehiculo))) &&
          new Date(item.fecha_inicio).getTime() >= Math.min(new Date(evento.fecha_inicio).getTime(), startD.getTime()) &&
          new Date(item.fecha_inicio).getTime() <= Math.max(new Date(evento.fecha_fin).getTime(), endD.getTime()) + 7 * 86400000,
      );
      if (reprogramado || conflictos.length || produccionPendiente) {
        const ok = await confirm({
          title: 'Confirmar reprogramación o conflicto',
          message: `Eventos que podrían verse afectados: ${afectados.length ? afectados.map((i) => i.titulo).join(', ') : 'ninguno adicional'}. Conflictos de recursos: ${conflictos.length ? conflictos.map((i) => i.titulo).join(', ') : 'ninguno'}. ${produccionPendiente ? 'La producción termina después del despacho o instalación. ' : ''}¿Confirmar el cambio?`,
          confirmLabel: 'Confirmar cambio',
          destructive: false,
        });
        if (!ok) return;
      }
      const { error } = await supabase
        .from('eventos_produccion_logistica')
        .update({
          tipo_evento: tipo,
          titulo: titulo.trim(),
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: startD.toISOString().split('T')[0],
          hora_evento: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
          responsable_id: responsableId || null,
          estado: reprogramado ? 'reprogramado' : estado,
          observaciones: notas.trim() || null,
          recurso_vehiculo: vehiculo.trim() || null,
          guia_despacho_id: guiaId || null,
          orden_compra_id: ocId || null,
          conflicto_confirmado_motivo: conflictos.length || produccionPendiente ? motivo.trim() : null,
          motivo_reprogramacion: reprogramado ? motivo.trim() : evento.motivo_reprogramacion || null,
        })
        .eq('id', evento.id);
      if (error) throw error;
      await logSistema({
        tipo_accion: 'actualizacion',
        entidad: 'eventos_produccion_logistica',
        entidad_id: evento.id,
        descripcion: `Evento "${titulo}" actualizado a estado "${estado}"`,
        usuario_id: currentUser?.id,
        datos_anteriores: evento,
        datos_nuevos: { titulo, estado, fecha_inicio: startD },
      });
      toast({ message: `Evento "${titulo}" actualizado.`, tone: 'success' });
      onChanged();
      onClose();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo actualizar el evento. Revisa los campos.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async () => {
    const ok = await confirm({
      title: 'Eliminar evento del calendario',
      message: '¿Seguro que deseas eliminar este evento del calendario? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar evento',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('eventos_produccion_logistica').delete().eq('id', evento.id);
    if (error) {
      toast({ message: 'No se pudo eliminar el evento.', tone: 'danger' });
      return;
    }
    toast({ message: 'Evento eliminado del calendario.', tone: 'success' });
    onChanged();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Editar evento"
      description={reventa ? 'Calendario de reventa' : 'Calendario de producción'}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="destructive" icon={Trash2} onClick={() => void eliminar()}>
            Eliminar
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" icon={Save} disabled={saving} onClick={() => void guardar()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={guardar} className="space-y-3.5 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Tipo de evento</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEventoProduccionLogistica)} className="hg-field">
              {tiposConActual.map((t) => (
                <option key={t} value={t}>
                  {TIPOS_EVENTO_CONFIG[t]?.label || t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Estado</label>
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoEventoProduccionLogistica)} className="hg-field">
              {Object.entries(ESTADOS_EVENTO_CONFIG).map(([key, conf]) => (
                <option key={key} value={key}>
                  {conf.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Título *</label>
          <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className="hg-field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Inicio *</label>
            <DateTimeInput required value={inicio} onChange={(e) => setInicio(e.target.value)} className="hg-field" />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Término *</label>
            <DateTimeInput required value={fin} onChange={(e) => setFin(e.target.value)} className="hg-field" />
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Responsable</label>
          <Select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="hg-field">
            <option value="">Sin asignar</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} ({ROL_NOMBRE[p.rol] ?? p.rol})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Notas</label>
          <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="hg-field" />
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Vehículo o recurso</label>
          <input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} placeholder="Ej. Camión 1" className="hg-field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Orden de compra</label>
            <Select value={ocId} onChange={(e) => setOcId(e.target.value)} className="hg-field">
              <option value="">Sin OC</option>
              {ocsDeLaVenta.map((item) => (
                <option key={item.orden_compra_id} value={item.orden_compra_id}>
                  {item.ordenes_compra?.numero_oc || item.orden_compra_id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Guía de despacho</label>
            <Select value={guiaId} onChange={(e) => setGuiaId(e.target.value)} className="hg-field">
              <option value="">Sin guía</option>
              {guiasDeLaVenta.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.numero_guia}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Motivo (si cambias la fecha o hay conflicto)</label>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="hg-field" />
        </div>
        {conflictos.length > 0 && (
          <p className="t-caption rounded-md border border-warning-line bg-warning-soft p-2 text-warning">
            Posible choque de responsable o vehículo con: {conflictos.map((ev) => ev.titulo).join(', ')}.
          </p>
        )}
        {produccionPendiente && (
          <p className="t-caption rounded-md border border-warning-line bg-warning-soft p-2 text-warning">
            La producción pendiente de esta venta termina después del despacho o instalación. Indica un motivo para continuar.
          </p>
        )}
        <section aria-label="Historial de reprogramaciones" className="rounded-md border border-line p-3">
          <h4 className="font-semibold text-ink">Historial de reprogramaciones</h4>
          {historialError && (
            <p role="alert" className="mt-2 text-danger">
              {historialError}
            </p>
          )}
          {!historialError && historial.length === 0 && <p className="mt-2 text-ink-muted">Sin reprogramaciones registradas.</p>}
          {historial.map((cambio) => (
            <p key={cambio.id} className="mt-2 border-t border-line-subtle pt-2 text-ink-muted">
              {new Date(cambio.fecha_inicio_anterior).toLocaleString('es-CL')} → {new Date(cambio.fecha_inicio_nueva).toLocaleString('es-CL')}: {cambio.motivo}
            </p>
          ))}
        </section>
      </form>
    </Dialog>
  );
}

/* ───────────────────────── Visita a terreno ───────────────────────── */

export function VisitaDialog({
  visita,
  onClose,
  onChanged,
}: {
  visita: VisitaRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const personal = useUsuarios('calendario_visitas');
  const [tecnicoId, setTecnicoId] = useState(visita.tecnico_id || '');
  const [estado, setEstado] = useState(visita.estado_visita || 'programada');
  const [fecha, setFecha] = useState(visita.fecha_visita_terreno?.slice(0, 10) || '');
  const [hora, setHora] = useState(visita.hora_visita_terreno?.slice(0, 5) || '09:00');
  const [notas, setNotas] = useState(visita.observaciones_visita || '');
  const [saving, setSaving] = useState(false);
  const op = visita.oportunidad;

  const guardar = async () => {
    if (!fecha) return;
    setSaving(true);
    const tecnico = personal.find((p) => p.id === tecnicoId);
    const { error } = await supabase
      .from('visitas_terreno')
      .update({
        tecnico_id: tecnicoId || null,
        tecnico_visita: tecnico?.nombre || '',
        estado_visita: estado,
        fecha_visita_terreno: fecha,
        hora_visita_terreno: hora,
        observaciones_visita: notas.trim() || null,
      })
      .eq('id', visita.id);
    setSaving(false);
    if (error) {
      toast({ message: mensajeError(error, 'No se pudo actualizar la visita.'), tone: 'danger' });
      return;
    }
    toast({ message: 'Visita actualizada.', tone: 'success' });
    onChanged();
    onClose();
  };

  const eliminar = async () => {
    const ok = await confirm({
      title: 'Eliminar visita a terreno',
      message: `¿Seguro que deseas eliminar la visita de ${op?.codigo || 'esta venta'}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar visita',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('visitas_terreno').delete().eq('id', visita.id);
    if (error) {
      toast({ message: 'No se pudo eliminar la visita.', tone: 'danger' });
      return;
    }
    toast({ message: 'Visita eliminada.', tone: 'success' });
    onChanged();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Visita a terreno"
      description={op ? `${op.codigo} — ${op.titulo}` : undefined}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {op && (
              <Link href={`/ventas?oportunidad=${op.id}`}>
                <Button variant="secondary" icon={ExternalLink}>
                  Abrir venta
                </Button>
              </Link>
            )}
            <Button variant="destructive" icon={Trash2} onClick={() => void eliminar()}>
              Eliminar
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" icon={Save} disabled={saving || !fecha} onClick={() => void guardar()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3.5 text-xs">
        {op?.cliente && (
          <div className="rounded-lg border border-line-subtle bg-surface-muted p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{op.cliente.nombre || 'Cliente'}</span>
              {op.codigo && <CodeStamp>{op.codigo}</CodeStamp>}
            </div>
            {(op.cliente.direccion || op.cliente.comuna) && (
              <p className="mt-1 text-ink-muted">
                {op.cliente.direccion}
                {op.cliente.comuna ? `, ${op.cliente.comuna}` : ''}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Técnico</label>
            <Select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className="hg-field">
              <option value="">Sin asignar</option>
              {personal.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Estado</label>
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="hg-field">
              <option value="programada">Programada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Fecha *</label>
            <DateInput required value={fecha} onChange={(e) => setFecha(e.target.value)} className="hg-field" />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Hora</label>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="hg-field t-num" />
          </div>
        </div>
        <div>
          <label className="mb-1 block font-semibold text-ink">Notas</label>
          <textarea
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Instrucciones para el técnico en terreno…"
            className="hg-field"
          />
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────── Orden de producción ───────────────────────── */

export function OrdenDialog({
  orden,
  progreso,
  onClose,
  onChanged,
}: {
  orden: OrdenRow;
  progreso: (OrdenItemRow & { hecho: number })[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [inicio, setInicio] = useState(orden.fecha_inicio || '');
  const [objetivo, setObjetivo] = useState(orden.fecha_objetivo || '');
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (inicio && objetivo && objetivo < inicio) {
      toast({ message: 'La fecha objetivo no puede ser anterior al inicio.', tone: 'danger' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('ordenes_produccion')
      .update({ fecha_inicio: inicio || null, fecha_objetivo: objetivo || null })
      .eq('id', orden.id);
    setSaving(false);
    if (error) {
      toast({ message: mensajeError(error, 'No se pudo guardar la orden.'), tone: 'danger' });
      return;
    }
    toast({ message: 'Fechas de la orden actualizadas.', tone: 'success' });
    onChanged();
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={orden.oportunidad ? `${orden.oportunidad.codigo} — ${orden.oportunidad.titulo}` : 'Orden de producción'}
      description="Orden de producción"
      size="md"
      footer={
        <>
          <Link href={`/ventas?oportunidad=${orden.oportunidad_id}`} className="mr-auto">
            <Button variant="secondary" icon={ExternalLink}>
              Abrir venta
            </Button>
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void guardar()}>
            {saving ? 'Guardando…' : 'Guardar fechas'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="neutral">{ESTADO_LABELS[orden.estado] || orden.estado}</StatusBadge>
          <span className="text-ink-muted">Responsable: {orden.responsable?.nombre || 'Sin asignar'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block font-semibold text-ink">Inicio</label>
            <DateInput value={inicio} onChange={(e) => setInicio(e.target.value)} className="hg-field" />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-ink">Fecha objetivo de término</label>
            <DateInput value={objetivo} onChange={(e) => setObjetivo(e.target.value)} className="hg-field" />
          </div>
        </div>
        <div>
          <p className="mb-1 font-semibold text-ink">Avance por producto</p>
          {progreso.length ? (
            <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
              {progreso.map((item, index) => {
                const pct = Math.min(100, Math.round((item.hecho / Number(item.cantidad_objetivo || 1)) * 100));
                return (
                  <li key={`${item.producto}-${index}`} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="min-w-0 truncate font-medium text-ink">{item.producto}</span>
                    <span className="t-num shrink-0 text-ink-muted">
                      {item.hecho} / {item.cantidad_objetivo}
                      {item.unidad ? ` ${item.unidad}` : ''} · {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-muted">Esta orden no tiene productos registrados.</p>
          )}
        </div>
        {orden.notas && <p className="rounded-md bg-surface-muted p-2 text-ink-muted">{orden.notas}</p>}
      </div>
    </Dialog>
  );
}
