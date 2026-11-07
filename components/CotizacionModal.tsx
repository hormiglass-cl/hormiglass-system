'use client';

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../lib/context/AuthContext';
import { Cliente, Cotizacion, CotizacionItem, OportunidadVenta, ProductoCatalogo, PRODUCTOS_HORMIGLASS } from '../lib/types';
import { logSistema } from '../lib/logger';
import {
  FileText,
  TrendingUp,
  Plus,
  Trash2,
  Calculator,
  Save,
  Check,
  ChevronDown,
  AlertTriangle,
  Calendar,
  Tag,
  Search,
  X,
} from 'lucide-react';
import { mensajeError } from '../lib/errores';
import { Button, CodeStamp, IconButton } from './ui/crm';

interface CotizacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteIdInicial?: string;
  oportunidadIdInicial?: string;
  editCotizacionIdInicial?: string;
  initialCotizacion?: Cotizacion | null;
  onSuccess?: () => void;
}

export function CotizacionModal({
  isOpen,
  onClose,
  clienteIdInicial,
  oportunidadIdInicial,
  editCotizacionIdInicial,
  initialCotizacion,
  onSuccess,
}: CotizacionModalProps) {
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [clienteId, setClienteId] = useState<string>(clienteIdInicial || '');
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [oportunidadId, setOportunidadId] = useState<string>(oportunidadIdInicial || '');

  // Meta fields
  const [referenciaCliente, setReferenciaCliente] = useState('');
  const [fechaValidez, setFechaValidez] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });

  // Form items
  const [items, setItems] = useState<CotizacionItem[]>([
    {
      producto: PRODUCTOS_HORMIGLASS[0],
      cantidad: 1,
      precio_unitario: 5000,
      descuento_porcentaje: 0,
      total_item: 5000,
    },
  ]);

  const [plazoEntrega, setPlazoEntrega] = useState('Inmediato');
  const [condicionesPago, setCondicionesPago] = useState('Acuse de recibo');
  const [observaciones, setObservaciones] = useState('Cotización oficial emitida desde CRM Hormiglass');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showVersionConfirmModal, setShowVersionConfirmModal] = useState(false);

  // Dropdown states
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);

  useEffect(() => {
    if (initialCotizacion) {
      setClienteId(initialCotizacion.cliente_id || clienteIdInicial || '');
      setOportunidadId(initialCotizacion.oportunidad_id || oportunidadIdInicial || '');
      setReferenciaCliente(initialCotizacion.referencia_cliente || '');
      if (initialCotizacion.fecha_validez) {
        setFechaValidez(initialCotizacion.fecha_validez.split('T')[0]);
      } else {
        const d = initialCotizacion.created_at ? new Date(initialCotizacion.created_at) : new Date();
        d.setDate(d.getDate() + 30);
        setFechaValidez(d.toISOString().split('T')[0]);
      }
      if (initialCotizacion.items && initialCotizacion.items.length > 0) {
        setItems(
          initialCotizacion.items.map((it) => ({
            ...it,
            descuento_porcentaje: it.descuento_porcentaje || 0,
          }))
        );
      }
      if (initialCotizacion.plazo_entrega) setPlazoEntrega(initialCotizacion.plazo_entrega);
      if (initialCotizacion.condiciones_pago) setCondicionesPago(initialCotizacion.condiciones_pago);
      if (initialCotizacion.observaciones) setObservaciones(initialCotizacion.observaciones);
    } else {
      setClienteId(clienteIdInicial || '');
      setOportunidadId(oportunidadIdInicial || '');
      setReferenciaCliente('');
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setFechaValidez(d.toISOString().split('T')[0]);
      setItems([
        {
          producto: PRODUCTOS_HORMIGLASS[0],
          cantidad: 1,
          precio_unitario: 5000,
          descuento_porcentaje: 0,
          total_item: 5000,
        },
      ]);
      setPlazoEntrega('Inmediato');
      setCondicionesPago('Acuse de recibo');
      setObservaciones('Cotización oficial emitida desde CRM Hormiglass');
    }
    setErrorMsg('');
    setShowVersionConfirmModal(false);
  }, [initialCotizacion, clienteIdInicial, oportunidadIdInicial, isOpen]);

  useEffect(() => {
    async function loadAux() {
      const [{ data: cData }, { data: oData }, { data: pData }] = await Promise.all([
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('oportunidades').select('*').order('created_at', { ascending: false }),
        supabase.from('catalogo_productos').select('*').eq('activo', true).order('nombre'),
      ]);
      const loadedClientes = (cData || []) as Cliente[];
      setClientes(loadedClientes);
      setOportunidades((oData || []) as OportunidadVenta[]);
      setCatalogo((pData || []) as ProductoCatalogo[]);

      if (!initialCotizacion && !clienteIdInicial && loadedClientes.length > 0) {
        setClienteId((prev) => prev || loadedClientes[0].id);
      }

      if (editCotizacionIdInicial && !initialCotizacion) {
        const { data: baseCot } = await supabase
          .from('cotizaciones')
          .select('*, items:cotizacion_items(*)')
          .eq('id', editCotizacionIdInicial)
          .single();
        if (baseCot) {
          const cot = baseCot as Cotizacion;
          setClienteId(cot.cliente_id);
          setOportunidadId(cot.oportunidad_id || '');
          setReferenciaCliente(cot.referencia_cliente || '');
          if (cot.fecha_validez) setFechaValidez(cot.fecha_validez.split('T')[0]);
          if (cot.plazo_entrega) setPlazoEntrega(cot.plazo_entrega);
          if (cot.condiciones_pago) setCondicionesPago(cot.condiciones_pago);
          if (cot.observaciones) setObservaciones(cot.observaciones);
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
    if (isOpen) {
      loadAux();
    }
  }, [isOpen, supabase, initialCotizacion, clienteIdInicial, editCotizacionIdInicial]);

  const clientOportunidades = oportunidades.filter((o) => o.cliente_id === clienteId);
  const selectedClient = clientes.find((c) => c.id === clienteId);
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

  // Totales
  const totalNetoAntesDescuento = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const totalSinIva = items.reduce((acc, it) => acc + (Number(it.total_item) || 0), 0);
  const descuentoTotal = totalNetoAntesDescuento - totalSinIva;
  const ivaCalculado = Math.round(totalSinIva * 0.19);
  const totalFinal = totalSinIva + ivaCalculado;

  const isValidUuid = (val?: string | null): boolean => {
    if (!val) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  };

  const checkHasChanges = () => {
    if (!initialCotizacion) return false;
    const sameRef = (initialCotizacion.referencia_cliente || '') === referenciaCliente;
    const sameValidez = (initialCotizacion.fecha_validez || '').split('T')[0] === fechaValidez;
    const samePlazo = (initialCotizacion.plazo_entrega || '') === plazoEntrega;
    const sameCond = (initialCotizacion.condiciones_pago || '') === condicionesPago;
    const sameObs = (initialCotizacion.observaciones || '') === observaciones;
    const sameClient = (initialCotizacion.cliente_id || '') === clienteId;
    const sameOp = (initialCotizacion.oportunidad_id || '') === oportunidadId;

    const oldItems = initialCotizacion.items || [];
    const sameItemsCount = oldItems.length === items.length;
    let sameItemsContent = sameItemsCount;
    if (sameItemsCount) {
      for (let i = 0; i < items.length; i++) {
        if (
          items[i].producto !== oldItems[i].producto ||
          Number(items[i].cantidad) !== Number(oldItems[i].cantidad) ||
          Number(items[i].precio_unitario) !== Number(oldItems[i].precio_unitario) ||
          Number(items[i].descuento_porcentaje || 0) !== Number(oldItems[i].descuento_porcentaje || 0)
        ) {
          sameItemsContent = false;
          break;
        }
      }
    }

    return !(sameRef && sameValidez && samePlazo && sameCond && sameObs && sameClient && sameOp && sameItemsContent);
  };

  const saveQuoteToBackend = async (isNewVersion: boolean) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const nextVer = isNewVersion ? (initialCotizacion?.version || 1) + 1 : (initialCotizacion?.version || 1);
      let cotNum = initialCotizacion?.numero_cotizacion || '';
      if (!cotNum) {
        const rand = Math.floor(1000 + Math.random() * 9000);
        cotNum = `COT-2026-${rand}-v${nextVer}`;
      } else if (isNewVersion) {
        cotNum = cotNum.replace(/-v\d+$/, '') + `-v${nextVer}`;
      }

      const payload = {
        numero_cotizacion: cotNum,
        cliente_id: clienteId,
        oportunidad_id: isValidUuid(oportunidadId) ? oportunidadId : null,
        referencia_cliente: referenciaCliente || null,
        fecha_validez: fechaValidez ? new Date(fechaValidez).toISOString() : null,
        version: nextVer,
        estado: initialCotizacion && !isNewVersion ? initialCotizacion.estado : 'borrador',
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
        p_cotizacion_id: initialCotizacion && !isNewVersion ? initialCotizacion.id : null,
      });
      if (saveError || !savedId) throw new Error(mensajeError(saveError, 'No se confirmó la cotización.'));
      void logSistema({
        tipo_accion: initialCotizacion && !isNewVersion ? 'actualizacion' : 'creacion',
        entidad: 'cotizaciones',
        entidad_id: savedId as string,
        descripcion: `Cotización ${cotNum} guardada en borrador por $${totalFinal.toLocaleString('es-CL')}`,
        usuario_id: currentUser?.id,
      }).catch(console.error);
      if (isValidUuid(oportunidadId)) {
        const { error: activityError } = await supabase.from('actividades_op').insert({
          oportunidad_id: oportunidadId,
          usuario_id: isValidUuid(currentUser?.id) ? currentUser?.id : null,
          usuario_nombre: currentUser?.nombre || 'Sistema',
          contenido: `Cotización ${cotNum} guardada en borrador por $${totalFinal.toLocaleString('es-CL')}.`,
          tipo: 'actualizacion',
        });
        if (activityError) console.error(activityError);
      }
      try { await onSuccess?.(); } catch (refreshError) { console.error('No se pudo refrescar la lista:', refreshError); }
      setShowVersionConfirmModal(false);
      onClose();
    } catch (err: unknown) {
      console.error('Error saving quote in Supabase:', err);
      setErrorMsg(mensajeError(err, 'No se pudo guardar la cotización. Revisa los campos.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!clienteId) {
      setErrorMsg('Debes seleccionar un cliente.');
      return;
    }

    if (initialCotizacion) {
      const changed = checkHasChanges();
      if (!changed) {
        onClose();
        return;
      }
      setShowVersionConfirmModal(true);
    } else {
      await saveQuoteToBackend(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-line rounded-panel max-w-3xl w-full shadow-[var(--hg-shadow-popover)] text-ink max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header Fijo */}
        <header className="shrink-0 flex items-center justify-between border-b border-line-subtle px-5 py-4 bg-surface">
          <h3 className="t-section flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-ink shrink-0" />
            <span>
              {initialCotizacion ? (
                <>Editar Cotización <CodeStamp>{initialCotizacion.numero_cotizacion}</CodeStamp></>
              ) : (
                'Emitir Nueva Cotización Oficial'
              )}
            </span>
          </h3>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>

        {/* Cuerpo Scrollable */}
        <form id="form-cotizacion-modal" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="bg-danger-soft border border-danger-line text-danger p-3 rounded-md text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Cliente & Oportunidad vinculada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-muted p-4 rounded-lg border border-line">
            {/* Cliente */}
            <div className="relative">
              <label className="block font-semibold text-ink mb-1">Cliente *</label>
              <button
                type="button"
                onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                className="hg-field flex items-center justify-between text-left font-medium cursor-pointer"
              >
                {selectedClient ? (
                  <span className="font-semibold text-ink truncate">{selectedClient.nombre}</span>
                ) : (
                  <span className="text-ink-muted">Seleccionar Cliente...</span>
                )}
                <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
              </button>

              {isClientSearchOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-surface border border-line rounded-lg shadow-sm z-50 p-2 max-h-60 overflow-y-auto space-y-1">
                  <div className="relative mb-1.5">
                    <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre o RUT..."
                      className="w-full bg-surface-muted border border-line rounded-md pl-8 pr-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                  {filteredClientes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setClienteId(c.id);
                        setOportunidadId('');
                        setIsClientSearchOpen(false);
                      }}
                      className="p-2 hover:bg-surface-muted rounded-md cursor-pointer flex items-center justify-between transition"
                    >
                      <div>
                        <p className="font-semibold text-ink">{c.nombre}</p>
                        <p className="text-[11px] text-ink-muted t-num">RUT: {c.rut}</p>
                      </div>
                      {c.id === clienteId && <Check className="w-4 h-4 text-accent-ink" />}
                    </div>
                  ))}
                  {filteredClientes.length === 0 && (
                    <p className="text-[11px] text-ink-muted text-center py-2">Sin clientes coincidentes</p>
                  )}
                </div>
              )}
            </div>

            {/* Oportunidad de Venta asociada */}
            <div>
              <label className="block font-semibold text-ink mb-1">Oportunidad de Venta Asociada (Opcional)</label>
              <select
                value={oportunidadId}
                onChange={(e) => setOportunidadId(e.target.value)}
                className="hg-field font-medium"
              >
                <option value="">-- Sin Oportunidad Vinculada --</option>
                {clientOportunidades.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.codigo} — {op.titulo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metadatos de Cabecera: Ref. Cliente & Fecha de Validez */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-muted p-4 rounded-lg border border-line">
            <div>
              <label className="block font-semibold text-ink mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-accent-ink" />
                <span>Ref. Cliente (Ej: Proyecto / Orden / Código)</span>
              </label>
              <input
                type="text"
                value={referenciaCliente}
                onChange={(e) => setReferenciaCliente(e.target.value)}
                placeholder="Ej: NEMICEPS o PROY-2026"
                className="hg-field font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent-ink" />
                <span>Validar Fecha de Término (Validez)</span>
              </label>
              <input
                type="date"
                value={fechaValidez}
                onChange={(e) => setFechaValidez(e.target.value)}
                className="hg-field font-medium"
              />
            </div>
          </div>

          {/* Lista de Ítems / Productos con Dto % */}
          <div className="space-y-3 bg-surface p-4 rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line-subtle pb-2.5">
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-accent-ink" />
                <span>Partidas y Productos (Valores en CLP)</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddItem}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => {
                const selectedCatalogoProd = catalogo.find((p) => p.id === item.producto_catalogo_id);
                return (
                  <div key={idx} className="p-3.5 bg-surface-muted rounded-lg border border-line space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        Partida #{idx + 1}
                      </span>
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        {catalogo.length > 0 && (
                          <select
                            aria-label={`Producto del catálogo ${idx + 1}`}
                            value={item.producto_catalogo_id || ''}
                            onChange={(e) => selectCatalogItem(idx, e.target.value)}
                            className="w-full sm:w-72 bg-surface border border-line rounded-md px-2.5 py-1.5 text-xs font-medium text-ink focus:outline-none focus:border-accent"
                          >
                            <option value="">-- Seleccionar desde Catálogo (Opcional) --</option>
                            {catalogo.map((p) => (
                              <option key={p.id} value={p.id}>
                                [{p.codigo}] {p.nombre} — ${(p.precio_referencia || 0).toLocaleString('es-CL')}
                                {p.requiere_revision ? ' (Verificar Bottai)' : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length === 1}
                          className="p-1.5 text-danger hover:bg-danger-soft rounded-md transition disabled:opacity-30 shrink-0"
                          title="Eliminar partida"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {selectedCatalogoProd?.requiere_revision && (
                      <div className="bg-warning-soft border border-warning-line rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-warning flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Precio referencial OCR (Bottai) — Verificar con lista oficial antes de emitir.</span>
                      </div>
                    )}

                    <div>
                      <textarea
                        rows={2}
                        value={item.producto}
                        onChange={(e) => handleItemChange(idx, 'producto', e.target.value)}
                        placeholder="Descripción de la partida o producto..."
                        className="w-full bg-surface border border-line rounded-md px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:border-accent"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-ink-muted font-medium mb-1">Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => handleItemChange(idx, 'cantidad', Number(e.target.value))}
                          className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-center font-semibold text-ink t-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted font-medium mb-1">P.U. Neto ($)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.precio_unitario}
                          onChange={(e) => handleItemChange(idx, 'precio_unitario', Number(e.target.value))}
                          className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-right font-semibold text-ink t-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted font-medium mb-1">Dto. %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.descuento_porcentaje || 0}
                          onChange={(e) => handleItemChange(idx, 'descuento_porcentaje', Number(e.target.value))}
                          className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-center font-semibold text-ink t-num"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-ink-muted font-medium mb-1">Base Imp. ($)</label>
                        <div className="bg-surface border border-line rounded-md px-2.5 py-1.5 text-right t-num font-semibold text-ink">
                          ${(item.total_item || 0).toLocaleString('es-CL')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totales desglosados */}
            <div className="flex flex-col items-end space-y-1 pt-2 border-t border-line-subtle">
              <div className="w-full sm:w-72 space-y-1 text-xs bg-surface-muted p-3 rounded-md border border-line">
                <div className="flex justify-between text-ink-muted">
                  <span>Total neto antes descuento:</span>
                  <span className="t-num font-semibold text-ink">${totalNetoAntesDescuento.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Descuento total:</span>
                  <span className="t-num font-semibold text-danger">-${descuentoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-ink font-semibold">
                  <span>Total (sin IVA):</span>
                  <span className="t-num">${totalSinIva.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <span>Total impuestos 19%:</span>
                  <span className="t-num font-semibold text-ink">${ivaCalculado.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between font-semibold text-sm text-accent-ink pt-1.5 border-t border-line p-1">
                  <span>Total (impuesto inc.):</span>
                  <span className="t-num">${totalFinal.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Condiciones Comerciales & Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-muted p-4 rounded-lg border border-line">
            <div>
              <label className="block font-semibold text-ink mb-1">Plazo de Entrega</label>
              <input
                type="text"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                placeholder="Inmediato / 5 días hábiles"
                className="hg-field font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink mb-1">Términos de pago</label>
              <input
                type="text"
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                placeholder="Acuse de recibo / 50% abono"
                className="hg-field font-medium"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-ink mb-1">
                Condiciones / Incluye (aparece bajo los productos)
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Condiciones comerciales o servicios incluidos visibles bajo los productos en el PDF..."
                className="w-full bg-surface border border-line rounded-md p-2.5 text-ink font-medium focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </form>

        {/* Footer Fijo con Botones de Acción */}
        <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3.5">
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="form-cotizacion-modal"
            disabled={loading}
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : initialCotizacion ? 'Guardar Cambios' : 'Emitir Cotización'}</span>
          </Button>
        </footer>

        {/* Modal de confirmación de versionado */}
        {showVersionConfirmModal && initialCotizacion && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110]">
            <div className="bg-surface border border-line rounded-panel max-w-md w-full p-6 space-y-4 shadow-[var(--hg-shadow-popover)] text-ink">
              <div className="flex items-center gap-3 text-warning">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h4 className="font-semibold text-base text-ink">Confirmar Modificación de Cotización</h4>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Estás editando la cotización <strong className="text-ink">{initialCotizacion.numero_cotizacion}</strong>. Crea una versión nueva para conservar el historial. Solo un borrador puede sobrescribirse.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  variant="primary"
                  onClick={() => saveQuoteToBackend(true)}
                  disabled={loading}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Crear Nueva Versión (v{(initialCotizacion.version || 1) + 1})</span>
                </Button>
                {initialCotizacion.estado === 'borrador' && (
                  <Button
                    variant="secondary"
                    onClick={() => saveQuoteToBackend(false)}
                    disabled={loading}
                  >
                    Sobrescribir Versión Actual (v{initialCotizacion.version || 1})
                  </Button>
                )}
                <Button
                  variant="subtle"
                  onClick={() => setShowVersionConfirmModal(false)}
                >
                  Volver al formulario
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
