'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarioEventos } from '../../../components/CalendarioEventos';

function CalendarioReventaContent() {
  const searchParams = useSearchParams();
  const highlightedOpId = searchParams.get('opId');

  return (
    <CalendarioEventos
      contexto="reventa_logistica"
      titulo="Calendario de Reventa & Logística"
      subtitulo="Coordinación de entregas con proveedores externos, retiro de materiales y despachos a clientes."
      tiposPermitidos={['reventa', 'logistica', 'retiro_proveedor', 'despacho_cliente', 'postventa', 'logistica_interna']}
      filtroPersonalField="calendario_reventa_logistica"
      highlightedOpId={highlightedOpId}
    />
  );
}

export default function CalendarioReventaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-gray-500">Cargando Calendario de Reventa...</div>}>
      <CalendarioReventaContent />
    </Suspense>
  );
}
