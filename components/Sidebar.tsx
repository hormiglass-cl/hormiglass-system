'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import {
  LayoutDashboard,
  Users,
  FileText,
  TrendingUp,
  Bell,
  UserCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const supabase = createClient();

  useEffect(() => {
    let ignore = false;
    async function fetchUnreadNotifications() {
      try {
        const { count, error } = await supabase
          .from('notificaciones')
          .select('id', { count: 'exact', head: true })
          .eq('leido', false);

        if (!ignore && !error && typeof count === 'number') {
          setUnreadCount(count);
        }
      } catch {
        // ignore
      }
    }

    fetchUnreadNotifications();
    const interval = setInterval(fetchUnreadNotifications, 8000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  if (pathname === '/login') return null;

  const navItems = [
    {
      label: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Clientes',
      href: '/clientes',
      icon: Users,
      roles: ['admin', 'ventas', 'administracion'],
    },
    {
      label: 'Cotizaciones',
      href: '/cotizaciones',
      icon: FileText,
      roles: ['admin', 'ventas'],
    },
    {
      label: 'Pipeline de Ventas',
      href: '/ventas',
      icon: TrendingUp,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Notificaciones',
      href: '/notificaciones',
      icon: Bell,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Configuración',
      href: '/configuracion',
      icon: Settings,
      roles: ['admin'],
      isOrange: true,
    },
  ];

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-72'
      } bg-white text-[#363636] h-screen sticky top-0 border-r border-gray-200 flex flex-col justify-between p-4 shrink-0 shadow-sm transition-all duration-300 z-30`}
    >
      {/* Botón para Desplegar / Contraer Barra Lateral */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-7 bg-[#363636] text-white p-1 rounded-full border border-white shadow-md hover:bg-[#F7931F] transition z-40"
        title={collapsed ? 'Desplegar Menú' : 'Contraer Menú'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div>
        {/* Logo de la barra lateral según estado */}
        <div className="flex items-center justify-center p-2 mb-6 border-b border-gray-100 min-h-[70px]">
          {collapsed ? (
            <Image
              src="/logo-only-h-removebg-preview.png"
              alt="Hormiglass H"
              width={46}
              height={46}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <div className="text-left w-full flex items-center justify-start">
              <Image
                src="/logo-completo-hormiglass.webp"
                alt="Hormiglass Logo"
                width={220}
                height={55}
                className="h-11 w-auto object-contain"
                priority
              />
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 py-1.5 text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
            Navegación Principal
          </div>
        )}

        <nav className="mt-2 space-y-1.5">
          {navItems.map((item) => {
            const isAllowed = currentUser?.rol === 'admin' || item.roles.includes(currentUser?.rol || '');
            if (!isAllowed) return null;

            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-xs font-bold transition relative ${
                  isActive
                    ? 'bg-[#F7931F] text-white shadow-sm'
                    : item.isOrange
                    ? 'text-[#F7931F] bg-orange-50/70 hover:bg-[#F7931F] hover:text-white border border-orange-200'
                    : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
                } ${collapsed ? 'justify-center px-0' : ''}`}
              >
                <div className="relative shrink-0">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.isOrange ? 'text-[#F7931F]' : 'text-gray-500'}`} />
                  {collapsed && item.href === '/notificaciones' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.href === '/notificaciones' && unreadCount > 0 && (
                      <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white text-[#F7931F]' : 'bg-[#F7931F] text-white'
                      }`}>
                        {unreadCount}
                      </span>
                    )}
                    {item.href === '/usuarios' && (
                      <span className="ml-auto text-[9px] bg-[#363636] text-white font-extrabold px-1.5 py-0.5 rounded">
                        ADMIN
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
