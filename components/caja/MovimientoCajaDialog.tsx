'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, XCircle } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type {
  CajaCategoria,
  CajaCentroCosto,
  CajaInsumo,
  CajaVehiculo,
  CuentaBancaria,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '../../lib/types';
import {
  GRUPOS_INSUMO_CAJA,
  MEDIOS_PAGO,
  TIPOS_DOCUMENTO_CAJA,
} from '../../lib/caja-catalogos';
import { mensajeError } from '../../lib/errores';
import { logSistema } from '../../lib/logger';
import { Button, Dialog, Field, Select, TextInput } from '../ui/crm';
import { SearchSelect } from '../ui/SearchSelect';
import { useToast } from '../ui/feedback';

export interface CajaLookups {
  categorias: CajaCategoria[];
  centrosCosto: CajaCentroCosto[];
  insumos: CajaInsumo[];
  vehiculos: CajaVehiculo[];
  clientes: { id: string; nombre?: string | null; apellido_razon_social?: string | null; rut?: string | null }[];
  oportunidades: { id: string; codigo?: string | null; titulo?: string | null; cliente_id?: string | null }[];
  proveedores: { id: string; nombre: string; rut?: string | null }[];
  trabajadores: { id: string; nombre: string; cargo?: string | null; activo?: boolean }[];
}

export const EMPTY_CAJA_LOOKUPS: CajaLookups = {
  categorias: [],
  centrosCosto: [],
  insumos: [],
  vehiculos: [],
  clientes: [],
  oportunidades: [],
  proveedores: [],
  trabajadores: [],
};

export function nombreClienteCorto(c?: { nombre?: string | null; apellido_razon_social?: string | null } | null): string {
  if (!c) return '';
  return (c.apellido_razon_social || c.nombre || '').trim();
}

function toLocalDateTimeInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MovimientoCajaDialog(props: {
  open: boolean;
  onClose: () => void;
  movimiento?: MovimientoCaja | null;
  cuentas: CuentaBancaria[];
  lookups: CajaLookups;
  usuarioId?: string | null;
  vinculadoAbono?: boolean;
  onSaved: () => Promise<void>;
}) {
  if (!props.open) return null;
  return (
    <MovimientoCajaDialogInner
      key={props.movimiento?.id || 'nuevo'}
      {...props}
    />
  );
}

function MovimientoCajaDialogInner({
  open,
  onClose,
  movimiento,
  cuentas,
  lookups,
  usuarioId,
  vinculadoAbono = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  movimiento?: MovimientoCaja | null;
  cuentas: CuentaBancaria[];
  lookups: CajaLookups;
  usuarioId?: string | null;
  vinculadoAbono?: boolean;
  onSaved: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const isEdit = !!movimiento;

  const [tipo, setTipo] = useState<TipoMovimientoCaja>(movimiento?.tipo || 'egreso');
  const [monto, setMonto] = useState<string>(
    movimiento ? String(Math.round(Number(movimiento.monto || 0))) : '',
  );
  const [fechaLocal, setFechaLocal] = useState<string>(
    movimiento ? toLocalDateTimeInput(movimiento.fecha) : toLocalDateTimeInput(),
  );
  const [cuentaId, setCuentaId] = useState<string>(movimiento?.cuenta_bancaria_id || '');
  const [categoriaId, setCategoriaId] = useState<string>(movimiento?.categoria_id || '');
  const [subcategoriaId, setSubcategoriaId] = useState<string>(movimiento?.subcategoria_id || '');
  const [categoriaLibre, setCategoriaLibre] = useState<string>(movimiento?.categoria || '');
  const [medioPago, setMedioPago] = useState<string>(movimiento?.medio_pago || '');
  const [tipoDocumento, setTipoDocumento] = useState<string>(movimiento?.tipo_documento || '');
  const [centroCostoId, setCentroCostoId] = useState<string>(movimiento?.centro_costo_id || '');
  const [insumoId, setInsumoId] = useState<string>(movimiento?.insumo_id || '');
  const [vehiculoId, setVehiculoId] = useState<string>(movimiento?.vehiculo_id || '');
  const [trabajadorId, setTrabajadorId] = useState<string>(movimiento?.trabajador_id || '');
  const [clienteId, setClienteId] = useState<string>(
    movimiento?.cliente_id || movimiento?.oportunidad?.cliente_id || '',
  );
  const [oportunidadId, setOportunidadId] = useState<string>(movimiento?.oportunidad_id || '');
  const [proveedorId, setProveedorId] = useState<string>(movimiento?.proveedor_id || '');
  const [descripcion, setDescripcion] = useState<string>(movimiento?.descripcion || '');
  const [formError, setFormError] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const categoriasDelTipo = useMemo(
    () => lookups.categorias.filter((c) => c.activo && c.tipo === tipo),
    [lookups.categorias, tipo],
  );

  const categoriaSeleccionada = useMemo(
    () => lookups.categorias.find((c) => c.id === categoriaId) || null,
    [lookups.categorias, categoriaId],
  );

  const subcategoriasDisponibles = useMemo(
    () => (categoriaSeleccionada?.subcategorias || []).filter((s) => s.activo || s.id === subcategoriaId),
    [categoriaSeleccionada, subcategoriaId],
  );

  const cuentaSeleccionada = useMemo(
    () => cuentas.find((c) => c.id === cuentaId) || null,
    [cuentas, cuentaId],
  );

  const centrosOptions = useMemo(
    () =>
      lookups.centrosCosto
        .filter((c) => c.activo || c.id === centroCostoId)
        .map((c) => ({ value: c.id, label: c.nombre, hint: c.codigo })),
    [lookups.centrosCosto, centroCostoId],
  );

  const insumosOptions = useMemo(
    () =>
      lookups.insumos
        .filter((i) => i.activo || i.id === insumoId)
        .map((i) => ({
          value: i.id,
          label: i.nombre,
          hint: `${i.codigo} · ${GRUPOS_INSUMO_CAJA[i.grupo]?.label || i.grupo}`,
        })),
    [lookups.insumos, insumoId],
  );

  const vehiculosOptions = useMemo(
    () =>
      lookups.vehiculos
        .filter((v) => v.activo || v.id === vehiculoId)
        .map((v) => ({ value: v.id, label: v.nombre, hint: v.patente || undefined })),
    [lookups.vehiculos, vehiculoId],
  );

  const trabajadoresOptions = useMemo(
    () =>
      lookups.trabajadores
        .filter((t) => t.activo !== false || t.id === trabajadorId)
        .map((t) => ({ value: t.id, label: t.nombre, hint: t.cargo || undefined })),
    [lookups.trabajadores, trabajadorId],
  );

  const clientesOptions = useMemo(
    () =>
      lookups.clientes
        .map((c) => ({
          value: c.id,
          label: nombreClienteCorto(c) || 'Cliente sin nombre',
          hint: c.rut || undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [lookups.clientes],
  );

  const oportunidadesOptions = useMemo(() => {
    const lista = clienteId
      ? lookups.oportunidades.filter((o) => o.cliente_id === clienteId || o.id === oportunidadId)
      : lookups.oportunidades;
    return lista.map((o) => ({
      value: o.id,
      label: `${o.codigo || 'NV'} · ${o.titulo || 'Sin título'}`,
    }));
  }, [lookups.oportunidades, clienteId, oportunidadId]);

  const proveedoresOptions = useMemo(
    () =>
      lookups.proveedores
        .map((p) => ({ value: p.id, label: p.nombre, hint: p.rut || undefined }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [lookups.proveedores],
  );

  const handleTipoChange = (nuevoTipo: TipoMovimientoCaja) => {
    setTipo(nuevoTipo);
    if (categoriaSeleccionada && categoriaSeleccionada.tipo !== nuevoTipo) {
      setCategoriaId('');
      setSubcategoriaId('');
    }
  };

  const handleOportunidadChange = (nextOpId: string) => {
    setOportunidadId(nextOpId);
    if (nextOpId) {
      const op = lookups.oportunidades.find((o) => o.id === nextOpId);
      if (op?.cliente_id && !clienteId) {
        setClienteId(op.cliente_id);
      }
    }
  };

  const resolverTextoCategoria = (): string => {
    if (categoriaSeleccionada) {
      const sub = subcategoriasDisponibles.find((s) => s.id === subcategoriaId);
      return sub ? `${categoriaSeleccionada.nombre} · ${sub.nombre}` : categoriaSeleccionada.nombre;
    }
    return categoriaLibre.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setFormError('Ingresa un monto válido mayor a 0.');
      return;
    }
    const categoriaTexto = resolverTextoCategoria();
    if (!categoriaTexto) {
      setFormError('Selecciona una categoría o escribe una categoría para el movimiento.');
      return;
    }

    const fechaIso = fechaLocal ? new Date(fechaLocal).toISOString() : new Date().toISOString();
    const empresaId = cuentaSeleccionada?.empresa_id ?? null;

    setSaving(true);
    setFormError('');

    const commonPayload = {
      categoria: categoriaTexto,
      categoria_id: categoriaId || null,
      subcategoria_id: subcategoriaId || null,
      descripcion: descripcion.trim() || categoriaTexto,
      cuenta_bancaria_id: cuentaId || null,
      empresa_id: empresaId,
      medio_pago: medioPago || null,
      tipo_documento: tipoDocumento || null,
      centro_costo_id: centroCostoId || null,
      insumo_id: insumoId || null,
      vehiculo_id: vehiculoId || null,
      trabajador_id: trabajadorId || null,
      cliente_id: clienteId || null,
      oportunidad_id: oportunidadId || null,
      proveedor_id: proveedorId || null,
      fecha: fechaIso,
    };

    try {
      if (isEdit && movimiento) {
        const updatePayload = {
          ...commonPayload,
          tipo: vinculadoAbono ? movimiento.tipo : tipo,
          monto: vinculadoAbono ? Number(movimiento.monto) : montoNum,
        };

        const { error } = await supabase
          .from('caja_movimientos')
          .update(updatePayload)
          .eq('id', movimiento.id);

        if (error) throw error;

        await logSistema({
          tipo_accion: 'actualizacion',
          entidad: 'caja_movimientos',
          entidad_id: movimiento.id,
          descripcion: `Movimiento de caja editado (${updatePayload.tipo} $${updatePayload.monto.toLocaleString('es-CL')} · ${updatePayload.categoria})`,
          usuario_id: usuarioId || null,
          datos_anteriores: {
            tipo: movimiento.tipo,
            monto: movimiento.monto,
            categoria: movimiento.categoria,
            cuenta_bancaria_id: movimiento.cuenta_bancaria_id,
            empresa_id: movimiento.empresa_id,
            medio_pago: movimiento.medio_pago,
            tipo_documento: movimiento.tipo_documento,
            centro_costo_id: movimiento.centro_costo_id,
            insumo_id: movimiento.insumo_id,
            vehiculo_id: movimiento.vehiculo_id,
            trabajador_id: movimiento.trabajador_id,
            cliente_id: movimiento.cliente_id,
            oportunidad_id: movimiento.oportunidad_id,
            proveedor_id: movimiento.proveedor_id,
          },
          datos_nuevos: updatePayload,
        });

        toast({ message: 'Movimiento de caja actualizado.', tone: 'success' });
      } else {
        const insertPayload = {
          ...commonPayload,
          tipo,
          monto: montoNum,
          usuario_id: usuarioId || null,
        };

        const { data, error } = await supabase
          .from('caja_movimientos')
          .insert([insertPayload])
          .select('id')
          .single();

        if (error) throw error;

        await logSistema({
          tipo_accion: 'creacion',
          entidad: 'caja_movimientos',
          entidad_id: data?.id,
          descripcion: `Movimiento de caja registrado (${insertPayload.tipo} $${insertPayload.monto.toLocaleString('es-CL')} · ${insertPayload.categoria})`,
          usuario_id: usuarioId || null,
          datos_nuevos: insertPayload,
        });

        toast({ message: 'Movimiento de caja registrado exitosamente.', tone: 'success' });
      }

      onClose();
      await onSaved();
    } catch (err) {
      console.error('Error guardando movimiento de caja:', err);
      setFormError(mensajeError(err, 'No se pudo guardar el movimiento. Verifica los datos y tus permisos.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      size="lg"
      title={isEdit ? 'Editar movimiento de caja' : 'Registrar movimiento de caja'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={saving} onClick={(e) => void handleSubmit(e)}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar movimiento'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {formError && (
          <p role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger-line text-danger font-semibold flex items-center gap-1.5">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </p>
        )}

        {isEdit && vinculadoAbono && (
          <div className="p-2.5 rounded-control bg-info-soft border border-info-line text-info flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Este movimiento proviene de un <strong>abono validado</strong>. Puedes ajustar cuenta/empresa, respaldo, centro de costos o glosa; el tipo y monto se mantienen protegidos.
            </span>
          </div>
        )}

        {/* 1. Datos principales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Tipo de movimiento" required>
            {({ id }) => (
              <Select
                id={id}
                value={tipo}
                disabled={isEdit && vinculadoAbono}
                onChange={(e) => handleTipoChange(e.target.value as TipoMovimientoCaja)}
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </Select>
            )}
          </Field>

          <Field label="Monto (CLP)" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="number"
                min={1}
                required
                disabled={isEdit && vinculadoAbono}
                placeholder="Ej: 150000"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            )}
          </Field>

          <Field label="Fecha y hora" required>
            {({ id }) => (
              <input
                id={id}
                type="datetime-local"
                required
                value={fechaLocal}
                onChange={(e) => setFechaLocal(e.target.value)}
                className="hg-field w-full"
              />
            )}
          </Field>
        </div>

        <Field
          label="Cuenta bancaria / Empresa"
          hint={
            cuentaSeleccionada?.empresa?.razon_social
              ? `Empresa asignada: ${cuentaSeleccionada.empresa.razon_social}`
              : 'Selecciona la cuenta para asignar automáticamente su empresa.'
          }
        >
          {({ id }) => (
            <Select id={id} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
              <option value="">Sin asignar</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias} · {c.banco}{c.empresa?.razon_social ? ` (${c.empresa.razon_social})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Categoría de costo" required>
            {({ id }) => (
              <Select
                id={id}
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value);
                  setSubcategoriaId('');
                }}
              >
                <option value="">
                  {categoriaLibre && !categoriaId ? `Otra (${categoriaLibre})` : 'Seleccionar categoría…'}
                </option>
                {categoriasDelTipo.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {categoriaId ? (
            <Field label="Subcategoría">
              {({ id }) => (
                <Select
                  id={id}
                  value={subcategoriaId}
                  onChange={(e) => setSubcategoriaId(e.target.value)}
                  disabled={subcategoriasDisponibles.length === 0}
                >
                  <option value="">
                    {subcategoriasDisponibles.length === 0 ? 'Sin subcategorías' : 'General (sin subcategoría)'}
                  </option>
                  {subcategoriasDisponibles.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.nombre}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Categoría personalizada" hint="Opcional si no usas el catálogo">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="text"
                  placeholder="Ej: Venta directa / Materia prima"
                  value={categoriaLibre}
                  onChange={(e) => setCategoriaLibre(e.target.value)}
                />
              )}
            </Field>
          )}
        </div>

        {/* 2. Respaldo */}
        <div className="border-t border-line-subtle pt-3">
          <p className="t-micro font-semibold uppercase tracking-wide text-ink-muted mb-2.5">
            Respaldo y pago
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Medio de pago">
              {({ id }) => (
                <Select id={id} value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Tipo de documento">
              {({ id }) => (
                <Select id={id} value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {TIPOS_DOCUMENTO_CAJA.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>

        {/* 3. Centro de costos e imputación */}
        <div className="border-t border-line-subtle pt-3">
          <p className="t-micro font-semibold uppercase tracking-wide text-ink-muted mb-2.5">
            Centro de costos e imputación (opcional)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Centro de costos">
              {() => (
                <SearchSelect
                  value={centroCostoId}
                  onChange={setCentroCostoId}
                  options={centrosOptions}
                  placeholder="Ej: Terreno 2 – Calera de Tango"
                  clearLabel="Sin centro de costos"
                  searchable
                />
              )}
            </Field>

            <Field label="Código de insumo / Materia prima">
              {() => (
                <SearchSelect
                  value={insumoId}
                  onChange={setInsumoId}
                  options={insumosOptions}
                  placeholder="Ej: Cemento, Bencina, Petróleo"
                  clearLabel="Sin código de insumo"
                  searchable
                />
              )}
            </Field>

            <Field label="Camión / Vehículo">
              {() => (
                <SearchSelect
                  value={vehiculoId}
                  onChange={setVehiculoId}
                  options={vehiculosOptions}
                  placeholder="Seleccionar camión o vehículo"
                  clearLabel="Sin vehículo asignado"
                  searchable
                />
              )}
            </Field>

            <Field label="Trabajador (traslados / rendición)">
              {() => (
                <SearchSelect
                  value={trabajadorId}
                  onChange={setTrabajadorId}
                  options={trabajadoresOptions}
                  placeholder="Seleccionar trabajador"
                  clearLabel="Sin trabajador asignado"
                  searchable
                />
              )}
            </Field>

            <Field label="Cliente">
              {() => (
                <SearchSelect
                  value={clienteId}
                  onChange={(val) => {
                    setClienteId(val);
                    if (val && oportunidadId) {
                      const op = lookups.oportunidades.find((o) => o.id === oportunidadId);
                      if (op?.cliente_id && op.cliente_id !== val) setOportunidadId('');
                    }
                  }}
                  options={clientesOptions}
                  placeholder="Imputar a cliente"
                  clearLabel="Sin cliente asignado"
                  searchable
                />
              )}
            </Field>

            <Field label="Nota de venta / Obra">
              {() => (
                <SearchSelect
                  value={oportunidadId}
                  onChange={handleOportunidadChange}
                  options={oportunidadesOptions}
                  placeholder="Imputar a obra o NV"
                  clearLabel="Sin obra / NV"
                  searchable
                />
              )}
            </Field>

            <Field label="Proveedor">
              {() => (
                <SearchSelect
                  value={proveedorId}
                  onChange={setProveedorId}
                  options={proveedoresOptions}
                  placeholder="Asociar a proveedor"
                  clearLabel="Sin proveedor asignado"
                  searchable
                />
              )}
            </Field>
          </div>
        </div>

        <Field label="Descripción / Glosa">
          {({ id }) => (
            <textarea
              id={id}
              rows={2}
              placeholder="Detalle o respaldo del movimiento..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="hg-field w-full p-2.5"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
