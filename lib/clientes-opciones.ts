'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from './supabase/client';
import type { SearchSelectOption } from '../components/ui/SearchSelect';

type FilaCliente = { id: string; nombre: string; apellido_razon_social: string | null; rut: string | null };

const COLUMNAS = 'id, nombre, apellido_razon_social, rut';
const LIMITE = 30;

/**
 * Opciones de cliente para un selector con búsqueda en el servidor.
 * Evita descargar el directorio completo: carga 30 resultados y consulta al escribir.
 */
export function useClienteOpciones(
  seleccionadoId: string,
  etiqueta: (c: FilaCliente) => string = (c) => c.apellido_razon_social || c.nombre,
) {
  const supabase = useMemo(() => createClient(), []);
  const [filas, setFilas] = useState<FilaCliente[]>([]);
  const [seleccionado, setSeleccionado] = useState<FilaCliente | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const peticion = useRef(0);

  const buscar = useCallback((texto: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const n = ++peticion.current;
      const term = texto.trim().replace(/[,()%*]/g, ' ').replace(/\s+/g, ' ').trim();
      let q = supabase.from('clientes').select(COLUMNAS);
      if (term) {
        const rut = term.replace(/\./g, '');
        q = q.or(`nombre.ilike.%${term}%,apellido_razon_social.ilike.%${term}%,rut.ilike.%${rut}%`);
      }
      const { data } = await q.order('nombre').limit(LIMITE);
      if (n === peticion.current) setFilas((data || []) as FilaCliente[]);
    }, texto ? 250 : 0);
  }, [supabase]);

  useEffect(() => {
    buscar('');
    return () => window.clearTimeout(timer.current);
  }, [buscar]);

  // Mantiene visible el cliente ya elegido aunque no esté entre los resultados.
  useEffect(() => {
    if (!seleccionadoId) return;
    let vivo = true;
    void (async () => {
      const { data } = await supabase.from('clientes').select(COLUMNAS).eq('id', seleccionadoId).maybeSingle();
      if (vivo) setSeleccionado((data as FilaCliente | null) ?? null);
    })();
    return () => {
      vivo = false;
    };
  }, [supabase, seleccionadoId]);

  const opciones = useMemo<SearchSelectOption[]>(() => {
    const base = [...filas];
    if (seleccionado && seleccionado.id === seleccionadoId && !base.some((c) => c.id === seleccionado.id)) {
      base.unshift(seleccionado);
    }
    return base.map((c) => ({ value: c.id, label: etiqueta(c), hint: c.rut || undefined }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- la etiqueta es estable por uso
  }, [filas, seleccionado, seleccionadoId]);

  return { opciones, onSearch: buscar };
}
