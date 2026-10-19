'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { Cliente, CotizacionItem, Cotizacion, ProductoCatalogo } from '../../../lib/types';
import { useAuth } from '../../../lib/context/AuthContext';
import { logSistema } from '../../../lib/logger';
import {
  FileText,
  Plus,
  Trash2,
  ArrowLeft,
  Save,
  Building,
  Sparkles,
  Search,
  Check,
  ChevronDown,
  Tag,
  Calendar,
} from 'lucide-react';
import { mensajeError } from '../../../lib/errores';
import { Button, CodeStamp, PageHeader, Panel, StatusBadge } from '../../../components/ui/crm';

function generateCotNumber(version = 1): string {
  const sequence = Math.floor(1000 + Math.random() * 9000);
  return `COT-2026-${sequence}-v${version}`;
}

function NuevaCotizacionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramClienteId = searchParams.get('cliente_id');
  const paramOpId = searchParams.get('op_id');
  const paramEditCotId = searchParams.get('edit_cot_id');

  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [oportunidadId, setOportunidadId] = useState<string | undefined>(paramOpId || undefined);
  const [version, setVersion] = useState<number>(1);
  const [baseCotNumber, setBaseCotNumber] = useState('');

  // Reference and dates
  const [referenciaCliente, setReferenciaCliente] = useState('');
  const [fechaValidez, setFechaValidez] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const [fechaInicioCompromiso, setFechaInicioCompromiso] = useState(todayStr);
  const [fechaLimiteCompromiso, setFechaLimiteCompromiso] = useState('');
  const [plazoEntrega, setPlazoEntrega] = useState('Inmediato');
  const [condicionesPago, setCondicionesPago] = useState('Acuse de recibo');
  const [observaciones, setObservaciones] = useState('Garantía oficial Hormiglass en prefabricados.');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [items, setItems] = useState<CotizacionItem[]>([
    {
      producto: 'Suministro de placas prefabricadas de hormigón',
      cantidad: 1,
      precio_unitario: 100000,
      descuento_porcentaje: 0,
      total_item: 100000,
    },
  ]);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      const [{ data }, { data: productos }] = await Promise.all([
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('catalogo_productos').select('*').eq('activo', true).order('nombre'),
      ]);
      if (!ignore) {
        setCatalogo((productos || []) as ProductoCatalogo[]);
        const loadedClientes: Cliente[] = data ? (data as Cliente[]) : [];
        setClientes(loadedClientes);

        if (paramClienteId) {
          setClienteId(paramClienteId);
        } else if (loadedClientes.length > 0) {
          setClienteId(loadedClientes[0].id);
        }

        // Si se está editando o creando nueva versión de una cotización
        if (paramEditCotId) {
          const { data: baseCot } = await supabase
            .from('cotizaciones')
            .select('*, items:cotizacion_items(*)')
            .eq('id', paramEditCotId)
            .single();

          if (baseCot) {
            const cot = baseCot as Cotizacion;
            setClienteId(cot.cliente_id);
            setOportunidadId(cot.oportunidad_id);
            setReferenciaCliente(cot.referencia_cliente || '');
            if (cot.fecha_validez) {
              setFechaValidez(cot.fecha_validez.split('T')[0]);
            }
            if (cot.plazo_entrega) setPlazoEntrega(cot.plazo_entrega);
            if (cot.condiciones_pago) setCondicionesPago(cot.condiciones_pago);
            if (cot.observaciones) setObservaciones(cot.observaciones);

            const nextVer = (cot.version || 1) + 1;
            setVersion(nextVer);
            setBaseCotNumber(cot.numero_cotizacion);

            if (cot.items && cot.items.length > 0) {
              setItems(
                cot.items.map((it) => ({
                  producto: it.producto,
                  producto_catalogo_id: it.producto_catalogo_id,
                  cantidad: it.cantidad,
                  precio_unitario: it.precio_unitario,
                  descuento_porcentaje: it.descuento_porcentaje || 0,
                  total_item: it.total_item,
                }))
              );
            }
          }
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [paramClienteId, paramEditCotId, supabase]);

  const selectedClient = clientes.find((c) => c.id === clienteId);

  // Filtrado de clientes para el dropdown con búsqueda
  const filteredClientes = clientes.filter((c) => {
    if (!clientSearchQuery.trim()) return true;
    const q = clientSearchQuery.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.apellido_razon_social && c.apellido_razon_social.toLowerCase().includes(q)) ||
      (c.rut && c.rut.toLowerCase().includes(q)) ||
      (c.correo && c.correo.toLowerCase().includes(q))
    );
  });

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        producto: '',
        cantidad: 1,
        precio_unitario: 0,
        descuento_porcentaje: 0,
        total_item: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const selectCatalogItem = (index: number, productoCatalogoId: string) => {
    const prod = catalogo.find((p) => p.id === productoCatalogoId);
    if (!prod) return;

    setItems((prev) => {
      const updated = [...prev];
      const current = updated[index];
      const precio = Number(prod.precio_referencia) || 0;
      const cant = Number(current.cantidad) || 1;
      const dto = Number(current.descuento_porcentaje) || 0;
      const subtotal = cant * precio;
      const totalItem = Math.round(subtotal - subtotal * (dto / 100));

      updated[index] = {
        ...current,
        producto_catalogo_id: prod.id,
        producto: `${prod.nombre} (${prod.unidad})${prod.codigo ? ` · ${prod.codigo}` : ''}`,
        precio_unitario: precio,
        total_item: totalItem,
      };
      return updated;
    });
  };

  const handleItemChange = (index: number, field: keyof CotizacionItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      if (field === 'cantidad' || field === 'precio_unitario' || field === 'descuento_porcentaje') {
        const cant = Number(item.cantidad) || 0;
        const pu = Number(item.precio_unitario) || 0;
        const dto = Number(item.descuento_porcentaje) || 0;
        const subtotal = cant * pu;
        const descuento = subtotal * (dto / 100);
        item.total_item = Math.round(subtotal - descuento);
      }

      updated[index] = item;
      return updated;
    });
  };

  // Cálculo de totales idéntico a la plantilla oficial
  const totalNetoAntesDescuento = items.reduce(
    (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    0
  );
  const totalSinIva = items.reduce((acc, it) => acc + (Number(it.total_item) || 0), 0);
  const descuentoTotal = totalNetoAntesDescuento - totalSinIva;
  const ivaCalculado = Math.round(totalSinIva * 0.19);
  const totalFinal = totalSinIva + ivaCalculado;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!clienteId) {
      setErrorMsg('Debes seleccionar un cliente.');
      return;
    }

    if (items.some((it) => !it.producto.trim())) {
      setErrorMsg('Todos los productos deben tener una descripción.');
      return;
    }

    setLoading(true);

    try {
      let numeroCot = '';
      if (baseCotNumber && version > 1) {
        numeroCot = baseCotNumber.replace(/-v\d+$/, '') + `-v${version}`;
      } else {
        numeroCot = generateCotNumber(version);
      }

      const payload = {
        numero_cotizacion: numeroCot,
        cliente_id: clienteId,
        oportunidad_id: oportunidadId || null,
        referencia_cliente: referenciaCliente || null,
        fecha_validez: fechaValidez ? new Date(fechaValidez).toISOString() : null,
        version,
        estado: 'borrador',
        subtotal: totalSinIva,
        monto_neto: totalSinIva,
        iva: ivaCalculado,
        monto_iva: ivaCalculado,
        monto_total: totalFinal,
        plazo_entrega: plazoEntrega,
        condiciones_pago: condicionesPago,
        observaciones,
        comentario_publico: observaciones,
      };

      const itemsPayload = items.map((it) => ({
        producto: it.producto,
        producto_catalogo_id: it.producto_catalogo_id || null,
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        descuento_porcentaje: Number(it.descuento_porcentaje || 0),
        total_item: Number(it.total_item),
      }));

      const { data: savedId, error: saveError } = await supabase.rpc('guardar_cotizacion_atomica', {
        p_cotizacion: payload,
        p_items: itemsPayload,
        p_cotizacion_id: null,
      });

      if (saveError || !savedId) throw new Error(mensajeError(saveError, 'No se pudo guardar la cotización.'));

      await logSistema({
        tipo_accion: version > 1 ? 'actualizacion' : 'creacion',
        entidad: 'cotizaciones',
        entidad_id: savedId as string,
        descripcion: `Cotización ${numeroCot} emitida como Borrador oficial por $${totalFinal.toLocaleString('es-CL')}`,
        usuario_id: currentUser?.id,
        datos_nuevos: payload,
      });

      if (oportunidadId) {
        await supabase.from('actividades_op').insert({
          oportunidad_id: oportunidadId,
          usuario_id: currentUser?.id || null,
          usuario_nombre: currentUser?.nombre || 'Sistema',
          contenido: `Cotización ${numeroCot} creada en borrador por $${totalFinal.toLocaleString('es-CL')}.`,
          tipo: 'actualizacion',
        });
      }

      router.push('/cotizaciones');
    } catch (err: unknown) {
      console.error('Error saving quote:', err);
      setErrorMsg(mensajeError(err, 'No se pudo guardar la cotización.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* PageHeader */}
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-accent-ink" />
            <span>
              {version > 1 ? `Nueva Versión de Cotización (v${version})` : 'Generar Nueva Cotización'}
            </span>
            {version > 1 && (
              <StatusBadge tone="accent">
                <Sparkles className="w-3.5 h-3.5 inline mr-1" />
                Versión {version}
              </StatusBadge>
            )}
          </div>
        }
        description="Emisión de cotización comercial con cálculo de impuestos y condiciones de entrega."
        actions={
          <Link href="/cotizaciones">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4" />
              <span>Volver a la Lista</span>
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Antecedentes del Cliente y Venta */}
        <Panel title="Antecedentes del Cliente y Venta">
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Buscador Interactivo de Clientes */}
            <div className="relative">
              <label className="block font-semibold text-ink mb-1">
                Buscar & Seleccionar Cliente *
              </label>

              <div
                onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-medium flex items-center justify-between cursor-pointer hover:border-accent transition"
              >
                {selectedClient ? (
                  <div className="truncate">
                    <span className="font-semibold text-ink">{selectedClient.nombre}</span>
                    <span className="text-ink-muted t-num text-[11px] ml-2">RUT: {selectedClient.rut}</span>
                  </div>
                ) : (
                  <span className="text-ink-muted">Seleccionar Cliente...</span>
                )}
                <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
              </div>

              {isClientDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-surface border border-line rounded-lg shadow-sm z-50 p-3 space-y-2 max-h-72 overflow-y-auto">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Escribe RUT, Nombre, Razón Social o Correo..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="w-full bg-surface-muted border border-line rounded-md pl-9 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div className="space-y-1">
                    {filteredClientes.map((cli) => {
                      const isSelected = cli.id === clienteId;
                      return (
                        <div
                          key={cli.id}
                          onClick={() => {
                            setClienteId(cli.id);
                            setIsClientDropdownOpen(false);
                          }}
                          className={`p-2.5 rounded-md transition cursor-pointer flex items-start justify-between text-xs ${
                            isSelected ? 'bg-surface-muted border border-line text-accent-ink font-semibold' : 'hover:bg-surface-muted'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-ink">{cli.nombre}</p>
                            <p className="text-[11px] text-ink-muted">
                              RUT: <span className="t-num font-semibold">{cli.rut}</span>
                              {cli.apellido_razon_social && ` · ${cli.apellido_razon_social}`}
                              {cli.correo && ` · ${cli.correo}`}
                            </p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-accent-ink shrink-0" />}
                        </div>
                      );
                    })}

                    {filteredClientes.length === 0 && (
                      <p className="p-3 text-center text-xs text-ink-muted font-medium">
                        No se encontraron clientes coincidentes.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Metadatos: Ref. Cliente & Fecha de Validez */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-ink mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-accent-ink" />
                  <span>Ref. Cliente</span>
                </label>
                <input
                  type="text"
                  value={referenciaCliente}
                  onChange={(e) => setReferenciaCliente(e.target.value)}
                  placeholder="Ej: NEMICEPS"
                  className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink font-medium text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-accent-ink" />
                  <span>Fecha Validez</span>
                </label>
                <input
                  type="date"
                  value={fechaValidez}
                  onChange={(e) => setFechaValidez(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink font-medium text-xs focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Plazo de Entrega</label>
              <input
                type="text"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                placeholder="Inmediato / 5 días hábiles"
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-medium focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Términos de Pago</label>
              <input
                type="text"
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                placeholder="Acuse de recibo / 50% abono"
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-medium focus:outline-none focus:border-accent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-ink mb-1">
                Condiciones comerciales (visibles en PDF)
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Condiciones comerciales o servicios incluidos..."
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink font-medium focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </Panel>

        {/* Tabla de Ítems */}
        <Panel
          title="Partidas y Productos (Valores en CLP)"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddItem}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Producto / Ítem</span>
            </Button>
          }
        >
          <div className="p-4 space-y-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-3 items-center bg-surface-muted p-3 rounded-md border border-line text-xs"
              >
                <div className="col-span-5">
                  <label className="block text-[11px] font-semibold text-ink mb-0.5">Descripción del Producto</label>
                  <select
                    aria-label={`Producto del catálogo ${idx + 1}`}
                    value={item.producto_catalogo_id || ''}
                    onChange={(e) => selectCatalogItem(idx, e.target.value)}
                    className="w-full mb-1 bg-surface border border-line rounded-md px-2 py-1 text-ink"
                  >
                    <option value="">Partida libre / seleccionar catálogo</option>
                    {catalogo.filter((product) => product.categoria !== 'insumo').map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.requiere_revision ? '⚠️ ' : ''}{product.codigo} · {product.nombre} ({product.unidad}){product.requiere_revision ? ' [Revisar precio]' : ''}
                      </option>
                    ))}
                  </select>
                  <textarea
                    required
                    rows={2}
                    placeholder="Descripción de la partida..."
                    value={item.producto}
                    onChange={(e) => handleItemChange(idx, 'producto', e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent"
                  />
                  {catalogo.find((p) => p.id === item.producto_catalogo_id)?.requiere_revision && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-warning bg-warning-soft border border-warning-line rounded px-2 py-1 font-semibold">
                      <span>⚠️</span>
                      <span>Precio referencial OCR (Bottai) — Verificar con lista oficial antes de emitir.</span>
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-ink mb-0.5">Cantidad</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={item.cantidad}
                    onChange={(e) => handleItemChange(idx, 'cantidad', Number(e.target.value))}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink text-center t-num focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-ink mb-0.5">P.U. Neto ($)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={item.precio_unitario}
                    onChange={(e) => handleItemChange(idx, 'precio_unitario', Number(e.target.value))}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink text-right t-num focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-[11px] font-semibold text-ink mb-0.5">Dto. %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.descuento_porcentaje || 0}
                    onChange={(e) => handleItemChange(idx, 'descuento_porcentaje', Number(e.target.value))}
                    className="w-full bg-surface border border-line rounded-md px-2 py-1 text-ink text-center t-num focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="col-span-1 text-right">
                  <label className="block text-[11px] font-semibold text-ink mb-0.5">Base Imp.</label>
                  <span className="font-semibold text-ink block py-1.5 t-num text-[11px]">
                    ${(item.total_item || 0).toLocaleString('es-CL')}
                  </span>
                </div>

                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length === 1}
                    className="p-1 text-danger hover:bg-danger/10 rounded transition disabled:opacity-30"
                    title="Eliminar Ítem"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen de Totales e IVA */}
          <div className="p-4 border-t border-line-subtle flex flex-col items-end space-y-1.5 text-xs">
            <div className="w-full sm:w-80 flex justify-between text-ink-muted">
              <span>Total neto antes del descuento:</span>
              <span className="t-num font-semibold text-ink">${totalNetoAntesDescuento.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-ink-muted">
              <span>Descuento total:</span>
              <span className="t-num font-semibold text-danger">-${descuentoTotal.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-ink font-semibold">
              <span>Total (sin IVA):</span>
              <span className="t-num">${totalSinIva.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-ink-muted">
              <span>Total impuestos 19%:</span>
              <span className="t-num font-semibold text-ink">${ivaCalculado.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-sm font-semibold text-accent-ink pt-2 border-t border-line p-1.5 rounded-md">
              <span>Total (impuesto inc.):</span>
              <span className="t-num">${totalFinal.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </Panel>

        {/* Botón de Guardar */}
        {errorMsg && <p role="alert" className="text-danger text-sm font-semibold">{errorMsg}</p>}
        <div className="flex items-center justify-end gap-3">
          <Link href="/cotizaciones">
            <Button variant="secondary">
              Cancelar
            </Button>
          </Link>
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : version > 1 ? `Emitir Versión ${version}` : 'Emitir Cotización'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-semibold text-ink-muted">Cargando formulario...</div>}>
      <NuevaCotizacionForm />
    </Suspense>
  );
}
