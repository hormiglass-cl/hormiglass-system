'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarioEventos } from '../../../components/CalendarioEventos';

function CalendarioPlanificacionContent() {
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  return (
    <CalendarioEventos
      contexto="produccion_logistica"
      titulo="Calendario de Producción & Logística"
      subtitulo="Planificación integral de obras en terreno, fabricación en planta y despachos logísticos."
      tiposPermitidos={['obra', 'produccion', 'logistica']}
      filtroPersonalField="calendario_produccion_logistica"
      highlightedOpId={highlightedOpId}
    />
  );
}

export default function CalendarioPlanificacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-gray-500">Cargando Calendario de Producción...</div>}>
      <CalendarioPlanificacionContent />
    </Suspense>
  );
}
