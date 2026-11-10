'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import { mensajeError } from '../../lib/errores';
import { eventosEnConflicto, produccionesPendientesAntesDe } from '../../lib/calendario-conflictos';
import { CALENDARIO_KINDS, KIND_ORDER, TIPOS_EVENTO_CONFIG, type CalendarioKind } from '../../lib/calendario-tipos';
import type { OrdenRow } from '../../lib/calendario-tipos';
import type {
  EventoProduccionLogistica,
  TipoEventoProduccionLogistica,
  Usuario,
} from '../../lib/types';
import { Button, Dialog } from '../ui/crm';
import { useConfirm, useToast } from '../ui/feedback';
import { DateInput, DateTimeInput, Select } from '../ui/FormControls';

export type OrdenParaProgramar = OrdenRow;

interface OportunidadOpcion {
  id: string;
  codigo: string;
  titulo: string;
  cliente?: { nombre?: string } | null;
}

const TIPOS_POR_KIND: Record<'produccion' | 'reventa', TipoEventoProduccionLogistica[]> = {
  produccion: ['obra', 'produccion', 'logistica', 'despacho_cliente', 'instalacion', 'postventa', 'logistica_interna'],
  reventa: ['reventa', 'logistica', 'retiro_proveedor', 'despacho_cliente', 'postventa', 'logistica_interna'],
};

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

interface NuevoEventoDialogProps {
  initialKind: CalendarioKind;
  /** Día (YYYY-MM-DD) con el que se abre el formulario. */
  initialDate?: string;
  eventos: EventoProduccionLogistica[];
  ordenes: OrdenParaProgramar[];
  onClose: () => void;
  onCreated: () => void;
}

/** Formulario único para programar cualquier evento de los calendarios. */
export function NuevoEventoDialog({
  initialKind,
  initialDate,
  eventos,
  ordenes,
  onClose,
  onCreated,
}: NuevoEventoDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [kind, setKind] = useState<CalendarioKind>(initialKind);
  const [oportunidades, setOportunidades] = useState<OportunidadOpcion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [guias, setGuias] = useState<{ id: string; oportunidad_id: string; numero_guia: string }[]>([]);
  const [ocs, setOcs] = useState<{ orden_compra_id: string; oportunidad_id: string; ordenes_compra: { numero_oc: string } | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [masOpciones, setMasOpciones] = useState(false);

  const inicioPorDefecto = useMemo(() => {
    const base = initialDate ? new Date(`${initialDate}T09:00:00`) : new Date();
    if (!initialDate) base.setMinutes(0, 0, 0);
    return base;
  }, [initialDate]);

  const [opId, setOpId] = useState('');
  const [tipo, setTipo] = useState<TipoEventoProduccionLogistica>(
    initialKind === 'reventa' ? 'reventa' : 'obra',
  );
  const [titulo, setTitulo] = useState('');
  const [inicio, setInicio] = useState(toLocalInput(inicioPorDefecto));
  const [fin, setFin] = useState(toLocalInput(new Date(inicioPorDefecto.getTime() + 60 * 60 * 1000)));
  const [responsableId, setResponsableId] = useState('');
  const [notas, setNotas] = useState('');
  const [vehiculo, setVehiculo] = useState('');
  const [ocId, setOcId] = useState('');
  const [guiaId, setGuiaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [ordenId, setOrdenId] = useState('');
  const [ordenInicio, setOrdenInicio] = useState(initialDate || '');
  const [ordenObjetivo, setOrdenObjetivo] = useState('');

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(async () => {
      const [opRes, userRes, guiaRes, ocRes] = await Promise.all([
        supabase
          .from('oportunidades')
          .select('id, codigo, titulo, cliente:clientes(nombre)')
          .order('created_at', { ascending: false }),
        supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true }),
        supabase.from('guias_despacho').select('id, oportunidad_id, numero_guia').neq('estado', 'cancelada'),
        supabase.from('orden_compra_asignaciones').select('orden_compra_id, oportunidad_id, ordenes_compra(numero_oc)'),
      ]);
      if (ignore) return;
      if (opRes.data) setOportunidades(opRes.data as unknown as OportunidadOpcion[]);
      if (userRes.data) setUsuarios(userRes.data as Usuario[]);
      if (guiaRes.data) setGuias(guiaRes.data);
      if (ocRes.data) setOcs(ocRes.data as unknown as typeof ocs);
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [supabase]);

  const personal = useMemo(() => {
    const campo = kind === 'terreno' ? 'calendario_visitas' : kind === 'reventa' ? 'calendario_reventa' : 'calendario_produccion';
    const filtrados = usuarios.filter((u) => (u as unknown as Record<string, unknown>)[campo] !== false);
    return filtrados.length ? filtrados : usuarios;
  }, [usuarios, kind]);

  const tiposDisponibles = kind === 'reventa' ? TIPOS_POR_KIND.reventa : TIPOS_POR_KIND.produccion;
  const tipoActual = tiposDisponibles.includes(tipo) ? tipo : tiposDisponibles[0];
  const ordenesDisponibles = ordenes.filter((o) => !['completada', 'cancelada'].includes(o.estado));
  const ocsDeLaVenta = Array.from(
    new Map(ocs.filter((o) => o.oportunidad_id === opId).map((o) => [o.orden_compra_id, o])).values(),
  );
  const guiasDeLaVenta = guias.filter((g) => g.oportunidad_id === opId);

  const cambiarKind = (next: CalendarioKind) => {
    setKind(next);
    setResponsableId('');
    setMotivo('');
  };

  const borradorEvento = {
    id: 'nuevo',
    oportunidad_id: opId,
    tipo_evento: tipoActual,
    titulo,
    fecha_inicio: inicio,
    fecha_fin: fin,
    responsable_id: responsableId || null,
    recurso_vehiculo: vehiculo || null,
    estado: 'por_hacer',
  };
  const esEventoLogistico = kind === 'produccion' || kind === 'reventa';
  const conflictos = esEventoLogistico && opId && inicio ? eventosEnConflicto(borradorEvento, eventos) : [];
  const produccionPendiente =
    esEventoLogistico && opId && inicio ? produccionesPendientesAntesDe(borradorEvento, eventos).length > 0 : false;
  const hayConflicto = conflictos.length > 0 || produccionPendiente;

  const guardarTerreno = async () => {
    const [fecha, hora = '09:00'] = inicio.split('T');
    const tecnico = usuarios.find((u) => u.id === responsableId);
    const { error } = await supabase.from('visitas_terreno').insert([
      {
        oportunidad_id: opId,
        tecnico_visita: tecnico?.nombre || '',
        tecnico_id: responsableId || null,
        fecha_visita_terreno: fecha,
        hora_visita_terreno: hora,
        estado_visita: 'programada',
        observaciones_visita: notas.trim() || null,
      },
    ]);
    if (error) throw error;
    await supabase.from('oportunidades').update({ requiere_visita_terreno: true }).eq('id', opId);
    toast({ message: 'Visita a terreno programada.', tone: 'success' });
  };

  const guardarEvento = async () => {
    const startD = new Date(inicio);
    const endD = fin ? new Date(fin) : new Date(startD.getTime() + 3600000);
    if (endD <= startD) throw new Error('La hora de término debe ser posterior al inicio.');
    if (hayConflicto) {
      if (!motivo.trim()) throw new Error('Indica el motivo del conflicto o dependencia para continuar.');
      const ok = await confirm({
        title: 'Confirmar conflicto de programación',
        message: `${conflictos.length ? `Posible conflicto con ${conflictos.map((item) => item.titulo).join(', ')}. ` : ''}${produccionPendiente ? 'La producción programada termina después de este evento. ' : ''}¿Confirmar programación?`,
        confirmLabel: 'Confirmar programación',
        destructive: false,
      });
      if (!ok) return false;
    }
    const op = oportunidades.find((o) => o.id === opId);
    const tituloFinal = titulo.trim() || `${TIPOS_EVENTO_CONFIG[tipoActual]?.label || tipoActual}${op ? ` — ${op.codigo}` : ''}`;
    const { data, error } = await supabase
      .from('eventos_produccion_logistica')
      .insert([
        {
          contexto: kind === 'reventa' ? 'reventa_logistica' : 'produccion_logistica',
          oportunidad_id: opId,
          tipo_evento: tipoActual,
          titulo: tituloFinal,
          fecha_inicio: startD.toISOString(),
          fecha_fin: endD.toISOString(),
          fecha_evento: startD.toISOString().split('T')[0],
          hora_evento: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
          responsable_id: responsableId || null,
          estado: 'por_hacer',
          observaciones: notas.trim() || null,
          recurso_vehiculo: vehiculo.trim() || null,
          guia_despacho_id: guiaId || null,
          orden_compra_id: ocId || null,
          conflicto_confirmado_motivo: hayConflicto ? motivo.trim() : null,
          registrado_por: currentUser?.id || null,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    await logSistema({
      tipo_accion: 'creacion',
      entidad: 'eventos_produccion_logistica',
      entidad_id: data.id,
      descripcion: `Evento de ${tipoActual} "${tituloFinal}" creado en ${kind}`,
      usuario_id: currentUser?.id,
      datos_nuevos: data,
    });
    toast({ message: `Evento "${tituloFinal}" programado.`, tone: 'success' });
    return true;
  };

  const guardarOrden = async () => {
    if (ordenInicio && ordenObjetivo && ordenObjetivo < ordenInicio) {
      throw new Error('La fecha objetivo no puede ser anterior al inicio.');
    }
    const { error } = await supabase
      .from('ordenes_produccion')
      .update({
        fecha_inicio: ordenInicio || null,
        fecha_objetivo: ordenObjetivo || null,
        ...(responsableId ? { responsable_id: responsableId } : {}),
      })
      .eq('id', ordenId);
    if (error) throw error;
    toast({ message: 'Orden de producción programada.', tone: 'success' });
  };

  const puedeGuardar =
    kind === 'orden'
      ? !!ordenId && !!(ordenInicio || ordenObjetivo)
      : !!opId && !!inicio;

  const guardar = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!puedeGuardar || saving) return;
    try {
      setSaving(true);
      if (kind === 'terreno') await guardarTerreno();
      else if (kind === 'orden') await guardarOrden();
      else if (!(await guardarEvento())) return;
      onCreated();
      onClose();
    } catch (err) {
      console.error('Error al programar evento:', err);
      toast({ message: mensajeError(err, 'No se pudo programar. Revisa los campos.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const opcionesVenta = (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink">Venta *</label>
      <Select required value={opId} onChange={(e) => setOpId(e.target.value)} className="hg-field">
        <option value="">Selecciona una venta</option>
        {oportunidades.map((op) => (
          <option key={op.id} value={op.id}>
            {op.codigo} — {op.titulo} ({op.cliente?.nombre || 'Cliente'})
          </option>
        ))}
      </Select>
    </div>
  );

  const campoResponsable = (
    <div>
      <label className="mb-1 block text-xs font-semibold text-ink">
        {kind === 'terreno' ? 'Técnico' : 'Responsable'}
      </label>
      <Select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="hg-field">
        <option value="">Sin asignar</option>
        {personal.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Programar"
      description="Elige qué quieres agendar y completa lo mínimo."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Save} disabled={!puedeGuardar || saving} onClick={() => void guardar()}>
            {saving ? 'Guardando…' : 'Programar'}
          </Button>
        </>
      }
    >
      <form onSubmit={guardar} className="space-y-4 text-xs">
        <div role="radiogroup" aria-label="Qué programar" className="grid grid-cols-2 gap-2">
          {KIND_ORDER.map((k) => {
            const conf = CALENDARIO_KINDS[k];
            const Icon = conf.icon;
            const activo = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => cambiarKind(k)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] font-semibold transition ${
                  activo ? conf.active : 'border-line bg-surface text-ink-muted hover:bg-surface-muted'
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${conf.solid}`} aria-hidden />
                <Icon size={15} className="shrink-0" aria-hidden />
                <span className="truncate">{conf.short}</span>
              </button>
            );
          })}
        </div>

        {kind === 'orden' ? (
          <>
            <div>
              <label className="mb-1 block font-semibold text-ink">Orden de producción *</label>
              <Select
                required
                value={ordenId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOrdenId(id);
                  const orden = ordenes.find((o) => o.id === id);
                  if (orden) {
                    setOrdenInicio(orden.fecha_inicio || initialDate || '');
                    setOrdenObjetivo(orden.fecha_objetivo || '');
                    setResponsableId(orden.responsable_id || '');
                  }
                }}
                className="hg-field"
              >
                <option value="">Selecciona una orden</option>
                {ordenesDisponibles.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.oportunidad?.codigo || 'Orden'} — {o.oportunidad?.titulo || 'Sin título'}
                  </option>
                ))}
              </Select>
              {!ordenesDisponibles.length && (
                <p className="t-caption mt-1 text-ink-muted">
                  No hay órdenes pendientes. Las órdenes de producción se crean desde la venta.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-semibold text-ink">Inicio</label>
                <DateInput value={ordenInicio} onChange={(e) => setOrdenInicio(e.target.value)} className="hg-field" />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Fecha objetivo de término</label>
                <DateInput value={ordenObjetivo} onChange={(e) => setOrdenObjetivo(e.target.value)} className="hg-field" />
              </div>
            </div>
            {campoResponsable}
          </>
        ) : kind === 'terreno' ? (
          <>
            {opcionesVenta}
            <div>
              <label className="mb-1 block font-semibold text-ink">Fecha y hora de la visita *</label>
              <DateTimeInput required value={inicio} onChange={(e) => setInicio(e.target.value)} className="hg-field" />
            </div>
            {campoResponsable}
            <div>
              <label className="mb-1 block font-semibold text-ink">Notas</label>
              <textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Dirección, contacto en terreno, qué revisar…"
                className="hg-field"
              />
            </div>
          </>
        ) : (
          <>
            {opcionesVenta}
            <div>
              <label className="mb-1 block font-semibold text-ink">Tipo de evento *</label>
              <Select value={tipoActual} onChange={(e) => setTipo(e.target.value as TipoEventoProduccionLogistica)} className="hg-field">
                {tiposDisponibles.map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_EVENTO_CONFIG[t]?.label || t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-ink">Título</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Opcional: si lo dejas vacío se usa el tipo y el código de la venta"
                className="hg-field"
              />
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
            {campoResponsable}

            <button
              type="button"
              onClick={() => setMasOpciones((v) => !v)}
              aria-expanded={masOpciones}
              className="text-xs font-semibold text-accent-ink hover:underline"
            >
              {masOpciones ? 'Menos opciones' : 'Más opciones (notas, vehículo, OC y guía)'}
            </button>

            {masOpciones && (
              <div className="space-y-3 rounded-lg border border-line-subtle bg-surface-muted p-3">
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
              </div>
            )}

            {hayConflicto && (
              <div className="space-y-2">
                {conflictos.length > 0 && (
                  <p className="t-caption rounded-md border border-warning-line bg-warning-soft p-2 text-warning">
                    Posible choque de responsable o vehículo con: {conflictos.map((ev) => ev.titulo).join(', ')}.
                  </p>
                )}
                {produccionPendiente && (
                  <p className="t-caption rounded-md border border-warning-line bg-warning-soft p-2 text-warning">
                    La producción pendiente de esta venta termina después de este evento.
                  </p>
                )}
                <div>
                  <label className="mb-1 block font-semibold text-ink">Motivo para confirmar *</label>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="hg-field" />
                </div>
              </div>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}
