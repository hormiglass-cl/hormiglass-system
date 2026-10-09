import {
  Bell, Briefcase, Building2, CalendarDays, CalendarRange, ChartNoAxesCombined, Container,
  ContactRound, Factory, FileText, FolderKanban, Handshake, Landmark, LayoutDashboard, MapPin,
  Package, Settings2, ShieldAlert, ShoppingCart, Truck, UserCog, Users, Wallet,
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
  items: NavItem[];
  /** Grupo plegable en la barra lateral (sidebars.md › disclosure controls). */
  collapsible?: boolean;
};

const ADMIN_FINANZAS: UserRole[] = ['admin', 'finanzas'];
const TODOS_MENOS_CAMPO: UserRole[] = ['admin', 'user', 'finanzas'];

export const NAV_GROUPS: NavGroup[] = [
  { id: 'inicio', label: 'Inicio', items: [
    { label: 'Panel operativo', href: '/', icon: LayoutDashboard, roles: TODOS_MENOS_CAMPO },
    { label: 'Pipeline de ventas', href: '/ventas', icon: FolderKanban, match: '/ventas', roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'comercial', label: 'Comercial', items: [
    { label: 'Clientes', href: '/clientes', icon: ContactRound, roles: TODOS_MENOS_CAMPO },
    { label: 'Cotizaciones', href: '/cotizaciones', icon: FileText, roles: TODOS_MENOS_CAMPO },
    { label: 'Postventa y garantías', href: '/postventa', icon: ShieldAlert, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'compras', label: 'Compras y catálogo', items: [
    { label: 'Órdenes de compra', href: '/ordenes-compra', icon: ShoppingCart, roles: TODOS_MENOS_CAMPO },
    { label: 'Proveedores', href: '/proveedores', icon: Handshake, roles: TODOS_MENOS_CAMPO },
    { label: 'Productos e insumos', href: '/productos', icon: Package, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'calendarios', label: 'Calendarios', collapsible: true, items: [
    { label: 'Vista general', href: '/calendarios/general', icon: CalendarDays },
    { label: 'Visitas a terreno', href: '/visitas', icon: MapPin },
    { label: 'Producción y logística', href: '/planificacion/calendario', icon: Factory },
    { label: 'Programa semanal', href: '/planificacion/semana', icon: CalendarRange },
    { label: 'Reventa y logística', href: '/reventa/calendario', icon: Container },
  ] },
  { id: 'finanzas', label: 'Finanzas', items: [
    { label: 'Caja', href: '/caja', icon: Wallet, roles: TODOS_MENOS_CAMPO },
    { label: 'Bancos y empresas', href: '/caja/configuracion', icon: Landmark, roles: ADMIN_FINANZAS },
    { label: 'Reportes', href: '/reportes', icon: ChartNoAxesCombined, roles: TODOS_MENOS_CAMPO },
  ] },
  { id: 'administracion', label: 'Administración', items: [
    { label: 'Sociedad Comercial', href: '/administracion?empresa=comercial&seccion=cuentas_por_cobrar', icon: Briefcase, roles: TODOS_MENOS_CAMPO },
    { label: 'Sociedad Transportes', href: '/administracion?empresa=transportes&seccion=cuentas_por_cobrar', icon: Truck, roles: TODOS_MENOS_CAMPO },
    { label: 'Sociedad Inmobiliaria', href: '/administracion?empresa=inmobiliaria&seccion=cuentas_por_cobrar', icon: Building2, roles: TODOS_MENOS_CAMPO },
    { label: 'Recursos humanos', href: '/rrhh', icon: Users },
  ] },
  { id: 'sistema', label: 'Sistema', items: [
    { label: 'Notificaciones', href: '/notificaciones', icon: Bell },
    { label: 'Configuración', href: '/configuracion', icon: Settings2, roles: TODOS_MENOS_CAMPO },
    { label: 'Usuarios', href: '/usuarios', icon: UserCog, roles: ['admin'] },
  ] },
];

/** Grupos visibles para un rol (los grupos vacíos desaparecen). */
export function navGroupsFor(role?: UserRole | null): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || (role && item.roles.includes(role))) }))
    .filter((group) => group.items.length > 0);
}

/** Ítem activo según la ruta actual; el más específico gana. */
export function findActiveItem(pathname: string, empresa: string | null, role?: UserRole | null) {
  const candidates = navGroupsFor(role).flatMap((group) => group.items.map((item) => ({ group, item })));
  let best: { group: NavGroup; item: NavItem; score: number } | null = null;
  for (const { group, item } of candidates) {
    const score = matchScore(item, pathname, empresa);
    if (score > (best?.score ?? 0)) best = { group, item, score };
  }
  return best;
}

function matchScore(item: NavItem, pathname: string, empresa: string | null) {
  const [path] = item.href.split('?');
  if (item.href.startsWith('/administracion?')) {
    return pathname === '/administracion' && item.href.includes(`empresa=${empresa || 'comercial'}&`) ? 1000 : 0;
  }
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
