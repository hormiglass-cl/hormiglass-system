'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Download,
  FileDown,
  FlaskConical,
  Factory,
  Package,
  Plus,
  Power,
  Search,
  Store,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type { OrigenProducto, ProductoCatalogo, Proveedor } from '../../lib/types';
import { parseProductosFile, type ProductoImportado } from '../../lib/productos-csv';
import { prefijoCodigo, siguienteCodigo } from '../../lib/productos';
import { useAuth } from '../../lib/context/AuthContext';
import { mensajeError } from '../../lib/errores';
import { Pagination } from '../../components/Pagination';
import { ActionMenu, ActionMenuItem, Button, CodeStamp, Dialog, Panel, StatusBadge, type Tone } from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { Select } from '../../components/ui/FormControls';
import { MetricCard } from '../../components/ui/MetricCard';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { ColumnMenu, useColumnPrefs } from '../../components/ui/ColumnMenu';
import { FloatingActionBar } from '../../components/ui/FloatingActionBar';
import {
  FilterMenu,
  FilterBar,
  useFilterUi,
  matchMultiFilter,
  matchNumberFilter,
  type FilterDefinition,
} from '../../components/ui/FilterPills';

type Categoria = ProductoCatalogo['categoria'];

type Form = {
  codigo: string;
  codigo_proveedor: string;
  nombre: string;
  descripcion: string;
  categoria: Categoria;
  familia: string;
  subcategoria: string;
  origen: OrigenProducto;
  proveedor_id: string;
  unidad: string;
  medidas: string;
  color: string;
  peso_kg: string;
  precio_referencia: string;
  costo_referencia: string;
  observaciones: string;
  requiere_revision: boolean;
  activo: boolean;
};

const emptyForm: Form = {
  codigo: '',
  codigo_proveedor: '',
  nombre: '',
  descripcion: '',
  categoria: 'producto',
  familia: '',
  subcategoria: '',
  origen: 'fabricacion_propia',
  proveedor_id: '',
  unidad: 'unidad',
  medidas: '',
  color: '',
  peso_kg: '',
  precio_referencia: '',
  costo_referencia: '',
  observaciones: '',
  requiere_revision: false,
  activo: true,
};

const CATEGORIA_LABEL: Record<Categoria, string> = {
  producto: 'Producto',
  insumo: 'Insumo',
  servicio: 'Servicio',
};

const ORIGEN_LABEL: Record<OrigenProducto, string> = {
  fabricacion_propia: 'Fabricación propia',
  reventa: 'Reventa',
};

const UNIDADES = ['unidad', 'm²', 'm', 'ml', 'm³', 'kg', 'saco', 'litro', 'juego', 'jornada'];

type ProductoCol =
  | 'codigo'
  | 'nombre'
  | 'familia'
  | 'subcategoria'
  | 'medidas'
  | 'color'
  | 'proveedor'
  | 'unidad'
  | 'precio'
  | 'costo'
  | 'codigoProveedor'
  | 'estado';

const PRODUCTO_COL_ORDER: ProductoCol[] = [
  'codigo',
  'nombre',
  'familia',
  'subcategoria',
  'medidas',
  'color',
  'proveedor',
  'unidad',
  'precio',
  'costo',
  'codigoProveedor',
  'estado',
];

const DEFAULT_COLUMNS: Record<ProductoCol, boolean> = {
  codigo: true,
  nombre: true,
  familia: true,
  subcategoria: true,
  medidas: true,
  color: true,
  proveedor: true,
  unidad: true,
  precio: true,
  costo: true,
  codigoProveedor: false,
  estado: true,
};

const PRODUCTO_COL_LABELS: Record<ProductoCol, string> = {
  codigo: 'Código',
  nombre: 'Producto',
  familia: 'Familia',
  subcategoria: 'Subcategoría',
  medidas: 'Medidas',
  color: 'Color',
  proveedor: 'Proveedor',
  unidad: 'Unidad',
  precio: 'Precio ref.',
  costo: 'Costo ref.',
  codigoProveedor: 'Código proveedor',
  estado: 'Estado',
};

const PRODUCTO_COL_WIDTH: Record<ProductoCol, string> = {
  codigo: 'min-w-[120px]',
  nombre: 'min-w-[240px]',
  familia: 'min-w-[110px]',
  subcategoria: 'min-w-[130px]',
  medidas: 'min-w-[140px]',
  color: 'min-w-[100px]',
  proveedor: 'min-w-[140px]',
  unidad: 'min-w-[80px]',
  precio: 'min-w-[110px]',
  costo: 'min-w-[110px]',
  codigoProveedor: 'min-w-[130px]',
  estado: 'min-w-[90px]',
};

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/** Motivos por los que una fila importada debería revisarse (se muestran en la vista previa y se guardan en observaciones). */
function avisosImportacion(row: ProductoImportado): string[] {
  const avisos: string[] = [];
  if (!row.familia) avisos.push('Sin familia');
  if (!row.medidas) avisos.push('Sin medidas');
  if (!(Number(row.precio_referencia) > 0)) avisos.push('Sin precio de referencia');
  if ((row.origen ?? 'reventa') === 'reventa' && !row.proveedor_id) avisos.push('Reventa sin proveedor reconocido');
  if (/^PROD-\d+$/.test(row.codigo)) avisos.push('Código asignado automáticamente');
  return avisos;
}

function unicos(valores: (string | null | undefined)[]): string[] {
  return [...new Set(valores.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}

export default function ProductosPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const filterUi = useFilterUi();
  const isAdmin = currentUser?.rol === 'admin';

  const [items, setItems] = useState<ProductoCatalogo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Columnas: visibilidad y orden (se recuerdan en este navegador)
  const colPrefs = useColumnPrefs<ProductoCol>('hormiglass_producto_cols_v2', PRODUCTO_COL_ORDER, DEFAULT_COLUMNS);

  // Formulario
  const [revisionProducto, setRevisionProducto] = useState<ProductoCatalogo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [codigoManual, setCodigoManual] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Importación
  const [showImport, setShowImport] = useState(false);
  const [preview, setPreview] = useState<ProductoImportado[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [prodRes, provRes] = await Promise.all([
      supabase.from('catalogo_productos').select('*, proveedor:proveedores(id, nombre, rut)').order('codigo'),
      supabase.from('proveedores').select('*').order('nombre'),
    ]);
    if (prodRes.error) {
      setLoadError(mensajeError(prodRes.error, 'No se pudo cargar el catálogo. Reintenta más tarde.'));
    } else {
      setLoadError(null);
      setItems((prodRes.data || []) as ProductoCatalogo[]);
    }
    if (provRes.data) setProveedores(provRes.data as Proveedor[]);
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
      if (p.nombre.toLowerCase().includes('macbal')) map['MACBAL'] = p.id;
    }
    return map;
  }, [proveedores]);

  const proveedorPorId = useMemo(() => new Map(proveedores.map((p) => [p.id, p])), [proveedores]);

  // ───── Filtros ─────
  const filterDefinitions: FilterDefinition[] = useMemo(() => {
    const opciones = (valores: (string | null | undefined)[]) => unicos(valores).map((v) => ({ value: v, label: v }));
    return [
      { id: 'familia', label: 'Familia', allLabel: 'Todas las familias', options: opciones(items.map((i) => i.familia)) },
      {
        id: 'subcategoria',
        label: 'Subcategoría',
        allLabel: 'Todas las subcategorías',
        options: opciones(items.map((i) => i.subcategoria)),
      },
      {
        id: 'categoria',
        label: 'Tipo',
        allLabel: 'Todos los tipos',
        options: (Object.keys(CATEGORIA_LABEL) as Categoria[]).map((v) => ({ value: v, label: CATEGORIA_LABEL[v] })),
      },
      {
        id: 'origen',
        label: 'Origen',
        allLabel: 'Todos los orígenes',
        options: (Object.keys(ORIGEN_LABEL) as OrigenProducto[]).map((v) => ({ value: v, label: ORIGEN_LABEL[v] })),
      },
      {
        id: 'proveedor',
        label: 'Proveedor',
        allLabel: 'Todos los proveedores',
        options: [
          { value: 'propio', label: 'Sin proveedor (propio)' },
          ...proveedores.map((p) => ({ value: p.id, label: p.nombre })),
        ],
      },
      { id: 'color', label: 'Color', allLabel: 'Todos los colores', options: opciones(items.map((i) => i.color)) },
      {
        id: 'estado',
        label: 'Estado',
        allLabel: 'Todos los estados',
        options: [
          { value: 'revisar', label: 'Por revisar' },
          { value: 'revisado', label: 'Revisados' },
          { value: 'activo', label: 'Activos' },
          { value: 'inactivo', label: 'Inactivos' },
        ],
      },
      { id: 'precio', label: 'Precio ref.', type: 'number', options: [] },
      { id: 'costo', label: 'Costo ref.', type: 'number', options: [] },
    ];
  }, [items, proveedores]);

  const filtered = useMemo(() => {
    const q = search
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
    return items.filter((p) => {
      if (q) {
        const texto = [p.codigo, p.codigo_proveedor, p.nombre, p.familia, p.subcategoria, p.medidas, p.color, p.proveedor?.nombre]
          .filter(Boolean)
          .join(' ')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return (
        matchMultiFilter(activeFilters.familia, (v) => p.familia === v) &&
        matchMultiFilter(activeFilters.subcategoria, (v) => p.subcategoria === v) &&
        matchMultiFilter(activeFilters.categoria, (v) => p.categoria === v) &&
        matchMultiFilter(activeFilters.origen, (v) => (p.origen ?? 'fabricacion_propia') === v) &&
        matchMultiFilter(activeFilters.proveedor, (v) => (v === 'propio' ? !p.proveedor_id : p.proveedor_id === v)) &&
        matchMultiFilter(activeFilters.color, (v) => p.color === v) &&
        matchMultiFilter(activeFilters.estado, (v) =>
          v === 'revisar' ? !!p.requiere_revision : v === 'revisado' ? !p.requiere_revision : v === 'activo' ? p.activo : !p.activo,
        ) &&
        matchNumberFilter(activeFilters.precio, Number(p.precio_referencia) || 0) &&
        matchNumberFilter(activeFilters.costo, Number(p.costo_referencia) || 0)
      );
    });
  }, [items, search, activeFilters]);

  const totalItems = filtered.length;
  const from = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(from, from + itemsPerPage);

  // ───── KPIs ─────
  const toggleKpiFilter = (id: string, value: string) => {
    setCurrentPage(1);
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const kpiTiles: {
    key: string;
    label: string;
    value: number;
    icon: LucideIcon;
    tone?: Tone;
    filter?: [string, string];
  }[] = useMemo(
    () => [
      { key: 'total', label: 'Total catálogo', value: items.length, icon: Boxes },
      {
        key: 'productos',
        label: 'Productos',
        value: items.filter((i) => i.categoria === 'producto').length,
        icon: Package,
        tone: 'accent',
        filter: ['categoria', 'producto'],
      },
      {
        key: 'insumos',
        label: 'Insumos',
        value: items.filter((i) => i.categoria === 'insumo').length,
        icon: FlaskConical,
        tone: 'info',
        filter: ['categoria', 'insumo'],
      },
      {
        key: 'propia',
        label: 'Fabricación propia',
        value: items.filter((i) => (i.origen ?? 'fabricacion_propia') === 'fabricacion_propia').length,
        icon: Factory,
        tone: 'success',
        filter: ['origen', 'fabricacion_propia'],
      },
      {
        key: 'reventa',
        label: 'Reventa',
        value: items.filter((i) => i.origen === 'reventa').length,
        icon: Store,
        filter: ['origen', 'reventa'],
      },
      {
        key: 'revision',
        label: 'Por revisar',
        value: items.filter((i) => i.requiere_revision).length,
        icon: ClipboardCheck,
        tone: 'warning',
        filter: ['estado', 'revisar'],
      },
    ],
    [items],
  );

  // ───── Selección ─────
  const isAllSelected = filtered.length > 0 && selectedIds.length === filtered.length;
  const toggleSelectAll = () => setSelectedIds(isAllSelected ? [] : filtered.map((p) => p.id));
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const bulkUpdate = async (patch: Partial<Pick<ProductoCatalogo, 'activo' | 'requiere_revision'>>, mensaje: string) => {
    const { error } = await supabase.from('catalogo_productos').update(patch).in('id', selectedIds);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
      return;
    }
    toast({ message: mensaje, tone: 'success' });
    setSelectedIds([]);
    await load();
  };

  const deleteSelected = async () => {
    const ok = await confirmDialog({
      title: 'Eliminar productos',
      message: `¿Seguro que deseas eliminar los ${selectedIds.length} productos seleccionados? Si alguno ya se usa en cotizaciones u órdenes, se recomienda desactivarlo en su lugar.`,
      confirmLabel: 'Eliminar selección',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('catalogo_productos').delete().in('id', selectedIds);
    if (error) {
      toast({
        message: mensajeError(error, 'No se pudieron eliminar. Probablemente están en uso: desactívalos en su lugar.'),
        tone: 'danger',
      });
      return;
    }
    toast({ message: `${selectedIds.length} producto(s) eliminados.`, tone: 'success' });
    setSelectedIds([]);
    await load();
  };

  // ───── Formulario ─────
  const proveedorForm = form.proveedor_id ? proveedorPorId.get(form.proveedor_id) : undefined;
  const prefijo = useMemo(
    () => prefijoCodigo(form.origen, proveedorForm?.nombre, form.familia),
    [form.origen, form.familia, proveedorForm?.nombre],
  );
  const sugerencia = useMemo(
    () =>
      siguienteCodigo(
        prefijo,
        items.map((i) => i.codigo),
      ),
    [prefijo, items],
  );
  const codigoMostrado = editingId || codigoManual ? form.codigo : sugerencia.codigo;
  const patch = (cambios: Partial<Form>) => setForm((prev) => ({ ...prev, ...cambios }));

  const familiasExistentes = useMemo(() => unicos(items.map((i) => i.familia)), [items]);
  const subcategoriasExistentes = useMemo(
    () => unicos(items.filter((i) => !form.familia || i.familia === form.familia).map((i) => i.subcategoria)),
    [items, form.familia],
  );
  const coloresExistentes = useMemo(() => unicos(items.map((i) => i.color)), [items]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCodigoManual(false);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (item: ProductoCatalogo) => {
    setEditingId(item.id);
    setCodigoManual(true);
    setForm({
      codigo: item.codigo,
      codigo_proveedor: item.codigo_proveedor || '',
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      categoria: item.categoria,
      familia: item.familia || '',
      subcategoria: item.subcategoria || '',
      origen: item.origen || (item.proveedor_id ? 'reventa' : 'fabricacion_propia'),
      proveedor_id: item.proveedor_id || '',
      unidad: item.unidad || 'unidad',
      medidas: item.medidas || '',
      color: item.color || '',
      peso_kg: item.peso_kg ? String(item.peso_kg) : '',
      precio_referencia: item.precio_referencia ? String(item.precio_referencia) : '',
      costo_referencia: item.costo_referencia ? String(item.costo_referencia) : '',
      observaciones: item.observaciones || '',
      requiere_revision: !!item.requiere_revision,
      activo: item.activo,
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setCodigoManual(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setFormError('Solo administración puede modificar el catálogo.');
      return;
    }
    const codigo = codigoMostrado.trim().toUpperCase();
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.');
    if (!form.familia.trim()) return setFormError('Indica la familia del producto.');
    if (form.origen === 'reventa' && !form.proveedor_id) return setFormError('Un producto de reventa necesita proveedor.');
    if (!codigo) return setFormError('El código interno es obligatorio.');
    if (items.some((i) => i.codigo === codigo && i.id !== editingId)) {
      return setFormError(`El código ${codigo} ya existe. Usa el sugerido: ${sugerencia.codigo}.`);
    }

    setSaving(true);
    setFormError('');
    const payload = {
      codigo,
      codigo_proveedor: form.origen === 'reventa' ? form.codigo_proveedor.trim() || null : null,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria,
      familia: form.familia.trim(),
      subcategoria: form.subcategoria.trim() || null,
      origen: form.origen,
      proveedor_id: form.origen === 'reventa' ? form.proveedor_id : null,
      unidad: form.unidad.trim() || 'unidad',
      medidas: form.medidas.trim() || null,
      color: form.color.trim() || null,
      peso_kg: form.peso_kg ? Number(form.peso_kg.replace(',', '.')) : null,
      precio_referencia: Number(form.precio_referencia.replace(',', '.')) || 0,
      costo_referencia: Number(form.costo_referencia.replace(',', '.')) || 0,
      observaciones: form.observaciones.trim() || null,
      requiere_revision: form.requiere_revision,
      activo: form.activo,
    };

    const result = editingId
      ? await supabase.from('catalogo_productos').update(payload).eq('id', editingId)
      : await supabase.from('catalogo_productos').insert({ ...payload, es_demo: false });
    setSaving(false);

    if (result.error) {
      setFormError(mensajeError(result.error));
      return;
    }
    toast({ message: editingId ? 'Producto actualizado.' : `Producto ${codigo} creado.`, tone: 'success' });
    closeForm();
    await load();
  };

  // ───── Importación ─────
  const downloadTemplate = () => {
    const csv =
      'Código interno;Código proveedor;Nombre;Descripción;Tipo;Familia;Subcategoría;Medidas;Color;Unidad;Precio ref. sin IVA;Costo ref.;Peso kg;Origen;Proveedor;Observaciones;requiere_revision;activo\n' +
      ';;Pastelón liso;;producto;Pastelones;;60 x 30 cm;Gris;unidad;14500;9000;;Fabricación propia;;;no;si\n' +
      ';100101103;Tubo circular CTE;;producto;Tubos;Circular CTE;Ø 150 mm x 1 m;;unidad;8882;6200;;Reventa;Bottai;;si;si\n';
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'plantilla-productos-hormiglass.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportProductos = () => {
    const filas = selectedIds.length ? items.filter((i) => selectedIds.includes(i.id)) : filtered;
    if (!filas.length) {
      toast({ message: 'No hay productos para exportar con los filtros actuales.', tone: 'warning' });
      return;
    }
    const celda = (v: unknown) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const encabezado =
      'Código interno;Código proveedor;Nombre;Descripción;Tipo;Familia;Subcategoría;Medidas;Color;Unidad;Precio ref. sin IVA;Costo ref.;Peso kg;Origen;Proveedor;Observaciones;requiere_revision;activo';
    const lineas = filas.map((p) =>
      [
        p.codigo,
        p.codigo_proveedor,
        p.nombre,
        p.descripcion,
        p.categoria,
        p.familia,
        p.subcategoria,
        p.medidas,
        p.color,
        p.unidad,
        p.precio_referencia,
        p.costo_referencia,
        p.peso_kg,
        ORIGEN_LABEL[p.origen ?? 'fabricacion_propia'],
        p.proveedor?.nombre,
        p.observaciones,
        p.requiere_revision ? 'si' : 'no',
        p.activo ? 'si' : 'no',
      ]
        .map(celda)
        .join(';'),
    );
    const url = URL.createObjectURL(new Blob(['\uFEFF', [encabezado, ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `productos-hormiglass-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({ message: `${filas.length} producto(s) exportados.`, tone: 'success' });
  };

  const handleFileSelected = async (file: File) => {
    try {
      const result = await parseProductosFile(file, proveedoresMap);
      setPreview(result.rows);
      setImportErrors(result.errors);
    } catch (err) {
      setPreview([]);
      setImportErrors([err instanceof Error ? err.message : 'Error al leer el archivo.']);
    }
  };

  const closeImport = () => {
    setShowImport(false);
    setPreview([]);
    setImportErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const importRows = async () => {
    if (!isAdmin || !preview.length || importErrors.length) return;
    setSaving(true);
    // Códigos automáticos (PROD-0001) → se reemplazan por el siguiente número libre de su prefijo.
    const usados = items.map((i) => i.codigo);
    const payloads = preview.map((row) => {
      let codigo = row.codigo;
      if (/^PROD-\d+$/.test(codigo)) {
        const proveedorNombre = row.proveedor_id ? proveedorPorId.get(row.proveedor_id)?.nombre : undefined;
        const pref = prefijoCodigo(row.origen || 'reventa', proveedorNombre, row.familia || '');
        codigo = siguienteCodigo(pref, usados).codigo;
        usados.push(codigo);
      }
      const avisos = avisosImportacion(row).filter((a) => a !== 'Código asignado automáticamente');
      return {
        codigo,
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
        observaciones:
          [row.observaciones, avisos.length ? `Importación: ${avisos.join('; ')}.` : null].filter(Boolean).join(' ') || null,
        requiere_revision: !!row.requiere_revision || avisos.length > 0,
        activo: row.activo,
        es_demo: false,
      };
    });

    let importError = null;
    for (let b = 0; b < payloads.length; b += 50) {
      const { error } = await supabase.from('catalogo_productos').upsert(payloads.slice(b, b + 50), { onConflict: 'codigo' });
      if (error) {
        importError = error;
        break;
      }
    }
    setSaving(false);
    if (importError) {
      setImportErrors([mensajeError(importError)]);
      return;
    }
    toast({ message: `Se importaron ${preview.length} productos al catálogo.`, tone: 'success' });
    closeImport();
    await load();
  };

  const visibleColCount = 1 + colPrefs.visibleOrder.length;
  const proveedorOptions = proveedores.map((p) => ({ value: p.id, label: p.nombre, hint: p.rut }));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1">
        {kpiTiles.map((k) => (
          <MetricCard
            key={k.key}
            compact
            className="min-w-[140px] flex-1"
            title={k.label}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            active={k.filter ? activeFilters[k.filter[0]] === k.filter[1] : false}
            onClick={k.filter ? () => toggleKpiFilter(k.filter![0], k.filter![1]) : undefined}
          />
        ))}
      </div>

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              aria-label="Buscar productos"
              placeholder="Buscar por nombre, código, familia, proveedor..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="min-h-9 w-full rounded-lg border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink shadow-[var(--hg-shadow-card)] placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
          <ColumnMenu labels={PRODUCTO_COL_LABELS} prefs={colPrefs} locked={['nombre']} />
          <FilterMenu
            triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
            filters={filterDefinitions}
            activeFilters={activeFilters}
            ui={filterUi}
          />
        </div>

        <div className="ml-auto">
          <ActionMenu label="Acciones de productos">
            {isAdmin && (
              <ActionMenuItem icon={Plus} onClick={openNew}>
                Nuevo producto
              </ActionMenuItem>
            )}
            {isAdmin && (
              <ActionMenuItem icon={Upload} onClick={() => setShowImport(true)}>
                Importar
              </ActionMenuItem>
            )}
            <ActionMenuItem icon={FileDown} onClick={exportProductos}>
              {selectedIds.length > 0 ? `Exportar selección (${selectedIds.length})` : 'Exportar'}
            </ActionMenuItem>
            {isAdmin && (
              <ActionMenuItem icon={Download} onClick={downloadTemplate}>
                Descargar plantilla
              </ActionMenuItem>
            )}
          </ActionMenu>
        </div>
      </div>

      <FilterBar
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => {
          setCurrentPage(1);
          setActiveFilters((prev) => ({ ...prev, [id]: val }));
        }}
        onClearAll={() => {
          setActiveFilters({});
          setSearch('');
        }}
        ui={filterUi}
      />

      {loadError && (
        <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {loadError}
        </div>
      )}

      <Panel className="overflow-hidden">
        {/* Móvil */}
        <div className="divide-y divide-line-subtle md:hidden">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando catálogo…</p>
          ) : paginated.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron productos.</p>
          ) : (
            paginated.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => openEdit(p)}
                className="flex w-full items-center gap-2.5 p-3 text-left transition hover:bg-surface-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.nombre}</span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {[p.codigo, p.medidas, p.color].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <span className="t-num shrink-0 text-xs font-semibold text-ink">{clp.format(Number(p.precio_referencia) || 0)}</span>
              </button>
            ))
          )}
        </div>

        {/* Escritorio */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-surface-muted/60 text-xs font-medium text-ink-muted">
                <th className="w-10 px-3 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    aria-label="Seleccionar todos los productos"
                    className="cursor-pointer rounded accent-accent"
                  />
                </th>
                {colPrefs.visibleOrder.map((k) => (
                  <th
                    key={k}
                    className={`px-3 py-3 font-medium ${PRODUCTO_COL_WIDTH[k]} ${k === 'precio' || k === 'costo' ? 'text-right' : ''}`}
                  >
                    {PRODUCTO_COL_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-ink">
              {loading ? (
                [...Array(8)].map((_, idx) => (
                  <tr key={`skel-${idx}`} className="animate-pulse">
                    {Array.from({ length: visibleColCount }).map((__, i) => (
                      <td key={i} className="px-3 py-3">
                        <div className="hg-skeleton h-3.5 w-24 rounded bg-surface-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="py-8 text-center font-medium text-ink-muted">
                    No se encontraron productos con esos filtros.
                  </td>
                </tr>
              ) : (
                paginated.map((p) => {
                  const selected = selectedIds.includes(p.id);
                  const cells: Record<ProductoCol, React.ReactNode> = {
                    codigo: (
                      <td className="px-3 py-3">
                        <CodeStamp>{p.codigo}</CodeStamp>
                      </td>
                    ),
                    nombre: (
                      <td className="px-3 py-3">
                        <span className="font-semibold text-ink">{p.nombre}</span>
                      </td>
                    ),
                    familia: <td className="px-3 py-3">{p.familia || <span className="text-ink-muted">—</span>}</td>,
                    subcategoria: (
                      <td className="px-3 py-3">{p.subcategoria || <span className="text-ink-muted">—</span>}</td>
                    ),
                    medidas: (
                      <td className="px-3 py-3">
                        {p.medidas ? <span className="t-num">{p.medidas}</span> : <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    color: <td className="px-3 py-3">{p.color || <span className="text-ink-muted">—</span>}</td>,
                    proveedor: (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {p.proveedor ? (
                          <Link href={`/proveedores/${p.proveedor.id}`} className="hover:text-accent-ink hover:underline">
                            {p.proveedor.nombre}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">Propio</span>
                        )}
                      </td>
                    ),
                    codigoProveedor: (
                      <td className="px-3 py-3">
                        {p.codigo_proveedor ? <span className="t-num">{p.codigo_proveedor}</span> : <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    unidad: <td className="px-3 py-3 text-ink-muted">{p.unidad}</td>,
                    precio: (
                      <td className="t-num px-3 py-3 text-right">
                        {Number(p.precio_referencia) > 0 ? clp.format(Number(p.precio_referencia)) : <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    costo: (
                      <td className="t-num px-3 py-3 text-right">
                        {Number(p.costo_referencia) > 0 ? clp.format(Number(p.costo_referencia)) : <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                    estado: (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {p.requiere_revision ? (
                          <button
                            type="button"
                            onClick={() => setRevisionProducto(p)}
                            aria-label={`Ver qué revisar de ${p.nombre}`}
                            className="rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <StatusBadge tone="warning">Por revisar</StatusBadge>
                          </button>
                        ) : (
                          <StatusBadge tone={p.activo ? 'success' : 'neutral'}>{p.activo ? 'Activo' : 'Inactivo'}</StatusBadge>
                        )}
                      </td>
                    ),
                  };
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openEdit(p)}
                      className={`cursor-pointer border-b border-line-subtle transition hover:bg-surface-muted/60 ${selected ? 'bg-surface-muted/90' : ''} ${p.activo ? '' : 'opacity-60'}`}
                    >
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Seleccionar ${p.nombre}`}
                          className="cursor-pointer rounded accent-accent"
                        />
                      </td>
                      {colPrefs.visibleOrder.map((k) => (
                        <React.Fragment key={k}>{cells[k]}</React.Fragment>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </Panel>

      {/* Nuevo / editar producto */}
      <Dialog
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Editar producto' : 'Nuevo producto'}
        description={isAdmin ? undefined : 'Solo administración puede modificar el catálogo.'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            {isAdmin && (
              <Button variant="primary" type="submit" form="form-producto" disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear producto'}
              </Button>
            )}
          </>
        }
      >
        <form id="form-producto" onSubmit={save} className="space-y-4 text-xs">
          {formError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-danger-line bg-danger-soft p-3 text-xs font-semibold text-danger"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {editingId && form.requiere_revision && (
            <div className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Pendiente de revisión</p>
                <p>{form.observaciones || 'Sin detalle. Revisa los datos y desmarca "Requiere revisión" en Más opciones.'}</p>
              </div>
            </div>
          )}
          <fieldset disabled={!isAdmin} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block font-semibold text-ink">Tipo</label>
                <Select value={form.categoria} onChange={(e) => patch({ categoria: e.target.value as Categoria })}>
                  {(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Origen</label>
                <Select
                  value={form.origen}
                  onChange={(e) => {
                    const origen = e.target.value as OrigenProducto;
                    patch({ origen, proveedor_id: origen === 'reventa' ? form.proveedor_id : '' });
                  }}
                >
                  {(Object.keys(ORIGEN_LABEL) as OrigenProducto[]).map((o) => (
                    <option key={o} value={o}>
                      {ORIGEN_LABEL[o]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">
                  Proveedor {form.origen === 'reventa' && '*'}
                </label>
                {form.origen === 'reventa' ? (
                  <SearchSelect
                    value={form.proveedor_id}
                    onChange={(v) => patch({ proveedor_id: v })}
                    options={proveedorOptions}
                    placeholder="Seleccionar proveedor"
                    searchPlaceholder="Buscar proveedor..."
                  />
                ) : (
                  <p className="hg-field-compact flex w-full items-center text-ink-muted">Fabricación propia</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-semibold text-ink">Familia *</label>
                <input
                  list="productos-familias"
                  value={form.familia}
                  onChange={(e) => patch({ familia: e.target.value })}
                  placeholder="Ej. Pastelones"
                  className="hg-field-compact w-full"
                />
                <datalist id="productos-familias">
                  {familiasExistentes.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Subcategoría</label>
                <input
                  list="productos-subcategorias"
                  value={form.subcategoria}
                  onChange={(e) => patch({ subcategoria: e.target.value })}
                  placeholder="Ej. Pulida lisa, Tipo C"
                  className="hg-field-compact w-full"
                />
                <datalist id="productos-subcategorias">
                  {subcategoriasExistentes.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-ink">Nombre *</label>
              <input
                value={form.nombre}
                onChange={(e) => patch({ nombre: e.target.value })}
                placeholder="Ej. Pastelón liso (sin medidas ni color)"
                className="hg-field-compact w-full"
              />
              <p className="mt-1 t-caption text-ink-muted">Las medidas y el color van en sus propios campos.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block font-semibold text-ink">Medidas</label>
                <input
                  value={form.medidas}
                  onChange={(e) => patch({ medidas: e.target.value })}
                  placeholder="Ej. 40 x 40 x 4 cm"
                  className="hg-field-compact w-full t-num"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Color</label>
                <input
                  list="productos-colores"
                  value={form.color}
                  onChange={(e) => patch({ color: e.target.value })}
                  placeholder="Ej. Gris"
                  className="hg-field-compact w-full"
                />
                <datalist id="productos-colores">
                  {coloresExistentes.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Unidad</label>
                <input
                  list="productos-unidades"
                  value={form.unidad}
                  onChange={(e) => patch({ unidad: e.target.value })}
                  className="hg-field-compact w-full"
                />
                <datalist id="productos-unidades">
                  {UNIDADES.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block font-semibold text-ink">Precio de referencia (sin IVA)</label>
                <input
                  inputMode="decimal"
                  value={form.precio_referencia}
                  onChange={(e) => patch({ precio_referencia: e.target.value })}
                  placeholder="0"
                  className="hg-field-compact w-full t-num"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-ink">Costo de referencia</label>
                <input
                  inputMode="decimal"
                  value={form.costo_referencia}
                  onChange={(e) => patch({ costo_referencia: e.target.value })}
                  placeholder="0"
                  className="hg-field-compact w-full t-num"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-ink">Descripción</label>
              <textarea
                rows={2}
                value={form.descripcion}
                onChange={(e) => patch({ descripcion: e.target.value })}
                placeholder="Detalles adicionales: terminación, resistencia, uso…"
                className="hg-field-compact w-full"
              />
            </div>

            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <label className="mb-1 block font-semibold text-ink">Código interno</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={codigoMostrado}
                  onChange={(e) => {
                    setCodigoManual(true);
                    patch({ codigo: e.target.value.toUpperCase() });
                  }}
                  className="hg-field-compact w-56 t-num"
                  aria-label="Código interno"
                />
                {!editingId && codigoManual && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCodigoManual(false);
                      patch({ codigo: '' });
                    }}
                  >
                    Usar sugerido ({sugerencia.codigo})
                  </Button>
                )}
              </div>
              <p className="mt-1.5 t-caption text-ink-muted">
                Formato {prefijo}-000.{' '}
                {sugerencia.ultimo
                  ? `El último de esta serie es ${sugerencia.ultimo}; el siguiente es ${sugerencia.codigo}.`
                  : `Será el primero de la serie ${prefijo}.`}
              </p>
            </div>

            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer font-semibold text-ink">Más opciones</summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {form.origen === 'reventa' && (
                    <div>
                      <label className="mb-1 block font-semibold text-ink">Código del proveedor</label>
                      <input
                        value={form.codigo_proveedor}
                        onChange={(e) => patch({ codigo_proveedor: e.target.value })}
                        className="hg-field-compact w-full t-num"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block font-semibold text-ink">Peso (kg)</label>
                    <input
                      inputMode="decimal"
                      value={form.peso_kg}
                      onChange={(e) => patch({ peso_kg: e.target.value })}
                      className="hg-field-compact w-full t-num"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-ink">Observaciones internas</label>
                  <textarea
                    rows={2}
                    value={form.observaciones}
                    onChange={(e) => patch({ observaciones: e.target.value })}
                    className="hg-field-compact w-full"
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-ink">
                  <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={form.requiere_revision}
                      onChange={(e) => patch({ requiere_revision: e.target.checked })}
                      className="rounded accent-accent"
                    />
                    Requiere revisión
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => patch({ activo: e.target.checked })}
                      className="rounded accent-accent"
                    />
                    Producto activo
                  </label>
                </div>
              </div>
            </details>
          </fieldset>
        </form>
      </Dialog>

      {/* Qué revisar */}
      <Dialog
        open={!!revisionProducto}
        onClose={() => setRevisionProducto(null)}
        title="Qué hay que revisar"
        description={revisionProducto ? `${revisionProducto.codigo} · ${revisionProducto.nombre}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevisionProducto(null)}>
              Cerrar
            </Button>
            {revisionProducto && (
              <Button
                variant="primary"
                onClick={() => {
                  const p = revisionProducto;
                  setRevisionProducto(null);
                  openEdit(p);
                }}
              >
                {isAdmin ? 'Abrir y corregir' : 'Ver producto'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex items-start gap-2 rounded-md border border-warning-line bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{revisionProducto?.observaciones || 'Sin detalle registrado. Revisa nombre, medidas y precio.'}</p>
        </div>
        {revisionProducto && (
          <p className="mt-3 t-caption text-ink-muted">
            Cuando esté corregido, abre el producto y desmarca &quot;Requiere revisión&quot; en Más opciones, o usa
            &quot;Marcar revisados&quot; con la selección múltiple.
          </p>
        )}
      </Dialog>

      {/* Importar */}
      <Dialog
        open={showImport}
        onClose={closeImport}
        title="Importar productos (CSV / Excel)"
        description="Las filas sin código reciben automáticamente el siguiente número libre de su serie."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeImport}>
              Cerrar
            </Button>
            {preview.length > 0 && importErrors.length === 0 && (
              <Button variant="primary" onClick={() => void importRows()} disabled={saving}>
                {saving ? 'Importando...' : `Importar (${preview.length})`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-dashed border-line bg-surface p-6 text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-accent-ink" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
              }}
              className="block w-full cursor-pointer text-xs text-ink file:mr-4 file:rounded-md file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-xs file:font-semibold file:text-accent-ink"
            />
          </div>
          {importErrors.length > 0 && (
            <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-danger-line bg-danger-soft p-3 text-xs text-danger">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Hay observaciones que impiden importar:</span>
              </div>
              {importErrors.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}
          {preview.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-lg border border-line">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line font-medium text-ink-muted">
                    <th className="px-3 py-2.5 font-medium">Código</th>
                    <th className="px-3 py-2.5 font-medium">Nombre</th>
                    <th className="px-3 py-2.5 font-medium">Familia</th>
                    <th className="px-3 py-2.5 font-medium">Medidas</th>
                    <th className="px-3 py-2.5 font-medium">Color</th>
                    <th className="px-3 py-2.5 font-medium">A revisar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {preview.slice(0, 50).map((row, idx) => (
                    <tr key={`${row.codigo}-${idx}`}>
                      <td className="px-3 py-2">
                        <CodeStamp>{row.codigo}</CodeStamp>
                      </td>
                      <td className="px-3 py-2 font-medium text-ink">{row.nombre}</td>
                      <td className="px-3 py-2 text-ink-muted">{row.familia || '-'}</td>
                      <td className="px-3 py-2 text-ink-muted">{row.medidas || '-'}</td>
                      <td className="px-3 py-2 text-ink-muted">{row.color || '-'}</td>
                      <td className="px-3 py-2">
                        {avisosImportacion(row).length ? (
                          <span className="text-warning">{avisosImportacion(row).join(' · ')}</span>
                        ) : (
                          <span className="text-ink-muted">Sin observaciones</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Dialog>

      {isAdmin && (
        <FloatingActionBar selectedCount={selectedIds.length} onClearSelection={() => setSelectedIds([])} itemLabel="productos">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void bulkUpdate({ requiere_revision: false }, 'Productos marcados como revisados.')}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span>Marcar revisados</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void bulkUpdate({ activo: false }, 'Productos desactivados.')}>
            <Power className="h-3.5 w-3.5" />
            <span>Desactivar</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void deleteSelected()}>
            <Trash2 className="h-3.5 w-3.5" />
            <span>Eliminar ({selectedIds.length})</span>
          </Button>
        </FloatingActionBar>
      )}
    </div>
  );
}
