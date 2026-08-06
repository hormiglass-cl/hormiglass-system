'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/context/AuthContext';

// La protección real de rutas ocurre en middleware.ts (server-side, corre
// antes de que se sirva la página o se dispare cualquier query). Este
// componente ya NO es la guardia de seguridad — solo evita un flash de
// contenido mientras carga el perfil, y hace de respaldo por si el estado
// del cliente queda desalineado (ej. tras un logout desde otra pestaña).
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#363636] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#F7931F] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-gray-300">Cargando Hormiglass CRM...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
