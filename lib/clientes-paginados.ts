import { createClient } from './supabase/client';
import { Cliente } from './types';

/** PostgREST limita las respuestas a 1.000 filas; el CRM necesita ver todo el directorio. */
export async function listarTodosLosClientes(
  supabase: ReturnType<typeof createClient>,
  orderBy = 'nombre',
  ascending = true,
): Promise<{ data: Cliente[]; error: null }> {
  const first = await supabase.from('clientes').select('*', { count: 'exact' })
    .order(orderBy, { ascending }).order('id', { ascending: true }).range(0, 999);
  if (first.error) throw first.error;
  const data: Cliente[] = [...((first.data || []) as Cliente[])];
  const total = first.count ?? data.length;
  for (let from = 1000; from < total; from += 4000) {
    const starts = Array.from({ length: Math.min(4, Math.ceil((total - from) / 1000)) }, (_, i) => from + i * 1000);
    const results = await Promise.all(starts.map((start) => supabase.from('clientes').select('*')
      .order(orderBy, { ascending }).order('id', { ascending: true }).range(start, start + 999)));
    for (const result of results) {
      if (result.error) throw result.error;
      data.push(...((result.data || []) as Cliente[]));
    }
  }
  return { data, error: null };
}
