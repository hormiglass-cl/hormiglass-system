'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
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
  LogOut,
  CalendarDays,
  ShoppingCart,
  Truck,
  UserCheck,
  Building2,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Mantenemos desplegable para Calendarios solamente
  const [openCalendars, setOpenCalendars] = useState(
    ['/visitas', '/planificacion/calendario', '/reventa/calendario'].some((path) => pathname.startsWith(path))
  );
  const [openAdministration, setOpenAdministration] = useState(
    pathname.startsWith('/administracion') || pathname.startsWith('/rrhh')
  );

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let ignore = false;

    if (!currentUser?.id) {
      setTimeout(() => {
        if (!ignore) setUnreadCount(0);
      }, 0);
      return;
    }

    const userId = currentUser.id;

    async function fetchUnreadNotifications() {
      try {
        const { count, error } = await supabase
          .from('notificaciones')
          .select('id', { count: 'exact', head: true })
          .eq('usuario_id', userId)
          .eq('leido', false);

        if (!ignore && !error && typeof count === 'number') {
          setUnreadCount(count);
        }
      } catch {
        // ignore
      }
    }

    fetchUnreadNotifications();

    const channelName = `sidebar_notifs_${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notificaciones',
          filter: `usuario_id=eq.${userId}`,
        },
        () => {
          fetchUnreadNotifications();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, supabase]);

  if (pathname === '/login') return null;

  const calendarsSubItems = [
    {
      label: 'Visitas a Terreno',
      href: '/visitas',
      icon: Calendar,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Producción y Logística',
      href: '/planificacion/calendario',
      icon: CalendarDays,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
    {
      label: 'Reventa y Logística',
      href: '/reventa/calendario',
      icon: Truck,
      roles: ['admin', 'ventas', 'finanzas', 'administracion', 'programacion'],
    },
  ];

  const empresaSubItems = [
    { label: 'Soc Comercial', href: '/administracion?empresa=comercial&seccion=cuentas_por_cobrar' },
    { label: 'Soc Transportes', href: '/administracion?empresa=transportes&seccion=cuentas_por_cobrar' },
    { label: 'Soc Inmobiliaria', href: '/administracion?empresa=inmobiliaria&seccion=cuentas_por_cobrar' },
  ];

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
    router.refresh();
  };

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-white text-[#213343] h-screen sticky top-0 border-r border-gray-200 flex flex-col justify-between p-3 shrink-0 transition-all duration-300 z-30 relative overflow-visible`}
    >
      {/* Botón para Desplegar / Contraer Barra Lateral */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 bg-white text-gray-600 w-6 h-6 rounded-md border border-gray-200 hover:text-[#f97316] hover:border-orange-200 transition z-50 flex items-center justify-center"
        title={collapsed ? 'Desplegar Menú' : 'Contraer Menú'}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 flex flex-col justify-between">
        <div>
          {/* Logo de la barra lateral */}
          <div className="flex items-center justify-center px-2 py-3 mb-3 border-b border-gray-100 min-h-[58px]">
            {collapsed ? (
              <Image
                src="/logo-only-h-removebg-preview.png"
                alt="Hormiglass H"
                width={46}
                height={46}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <div className="text-left w-full flex items-center justify-start">
                <Image
                  src="/logo-completo-hormiglass.webp"
                  alt="Hormiglass Logo"
                  width={220}
                  height={55}
                  className="h-9 w-auto object-contain"
                  priority
                />
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="px-2 py-1.5 text-[11px] font-extrabold text-gray-400 uppercase">
              Navegación Principal
            </div>
          )}

          <nav className="mt-1 space-y-1">
            {/* Si es mano_obra, solo ve RRHH, Calendarios y Notificaciones */}
            {currentUser?.rol !== 'mano_obra' && (
              <>
                {/* Dashboard */}
                <Link
                  href="/"
                  title={collapsed ? 'Dashboard' : undefined}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                    pathname === '/' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <LayoutDashboard className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Dashboard</span>}
                </Link>

                {/* Clientes */}
                <Link
                  href="/clientes"
                  title={collapsed ? 'Clientes' : undefined}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                    pathname === '/clientes' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <Users className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Clientes</span>}
                </Link>

                {/* Cotizaciones */}
                <Link
                  href="/cotizaciones"
                  title={collapsed ? 'Cotizaciones' : undefined}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                    pathname === '/cotizaciones' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <FileText className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Cotizaciones</span>}
                </Link>

                <Link
                  href="/ordenes-compra"
                  title={collapsed ? 'Ordenes de Compra' : undefined}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                    pathname.startsWith('/ordenes-compra') ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <ShoppingCart className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Ordenes de Compra</span>}
                </Link>

                {/* PIPELINE (Único Pipeline Unificado) */}
                <Link
                  href="/ventas"
                  title={collapsed ? 'Pipeline' : undefined}
                  className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                    pathname === '/ventas' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                  } ${collapsed ? 'justify-center px-0' : ''}`}
                >
                  <TrendingUp className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>Pipeline</span>}
                </Link>
              </>
            )}

            {/* GRUPO: ADMINISTRACIÓN */}
            <div className="space-y-1 pt-1">
              <button
                type="button"
                onClick={() => setOpenAdministration(!openAdministration)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-bold transition ${
                  pathname.startsWith('/administracion') || pathname.startsWith('/rrhh')
                    ? 'bg-orange-50 text-[#f97316] border border-orange-200'
                    : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? 'Administración' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 shrink-0 text-[#f97316]" />
                  {!collapsed && <span>Administración</span>}
                </div>
                {!collapsed && (
                  openAdministration ? <ChevronUp className="w-4 h-4 text-[#f97316]" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {(!collapsed && openAdministration) && (
                <div className="pl-3 space-y-0.5 border-l border-gray-200 ml-4 my-1">
                  <Link
                    href="/administracion/rrhh"
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition ${
                      pathname.startsWith('/administracion/rrhh') || pathname.startsWith('/rrhh')
                        ? 'bg-orange-50 text-[#f97316]'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#f97316]'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span className="truncate">Recursos Humanos</span>
                  </Link>

                  <div className="pt-1 space-y-1">
                    <p className="px-2.5 py-1 text-[10px] font-black uppercase text-gray-400">Empresas</p>
                    {empresaSubItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition text-gray-600 hover:bg-gray-50 hover:text-[#f97316]"
                      >
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* GRUPO: CALENDARIOS (Desplegable Mantenido) */}
            <div className="space-y-1 pt-1">
              <button
                type="button"
                onClick={() => setOpenCalendars(!openCalendars)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-bold transition ${
                  ['/visitas', '/planificacion/calendario'].some((path) => pathname.startsWith(path))
                    ? 'bg-orange-50 text-[#f97316] border border-orange-200'
                    : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
                } ${collapsed ? 'justify-center px-0' : ''}`}
                title={collapsed ? 'Calendarios' : undefined}
              >
                <div className="flex items-center gap-3.5">
                  <Calendar className="w-5 h-5 shrink-0 text-[#f97316]" />
                  {!collapsed && <span>Calendarios</span>}
                </div>
                {!collapsed && (
                  openCalendars ? <ChevronUp className="w-4 h-4 text-[#f97316]" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {(!collapsed && openCalendars) && (
                <div className="pl-3 space-y-0.5 border-l border-gray-200 ml-4 my-1">
                  {calendarsSubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive = pathname === sub.href;

                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition ${
                          isSubActive
                            ? 'bg-orange-50 text-[#f97316]'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-[#f97316]'
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
        <div className="pt-3 border-t border-gray-100 space-y-1 mt-3">
          <Link
            href="/notificaciones"
            className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition relative ${
              pathname === '/notificaciones' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <Bell className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Notificaciones</span>}
            {unreadCount > 0 && (
              <span className="ml-auto bg-red-500 text-white font-mono text-[10px] font-black px-1.5 py-0.5 rounded-md">
                {unreadCount}
              </span>
            )}
          </Link>

          {currentUser?.rol !== 'mano_obra' && (
            <Link
              href="/configuracion"
              className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-bold transition ${
                pathname === '/configuracion' ? 'bg-orange-50 text-[#f97316] border border-orange-200' : 'text-[#213343] hover:bg-gray-50 hover:text-[#f97316]'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Settings className="w-5 h-5 shrink-0" />
              {!collapsed && <span>Configuración</span>}
            </Link>
          )}

          {currentUser && (
            <div className={`pt-2 flex items-center gap-2 px-2 ${collapsed ? 'justify-center px-0' : ''}`}>
              <div className="w-8 h-8 rounded-md bg-orange-50 text-[#f97316] border border-orange-100 flex items-center justify-center font-black text-xs">
                {currentUser.nombre.charAt(0)}
              </div>
              {!collapsed && (
                <>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <p className="text-xs font-extrabold text-[#213343] truncate">{currentUser.nombre}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{currentUser.rol}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="p-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition"
                    title="Cerrar Sesión"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
