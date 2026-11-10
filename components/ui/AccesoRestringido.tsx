'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Panel } from './crm';

/** Aviso que reemplaza una sección reservada a administradores. */
export function AccesoRestringido({ seccion }: { seccion: string }) {
  return (
    <Panel className="mx-auto mt-10 max-w-lg p-8 text-center">
      <div role="alert" className="space-y-3">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning">
          <Lock size={22} aria-hidden />
        </div>
        <h2 className="t-section">No tienes acceso a {seccion}</h2>
        <p className="t-caption text-ink-muted">
          Esta sección solo la consultan y editan los administradores. Si la necesitas, pídele acceso a un administrador.
        </p>
        <Link href="/" className="inline-block pt-1 text-sm font-semibold text-accent-ink hover:underline">
          Volver al panel operativo
        </Link>
      </div>
    </Panel>
  );
}
