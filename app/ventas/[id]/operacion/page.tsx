'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { cotizacionVigente, saldoPendiente } from '../../../../lib/oportunidad-finanzas';
import type { Cotizacion, GuiaDespacho, GuiaDespachoDocumento, OperacionExcepcion, OrdenProduccion, OportunidadVenta, PostventaCaso, ProduccionDiaria } from '../../../../lib/types';
import { useAuth } from '../../../../lib/context/AuthContext';
import { mensajeError } from '../../../../lib/errores';

const money = (value: number) => `$${Number(value || 0).toLocaleString('es-CL')}`;

export default function OperacionVentaPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const [op, setOp] = useState<OportunidadVenta | null>(null);
  const [quotes, setQuotes] = useState<Cotizacion[]>([]);
  const [orders, setOrders] = useState<OrdenProduccion[]>([]);
  const [daily, setDaily] = useState<ProduccionDiaria[]>([]);
  const [guides, setGuides] = useState<GuiaDespacho[]>([]);
  const [purchaseAssignments, setPurchaseAssignments] = useState(0);
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [postventa, setPostventa] = useState<PostventaCaso[]>([]);
  const [exceptions, setExceptions] = useState<OperacionExcepcion[]>([]);
  const [deliveryAccredited, setDeliveryAccredited] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [productionDate, setProductionDate] = useState('');
  const [productionOrderId, setProductionOrderId] = useState('');
  const [productionItemId, setProductionItemId] = useState('');
  const [producedQty, setProducedQty] = useState('');
  const [producedDate, setProducedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [guideNumber, setGuideNumber] = useState('');
  const [guideDate, setGuideDate] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [transportType, setTransportType] = useState<NonNullable<GuiaDespacho['tipo_transporte']>>('propio');
  const [estimatedCost, setEstimatedCost] = useState('0');
  const [receivedBy, setReceivedBy] = useState<Record<string, string>>({});
  const [guideQuantities, setGuideQuantities] = useState<Record<string, string>>({});
  const [manualReason, setManualReason] = useState('');
  const [postventaType, setPostventaType] = useState<PostventaCaso['tipo']>('defecto');
  const [postventaDescription, setPostventaDescription] = useState('');
  const [postventaDate, setPostventaDate] = useState('');
  const [postventaAdditional, setPostventaAdditional] = useState('');
  const [postventaAuthorization, setPostventaAuthorization] = useState('');

  const load = useCallback(async () => {
    const [opRes, quoteRes, orderRes, dailyRes, guideRes, postventaRes, purchaseRes, exceptionRes, accreditationRes] = await Promise.all([
      supabase.from('oportunidades').select('*, cliente:clientes(*)').eq('id', id).single(),
      supabase.from('cotizaciones').select('*, items:cotizacion_items(*)').eq('oportunidad_id', id),
      supabase.from('ordenes_produccion').select('*, items:orden_produccion_items(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
      supabase.from('produccion_diaria').select('*').eq('oportunidad_id', id).order('fecha_produccion', { ascending: false }),
      supabase.from('guias_despacho').select('*, items:guia_despacho_items(*), documentos:guia_despacho_documentos(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
      supabase.from('postventa_casos').select('*').eq('oportunidad_id', id).order('created_at', { ascending: false }),
      supabase.from('orden_compra_asignaciones').select('id, costo_asignado').eq('oportunidad_id', id),
      supabase.from('operacion_excepciones').select('*').eq('oportunidad_id', id).order('solicitado_at', { ascending: false }),
      supabase.rpc('entrega_acreditada', { p_venta: id }),
    ]);
    const firstError = opRes.error || quoteRes.error || orderRes.error || dailyRes.error || guideRes.error || postventaRes.error || purchaseRes.error || exceptionRes.error || accreditationRes.error;
    if (firstError) { setError(mensajeError(firstError)); return; }
    setError(''); setOp(opRes.data as OportunidadVenta); setQuotes(quoteRes.data as Cotizacion[]);
    setOrders(orderRes.data as OrdenProduccion[]); setDaily(dailyRes.data as ProduccionDiaria[]);
    setGuides(guideRes.data as GuiaDespacho[]);
    setPostventa(postventaRes.data as PostventaCaso[]);
    setExceptions((exceptionRes.data || []) as OperacionExcepcion[]);
    setDeliveryAccredited(accreditationRes.data === true);
    setDueDate(opRes.data?.fecha_vencimiento_cobro || '');
    setPurchaseAssignments(purchaseRes.data?.length || 0);
    setPurchaseCost(((purchaseRes.data || []) as { costo_asignado: number }[])
      .reduce((sum: number, assignment: { costo_asignado: number }) => sum + Number(assignment.costo_asignado || 0), 0));
  }, [id, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const currentQuote = op ? cotizacionVigente(op, quotes) : undefined;
  const quoteItems = currentQuote?.items || [];
  const allCommitted = (itemId?: string) => guides.filter((g) => g.estado !== 'cancelada')
    .reduce((sum, guide) => sum + (guide.items || [])
      .filter((item) => item.cotizacion_item_id === itemId)
      .reduce((subtotal, item) => subtotal + Number(guide.estado === 'entregada' ? item.cantidad_recibida : item.cantidad_planificada), 0), 0);
  const guideHasEvidence = (guide: GuiaDespacho) => (guide.documentos || []).some((document) => document.tipo === 'firma') ||
    exceptions.some((entry) => entry.tipo === 'firma_entrega' && entry.guia_despacho_id === guide.id && entry.estado === 'aprobada');
  const allReceived = (itemId?: string) => guides.filter((g) => g.estado === 'entregada' &&
    guideHasEvidence(g))
    .flatMap((g) => g.items || []).filter((item) => item.cotizacion_item_id === itemId)
    .reduce((sum, item) => sum + Number(item.cantidad_recibida), 0);
  const delivered = deliveryAccredited;
  const productionRequired = op?.abastecimiento === 'fabricar';
  const supplyDone = productionRequired ? orders.some((order) => order.estado === 'completada')
    : op?.abastecimiento === 'compra_proveedor' ? purchaseAssignments > 0 : op?.abastecimiento === 'stock';
  const collectionDone = Boolean(op && saldoPendiente(op, quotes) <= 0 && currentQuote);
  const dispatchCost = guides.filter((guide) => guide.estado !== 'cancelada')
    .reduce((sum, guide) => sum + Number(guide.costo_real_confirmado ? guide.costo_real : guide.costo_estimado || 0), 0);
  const costIncomplete = guides.some((guide) => guide.estado !== 'cancelada' && !guide.costo_real_confirmado);
  const revenue = Number(currentQuote?.monto_total || 0);
  const estimatedMargin = revenue - purchaseCost - dispatchCost;
  const canSeeFinance = currentUser?.rol !== 'mano_obra';
  const steps = [
    { label: 'Venta comercial', complete: op?.estado_pipeline === 'entregada' || Boolean(op?.estado_pipeline?.startsWith('prod_') || op?.estado_pipeline?.startsWith('rev_')) },
    { label: productionRequired ? 'Producción' : 'Abastecimiento o retiro', complete: Boolean(supplyDone) },
    { label: 'Logística', complete: guides.length > 0 || delivered },
    { label: 'Entrega', complete: delivered },
    { label: 'Cobro y cierre', complete: collectionDone },
  ];

  async function logOperation(message: string) {
    await supabase.from('actividades_op').insert({
      oportunidad_id: id,
      usuario_id: currentUser?.id || null,
      usuario_nombre: currentUser?.nombre || 'Sistema',
      contenido: message,
      tipo: 'actualizacion',
    });
  }

  async function requestException(tipo: OperacionExcepcion['tipo'], extra: Partial<OperacionExcepcion> = {}) {
    if (!currentUser || exceptionReason.trim().length < 8) {
      setError('Explica el motivo de la excepción con al menos ocho caracteres.'); return;
    }
    if (exceptions.some((entry) => entry.tipo === tipo && entry.estado === 'pendiente' &&
      entry.orden_produccion_id === (extra.orden_produccion_id || null) &&
      entry.cotizacion_item_id === (extra.cotizacion_item_id || null) &&
      entry.guia_despacho_id === (extra.guia_despacho_id || null))) {
      setError('Ya existe una solicitud pendiente para este caso.'); return;
    }
    const { error: requestError } = await supabase.from('operacion_excepciones').insert({
      tipo, oportunidad_id: id, motivo: exceptionReason.trim(), solicitado_por: currentUser.id,
      orden_produccion_id: extra.orden_produccion_id || null,
      cotizacion_item_id: extra.cotizacion_item_id || null,
      guia_despacho_id: extra.guia_despacho_id || null,
      cantidad_excedente: extra.cantidad_excedente || null,
    });
    if (requestError) setError(mensajeError(requestError));
    else { setExceptionReason(''); await logOperation(`Excepción ${tipo} solicitada para aprobación administrativa.`); await load(); }
  }

  async function resolveException(entry: OperacionExcepcion, status: 'aprobada' | 'rechazada') {
    if (currentUser?.rol !== 'admin') return;
    const { error: resolveError } = await supabase.rpc('resolver_excepcion_operativa', {
      p_excepcion_id: entry.id, p_estado: status,
    });
    if (resolveError) { setError(mensajeError(resolveError)); return; }
    await logOperation(`Excepción ${entry.tipo} ${status} por administración.`);
    await load();
  }

  async function saveDueDate() {
    if (!delivered) { setError('El cobro del saldo comienza cuando la entrega está acreditada.'); return; }
    const { error: dateError } = await supabase.from('oportunidades')
      .update({ fecha_vencimiento_cobro: dueDate || null }).eq('id', id);
    if (dateError) setError(mensajeError(dateError)); else await load();
  }

  async function createProductionOrder() {
    if (!op || !quoteItems.length) { setError('Vincula una cotización con ítems antes de crear la orden.'); return; }
    setBusy(true); setError('');
    const { data, error: orderError } = await supabase.from('ordenes_produccion').insert({
      oportunidad_id: id, fecha_inicio: new Date().toISOString().slice(0, 10),
      fecha_objetivo: productionDate || null, responsable_id: op.responsable_operativo_id || null,
    }).select('id').single();
    if (orderError || !data) { setError(mensajeError(orderError, 'No se pudo crear la orden.')); setBusy(false); return; }
    const { error: itemsError } = await supabase.from('orden_produccion_items').insert(quoteItems.map((item) => ({
      orden_produccion_id: data.id, cotizacion_item_id: item.id || null,
      producto: item.producto, cantidad_objetivo: item.cantidad,
    })));
    if (itemsError) { await supabase.from('ordenes_produccion').delete().eq('id', data.id); setError(mensajeError(itemsError)); }
    else { await logOperation('Orden de producción creada desde la cotización vigente.'); await load(); }
    setBusy(false);
  }

  async function registerProduction() {
    const order = orders.find((entry) => entry.id === productionOrderId);
    const item = order?.items?.find((entry) => entry.id === productionItemId);
    if (!order || !item || !Number.isFinite(Number(producedQty)) || Number(producedQty) <= 0) {
      setError('Selecciona orden, producto y una cantidad positiva.'); return;
    }
    const made = daily.filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id)
      .reduce((sum, row) => sum + Number(row.cantidad_producida), 0);
    const allowedExtra = exceptions.filter((entry) => entry.tipo === 'exceso_produccion' && entry.estado === 'aprobada' &&
      entry.orden_produccion_id === order.id && entry.cotizacion_item_id === item.cotizacion_item_id)
      .reduce((sum, entry) => sum + Number(entry.cantidad_excedente || 0), 0);
    const excess = made + Number(producedQty) - Number(item.cantidad_objetivo) - allowedExtra;
    if (excess > 0) {
      if (exceptionReason.trim().length < 8) { setError(`La cantidad excede el objetivo por ${excess}. Escribe el motivo para solicitar aprobación.`); return; }
      await requestException('exceso_produccion', { orden_produccion_id: order.id,
        cotizacion_item_id: item.cotizacion_item_id, cantidad_excedente: excess });
      return;
    }
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('produccion_diaria').insert({
      oportunidad_id: id, orden_produccion_id: order.id, cotizacion_item_id: item.cotizacion_item_id,
      producto: item.producto, cantidad_producida: Number(producedQty), fecha_produccion: producedDate,
      registrado_por: currentUser?.id || null,
    });
    if (insertError) setError(mensajeError(insertError));
    else { await logOperation(`Producción real registrada: ${item.producto}, ${producedQty}.`); setProducedQty(''); await load(); }
    setBusy(false);
  }

  async function createGuide() {
    const selected = quoteItems.map((item) => ({ item, qty: Number(guideQuantities[item.id || ''] || 0) })).filter(({ qty }) => qty > 0);
    if (!op || !guideNumber.trim() || !selected.length) { setError('Ingresa folio y al menos una cantidad de despacho.'); return; }
    if (selected.some(({ item, qty }) => qty > Math.max(0, Number(item.cantidad) - allCommitted(item.id)))) {
      setError('Una cantidad supera lo pendiente de planificar.'); return;
    }
    setBusy(true); setError('');
    const { data, error: guideError } = await supabase.from('guias_despacho').insert({
      oportunidad_id: id, numero_guia: guideNumber.trim(),
      fecha_salida: guideDate ? new Date(guideDate).toISOString() : null,
      origen: origin.trim() || null, destino: destination.trim() || null,
      vehiculo: vehicle.trim() || null, chofer: driver.trim() || null,
      tipo_transporte: transportType, costo_estimado: Number(estimatedCost) || 0,
    }).select('id').single();
    if (guideError || !data) { setError(mensajeError(guideError, 'No se pudo crear la guía.')); setBusy(false); return; }
    const { error: itemsError } = await supabase.from('guia_despacho_items').insert(selected.map(({ item, qty }) => ({
      guia_despacho_id: data.id, cotizacion_item_id: item.id || null,
      producto: item.producto, cantidad_planificada: qty,
    })));
    if (itemsError) { await supabase.from('guias_despacho').delete().eq('id', data.id); setError(mensajeError(itemsError)); }
    else { await logOperation(`Orden de despacho ${guideNumber.trim()} creada con ${selected.length} ítem(s).`); setGuideNumber(''); setGuideQuantities({}); setEstimatedCost('0'); await load(); }
    setBusy(false);
  }

  async function updateGuideItem(itemId: string, field: 'cantidad_cargada' | 'cantidad_recibida', value: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) { setError('La cantidad debe ser cero o mayor.'); return; }
    const { error: updateError } = await supabase.from('guia_despacho_items').update({ [field]: amount }).eq('id', itemId);
    if (updateError) setError(mensajeError(updateError)); else await load();
  }

  async function updateGuide(guide: GuiaDespacho, estado: GuiaDespacho['estado']) {
    if (estado === 'entregada' && !guide.carga_verificada) { setError('Verifica la carga antes de confirmar la entrega.'); return; }
    if (estado === 'entregada' && (guide.items || []).some((item) => Number(item.cantidad_recibida) <= 0)) {
      setError('Registra la cantidad recibida de cada ítem antes de confirmar la entrega.'); return;
    }
    if (estado === 'entregada' && !receivedBy[guide.id]?.trim() && !guide.recibido_por?.trim()) {
      setError('Indica quién recibió la entrega antes de confirmarla.'); return;
    }
    if (estado === 'entregada' && !guideHasEvidence(guide)) {
      await requestException('firma_entrega', { guia_despacho_id: guide.id });
      return;
    }
    const { error: updateError } = await supabase.from('guias_despacho').update({
      estado, entrega_conforme: estado === 'entregada' && (guide.items || []).every((item) => Number(item.cantidad_recibida) === Number(item.cantidad_planificada)),
      recibido_por: receivedBy[guide.id]?.trim() || guide.recibido_por || null,
      entrega_confirmada_por: estado === 'entregada' ? currentUser?.id || null : null,
      entrega_confirmada_at: estado === 'entregada' ? new Date().toISOString() : null,
    }).eq('id', guide.id);
    if (updateError) setError(mensajeError(updateError)); else { await logOperation(`Guía ${guide.numero_guia}: estado ${estado}.`); await load(); }
  }

  async function uploadEvidence(guide: GuiaDespacho, file: File, tipo: GuiaDespachoDocumento['tipo']) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `entregas/${guide.id}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('administracion').upload(path, file, { upsert: false });
    if (uploadError) { setError(mensajeError(uploadError)); return; }
    const { error: insertError } = await supabase.from('guia_despacho_documentos').insert({
      guia_despacho_id: guide.id, tipo, nombre: file.name, archivo_path: path,
    });
    if (insertError) { await supabase.storage.from('administracion').remove([path]); setError(mensajeError(insertError)); return; }
    await logOperation(`Respaldo de ${tipo} adjuntado a la orden de despacho ${guide.numero_guia}: ${file.name}.`);
    await load();
  }

  async function updateGuideCost(guideId: string, amount: string) {
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost < 0) { setError('El costo debe ser cero o mayor.'); return; }
    const { error: costError } = await supabase.from('guias_despacho').update({ costo_real: cost, costo_real_confirmado: true }).eq('id', guideId);
    if (costError) setError(mensajeError(costError)); else await load();
  }

  async function createPostventa() {
    if (!postventaDescription.trim()) { setError('Describe el caso de postventa.'); return; }
    const quantity = postventaAdditional.trim() ? Number(postventaAdditional) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) { setError('La cantidad adicional no es válida.'); return; }
    if (postventaType === 'cantidad_adicional' && (!quantity || quantity <= 0)) {
      setError('Indica una cantidad adicional mayor que cero.'); return;
    }
    if (quantity && !postventaAuthorization.trim()) { setError('Registra la autorización del cliente para cantidades adicionales.'); return; }
    setBusy(true); setError('');
    try {
      const { error: postventaError } = await supabase.rpc('crear_postventa_con_evento', {
        p_caso: {
          oportunidad_id: id, tipo: postventaType, descripcion: postventaDescription.trim(),
          cantidad_adicional: quantity, autorizacion_cliente: postventaAuthorization.trim() || null,
          fecha_compromiso: postventaDate || null, responsable_id: op?.responsable_operativo_id || null,
        },
        p_evento: postventaDate ? {
          titulo: `Postventa: ${postventaDescription.trim().slice(0, 90)}`,
          fecha_inicio: `${postventaDate}T12:00:00`, fecha_fin: `${postventaDate}T13:00:00`,
          hora_evento: '12:00', responsable_id: op?.responsable_operativo_id || null,
        } : null,
      });
      if (postventaError) throw postventaError;
      await logOperation(`Caso de postventa abierto: ${postventaDescription.trim()}`);
      setPostventaDescription(''); setPostventaAdditional(''); setPostventaAuthorization('');
      await load();
    } catch (cause) {
      setError(mensajeError(cause, 'No se pudo registrar la postventa.'));
    } finally {
      setBusy(false);
    }
  }

  async function openEvidence(document: GuiaDespachoDocumento) {
    const { data, error: signedError } = await supabase.storage.from('administracion').createSignedUrl(document.archivo_path, 60);
    if (signedError) setError(mensajeError(signedError));
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function confirmManualDelivery() {
    if (manualReason.trim().length < 8 || !currentUser) { setError('Explica el motivo de la entrega manual con al menos ocho caracteres.'); return; }
    if (exceptions.some((entry) => entry.tipo === 'entrega_manual' && entry.estado === 'pendiente')) {
      setError('Ya existe una solicitud de entrega manual pendiente.'); return;
    }
    const { error: requestError } = await supabase.from('operacion_excepciones').insert({
      tipo: 'entrega_manual', oportunidad_id: id, motivo: manualReason.trim(), solicitado_por: currentUser.id,
    });
    if (requestError) setError(mensajeError(requestError));
    else { setManualReason(''); await logOperation('Confirmación manual de entrega solicitada a administración.'); await load(); }
  }

  return <div className="space-y-6 text-[#213343]">
    <Link href={`/ventas?oportunidad=${id}`} className="text-xs font-bold text-[#f97316]">← Volver a la venta</Link>
    <div><h1 className="text-2xl font-bold">Producción y entregas · {op?.codigo || ''}</h1><p className="text-sm text-gray-600">{op?.titulo}</p></div>
    {error && <p role="alert" className="border border-red-200 bg-red-50 text-red-700 rounded-md p-3 text-sm">{error}</p>}
    {op && ['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) && !delivered &&
      <p role="alert" className="border border-amber-300 bg-amber-50 text-amber-900 rounded-md p-3 text-sm">Esta venta figura como entregada en el historial, pero no tiene acreditación completa bajo las reglas actuales. Revisa las guías o solicita una excepción administrativa.</p>}
    <div className="grid sm:grid-cols-5 gap-3">
      <div className="bg-white border rounded-lg p-4"><span className="text-xs text-gray-500">Entrega</span><strong className="block">{delivered ? 'Completada' : 'Pendiente'}</strong></div>
      {canSeeFinance && <div className="bg-white border rounded-lg p-4"><span className="text-xs text-gray-500">{delivered ? 'Saldo por cobrar' : 'Saldo pendiente de entrega acreditada'}</span><strong className="block">{op ? money(saldoPendiente(op, quotes)) : '—'}</strong></div>}
      <div className="bg-white border rounded-lg p-4"><span className="text-xs text-gray-500">Guías</span><strong className="block">{guides.length}</strong></div>
      {canSeeFinance && <div className="bg-white border rounded-lg p-4"><span className="text-xs text-gray-500">Compras asignadas</span><strong className="block">{money(purchaseCost)}</strong></div>}
      {canSeeFinance && <div className="bg-white border rounded-lg p-4"><span className="text-xs text-gray-500">Traslados reales/estimados</span><strong className="block">{money(dispatchCost)}</strong></div>}
    </div>
    {canSeeFinance && <section className="bg-white border rounded-lg p-4 space-y-3 text-sm">
      <h2 className="font-bold">Cobranza y margen estimado</h2>
      <div className="flex flex-wrap gap-2 items-end"><label>Vencimiento del cobro<input aria-label="Vencimiento del cobro" type="date" value={dueDate} disabled={!delivered} onChange={(e) => setDueDate(e.target.value)} className="block border rounded-md p-2 disabled:opacity-50" /></label><button disabled={!delivered} onClick={saveDueDate} className="border rounded-md px-3 py-2 font-bold disabled:opacity-50">Guardar vencimiento</button></div>
      <p>{!delivered ? 'Cobranza suspendida: acredita la entrega antes de fijar o usar un vencimiento.' : op?.fecha_vencimiento_cobro ? `Vence el ${op.fecha_vencimiento_cobro}` : 'Sin vencimiento definido; el saldo no se considera vencido.'}</p>
      <p>Venta {money(revenue)} − compras asignadas {money(purchaseCost)} − traslados {money(dispatchCost)} = <strong>{money(estimatedMargin)}</strong></p>
      <p className="text-xs text-gray-500">Margen provisional: excluye mano de obra y otros costos no registrados. {costIncomplete ? 'Algunos traslados usan costo estimado.' : 'Los traslados tienen costo real confirmado.'}</p>
    </section>}
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Ruta operativa de la venta">{steps.map((step, index) => <div key={step.label} className={`rounded-lg border p-3 text-xs ${step.complete ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200'}`}><span className="block font-bold">{index + 1}. {step.label}</span><span>{step.complete ? 'Completado' : 'Pendiente'}</span></div>)}</div>
    <section className="bg-white border rounded-lg p-4 space-y-3">
      <h2 className="font-bold">Orden de producción</h2>
      <div className="flex flex-wrap gap-2"><input aria-label="Fecha objetivo de producción" type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className="border rounded-md p-2 text-sm" /><button disabled={busy || !quoteItems.length} onClick={createProductionOrder} className="bg-[#f97316] disabled:opacity-50 text-white rounded-md px-3 py-2 text-sm font-bold">Crear desde cotización vigente</button></div>
      {orders.map((order) => <div key={order.id} className="border-t pt-2 text-sm space-y-1">
        <div className="flex flex-wrap items-center gap-2"><strong>Orden {order.id.slice(0, 8)}</strong><select aria-label={`Estado de orden ${order.id.slice(0, 8)}`} value={order.estado} onChange={async (e) => { const { error: statusError } = await supabase.from('ordenes_produccion').update({ estado: e.target.value }).eq('id', order.id); if (statusError) setError(mensajeError(statusError)); else await load(); }} className="border rounded-md px-2 py-1"><option value="planificada">Planificada</option><option value="en_curso">En curso</option><option value="completada">Completada</option><option value="cancelada">Cancelada</option></select><span className="text-gray-500">Objetivo: {order.fecha_objetivo || 'Sin fecha'}</span></div>
        <p>{order.items?.map((item) => `${item.producto}: ${daily.filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id).reduce((sum, row) => sum + Number(row.cantidad_producida), 0)} / ${item.cantidad_objetivo}`).join(' · ')}</p>
      </div>)}
      {orders.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-t pt-3">
        <select aria-label="Orden de producción" value={productionOrderId} onChange={(e) => { setProductionOrderId(e.target.value); setProductionItemId(''); }} className="border rounded-md p-2 text-sm"><option value="">Orden</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.id.slice(0, 8)}</option>)}</select>
        <select aria-label="Producto producido" value={productionItemId} onChange={(e) => setProductionItemId(e.target.value)} className="border rounded-md p-2 text-sm"><option value="">Producto</option>{orders.find((order) => order.id === productionOrderId)?.items?.map((item) => <option key={item.id} value={item.id}>{item.producto}</option>)}</select>
        <input aria-label="Cantidad producida" type="number" min="0.01" step="0.01" placeholder="Cantidad real" value={producedQty} onChange={(e) => setProducedQty(e.target.value)} className="border rounded-md p-2 text-sm" />
        <input aria-label="Fecha de producción" type="date" value={producedDate} onChange={(e) => setProducedDate(e.target.value)} className="border rounded-md p-2 text-sm" />
        <button disabled={busy} onClick={registerProduction} className="bg-[#213343] text-white rounded-md px-3 py-2 text-sm font-bold">Registrar producción</button>
      </div>}
      <input aria-label="Motivo de excepción operativa" placeholder="Motivo para solicitar excedente o entrega sin firma" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} className="w-full border rounded-md p-2 text-sm" />
      {daily.length > 0 && <p className="text-xs text-gray-600">Producción real: {daily.map((row) => `${row.fecha_produccion} ${row.producto} ${row.cantidad_producida}`).join(' · ')}</p>}
    </section>
    <section className="bg-white border rounded-lg p-4 space-y-3">
      <h2 className="font-bold">Nueva guía de despacho</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <input aria-label="Número de guía" placeholder="Folio de guía" value={guideNumber} onChange={(e) => setGuideNumber(e.target.value)} className="border rounded-md p-2" />
        <input aria-label="Fecha de salida" type="datetime-local" value={guideDate} onChange={(e) => setGuideDate(e.target.value)} className="border rounded-md p-2" />
        <input aria-label="Vehículo" placeholder="Vehículo" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="border rounded-md p-2" />
        <input aria-label="Origen" placeholder="Origen" value={origin} onChange={(e) => setOrigin(e.target.value)} className="border rounded-md p-2" />
        <input aria-label="Destino" placeholder="Destino" value={destination} onChange={(e) => setDestination(e.target.value)} className="border rounded-md p-2" />
        <input aria-label="Chofer" placeholder="Chofer" value={driver} onChange={(e) => setDriver(e.target.value)} className="border rounded-md p-2" />
        <select aria-label="Tipo de transporte" value={transportType} onChange={(e) => setTransportType(e.target.value as typeof transportType)} className="border rounded-md p-2"><option value="propio">Transporte propio</option><option value="externo">Transporte externo</option><option value="retiro_cliente">Retiro por cliente</option></select>
        <input aria-label="Costo estimado del traslado" type="number" min="0" step="1" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="border rounded-md p-2" />
      </div>
        {quoteItems.map((item) => <label key={item.id} className="flex items-center justify-between gap-3 text-sm border-t pt-2"><span>{item.producto} · por planificar {Math.max(0, Number(item.cantidad) - allCommitted(item.id))} · por entregar {Math.max(0, Number(item.cantidad) - allReceived(item.id))}</span><input aria-label={`Cantidad de ${item.producto}`} type="number" min="0" step="0.01" placeholder="Cantidad" value={guideQuantities[item.id || ''] || ''} onChange={(e) => setGuideQuantities({ ...guideQuantities, [item.id || '']: e.target.value })} className="w-32 border rounded-md p-2" /></label>)}
      <button disabled={busy || !quoteItems.length} onClick={createGuide} className="bg-[#f97316] disabled:opacity-50 text-white rounded-md px-3 py-2 text-sm font-bold">Crear guía parcial</button>
    </section>
    <section className="space-y-3"><h2 className="font-bold">Guías y evidencias</h2>
      {guides.map((guide) => <div key={guide.id} className="bg-white border rounded-lg p-4 space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{guide.numero_guia} · {guide.estado}</strong><span>{guide.vehiculo || 'Sin vehículo'} · {guide.chofer || 'Sin chofer'}</span></div>
        {guide.estado === 'entregada' && !guideHasEvidence(guide) && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">Cierre histórico sin firma ni excepción aprobada. Esta guía no acredita la entrega; adjunta solo un respaldo auténtico o solicita revisión administrativa.</p>}
        <p className="text-gray-600">{guide.origen || 'Origen pendiente'} → {guide.destino || 'Destino pendiente'}</p>
        <p className="text-xs text-gray-600">{guide.tipo_transporte || 'propio'} · costo estimado {money(guide.costo_estimado || 0)} · costo real {guide.costo_real_confirmado ? money(guide.costo_real || 0) : 'Sin confirmar'} · recibió {guide.recibido_por || 'pendiente'}</p>
        <div className="flex flex-wrap gap-2"><Link href={`/ventas/${id}/operacion/guias/${guide.id}`} className="text-[#f97316] underline">Ver e imprimir orden interna</Link><input aria-label={`Costo real de ${guide.numero_guia}`} type="number" min="0" step="1" defaultValue={guide.costo_real || 0} onBlur={(e) => void updateGuideCost(guide.id, e.target.value)} className="w-36 border rounded-md p-1" /><input aria-label={`Recibido por en ${guide.numero_guia}`} placeholder="Nombre de quien recibe" value={receivedBy[guide.id] ?? guide.recibido_por ?? ''} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onChange={(e) => setReceivedBy({ ...receivedBy, [guide.id]: e.target.value })} className="border rounded-md p-1 disabled:opacity-50" /></div>
        {(guide.items || []).map((item) => <div key={item.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center border-t pt-2"><span>{item.producto} · plan {item.cantidad_planificada}</span><label>Cargado <input type="number" min="0" step="0.01" defaultValue={item.cantidad_cargada} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onBlur={(e) => updateGuideItem(item.id, 'cantidad_cargada', e.target.value)} className="w-24 border rounded-md p-1 ml-1 disabled:opacity-50" /></label><label>Recibido <input type="number" min="0" step="0.01" defaultValue={item.cantidad_recibida} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onBlur={(e) => updateGuideItem(item.id, 'cantidad_recibida', e.target.value)} className="w-24 border rounded-md p-1 ml-1 disabled:opacity-50" /></label></div>)}
        <p className="text-xs text-gray-500">Diferencia total: {(guide.items || []).reduce((sum, item) => sum + Number(item.cantidad_planificada) - Number(item.cantidad_recibida), 0).toLocaleString('es-CL')}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <button disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onClick={async () => { const { error: e } = await supabase.from('guias_despacho').update({ carga_verificada: true, carga_verificada_por: currentUser?.id || null, carga_verificada_at: new Date().toISOString(), estado: 'cargada' }).eq('id', guide.id); if (e) setError(mensajeError(e)); else await load(); }} className="border rounded-md px-3 py-1.5 font-semibold disabled:opacity-50">Verificar carga</button>
          <button disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onClick={() => updateGuide(guide, 'entregada')} className="border rounded-md px-3 py-1.5 font-semibold disabled:opacity-50">Confirmar entrega</button>
          {guide.estado === 'entregada' && !guideHasEvidence(guide) && <button onClick={() => requestException('firma_entrega', { guia_despacho_id: guide.id })} className="border rounded-md px-3 py-1.5 font-semibold text-amber-800">Solicitar excepción de firma</button>}
          {guide.estado !== 'cancelada' && <label className="border rounded-md px-3 py-1.5 cursor-pointer">Adjuntar respaldo firmado auténtico<input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadEvidence(guide, file, 'firma'); }} /></label>}
          {(guide.documentos || []).map((document) => <button key={document.id} onClick={() => openEvidence(document)} className="text-[#f97316] underline">{document.nombre}</button>)}
        </div>
      </div>)}
      {guides.length === 0 && <p className="text-sm text-gray-500">Aún no hay guías.</p>}
    </section>
    <section className="bg-white border rounded-lg p-4 space-y-2 text-sm"><h2 className="font-bold">Excepciones y aprobaciones</h2>
      {exceptions.map((entry) => <div key={entry.id} className="border-t pt-2 flex flex-wrap gap-2 items-center justify-between">
        <span><strong>{entry.tipo.replaceAll('_', ' ')}</strong> · {entry.estado} · {entry.motivo}{entry.cantidad_excedente ? ` · excedente ${entry.cantidad_excedente}` : ''}</span>
        {entry.estado === 'pendiente' && currentUser?.rol === 'admin' && <span className="flex gap-2"><button onClick={() => resolveException(entry, 'aprobada')} className="border rounded px-2 py-1 text-emerald-700">Aprobar</button><button onClick={() => resolveException(entry, 'rechazada')} className="border rounded px-2 py-1 text-red-700">Rechazar</button></span>}
      </div>)}
      {!exceptions.length && <p className="text-gray-500">No hay excepciones solicitadas.</p>}
    </section>
    <section className="bg-white border rounded-lg p-4 space-y-3"><h2 className="font-bold">Postventa</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm"><select aria-label="Tipo de caso" value={postventaType} onChange={(e) => setPostventaType(e.target.value as PostventaCaso['tipo'])} className="border rounded-md p-2"><option value="defecto">Defecto</option><option value="faltante">Faltante</option><option value="cantidad_adicional">Cantidad adicional</option><option value="otro">Otro</option></select><input aria-label="Fecha de compromiso" type="date" value={postventaDate} onChange={(e) => setPostventaDate(e.target.value)} className="border rounded-md p-2" /><input aria-label="Cantidad adicional" type="number" min="0" step="0.01" placeholder="Cantidad adicional" value={postventaAdditional} onChange={(e) => setPostventaAdditional(e.target.value)} className="border rounded-md p-2" /></div>
      <textarea aria-label="Descripción del caso" placeholder="Descripción del caso" value={postventaDescription} onChange={(e) => setPostventaDescription(e.target.value)} className="w-full border rounded-md p-2 text-sm" />
      <input aria-label="Autorización del cliente" placeholder="Referencia de autorización del cliente para cantidad adicional" value={postventaAuthorization} onChange={(e) => setPostventaAuthorization(e.target.value)} className="w-full border rounded-md p-2 text-sm" />
      <button disabled={busy} onClick={createPostventa} className="bg-[#213343] text-white rounded-md px-3 py-2 text-sm font-bold">Abrir caso</button>
      {postventa.map((caso) => <div key={caso.id} className="border-t pt-3 text-sm"><div className="flex flex-wrap gap-2 items-center"><strong>{caso.tipo}</strong><select aria-label={`Estado de caso ${caso.id.slice(0, 8)}`} value={caso.estado} onChange={async (e) => { const { error: statusError } = await supabase.from('postventa_casos').update({ estado: e.target.value }).eq('id', caso.id); if (statusError) setError(mensajeError(statusError)); else await load(); }} className="border rounded-md p-1"><option value="abierto">Abierto</option><option value="programado">Programado</option><option value="en_curso">En curso</option><option value="resuelto">Resuelto</option><option value="cancelado">Cancelado</option></select><span>{caso.fecha_compromiso || 'Sin fecha'}</span></div><p>{caso.descripcion}</p>{caso.cantidad_adicional ? <p>Cantidad adicional: {caso.cantidad_adicional} · Autorización: {caso.autorizacion_cliente}</p> : null}</div>)}
    </section>
    {!delivered && <section className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2"><h2 className="font-bold">Confirmación manual de entrega</h2><p className="text-xs text-gray-600">Solicita aprobación al administrador cuando la entrega está acreditada fuera de las guías.</p><input aria-label="Motivo de confirmación manual" placeholder="Motivo obligatorio" value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="w-full border rounded-md p-2 text-sm" /><button onClick={confirmManualDelivery} className="bg-amber-700 text-white rounded-md px-3 py-2 text-sm font-bold">Solicitar excepción</button></section>}
  </div>;
}
