'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Redirección hacia la Ficha Maestra de Venta (/ventas/[id]?tab=operacion).
 * Conserva compatibilidad con enlaces existentes y la subruta /ventas/[id]/operacion/guias/[guiaId].
 */
export default function OperacionVentaRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/ventas/${id}?tab=operacion`);
    } else {
      router.replace('/ventas');
    }
  }, [id, router]);

  return (
    <div className="py-20 text-center text-sm text-ink-muted">
      Redirigiendo a Operación y Entregas en la Ficha Maestra de Venta...
    </div>
  );
}
