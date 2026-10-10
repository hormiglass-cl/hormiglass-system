'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import { cotizacionVigente, saldoPendiente } from '../../../../lib/oportunidad-finanzas';
import type { Cotizacion, GuiaDespacho, GuiaDespachoDocumento, OperacionExcepcion, OrdenProduccion, OportunidadVenta, PostventaCaso, ProduccionDiaria } from '../../../../lib/types';
import { useAuth } from '../../../../lib/context/AuthContext';
import { mensajeError } from '../../../../lib/errores';
import { PageHeader, Panel, Button, StatusBadge, CodeStamp } from '../../../../components/ui/crm';

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

  return (
    <div className="space-y-6 text-ink">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <span>Producción y entregas</span>
            {op?.codigo && <CodeStamp>{op.codigo}</CodeStamp>}
          </div>
        }
        description={op?.titulo || 'Seguimiento de órdenes de producción, traslados y guías de despacho.'}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/ventas/${id}`}>
              <Button variant="secondary" size="sm">Ver ficha de venta</Button>
            </Link>
            <Link href="/ventas">
              <Button variant="subtle" size="sm">Pipeline general</Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger font-medium">
          {error}
        </div>
      )}

      {op && ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) && !delivered && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning-ink font-medium">
          Esta venta figura como entregada en el historial, pero no tiene acreditación completa bajo las reglas actuales. Revisa las guías o solicita una excepción administrativa.
        </div>
      )}

      <div className="grid sm:grid-cols-5 gap-3">
        <Panel className="p-3.5">
          <span className="t-micro text-ink-muted">Entrega</span>
          <div className="mt-1">
            <StatusBadge tone={delivered ? 'success' : 'warning'}>
              {delivered ? 'Completada' : 'Pendiente'}
            </StatusBadge>
          </div>
        </Panel>
        {canSeeFinance && (
          <Panel className="p-3.5">
            <span className="t-micro text-ink-muted">{delivered ? 'Saldo por cobrar' : 'Saldo pendiente'}</span>
            <strong className="block t-num text-ink text-base mt-1 font-semibold">{op ? money(saldoPendiente(op, quotes)) : '—'}</strong>
          </Panel>
        )}
        <Panel className="p-3.5">
          <span className="t-micro text-ink-muted">Guías</span>
          <strong className="block t-num text-ink text-base mt-1 font-semibold">{guides.length}</strong>
        </Panel>
        {canSeeFinance && (
          <Panel className="p-3.5">
            <span className="t-micro text-ink-muted">Compras asignadas</span>
            <strong className="block t-num text-ink text-base mt-1 font-semibold">{money(purchaseCost)}</strong>
          </Panel>
        )}
        {canSeeFinance && (
          <Panel className="p-3.5">
            <span className="t-micro text-ink-muted">Traslados reales/estimados</span>
            <strong className="block t-num text-ink text-base mt-1 font-semibold">{money(dispatchCost)}</strong>
          </Panel>
        )}
      </div>

      {canSeeFinance && (
        <Panel title="Cobranza y margen estimado" className="p-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-ink">
              <span className="block text-xs text-ink-muted mb-1">Vencimiento del cobro</span>
              <input
                aria-label="Vencimiento del cobro"
                type="date"
                value={dueDate}
                disabled={!delivered}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink disabled:opacity-50"
              />
            </label>
            <button
              disabled={!delivered}
              onClick={saveDueDate}
              className="rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              Guardar vencimiento
            </button>
          </div>
          <p className="text-ink-muted">
            {!delivered ? 'Cobranza suspendida: acredita la entrega antes de fijar o usar un vencimiento.' : op?.fecha_vencimiento_cobro ? `Vence el ${op.fecha_vencimiento_cobro}` : 'Sin vencimiento definido; el saldo no se considera vencido.'}
          </p>
          <p className="text-ink">
            Venta <span className="font-semibold">{money(revenue)}</span> − compras asignadas <span className="font-semibold">{money(purchaseCost)}</span> − traslados <span className="font-semibold">{money(dispatchCost)}</span> = <strong className="t-num font-semibold text-accent-ink">{money(estimatedMargin)}</strong>
          </p>
          <p className="t-caption text-ink-muted">
            Margen provisional: excluye mano de obra y otros costos no registrados. {costIncomplete ? 'Algunos traslados usan costo estimado.' : 'Los traslados tienen costo real confirmado.'}
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Ruta operativa de la venta">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`rounded-lg border p-3 text-xs ${
              step.complete ? 'bg-success-soft border-success/30 text-success-ink' : 'bg-surface border-line text-ink-muted'
            }`}
          >
            <span className="block font-semibold text-ink">{index + 1}. {step.label}</span>
            <span className="t-micro">{step.complete ? 'Completado' : 'Pendiente'}</span>
          </div>
        ))}
      </div>

      <Panel title="Orden de producción" className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Fecha objetivo de producción"
            type="date"
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
            className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
          />
          <button
            disabled={busy || !quoteItems.length}
            onClick={createProductionOrder}
            className="hg-button-primary rounded-md px-3 py-2 text-sm disabled:opacity-50"
          >
            Crear desde cotización vigente
          </button>
        </div>

        {orders.map((order) => (
          <div key={order.id} className="border-t border-line-subtle pt-2 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-ink">Orden {order.id.slice(0, 8)}</strong>
              <select
                aria-label={`Estado de orden ${order.id.slice(0, 8)}`}
                value={order.estado}
                onChange={async (e) => {
                  const { error: statusError } = await supabase.from('ordenes_produccion').update({ estado: e.target.value }).eq('id', order.id);
                  if (statusError) setError(mensajeError(statusError));
                  else await load();
                }}
                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
              >
                <option value="planificada">Planificada</option>
                <option value="en_curso">En curso</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <span className="text-ink-muted">Objetivo: {order.fecha_objetivo || 'Sin fecha'}</span>
            </div>
            <p className="text-ink-muted">
              {order.items?.map((item) => `${item.producto}: ${daily.filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id).reduce((sum, row) => sum + Number(row.cantidad_producida), 0)} / ${item.cantidad_objetivo}`).join(' · ')}
            </p>
          </div>
        ))}

        {orders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-line-subtle pt-3">
            <select
              aria-label="Orden de producción"
              value={productionOrderId}
              onChange={(e) => { setProductionOrderId(e.target.value); setProductionItemId(''); }}
              className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
            >
              <option value="">Orden</option>
              {orders.map((order) => <option key={order.id} value={order.id}>{order.id.slice(0, 8)}</option>)}
            </select>
            <select
              aria-label="Producto producido"
              value={productionItemId}
              onChange={(e) => setProductionItemId(e.target.value)}
              className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
            >
              <option value="">Producto</option>
              {orders.find((order) => order.id === productionOrderId)?.items?.map((item) => (
                <option key={item.id} value={item.id}>{item.producto}</option>
              ))}
            </select>
            <input
              aria-label="Cantidad producida"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Cantidad real"
              value={producedQty}
              onChange={(e) => setProducedQty(e.target.value)}
              className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
            />
            <input
              aria-label="Fecha de producción"
              type="date"
              value={producedDate}
              onChange={(e) => setProducedDate(e.target.value)}
              className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
            />
            <Button
              disabled={busy}
              onClick={registerProduction}
              variant="secondary"
              size="sm"
            >
              Registrar producción
            </Button>
          </div>
        )}

        <input
          aria-label="Motivo de excepción operativa"
          placeholder="Motivo para solicitar excedente o entrega sin firma"
          value={exceptionReason}
          onChange={(e) => setExceptionReason(e.target.value)}
          className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink"
        />
        {daily.length > 0 && (
          <p className="t-caption text-ink-muted">
            Producción real: {daily.map((row) => `${row.fecha_produccion} ${row.producto} ${row.cantidad_producida}`).join(' · ')}
          </p>
        )}
      </Panel>

      <Panel title="Nueva guía de despacho" className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <input aria-label="Número de guía" placeholder="Folio de guía" value={guideNumber} onChange={(e) => setGuideNumber(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Fecha de salida" type="datetime-local" value={guideDate} onChange={(e) => setGuideDate(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Vehículo" placeholder="Vehículo" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Origen" placeholder="Origen" value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Destino" placeholder="Destino" value={destination} onChange={(e) => setDestination(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Chofer" placeholder="Chofer" value={driver} onChange={(e) => setDriver(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <select aria-label="Tipo de transporte" value={transportType} onChange={(e) => setTransportType(e.target.value as typeof transportType)} className="rounded-md border border-line bg-surface p-2 text-ink">
            <option value="propio">Transporte propio</option>
            <option value="externo">Transporte externo</option>
            <option value="retiro_cliente">Retiro por cliente</option>
          </select>
          <input aria-label="Costo estimado del traslado" type="number" min="0" step="1" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
        </div>

        {quoteItems.map((item) => (
          <label key={item.id} className="flex items-center justify-between gap-3 text-sm border-t border-line-subtle pt-2 text-ink">
            <span>{item.producto} · por planificar {Math.max(0, Number(item.cantidad) - allCommitted(item.id))} · por entregar {Math.max(0, Number(item.cantidad) - allReceived(item.id))}</span>
            <input aria-label={`Cantidad de ${item.producto}`} type="number" min="0" step="0.01" placeholder="Cantidad" value={guideQuantities[item.id || ''] || ''} onChange={(e) => setGuideQuantities({ ...guideQuantities, [item.id || '']: e.target.value })} className="w-32 rounded-md border border-line bg-surface p-2 text-ink" />
          </label>
        ))}

        <button
          disabled={busy || !quoteItems.length}
          onClick={createGuide}
          className="hg-button-primary rounded-md px-3 py-2 text-sm disabled:opacity-50"
        >
          Crear guía parcial
        </button>
      </Panel>

      <Panel title="Guías y evidencias" className="p-4 space-y-3">
        {guides.map((guide) => (
          <div key={guide.id} className="rounded-lg border border-line bg-surface p-4 space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex items-center gap-2">
                <CodeStamp>{guide.numero_guia}</CodeStamp>
                <StatusBadge tone={guide.estado === 'entregada' ? 'success' : guide.estado === 'cancelada' ? 'danger' : 'neutral'}>
                  {guide.estado}
                </StatusBadge>
              </div>
              <span className="text-ink-muted">{guide.vehiculo || 'Sin vehículo'} · {guide.chofer || 'Sin chofer'}</span>
            </div>

            {guide.estado === 'entregada' && !guideHasEvidence(guide) && (
              <p role="alert" className="rounded-md border border-warning/30 bg-warning-soft p-2 text-warning-ink">
                Cierre histórico sin firma ni excepción aprobada. Esta guía no acredita la entrega; adjunta solo un respaldo auténtico o solicita revisión administrativa.
              </p>
            )}

            <p className="text-ink-muted">{guide.origen || 'Origen pendiente'} → {guide.destino || 'Destino pendiente'}</p>
            <p className="t-caption text-ink-muted">
              {guide.tipo_transporte || 'propio'} · costo estimado {money(guide.costo_estimado || 0)} · costo real {guide.costo_real_confirmado ? money(guide.costo_real || 0) : 'Sin confirmar'} · recibió {guide.recibido_por || 'pendiente'}
            </p>

            <div className="flex flex-wrap gap-2">
              <Link href={`/ventas/${id}/operacion/guias/${guide.id}`} className="text-accent-ink hover:underline font-semibold text-xs">
                Ver e imprimir orden interna
              </Link>
              <input aria-label={`Costo real de ${guide.numero_guia}`} type="number" min="0" step="1" defaultValue={guide.costo_real || 0} onBlur={(e) => void updateGuideCost(guide.id, e.target.value)} className="w-36 rounded-md border border-line bg-surface p-1 text-ink" />
              <input aria-label={`Recibido por en ${guide.numero_guia}`} placeholder="Nombre de quien recibe" value={receivedBy[guide.id] ?? guide.recibido_por ?? ''} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onChange={(e) => setReceivedBy({ ...receivedBy, [guide.id]: e.target.value })} className="rounded-md border border-line bg-surface p-1 text-ink disabled:opacity-50" />
            </div>

            {(guide.items || []).map((item) => (
              <div key={item.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center border-t border-line-subtle pt-2 text-ink">
                <span>{item.producto} · plan {item.cantidad_planificada}</span>
                <label className="text-ink-muted">Cargado <input type="number" min="0" step="0.01" defaultValue={item.cantidad_cargada} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onBlur={(e) => updateGuideItem(item.id, 'cantidad_cargada', e.target.value)} className="w-24 rounded-md border border-line bg-surface p-1 ml-1 text-ink disabled:opacity-50" /></label>
                <label className="text-ink-muted">Recibido <input type="number" min="0" step="0.01" defaultValue={item.cantidad_recibida} disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'} onBlur={(e) => updateGuideItem(item.id, 'cantidad_recibida', e.target.value)} className="w-24 rounded-md border border-line bg-surface p-1 ml-1 text-ink disabled:opacity-50" /></label>
              </div>
            ))}

            <p className="t-caption text-ink-muted">
              Diferencia total: {(guide.items || []).reduce((sum, item) => sum + Number(item.cantidad_planificada) - Number(item.cantidad_recibida), 0).toLocaleString('es-CL')}
            </p>

            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant="secondary"
                size="sm"
                disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                onClick={async () => {
                  const { error: e } = await supabase.from('guias_despacho').update({ carga_verificada: true, carga_verificada_por: currentUser?.id || null, carga_verificada_at: new Date().toISOString(), estado: 'cargada' }).eq('id', guide.id);
                  if (e) setError(mensajeError(e));
                  else await load();
                }}
              >
                Verificar carga
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                onClick={() => updateGuide(guide, 'entregada')}
              >
                Confirmar entrega
              </Button>
              {guide.estado === 'entregada' && !guideHasEvidence(guide) && (
                <button onClick={() => requestException('firma_entrega', { guia_despacho_id: guide.id })} className="rounded-md border border-warning/30 bg-warning-soft px-3 py-1.5 font-semibold text-warning-ink text-xs">
                  Solicitar excepción de firma
                </button>
              )}
              {guide.estado !== 'cancelada' && (
                <label className="rounded-md border border-line bg-surface px-3 py-1.5 cursor-pointer text-xs font-semibold text-ink hover:bg-surface-muted">
                  Adjuntar respaldo firmado auténtico
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadEvidence(guide, file, 'firma'); }} />
                </label>
              )}
              {(guide.documentos || []).map((document) => (
                <button key={document.id} onClick={() => openEvidence(document)} className="text-accent-ink underline text-xs font-semibold">
                  {document.nombre}
                </button>
              ))}
            </div>
          </div>
        ))}
        {guides.length === 0 && <p className="text-sm text-ink-muted">Aún no hay guías.</p>}
      </Panel>

      <Panel title="Excepciones y aprobaciones" className="p-4 space-y-2 text-sm">
        {exceptions.map((entry) => (
          <div key={entry.id} className="border-t border-line-subtle pt-2 flex flex-wrap gap-2 items-center justify-between text-ink">
            <span>
              <strong>{entry.tipo.replaceAll('_', ' ')}</strong> · {entry.estado} · {entry.motivo}{entry.cantidad_excedente ? ` · excedente ${entry.cantidad_excedente}` : ''}
            </span>
            {entry.estado === 'pendiente' && currentUser?.rol === 'admin' && (
              <span className="flex gap-2">
                <button onClick={() => resolveException(entry, 'aprobada')} className="rounded border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                  Aprobar
                </button>
                <button onClick={() => resolveException(entry, 'rechazada')} className="rounded border border-danger/30 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
                  Rechazar
                </button>
              </span>
            )}
          </div>
        ))}
        {!exceptions.length && <p className="text-ink-muted">No hay excepciones solicitadas.</p>}
      </Panel>

      <Panel title="Postventa" className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <select aria-label="Tipo de caso" value={postventaType} onChange={(e) => setPostventaType(e.target.value as PostventaCaso['tipo'])} className="rounded-md border border-line bg-surface p-2 text-ink">
            <option value="defecto">Defecto</option>
            <option value="faltante">Faltante</option>
            <option value="cantidad_adicional">Cantidad adicional</option>
            <option value="otro">Otro</option>
          </select>
          <input aria-label="Fecha de compromiso" type="date" value={postventaDate} onChange={(e) => setPostventaDate(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
          <input aria-label="Cantidad adicional" type="number" min="0" step="0.01" placeholder="Cantidad adicional" value={postventaAdditional} onChange={(e) => setPostventaAdditional(e.target.value)} className="rounded-md border border-line bg-surface p-2 text-ink" />
        </div>
        <textarea aria-label="Descripción del caso" placeholder="Descripción del caso" value={postventaDescription} onChange={(e) => setPostventaDescription(e.target.value)} className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink" />
        <input aria-label="Autorización del cliente" placeholder="Referencia de autorización del cliente para cantidad adicional" value={postventaAuthorization} onChange={(e) => setPostventaAuthorization(e.target.value)} className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink" />
        <Button disabled={busy} onClick={createPostventa} variant="primary" size="sm">
          Abrir caso
        </Button>
        {postventa.map((caso) => (
          <div key={caso.id} className="border-t border-line-subtle pt-3 text-sm space-y-1 text-ink">
            <div className="flex flex-wrap gap-2 items-center">
              <strong>{caso.tipo}</strong>
              <select
                aria-label={`Estado de caso ${caso.id.slice(0, 8)}`}
                value={caso.estado}
                onChange={async (e) => {
                  const { error: statusError } = await supabase.from('postventa_casos').update({ estado: e.target.value }).eq('id', caso.id);
                  if (statusError) setError(mensajeError(statusError));
                  else await load();
                }}
                className="rounded-md border border-line bg-surface px-2 py-1 text-ink"
              >
                <option value="abierto">Abierto</option>
                <option value="programado">Programado</option>
                <option value="en_curso">En curso</option>
                <option value="resuelto">Resuelto</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <span className="text-ink-muted">{caso.fecha_compromiso || 'Sin fecha'}</span>
            </div>
            <p className="text-ink">{caso.descripcion}</p>
            {caso.cantidad_adicional ? (
              <p className="t-caption text-ink-muted">
                Cantidad adicional: {caso.cantidad_adicional} · Autorización: {caso.autorizacion_cliente}
              </p>
            ) : null}
          </div>
        ))}
      </Panel>

      {!delivered && (
        <section className="rounded-lg border border-warning/30 bg-warning-soft p-4 space-y-2 text-sm text-ink">
          <h2 className="font-semibold text-warning-ink">Confirmación manual de entrega</h2>
          <p className="t-caption text-ink-muted">Solicita aprobación al administrador cuando la entrega está acreditada fuera de las guías.</p>
          <input aria-label="Motivo de confirmación manual" placeholder="Motivo obligatorio" value={manualReason} onChange={(e) => setManualReason(e.target.value)} className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink" />
          <Button onClick={confirmManualDelivery} variant="primary" size="sm">
            Solicitar excepción
          </Button>
        </section>
      )}
    </div>
  );
}
