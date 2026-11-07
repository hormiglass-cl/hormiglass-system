import {
  Bell, Building2, CalendarDays,
  ContactRound, FileText, FolderKanban, Handshake, Landmark, LayoutDashboard,
  Boxes, Coins, Package, Settings2, ShieldAlert, Share2, ShoppingCart, TrendingUp, Users, Wallet,
} from 'lucide-react';
import type { UserRole } from './types';

/* Fuente única de navegación: barra lateral, migas de la cabecera y buscador ⌘K. */

export type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Prefijo de ruta que también activa el ítem (p. ej. /ventas/[id]). */
  match?: string;
  roles?: UserRole[];
};

export type NavGroup = {
  id: string;
  label: string;
  /** Ícono de la carpeta (se muestra con la barra contraída). */
  icon: typeof LayoutDashboard;
  items: NavItem[];
  /** Grupo plegable en la barra lateral (sidebars.md › disclosure controls). */
  collapsible?: boolean;
  /** Grupo de un solo enlace: se muestra suelto, sin carpeta. */
  flat?: boolean;
};

const TODOS_MENOS_CAMPO: UserRole[] = ['admin', 'user', 'finanzas', 'mano_obra'];

export const NAV_GROUPS: NavGroup[] = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard, collapsible: false, items: [
    { label: 'Panel operativo', href: '/', icon: LayoutDashboard, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'comercial', label: 'Comercial', icon: TrendingUp, collapsible: true, items: [
    { label: 'Pipeline de ventas', href: '/ventas', icon: FolderKanban, match: '/ventas', roles: TODOS_MENOS_CAMPO },
    { label: 'Clientes', href: '/clientes', icon: ContactRound, roles: TODOS_MENOS_CAMPO },
    { label: 'Cotizaciones', href: '/cotizaciones', icon: FileText, roles: TODOS_MENOS_CAMPO },
    { label: 'Postventa y garantías', href: '/postventa', icon: ShieldAlert, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'compras', label: 'Compras y catálogo', icon: Boxes, collapsible: true, items: [
    { label: 'Órdenes de compra', href: '/ordenes-compra', icon: ShoppingCart, roles: TODOS_MENOS_CAMPO },
    { label: 'Asignaciones', href: '/asignaciones', icon: Share2, roles: TODOS_MENOS_CAMPO },
    { label: 'Proveedores', href: '/proveedores', icon: Handshake, roles: TODOS_MENOS_CAMPO },
    { label: 'Productos e insumos', href: '/productos', icon: Package, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'calendarios', label: 'Calendarios', icon: CalendarDays, flat: true, items: [
    { label: 'Calendarios', href: '/calendarios/general', icon: CalendarDays, match: '/calendarios' },
  ] },
  { id: 'administracion', label: 'Administración y finanzas', icon: Landmark, collapsible: true, items: [
    { label: 'Caja', href: '/caja', icon: Wallet, roles: TODOS_MENOS_CAMPO },
    { label: 'Comisiones', href: '/comisiones', icon: Coins, roles: TODOS_MENOS_CAMPO },
    { label: 'Bancos y empresas', href: '/caja/configuracion', icon: Building2, roles: TODOS_MENOS_CAMPO },
    { label: 'Recursos humanos', href: '/rrhh', icon: Users },
  ] },
  { id: 'sistema', label: 'Sistema', icon: Settings2, collapsible: true, items: [
    { label: 'Notificaciones', href: '/notificaciones', icon: Bell },
    { label: 'Configuración', href: '/configuracion', icon: Settings2, roles: TODOS_MENOS_CAMPO },
  ] },
];

/** Grupos visibles para un rol (los grupos vacíos desaparecen). */
export function navGroupsFor(role?: UserRole | null): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))) }))
    .filter((group) => group.items.length > 0);
}

/** Ítem activo según la ruta actual; el más específico gana. */
export function findActiveItem(pathname: string, role?: UserRole | null) {
  const candidates = navGroupsFor(role).flatMap((group) => group.items.map((item) => ({ group, item })));
  let best: { group: NavGroup; item: NavItem; score: number } | null = null;
  for (const { group, item } of candidates) {
    const score = matchScore(item, pathname);
    if (score > (best?.score ?? 0)) best = { group, item, score };
  }
  return best;
}

function matchScore(item: NavItem, pathname: string) {
  const [path] = item.href.split('?');
  if (path === '/') return pathname === '/' ? 1000 : 0;
  if (pathname === path) return 1000;
  if (pathname.startsWith(`${path}/`)) return path.length;
  if (item.match && pathname.startsWith(item.match)) return item.match.length - 1;
  return 0;
}

/** Destinos del buscador ⌘K. */
export function navDestinations(role?: UserRole | null) {
  return navGroupsFor(role).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
}
