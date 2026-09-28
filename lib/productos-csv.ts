import type { ProductoCatalogo } from './types';

export type ProductoCsv = Pick<ProductoCatalogo, 'codigo' | 'nombre' | 'categoria' | 'unidad' | 'precio_referencia' | 'costo_referencia' | 'descripcion' | 'activo'>;

function cells(line: string, separator: string): string[] {
  const result: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { result.push(value.trim()); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('Hay comillas sin cerrar en el CSV.');
  result.push(value.trim());
  return result;
}

export function parseProductosCsv(input: string): { rows: ProductoCsv[]; errors: string[] } {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ['El archivo está vacío.'] };
  const separator = lines[0].includes(';') ? ';' : ',';
  const headers = cells(lines[0], separator).map((value) => value.toLowerCase());
  const required = ['codigo', 'nombre', 'categoria', 'unidad', 'precio_referencia', 'costo_referencia'];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length) return { rows: [], errors: [`Faltan columnas: ${missing.join(', ')}.`] };
  const rows: ProductoCsv[] = [];
  const errors: string[] = [];
  const codes = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    try {
      const values = cells(lines[i], separator);
      const field = (name: string) => values[headers.indexOf(name)]?.trim() || '';
      const codigo = field('codigo').toUpperCase();
      const nombre = field('nombre');
      const categoria = field('categoria') as ProductoCsv['categoria'];
      const unidad = field('unidad');
      const precio = Number(field('precio_referencia').replace(',', '.'));
      const costo = Number(field('costo_referencia').replace(',', '.'));
      const active = field('activo').toLowerCase();
      if (!codigo || !nombre || !unidad || !['producto', 'insumo', 'servicio'].includes(categoria) ||
          !Number.isFinite(precio) || !Number.isFinite(costo) || precio < 0 || costo < 0 ||
          (active && !['true', 'false', 'si', 'sí', 'no', '1', '0'].includes(active))) {
        errors.push(`Fila ${i + 1}: código, nombre, categoría, unidad, precios o estado inválidos.`);
        continue;
      }
      if (codes.has(codigo)) { errors.push(`Fila ${i + 1}: código ${codigo} repetido.`); continue; }
      codes.add(codigo);
      rows.push({ codigo, nombre, categoria, unidad, precio_referencia: precio, costo_referencia: costo,
        descripcion: field('descripcion') || null, activo: !['false', 'no', '0'].includes(active) });
    } catch (error) { errors.push(`Fila ${i + 1}: ${error instanceof Error ? error.message : 'CSV inválido'}`); }
  }
  return { rows, errors };
}
