'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';
import { OrdenCompraModal } from '../../../components/OrdenCompraModal';

function NuevaOrdenCompraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
    router.push('/ordenes-compra');
  };

  return (
    <div className="space-y-6 text-[#363636]">
      <div className="flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <Link href="/ordenes-compra" className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#F7931F] mb-3">
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Ordenes de Compra</span>
          </Link>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F7931F]" />
            <span>Nueva Orden de Compra</span>
          </h1>
        </div>
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
    <Suspense fallback={<div className="text-sm text-gray-500">Cargando formulario de OC...</div>}>
      <NuevaOrdenCompraContent />
    </Suspense>
  );
}
