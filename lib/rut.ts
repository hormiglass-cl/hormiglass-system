import { validarRutChileno } from './proveedores-csv';

/** Da formato 12.345.678-9 mientras se escribe (solo dígitos y K; el último carácter es el DV). */
export function formatearRutEnVivo(valor: string): string {
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}

/** Devuelve un mensaje de error o null si el RUT es válido (Módulo 11 estricto). */
export function errorDeRut(valor: string): string | null {
  if (!valor.trim()) return 'El RUT es obligatorio.';
  const r = validarRutChileno(valor, { estricto: true });
  return r.valido ? null : r.mensaje;
}
