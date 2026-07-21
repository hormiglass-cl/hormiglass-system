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

  // Form items
  const [items, setItems] = useState<CotizacionItem[]>([
    {
      producto: PRODUCTOS_HORMIGLASS[0],
      cantidad: 1,
      precio_unitario: 5000,
      total_item: 5000,
    },
  ]);

  const [plazoEntrega, setPlazoEntrega] = useState('5 días hábiles');
  const [condicionesPago, setCondicionesPago] = useState('50% abono / 50% al despacho');
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
      if (initialCotizacion.items && initialCotizacion.items.length > 0) {
        setItems(initialCotizacion.items);
      }
      if (initialCotizacion.plazo_entrega) setPlazoEntrega(initialCotizacion.plazo_entrega);
      if (initialCotizacion.condiciones_pago) setCondicionesPago(initialCotizacion.condiciones_pago);
      if (initialCotizacion.observaciones) setObservaciones(initialCotizacion.observaciones);
    } else {
      if (clienteIdInicial) setClienteId(clienteIdInicial);
      if (oportunidadIdInicial) setOportunidadId(oportunidadIdInicial);
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
    if (field === 'cantidad' || field === 'precio_unitario') {
      const q = Number(item.cantidad) || 0;
      const p = Number(item.precio_unitario) || 0;
      item.total_item = q * p;
    }
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
        total_item: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotalNeto = items.reduce((acc, it) => acc + (it.total_item || 0), 0);
  const ivaCalculado = Math.round(subtotalNeto * 0.19);
  const totalFinal = subtotalNeto + ivaCalculado;

  const isValidUuid = (str?: string | null) => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const checkHasChanges = (): boolean => {
    if (!initialCotizacion) return true;
    if (initialCotizacion.cliente_id !== clienteId) return true;
    if ((initialCotizacion.oportunidad_id || '') !== (oportunidadId || '')) return true;
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
        items[i].precio_unitario !== origItems[i]?.precio_unitario
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
      if (initialCotizacion) {
        if (isNewVersion) {
          // Create new version with unique versioned numero_cotizacion
          const nextVer = (initialCotizacion.version || 1) + 1;
          const baseNum = (initialCotizacion.numero_cotizacion || '').replace(/-v\d+$/i, '');
          const versionedCotNum = `${baseNum}-v${nextVer}`;

          const { data: newCot, error: cotErr } = await supabase
            .from('cotizaciones')
            .insert([{
              numero_cotizacion: versionedCotNum,
              cliente_id: clienteId,
              usuario_id: isValidUuid(currentUser?.id) ? currentUser?.id : (isValidUuid(initialCotizacion.usuario_id) ? initialCotizacion.usuario_id : null),
              oportunidad_id: isValidUuid(oportunidadId) ? oportunidadId : null,
              version: nextVer,
              estado: 'borrador',
              subtotal: subtotalNeto,
              descuento: 0,
              iva_porcentaje: 19,
              monto_iva: ivaCalculado,
              monto_total: totalFinal,
              plazo_entrega: plazoEntrega,
              condiciones_pago: condicionesPago,
              observaciones: observaciones,
            }])
            .select()
            .single();

          if (cotErr) throw new Error(cotErr.message);

          if (newCot) {
            const itemsPayload = items.map((it) => ({
              cotizacion_id: newCot.id,
              producto: it.producto,
              cantidad: Number(it.cantidad),
              precio_unitario: Number(it.precio_unitario),
              descuento_porcentaje: 0,
              total_item: Number(it.total_item),
            }));
            await supabase.from('cotizacion_items').insert(itemsPayload);

            await logSistema({
              tipo_accion: 'creacion',
              entidad: 'cotizaciones',
              entidad_id: newCot.id,
              descripcion: `Nueva versión (v${nextVer}) creada para cotización ${initialCotizacion.numero_cotizacion}`,
              usuario_id: currentUser?.id,
              datos_anteriores: initialCotizacion,
              datos_nuevos: newCot,
            });
          }
        } else {
          // Overwrite current version
          const { error: updateErr } = await supabase
            .from('cotizaciones')
            .update({
              cliente_id: clienteId,
              oportunidad_id: isValidUuid(oportunidadId) ? oportunidadId : null,
              subtotal: subtotalNeto,
              monto_iva: ivaCalculado,
              monto_total: totalFinal,
              plazo_entrega: plazoEntrega,
              condiciones_pago: condicionesPago,
              observaciones: observaciones,
            })
            .eq('id', initialCotizacion.id);

          if (updateErr) throw new Error(updateErr.message);

          // Delete & replace items
          await supabase.from('cotizacion_items').delete().eq('cotizacion_id', initialCotizacion.id);
          const itemsPayload = items.map((it) => ({
            cotizacion_id: initialCotizacion.id,
            producto: it.producto,
            cantidad: Number(it.cantidad),
            precio_unitario: Number(it.precio_unitario),
            descuento_porcentaje: 0,
            total_item: Number(it.total_item),
          }));
          await supabase.from('cotizacion_items').insert(itemsPayload);

          await logSistema({
            tipo_accion: 'actualizacion',
            entidad: 'cotizaciones',
            entidad_id: initialCotizacion.id,
            descripcion: `Cotización ${initialCotizacion.numero_cotizacion} (v${initialCotizacion.version || 1}) actualizada`,
            usuario_id: currentUser?.id,
            datos_anteriores: initialCotizacion,
            datos_nuevos: { totalFinal, items },
          });
        }
      } else {
        // Create new quote (default status 'borrador')
        const cotNum = `COT-2026-${Math.floor(100 + Math.random() * 900)}-v1`;

        const { data: cotData, error: cotErr } = await supabase
          .from('cotizaciones')
          .insert([{
            numero_cotizacion: cotNum,
            cliente_id: clienteId,
            usuario_id: isValidUuid(currentUser?.id) ? currentUser?.id : null,
            oportunidad_id: isValidUuid(oportunidadId) ? oportunidadId : null,
            version: 1,
            estado: 'borrador', // Strict default borrador
            subtotal: subtotalNeto,
            descuento: 0,
            iva_porcentaje: 19,
            monto_iva: ivaCalculado,
            monto_total: totalFinal,
            plazo_entrega: plazoEntrega,
            condiciones_pago: condicionesPago,
            observaciones: observaciones,
          }])
          .select()
          .single();

        if (cotErr) throw new Error(cotErr.message);

        if (cotData) {
          const itemsPayload = items.map((it) => ({
            cotizacion_id: cotData.id,
            producto: it.producto,
            cantidad: Number(it.cantidad),
            precio_unitario: Number(it.precio_unitario),
            descuento_porcentaje: 0,
            total_item: Number(it.total_item),
          }));
          await supabase.from('cotizacion_items').insert(itemsPayload);

          await logSistema({
            tipo_accion: 'creacion',
            entidad: 'cotizaciones',
            entidad_id: cotData.id,
            descripcion: `Nueva cotización ${cotNum} creada en borrador por $${totalFinal.toLocaleString('es-CL')}`,
            usuario_id: currentUser?.id,
            datos_nuevos: cotData,
          });
        }
      }

      if (onSuccess) onSuccess();
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
        // No changes made, close cleanly
        onClose();
        return;
      }
      // Ask whether to create new version or overwrite
      setShowVersionConfirmModal(true);
    } else {
      await saveQuoteToBackend(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white border border-gray-200 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl text-[#363636] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#F7931F]" />
            <span>Emitir Nueva Cotización Oficial</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#363636] text-xl font-bold">
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs font-bold">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Cliente & Oportunidad vinculada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-200">
            {/* Cliente */}
            <div className="relative">
              <label className="block font-bold text-gray-700 mb-1">Cliente *</label>
              <div
                onClick={() => setIsClientSearchOpen(!isClientSearchOpen)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium flex items-center justify-between cursor-pointer"
              >
                {selectedClient ? (
                  <span className="font-extrabold text-[#363636] truncate">{selectedClient.nombre}</span>
                ) : (
                  <span className="text-gray-400">Seleccionar Cliente...</span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </div>

              {isClientSearchOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-2 max-h-52 overflow-y-auto space-y-1">
                  {clientes.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setClienteId(c.id);
                        setOportunidadId('');
                        setIsClientSearchOpen(false);
                      }}
                      className="p-2 hover:bg-orange-50 rounded-xl cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-[#363636]">{c.nombre}</p>
                        <p className="text-[10px] text-gray-400 font-mono">RUT: {c.rut}</p>
                      </div>
                      {c.id === clienteId && <Check className="w-4 h-4 text-[#F7931F]" />}
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
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-extrabold focus:outline-none focus:border-[#F7931F]"
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

          {/* Lista de Ítems / Productos */}
          <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="font-extrabold text-[#363636] flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-[#F7931F]" />
                <span>Productos & Servicios (Neto)</span>
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="bg-orange-50 hover:bg-[#F7931F] text-[#F7931F] hover:text-white px-2.5 py-1 rounded-xl text-[11px] font-bold border border-orange-200 transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                  <div className="col-span-5">
                    <select
                      value={it.producto}
                      onChange={(e) => handleItemChange(idx, 'producto', e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-[#363636] font-bold"
                    >
                      {PRODUCTOS_HORMIGLASS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={it.cantidad}
                      onChange={(e) => handleItemChange(idx, 'cantidad', e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-bold text-center"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      value={it.precio_unitario}
                      onChange={(e) => handleItemChange(idx, 'precio_unitario', e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                    />
                  </div>
                  <div className="col-span-2 font-black text-[#363636] text-right">
                    ${(it.total_item || 0).toLocaleString('es-CL')}
                  </div>
                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-xs">
              <span className="text-gray-500 font-medium">Subtotal: ${subtotalNeto.toLocaleString('es-CL')} + IVA: ${ivaCalculado.toLocaleString('es-CL')}</span>
              <span className="font-black text-sm text-[#F7931F]">Total: ${totalFinal.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* Condiciones */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Plazo de Entrega</label>
              <input
                type="text"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636]"
              />
            </div>
            <div>
              <label className="block font-bold text-gray-700 mb-1">Condiciones de Pago</label>
              <input
                type="text"
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636]"
              />
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Emitiendo...' : 'Emitir Cotización'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Confirmación de Versión al Editar */}
      {showVersionConfirmModal && initialCotizacion && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#F7931F]" />
                <span>Confirmar Guardado de Cambios</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVersionConfirmModal(false)}
                className="text-gray-400 hover:text-[#363636] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <p>
                Se detectaron cambios en la cotización <strong className="font-mono text-[#363636]">{initialCotizacion.numero_cotizacion} (Versión v{initialCotizacion.version || 1})</strong>.
              </p>
              <p className="bg-orange-50 p-3 rounded-xl border border-orange-200 text-orange-950 font-medium">
                ¿Deseas guardar la nueva información como una versión nueva incrementada (v{(initialCotizacion.version || 1) + 1}) o prefieres sobreescribir la versión actual?
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => saveQuoteToBackend(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl border border-gray-300 transition flex items-center justify-center gap-1.5"
              >
                <span>Sobreescribir Versión Actual</span>
              </button>

              <button
                type="button"
                onClick={() => saveQuoteToBackend(true)}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Crear Nueva Versión (v{(initialCotizacion.version || 1) + 1})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
