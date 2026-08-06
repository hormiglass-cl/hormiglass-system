import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jvenwcupdllcqbxixcuo.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZW53Y3VwZGxsY3FieGl4Y3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIwNjYsImV4cCI6MjEwMDEzODA2Nn0.g6nY19lqbYeMZeh6vbjqSTS2nhZV3dsMkB_pEIv-Hfs';

let clientSingleton: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey);
  }
  if (!clientSingleton) {
    clientSingleton = createBrowserClient(url, anonKey);
  }
  return clientSingleton;
}
