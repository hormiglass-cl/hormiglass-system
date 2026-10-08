import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://jvenwcupdllcqbxixcuo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZW53Y3VwZGxsY3FieGl4Y3VvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIwNjYsImV4cCI6MjEwMDEzODA2Nn0.g6nY19lqbYeMZeh6vbjqSTS2nhZV3dsMkB_pEIv-Hfs';

async function seed() {
  console.log('📦 Iniciando carga de 340 productos desde Excel...');
  const filePath = path.resolve('local/ajustes/octubre/Maestro_Productos_Hormiglass_Proveedores.xlsx');
  if (!fs.existsSync(filePath)) {
    throw new Error('No se encontró el archivo: ' + filePath);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'j.rodrigueztorresss1@gmail.com',
    password: 'Jert0211=='
  });
  if (authErr) throw authErr;
  console.log('✅ Autenticado como:', auth.user.email);

  // Obtener proveedores de la base de datos
  const { data: proveedoresDb } = await supabase.from('proveedores').select('id, nombre');
  const proveedoresMap = {};
  for (const p of proveedoresDb || []) {
    const n = p.nombre.toLowerCase();
    if (n.includes('bottai')) proveedoresMap['BOTTAI'] = p.id;
    else if (n.includes('atrio')) proveedoresMap['ATRIO'] = p.id;
    else if (n.includes('mac-bal') || n.includes('macbal')) proveedoresMap['MACBAL'] = p.id;
  }
  console.log('Mapeo de proveedores IDs:', proveedoresMap);

  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames.includes('Maestro productos') ? 'Maestro productos' : wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

  const seenCodes = new Map();
  const items = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    let codigo = String(r['Código interno'] || '').trim().toUpperCase();
    let nombre = String(r['Descripción'] || '').trim();
    const categoria = String(r['Categoría'] || '').trim();

    if (!nombre && categoria) {
      nombre = `${categoria} ${r['Código proveedor'] || 'Bottai'} (Revisión pendiente)`;
    } else if (!nombre) {
      nombre = `Producto ${codigo || (i + 1)}`;
    }

    if (!codigo) {
      codigo = `PROD-${String(i + 1).padStart(4, '0')}`;
    }

    if (seenCodes.has(codigo)) {
      const count = seenCodes.get(codigo) + 1;
      seenCodes.set(codigo, count);
      codigo = `${codigo}-${count}`;
    } else {
      seenCodes.set(codigo, 1);
    }

    const origen = String(r['Origen'] || '').toLowerCase().includes('fabricaci') ? 'fabricacion_propia' : 'reventa';
    const proveedorNombre = String(r['Proveedor'] || '').trim().toUpperCase();
    const proveedorId = proveedoresMap[proveedorNombre] || null;

    const rawPrecio = String(r['Precio ref. sin IVA'] || '').replace(/\./g, '').replace(',', '.');
    const precio = Number(rawPrecio) || 0;
    const rawPeso = String(r['Peso kg'] || '').replace(',', '.');
    const peso = Number(rawPeso) || null;
    const observaciones = String(r['Observaciones'] || '').trim() || null;
    const requiereRevision = proveedorNombre === 'BOTTAI' || (observaciones && /revisar|ocr/i.test(observaciones));

    items.push({
      codigo,
      codigo_proveedor: String(r['Código proveedor'] || '').trim() || null,
      nombre,
      categoria: 'producto',
      familia: categoria || null,
      subcategoria: String(r['Subcategoría / Terminación'] || '').trim() || null,
      origen,
      proveedor_id: proveedorId,
      medidas: String(r['Medidas'] || '').trim() || null,
      color: String(r['Color'] || '').trim() || null,
      unidad: String(r['Unidad'] || '').trim().toLowerCase() || 'unidad',
      peso_kg: peso,
      precio_referencia: precio,
      costo_referencia: 0,
      observaciones,
      requiere_revision: !!requiereRevision,
      activo: true,
      es_demo: false
    });
  }

  console.log(`🚀 Preparados ${items.length} productos para upsert...`);

  // Subir en lotes de 50
  const batchSize = 50;
  for (let b = 0; b < items.length; b += batchSize) {
    const chunk = items.slice(b, b + batchSize);
    const { error: upsertErr } = await supabase
      .from('catalogo_productos')
      .upsert(chunk, { onConflict: 'codigo' });

    if (upsertErr) {
      console.error(`Error en lote ${b} - ${b + chunk.length}:`, upsertErr);
      throw upsertErr;
    }
    console.log(`✅ Lote ${b + 1} a ${Math.min(b + batchSize, items.length)} importado.`);
  }

  // Verificar recuento en base de datos
  const { count, error: countErr } = await supabase
    .from('catalogo_productos')
    .select('*', { count: 'exact', head: true });

  if (countErr) throw countErr;
  console.log(`\n🎉 ¡Carga completa exitosa! Total de productos en catalogo_productos: ${count}`);
}

seed().catch((err) => {
  console.error('Error durante la carga:', err);
  process.exit(1);
});
