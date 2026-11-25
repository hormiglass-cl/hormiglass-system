'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { CajaCategoria, CajaSubcategoria, CajaClasificacion } from '../../lib/types';
import { Plus, Edit2, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { Panel, Button, IconButton, StatusBadge, Dialog, Field, TextInput, SearchField } from '../ui/crm';
import { Select } from '../ui/FormControls';
import { Fab } from '../ui/Fab';
import { useToast } from '../ui/feedback';
import {
  CentrosCostoManager,
  InsumosCajaManager,
  VehiculosCajaManager,
} from './CatalogosCajaExtra';

const CLASIFICACIONES_INFO: Record<
  CajaClasificacion,
  { label: string; tipo: 'ingreso' | 'egreso' }
> = {
  costo_directo: {
    label: 'Costos Directos de Venta',
    tipo: 'egreso',
  },
  gasto_operacional: {
    label: 'Gastos Operacionales Planta',
    tipo: 'egreso',
  },
  gasto_administrativo: {
    label: 'Gastos Administrativos',
    tipo: 'egreso',
  },
  gasto_financiero: {
    label: 'Gastos Financieros',
    tipo: 'egreso',
  },
  ingreso_operacional: {
    label: 'Ingresos Operacionales (Ventas)',
    tipo: 'ingreso',
  },
  ingreso_no_operacional: {
    label: 'Otros Ingresos',
    tipo: 'ingreso',
  },
};

/** Glosario de categorías, centros de costos, insumos y camiones; se administra desde Caja. */
export function CategoriasCostos() {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [seccion, setSeccion] = useState<'categorias' | 'centros' | 'insumos' | 'camiones'>('categorias');
  const [categorias, setCategorias] = useState<CajaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'ingreso' | 'egreso'>('todos');

  const [showSubcatModal, setShowSubcatModal] = useState(false);
  const [editingSubcat, setEditingSubcat] = useState<CajaSubcategoria | null>(null);
  const [subcatCategoriaId, setSubcatCategoriaId] = useState('');
  const [subcatNombre, setSubcatNombre] = useState('');
  const [subcatDescripcion, setSubcatDescripcion] = useState('');
  const [subcatActivo, setSubcatActivo] = useState(true);
  const [savingSubcat, setSavingSubcat] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await supabase.from('caja_categorias').select('*, subcategorias:caja_subcategorias(*)').order('orden');
      if (res.error) throw res.error;
      setCategorias((res.data || []) as CajaCategoria[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos';
      toast({ message: `No se pudieron cargar las categorías: ${message}`, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Subcategorías Handlers
  const handleOpenCreateSubcatModal = (categoriaId?: string) => {
    setEditingSubcat(null);
    setSubcatCategoriaId(categoriaId || categorias[0]?.id || '');
    setSubcatNombre('');
    setSubcatDescripcion('');
    setSubcatActivo(true);
    setShowSubcatModal(true);
  };

  const handleOpenEditSubcatModal = (subcat: CajaSubcategoria) => {
    setEditingSubcat(subcat);
    setSubcatCategoriaId(subcat.categoria_id);
    setSubcatNombre(subcat.nombre);
    setSubcatDescripcion(subcat.descripcion || '');
    setSubcatActivo(subcat.activo);
    setShowSubcatModal(true);
  };

  const handleSubmitSubcat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcatNombre.trim() || !subcatCategoriaId) {
      toast({ message: 'El nombre y la categoría principal son requeridos.', tone: 'warning' });
      return;
    }

    try {
      setSavingSubcat(true);

      const payload = {
        categoria_id: subcatCategoriaId,
        nombre: subcatNombre.trim(),
        descripcion: subcatDescripcion.trim() || null,
        activo: subcatActivo,
        updated_at: new Date().toISOString(),
      };

      if (editingSubcat) {
        const { error } = await supabase
          .from('caja_subcategorias')
          .update(payload)
          .eq('id', editingSubcat.id);
        if (error) throw error;
        toast({ message: `Subcategoría "${payload.nombre}" actualizada.`, tone: 'success' });
      } else {
        const { error } = await supabase
          .from('caja_subcategorias')
          .insert([payload]);
        if (error) throw error;
        toast({ message: `Subcategoría "${payload.nombre}" creada exitosamente.`, tone: 'success' });
      }

      setShowSubcatModal(false);
      await loadData();
    } catch (err: unknown) {
      console.error('Error guardando subcategoría:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la subcategoría';
      toast({ message, tone: 'danger' });
    } finally {
      setSavingSubcat(false);
    }
  };

  const handleToggleSubcatActivo = async (subcat: CajaSubcategoria) => {
    try {
      const nuevoEstado = !subcat.activo;
      const { error } = await supabase
        .from('caja_subcategorias')
        .update({ activo: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', subcat.id);
      if (error) throw error;
      setCategorias((prev) =>
        prev.map((cat) => ({
          ...cat,
          subcategorias: (cat.subcategorias || []).map((s) =>
            s.id === subcat.id ? { ...s, activo: nuevoEstado } : s
          ),
        }))
      );
      toast({
        message: `Subcategoría "${subcat.nombre}" ${nuevoEstado ? 'activada' : 'desactivada'}.`,
        tone: 'info',
      });
    } catch (err: unknown) {
      console.error('Error actualizando subcategoría:', err);
      toast({ message: 'No se pudo actualizar el estado de la subcategoría.', tone: 'danger' });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const categoriasFiltradas = categorias
    .map((cat) => {
      const subs = cat.subcategorias || [];
      const coincideCat = !q || `${cat.nombre} ${cat.descripcion || ''}`.toLowerCase().includes(q);
      const subsVisibles = coincideCat
        ? subs
        : subs.filter((s) => `${s.nombre} ${s.descripcion || ''}`.toLowerCase().includes(q));
      return { cat, subs: subsVisibles, visible: coincideCat || subsVisibles.length > 0 };
    })
    .filter((x) => x.visible && (tipoFiltro === 'todos' || x.cat.tipo === tipoFiltro));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Catálogos de costos" className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          {([
            ['categorias', 'Categorías'],
            ['centros', 'Centros de costos'],
            ['insumos', 'Insumos'],
            ['camiones', 'Camiones'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={seccion === id}
              onClick={() => setSeccion(id)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                seccion === id ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {seccion === 'centros' && <CentrosCostoManager />}
      {seccion === 'insumos' && <InsumosCajaManager />}
      {seccion === 'camiones' && <VehiculosCajaManager />}

      {seccion === 'categorias' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              className="max-w-xs"
              placeholder="Buscar categoría o subcategoría"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div role="tablist" aria-label="Tipo de categoría" className="ml-auto inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
              {([['todos', 'Todos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tipoFiltro === id}
                  onClick={() => setTipoFiltro(id)}
                  className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
                    tipoFiltro === id ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center t-caption">Cargando categorías…</div>
          ) : categoriasFiltradas.length === 0 ? (
            <div className="p-8 text-center t-caption">Sin resultados.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoriasFiltradas.map(({ cat, subs }) => {
                const info = CLASIFICACIONES_INFO[cat.clasificacion] || { label: cat.nombre, tipo: cat.tipo };
                return (
                  <Panel key={cat.id} className="overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-line-subtle flex items-start justify-between gap-3 bg-surface-muted">
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={cat.tipo === 'ingreso' ? 'success' : 'danger'}>
                            {cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                          </StatusBadge>
                          <span className="t-micro text-ink-muted uppercase font-semibold">{info.label}</span>
                        </div>
                        <h3 className="t-section text-ink mt-1 flex items-center gap-2">
                          {cat.tipo === 'ingreso' ? (
                            <TrendingUp className="w-4 h-4 text-success" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-warning" />
                          )}
                          <span>{cat.nombre}</span>
                        </h3>
                        {cat.descripcion && <p className="t-caption mt-0.5">{cat.descripcion}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Plus}
                        onClick={() => handleOpenCreateSubcatModal(cat.id)}
                      >
                        Subcategoría
                      </Button>
                    </div>

                    <div className="p-4 flex-1">
                      {subs.length === 0 ? (
                        <p className="t-caption italic">Sin subcategorías registradas.</p>
                      ) : (
                        <div className="divide-y divide-line-subtle">
                          {subs.map((sub) => (
                            <div key={sub.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                              <div className="flex-1">
                                <div className="font-semibold text-ink flex items-center gap-1.5">
                                  <Tag className="w-3 h-3 text-ink-muted" />
                                  <span>{sub.nombre}</span>
                                </div>
                                {sub.descripcion && <p className="t-micro text-ink-muted pl-4">{sub.descripcion}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleSubcatActivo(sub)}
                                  className="cursor-pointer"
                                  title="Cambiar estado"
                                >
                                  <StatusBadge tone={sub.activo ? 'success' : 'neutral'}>
                                    {sub.activo ? 'Activa' : 'Inactiva'}
                                  </StatusBadge>
                                </button>
                                <IconButton
                                  icon={Edit2}
                                  label="Editar subcategoría"
                                  onClick={() => handleOpenEditSubcatModal(sub)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
      <Fab label="Nueva subcategoría" onClick={() => handleOpenCreateSubcatModal()} />

      {/* Modal Subcategoría */}
      <Dialog
        open={showSubcatModal}
        title={editingSubcat ? 'Editar subcategoría' : 'Nueva subcategoría'}
        onClose={() => setShowSubcatModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowSubcatModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={savingSubcat}
              onClick={(e) => void handleSubmitSubcat(e)}
            >
              {savingSubcat ? 'Guardando…' : editingSubcat ? 'Actualizar subcategoría' : 'Crear subcategoría'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitSubcat} className="space-y-3 text-xs">
          <Field label="Categoría principal" required>
            {({ id }) => (
              <Select
                id={id}
                value={subcatCategoriaId}
                onChange={(e) => setSubcatCategoriaId(e.target.value)}
              >
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre} · {cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Nombre de la subcategoría" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                placeholder="Ej: Materiales e Insumos, Fletes y Despachos"
                value={subcatNombre}
                onChange={(e) => setSubcatNombre(e.target.value)}
              />
            )}
          </Field>

          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={2}
                placeholder="Explica qué tipo de gastos o ingresos se agrupan aquí..."
                value={subcatDescripcion}
                onChange={(e) => setSubcatDescripcion(e.target.value)}
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="subcatActiva"
              checked={subcatActivo}
              onChange={(e) => setSubcatActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="subcatActiva" className="text-xs font-semibold text-ink cursor-pointer">
              Subcategoría activa para imputación en caja
            </label>
          </div>
        </form>
      </Dialog>
        </>
      )}
    </div>
  );
}
