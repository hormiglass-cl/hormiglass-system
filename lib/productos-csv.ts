import * as XLSX from 'xlsx';
import type { OrigenProducto } from './types';

export type ProductoImportado = {
  codigo: string;
  codigo_proveedor?: string | null;
  nombre: string;
  categoria: 'producto' | 'insumo' | 'servicio';
  familia?: string | null;
  subcategoria?: string | null;
  origen?: OrigenProducto | null;
  proveedor_id?: string | null;
  proveedor_nombre?: string | null;
  unidad: string;
  medidas?: string | null;
  color?: string | null;
  peso_kg?: number | null;
  precio_referencia: number;
  costo_referencia: number;
  descripcion?: string | null;
  observaciones?: string | null;
  requiere_revision?: boolean;
  activo: boolean;
};

export type ProductoCsv = ProductoImportado;

function cells(line: string, separator: string): string[] {
  const result: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      result.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('Hay comillas sin cerrar en el CSV.');
  result.push(value.trim());
  return result;
}

function resolveProveedorId(nombreOProveedor: string, proveedoresMap?: Record<string, string>): string | null {
  if (!proveedoresMap || !nombreOProveedor) return null;
  const clean = nombreOProveedor.trim().toUpperCase();
  for (const [key, id] of Object.entries(proveedoresMap)) {
    const keyClean = key.trim().toUpperCase();
    if (clean.includes(keyClean) || keyClean.includes(clean)) {
      return id;
    }
  }
  return null;
}

export function parseProductosCsv(
  input: string,
  proveedoresMap?: Record<string, string>
): { rows: ProductoImportado[]; errors: string[] } {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ['El archivo está vacío.'] };

  const separator = lines[0].includes(';') ? ';' : ',';
  const rawHeaders = cells(lines[0], separator);
  const headers = rawHeaders.map((value) => value.toLowerCase());

  // Detectar estilo de encabezado
  const isMaestroStyle = headers.some((h) => h.includes('código interno') || h.includes('codigo interno') || h.includes('precio ref'));

  const required = isMaestroStyle
    ? ['código interno', 'descripción']
    : ['codigo', 'nombre', 'categoria', 'unidad', 'precio_referencia', 'costo_referencia'];

  const missing = required.filter((field) => !headers.some((h) => h.includes(field)));
  if (missing.length && !isMaestroStyle) {
    return { rows: [], errors: [`Faltan columnas: ${missing.join(', ')}.`] };
  }

  const rows: ProductoImportado[] = [];
  const errors: string[] = [];
  const codes = new Set<string>();

  const getCol = (values: string[], ...aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = headers.findIndex((h) => h === alias || h.includes(alias));
      if (idx !== -1 && values[idx] !== undefined && values[idx].trim() !== '') {
        return values[idx].trim();
      }
    }
    return '';
  };

  for (let i = 1; i < lines.length; i += 1) {
    try {
      const values = cells(lines[i], separator);
      const codigoRaw = getCol(values, 'código interno', 'codigo interno', 'codigo').toUpperCase();
      const nombre = getCol(values, 'descripción', 'descripcion', 'nombre');
      const catField = getCol(values, 'categoría', 'categoria');
      const subcategoria = getCol(values, 'subcategoría / terminación', 'subcategoria');
      const codigoProveedor = getCol(values, 'código proveedor', 'codigo_proveedor');
      const medidas = getCol(values, 'medidas');
      const color = getCol(values, 'color');
      const unidad = getCol(values, 'unidad') || 'unidad';
      const observaciones = getCol(values, 'observaciones');
      const origenField = getCol(values, 'origen').toLowerCase();
      const proveedorNombre = getCol(values, 'proveedor');

      let categoria: ProductoImportado['categoria'] = 'producto';
      let familia: string | null = null;
      if (['producto', 'insumo', 'servicio'].includes(catField.toLowerCase())) {
        categoria = catField.toLowerCase() as ProductoImportado['categoria'];
      } else if (catField) {
        familia = catField;
      }

      const precioStr = getCol(values, 'precio ref. sin iva', 'precio ref', 'precio_referencia', 'precio')
        .replace(/\./g, '')
        .replace(',', '.');
      const precio = precioStr ? Number(precioStr) : 0;

      const costoStr = getCol(values, 'costo ref.', 'costo ref', 'costo_referencia', 'costo')
        .replace(/\./g, '')
        .replace(',', '.');
      const costo = costoStr ? Number(costoStr) : 0;

      const pesoStr = getCol(values, 'peso kg', 'peso_kg', 'peso').replace(',', '.');
      const peso = pesoStr ? Number(pesoStr) : null;

      const activeStr = getCol(values, 'activo').toLowerCase();
      const activo = !['false', 'no', '0', 'inactivo'].includes(activeStr);

      const origen: OrigenProducto = origenField.includes('fabricaci') ? 'fabricacion_propia' : 'reventa';
      const proveedorId = resolveProveedorId(proveedorNombre, proveedoresMap);

      const reqRevStr = getCol(values, 'requiere_revision').toLowerCase();
      const requiereRevision = reqRevStr === 'true' || reqRevStr === 'si' || reqRevStr === 'sí' ||
        proveedorNombre.toUpperCase().includes('BOTTAI') || (observaciones ? /revisar|ocr/i.test(observaciones) : false);

      const codigo = codigoRaw || `PROD-${String(i).padStart(4, '0')}`;

      if (!codigo || !nombre || !unidad || !['producto', 'insumo', 'servicio'].includes(categoria) ||
          !Number.isFinite(precio) || !Number.isFinite(costo) || precio < 0 || costo < 0 ||
          (activeStr && !['true', 'false', 'si', 'sí', 'no', '1', '0', 'activo', 'inactivo'].includes(activeStr))) {
        errors.push(`Fila ${i + 1}: código, nombre, categoría, unidad, precios o estado inválidos.`);
        continue;
      }

      if (codes.has(codigo)) {
        errors.push(`Fila ${i + 1}: código ${codigo} repetido.`);
        continue;
      }
      codes.add(codigo);

      rows.push({
        codigo,
        codigo_proveedor: codigoProveedor || null,
        nombre,
        categoria,
        familia: familia || getCol(values, 'familia') || null,
        subcategoria: subcategoria || null,
        origen,
        proveedor_id: proveedorId,
        proveedor_nombre: proveedorNombre || null,
        unidad,
        medidas: medidas || null,
        color: color || null,
        peso_kg: peso,
        precio_referencia: precio,
        costo_referencia: costo,
        descripcion: getCol(values, 'descripcion', 'descripción') || null,
        observaciones: observaciones || null,
        requiere_revision: !!requiereRevision,
        activo,
      });
    } catch (error) {
      errors.push(`Fila ${i + 1}: ${error instanceof Error ? error.message : 'CSV inválido'}`);
    }
  }

  return { rows, errors };
}

export function parseProductosExcel(
  buffer: ArrayBuffer | Uint8Array,
  proveedoresMap?: Record<string, string>
): { rows: ProductoImportado[]; errors: string[] } {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames.includes('Maestro productos')
      ? 'Maestro productos'
      : wb.SheetNames[0];
    if (!sheetName || !wb.Sheets[sheetName]) {
      return { rows: [], errors: ['El archivo Excel no contiene hojas de cálculo válidas.'] };
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
    if (!rawRows.length) {
      return { rows: [], errors: ['La hoja de cálculo está vacía.'] };
    }

    const rows: ProductoImportado[] = [];
    const errors: string[] = [];
    const seenCodes = new Map<string, number>();

    for (let i = 0; i < rawRows.length; i += 1) {
      const r = rawRows[i];

      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '') {
            return String(r[k]).trim();
          }
          const found = Object.keys(r).find((prop) => prop.trim().toLowerCase() === k.toLowerCase());
          if (found && r[found] !== undefined && r[found] !== null && String(r[found]).trim() !== '') {
            return String(r[found]).trim();
          }
        }
        return '';
      };

      let codigo = getVal('Código interno', 'codigo', 'Código', 'CODIGO').toUpperCase();
      let nombre = getVal('Descripción', 'nombre', 'Descripcion', 'DESCRIPCION');
      const categoriaExcel = getVal('Categoría', 'categoria', 'Familia', 'CATEGORIA');
      const subcategoria = getVal('Subcategoría / Terminación', 'subcategoria', 'Subcategoria');
      const codigoProveedor = getVal('Código proveedor', 'codigo_proveedor');
      const medidas = getVal('Medidas', 'medidas');
      const color = getVal('Color', 'color');
      const unidad = getVal('Unidad', 'unidad').toLowerCase() || 'unidad';
      const observaciones = getVal('Observaciones', 'observaciones');
      const origenRaw = getVal('Origen', 'origen').toLowerCase();
      const proveedorRaw = getVal('Proveedor', 'proveedor');

      if (!nombre && categoriaExcel) {
        nombre = `${categoriaExcel} ${codigoProveedor || 'Bottai'} (Revisión pendiente)`;
      } else if (!nombre) {
        nombre = `Producto ${codigo || (i + 1)}`;
      }

      if (!codigo) {
        codigo = `PROD-${String(i + 1).padStart(4, '0')}`;
      }

      // Desambiguar códigos repetidos con contador
      if (seenCodes.has(codigo)) {
        const count = (seenCodes.get(codigo) || 1) + 1;
        seenCodes.set(codigo, count);
        codigo = `${codigo}-${count}`;
      } else {
        seenCodes.set(codigo, 1);
      }

      const origen: OrigenProducto = origenRaw.includes('fabricaci') ? 'fabricacion_propia' : 'reventa';
      const proveedorId = resolveProveedorId(proveedorRaw, proveedoresMap);

      const precioRaw = getVal('Precio ref. sin IVA', 'precio_referencia', 'precio')
        .replace(/\./g, '')
        .replace(',', '.');
      const precio = Number(precioRaw) || 0;

      const costoRaw = getVal('Costo ref.', 'costo_referencia', 'costo')
        .replace(/\./g, '')
        .replace(',', '.');
      const costo = Number(costoRaw) || 0;

      const pesoRaw = getVal('Peso kg', 'peso_kg', 'peso').replace(',', '.');
      const peso = Number(pesoRaw) || null;

      const requiereRevisionVal = getVal('requiere_revision').toLowerCase();
      const requiereRevision = requiereRevisionVal === 'true' || requiereRevisionVal === 'si' || requiereRevisionVal === 'sí' ||
        proveedorRaw.toUpperCase().includes('BOTTAI') || (observaciones ? /revisar|ocr/i.test(observaciones) : false);

      const activoVal = getVal('activo', 'Activo').toLowerCase();
      const activo = !['false', 'no', '0', 'inactivo'].includes(activoVal);

      rows.push({
        codigo,
        codigo_proveedor: codigoProveedor || null,
        nombre,
        categoria: 'producto',
        familia: categoriaExcel || null,
        subcategoria: subcategoria || null,
        origen,
        proveedor_id: proveedorId,
        proveedor_nombre: proveedorRaw || null,
        unidad,
        medidas: medidas || null,
        color: color || null,
        peso_kg: peso,
        precio_referencia: precio,
        costo_referencia: costo,
        descripcion: getVal('descripcion', 'descripción') || null,
        observaciones: observaciones || null,
        requiere_revision: !!requiereRevision,
        activo,
      });
    }

    return { rows, errors };
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : 'Error al procesar el archivo Excel.'] };
  }
}

export async function parseProductosFile(
  file: File,
  proveedoresMap?: Record<string, string>
): Promise<{ rows: ProductoImportado[]; errors: string[] }> {
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
    file.type.includes('spreadsheet') || file.type.includes('excel');
  if (isExcel) {
    const buffer = await file.arrayBuffer();
    return parseProductosExcel(buffer, proveedoresMap);
  }
  const text = await file.text();
  return parseProductosCsv(text, proveedoresMap);
}
