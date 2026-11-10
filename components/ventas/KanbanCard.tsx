'use client';

import React from 'react';
import clsx from 'clsx';
import { GripVertical, Building, Trash2, Calendar, AlertCircle } from 'lucide-react';
import type { OportunidadVenta, Usuario } from '../../lib/types';
import { CodeStamp, AvatarBadge } from '../ui/crm';

export interface KanbanCardProps {
  oportunidad: OportunidadVenta;
  assignedUser?: Usuario;
  montoTotal: number;
  montoAbonado: number;
  saldoPendiente: number;
  latestQuoteVersion?: number;
  isUnaccredited?: boolean;
  isBeingDragged?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
  onDelete?: () => void;
}

export function KanbanCard({
  oportunidad,
  assignedUser,
  montoTotal,
  montoAbonado,
  saldoPendiente,
  latestQuoteVersion,
  isUnaccredited = false,
  isBeingDragged = false,
  onDragStart,
  onDragEnd,
  onClick,
  onDelete,
}: KanbanCardProps) {
  const op = oportunidad;

  // Formato chileno CLP
  const formattedTotal = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(montoTotal);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Oportunidad ${op.codigo}: ${op.titulo}`}
      className={clsx(
        'group relative rounded-panel border border-line bg-surface p-3.5 transition-all cursor-pointer shadow-xs',
        'hover:border-accent hover:shadow-md active:cursor-grabbing',
        isBeingDragged && 'opacity-40 border-dashed border-accent scale-[0.98]'
      )}
    >
      {/* Fila Superior: Grip + Folio + Quote Badge + Avatar Asignado */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <GripVertical
            size={14}
            className="text-ink-muted opacity-40 group-hover:opacity-100 transition shrink-0 cursor-grab"
            aria-hidden
          />
          {/* Long folios (e.g. WhatsApp UUIDs) truncate instead of running under the assignee avatar. */}
          <span className="flex min-w-0 [&_.code-stamp]:block [&_.code-stamp]:truncate">
            <CodeStamp title={`Folio ${op.codigo}`}>{op.codigo}</CodeStamp>
          </span>
          {latestQuoteVersion && (
            <span className="t-micro rounded px-1.5 py-0.5 font-semibold bg-info-soft text-info border border-info-line shrink-0">
              Cot. v{latestQuoteVersion}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-ink-muted hover:text-danger rounded-control transition"
              title="Eliminar oportunidad"
              aria-label="Eliminar oportunidad"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          )}

          {assignedUser && (
            <AvatarBadge
              name={assignedUser.nombre || assignedUser.email}
              size="xs"
              className="ring-1 ring-surface"
            />
          )}
        </div>
      </div>

      {/* Título de la Oportunidad */}
      <div className="mt-2.5">
        <h4 className="text-[13px] font-semibold text-ink leading-snug line-clamp-2 group-hover:text-accent-ink transition">
          {op.titulo}
        </h4>

        {op.cliente?.nombre && (
          <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted truncate font-medium">
            <Building size={12} className="shrink-0 text-accent-ink" aria-hidden />
            <span className="truncate">{op.cliente.nombre}</span>
          </div>
        )}
      </div>

      {/* Valor Comercial Destacado */}
      <div className="mt-3 flex items-baseline justify-between border-t border-line-subtle pt-2.5">
        <div className="min-w-0">
          <span className="text-[11px] font-medium text-ink-muted block leading-none">Monto negocio</span>
          <span className="t-num text-sm font-bold text-ink tracking-tight">{formattedTotal}</span>
        </div>

        {montoAbonado > 0 && (
          <div className="text-right shrink-0">
            <span className="text-[11px] font-medium text-success block leading-none">
              {saldoPendiente <= 0 ? '100% Pagado' : `Abono: ${Math.round((montoAbonado / Math.max(montoTotal, 1)) * 100)}%`}
            </span>
          </div>
        )}
      </div>

      {/* Píldoras Contextuales (Folk / Attio Style) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        {/* Tipo de Venta */}
        {op.tipo_venta && (
          <span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 font-medium text-ink">
            {op.tipo_venta}
          </span>
        )}

        {/* Prioridad */}
        {op.prioridad && op.prioridad !== 'normal' && (
          <span
            className={clsx(
              't-micro rounded-full border px-2 py-0.5 font-semibold capitalize',
              op.prioridad === 'urgente'
                ? 'bg-danger-soft text-danger border-danger-line'
                : 'bg-warning-soft text-warning border-warning-line'
            )}
          >
            {op.prioridad}
          </span>
        )}

        {/* Alerta de Acreditación */}
        {isUnaccredited && (
          <span className="t-micro inline-flex items-center gap-1 rounded-full border border-warning-line bg-warning-soft px-2 py-0.5 font-semibold text-warning">
            <AlertCircle size={10} aria-hidden />
            <span>Sin acreditar</span>
          </span>
        )}

        {/* Fecha Límite */}
        {op.fecha_limite && (
          <span className="t-micro inline-flex items-center gap-1 text-ink-muted ml-auto font-mono">
            <Calendar size={11} aria-hidden />
            <span>{op.fecha_limite.slice(5)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
