'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bell, Boxes, CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight,
  ClipboardList, ContactRound, FileText, FolderKanban, LayoutDashboard,
  LogOut, Package, Settings2, ShoppingCart, Truck, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { syncSeguimientoNotificaciones } from '../lib/seguimiento-notificaciones';

type NavItem = { label: string; href: string; icon: typeof LayoutDashboard; match?: string };
type NavGroup = { label: string; items: NavItem[] };

const mainGroups: NavGroup[] = [
  { label: 'Inicio', items: [{ label: 'Panel operativo', href: '/', icon: LayoutDashboard }] },
  { label: 'Pipelines', items: [
    { label: 'Pipeline de ventas', href: '/ventas', icon: FolderKanban, match: '/ventas' },
    { label: 'Planificación', href: '/planificacion', icon: ClipboardList, match: '/planificacion' },
    { label: 'Reventa', href: '/reventa', icon: Truck, match: '/reventa' },
  ] },
  { label: 'Comercial', items: [
    { label: 'Clientes', href: '/clientes', icon: ContactRound },
    { label: 'Cotizaciones', href: '/cotizaciones', icon: FileText },
  ] },
  { label: 'Compras y catálogo', items: [
    { label: 'Órdenes de compra', href: '/ordenes-compra', icon: ShoppingCart },
    { label: 'Proveedores', href: '/proveedores', icon: Boxes },
    { label: 'Productos e insumos', href: '/productos', icon: Package },
  ] },
];

const calendars: NavGroup = { label: 'Calendarios', items: [
  { label: 'Vista general', href: '/calendarios/general', icon: CalendarDays },
  { label: 'Visitas a terreno', href: '/visitas', icon: CalendarDays },
  { label: 'Producción y logística', href: '/planificacion/calendario', icon: CalendarDays },
  { label: 'Programa semanal', href: '/planificacion/semana', icon: CalendarDays },
  { label: 'Reventa y logística', href: '/reventa/calendario', icon: CalendarDays },
] };

const finance: NavGroup = { label: 'Finanzas', items: [
  { label: 'Caja', href: '/caja', icon: Wallet },
  { label: 'Reportes', href: '/reportes', icon: ChartNoAxesCombined },
] };

const administration: NavGroup = { label: 'Administración', items: [
  { label: 'Soc. Comercial', href: '/administracion?empresa=comercial&seccion=cuentas_por_cobrar', icon: Wallet },
  { label: 'Soc. Transportes', href: '/administracion?empresa=transportes&seccion=cuentas_por_cobrar', icon: Truck },
  { label: 'Soc. Inmobiliaria', href: '/administracion?empresa=inmobiliaria&seccion=cuentas_por_cobrar', icon: Boxes },
  { label: 'Recursos humanos', href: '/rrhh', icon: Users },
  { label: 'Recordatorios', href: '/recordatorios', icon: ClipboardList },
] };

const systemItems: NavItem[] = [
  { label: 'Notificaciones', href: '/notificaciones', icon: Bell },
  { label: 'Configuración', href: '/configuracion', icon: Settings2 },
];

export function Sidebar({ mobileOpen = false, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const isFieldWorker = currentUser?.rol === 'mano_obra';
  const system: NavGroup = { label: 'Sistema', items: isFieldWorker
    ? systemItems.slice(0, 1)
    : [...systemItems, ...(currentUser?.rol === 'admin' ? [{ label: 'Usuarios', href: '/usuarios', icon: Users }] : [])] };
  const groups = isFieldWorker
    ? [calendars, { ...administration, items: administration.items.slice(3) }, system]
    : [...mainGroups, calendars, finance, administration, system];

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    const userId = currentUser.id;
    async function refresh() {
      await syncSeguimientoNotificaciones(supabase, userId);
      const { count } = await supabase.from('notificaciones').select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId).eq('leido', false);
      if (active) setUnreadCount(count || 0);
    }
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    const channel = supabase.channel(`sidebar_notifs_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { active = false; window.clearInterval(interval); void supabase.removeChannel(channel); };
  }, [currentUser?.id, supabase]);

  if (pathname === '/login' || pathname.startsWith('/auth')) return null;

  function isActive(item: NavItem) {
    if (item.href.startsWith('/administracion?')) {
      return pathname === '/administracion' && item.href.includes(`empresa=${searchParams.get('empresa') || 'comercial'}&`);
    }
    if (item.href === '/') return pathname === '/';
    if (pathname === item.href) return true;
    if (item.match) return pathname.startsWith(item.match) &&
      !calendars.items.some((calendar) => calendar.href === pathname);
    return pathname.startsWith(`${item.href}/`);
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
    router.refresh();
  }

  return <>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-black/35 md:hidden" aria-label="Cerrar menú" onClick={onMobileClose} />}
    <aside className={`hg-app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#e5e7e4] bg-[#fbfbfa] transition-all duration-200 md:sticky md:top-0 md:h-screen ${collapsed ? 'w-[76px]' : 'w-[248px]'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#e5e7e4] px-4">
        <Link href="/" onClick={onMobileClose} className="flex min-w-0 items-center gap-2.5">
          <Image src="/logo-only-h-removebg-preview.png" alt="" width={38} height={38} className="h-9 w-9 object-contain" />
          {!collapsed && <span className="truncate text-[15px] font-extrabold tracking-tight">Hormiglass <span className="font-medium text-[#8a9390]">CRM</span></span>}
        </Link>
        <button type="button" onClick={onMobileClose} aria-label="Cerrar menú" className="rounded-lg p-1.5 text-[#66716f] hover:bg-[#f4f5f3] md:hidden"><X size={18} /></button>
      </div>
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => <div key={group.label} className="mb-5">
          {!collapsed && <h2 className="hg-overline mb-2 px-3">{group.label}</h2>}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return <Link key={item.href} href={item.href} onClick={onMobileClose} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}
                className={`flex min-h-9 items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-colors ${collapsed ? 'justify-center' : ''} ${active ? 'bg-[#f0eee9] text-[#252b2d]' : 'text-[#66716f] hover:bg-[#f4f5f3] hover:text-[#252b2d]'}`}>
                <Icon size={18} className={active ? 'text-[#e87622]' : 'text-[#7e8885]'} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.href === '/notificaciones' && unreadCount > 0 && <span className="ml-auto rounded-full bg-[#fff1e7] px-2 text-xs text-[#b45316]">{unreadCount}</span>}
              </Link>;
            })}
          </div>
        </div>)}
      </nav>
      <div className="shrink-0 border-t border-[#e5e7e4] p-3">
        <div className="mt-2 flex items-center gap-2 border-t border-[#e5e7e4] pt-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fff1e7] font-bold text-[#bd5b18]">{currentUser?.nombre?.charAt(0) || 'H'}</div>
          {!collapsed && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{currentUser?.nombre}</p><p className="text-[11px] capitalize text-[#8a9390]">{currentUser?.rol}</p></div><button onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className="rounded-lg p-2 text-[#66716f] hover:bg-[#f4f5f3]"><LogOut size={17} /></button></>}
        </div>
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} className="mt-3 hidden w-full justify-center rounded-lg border border-[#e5e7e4] py-1.5 text-[#66716f] hover:bg-white md:flex">{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      </div>
    </aside>
  </>;
}
