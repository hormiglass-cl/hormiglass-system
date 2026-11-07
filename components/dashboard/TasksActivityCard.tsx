'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckSquare, Square, Phone, Mail, Calendar, Clock } from 'lucide-react';
import clsx from 'clsx';
import type { Recordatorio, EventoProduccionLogistica } from '../../lib/types';

interface TasksActivityCardProps {
  recordatorios: Recordatorio[];
  eventos: EventoProduccionLogistica[];
  onToggleComplete?: (recordatorio: Recordatorio) => void;
}

export function TasksActivityCard({
  recordatorios,
  eventos,
  onToggleComplete,
}: TasksActivityCardProps) {
  // Combinar recordatorios pendientes con eventos próximos
  const pendingTasks = recordatorios
    .filter((r) => !r.completado && r.estado !== 'completada')
    .slice(0, 4)
    .map((r) => {
      const isCall = r.titulo.toLowerCase().includes('llamar') || r.titulo.toLowerCase().includes('contacto');
      const isEmail = r.titulo.toLowerCase().includes('correo') || r.titulo.toLowerCase().includes('enviar') || r.titulo.toLowerCase().includes('cotización');
      const isVisit = r.titulo.toLowerCase().includes('visita') || r.titulo.toLowerCase().includes('terreno');

      let icon = CheckSquare;
      let toneBg = 'bg-accent-soft text-accent-ink';
      if (isCall) { icon = Phone; toneBg = 'bg-success-soft text-success'; }
      else if (isEmail) { icon = Mail; toneBg = 'bg-info-soft text-info'; }
      else if (isVisit) { icon = Calendar; toneBg = 'bg-warning-soft text-warning'; }

      const isToday = r.fecha_vencimiento === new Date().toISOString().split('T')[0];
      const isOverdue = r.fecha_vencimiento < new Date().toISOString().split('T')[0];

      return {
        id: r.id,
        raw: r,
        title: r.titulo,
        subtitle: r.descripcion || 'Compromiso comercial con cliente',
        dateLabel: isToday ? 'Hoy' : isOverdue ? 'Atrasada' : r.fecha_vencimiento,
        timeLabel: '09:00',
        priority: (r.urgencia === 'critica' || r.urgencia === 'alta' || isOverdue ? 'alta' : r.urgencia === 'baja' ? 'baja' : 'media') as 'alta' | 'media' | 'baja',
        Icon: icon,
        toneBg,
        completed: Boolean(r.completado),
      };
    });

  // Agregar eventos operativos si faltan tareas
  const operationalEvents = eventos
    .filter((e) => ['por_hacer', 'en_curso'].includes(e.estado))
    .slice(0, Math.max(0, 6 - pendingTasks.length))
    .map((e) => ({
      id: `ev-${e.id}`,
      raw: null,
      title: e.titulo,
      subtitle: `${e.tipo_evento} · ${e.responsable?.nombre || 'Equipo Hormiglass'}`,
      dateLabel: e.fecha_inicio?.split('T')[0] || e.fecha_evento || 'Programada',
      timeLabel: e.hora_evento || '10:00',
      priority: 'media' as const,
      Icon: Calendar,
      toneBg: 'bg-accent-soft text-accent-ink',
      completed: false,
    }));

  const allItems = [...pendingTasks, ...operationalEvents].slice(0, 6);

  return (
    <div className="flex flex-col justify-between rounded-[20px] border border-line bg-surface p-6">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
              <Clock size={15} aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink">
                Tareas y actividad
              </h3>
              <p className="t-caption text-ink-muted">Seguimientos, llamadas y compromisos del equipo</p>
            </div>
          </div>

          <Link
            href="/administracion?empresa=inmobiliaria&seccion=pendientes_generales"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
          >
            <span>Ver todo</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Lista de Tareas */}
        {allItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            No tienes compromisos ni actividades pendientes para hoy.
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {allItems.map((item) => {
              const priorityTone =
                item.priority === 'alta'
                  ? 'bg-danger-soft text-danger border-danger-line'
                  : item.priority === 'media'
                  ? 'bg-warning-soft text-warning border-warning-line'
                  : 'bg-surface-muted text-ink-muted border-line';

              return (
                <li
                  key={item.id}
                  className="flex items-start gap-3 py-3 px-1 rounded-control transition hover:bg-surface-muted"
                >
                  {/* Botón de Checkbox */}
                  {item.raw ? (
                    <button
                      type="button"
                      onClick={() => onToggleComplete?.(item.raw as Recordatorio)}
                      className="mt-0.5 cursor-pointer text-ink-subtle hover:text-success transition shrink-0"
                      title="Marcar como completada"
                      aria-label="Marcar tarea como completada"
                    >
                      {item.completed ? (
                        <CheckSquare className="h-4 w-4 text-success" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-surface-muted text-ink-muted mt-0.5">
                      <item.Icon size={14} aria-hidden />
                    </span>
                  )}

                  {/* Icono de Categoría */}
                  {item.raw && (
                    <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-control mt-0.5', item.toneBg)}>
                      <item.Icon size={13} aria-hidden />
                    </span>
                  )}

                  {/* Contenido */}
                  <div className="min-w-0 flex-1">
                    <p className={clsx('truncate text-sm font-semibold text-ink', item.completed && 'line-through opacity-60')}>
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {item.subtitle}
                    </p>
                  </div>

                  {/* Fecha y Prioridad */}
                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    <span className="t-micro font-mono text-ink-muted whitespace-nowrap">
                      {item.dateLabel}, {item.timeLabel}
                    </span>
                    <span className={clsx('inline-block rounded-full border px-2 py-0.2 t-micro font-semibold capitalize', priorityTone)}>
                      {item.priority}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line-subtle pt-3 mt-3 flex items-center justify-between text-xs text-ink-muted">
        <span>{recordatorios.filter((r) => !r.completado).length} recordatorios pendientes</span>
        <Link
          href="/calendarios/general?contexto=produccion_logistica"
          className="font-medium hover:text-ink transition"
        >
          Ver calendario semanal →
        </Link>
      </div>
    </div>
  );
}
