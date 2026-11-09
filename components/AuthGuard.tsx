'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/context/AuthContext';

// Guardia centralizada del cliente. La seguridad real de datos vive en RLS de
// Supabase; este componente evita flashes de contenido y accesos de UI fuera
// del rol esperado.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!currentUser && pathname !== '/login' && !pathname.startsWith('/auth')) {
        router.replace('/login');
      } else if (currentUser && pathname === '/login') {
        router.replace('/');
      }
    }
  }, [currentUser, loading, pathname, router]);

  // Las pantallas de acceso no esperan a la sesión: evita el destello claro del spinner.
  const isAccessRoute = pathname === '/login' || pathname.startsWith('/auth');

  if (loading && !isAccessRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-ink hg-page-transition">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-ink-muted">Cargando Hormiglass CRM...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
