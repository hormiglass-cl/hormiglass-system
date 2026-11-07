import type { OrigenProducto, ProductoCatalogo } from './types';

/** Abreviatura de 3 letras por familia para el código interno (HG-PAS-001). */
const FAMILIA_ABREV: Record<string, string> = {
  Adoquines: 'ADO',
  Baldosas: 'BAL',
  Bardas: 'BAR',
  Barreras: 'BRR',
  Bloques: 'BLO',
  'Bordes de piscina': 'BOR',
  Cajones: 'CAJ',
  Cámaras: 'CAM',
  Canaletas: 'CAN',
  Maceteros: 'MAC',
  Muros: 'MUR',
  'Otros vibrados': 'OTV',
  Pastelones: 'PAS',
  Pigmentos: 'PIG',
  Placas: 'PLA',
  Postes: 'POS',
  Rompeolas: 'ROM',
  Soleras: 'SOL',
  Tubos: 'TUB',
};

function soloLetras(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function abreviaturaFamilia(familia: string): string {
  const limpia = familia.trim();
  if (!limpia) return 'OTR';
  return FAMILIA_ABREV[limpia] ?? (soloLetras(limpia).slice(0, 3).padEnd(3, 'X') || 'OTR');
}

/** Iniciales del proveedor: Bottai → BOT, MACBAL → MAC, Atrio Baldosas → ATR. */
export function prefijoProveedor(nombre: string): string {
  return soloLetras(nombre).slice(0, 3).padEnd(3, 'X');
}

/** Prefijo completo del código: HG-PAS (fabricación propia) o BOT-TUB (reventa de Bottai). */
export function prefijoCodigo(origen: OrigenProducto, proveedorNombre: string | undefined, familia: string): string {
  const origenPref = origen === 'fabricacion_propia' ? 'HG' : prefijoProveedor(proveedorNombre ?? '') || 'PRV';
  return `${origenPref}-${abreviaturaFamilia(familia)}`;
}

/** Siguiente número libre para un prefijo, p. ej. si HG-PAS llega a 120 sugiere HG-PAS-121. */
export function siguienteCodigo(prefijo: string, codigosExistentes: string[]): { codigo: string; ultimo: string | null } {
  const patron = new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let maximo = 0;
  let ultimo: string | null = null;
  for (const codigo of codigosExistentes) {
    const m = patron.exec(codigo);
    if (m && Number(m[1]) >= maximo) {
      maximo = Number(m[1]);
      ultimo = codigo;
    }
  }
  return { codigo: `${prefijo}-${String(maximo + 1).padStart(3, '0')}`, ultimo };
}

/** Nombre legible para selectores: "Baldosa lisa pulida · 40 x 40 cm · Gris". */
export function etiquetaProducto(p: Pick<ProductoCatalogo, 'nombre' | 'medidas' | 'color'>): string {
  return [p.nombre, p.medidas, p.color].filter((parte) => parte && String(parte).trim()).join(' · ');
}
