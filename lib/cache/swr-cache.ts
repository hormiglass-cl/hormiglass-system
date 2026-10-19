'use client';

/**
 * Caché en memoria de alto rendimiento para el CRM Hormiglass.
 * Implementa Stale-While-Revalidate (SWR):
 * 1. Si los datos ya fueron consultados, se entregan de inmediato (0ms de latencia).
 * 2. La página se muestra renderizada de inmediato sin pantallas en blanco ni spinners lentos.
 * 3. En segundo plano se consulta a Supabase y se actualiza el estado de forma transparente.
 * 4. Suscripciones Realtime y mutaciones invalidan la clave correspondiente.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry<unknown>>();

// TTL por defecto: 60 segundos antes de considerar los datos totalmente expirados
const DEFAULT_TTL_MS = 60_000;

export const swrCache = {
  get<T>(key: string, maxAgeMs: number = DEFAULT_TTL_MS): T | null {
    const entry = memoryStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const isExpired = Date.now() - entry.timestamp > maxAgeMs;
    // En SWR devolvemos los datos para render inmediato incluso si están desactualizados
    return entry.data;
  },

  has(key: string): boolean {
    return memoryStore.has(key);
  },

  set<T>(key: string, data: T): void {
    memoryStore.set(key, {
      data,
      timestamp: Date.now(),
    });
  },

  invalidate(keyOrPrefix: string): void {
    for (const key of memoryStore.keys()) {
      if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
        memoryStore.delete(key);
      }
    }
  },

  clear(): void {
    memoryStore.clear();
  },
};
