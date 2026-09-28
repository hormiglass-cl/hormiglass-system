'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../lib/context/AuthContext';
import { Cliente, Cotizacion, CotizacionItem, OportunidadVenta, PRODUCTOS_HORMIGLASS } from '../lib/types';
import { logSistema } from '../lib/logger';
import {
  FileText,
  Building,
  TrendingUp,
  Plus,
  Trash2,
  Calculator,
  Save,
  Check,
  Search,
  ChevronDown,
  AlertTriangle,
  Calendar,
  Tag,
} from 'lucide-react';

interface CotizacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteIdInicial?: string;
  oportunidadIdInicial?: string;
  initialCotizacion?: Cotizacion | null;
  onSuccess?: () => void;
}

export function CotizacionModal({
  isOpen,
  onClose,
  clienteIdInicial,
  oportunidadIdInicial,
  initialCotizacion,
  onSuccess,
}: CotizacionModalProps) {
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [clienteId, setClienteId] = useState<string>(clienteIdInicial || '');
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
  const [clientSearchQuery, setClientSearchQuery] = useState('');

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
      if (initialCotizacion.observaciones || initialCotizacion.comentario_publico) {
        setObservaciones(initialCotizacion.comentario_publico || initialCotizacion.observaciones || '');
      }
    } else {
      if (clienteIdInicial) setClienteId(clienteIdInicial);
      if (oportunidadIdInicial) setOportunidadId(oportunidadIdInicial);
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setFechaValidez(d.toISOString().split('T')[0]);
    }
  }, [clienteIdInicial, oportunidadIdInicial, initialCotizacion]);

  useEffect(() => {
    async function loadSelectData() {
      try {
        const [cliRes, opRes] = await Promise.all([
          supabase.from('clientes').select('*'),
          supabase.from('oportunidades').select('*'),
        ]);

        if (cliRes.data && cliRes.data.length > 0) {
          setClientes(cliRes.data as Cliente[]);
          if (!clienteIdInicial && !initialCotizacion) setClienteId(cliRes.data[0].id);
        }
        if (opRes.data && opRes.data.length > 0) {
          setOportunidades(opRes.data as OportunidadVenta[]);
        }
      } catch (err) {
        console.error('Error loading modal data:', err);
      }
    }
    if (isOpen) loadSelectData();
  }, [isOpen, clienteIdInicial, initialCotizacion]);

  if (!isOpen) return null;

  const selectedClient = clientes.find((c) => c.id === clienteId);
  const clientOportunidades = oportunidades.filter(
    (o) => o.cliente_id === clienteId || o.cliente?.id === clienteId
  );

  const handleItemChange = (index: number, field: keyof CotizacionItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };
    const q = Number(item.cantidad) || 0;
    const p = Number(item.precio_unitario) || 0;
    const dto = Number(item.descuento_porcentaje) || 0;
    item.total_item = Math.round(q * p * (1 - dto / 100));
    updated[index] = item;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        producto: PRODUCTOS_HORMIGLASS[0],
        cantidad: 1,
        precio_unitario: 0,
        descuento_porcentaje: 0,
        total_item: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  // Financial calculations matching cotizacion-ejemplo.pdf
  const totalNetoAntesDescuento = items.reduce((acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const descuentoTotal = items.reduce((acc, it) => {
    const q = Number(it.cantidad) || 0;
    const p = Number(it.precio_unitario) || 0;
    const dto = Number(it.descuento_porcentaje) || 0;
    return acc + Math.round((q * p * dto) / 100);
  }, 0);
  const totalSinIva = Math.max(0, totalNetoAntesDescuento - descuentoTotal);
  const ivaCalculado = Math.round(totalSinIva * 0.19);
  const totalFinal = totalSinIva + ivaCalculado;

  const isValidUuid = (str?: string | null) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const checkHasChanges = (): boolean => {
    if (!initialCotizacion) return true;
    if (initialCotizacion.cliente_id !== clienteId) return true;
    if ((initialCotizacion.oportunidad_id || '') !== (oportunidadId || '')) return true;
    if ((initialCotizacion.referencia_cliente || '') !== referenciaCliente) return true;
    if ((initialCotizacion.fecha_validez || '') !== fechaValidez) return true;
    if (initialCotizacion.plazo_entrega !== plazoEntrega) return true;
    if (initialCotizacion.condiciones_pago !== condicionesPago) return true;
    if (initialCotizacion.observaciones !== observaciones) return true;
    if (initialCotizacion.monto_total !== totalFinal) return true;

    // Check items length or content
    const origItems = initialCotizacion.items || [];
    if (origItems.length !== items.length) return true;
    for (let i = 0; i < items.length; i++) {
      if (
        items[i].producto !== origItems[i]?.producto ||
        items[i].cantidad !== origItems[i]?.cantidad ||
        items[i].precio_unitario !== origItems[i]?.precio_unitario ||
        (items[i].descuento_porcentaje || 0) !== (origItems[i]?.descuento_porcentaje || 0)
      ) {
        return true;
      }
    }
    return false;
  };

  const saveQuoteToBackend = async (isNewVersion: boolean) => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (initialCotizacion && !isNewVersion && initialCotizacion.estado !== 'borrador') {
        throw new Error('Una cotización enviada o aprobada solo puede modificarse creando una versión nueva.');
      }
      const baseNum = initialCotizacion?.numero_cotizacion.replace(/-v\d+$/i, '');
      const { data: versions, error: versionError } = baseNum
        ? await supabase.from('cotizaciones').select('version, numero_cotizacion').like('numero_cotizacion', `${baseNum}-v%`)
        : isValidUuid(oportunidadId)
          ? await supabase.from('cotizaciones').select('version, numero_cotizacion').eq('oportunidad_id', oportunidadId)
          : { data: [], error: null };
      if (versionError) throw versionError;
      const nextVer = initialCotizacion && isNewVersion
        ? Math.max(initialCotizacion.version || 1,
          ...(versions || []).map((quote: Pick<Cotizacion, 'version' | 'numero_cotizacion'>) =>
            Number(quote.version) || Number(String(quote.numero_cotizacion).match(/-v(\d+)$/i)?.[1]) || 1)) + 1
        : initialCotizacion?.version || Math.max(0, ...(versions || []).map((quote: Pick<Cotizacion, 'version'>) => Number(quote.version) || 0)) + 1;
      const cotNum = initialCotizacion
        ? isNewVersion ? `${baseNum}-v${nextVer}` : initialCotizacion.numero_cotizacion
        : `COT-2026-${Math.floor(1000 + Math.random() * 9000)}-v${nextVer}`;
      const payload = {
        numero_cotizacion: cotNum,
        cliente_id: clienteId,
        usuario_id: isValidUuid(currentUser?.id) ? currentUser?.id : null,
        oportunidad_id: isValidUuid(oportunidadId) ? oportunidadId : null,
        version: nextVer,
        estado: 'borrador',
        referencia_cliente: referenciaCliente || null,
        fecha_validez: fechaValidez || null,
        subtotal: totalSinIva,
        descuento: descuentoTotal,
        iva_porcentaje: 19,
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
      if (saveError || !savedId) throw new Error(saveError?.message || 'No se confirmó la cotización.');
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
    } catch (err: any) {
      console.error('Error saving quote in Supabase:', err);
      setErrorMsg(`Error al guardar en Supabase: ${err?.message || 'Revisa los campos.'}`);
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

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 z-50 ">
      <div className="bg-white border border-gray-200 rounded-lg max-w-3xl w-full p-5 sm:p-7 space-y-4 shadow-sm text-[#213343] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="text-lg font-extrabold text-[#213343] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#f97316]" />
            <span>
              {initialCotizacion
                ? `Editar Cotización N° ${initialCotizacion.numero_cotizacion}`
                : 'Emitir Nueva Cotización Oficial'}
            </span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#213343] text-xl font-bold">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-lg text-xs font-bold">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Cliente & Oportunidad vinculada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
            {/* Cliente */}
            <div className="relative">
              <label className="block font-bold text-gray-700 mb-1">Cliente *</label>
              <div
                onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-medium flex items-center justify-between cursor-pointer"
              >
                {selectedClient ? (
                  <span className="font-extrabold text-[#213343] truncate">{selectedClient.nombre}</span>
                ) : (
                  <span className="text-gray-400">Seleccionar Cliente...</span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </div>

              {isClientSearchOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-sm z-50 p-2 max-h-52 overflow-y-auto space-y-1">
                  {clientes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setClienteId(c.id);
                        setOportunidadId('');
                        setIsClientSearchOpen(false);
                      }}
                      className="p-2 hover:bg-orange-50 rounded-md cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-[#213343]">{c.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-mono">RUT: {c.rut}</p>
                      </div>
                      {c.id === clienteId && <Check className="w-4 h-4 text-[#f97316]" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Oportunidad de Venta asociada */}
            <div>
              <label className="block font-bold text-gray-700 mb-1">Oportunidad de Venta Asociada (Opcional)</label>
              <select
                value={oportunidadId}
                onChange={(e) => setOportunidadId(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-extrabold focus:outline-none focus:border-[#f97316]"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
              <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-[#f97316]" />
                <span>Ref. Cliente (Ej: Proyecto / Orden / Código)</span>
              </label>
              <input
                type="text"
                value={referenciaCliente}
                onChange={(e) => setReferenciaCliente(e.target.value)}
                placeholder="Ej: NEMICEPS o PROY-2026"
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#f97316]" />
                <span>Validar Fecha de Término (Validez)</span>
              </label>
              <input
                type="date"
                value={fechaValidez}
                onChange={(e) => setFechaValidez(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
              />
            </div>
          </div>

          {/* Lista de Ítems / Productos con Dto % */}
          <div className="space-y-3 bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="font-extrabold text-[#213343] flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-[#f97316]" />
                <span>Partidas y Productos (Monto en Chile Peso)</span>
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white px-2.5 py-1 rounded-md text-[11px] font-bold border border-orange-200 transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </button>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={item.producto}
                      onChange={(e) => handleItemChange(idx, 'producto', e.target.value)}
                      placeholder="Descripción del Producto / Servicio"
                      className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs font-bold text-[#213343] focus:outline-none focus:border-[#f97316]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      disabled={items.length === 1}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-md transition disabled:opacity-30"
                      title="Eliminar partida"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-0.5">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) => handleItemChange(idx, 'cantidad', Number(e.target.value))}
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-center font-bold text-[#213343]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-0.5">P.U. Neto ($)</label>
                      <input
                        type="number"
                        min="0"
                        value={item.precio_unitario}
                        onChange={(e) => handleItemChange(idx, 'precio_unitario', Number(e.target.value))}
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-right font-mono font-bold text-[#213343]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-0.5">Dto. %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={item.descuento_porcentaje || 0}
                        onChange={(e) => handleItemChange(idx, 'descuento_porcentaje', Number(e.target.value))}
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-center font-bold text-[#213343]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-0.5">Base Imp. ($)</label>
                      <div className="bg-gray-200/70 border border-gray-300 rounded-md px-2 py-1 text-right font-mono font-black text-[#213343]">
                        ${(item.total_item || 0).toLocaleString('es-CL')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Totales desglosados idénticos a la plantilla */}
            <div className="flex flex-col items-end space-y-1 pt-2 border-t border-gray-100">
              <div className="w-72 space-y-1 text-xs bg-gray-50 p-3 rounded-md border border-gray-200">
                <div className="flex justify-between text-gray-600">
                  <span>Total neto antes descuento:</span>
                  <span className="font-mono font-bold">${totalNetoAntesDescuento.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Descuento total:</span>
                  <span className="font-mono font-bold text-red-600">-${descuentoTotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-700 font-bold">
                  <span>Total (sin IVA):</span>
                  <span className="font-mono">${totalSinIva.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Total impuestos 19%:</span>
                  <span className="font-mono font-bold">${ivaCalculado.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-[#f97316] pt-1.5 border-t border-gray-300 bg-orange-50/50 p-1 rounded">
                  <span>Total (impuesto inc.):</span>
                  <span className="font-mono">${totalFinal.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Condiciones Comerciales & Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Retraso disponible (Plazo Entrega)</label>
              <input
                type="text"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                placeholder="Inmediato / 5 días hábiles"
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Términos de pago</label>
              <input
                type="text"
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                placeholder="Acuse de recibo / 50% abono"
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-medium"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">Comentario público / Observaciones</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                placeholder="Observaciones visibles en el PDF..."
                className="w-full bg-white border border-gray-300 rounded-md p-2.5 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold px-5 py-2 rounded-md transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando en Supabase...' : initialCotizacion ? 'Guardar Cambios' : 'Emitir Cotización'}</span>
            </button>
          </div>
        </form>

        {/* Modal de confirmación de versionado */}
        {showVersionConfirmModal && initialCotizacion && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-60 ">
            <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle className="w-6 h-6" />
                <h4 className="font-extrabold text-base text-[#213343]">Confirmar Modificación de Cotización</h4>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Estás editando la cotización <strong className="text-[#213343]">{initialCotizacion.numero_cotizacion}</strong>. Crea una versión nueva para conservar el historial. Solo un borrador puede sobrescribirse.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => saveQuoteToBackend(true)}
                  disabled={loading}
                  className="w-full bg-[#f97316] hover:bg-[#ea580c] text-white font-extrabold py-2.5 rounded-md transition text-xs flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Crear Nueva Versión (v{(initialCotizacion.version || 1) + 1}) [Recomendado]</span>
                </button>
                {initialCotizacion.estado === 'borrador' && <button
                  type="button"
                  onClick={() => saveQuoteToBackend(false)}
                  disabled={loading}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2 rounded-md transition text-xs"
                >
                  Sobrescribir Versión Actual (v{initialCotizacion.version || 1})
                </button>}
                <button
                  type="button"
                  onClick={() => setShowVersionConfirmModal(false)}
                  className="w-full text-gray-400 hover:text-gray-600 py-1 text-xs font-medium"
                >
                  Volver al formulario
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
