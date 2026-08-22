'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { Cliente, CotizacionItem, Cotizacion } from '../../../lib/types';
import { useAuth } from '../../../lib/context/AuthContext';
import { logSistema } from '../../../lib/logger';
import {
  FileText,
  Plus,
  Trash2,
  ArrowLeft,
  Calculator,
  Save,
  Building,
  Sparkles,
  Search,
  Check,
  ChevronDown,
  Tag,
  Calendar,
} from 'lucide-react';

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
  const supabase = createClient();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>('');
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [oportunidadId, setOportunidadId] = useState<string | undefined>(paramOpId || undefined);
  const [version, setVersion] = useState<number>(1);

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
      const { data } = await supabase.from('clientes').select('*').order('nombre');
      if (!ignore) {
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

          const targetCot = baseCot as Cotizacion | null;
          if (targetCot) {
            setClienteId(targetCot.cliente_id);
            setOportunidadId(targetCot.oportunidad_id);
            setVersion((targetCot.version || 1) + 1);
            setReferenciaCliente(targetCot.referencia_cliente || '');
            if (targetCot.fecha_validez) {
              setFechaValidez(targetCot.fecha_validez.split('T')[0]);
            }
            setPlazoEntrega(targetCot.plazo_entrega || 'Inmediato');
            setCondicionesPago(targetCot.condiciones_pago || 'Acuse de recibo');
            setObservaciones(targetCot.comentario_publico || targetCot.observaciones || `Versión ${(targetCot.version || 1) + 1} basada en ${targetCot.numero_cotizacion}`);
            if (targetCot.items && targetCot.items.length > 0) {
              setItems(
                targetCot.items.map((it) => ({
                  ...it,
                  descuento_porcentaje: it.descuento_porcentaje || 0,
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
  }, [paramClienteId, paramEditCotId]);

  const selectedClient = clientes.find((c) => c.id === clienteId);

  const filteredClientes = clientes.filter((c) => {
    const q = clientSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.rut.toLowerCase().includes(q) ||
      (c.apellido_razon_social && c.apellido_razon_social.toLowerCase().includes(q)) ||
      (c.correo && c.correo.toLowerCase().includes(q)) ||
      (c.telefono && c.telefono.toLowerCase().includes(q))
    );
  });

  const handleItemChange = (index: number, field: keyof CotizacionItem, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    const qty = Number(item.cantidad) || 0;
    const price = Number(item.precio_unitario) || 0;
    const dto = Number(item.descuento_porcentaje) || 0;
    item.total_item = Math.round(qty * price * (1 - dto / 100));

    updated[index] = item;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
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
    setItems(items.filter((_, i) => i !== index));
  };

  // Financial calculations matching template
  const totalNetoAntesDescuento = items.reduce(
    (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
    0
  );
  const descuentoTotal = items.reduce((acc, it) => {
    const q = Number(it.cantidad) || 0;
    const p = Number(it.precio_unitario) || 0;
    const dto = Number(it.descuento_porcentaje) || 0;
    return acc + Math.round((q * p * dto) / 100);
  }, 0);
  const totalSinIva = Math.max(0, totalNetoAntesDescuento - descuentoTotal);
  const ivaCalculado = Math.round(totalSinIva * 0.19);
  const totalFinal = totalSinIva + ivaCalculado;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId) return;

    setLoading(true);
    const cotNum = generateCotNumber(version);

    try {
      // 1. Insert Cotizacion in Supabase
      const { data: cotData, error: cotErr } = await supabase
        .from('cotizaciones')
        .insert([{
          numero_cotizacion: cotNum,
          cliente_id: clienteId,
          usuario_id: (currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id)) ? currentUser.id : null,
          oportunidad_id: (oportunidadId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(oportunidadId)) ? oportunidadId : null,
          version: version,
          estado: 'borrador',
          referencia_cliente: referenciaCliente || null,
          fecha_validez: fechaValidez || null,
          subtotal: totalSinIva,
          descuento: descuentoTotal,
          iva_porcentaje: 19,
          monto_iva: ivaCalculado,
          monto_total: totalFinal,
          plazo_entrega: fechaLimiteCompromiso ? `Inicio: ${fechaInicioCompromiso} / Límite: ${fechaLimiteCompromiso}` : plazoEntrega,
          fecha_inicio_compromiso: fechaInicioCompromiso || null,
          fecha_limite_compromiso: fechaLimiteCompromiso || null,
          condiciones_pago: condicionesPago,
          observaciones: observaciones,
          comentario_publico: observaciones,
        }])
        .select()
        .single();

      if (cotErr || !cotData) {
        console.error('Error inserting cotizacion in Supabase:', cotErr?.message);
      } else {
        // 2. Insert Cotizacion Items in Supabase
        const itemsPayload = items.map((it) => ({
          cotizacion_id: cotData.id,
          producto: it.producto,
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
          descuento_porcentaje: Number(it.descuento_porcentaje || 0),
          total_item: Number(it.total_item),
        }));

        await supabase.from('cotizacion_items').insert(itemsPayload);

        await logSistema({
          tipo_accion: 'creacion',
          entidad: 'cotizaciones',
          entidad_id: cotData.id,
          descripcion: `Cotización ${cotNum} creada en borrador por $${totalFinal.toLocaleString('es-CL')}`,
          usuario_id: currentUser?.id,
          datos_nuevos: cotData,
        });
      }

      router.push('/cotizaciones');
    } catch (err) {
      console.error('Error saving quote:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-[#363636]">
      {/* Volver */}
      <div>
        <Link
          href="/cotizaciones"
          className="text-xs text-gray-500 hover:text-[#F7931F] font-bold flex items-center gap-1 mb-2 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a la Lista de Cotizaciones</span>
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F7931F]" />
            <span>
              {version > 1 ? `Nueva Versión de Cotización (v${version})` : 'Generar Nueva Cotización'}
            </span>
          </h1>

          {version > 1 && (
            <span className="bg-blue-100 text-blue-900 border border-blue-200 text-xs font-black px-3 py-1 rounded-full flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Creando Versión {version}</span>
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del Cliente y Condiciones */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-[#363636] border-b border-gray-200 pb-2 flex items-center gap-2">
            <Building className="w-4 h-4 text-[#F7931F]" />
            <span>Antecedentes del Cliente y Venta</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Buscador Interactivo de Clientes */}
            <div className="relative">
              <label className="block font-bold text-gray-700 mb-1">
                Buscar & Seleccionar Cliente *
              </label>

              <div
                onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium flex items-center justify-between cursor-pointer hover:border-[#F7931F] transition"
              >
                {selectedClient ? (
                  <div className="truncate">
                    <span className="font-extrabold text-[#363636]">{selectedClient.nombre}</span>
                    <span className="text-gray-500 font-mono text-[11px] ml-2">RUT: {selectedClient.rut}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">Seleccionar Cliente...</span>
                )}
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </div>

              {isClientDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3 space-y-2 max-h-72 overflow-y-auto">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Escribe RUT, Nombre, Razón Social o Correo..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#363636] placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
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
                          className={`p-2.5 rounded-xl transition cursor-pointer flex items-start justify-between text-xs ${
                            isSelected ? 'bg-orange-50 border border-orange-200 text-[#F7931F] font-bold' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-[#363636]">{cli.nombre}</p>
                            <p className="text-[11px] text-gray-500">
                              RUT: <span className="font-mono font-semibold">{cli.rut}</span>
                              {cli.apellido_razon_social && ` · ${cli.apellido_razon_social}`}
                              {cli.correo && ` · ${cli.correo}`}
                            </p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-[#F7931F] shrink-0" />}
                        </div>
                      );
                    })}

                    {filteredClientes.length === 0 && (
                      <p className="p-3 text-center text-xs text-gray-400 font-medium">
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
                <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-[#F7931F]" />
                  <span>Ref. Cliente</span>
                </label>
                <input
                  type="text"
                  value={referenciaCliente}
                  onChange={(e) => setReferenciaCliente(e.target.value)}
                  placeholder="Ej: NEMICEPS"
                  className="w-full bg-white border border-gray-300 rounded-xl px-2.5 py-1.5 text-[#363636] font-medium text-xs focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#F7931F]" />
                  <span>Fecha Validez</span>
                </label>
                <input
                  type="date"
                  value={fechaValidez}
                  onChange={(e) => setFechaValidez(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-2.5 py-1.5 text-[#363636] font-medium text-xs focus:outline-none focus:border-[#F7931F]"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Plazo de Entrega (Retraso disponible)</label>
              <input
                type="text"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                placeholder="Inmediato / 5 días hábiles"
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
              />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Términos de Pago</label>
              <input
                type="text"
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                placeholder="Acuse de recibo / 50% abono"
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-bold text-gray-700 mb-1">Comentario público / Observaciones</label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
              />
            </div>
          </div>
        </div>

        {/* Tabla de Ítems */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-sm font-extrabold text-[#363636] flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#F7931F]" />
              <span>Partidas y Productos (Monto en Chile Peso)</span>
            </h2>

            <button
              type="button"
              onClick={handleAddItem}
              className="bg-orange-50 hover:bg-orange-100 text-[#F7931F] text-xs font-bold px-3 py-1.5 rounded-xl border border-orange-200 transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Producto / Ítem</span>
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-3 items-center bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs"
              >
                <div className="col-span-5">
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Descripción del Producto</label>
                  <input
                    type="text"
                    required
                    placeholder="Descripción de la partida..."
                    value={item.producto}
                    onChange={(e) => handleItemChange(idx, 'producto', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={item.cantidad}
                    onChange={(e) => handleItemChange(idx, 'cantidad', Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-[#363636] text-center focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">P.U. Neto ($)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={item.precio_unitario}
                    onChange={(e) => handleItemChange(idx, 'precio_unitario', Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-[#363636] text-right font-mono focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Dto. %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.descuento_porcentaje || 0}
                    onChange={(e) => handleItemChange(idx, 'descuento_porcentaje', Number(e.target.value))}
                    className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-[#363636] text-center focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div className="col-span-1 text-right">
                  <label className="block text-[10px] font-bold text-gray-600 mb-0.5">Base Imp.</label>
                  <span className="font-extrabold text-[#363636] block py-1.5 font-mono text-[11px]">
                    ${(item.total_item || 0).toLocaleString('es-CL')}
                  </span>
                </div>

                <div className="col-span-1 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={items.length === 1}
                    className="p-1 text-gray-400 hover:text-red-500 transition disabled:opacity-30"
                    title="Eliminar Ítem"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Resumen de Totales e IVA idéntico al documento oficial */}
          <div className="pt-4 border-t border-gray-200 flex flex-col items-end space-y-1.5 text-xs">
            <div className="w-full sm:w-80 flex justify-between text-gray-600">
              <span>Total neto antes del descuento:</span>
              <span className="font-mono font-bold text-[#363636]">${totalNetoAntesDescuento.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-gray-600">
              <span>Descuento total:</span>
              <span className="font-mono font-bold text-red-600">-${descuentoTotal.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-gray-700 font-bold">
              <span>Total (sin IVA):</span>
              <span className="font-mono">${totalSinIva.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-gray-600">
              <span>Total impuestos 19%:</span>
              <span className="font-mono font-bold text-[#363636]">${ivaCalculado.toLocaleString('es-CL')}</span>
            </div>
            <div className="w-full sm:w-80 flex justify-between text-sm font-black text-[#F7931F] pt-2 border-t border-gray-200 bg-orange-50/50 p-1.5 rounded-lg">
              <span>Total (impuesto inc.):</span>
              <span className="font-mono">${totalFinal.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>

        {/* Botón de Guardar */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/cotizaciones"
            className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl text-xs font-extrabold transition shadow-md flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : version > 1 ? `Emitir Versión ${version}` : 'Emitir Cotización'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NuevaCotizacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold">Cargando formulario...</div>}>
      <NuevaCotizacionForm />
    </Suspense>
  );
}
