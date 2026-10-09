'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarioEventos } from '../../../components/CalendarioEventos';

function CalendarioPlanificacionContent() {
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  return (
    <div className="hg-page">
      <CalendarioEventos
        contexto="produccion_logistica"
        titulo="Calendario de Producción & Logística"
        subtitulo="Planificación integral de obras en terreno, fabricación en planta y despachos logísticos."
        tiposPermitidos={['obra', 'produccion', 'logistica', 'despacho_cliente', 'instalacion', 'postventa', 'logistica_interna']}
        filtroPersonalField="calendario_produccion_logistica"
        highlightedOpId={highlightedOpId}
      />
    </div>
  );
}

export default function CalendarioPlanificacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-ink-muted font-medium">Cargando Calendario de Producción...</div>}>
      <CalendarioPlanificacionContent />
    </Suspense>
  );
}
