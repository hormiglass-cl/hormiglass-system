'use client';

import React from 'react';
import { DollarSign, CheckCircle2, Clock, ArrowUpRight } from 'lucide-react';

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
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600">
              <DollarSign className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-base text-[#213343]">
              Estado Financiero y Cobranza
            </h3>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Recaudación acumulada frente al saldo total por cobrar
          </p>
        </div>

        <span className="bg-orange-50 text-[#f97316] font-bold text-xs px-3 py-1 rounded-full border border-orange-200">
          {totalOps} contratos activos
        </span>
      </div>

      {/* Tarjeta Destacada Cuánto Falta por Pagar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* 1. Facturación Total Comprometida */}
        <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-1">
          <span className="text-gray-500 font-bold block">
            Valor total facturado
          </span>
          <span className="text-xl font-black text-[#213343] block">
            ${totalVendido.toLocaleString('es-CL')} CLP
          </span>
          <span className="text-[11px] text-gray-400 font-medium block">
            100% de operaciones en curso
          </span>
        </div>

        {/* 2. Total Abonado / Recaudado */}
        <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-emerald-800 font-bold block">
              Recaudado / Abonado
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xl font-black text-emerald-700 block">
            ${totalAbonado.toLocaleString('es-CL')} CLP
          </span>
          <span className="text-[11px] text-emerald-700 font-bold block">
            {percentRecaudado}% del total cobrado
          </span>
        </div>

        {/* 3. Cuánto Falta por Pagar (Saldo Pendiente) */}
        <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-300 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-amber-900 font-black block">
              Falta por pagar (saldo)
            </span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-xl font-black text-amber-900 block">
            ${totalPendiente.toLocaleString('es-CL')} CLP
          </span>
          <span className="text-[11px] text-amber-800 font-bold block">
            {percentPendiente}% pendiente por recaudar
          </span>
        </div>
      </div>

      {/* Barra de Progreso de Cobertura de Pagos */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-emerald-700 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Recaudado: {percentRecaudado}%</span>
          </span>
          <span className="text-amber-800 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Por cobrar: {percentPendiente}%</span>
          </span>
        </div>

        <div className="w-full bg-amber-100 h-3 rounded-full overflow-hidden flex shadow-inner">
          <div
            className="bg-emerald-500 h-full transition-all duration-700"
            style={{ width: `${percentRecaudado}%` }}
          />
          <div
            className="bg-amber-400 h-full transition-all duration-700"
            style={{ width: `${percentPendiente}%` }}
          />
        </div>
      </div>
    </div>
  );
}
