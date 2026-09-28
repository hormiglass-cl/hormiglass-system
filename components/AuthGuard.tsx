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
        if (currentUser.rol === 'mano_obra') {
          router.replace('/rrhh');
        } else {
          router.replace('/');
        }
      } else if (currentUser && currentUser.rol === 'mano_obra') {
        const manoObraAllowed = [
          '/rrhh',
          '/administracion',
          '/visitas',
          '/planificacion/calendario',
          '/planificacion/semana',
          '/calendarios/general',
          '/reventa/calendario',
          '/notificaciones',
          '/recordatorios',
        ];
        const isAllowed = manoObraAllowed.some((route) => pathname.startsWith(route)) ||
          /^\/ventas\/[^/]+\/operacion(?:\/|$)/.test(pathname) || pathname.startsWith('/auth');
        if (!isAllowed) {
          router.replace('/rrhh');
        }
      }
    }
  }, [currentUser, loading, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] text-[#252b2d]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-gray-300">Cargando Hormiglass CRM...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
