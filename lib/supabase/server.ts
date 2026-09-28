import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authCookieName } from './config';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jvenwcupdllcqbxixcuo.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZW53Y3VwZGxsY3FieGl4Y3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIwNjYsImV4cCI6MjEwMDEzODA2Nn0.g6nY19lqbYeMZeh6vbjqSTS2nhZV3dsMkB_pEIv-Hfs';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    url,
    anonKey,
    {
      cookieOptions: { name: authCookieName },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component sin permiso de escritura — el middleware refresca la sesión.
          }
        },
      },
    }
  );
}
