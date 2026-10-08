'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type { OrigenProducto, ProductoCatalogo, Proveedor } from '../../lib/types';
import { parseProductosFile, type ProductoImportado } from '../../lib/productos-csv';
import { useAuth } from '../../lib/context/AuthContext';
import { mensajeError } from '../../lib/errores';

type Form = {
  codigo: string;
  codigo_proveedor: string;
  nombre: string;
  categoria: 'producto' | 'insumo' | 'servicio';
  familia: string;
  subcategoria: string;
  origen: OrigenProducto;
  proveedor_id: string;
  unidad: string;
  medidas: string;
  color: string;
  peso_kg: string;
  precio_referencia: number;
  costo_referencia: number;
  descripcion: string;
  observaciones: string;
  requiere_revision: boolean;
  activo: boolean;
};

const emptyForm: Form = {
  codigo: '',
  codigo_proveedor: '',
  nombre: '',
  categoria: 'producto',
  familia: '',
  subcategoria: '',
  origen: 'fabricacion_propia',
  proveedor_id: '',
  unidad: 'unidad',
  medidas: '',
  color: '',
  peso_kg: '',
  precio_referencia: 0,
  costo_referencia: 0,
  descripcion: '',
  observaciones: '',
  requiere_revision: false,
  activo: true,
};

export default function ProductosPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<ProductoCatalogo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filtros
  const [query, setQuery] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState<'todos' | 'fabricacion_propia' | 'reventa'>('todos');
  const [filtroProveedor, setFiltroProveedor] = useState<string>('todos');
  const [filtroFamilia, setFiltroFamilia] = useState<string>('todos');
  const [filtroSoloRevision, setFiltroSoloRevision] = useState(false);

  // Estados UI
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal importación
  const [preview, setPreview] = useState<ProductoImportado[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: productosData, error: loadError }, { data: proveedoresData }] = await Promise.all([
      supabase
        .from('catalogo_productos')
        .select('*, proveedor:proveedores(id, nombre, rut)')
        .order('nombre'),
      supabase.from('proveedores').select('*').order('nombre'),
    ]);

    if (loadError) {
      setError(mensajeError(loadError));
    } else {
      setItems((productosData || []) as ProductoCatalogo[]);
      setError('');
    }

    if (proveedoresData) {
      setProveedores(proveedoresData as Proveedor[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const proveedoresMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of proveedores) {
      map[p.nombre.toUpperCase()] = p.id;
      if (p.nombre.toLowerCase().includes('bottai')) map['BOTTAI'] = p.id;
      if (p.nombre.toLowerCase().includes('atrio')) map['ATRIO'] = p.id;
      if (p.nombre.toLowerCase().includes('mac-bal') || p.nombre.toLowerCase().includes('macbal')) map['MACBAL'] = p.id;
    }
    return map;
  }, [proveedores]);

  const familiasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.familia?.trim()) set.add(item.familia.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Contadores
  const stats = useMemo(() => {
    const total = items.length;
    const fabricacion = items.filter((i) => i.origen === 'fabricacion_propia').length;
    const reventa = items.filter((i) => i.origen === 'reventa').length;
    const revision = items.filter((i) => !!i.requiere_revision).length;
    return { total, fabricacion, reventa, revision };
  }, [items]);

  async function save() {
    if (currentUser?.rol !== 'admin') {
      setError('Solo administración puede modificar el catálogo.');
      return;
    }
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError('Código y nombre son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      codigo_proveedor: form.codigo_proveedor.trim() || null,
      nombre: form.nombre.trim(),
      categoria: form.categoria,
      familia: form.familia.trim() || null,
      subcategoria: form.subcategoria.trim() || null,
      origen: form.origen,
      proveedor_id: form.proveedor_id || null,
      unidad: form.unidad.trim() || 'unidad',
      medidas: form.medidas.trim() || null,
      color: form.color.trim() || null,
      peso_kg: form.peso_kg ? Number(form.peso_kg) : null,
      precio_referencia: Number(form.precio_referencia) || 0,
      costo_referencia: Number(form.costo_referencia) || 0,
      descripcion: form.descripcion.trim() || null,
      observaciones: form.observaciones.trim() || null,
      requiere_revision: form.requiere_revision,
      activo: form.activo,
    };

    const result = editingId
      ? await supabase.from('catalogo_productos').update(payload).eq('id', editingId)
      : await supabase.from('catalogo_productos').insert({ ...payload, es_demo: false });

    if (result.error) {
      setError(mensajeError(result.error));
    } else {
      closeForm();
      setSuccessMsg(editingId ? 'Producto actualizado correctamente.' : 'Producto creado exitosamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await load();
    }
    setSaving(false);
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function closeImport() {
    setShowImport(false);
    setPreview([]);
    setImportErrors([]);
  }

  function downloadTemplate() {
    const csv =
      'Código interno;Código proveedor;Descripción;Categoría;Subcategoría / Terminación;Medidas;Color;Unidad;Precio ref. sin IVA;Costo ref.;Peso kg;Origen;Proveedor;Observaciones;requiere_revision;activo\n' +
      'HG-PAS-001;;Pastelón 1 a 2 colores 40 x 40;Pastelones;;40x40;Gris;m²;14500;9000;;Fabricación propia;Hormiglass;Código estándar;no;si\n' +
      'BOT-100101103;100101103;TUBO CIRC.CTE DE 150 mmx 1 mt;Tubos;;150mm x 1m;Gris;UND;8882;6200;;Compra / reventa;Bottai;OCR Bottai lista oficial;si;si\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plantilla-maestro-productos-hormiglass.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelected(file: File) {
    try {
      const result = await parseProductosFile(file, proveedoresMap);
      setPreview(result.rows);
      setImportErrors(result.errors);
      setError('');
      setShowImport(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo.');
    }
  }

  async function importRows() {
    if (currentUser?.rol !== 'admin' || !preview.length || importErrors.length) return;
    setSaving(true);
    setError('');

    // Preparamos payload mapeando los registros
    const payloads = preview.map((row) => ({
      codigo: row.codigo,
      codigo_proveedor: row.codigo_proveedor || null,
      nombre: row.nombre,
      categoria: row.categoria,
      familia: row.familia || null,
      subcategoria: row.subcategoria || null,
      origen: row.origen || 'reventa',
      proveedor_id: row.proveedor_id || null,
      unidad: row.unidad || 'unidad',
      medidas: row.medidas || null,
      color: row.color || null,
      peso_kg: row.peso_kg || null,
      precio_referencia: row.precio_referencia || 0,
      costo_referencia: row.costo_referencia || 0,
      descripcion: row.descripcion || null,
      observaciones: row.observaciones || null,
      requiere_revision: !!row.requiere_revision,
      activo: row.activo,
      es_demo: false,
    }));

    // Insertar en lotes de 50
    const batchSize = 50;
    let anyError = null;
    for (let b = 0; b < payloads.length; b += batchSize) {
      const chunk = payloads.slice(b, b + batchSize);
      const { error: upsertErr } = await supabase
        .from('catalogo_productos')
        .upsert(chunk, { onConflict: 'codigo' });
      if (upsertErr) {
        anyError = upsertErr;
        break;
      }
    }

    if (anyError) {
      setError(mensajeError(anyError));
    } else {
      setSuccessMsg(`Se importaron con éxito ${preview.length} productos al catálogo.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      closeImport();
      await load();
    }
    setSaving(false);
  }

  function edit(item: ProductoCatalogo) {
    setEditingId(item.id);
    setForm({
      codigo: item.codigo,
      codigo_proveedor: item.codigo_proveedor || '',
      nombre: item.nombre,
      categoria: item.categoria,
      familia: item.familia || '',
      subcategoria: item.subcategoria || '',
      origen: item.origen || (item.proveedor_id ? 'reventa' : 'fabricacion_propia'),
      proveedor_id: item.proveedor_id || '',
      unidad: item.unidad || 'unidad',
      medidas: item.medidas || '',
      color: item.color || '',
      peso_kg: item.peso_kg ? String(item.peso_kg) : '',
      precio_referencia: Number(item.precio_referencia) || 0,
      costo_referencia: Number(item.costo_referencia) || 0,
      descripcion: item.descripcion || '',
      observaciones: item.observaciones || '',
      requiere_revision: !!item.requiere_revision,
      activo: item.activo,
    });
    setError('');
    setShowForm(true);
  }

  // Filtrado de items
  const visible = useMemo(() => {
    return items.filter((item) => {
      // Búsqueda de texto libre
      if (query.trim()) {
        const q = query.toLowerCase().trim();
        const matchesQuery =
          item.codigo.toLowerCase().includes(q) ||
          item.nombre.toLowerCase().includes(q) ||
          (item.codigo_proveedor && item.codigo_proveedor.toLowerCase().includes(q)) ||
          (item.familia && item.familia.toLowerCase().includes(q)) ||
          (item.subcategoria && item.subcategoria.toLowerCase().includes(q)) ||
          (item.proveedor?.nombre && item.proveedor.nombre.toLowerCase().includes(q));
        if (!matchesQuery) return false;
      }

      // Filtro de origen
      if (filtroOrigen !== 'todos') {
        const itemOrigen = item.origen || 'fabricacion_propia';
        if (itemOrigen !== filtroOrigen) return false;
      }

      // Filtro de proveedor
      if (filtroProveedor !== 'todos') {
        if (filtroProveedor === 'sin_proveedor') {
          if (item.proveedor_id) return false;
        } else {
          if (item.proveedor_id !== filtroProveedor) return false;
        }
      }

      // Filtro de familia
      if (filtroFamilia !== 'todos') {
        if (item.familia !== filtroFamilia) return false;
      }

      // Filtro de revisión
      if (filtroSoloRevision && !item.requiere_revision) {
        return false;
      }

      return true;
    });
  }, [items, query, filtroOrigen, filtroProveedor, filtroFamilia, filtroSoloRevision]);

  const isAdmin = currentUser?.rol === 'admin';
  const inputClass =
    'block w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#f97316]';
  const labelClass = 'text-xs font-semibold text-gray-700 space-y-1 block';

  return (
    <div className="space-y-5 text-[#213343]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Package className="w-6 h-6 text-[#f97316]" />
            <span>Maestro de Productos y Proveedores</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Catálogo unificado de Hormiglass, Bottai, Atrio y Mac-Bal. Precios de referencia, atributos técnicos y control de revisión.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={downloadTemplate}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-[#213343] font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
              title="Descargar plantilla Excel/CSV"
            >
              <Download className="w-4 h-4 text-[#f97316]" />
              <span>Plantilla</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-white hover:bg-gray-50 border border-gray-200 text-[#213343] font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4 text-[#f97316]" />
              <span>Importar Excel / CSV</span>
            </button>
            <input
              ref={fileInputRef}
              aria-label="Archivo de catálogo de productos"
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={openNew}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo producto</span>
            </button>
          </div>
        )}
      </div>

      {/* Alertas */}
      {error && !showForm && !showImport && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {successMsg && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Catálogo</span>
          <span className="text-xl font-extrabold text-[#213343]">{stats.total}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">items registrados</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Fabricación Propia</span>
          <span className="text-xl font-extrabold text-emerald-800">{stats.fabricacion}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">línea Hormiglass</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Compra / Reventa</span>
          <span className="text-xl font-extrabold text-blue-800">{stats.reventa}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">Bottai, Atrio, Macbal</span>
        </div>
        <button
          type="button"
          onClick={() => setFiltroSoloRevision((prev) => !prev)}
          className={`border rounded-lg p-3 shadow-sm text-left transition ${
            filtroSoloRevision
              ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400'
              : 'bg-white border-amber-200 hover:bg-amber-50/50'
          }`}
          title="Haz clic para filtrar productos que requieren revisión"
        >
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Requieren Revisión</span>
          </span>
          <span className="text-xl font-extrabold text-amber-900">{stats.revision}</span>
          <span className="text-[10px] text-amber-700 block mt-0.5">
            {filtroSoloRevision ? '✓ Filtro activo' : 'Clic para filtrar'}
          </span>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              aria-label="Buscar productos"
              placeholder="Buscar por código, nombre, proveedor, familia o medidas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="hg-list-search w-full pl-9 pr-3 text-sm bg-white"
            />
          </div>

          {/* Filtro Origen */}
          <div className="w-full md:w-48">
            <select
              aria-label="Filtrar por origen"
              value={filtroOrigen}
              onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todos">Origen: Todos</option>
              <option value="fabricacion_propia">Fabricación Propia</option>
              <option value="reventa">Compra / Reventa</option>
            </select>
          </div>

          {/* Filtro Proveedor */}
          <div className="w-full md:w-48">
            <select
              aria-label="Filtrar por proveedor"
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todos">Proveedor: Todos</option>
              <option value="sin_proveedor">Hormiglass / Sin Proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Familia */}
          {familiasDisponibles.length > 0 && (
            <div className="w-full md:w-44">
              <select
                aria-label="Filtrar por familia"
                value={filtroFamilia}
                onChange={(e) => setFiltroFamilia(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
              >
                <option value="todos">Familia: Todas</option>
                {familiasDisponibles.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Barra de estado de filtros y reseteo */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#f97316]" />
            <span>
              Mostrando <strong className="text-[#213343]">{visible.length}</strong> de{' '}
              <strong className="text-[#213343]">{items.length}</strong> productos
            </span>
            {filtroSoloRevision && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5">
                Solo requieren revisión
              </span>
            )}
          </div>
          {(query || filtroOrigen !== 'todos' || filtroProveedor !== 'todos' || filtroFamilia !== 'todos' || filtroSoloRevision) && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFiltroOrigen('todos');
                setFiltroProveedor('todos');
                setFiltroFamilia('todos');
                setFiltroSoloRevision(false);
              }}
              className="text-[#f97316] hover:underline font-semibold text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="hg-list-group overflow-x-auto">
        <table className="hg-list-table w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-gray-50 text-xs">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Nombre / Descripción</th>
              <th className="p-3">Familia / Subcat.</th>
              <th className="p-3">Medidas / Color</th>
              <th className="p-3">Origen</th>
              <th className="p-3">Proveedor</th>
              <th className="p-3 text-right">Precio Ref.</th>
              <th className="p-3 text-right">Costo Ref.</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm text-gray-500">
                  Cargando catálogo de productos...
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm text-gray-500">
                  {items.length === 0
                    ? 'Aún no hay productos. Crea uno o importa tu catálogo desde Excel / CSV.'
                    : 'No hay productos que coincidan con los filtros seleccionados.'}
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((item) => {
                const origenPropio = item.origen === 'fabricacion_propia';
                const proveedorNombre = item.proveedor?.nombre || (origenPropio ? 'Hormiglass' : '-');

                return (
                  <tr key={item.id} className="border-t hover:bg-orange-50/30 transition">
                    {/* Código */}
                    <td className="p-3">
                      <div className="font-mono text-xs font-bold text-[#213343]">{item.codigo}</div>
                      {item.codigo_proveedor && (
                        <div className="text-[10px] text-gray-400 font-mono">Ref: {item.codigo_proveedor}</div>
                      )}
                    </td>

                    {/* Nombre */}
                    <td className="p-3">
                      <div className="font-semibold text-xs text-[#213343]">{item.nombre}</div>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {item.es_demo && (
                          <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[9px] font-bold">
                            DEMO
                          </span>
                        )}
                        {item.requiere_revision && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[10px] font-bold"
                            title={item.observaciones || 'Precio referencial OCR. Requiere verificación con lista de precios oficial.'}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                            <span>Revisión Bottai</span>
                          </span>
                        )}
                        {item.observaciones && !item.requiere_revision && (
                          <span className="text-[10px] text-gray-400 italic line-clamp-1">{item.observaciones}</span>
                        )}
                      </div>
                    </td>

                    {/* Familia / Subcategoría */}
                    <td className="p-3 text-xs">
                      <div className="font-medium text-gray-700">{item.familia || '-'}</div>
                      {item.subcategoria && <div className="text-[10px] text-gray-400">{item.subcategoria}</div>}
                    </td>

                    {/* Medidas / Color */}
                    <td className="p-3 text-xs">
                      <div className="text-gray-700">{item.medidas || '-'}</div>
                      {item.color && <div className="text-[10px] text-gray-400">Color: {item.color}</div>}
                    </td>

                    {/* Origen */}
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          origenPropio
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}
                      >
                        {origenPropio ? 'Fabricación Propia' : 'Reventa'}
                      </span>
                    </td>

                    {/* Proveedor */}
                    <td className="p-3 text-xs font-medium text-gray-700">{proveedorNombre}</td>

                    {/* Precio Ref */}
                    <td className="p-3 text-right font-mono text-xs font-bold text-[#213343]">
                      ${Number(item.precio_referencia).toLocaleString('es-CL')}
                      <span className="block text-[9px] text-gray-400 font-sans font-normal">/{item.unidad}</span>
                    </td>

                    {/* Costo Ref */}
                    <td className="p-3 text-right font-mono text-xs text-gray-600">
                      ${Number(item.costo_referencia).toLocaleString('es-CL')}
                    </td>

                    {/* Estado */}
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          item.activo
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="p-3 text-right">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => edit(item)}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-100 hover:bg-[#f97316] text-gray-700 hover:text-white px-2.5 py-1 text-xs font-bold transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Modal Formulario (Crear / Editar) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="producto-form-title"
            className="bg-white border border-gray-200 rounded-lg max-w-3xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 id="producto-form-title" className="text-lg font-extrabold flex items-center gap-2">
                <Package className="w-5 h-5 text-[#f97316]" />
                <span>{editingId ? 'Editar producto en catálogo' : 'Nuevo producto en catálogo'}</span>
              </h3>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Cerrar"
                className="p-1 text-gray-400 hover:text-[#213343] rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {/* Código */}
              <label className={labelClass}>
                <span>Código interno *</span>
                <input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="HG-PAS-001 / BOT-100..."
                  className={inputClass}
                />
              </label>

              {/* Código Proveedor */}
              <label className={labelClass}>
                <span>Código proveedor</span>
                <input
                  value={form.codigo_proveedor}
                  onChange={(e) => setForm({ ...form, codigo_proveedor: e.target.value })}
                  placeholder="Código catálogo fábrica"
                  className={inputClass}
                />
              </label>

              {/* Categoría */}
              <label className={labelClass}>
                <span>Tipo de ítem</span>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value as Form['categoria'] })}
                  className={inputClass}
                >
                  <option value="producto">Producto</option>
                  <option value="insumo">Insumo</option>
                  <option value="servicio">Servicio</option>
                </select>
              </label>

              {/* Nombre / Descripción */}
              <label className={`${labelClass} sm:col-span-2 md:col-span-3`}>
                <span>Descripción / Nombre del producto *</span>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej. Pastelón 40x40 gris liso..."
                  className={inputClass}
                />
              </label>

              {/* Origen */}
              <label className={labelClass}>
                <span>Origen</span>
                <select
                  value={form.origen}
                  onChange={(e) => setForm({ ...form, origen: e.target.value as OrigenProducto })}
                  className={inputClass}
                >
                  <option value="fabricacion_propia">Fabricación Propia (Hormiglass)</option>
                  <option value="reventa">Compra / Reventa</option>
                </select>
              </label>

              {/* Proveedor */}
              <label className={labelClass}>
                <span>Proveedor</span>
                <select
                  value={form.proveedor_id}
                  onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Hormiglass / Ninguno</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>

              {/* Familia */}
              <label className={labelClass}>
                <span>Familia comercial</span>
                <input
                  value={form.familia}
                  onChange={(e) => setForm({ ...form, familia: e.target.value })}
                  placeholder="Tubos, Pastelones, Baldosas..."
                  className={inputClass}
                />
              </label>

              {/* Subcategoría */}
              <label className={labelClass}>
                <span>Subcategoría / Terminación</span>
                <input
                  value={form.subcategoria}
                  onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}
                  placeholder="Relieve, Pulida, Liso..."
                  className={inputClass}
                />
              </label>

              {/* Unidad */}
              <label className={labelClass}>
                <span>Unidad</span>
                <input
                  value={form.unidad}
                  onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                  placeholder="unidad, m², saco, kg"
                  className={inputClass}
                />
              </label>

              {/* Medidas */}
              <label className={labelClass}>
                <span>Medidas</span>
                <input
                  value={form.medidas}
                  onChange={(e) => setForm({ ...form, medidas: e.target.value })}
                  placeholder="40 x 40 x 4 cm"
                  className={inputClass}
                />
              </label>

              {/* Color */}
              <label className={labelClass}>
                <span>Color</span>
                <input
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  placeholder="Gris, Rojo, Negro..."
                  className={inputClass}
                />
              </label>

              {/* Peso kg */}
              <label className={labelClass}>
                <span>Peso kg</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.peso_kg}
                  onChange={(e) => setForm({ ...form, peso_kg: e.target.value })}
                  placeholder="Peso en kilogramos"
                  className={inputClass}
                />
              </label>

              {/* Precio venta ref */}
              <label className={labelClass}>
                <span>Precio venta sin IVA (Ref.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio_referencia}
                  onChange={(e) => setForm({ ...form, precio_referencia: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>

              {/* Costo ref */}
              <label className={labelClass}>
                <span>Costo referencia</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costo_referencia}
                  onChange={(e) => setForm({ ...form, costo_referencia: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>

              {/* Observaciones */}
              <label className={`${labelClass} sm:col-span-2 md:col-span-3`}>
                <span>Observaciones técnicas / comerciales</span>
                <input
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  placeholder="Fuente PDF Bottai, OCR, detalles..."
                  className={inputClass}
                />
              </label>
            </div>

            {/* Checkboxes de estado */}
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-amber-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requiere_revision}
                  onChange={(e) => setForm({ ...form, requiere_revision: e.target.checked })}
                  className="accent-amber-600 w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Requiere revisión (Precio referencial OCR o lista pendiente de validación)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="accent-[#f97316] w-4 h-4"
                />
                <span>Producto activo para cotizaciones y órdenes de compra</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-md bg-[#f97316] hover:bg-[#ea580c] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importación Masiva (Excel / CSV) */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="producto-import-title"
            className="bg-white border border-gray-200 rounded-lg max-w-4xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto text-sm"
          >
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 id="producto-import-title" className="text-lg font-extrabold flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#f97316]" />
                <span>Previsualización de Importación Masiva (Excel / CSV)</span>
              </h3>
              <button
                type="button"
                onClick={closeImport}
                aria-label="Cerrar"
                className="p-1 text-gray-400 hover:text-[#213343] rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Se detectaron los productos en el archivo. Los códigos existentes se actualizarán y los nuevos se registrarán.
            </p>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
                {error}
              </p>
            )}

            {importErrors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-1 text-xs text-red-700 max-h-36 overflow-auto">
                <p className="font-bold">Se encontraron los siguientes errores o advertencias:</p>
                {importErrors.map((message) => (
                  <p key={message}>• {message}</p>
                ))}
              </div>
            )}

            {preview.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs text-gray-700">
                    {preview.length} productos listos para importar ({preview.filter((p) => p.requiere_revision).length} marcados para revisión)
                  </p>
                </div>
                <div className="max-h-80 overflow-auto rounded-md border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="p-2">Código</th>
                        <th className="p-2">Descripción</th>
                        <th className="p-2">Familia</th>
                        <th className="p-2">Origen</th>
                        <th className="p-2">Proveedor</th>
                        <th className="p-2 text-right">Precio Ref.</th>
                        <th className="p-2 text-center">Revisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 100).map((row, idx) => (
                        <tr key={`${row.codigo}-${idx}`} className="border-t hover:bg-gray-50">
                          <td className="p-2 font-mono font-bold text-[11px]">{row.codigo}</td>
                          <td className="p-2 font-medium">{row.nombre}</td>
                          <td className="p-2 text-gray-600">{row.familia || '-'}</td>
                          <td className="p-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                row.origen === 'fabricacion_propia'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {row.origen === 'fabricacion_propia' ? 'Propia' : 'Reventa'}
                            </span>
                          </td>
                          <td className="p-2 text-gray-600">{row.proveedor_nombre || '-'}</td>
                          <td className="p-2 text-right font-mono">${row.precio_referencia.toLocaleString('es-CL')}</td>
                          <td className="p-2 text-center">
                            {row.requiere_revision ? (
                              <span className="text-amber-600 font-bold text-[11px]">⚠️ Sí</span>
                            ) : (
                              <span className="text-gray-400 text-[11px]">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.length > 100 && (
                    <div className="p-2 bg-gray-50 text-center text-xs text-gray-500 border-t">
                      Mostrando los primeros 100 de {preview.length} productos en la vista previa.
                    </div>
                  )}
                </div>
              </>
            )}

            {preview.length === 0 && importErrors.length === 0 && (
              <p className="text-gray-500">El archivo no contiene productos.</p>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={closeImport}
                className="rounded-md border border-gray-200 px-4 py-2 font-semibold hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || importErrors.length > 0 || preview.length === 0}
                onClick={importRows}
                className="rounded-md bg-[#f97316] hover:bg-[#ea580c] px-4 py-2 font-bold text-white disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? 'Importando...' : `Confirmar e importar ${preview.length} productos`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
