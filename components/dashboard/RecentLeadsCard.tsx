'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, Building2 } from 'lucide-react';
import { AvatarBadge } from '../ui/AvatarBadge';
import { StatusBadge } from '../ui/crm';
import type { OportunidadVenta } from '../../lib/types';

interface RecentLeadsCardProps {
  oportunidades: OportunidadVenta[];
  onOpenOportunidad?: (op: OportunidadVenta) => void;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Reciente';
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return 'Reciente';
  const now = Date.now();
  const diffSec = Math.floor((now - time) / 1000);

  if (diffSec < 60) return 'hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

function getStageTone(estado: string): 'accent' | 'info' | 'warning' | 'success' | 'neutral' {
  if (estado === 'nueva') return 'accent';
  if (estado === 'cotizacion') return 'info';
  if (estado === 'pagada') return 'warning';
  if (estado === 'entregada' || estado.includes('finalizado') || estado.includes('entregado')) return 'success';
  return 'neutral';
}

function getStageLabel(estado: string): string {
  const map: Record<string, string> = {
    nueva: 'Nueva',
    cotizacion: 'Cotización',
    pagada: 'Pago Validado',
    entregada: 'Venta Aprobada',
    programada: 'Programada',
    prod_fabricacion: 'En Fabricación',
    prod_finalizado: 'Entregada',
    rev_entregado: 'Entregada',
  };
  return map[estado] || estado.replace(/_/g, ' ');
}

export function RecentLeadsCard({ oportunidades, onOpenOportunidad }: RecentLeadsCardProps) {
  const recentList = [...oportunidades]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 6);

  return (
    <div className="flex flex-col justify-between rounded-[20px] border border-line bg-surface p-6">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
              <Sparkles size={15} aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold text-ink">
                Oportunidades y prospectos
              </h3>
              <p className="t-caption text-ink-muted">Últimos contactos y cotizaciones activas</p>
            </div>
          </div>

          <Link
            href="/ventas"
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
          >
            <span>Ver todo</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* Lista de Leads */}
        {recentList.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-muted">
            No hay prospectos ni oportunidades registradas aún.
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {recentList.map((op) => {
              const clientName = op.cliente?.nombre || 'Prospecto sin nombre';
              const companyOrRut = op.cliente?.apellido_razon_social || op.cliente?.rut || op.cliente?.correo || 'Hormiglass';
              const relativeTime = formatRelativeTime(op.created_at);

              return (
                <li key={op.id}>
                  <Link
                    href={`/ventas?oportunidad=${op.id}`}
                    onClick={(e) => {
                      if (onOpenOportunidad) {
                        e.preventDefault();
                        onOpenOportunidad(op);
                      }
                    }}
                    className="group flex items-center justify-between gap-3 py-3 px-1 rounded-control transition hover:bg-surface-muted cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarBadge name={clientName} size="md" />

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink group-hover:text-accent-ink transition">
                          {clientName}
                        </p>
                        <p className="truncate text-xs text-ink-muted flex items-center gap-1">
                          <Building2 size={11} className="shrink-0 text-ink-subtle" />
                          <span>{op.titulo || companyOrRut}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <StatusBadge tone={getStageTone(op.estado_pipeline)}>
                        {getStageLabel(op.estado_pipeline)}
                      </StatusBadge>
                      <span className="t-micro text-ink-muted font-mono whitespace-nowrap hidden sm:inline">
                        {relativeTime}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line-subtle pt-3 mt-3 text-right">
        <Link
          href="/ventas"
          className="t-caption text-ink-muted hover:text-ink transition font-medium"
        >
          {oportunidades.length} oportunidades totales en cartera →
        </Link>
      </div>
    </div>
  );
}
