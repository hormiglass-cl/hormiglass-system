import { createBrowserClient } from '@supabase/ssr';
import { authCookieName } from './config';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jvenwcupdllcqbxixcuo.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZW53Y3VwZGxsY3FieGl4Y3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIwNjYsImV4cCI6MjEwMDEzODA2Nn0.g6nY19lqbYeMZeh6vbjqSTS2nhZV3dsMkB_pEIv-Hfs';

/**
 * Fetch tolerante a cortes de red: si la conexión falla (sin internet, recarga
 * de la página con peticiones en vuelo, suspensión del equipo), devuelve un 503
 * en vez de lanzar "TypeError: Failed to fetch". Así las consultas devuelven
 * `{ error }` y los refrescos periódicos reintentan solos sin ensuciar la consola.
 */
const fetchTolerante: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      return new Response(JSON.stringify({ message: 'Sin conexión con el servidor.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw error;
  }
};

let clientSingleton: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey);
  }
  if (!clientSingleton) {
    clientSingleton = createBrowserClient(url, anonKey, {
      // Evita reutilizar la sesión heredada y comparte el nombre con el servidor.
      cookieOptions: { name: authCookieName },
      global: { fetch: fetchTolerante },
    });
  }
  return clientSingleton;
}
