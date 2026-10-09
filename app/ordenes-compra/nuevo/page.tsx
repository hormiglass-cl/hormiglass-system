'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { OrdenCompraModal } from '../../../components/OrdenCompraModal';
import { PageHeader } from '../../../components/ui/crm';

function NuevaOrdenCompraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
    router.push('/ordenes-compra');
  };

  return (
    <div className="hg-page space-y-5">
      <div>
        <Link
          href="/ordenes-compra"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent-ink transition mb-3"
        >
          <ArrowLeft size={14} aria-hidden />
          <span>Volver a Órdenes de Compra</span>
        </Link>
        <PageHeader
          title="Nueva Orden de Compra"
          description="Emisión de orden de compra oficial para abastecimiento o reventa."
        />
      </div>

      <OrdenCompraModal
        isOpen={open}
        onClose={handleClose}
        proveedorIdInicial={searchParams.get('proveedor_id') || undefined}
        oportunidadIdInicial={searchParams.get('op_id') || undefined}
        onSuccess={() => router.push('/ordenes-compra')}
      />
    </div>
  );
}

export default function NuevaOrdenCompraPage() {
  return (
    <Suspense fallback={<div className="text-sm text-ink-muted p-6">Cargando formulario de OC...</div>}>
      <NuevaOrdenCompraContent />
    </Suspense>
  );
}
