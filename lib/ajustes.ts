'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from './supabase/client';

/** Valores por defecto de cada ajuste; lo guardado se mezcla encima, así que agregar campos nunca rompe. */
export const AJUSTES_DEFAULT = {
  empresa: {
    razon_social: 'Sociedad Comercial y de Transportes Valverde e Hijos Ltda.',
    nombre_fantasia: 'Hormiglass',
    rut: '',
    giro: '',
    direccion: '',
    telefono: '',
    correo: '',
    sitio_web: '',
  },
  cotizaciones: {
    iva_porcentaje: 19,
    validez_dias: 30,
    condicion_pago: 'Acuse de recibo',
    condiciones_comerciales: '',
    nota_pie: '',
  },
  comisiones: {
    porcentaje_defecto: 3,
  },
  origenes: {
    lista: ['WhatsApp', 'Webmail', 'Llamado', 'Visita presencial', 'Referido', 'Cliente recurrente', 'Manual'],
  },
  tipos_venta: {
    lista: ['Instalación', 'Suministro', 'Reventa de Material'],
  },
  avisos: {
    seguimiento_activo: true,
    conservar_leidos_dias: 30,
  },
  recordatorios: {
    anticipacion_horas: 24,
  },
  pipeline_etapas: {
    /** Nombre personalizado por id de etapa; vacío = nombre original. */
    nombres: {} as Record<string, string>,
  },
} as const;

/** Etapas del pipeline con su nombre original (los ids no se pueden cambiar). */
export const ETAPAS_PIPELINE: { seccion: string; id: string; label: string }[] = [
  { seccion: 'Comercial y ventas', id: 'nueva', label: 'Nueva Oportunidad' },
  { seccion: 'Comercial y ventas', id: 'pagada', label: 'Pago Validado' },
  { seccion: 'Comercial y ventas', id: 'programada', label: 'En Programación' },
  { seccion: 'Comercial y ventas', id: 'entregada', label: 'Venta Aprobada' },
  { seccion: 'Producción y logística', id: 'prod_pendiente', label: 'Pendiente Planificación' },
  { seccion: 'Producción y logística', id: 'prod_cola', label: 'En Cola de Fabricación' },
  { seccion: 'Producción y logística', id: 'prod_fabricacion', label: 'En Fabricación' },
  { seccion: 'Producción y logística', id: 'prod_listo_instalacion', label: 'Listo p/ Instalación' },
  { seccion: 'Producción y logística', id: 'prod_instalacion', label: 'En Instalación' },
  { seccion: 'Producción y logística', id: 'prod_finalizado', label: 'Finalizado / Entregado' },
  { seccion: 'Reventa y logística', id: 'rev_coordinacion', label: 'Coordinación Proveedor' },
  { seccion: 'Reventa y logística', id: 'rev_stock', label: 'Confirmación Stock' },
  { seccion: 'Reventa y logística', id: 'rev_listo_retiro', label: 'Listo para Retiro' },
  { seccion: 'Reventa y logística', id: 'rev_listo_despacho', label: 'Listo para Despacho' },
  { seccion: 'Reventa y logística', id: 'rev_entregado', label: 'Entregado al Cliente' },
  { seccion: 'Reventa y logística', id: 'rev_postventa', label: 'Postventa & Seguimiento' },
];

export type AjusteClave = keyof typeof AJUSTES_DEFAULT;
type Valor<K extends AjusteClave> = { -readonly [P in keyof (typeof AJUSTES_DEFAULT)[K]]: (typeof AJUSTES_DEFAULT)[K][P] extends readonly string[] ? string[] : (typeof AJUSTES_DEFAULT)[K][P] extends boolean ? boolean : (typeof AJUSTES_DEFAULT)[K][P] extends number ? number : (typeof AJUSTES_DEFAULT)[K][P] extends Record<string, string> ? Record<string, string> : string };

const cache = new Map<string, unknown>();
const EVENTO = 'hg-ajustes-cambio';

function mezclar<K extends AjusteClave>(clave: K, guardado: unknown): Valor<K> {
  const base = AJUSTES_DEFAULT[clave] as unknown as Record<string, unknown>;
  const extra = guardado && typeof guardado === 'object' ? (guardado as Record<string, unknown>) : {};
  return { ...base, ...extra } as unknown as Valor<K>;
}

/** Lee un ajuste del sistema (con valores por defecto mientras carga) y permite guardarlo (solo admin por RLS). */
export function useAjuste<K extends AjusteClave>(clave: K) {
  const supabase = useMemo(() => createClient(), []);
  const [valor, setValor] = useState<Valor<K>>(() => mezclar(clave, cache.get(clave)));
  const [cargando, setCargando] = useState(!cache.has(clave));

  useEffect(() => {
    let ignorar = false;
    const alCambiar = (e: Event) => {
      if ((e as CustomEvent<string>).detail === clave) setValor(mezclar(clave, cache.get(clave)));
    };
    window.addEventListener(EVENTO, alCambiar);
    if (!cache.has(clave)) {
      void supabase
        .from('ajustes_sistema')
        .select('valor')
        .eq('clave', clave)
        .maybeSingle()
        .then(({ data }: { data: { valor: unknown } | null }) => {
          if (ignorar) return;
          cache.set(clave, data?.valor ?? {});
          setValor(mezclar(clave, data?.valor));
          setCargando(false);
        });
    }
    return () => {
      ignorar = true;
      window.removeEventListener(EVENTO, alCambiar);
    };
  }, [clave, supabase]);

  const guardar = useCallback(
    async (nuevo: Valor<K>) => {
      const { error } = await supabase
        .from('ajustes_sistema')
        .upsert({ clave, valor: nuevo, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
      if (error) throw error;
      cache.set(clave, nuevo);
      setValor(nuevo);
      window.dispatchEvent(new CustomEvent(EVENTO, { detail: clave }));
    },
    [clave, supabase],
  );

  return { valor, guardar, cargando };
}
