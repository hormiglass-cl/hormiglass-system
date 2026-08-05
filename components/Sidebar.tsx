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
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Settings,
  CalendarDays,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Mantenemos desplegable para Calendarios solamente
  const [openCalendars, setOpenCalendars] = useState(
    ['/visitas', '/planificacion/calendario'].some((path) => pathname.startsWith(path))
  );

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

  const calendarsSubItems = [
    {
      label: 'Visitas a Terreno',
      href: '/visitas',
      icon: Calendar,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Planificación y Entregas',
      href: '/planificacion/calendario',
      icon: CalendarDays,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
  ];

  return (
    <aside
      className={`${
        collapsed ? 'w-20' : 'w-72'
      } bg-white text-[#363636] h-screen sticky top-0 border-r border-gray-200 flex flex-col justify-between p-4 shrink-0 shadow-sm transition-all duration-300 z-30 overflow-y-auto scrollbar-thin`}
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
        {/* Logo de la barra lateral */}
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
          {/* Dashboard */}
          <Link
            href="/"
            title={collapsed ? 'Dashboard' : undefined}
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
              pathname === '/' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <LayoutDashboard className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Dashboard</span>}
          </Link>

          {/* Clientes */}
          <Link
            href="/clientes"
            title={collapsed ? 'Clientes' : undefined}
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
              pathname === '/clientes' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <Users className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Clientes</span>}
          </Link>

          {/* Cotizaciones */}
          <Link
            href="/cotizaciones"
            title={collapsed ? 'Cotizaciones' : undefined}
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
              pathname === '/cotizaciones' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <FileText className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Cotizaciones</span>}
          </Link>

          {/* PIPELINE DE OPORTUNIDADES (Único Pipeline Unificado) */}
          <Link
            href="/ventas"
            title={collapsed ? 'Pipeline de Oportunidades' : undefined}
            className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
              pathname === '/ventas' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <TrendingUp className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Pipeline de Oportunidades</span>}
          </Link>

          {/* GRUPO: CALENDARIOS (Desplegable Mantenido) */}
          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => setOpenCalendars(!openCalendars)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                ['/visitas', '/planificacion/calendario'].some((path) => pathname.startsWith(path))
                  ? 'bg-orange-50/80 text-[#F7931F] border border-orange-200'
                  : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? 'Calendarios' : undefined}
            >
              <div className="flex items-center gap-3.5">
                <Calendar className="w-5 h-5 shrink-0 text-[#F7931F]" />
                {!collapsed && <span>Calendarios</span>}
              </div>
              {!collapsed && (
                openCalendars ? <ChevronUp className="w-4 h-4 text-[#F7931F]" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {(!collapsed && openCalendars) && (
              <div className="pl-4 space-y-1 border-l-2 border-orange-200 ml-5 my-1 animate-fadeIn">
                {calendarsSubItems.map((sub) => {
                  const SubIcon = sub.icon;
                  const isSubActive = pathname === sub.href;

                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
                        isSubActive
                          ? 'bg-[#F7931F] text-white shadow-sm'
                          : 'text-gray-600 hover:bg-orange-50 hover:text-[#F7931F]'
                      }`}
                    >
                      <SubIcon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{sub.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Pie de Barra Lateral */}
      <div className="pt-4 border-t border-gray-100 space-y-2">
        <Link
          href="/notificaciones"
          className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition relative ${
            pathname === '/notificaciones' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
          } ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Bell className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Notificaciones</span>}
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white font-mono text-[10px] font-black px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </Link>

        <Link
          href="/configuracion"
          className={`flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
            pathname === '/configuracion' ? 'bg-[#F7931F] text-white shadow-sm' : 'text-[#363636] hover:bg-orange-50 hover:text-[#F7931F]'
          } ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Settings className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Configuración</span>}
        </Link>

        {currentUser && !collapsed && (
          <div className="pt-2 flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-[#F7931F] text-white flex items-center justify-center font-black text-xs">
              {currentUser.nombre.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-extrabold text-[#363636] truncate">{currentUser.nombre}</p>
              <p className="text-[10px] text-gray-400 capitalize">{currentUser.rol}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
