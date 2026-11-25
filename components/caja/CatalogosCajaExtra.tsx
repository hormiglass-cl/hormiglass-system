'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '../../lib/supabase/client';
import type {
  CajaCentroCosto,
  CajaInsumo,
  CajaVehiculo,
  GrupoInsumoCaja,
} from '../../lib/types';
import { GRUPOS_INSUMO_CAJA } from '../../lib/caja-catalogos';
import { Building2, Edit2, Fuel, Package, Truck } from 'lucide-react';
import {
  Panel,
  Button,
  IconButton,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  SearchField,
} from '../ui/crm';
import { Select } from '../ui/FormControls';
import { Fab } from '../ui/Fab';
import { useToast } from '../ui/feedback';
import { mensajeError } from '../../lib/errores';

/* ── CENTROS DE COSTOS ── */
export function CentrosCostoManager() {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CajaCentroCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CajaCentroCosto | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('caja_centros_costo')
        .select('*')
        .order('orden')
        .order('nombre');
      if (error) throw error;
      setItems((data || []) as CajaCentroCosto[]);
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudieron cargar los centros de costos.'), tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const abrirNuevo = () => {
    setEditing(null);
    setCodigo('');
    setNombre('');
    setDescripcion('');
    setActivo(true);
    setOpen(true);
  };

  const abrirEditar = (item: CajaCentroCosto) => {
    setEditing(item);
    setCodigo(item.codigo);
    setNombre(item.nombre);
    setDescripcion(item.descripcion || '');
    setActivo(item.activo);
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cod = codigo.trim().toUpperCase().replace(/\s+/g, '-');
    const nom = nombre.trim();
    if (!cod || !nom) {
      toast({ message: 'El código y el nombre son obligatorios.', tone: 'warning' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        codigo: cod,
        nombre: nom,
        descripcion: descripcion.trim() || null,
        activo,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('caja_centros_costo').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ message: `Centro de costos "${nom}" actualizado.`, tone: 'success' });
      } else {
        const { error } = await supabase
          .from('caja_centros_costo')
          .insert([{ ...payload, orden: items.length + 1 }]);
        if (error) throw error;
        toast({ message: `Centro de costos "${nom}" creado.`, tone: 'success' });
      }
      setOpen(false);
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo guardar el centro de costos.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (item: CajaCentroCosto) => {
    try {
      const next = !item.activo;
      const { error } = await supabase
        .from('caja_centros_costo')
        .update({ activo: next, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, activo: next } : x)));
      toast({ message: `Centro de costos "${item.nombre}" ${next ? 'activado' : 'desactivado'}.`, tone: 'info' });
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo cambiar el estado.'), tone: 'danger' });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = items.filter(
    (x) => !q || `${x.codigo} ${x.nombre} ${x.descripcion || ''}`.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          className="max-w-xs"
          placeholder="Buscar centro de costos"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="p-8 text-center t-caption">Cargando centros de costos…</div>
      ) : filtrados.length === 0 ? (
        <div className="p-8 text-center t-caption">Sin centros de costos registrados.</div>
      ) : (
        <Panel className="overflow-hidden">
          <div className="divide-y divide-line-subtle">
            {filtrados.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden />
                    <span className="font-semibold text-ink">{item.nombre}</span>
                    <CodeStamp>{item.codigo}</CodeStamp>
                  </div>
                  {item.descripcion && <p className="t-micro text-ink-muted pl-5">{item.descripcion}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => void toggleActivo(item)} className="cursor-pointer" title="Cambiar estado">
                    <StatusBadge tone={item.activo ? 'success' : 'neutral'}>
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </button>
                  <IconButton icon={Edit2} label="Editar centro de costos" onClick={() => abrirEditar(item)} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Fab label="Nuevo centro de costos" onClick={abrirNuevo} />

      <Dialog
        open={open}
        title={editing ? 'Editar centro de costos' : 'Nuevo centro de costos'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={saving} onClick={(e) => void guardar(e)}>
              {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form onSubmit={guardar} className="space-y-3 text-xs">
          <Field label="Código" required hint="Ej: TERRENO-2, OBRAS, FLOTA">
            {({ id }) => (
              <TextInput
                id={id}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej: TERRENO-2"
              />
            )}
          </Field>
          <Field label="Nombre" required>
            {({ id }) => (
              <TextInput
                id={id}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Terreno 2 – Calera de Tango"
              />
            )}
          </Field>
          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Qué gastos o ingresos agrupa este centro de costos..."
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="ccActivo"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="ccActivo" className="text-xs font-semibold text-ink cursor-pointer">
              Centro de costos activo para imputación en caja
            </label>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/* ── INSUMOS / MATERIAS PRIMAS Y COMBUSTIBLES ── */
export function InsumosCajaManager() {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CajaInsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState<'todos' | GrupoInsumoCaja>('todos');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CajaInsumo | null>(null);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [grupo, setGrupo] = useState<GrupoInsumoCaja>('materia_prima');
  const [unidad, setUnidad] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('caja_insumos')
        .select('*')
        .order('orden')
        .order('nombre');
      if (error) throw error;
      setItems((data || []) as CajaInsumo[]);
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudieron cargar los insumos.'), tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const abrirNuevo = () => {
    setEditing(null);
    setCodigo('');
    setNombre('');
    setGrupo('materia_prima');
    setUnidad('');
    setDescripcion('');
    setActivo(true);
    setOpen(true);
  };

  const abrirEditar = (item: CajaInsumo) => {
    setEditing(item);
    setCodigo(item.codigo);
    setNombre(item.nombre);
    setGrupo(item.grupo);
    setUnidad(item.unidad || '');
    setDescripcion(item.descripcion || '');
    setActivo(item.activo);
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const cod = codigo.trim().toUpperCase().replace(/\s+/g, '-');
    const nom = nombre.trim();
    if (!cod || !nom) {
      toast({ message: 'El código y el nombre del insumo son obligatorios.', tone: 'warning' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        codigo: cod,
        nombre: nom,
        grupo,
        unidad: unidad.trim() || null,
        descripcion: descripcion.trim() || null,
        activo,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('caja_insumos').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ message: `Insumo "${nom}" actualizado.`, tone: 'success' });
      } else {
        const { error } = await supabase
          .from('caja_insumos')
          .insert([{ ...payload, orden: items.length + 1 }]);
        if (error) throw error;
        toast({ message: `Insumo "${nom}" creado.`, tone: 'success' });
      }
      setOpen(false);
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo guardar el insumo.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (item: CajaInsumo) => {
    try {
      const next = !item.activo;
      const { error } = await supabase
        .from('caja_insumos')
        .update({ activo: next, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, activo: next } : x)));
      toast({ message: `Insumo "${item.nombre}" ${next ? 'activado' : 'desactivado'}.`, tone: 'info' });
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo cambiar el estado.'), tone: 'danger' });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = items.filter(
    (x) =>
      (grupoFiltro === 'todos' || x.grupo === grupoFiltro) &&
      (!q || `${x.codigo} ${x.nombre} ${x.descripcion || ''}`.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          className="max-w-xs"
          placeholder="Buscar insumo o código"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div role="tablist" aria-label="Grupo de insumo" className="ml-auto inline-flex items-center gap-1 rounded-lg bg-surface-muted p-1">
          {([
            ['todos', 'Todos'],
            ['materia_prima', 'Materia prima'],
            ['combustible', 'Combustibles'],
            ['otro', 'Otros'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={grupoFiltro === id}
              onClick={() => setGrupoFiltro(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                grupoFiltro === id ? 'bg-ink text-surface' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center t-caption">Cargando insumos…</div>
      ) : filtrados.length === 0 ? (
        <div className="p-8 text-center t-caption">Sin insumos registrados.</div>
      ) : (
        <Panel className="overflow-hidden">
          <div className="divide-y divide-line-subtle">
            {filtrados.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.grupo === 'combustible' ? (
                      <Fuel className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                    ) : (
                      <Package className="h-3.5 w-3.5 shrink-0 text-accent-ink" aria-hidden />
                    )}
                    <span className="font-semibold text-ink">{item.nombre}</span>
                    <CodeStamp>{item.codigo}</CodeStamp>
                    <StatusBadge tone={item.grupo === 'combustible' ? 'warning' : item.grupo === 'materia_prima' ? 'info' : 'neutral'}>
                      {GRUPOS_INSUMO_CAJA[item.grupo]?.label || item.grupo}
                    </StatusBadge>
                    {item.unidad && <span className="t-micro text-ink-muted">· {item.unidad}</span>}
                  </div>
                  {item.descripcion && <p className="t-micro text-ink-muted pl-5">{item.descripcion}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => void toggleActivo(item)} className="cursor-pointer" title="Cambiar estado">
                    <StatusBadge tone={item.activo ? 'success' : 'neutral'}>
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </button>
                  <IconButton icon={Edit2} label="Editar insumo" onClick={() => abrirEditar(item)} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Fab label="Nuevo insumo" onClick={abrirNuevo} />

      <Dialog
        open={open}
        title={editing ? 'Editar insumo' : 'Nuevo insumo'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={saving} onClick={(e) => void guardar(e)}>
              {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form onSubmit={guardar} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Código de insumo" required hint="Ej: MP-CEMENTO, COMB-BENCINA">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ej: COMB-BENCINA"
                />
              )}
            </Field>
            <Field label="Grupo" required>
              {({ id }) => (
                <Select id={id} value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoInsumoCaja)}>
                  <option value="materia_prima">Materia prima</option>
                  <option value="combustible">Combustible</option>
                  <option value="otro">Otro insumo</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Bencina"
                />
              )}
            </Field>
            <Field label="Unidad referencial">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  placeholder="Ej: L, m3, saco"
                />
              )}
            </Field>
          </div>
          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle del insumo para imputación en caja..."
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="insumoActivo"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="insumoActivo" className="text-xs font-semibold text-ink cursor-pointer">
              Insumo activo para imputación en caja
            </label>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

/* ── CAMIONES / VEHÍCULOS ── */
export function VehiculosCajaManager() {
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<CajaVehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CajaVehiculo | null>(null);
  const [nombre, setNombre] = useState('');
  const [patente, setPatente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('caja_vehiculos')
        .select('*')
        .order('orden')
        .order('nombre');
      if (error) throw error;
      setItems((data || []) as CajaVehiculo[]);
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudieron cargar los camiones.'), tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const abrirNuevo = () => {
    setEditing(null);
    setNombre('');
    setPatente('');
    setDescripcion('');
    setActivo(true);
    setOpen(true);
  };

  const abrirEditar = (item: CajaVehiculo) => {
    setEditing(item);
    setNombre(item.nombre);
    setPatente(item.patente || '');
    setDescripcion(item.descripcion || '');
    setActivo(item.activo);
    setOpen(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nom = nombre.trim();
    if (!nom) {
      toast({ message: 'El nombre del camión o vehículo es obligatorio.', tone: 'warning' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nombre: nom,
        patente: patente.trim().toUpperCase() || null,
        descripcion: descripcion.trim() || null,
        activo,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('caja_vehiculos').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ message: `Vehículo "${nom}" actualizado.`, tone: 'success' });
      } else {
        const { error } = await supabase
          .from('caja_vehiculos')
          .insert([{ ...payload, orden: items.length + 1 }]);
        if (error) throw error;
        toast({ message: `Vehículo "${nom}" registrado.`, tone: 'success' });
      }
      setOpen(false);
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo guardar el vehículo.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (item: CajaVehiculo) => {
    try {
      const next = !item.activo;
      const { error } = await supabase
        .from('caja_vehiculos')
        .update({ activo: next, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, activo: next } : x)));
      toast({ message: `Vehículo "${item.nombre}" ${next ? 'activado' : 'desactivado'}.`, tone: 'info' });
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo cambiar el estado.'), tone: 'danger' });
    }
  };

  const q = busqueda.trim().toLowerCase();
  const filtrados = items.filter(
    (x) => !q || `${x.nombre} ${x.patente || ''} ${x.descripcion || ''}`.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          className="max-w-xs"
          placeholder="Buscar camión o patente"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="p-8 text-center t-caption">Cargando camiones…</div>
      ) : filtrados.length === 0 ? (
        <Panel className="p-8 text-center space-y-2">
          <Truck className="mx-auto h-7 w-7 text-ink-muted opacity-60" aria-hidden />
          <p className="text-sm font-semibold text-ink">Aún no hay camiones registrados</p>
          <p className="t-caption">Agrega los camiones o camionetas de la flota para clasificar sus gastos de combustible y mantención.</p>
          <div className="pt-2">
            <Button variant="primary" size="sm" onClick={abrirNuevo}>Agregar primer vehículo</Button>
          </div>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <div className="divide-y divide-line-subtle">
            {filtrados.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 p-4 text-xs">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Truck className="h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
                    <span className="font-semibold text-ink">{item.nombre}</span>
                    {item.patente && <CodeStamp>{item.patente}</CodeStamp>}
                  </div>
                  {item.descripcion && <p className="t-micro text-ink-muted pl-5">{item.descripcion}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => void toggleActivo(item)} className="cursor-pointer" title="Cambiar estado">
                    <StatusBadge tone={item.activo ? 'success' : 'neutral'}>
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </button>
                  <IconButton icon={Edit2} label="Editar vehículo" onClick={() => abrirEditar(item)} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Fab label="Nuevo vehículo" onClick={abrirNuevo} />

      <Dialog
        open={open}
        title={editing ? 'Editar vehículo' : 'Nuevo vehículo'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={saving} onClick={(e) => void guardar(e)}>
              {saving ? 'Guardando…' : editing ? 'Actualizar' : 'Crear'}
            </Button>
          </>
        }
      >
        <form onSubmit={guardar} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre / Identificador" required>
              {({ id }) => (
                <TextInput
                  id={id}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Camión 1, Camioneta Reparto"
                />
              )}
            </Field>
            <Field label="Patente">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={patente}
                  onChange={(e) => setPatente(e.target.value)}
                  placeholder="Ej: ABCD-12"
                />
              )}
            </Field>
          </div>
          <Field label="Descripción">
            {({ id }) => (
              <textarea
                id={id}
                rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Tipo de combustible, capacidad o uso habitual..."
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="vehiculoActivo"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="vehiculoActivo" className="text-xs font-semibold text-ink cursor-pointer">
              Vehículo activo para imputación en caja
            </label>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
