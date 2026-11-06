'use client';

import React from 'react';
import Link from 'next/link';
import { Cliente, OportunidadVenta, Usuario } from '../../lib/types';
import { SlideOverDrawer } from '../ui/SlideOverDrawer';
import { AvatarBadge } from '../ui/AvatarBadge';
import { CodeStamp } from '../ui/crm';
import { Mail, Phone, MapPin, Building, Briefcase, TrendingUp } from 'lucide-react';

interface ClienteDrawerProps {
  cliente: Cliente | null;
  open: boolean;
  onClose: () => void;
  oportunidades: OportunidadVenta[];
  usuarios: Usuario[];
}

export function ClienteDrawer({
  cliente,
  open,
  onClose,
  oportunidades,
  usuarios,
}: ClienteDrawerProps) {
  if (!cliente) return null;

  const clienteOps = oportunidades.filter((op) => op.cliente_id === cliente.id);
  const totalMontoOps = clienteOps.reduce((acc, op) => acc + (Number(op.monto_estimado) || 0), 0);
  const ejecutivo = usuarios.find((u) => u.id === cliente.asignado_a);

  return (
    <SlideOverDrawer
      open={open}
      onClose={onClose}
      title={cliente.nombre}
      subtitle={
        cliente.apellido_razon_social && cliente.apellido_razon_social !== cliente.nombre
          ? cliente.apellido_razon_social
          : undefined
      }
      badge={<CodeStamp>{cliente.rut || 'Sin RUT'}</CodeStamp>}
      fullPageHref={`/clientes/${cliente.id}`}
    >
      <div className="space-y-6">
        {/* Encabezado con Avatar e Información Rápida */}
        <div className="flex items-center gap-3 p-3.5 rounded-panel bg-surface-muted border border-line-subtle">
          <AvatarBadge name={cliente.nombre} size="lg" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-ink truncate">{cliente.nombre}</h4>
            <p className="text-xs text-ink-muted truncate">
              {cliente.nicho || 'Sin nicho asignado'}
            </p>
          </div>
          {ejecutivo && (
            <div className="flex items-center gap-1.5 shrink-0 bg-surface px-2.5 py-1 rounded-full border border-line text-xs">
              <AvatarBadge name={ejecutivo.nombre} size="xs" />
              <span className="text-ink font-medium truncate max-w-[120px]">{ejecutivo.nombre}</span>
            </div>
          )}
        </div>

        {/* Métricas Resumen (Tremor-style mini cards) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-control bg-surface border border-line p-3">
            <div className="flex items-center justify-between text-ink-muted mb-1">
              <span className="t-micro uppercase font-semibold">Oportunidades</span>
              <TrendingUp className="w-3.5 h-3.5 text-accent-ink" aria-hidden />
            </div>
            <p className="text-lg font-bold text-ink t-num">{clienteOps.length}</p>
            <p className="text-[11px] text-ink-muted">en pipeline comercial</p>
          </div>

          <div className="rounded-control bg-surface border border-line p-3">
            <div className="flex items-center justify-between text-ink-muted mb-1">
              <span className="t-micro uppercase font-semibold">Volumen Estimado</span>
              <span className="t-micro font-bold text-accent-ink">CLP</span>
            </div>
            <p className="text-lg font-bold text-ink t-num">
              ${Math.round(totalMontoOps / 1000).toLocaleString('es-CL')}k
            </p>
            <p className="text-[11px] text-ink-muted">total acumulado</p>
          </div>
        </div>

        {/* Propiedades Principales (2 Columnas estilo Attio) */}
        <div className="rounded-panel border border-line bg-surface p-4 space-y-3">
          <h5 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
            Propiedades del Contacto
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <Phone className="w-3 h-3" />
                <span>Teléfono</span>
              </span>
              <p className="font-semibold text-ink t-num">
                {cliente.telefono || <span className="text-ink-subtle italic">No registrado</span>}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <Mail className="w-3 h-3" />
                <span>Correo Principal</span>
              </span>
              <p className="font-semibold text-ink truncate">
                {cliente.correo || <span className="text-ink-subtle italic">No registrado</span>}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <Building className="w-3 h-3" />
                <span>Nicho / Clasificación</span>
              </span>
              <p className="font-semibold text-ink">
                {cliente.nicho || <span className="text-ink-subtle italic">Sin nicho</span>}
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                <span>Ejecutivo Responsable</span>
              </span>
              <p className="font-semibold text-ink">
                {ejecutivo?.nombre || <span className="text-ink-subtle italic">Sin asignar</span>}
              </p>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>Ubicación</span>
              </span>
              <p className="font-semibold text-ink">
                {cliente.direccion ? (
                  <>
                    {cliente.direccion}
                    {cliente.comuna ? `, ${cliente.comuna}` : ''}
                    {cliente.region ? ` (${cliente.region})` : ''}
                  </>
                ) : (
                  <span className="text-ink-subtle italic">Sin dirección registrada</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Oportunidades Vinculadas */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              Oportunidades ({clienteOps.length})
            </h5>
            <Link
              href="/ventas"
              className="text-[11px] text-accent-ink hover:underline font-semibold"
            >
              Ir al Pipeline
            </Link>
          </div>

          {clienteOps.length === 0 ? (
            <div className="rounded-control border border-dashed border-line bg-surface-muted/30 p-4 text-center text-xs text-ink-muted">
              Este cliente aún no tiene oportunidades de venta registradas.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {clienteOps.map((op) => {
                const total = Number(op.monto_estimado) || 0;
                return (
                  <Link
                    key={op.id}
                    href={`/ventas?oportunidad=${op.id}`}
                    className="flex items-center justify-between p-2.5 rounded-control border border-line bg-surface hover:bg-surface-muted transition group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-ink truncate group-hover:text-accent">
                        {op.titulo || op.codigo || `Oportunidad #${op.id.slice(0, 6)}`}
                      </p>
                      <p className="text-[11px] text-ink-muted truncate">
                        {op.estado_pipeline} · {op.tipo_venta || 'Venta'}
                      </p>
                    </div>
                    {total > 0 && (
                      <span className="t-num text-xs font-bold text-ink shrink-0 ml-2">
                        ${total.toLocaleString('es-CL')}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SlideOverDrawer>
  );
}
