'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { ProductoCatalogo } from '../../lib/types';
import { parseProductosCsv, type ProductoCsv } from '../../lib/productos-csv';
import { useAuth } from '../../lib/context/AuthContext';

type Form = Omit<ProductoCatalogo, 'id' | 'es_demo'>;
const empty: Form = { codigo: '', nombre: '', categoria: 'producto', unidad: 'unidad', precio_referencia: 0, costo_referencia: 0, descripcion: '', activo: true };

export default function ProductosPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ProductoCatalogo[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ProductoCsv[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('catalogo_productos').select('*').order('nombre');
    if (loadError) setError(loadError.message);
    else { setItems((data || []) as ProductoCatalogo[]); setError(''); }
  }, [supabase]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function save() {
    if (currentUser?.rol !== 'admin') { setError('Solo administración puede modificar el catálogo.'); return; }
    if (!form.codigo.trim() || !form.nombre.trim()) { setError('Código y nombre son obligatorios.'); return; }
    setSaving(true); setError('');
    const payload = {
      ...form,
      codigo: form.codigo.trim().toUpperCase(), nombre: form.nombre.trim(),
      precio_referencia: Number(form.precio_referencia) || 0,
      costo_referencia: Number(form.costo_referencia) || 0,
    };
    const result = editingId
      ? await supabase.from('catalogo_productos').update(payload).eq('id', editingId)
      : await supabase.from('catalogo_productos').insert({ ...payload, es_demo: false });
    if (result.error) setError(result.error.message);
    else { setForm(empty); setEditingId(null); await load(); }
    setSaving(false);
  }

  function downloadTemplate() {
    const csv = 'codigo;nombre;categoria;unidad;precio_referencia;costo_referencia;descripcion;activo\nHG-001;Producto ejemplo;producto;unidad;10000;6500;Descripción opcional;si\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'plantilla-productos-hormiglass.csv'; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function readCsv(file: File) {
    const result = parseProductosCsv(await file.text());
    setPreview(result.rows); setCsvErrors(result.errors);
  }

  async function importCsv() {
    if (currentUser?.rol !== 'admin' || !preview.length || csvErrors.length) return;
    setSaving(true); setError('');
    const { error: importError } = await supabase.from('catalogo_productos')
      .upsert(preview.map((row) => ({ ...row, es_demo: false })), { onConflict: 'codigo' });
    if (importError) setError(importError.message);
    else { setPreview([]); setCsvErrors([]); await load(); }
    setSaving(false);
  }

  function edit(item: ProductoCatalogo) {
    setEditingId(item.id);
    setForm({ codigo: item.codigo, nombre: item.nombre, categoria: item.categoria,
      unidad: item.unidad, precio_referencia: item.precio_referencia,
      costo_referencia: item.costo_referencia, descripcion: item.descripcion || '', activo: item.activo });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const visible = items.filter((item) => `${item.codigo} ${item.nombre} ${item.categoria}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-5 text-[#213343]">
    <div><h1 className="text-2xl font-bold">Catálogo de productos e insumos</h1><p className="text-sm text-gray-600">Precios de referencia para cotizaciones y compras. Los registros DEMO son ficticios y no representan inventario.</p></div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {currentUser?.rol === 'admin' && <section className="rounded-lg border bg-white p-4 space-y-3 text-sm">
      <h2 className="font-bold">Importar catálogo real desde CSV</h2>
      <p>Revisa los productos antes de cargarlos. Los códigos existentes se actualizan y dejan de estar marcados DEMO.</p>
      <div className="flex flex-wrap gap-2 items-center"><button onClick={downloadTemplate} className="rounded-md border px-3 py-2">Descargar plantilla</button><input aria-label="Archivo CSV de productos" type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readCsv(file); }} /></div>
      {csvErrors.map((message) => <p key={message} className="text-red-700">{message}</p>)}
      {preview.length > 0 && <><p>{preview.length} productos válidos para importar.</p><div className="max-h-48 overflow-auto border rounded-md">{preview.map((row) => <p key={row.codigo} className="border-b px-2 py-1">{row.codigo} · {row.nombre} · ${row.precio_referencia.toLocaleString('es-CL')}</p>)}</div><button disabled={saving || csvErrors.length > 0} onClick={importCsv} className="rounded-md bg-[#213343] text-white px-3 py-2 disabled:opacity-50">Importar productos</button></>}
    </section>}
    {currentUser?.rol === 'admin' && <section className="rounded-lg border bg-white p-4 space-y-3">
      <h2 className="font-bold">{editingId ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <input aria-label="Código" placeholder="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="rounded-md border p-2 text-sm" />
        <input aria-label="Nombre" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-md border p-2 text-sm" />
        <select aria-label="Categoría" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Form['categoria'] })} className="rounded-md border p-2 text-sm"><option value="producto">Producto</option><option value="insumo">Insumo</option><option value="servicio">Servicio</option></select>
        <input aria-label="Unidad" placeholder="Unidad (m², saco, unidad)" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="rounded-md border p-2 text-sm" />
        <label className="text-xs text-gray-600">Precio de venta referencia<input type="number" min="0" step="0.01" value={form.precio_referencia} onChange={(e) => setForm({ ...form, precio_referencia: Number(e.target.value) })} className="block w-full rounded-md border p-2 text-sm" /></label>
        <label className="text-xs text-gray-600">Costo referencia<input type="number" min="0" step="0.01" value={form.costo_referencia} onChange={(e) => setForm({ ...form, costo_referencia: Number(e.target.value) })} className="block w-full rounded-md border p-2 text-sm" /></label>
      </div>
      <textarea aria-label="Descripción" placeholder="Descripción opcional" value={form.descripcion || ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full rounded-md border p-2 text-sm" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />Activo</label>
      <div className="flex gap-2"><button disabled={saving} onClick={save} className="rounded-md bg-[#f97316] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>{editingId && <button onClick={() => { setEditingId(null); setForm(empty); }} className="rounded-md border px-3 py-2 text-sm">Cancelar</button>}</div>
    </section>}
    <input aria-label="Buscar productos" placeholder="Buscar productos o insumos" value={query} onChange={(e) => setQuery(e.target.value)} className="hg-list-search w-full px-3 text-sm" />
    <div className="hg-list-group overflow-x-auto"><table className="hg-list-table w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3">Código</th><th className="p-3">Nombre</th><th className="p-3">Categoría</th><th className="p-3">Unidad</th><th className="p-3">Precio</th><th className="p-3">Costo</th><th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-t"><td className="p-3 font-mono text-xs">{item.codigo}</td><td className="p-3">{item.nombre} {item.es_demo && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold">DEMO</span>}</td><td className="p-3">{item.categoria}</td><td className="p-3">{item.unidad}</td><td className="p-3">${Number(item.precio_referencia).toLocaleString('es-CL')}</td><td className="p-3">${Number(item.costo_referencia).toLocaleString('es-CL')}</td><td className="p-3">{item.activo ? 'Activo' : 'Inactivo'}</td><td className="p-3">{currentUser?.rol === 'admin' && <button onClick={() => edit(item)} className="font-bold text-[#f97316]">Editar</button>}</td></tr>)}</tbody></table></div>
  </div>;
}
