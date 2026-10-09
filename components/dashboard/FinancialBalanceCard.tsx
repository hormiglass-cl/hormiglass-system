'use client';

import React from 'react';
import { DollarSign, CheckCircle2, Clock } from 'lucide-react';

interface FinancialBalanceCardProps {
  totalVendido: number;
  totalAbonado: number;
  totalPendiente: number;
  totalOps: number;
}

export function FinancialBalanceCard({
  totalVendido,
  totalAbonado,
  totalPendiente,
  totalOps,
}: FinancialBalanceCardProps) {
  const percentRecaudado =
    totalVendido > 0 ? Math.min(100, Math.round((totalAbonado / totalVendido) * 100)) : 0;
  const percentPendiente = 100 - percentRecaudado;

  return (
    <div className="space-y-5 rounded-panel border border-line bg-surface p-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line-subtle pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-control bg-success-soft text-success">
              <DollarSign className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-base font-semibold text-ink">
              Estado financiero y cobranza
            </h3>
          </div>
          <p className="t-caption mt-0.5 text-ink-muted">
            Recaudación acumulada frente al saldo total por cobrar
          </p>
        </div>

        <span className="t-micro rounded-full border border-line bg-surface-muted px-3 py-1 font-medium text-ink">
          {totalOps} contratos activos
        </span>
      </div>

      {/* Tarjetas de Balance */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 1. Facturación Total Comprometida */}
        <div className="space-y-1 rounded-control border border-line bg-surface-muted p-4">
          <span className="t-caption font-medium text-ink-muted block">
            Valor comercial
          </span>
          <span className="t-figure block text-ink">
            ${totalVendido.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] text-ink-muted block">
            Cotizaciones vigentes
          </span>
        </div>

        {/* 2. Total Abonado / Recaudado */}
        <div className="space-y-1 rounded-control border border-success-line bg-success-soft p-4">
          <div className="flex items-center justify-between">
            <span className="t-caption font-semibold text-success block">
              Recaudado / Abonado
            </span>
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
          </div>
          <span className="t-figure block text-success">
            ${totalAbonado.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] font-medium text-success block">
            {percentRecaudado}% del total cobrado
          </span>
        </div>

        {/* 3. Cuánto Falta por Pagar (Saldo Pendiente) */}
        <div className="space-y-1 rounded-control border border-warning-line bg-warning-soft p-4">
          <div className="flex items-center justify-between">
            <span className="t-caption font-semibold text-warning block">
              Por cobrar (saldo)
            </span>
            <Clock className="h-4 w-4 text-warning" aria-hidden />
          </div>
          <span className="t-figure block text-warning">
            ${totalPendiente.toLocaleString('es-CL')}
          </span>
          <span className="text-[11px] font-medium text-warning block">
            {percentPendiente}% pendiente por recaudar
          </span>
        </div>
      </div>

      {/* Barra de Cobertura */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="flex items-center gap-1.5 text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span>Recaudado: {percentRecaudado}%</span>
          </span>
          <span className="flex items-center gap-1.5 text-warning">
            <span className="h-2 w-2 rounded-full bg-warning" />
            <span>Por cobrar: {percentPendiente}%</span>
          </span>
        </div>

        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${percentRecaudado}%` }}
          />
          <div
            className="h-full bg-warning transition-all duration-500"
            style={{ width: `${percentPendiente}%` }}
          />
        </div>
      </div>
    </div>
  );
}
