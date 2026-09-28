'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Package, Pencil, Plus, Search, Upload, X } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type { ProductoCatalogo } from '../../lib/types';
import { parseProductosCsv, type ProductoCsv } from '../../lib/productos-csv';
import { useAuth } from '../../lib/context/AuthContext';
import { mensajeError } from '../../lib/errores';

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
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('catalogo_productos').select('*').order('nombre');
    if (loadError) setError(mensajeError(loadError));
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
    if (result.error) setError(mensajeError(result.error));
    else { closeForm(); await load(); }
    setSaving(false);
  }

  function openNew() { setEditingId(null); setForm(empty); setError(''); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingId(null); setForm(empty); }
  function closeImport() { setShowImport(false); setPreview([]); setCsvErrors([]); }

  function downloadTemplate() {
    const csv = 'codigo;nombre;categoria;unidad;precio_referencia;costo_referencia;descripcion;activo\nHG-001;Producto ejemplo;producto;unidad;10000;6500;Descripción opcional;si\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'plantilla-productos-hormiglass.csv'; anchor.click();
    URL.revokeObjectURL(url);
  }

  async function readCsv(file: File) {
    const result = parseProductosCsv(await file.text());
    setPreview(result.rows); setCsvErrors(result.errors); setError(''); setShowImport(true);
  }

  async function importCsv() {
    if (currentUser?.rol !== 'admin' || !preview.length || csvErrors.length) return;
    setSaving(true); setError('');
    const { error: importError } = await supabase.from('catalogo_productos')
      .upsert(preview.map((row) => ({ ...row, es_demo: false })), { onConflict: 'codigo' });
    if (importError) setError(mensajeError(importError));
    else { closeImport(); await load(); }
    setSaving(false);
  }

  function edit(item: ProductoCatalogo) {
    setEditingId(item.id);
    setForm({ codigo: item.codigo, nombre: item.nombre, categoria: item.categoria,
      unidad: item.unidad, precio_referencia: item.precio_referencia,
      costo_referencia: item.costo_referencia, descripcion: item.descripcion || '', activo: item.activo });
    setError(''); setShowForm(true);
  }

  const visible = items.filter((item) => `${item.codigo} ${item.nombre} ${item.categoria}`.toLowerCase().includes(query.toLowerCase()));
  const isAdmin = currentUser?.rol === 'admin';
  const inputClass = 'block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#f97316]';
  const labelClass = 'text-xs font-medium text-gray-600';

  return <div className="space-y-5 text-[#213343]">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
      <div>
        <h1 className="text-2xl font-extrabold flex items-center gap-2"><Package className="w-6 h-6 text-[#f97316]" /><span>Catálogo de productos e insumos</span></h1>
        <p className="text-xs text-gray-600 mt-1">Precios de referencia para cotizaciones y compras. Los registros DEMO son ficticios y no representan inventario.</p>
      </div>
      {isAdmin && <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
        <button type="button" onClick={downloadTemplate} className="bg-white hover:bg-gray-50 border border-gray-200 text-[#213343] font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"><Download className="w-4 h-4 text-[#f97316]" /><span>Descargar plantilla</span></button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-white hover:bg-gray-50 border border-gray-200 text-[#213343] font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"><Upload className="w-4 h-4 text-[#f97316]" /><span>Importar CSV</span></button>
        <input ref={fileInputRef} aria-label="Archivo CSV de productos" type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readCsv(file); e.target.value = ''; }} />
        <button type="button" onClick={openNew} className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"><Plus className="w-4 h-4" /><span>Nuevo producto</span></button>
      </div>}
    </div>

    {error && !showForm && !showImport && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <div className="relative">
      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input aria-label="Buscar productos" placeholder="Buscar por código, nombre o categoría" value={query} onChange={(e) => setQuery(e.target.value)} className="hg-list-search w-full pl-9 pr-3 text-sm" />
    </div>

    <div className="hg-list-group overflow-x-auto"><table className="hg-list-table w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50 text-xs"><tr><th className="p-3">Código</th><th className="p-3">Nombre</th><th className="p-3">Categoría</th><th className="p-3">Unidad</th><th className="p-3">Precio</th><th className="p-3">Costo</th><th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody>
      {visible.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-sm text-gray-500">{items.length === 0 ? 'Aún no hay productos. Crea uno o importa tu catálogo desde CSV.' : 'No hay productos que coincidan con la búsqueda.'}</td></tr>}
      {visible.map((item) => <tr key={item.id} className="border-t hover:bg-orange-50/30 transition"><td className="p-3 font-mono text-xs">{item.codigo}</td><td className="p-3 font-semibold">{item.nombre} {item.es_demo && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold">DEMO</span>}</td><td className="p-3 capitalize">{item.categoria}</td><td className="p-3">{item.unidad}</td><td className="p-3 font-mono">${Number(item.precio_referencia).toLocaleString('es-CL')}</td><td className="p-3 font-mono">${Number(item.costo_referencia).toLocaleString('es-CL')}</td><td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${item.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{item.activo ? 'Activo' : 'Inactivo'}</span></td><td className="p-3 text-right">{isAdmin && <button type="button" onClick={() => edit(item)} className="inline-flex items-center gap-1 rounded-md bg-gray-100 hover:bg-[#f97316] text-gray-700 hover:text-white px-3 py-1.5 text-xs font-bold transition"><Pencil className="w-3.5 h-3.5" />Editar</button>}</td></tr>)}
    </tbody></table></div>

    {showForm && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="producto-form-title" className="bg-white border border-gray-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 id="producto-form-title" className="text-lg font-extrabold flex items-center gap-2"><Package className="w-5 h-5 text-[#f97316]" /><span>{editingId ? 'Editar producto' : 'Nuevo producto'}</span></h3>
          <button type="button" onClick={closeForm} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-[#213343] rounded-md"><X className="w-5 h-5" /></button>
        </div>
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Código *<input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="HG-001" className={inputClass} /></label>
          <label className={labelClass}>Nombre *<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Categoría<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Form['categoria'] })} className={inputClass}><option value="producto">Producto</option><option value="insumo">Insumo</option><option value="servicio">Servicio</option></select></label>
          <label className={labelClass}>Unidad<input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="m², saco, unidad" className={inputClass} /></label>
          <label className={labelClass}>Precio de venta referencia<input type="number" min="0" step="0.01" value={form.precio_referencia} onChange={(e) => setForm({ ...form, precio_referencia: Number(e.target.value) })} className={inputClass} /></label>
          <label className={labelClass}>Costo referencia<input type="number" min="0" step="0.01" value={form.costo_referencia} onChange={(e) => setForm({ ...form, costo_referencia: Number(e.target.value) })} className={inputClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Descripción<textarea value={form.descripcion || ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Opcional" rows={3} className={inputClass} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="accent-[#f97316]" />Activo</label>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={closeForm} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50">Cancelar</button>
          <button type="button" disabled={saving} onClick={save} className="rounded-md bg-[#f97316] hover:bg-[#ea580c] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>}

    {showImport && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="producto-import-title" className="bg-white border border-gray-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-sm max-h-[90vh] overflow-y-auto text-sm">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 id="producto-import-title" className="text-lg font-extrabold flex items-center gap-2"><Upload className="w-5 h-5 text-[#f97316]" /><span>Importar productos desde CSV</span></h3>
          <button type="button" onClick={closeImport} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-[#213343] rounded-md"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-gray-600">Revisa los productos antes de cargarlos. Los códigos existentes se actualizan y dejan de estar marcados DEMO.</p>
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
        {csvErrors.length > 0 && <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1 text-xs text-red-700">{csvErrors.map((message) => <p key={message}>{message}</p>)}</div>}
        {preview.length > 0 && <>
          <p className="font-semibold">{preview.length} productos válidos para importar</p>
          <div className="max-h-64 overflow-auto rounded-md border border-gray-200"><table className="w-full text-left text-xs"><thead className="bg-gray-50 sticky top-0"><tr><th className="p-2">Código</th><th className="p-2">Nombre</th><th className="p-2">Categoría</th><th className="p-2 text-right">Precio</th></tr></thead><tbody>{preview.map((row) => <tr key={row.codigo} className="border-t"><td className="p-2 font-mono">{row.codigo}</td><td className="p-2">{row.nombre}</td><td className="p-2 capitalize">{row.categoria}</td><td className="p-2 text-right font-mono">${row.precio_referencia.toLocaleString('es-CL')}</td></tr>)}</tbody></table></div>
        </>}
        {preview.length === 0 && csvErrors.length === 0 && <p className="text-gray-500">El archivo no contiene productos.</p>}
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={closeImport} className="rounded-md border border-gray-200 px-4 py-2 font-semibold hover:bg-gray-50">Cancelar</button>
          <button type="button" disabled={saving || csvErrors.length > 0 || preview.length === 0} onClick={importCsv} className="rounded-md bg-[#f97316] hover:bg-[#ea580c] px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? 'Importando...' : 'Importar productos'}</button>
        </div>
      </div>
    </div>}
  </div>;
}
