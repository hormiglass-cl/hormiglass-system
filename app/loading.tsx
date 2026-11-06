'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AuthLoading } from '../components/auth/AuthShell';

export default function Loading() {
  const pathname = usePathname();
  // Entre pantallas de acceso se mantiene la escena oscura: el esqueleto claro de la app
  // provocaba un destello blanco al ir de /login a /auth/recuperar (y de vuelta).
  if (pathname === '/login' || pathname.startsWith('/auth')) return <AuthLoading />;

  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Cargando contenido">
      {/* Skeleton del encabezado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-control bg-surface-muted hg-skeleton" />
          <div className="h-4 w-72 rounded-control bg-surface-muted hg-skeleton" />
        </div>
        <div className="h-9 w-36 rounded-control bg-surface-muted hg-skeleton" />
      </div>

      {/* Skeleton de barra de búsqueda y filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 flex-1 min-w-[240px] max-w-md rounded-control bg-surface-muted hg-skeleton" />
        <div className="h-10 w-28 rounded-control bg-surface-muted hg-skeleton" />
        <div className="h-10 w-24 rounded-control bg-surface-muted hg-skeleton" />
      </div>

      {/* Skeleton del panel y filas de tabla */}
      <div className="rounded-panel border border-line-subtle bg-surface p-4 space-y-4">
        <div className="h-10 w-full rounded-control bg-surface-muted hg-skeleton" />
        <div className="space-y-3 pt-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 py-3.5 px-3 border-b border-line-subtle last:border-b-0"
            >
              <div className="h-4 w-28 rounded bg-surface-muted hg-skeleton" />
              <div className="h-4 w-48 rounded bg-surface-muted hg-skeleton hidden sm:block" />
              <div className="h-4 w-24 rounded bg-surface-muted hg-skeleton" />
              <div className="h-6 w-20 rounded-full bg-surface-muted hg-skeleton" />
              <div className="h-4 w-24 rounded bg-surface-muted hg-skeleton text-right" />
              <div className="h-7 w-16 rounded-control bg-surface-muted hg-skeleton" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
