'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type { OrigenProducto, ProductoCatalogo, Proveedor } from '../../lib/types';
import { parseProductosFile, type ProductoImportado } from '../../lib/productos-csv';
import { useAuth } from '../../lib/context/AuthContext';
import { mensajeError } from '../../lib/errores';
import {
  ActionMenu,
  ActionMenuItem,
  Button,
  CodeStamp,
  Dialog,
  FilterBar,
  FilterSelect,
  IconButton,
  PageHeader,
  Panel,
  SearchField,
  StatusBadge,
  SummaryLine,
} from '../../components/ui/crm';
import { useToast } from '../../components/ui/feedback';

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
  const toast = useToast();

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
      toast({
        message: editingId ? 'Producto actualizado correctamente.' : 'Producto creado exitosamente.',
        tone: 'success',
      });
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
      toast({
        message: `Se importaron con éxito ${preview.length} productos al catálogo.`,
        tone: 'success',
      });
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

      if (filtroOrigen !== 'todos') {
        const itemOrigen = item.origen || 'fabricacion_propia';
        if (itemOrigen !== filtroOrigen) return false;
      }

      if (filtroProveedor !== 'todos') {
        if (filtroProveedor === 'sin_proveedor') {
          if (item.proveedor_id) return false;
        } else {
          if (item.proveedor_id !== filtroProveedor) return false;
        }
      }

      if (filtroFamilia !== 'todos') {
        if (item.familia !== filtroFamilia) return false;
      }

      if (filtroSoloRevision && !item.requiere_revision) {
        return false;
      }

      return true;
    });
  }, [items, query, filtroOrigen, filtroProveedor, filtroFamilia, filtroSoloRevision]);

  const isAdmin = currentUser?.rol === 'admin';

  return (
    <div className="hg-page space-y-5">
      {/* Header */}
      <PageHeader
        title="Maestro de Productos y Proveedores"
        description="Catálogo unificado de Hormiglass, Bottai, Atrio y Mac-Bal. Precios de referencia, atributos técnicos y control de revisión."
        actions={
          isAdmin && (
            <div className="flex items-center gap-2">
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
              <ActionMenu label="Acciones de catálogo">
                <ActionMenuItem icon={Download} onClick={downloadTemplate}>
                  Descargar Plantilla CSV
                </ActionMenuItem>
                <ActionMenuItem icon={Upload} onClick={() => fileInputRef.current?.click()}>
                  Importar Excel / CSV
                </ActionMenuItem>
              </ActionMenu>
              <Button variant="primary" icon={Plus} onClick={openNew}>
                Nuevo producto
              </Button>
            </div>
          )
        }
      />

      {/* Alertas */}
      {error && !showForm && !showImport && (
        <p role="alert" className="t-caption rounded-md border border-danger-line bg-danger-soft p-3 text-danger font-medium">
          {error}
        </p>
      )}

      {/* Resumen de Catálogo en una sola línea accesible */}
      <Panel className="p-3">
        <SummaryLine
          items={[
            { label: 'Total catálogo', value: stats.total },
            { label: 'Fabricación propia', value: stats.fabricacion, tone: 'success' },
            { label: 'Compra / reventa', value: stats.reventa, tone: 'info' },
            {
              label: 'Requieren revisión',
              value: stats.revision,
              tone: 'warning',
              active: filtroSoloRevision,
              onClick: () => setFiltroSoloRevision((prev) => !prev),
            },
          ]}
        />
      </Panel>

      {/* Barra de Filtros con etiquetas propias */}
      <FilterBar>
        <SearchField
          placeholder="Buscar por código, nombre, proveedor, familia o medidas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <FilterSelect
          label="Origen"
          value={filtroOrigen}
          onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
        >
          <option value="todos">Todos</option>
          <option value="fabricacion_propia">Fabricación Propia</option>
          <option value="reventa">Compra / Reventa</option>
        </FilterSelect>

        <FilterSelect
          label="Proveedor"
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="sin_proveedor">Hormiglass / Sin Proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </FilterSelect>

        {familiasDisponibles.length > 0 && (
          <FilterSelect
            label="Familia"
            value={filtroFamilia}
            onChange={(e) => setFiltroFamilia(e.target.value)}
          >
            <option value="todos">Todas</option>
            {familiasDisponibles.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </FilterSelect>
        )}

        {(query || filtroOrigen !== 'todos' || filtroProveedor !== 'todos' || filtroFamilia !== 'todos' || filtroSoloRevision) && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              setQuery('');
              setFiltroOrigen('todos');
              setFiltroProveedor('todos');
              setFiltroFamilia('todos');
              setFiltroSoloRevision(false);
            }}
            className="text-accent-ink"
          >
            <RefreshCw size={13} className="shrink-0" />
            <span>Limpiar</span>
          </Button>
        )}
      </FilterBar>

      {/* Tabla de Productos */}
      <Panel>
        <div className="overflow-x-auto">
          <table className="hg-table w-full min-w-[1000px] text-left text-xs">
            <thead>
              <tr>
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nombre / Descripción</th>
                <th className="py-3 px-4">Familia / Subcat.</th>
                <th className="py-3 px-4">Medidas / Color</th>
                <th className="py-3 px-4">Origen</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4 text-right">Precio Ref.</th>
                <th className="py-3 px-4 text-right">Costo Ref.</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-ink-muted font-medium">
                    Cargando catálogo de productos...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-ink-muted font-medium">
                    {items.length === 0
                      ? 'Aún no hay productos. Crea uno o importa tu catálogo desde Excel / CSV.'
                      : 'No hay productos que coincidan con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                visible.map((item) => {
                  const origenPropio = item.origen === 'fabricacion_propia';
                  const proveedorNombre = item.proveedor?.nombre || (origenPropio ? 'Hormiglass' : '-');

                  return (
                    <tr key={item.id} className="hover:bg-surface-muted transition">
                      {/* Código */}
                      <td className="py-3 px-4">
                        <CodeStamp>{item.codigo}</CodeStamp>
                        {item.codigo_proveedor && (
                          <div className="text-[11px] text-ink-muted font-mono mt-0.5">Ref: {item.codigo_proveedor}</div>
                        )}
                      </td>

                      {/* Nombre */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-ink">{item.nombre}</div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {item.es_demo && (
                            <StatusBadge tone="warning">DEMO</StatusBadge>
                          )}
                          {item.requiere_revision && (
                            <StatusBadge tone="warning">Revisión Bottai</StatusBadge>
                          )}
                          {item.observaciones && !item.requiere_revision && (
                            <span className="text-[11px] text-ink-muted italic line-clamp-1">{item.observaciones}</span>
                          )}
                        </div>
                      </td>

                      {/* Familia / Subcategoría */}
                      <td className="py-3 px-4 text-xs">
                        <div className="font-medium text-ink">{item.familia || '-'}</div>
                        {item.subcategoria && <div className="text-[11px] text-ink-muted">{item.subcategoria}</div>}
                      </td>

                      {/* Medidas / Color */}
                      <td className="py-3 px-4 text-xs">
                        <div className="text-ink">{item.medidas || '-'}</div>
                        {item.color && <div className="text-[11px] text-ink-muted">Color: {item.color}</div>}
                      </td>

                      {/* Origen */}
                      <td className="py-3 px-4">
                        <StatusBadge tone={origenPropio ? 'success' : 'info'}>
                          {origenPropio ? 'Fabricación Propia' : 'Reventa'}
                        </StatusBadge>
                      </td>

                      {/* Proveedor */}
                      <td className="py-3 px-4 text-xs font-medium text-ink">{proveedorNombre}</td>

                      {/* Precio Ref */}
                      <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-ink t-num">
                        ${Number(item.precio_referencia).toLocaleString('es-CL')}
                        <span className="block text-[11px] text-ink-muted font-sans font-normal">/{item.unidad}</span>
                      </td>

                      {/* Costo Ref */}
                      <td className="py-3 px-4 text-right font-mono text-xs text-ink-muted t-num">
                        ${Number(item.costo_referencia).toLocaleString('es-CL')}
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-4 text-center">
                        <StatusBadge tone={item.activo ? 'success' : 'neutral'}>
                          {item.activo ? 'Activo' : 'Inactivo'}
                        </StatusBadge>
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-right">
                        {isAdmin && (
                          <IconButton
                            icon={Pencil}
                            label="Editar producto"
                            onClick={() => edit(item)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal Formulario (Crear / Editar) */}
      <Dialog
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Editar producto en catálogo' : 'Nuevo producto en catálogo'}
        description="Parámetros técnicos, comerciales y origen del producto."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={saving} onClick={save}>
              {saving ? 'Guardando...' : 'Guardar producto'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          {error && (
            <p role="alert" className="t-caption rounded-md border border-danger-line bg-danger-soft p-3 text-danger font-medium">
              {error}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {/* Código */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Código interno *</label>
              <input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="HG-PAS-001 / BOT-100..."
                className="hg-field font-mono"
              />
            </div>

            {/* Código Proveedor */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Código proveedor</label>
              <input
                value={form.codigo_proveedor}
                onChange={(e) => setForm({ ...form, codigo_proveedor: e.target.value })}
                placeholder="Código catálogo fábrica"
                className="hg-field font-mono"
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Tipo de ítem</label>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value as Form['categoria'] })}
                className="hg-field"
              >
                <option value="producto">Producto</option>
                <option value="insumo">Insumo</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>

            {/* Nombre / Descripción */}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="text-xs font-semibold text-ink block mb-1">Descripción / Nombre del producto *</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Pastelón 40x40 gris liso..."
                className="hg-field font-semibold"
              />
            </div>

            {/* Origen */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Origen</label>
              <select
                value={form.origen}
                onChange={(e) => setForm({ ...form, origen: e.target.value as OrigenProducto })}
                className="hg-field"
              >
                <option value="fabricacion_propia">Fabricación Propia (Hormiglass)</option>
                <option value="reventa">Compra / Reventa</option>
              </select>
            </div>

            {/* Proveedor */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Proveedor</label>
              <select
                value={form.proveedor_id}
                onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}
                className="hg-field"
              >
                <option value="">Hormiglass / Ninguno</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Familia */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Familia comercial</label>
              <input
                value={form.familia}
                onChange={(e) => setForm({ ...form, familia: e.target.value })}
                placeholder="Tubos, Pastelones, Baldosas..."
                className="hg-field"
              />
            </div>

            {/* Subcategoría */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Subcategoría / Terminación</label>
              <input
                value={form.subcategoria}
                onChange={(e) => setForm({ ...form, subcategoria: e.target.value })}
                placeholder="Relieve, Pulida, Liso..."
                className="hg-field"
              />
            </div>

            {/* Unidad */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Unidad</label>
              <input
                value={form.unidad}
                onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                placeholder="unidad, m², saco, kg"
                className="hg-field"
              />
            </div>

            {/* Medidas */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Medidas</label>
              <input
                value={form.medidas}
                onChange={(e) => setForm({ ...form, medidas: e.target.value })}
                placeholder="40 x 40 x 4 cm"
                className="hg-field"
              />
            </div>

            {/* Color */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Color</label>
              <input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="Gris, Rojo, Negro..."
                className="hg-field"
              />
            </div>

            {/* Peso kg */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Peso kg</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.peso_kg}
                onChange={(e) => setForm({ ...form, peso_kg: e.target.value })}
                placeholder="Peso en kilogramos"
                className="hg-field t-num"
              />
            </div>

            {/* Precio venta ref */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Precio venta sin IVA (Ref.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precio_referencia}
                onChange={(e) => setForm({ ...form, precio_referencia: Number(e.target.value) })}
                className="hg-field t-num"
              />
            </div>

            {/* Costo ref */}
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Costo referencia</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costo_referencia}
                onChange={(e) => setForm({ ...form, costo_referencia: Number(e.target.value) })}
                className="hg-field t-num"
              />
            </div>

            {/* Observaciones */}
            <div className="sm:col-span-2 md:col-span-3">
              <label className="text-xs font-semibold text-ink block mb-1">Observaciones técnicas / comerciales</label>
              <input
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                placeholder="Fuente PDF Bottai, OCR, detalles..."
                className="hg-field"
              />
            </div>
          </div>

          {/* Checkboxes de estado */}
          <div className="p-3 bg-surface-muted border border-line rounded-lg space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-warning cursor-pointer">
              <input
                type="checkbox"
                checked={form.requiere_revision}
                onChange={(e) => setForm({ ...form, requiere_revision: e.target.checked })}
                className="accent-accent w-4 h-4 cursor-pointer"
              />
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-warning shrink-0" />
                <span>Requiere revisión (Precio referencial OCR o lista pendiente de validación)</span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="accent-accent w-4 h-4 cursor-pointer"
              />
              <span>Producto activo para cotizaciones y órdenes de compra</span>
            </label>
          </div>
        </div>
      </Dialog>

      {/* Modal de Importación Masiva (Excel / CSV) */}
      <Dialog
        open={showImport}
        onClose={closeImport}
        title="Previsualización de Importación Masiva"
        description="Revisa los productos detectados en el archivo antes de incorporarlos al catálogo."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeImport}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={saving || importErrors.length > 0 || preview.length === 0}
              onClick={importRows}
            >
              {saving ? 'Importando...' : `Confirmar e importar ${preview.length} productos`}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <p className="t-caption text-ink-muted">
            Se detectaron los productos en el archivo. Los códigos existentes se actualizarán y los nuevos se registrarán.
          </p>

          {error && (
            <p role="alert" className="t-caption rounded-md border border-danger-line bg-danger-soft p-3 text-danger font-medium">
              {error}
            </p>
          )}

          {importErrors.length > 0 && (
            <div className="rounded-md border border-danger-line bg-danger-soft p-3 space-y-1 text-xs text-danger max-h-36 overflow-auto">
              <p className="font-semibold">Se encontraron los siguientes errores o advertencias:</p>
              {importErrors.map((message) => (
                <p key={message}>• {message}</p>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold text-xs text-ink">
                  {preview.length} productos listos para importar ({preview.filter((p) => p.requiere_revision).length} marcados para revisión)
                </p>
              </div>
              <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="hg-table w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Descripción</th>
                      <th className="py-2.5 px-3">Familia</th>
                      <th className="py-2.5 px-3">Origen</th>
                      <th className="py-2.5 px-3">Proveedor</th>
                      <th className="py-2.5 px-3 text-right">Precio Ref.</th>
                      <th className="py-2.5 px-3 text-center">Revisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {preview.slice(0, 100).map((row, idx) => (
                      <tr key={`${row.codigo}-${idx}`} className="hover:bg-surface-muted">
                        <td className="py-2 px-3">
                          <CodeStamp>{row.codigo}</CodeStamp>
                        </td>
                        <td className="py-2 px-3 font-medium text-ink">{row.nombre}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.familia || '-'}</td>
                        <td className="py-2 px-3">
                          <StatusBadge tone={row.origen === 'fabricacion_propia' ? 'success' : 'info'}>
                            {row.origen === 'fabricacion_propia' ? 'Propia' : 'Reventa'}
                          </StatusBadge>
                        </td>
                        <td className="py-2 px-3 text-ink-muted">{row.proveedor_nombre || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono t-num text-ink">
                          ${row.precio_referencia.toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.requiere_revision ? (
                            <StatusBadge tone="warning">Sí</StatusBadge>
                          ) : (
                            <span className="text-ink-muted text-[11px]">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 100 && (
                  <div className="p-2.5 bg-surface-muted text-center text-xs text-ink-muted border-t border-line">
                    Mostrando los primeros 100 de {preview.length} productos en la vista previa.
                  </div>
                )}
              </div>
            </>
          )}

          {preview.length === 0 && importErrors.length === 0 && (
            <p className="t-caption text-ink-muted">El archivo no contiene productos.</p>
          )}
        </div>
      </Dialog>
    </div>
  );
}
