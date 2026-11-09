import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieName } from './lib/supabase/config';

// Rutas accesibles sin sesión activa.
const PUBLIC_PATHS = ['/login'];
const AUTH_FLOW_PREFIX = '/auth';

const API_PREFIX = '/api';

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || pathname.startsWith(AUTH_FLOW_PREFIX) || pathname.startsWith(API_PREFIX);
}

interface CachedAuth {
  user: { id: string } | null;
  perfil: { activo: boolean; rol: string } | null;
  expiresAt: number;
}

const authCache = new Map<string, CachedAuth>();
const CACHE_TTL_MS = 45_000; // 45 segundos de cache en memoria

function getAuthCookieSignature(request: NextRequest): string {
  return request.cookies
    .getAll()
    .filter((c) => c.name.startsWith(authCookieName))
    .map((c) => `${c.name}=${c.value.slice(0, 32)}`)
    .sort()
    .join(';');
}

/**
 * Protección de rutas a nivel de servidor (Next.js Proxy/Middleware).
 * Optimizado con caché en memoria para eliminar latencia en navegación interna.
 */
export async function proxy(request: NextRequest) {
  // This exact service endpoint authenticates raw bytes with HMAC, never cookies.
  // Keep before cookie reads/client creation (the legacy client has a prod fallback).
  if (request.nextUrl.pathname === '/api/integrations/whatsapp/events') {
    return NextResponse.next({ request });
  }
  let supabaseResponse = NextResponse.next({ request });
  const { pathname } = request.nextUrl;
  const publicPath = isPublicPath(pathname);
  const authSig = getAuthCookieSignature(request);

  // Fast-path: si no hay cookies de sesión y la ruta es privada, redirigir a /login sin llamadas externas
  if (!authSig && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Fast-path: si no hay cookies de sesión y es ruta pública, permitir de inmediato
  if (!authSig && publicPath) {
    return supabaseResponse;
  }

  const now = Date.now();
  const cached = authCache.get(authSig);
  let user: { id: string } | null = null;
  let perfil: { activo: boolean; rol: string } | null = null;

  if (cached && cached.expiresAt > now) {
    user = cached.user;
    perfil = cached.perfil;
  } else {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jvenwcupdllcqbxixcuo.supabase.co';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZW53Y3VwZGxsY3FieGl4Y3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIwNjYsImV4cCI6MjEwMDEzODA2Nn0.g6nY19lqbYeMZeh6vbjqSTS2nhZV3dsMkB_pEIv-Hfs';

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookieOptions: { name: authCookieName },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser();

    user = supabaseUser ? { id: supabaseUser.id } : null;

    if (user) {
      const { data: perfilData } = await supabase
        .from('usuarios')
        .select('activo,rol')
        .eq('auth_id', user.id)
        .maybeSingle();

      perfil = perfilData ? { activo: perfilData.activo, rol: perfilData.rol } : null;
    }

    authCache.set(authSig, {
      user,
      perfil,
      expiresAt: now + CACHE_TTL_MS,
    });

    if (authCache.size > 200) {
      for (const [k, v] of authCache.entries()) {
        if (v.expiresAt <= now) authCache.delete(k);
      }
    }
  }

  if (!user && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Sesión válida pero el perfil está inactivo/desactivado → fuera.
  if (user && !publicPath) {
    if (!perfil || perfil.activo === false) {
      authCache.delete(authSig);
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'inactivo');
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo-.*|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)',
  ],
};
