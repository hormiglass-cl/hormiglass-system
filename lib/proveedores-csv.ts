import * as XLSX from 'xlsx';

export type ProveedorImportado = {
  rut: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  comuna?: string;
  region?: string;
  rubro?: string;
  advertencia?: string;
};

export type ValidacionRutResult = {
  valido: boolean;
  dvCorrecto: boolean;
  mensaje: string;
  dvEsperado: string;
  rutFormateado?: string;
  rutLimpio?: string;
  advertencia?: string;
};

/**
 * Validador de RUT chileno con algoritmo Módulo 11.
 * Si estricto=true, rechaza RUTs cuyo DV no coincida con Módulo 11.
 * Si estricto=false, valida estructura y formato, advirtiendo si el DV tiene discrepancia.
 */
export function validarRutChileno(
  rutRaw: string,
  options: { estricto?: boolean } = {}
): ValidacionRutResult {
  const { estricto = false } = options;

  if (!rutRaw || typeof rutRaw !== 'string') {
    return { valido: false, dvCorrecto: false, dvEsperado: '', mensaje: 'RUT vacío o no proporcionado' };
  }

  const clean = rutRaw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 8 || clean.length > 9) {
    return {
      valido: false,
      dvCorrecto: false,
      dvEsperado: '',
      mensaje: 'Largo de RUT incorrecto (debe tener entre 7 y 8 dígitos más DV)',
    };
  }

  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let suma = 0;
  let multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = suma % 11;
  let dvEsperado = (11 - resto).toString();
  if (dvEsperado === '11') dvEsperado = '0';
  if (dvEsperado === '10') dvEsperado = 'K';

  const dvCorrecto = dv === dvEsperado;
  const numPart = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const rutFormateado = `${numPart}-${dv}`;

  if (!dvCorrecto && estricto) {
    return {
      valido: false,
      dvCorrecto: false,
      dvEsperado,
      mensaje: `Dígito verificador inválido (debería ser ${dvEsperado})`,
    };
  }

  return {
    valido: true,
    dvCorrecto,
    dvEsperado,
    mensaje: dvCorrecto ? 'RUT válido' : `DV ingresado (${dv}) difiere del Módulo 11 (${dvEsperado})`,
    advertencia: !dvCorrecto ? `DV ingresado (${dv}) difiere del Módulo 11 (${dvEsperado})` : undefined,
    rutFormateado,
    rutLimpio: clean,
  };
}

function parseCsvCells(line: string, separator: string): string[] {
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
  if (quoted) throw new Error('Hay comillas sin cerrar en el archivo CSV.');
  result.push(value.trim());
  return result;
}

const HEADER_ALIASES: Record<keyof ProveedorImportado, string[]> = {
  rut: ['rut', 'r.u.t', 'r.u.t.', 'identificador', 'rut proveedor', 'rut empresa'],
  nombre: ['nombre', 'razón social', 'razon social', 'empresa', 'proveedor', 'nombre proveedor'],
  contacto: ['contacto', 'persona contacto', 'atención', 'atencion', 'encargado', 'vendedor'],
  telefono: ['teléfono', 'telefono', 'celular', 'fono', 'móvil', 'movil'],
  correo: ['correo', 'correo electrónico', 'correo electronico', 'email', 'e-mail'],
  direccion: ['dirección', 'direccion', 'domicilio', 'calle'],
  comuna: ['comuna', 'ciudad'],
  region: ['región', 'region'],
  rubro: ['rubro', 'giro', 'categoría', 'categoria', 'tipo'],
  advertencia: [],
};

function matchHeaderIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((h) => {
    const clean = h.trim().toLowerCase();
    return aliases.some((a) => clean === a || clean.includes(a));
  });
}

export type ParseProveedoresOptions = {
  estricto?: boolean;
};

/**
 * Parsea un array de objetos o filas crudas a ProveedorImportado[]
 */
export function parseProveedoresData(
  rowsData: Record<string, unknown>[],
  options: ParseProveedoresOptions = {}
): { rows: ProveedorImportado[]; errors: string[]; warnings: string[] } {
  if (!rowsData || rowsData.length === 0) {
    return { rows: [], errors: ['El archivo no contiene filas de datos.'], warnings: [] };
  }

  const rawHeaders = Object.keys(rowsData[0]);
  const headers = rawHeaders.map((k) => k.toLowerCase().trim());

  const rutIdx = matchHeaderIndex(headers, HEADER_ALIASES.rut);
  const nombreIdx = matchHeaderIndex(headers, HEADER_ALIASES.nombre);

  if (rutIdx === -1 || nombreIdx === -1) {
    return {
      rows: [],
      errors: [
        `El archivo debe contener al menos las columnas "RUT" y "Razón Social" (o "Nombre"). Columnas encontradas: ${rawHeaders.join(', ')}`,
      ],
      warnings: [],
    };
  }

  const contactoIdx = matchHeaderIndex(headers, HEADER_ALIASES.contacto);
  const telefonoIdx = matchHeaderIndex(headers, HEADER_ALIASES.telefono);
  const correoIdx = matchHeaderIndex(headers, HEADER_ALIASES.correo);
  const direccionIdx = matchHeaderIndex(headers, HEADER_ALIASES.direccion);
  const comunaIdx = matchHeaderIndex(headers, HEADER_ALIASES.comuna);
  const regionIdx = matchHeaderIndex(headers, HEADER_ALIASES.region);
  const rubroIdx = matchHeaderIndex(headers, HEADER_ALIASES.rubro);

  const rutKey = rawHeaders[rutIdx];
  const nombreKey = rawHeaders[nombreIdx];
  const contactoKey = contactoIdx !== -1 ? rawHeaders[contactoIdx] : null;
  const telefonoKey = telefonoIdx !== -1 ? rawHeaders[telefonoIdx] : null;
  const correoKey = correoIdx !== -1 ? rawHeaders[correoIdx] : null;
  const direccionKey = direccionIdx !== -1 ? rawHeaders[direccionIdx] : null;
  const comunaKey = comunaIdx !== -1 ? rawHeaders[comunaIdx] : null;
  const regionKey = regionIdx !== -1 ? rawHeaders[regionIdx] : null;
  const rubroKey = rubroIdx !== -1 ? rawHeaders[rubroIdx] : null;

  const rows: ProveedorImportado[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenRuts = new Set<string>();

  rowsData.forEach((row, i) => {
    const filaNum = i + 2; // Fila 1 es cabecera en hoja de cálculo
    const rawRut = String(row[rutKey] ?? '').trim();
    const rawNombre = String(row[nombreKey] ?? '').trim();

    // Saltar filas completamente en blanco
    if (!rawRut && !rawNombre) return;

    if (!rawNombre) {
      errors.push(`Fila ${filaNum}: Falta el nombre o razón social del proveedor.`);
      return;
    }

    if (!rawRut) {
      errors.push(`Fila ${filaNum} (${rawNombre}): Falta el RUT.`);
      return;
    }

    const valRut = validarRutChileno(rawRut, { estricto: options.estricto });
    if (!valRut.valido) {
      errors.push(`Fila ${filaNum} (${rawNombre}): RUT "${rawRut}" no es válido. ${valRut.mensaje}.`);
      return;
    }

    const cleanRut = valRut.rutLimpio!;
    if (seenRuts.has(cleanRut)) {
      errors.push(`Fila ${filaNum} (${rawNombre}): RUT "${valRut.rutFormateado}" está duplicado en el mismo archivo.`);
      return;
    }
    seenRuts.add(cleanRut);

    if (valRut.advertencia) {
      warnings.push(`Fila ${filaNum} (${rawNombre}): ${valRut.advertencia}`);
    }

    rows.push({
      rut: valRut.rutFormateado!,
      nombre: rawNombre,
      contacto: contactoKey && row[contactoKey] ? String(row[contactoKey]).trim() : undefined,
      telefono: telefonoKey && row[telefonoKey] ? String(row[telefonoKey]).trim() : undefined,
      correo: correoKey && row[correoKey] ? String(row[correoKey]).trim().toLowerCase() : undefined,
      direccion: direccionKey && row[direccionKey] ? String(row[direccionKey]).trim() : undefined,
      comuna: comunaKey && row[comunaKey] ? String(row[comunaKey]).trim() : undefined,
      region: regionKey && row[regionKey] ? String(row[regionKey]).trim() : undefined,
      rubro: rubroKey && row[rubroKey] ? String(row[rubroKey]).trim() : undefined,
      advertencia: valRut.advertencia,
    });
  });

  return { rows, errors, warnings };
}

/**
 * Parsea un archivo CSV en texto plano a ProveedorImportado[]
 */
export function parseProveedoresCsv(
  csvText: string,
  options: ParseProveedoresOptions = {}
): { rows: ProveedorImportado[]; errors: string[]; warnings: string[] } {
  const lines = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return { rows: [], errors: ['El archivo CSV está vacío.'], warnings: [] };

  const separator = lines[0].includes(';') ? ';' : ',';
  let rawHeaders: string[];
  try {
    rawHeaders = parseCsvCells(lines[0], separator);
  } catch (err: unknown) {
    return { rows: [], errors: [(err as Error).message], warnings: [] };
  }

  const dataRows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    try {
      const cells = parseCsvCells(lines[i], separator);
      const rowObj: Record<string, unknown> = {};
      rawHeaders.forEach((h, colIdx) => {
        rowObj[h] = cells[colIdx] ?? '';
      });
      dataRows.push(rowObj);
    } catch (err: unknown) {
      return { rows: [], errors: [`Fila ${i + 1}: ${(err as Error).message}`], warnings: [] };
    }
  }

  return parseProveedoresData(dataRows, options);
}

/**
 * Parsea un ArrayBuffer o Buffer de archivo (CSV o Excel) a ProveedorImportado[]
 */
export function parseProveedoresFile(
  buffer: ArrayBuffer | Uint8Array,
  options: ParseProveedoresOptions = {}
): { rows: ProveedorImportado[]; errors: string[]; warnings: string[] } {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], errors: ['El archivo no contiene hojas de cálculo.'], warnings: [] };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    return parseProveedoresData(jsonData, options);
  } catch (err: unknown) {
    return { rows: [], errors: [`Error al procesar el archivo: ${(err as Error).message}`], warnings: [] };
  }
}

/**
 * Genera el contenido de una plantilla CSV lista para rellenar por el usuario con datos oficiales.
 */
export function generarPlantillaProveedoresCsv(): string {
  const headers = ['RUT', 'Razón Social', 'Contacto', 'Teléfono', 'Correo', 'Dirección', 'Comuna', 'Región', 'Rubro'];
  const sampleRows = [
    ['76.840.120-9', 'Atrio Baldosas SpA', 'Ventas Distribución', '+56 9 8765 4321', 'ventas@atrio.cl', 'Av. Industrial 1234', 'San Bernardo', 'Metropolitana', 'Baldosas y Prefabricados'],
    ['80.125.100-5', 'Bottai S.A.', 'Mesa de Ventas', '+56 2 2345 6789', 'contacto@bottai.cl', 'Camino a Melipilla 5500', 'Maipú', 'Metropolitana', 'Tubos, Pastelones y Soleras'],
    ['96.547.800-0', 'MACBAL S.A.', 'Claudia Castillo', '+56 2 2527 7880', 'macbal2@gmail.com', 'Los Suspiros 2400', 'San Bernardo', 'Metropolitana', 'Baldosas y Revestimientos'],
  ];

  const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escapeCell).join(';'),
    ...sampleRows.map((r) => r.map(escapeCell).join(';')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Genera los bytes de un archivo Excel .xlsx con formato y datos oficiales de ejemplo.
 */
export function generarPlantillaProveedoresXlsx(): Uint8Array {
  const data = [
    {
      'RUT': '76.840.120-9',
      'Razón Social': 'Atrio Baldosas SpA',
      'Contacto': 'Ventas Distribución',
      'Teléfono': '+56 9 8765 4321',
      'Correo': 'ventas@atrio.cl',
      'Dirección': 'Av. Industrial 1234',
      'Comuna': 'San Bernardo',
      'Región': 'Metropolitana',
      'Rubro': 'Baldosas y Prefabricados',
    },
    {
      'RUT': '80.125.100-5',
      'Razón Social': 'Bottai S.A.',
      'Contacto': 'Mesa de Ventas',
      'Teléfono': '+56 2 2345 6789',
      'Correo': 'contacto@bottai.cl',
      'Dirección': 'Camino a Melipilla 5500',
      'Comuna': 'Maipú',
      'Región': 'Metropolitana',
      'Rubro': 'Tubos, Pastelones y Soleras',
    },
    {
      'RUT': '96.547.800-0',
      'Razón Social': 'MACBAL S.A.',
      'Contacto': 'Claudia Castillo',
      'Teléfono': '+56 2 2527 7880',
      'Correo': 'macbal2@gmail.com',
      'Dirección': 'Los Suspiros 2400',
      'Comuna': 'San Bernardo',
      'Región': 'Metropolitana',
      'Rubro': 'Baldosas y Revestimientos',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Proveedores');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
