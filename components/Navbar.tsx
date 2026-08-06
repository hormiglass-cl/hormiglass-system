'use client';

import React from 'react';
import { useAuth } from '../lib/context/AuthContext';
import { Bell, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();

  if (pathname === '/login') return null;

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
    router.refresh();
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador';
      case 'ventas':
        return 'Ejecutivo Comercial';
      case 'finanzas':
        return 'Finanzas';
      case 'administracion':
        return 'Administración';
      case 'programacion':
        return 'Programación';
      default:
        return role || 'Usuario';
    }
  };

  return (
    <header className="bg-[#363636] text-white h-16 flex items-center justify-between px-6 shrink-0 shadow-sm z-20">
      {/* Espacio reservado (antes buscador) */}
      <div className="flex items-center gap-3">
      </div>

      <div className="flex items-center gap-4">
        {/* Notificaciones */}
        <Link
          href="/notificaciones"
          className="relative p-2 text-gray-200 hover:text-white rounded-full hover:bg-white/10 transition"
          title="Notificaciones"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#F7931F] rounded-full animate-pulse" />
        </Link>

        {/* Perfil del usuario activo con icono de stickman de persona */}
        {currentUser ? (
          <div className="flex items-center gap-3 pl-3 border-l border-gray-600">
            <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center text-[#F7931F] border border-gray-500">
              <User className="w-5 h-5" />
            </div>

            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white leading-tight">{currentUser.nombre}</p>
              <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#F7931F]">
                {getRoleLabel(currentUser.rol)}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-300 hover:text-red-400 rounded-lg hover:bg-white/10 transition"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="bg-[#F7931F] hover:bg-[#e08316] text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5"
          >
            <User className="w-4 h-4" />
            <span>Iniciar Sesión</span>
          </Link>
        )}
      </div>
    </header>
  );
}
