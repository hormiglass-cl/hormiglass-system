'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import type { OrdenCompra, OrdenCompraAsignacion, OportunidadVenta } from '../../../../lib/types';

export default function AsignacionesOrdenCompraPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [orden, setOrden] = useState<OrdenCompra | null>(null);
  const [asignaciones, setAsignaciones] = useState<OrdenCompraAsignacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [itemId, setItemId] = useState('');
  const [opId, setOpId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [unidad, setUnidad] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [ocRes, asRes, opRes] = await Promise.all([
      supabase.from('ordenes_compra').select('*, items:orden_compra_items(*)').eq('id', id).single(),
      supabase.from('orden_compra_asignaciones').select('*').eq('orden_compra_id', id),
      supabase.from('oportunidades').select('id, codigo, titulo').order('created_at', { ascending: false }),
    ]);
    if (ocRes.error) setError(ocRes.error.message);
    else setOrden(ocRes.data as OrdenCompra);
    if (!asRes.error) setAsignaciones(asRes.data as OrdenCompraAsignacion[]);
    if (!opRes.error) setOportunidades(opRes.data as OportunidadVenta[]);
  }, [id, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedItem = orden?.items?.find((item) => item.id === itemId);
  const assignedToItem = asignaciones.filter((a) => a.orden_compra_item_id === itemId);
  const remainingQty = Number(selectedItem?.cantidad || 0) - assignedToItem.reduce((sum, a) => sum + Number(a.cantidad), 0);
  const remainingCost = Number(selectedItem?.total_item || 0) - assignedToItem.reduce((sum, a) => sum + Number(a.costo_asignado), 0);

  async function saveAsignacion() {
    const qty = Number(cantidad);
    const amount = Number(costo);
    if (!itemId || !opId || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(amount) || amount < 0) {
      setError('Selecciona ítem y oportunidad, e ingresa cantidad y costo válidos.');
      return;
    }
    if (qty > remainingQty || amount > remainingCost) {
      setError('La asignación supera la cantidad o el costo disponible del ítem.');
      return;
    }
    setSaving(true);
    setError('');
    const { error: insertError } = await supabase.from('orden_compra_asignaciones').insert({
      orden_compra_id: id,
      orden_compra_item_id: itemId,
      oportunidad_id: opId,
      cantidad: qty,
      costo_asignado: amount,
      unidad: unidad.trim() || null,
      notas: notas.trim() || null,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCantidad(''); setCosto(''); setUnidad(''); setNotas('');
    await load();
  }

  async function removeAsignacion(asignacionId: string) {
    const { error: deleteError } = await supabase.from('orden_compra_asignaciones').delete().eq('id', asignacionId);
    if (deleteError) setError(deleteError.message);
    else await load();
  }

  return (
    <div className="space-y-5 text-[#213343]">
      <Link href="/ordenes-compra" className="text-xs font-semibold text-[#f97316]">← Órdenes de compra</Link>
      <div>
        <h1 className="text-2xl font-bold">Asignaciones de {orden?.numero_oc || 'OC'}</h1>
        <p className="text-sm text-gray-600">Distribuye cada ítem entre ventas. La suma asignada no puede superar lo comprado.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</p>}
      {orden && <label className="block text-sm font-semibold">Tipo de compra
        <select
          className="block mt-1 border border-gray-300 rounded-md p-2"
          value={orden.tipo_compra || 'reventa'}
          onChange={async (e) => {
            const tipo_compra = e.target.value as 'reventa' | 'insumos_fabricacion';
            const { error: updateError } = await supabase.from('ordenes_compra').update({ tipo_compra }).eq('id', id);
            if (updateError) setError(updateError.message); else setOrden({ ...orden, tipo_compra });
          }}
        >
          <option value="reventa">Compra para reventa</option>
          <option value="insumos_fabricacion">Insumos de fabricación</option>
        </select>
      </label>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-bold">Nueva asignación</h2>
          <select aria-label="Ítem de la OC" value={itemId} onChange={(e) => { setItemId(e.target.value); setCantidad(''); setCosto(''); }} className="w-full border border-gray-300 rounded-md p-2 text-sm">
            <option value="">Seleccionar ítem</option>
            {orden?.items?.map((item) => <option key={item.id} value={item.id}>{item.descripcion} · {item.cantidad} unidades</option>)}
          </select>
          {itemId && <p className="text-xs text-gray-600">Disponible: {remainingQty.toLocaleString('es-CL')} unidades · ${remainingCost.toLocaleString('es-CL')}</p>}
          <select aria-label="Venta destino" value={opId} onChange={(e) => setOpId(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm">
            <option value="">Seleccionar venta</option>
            {oportunidades.map((op) => <option key={op.id} value={op.id}>{op.codigo} · {op.titulo}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Cantidad asignada" type="number" min="0.01" step="0.01" placeholder="Cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="border border-gray-300 rounded-md p-2 text-sm" />
            <input aria-label="Costo asignado" type="number" min="0" step="0.01" placeholder="Costo $" value={costo} onChange={(e) => setCosto(e.target.value)} className="border border-gray-300 rounded-md p-2 text-sm" />
          </div>
          <input aria-label="Unidad" placeholder="Unidad (opcional)" value={unidad} onChange={(e) => setUnidad(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" />
          <input aria-label="Notas" placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" />
          <button disabled={saving} onClick={saveAsignacion} className="bg-[#f97316] disabled:opacity-50 text-white rounded-md px-4 py-2 text-sm font-bold">Guardar asignación</button>
        </section>
        <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
          <h2 className="font-bold">Distribución actual</h2>
          {asignaciones.length === 0 && <p className="text-sm text-gray-500">Sin asignaciones.</p>}
          {asignaciones.map((a) => (
            <div key={a.id} className="border-b border-gray-100 pb-2 flex justify-between gap-2 text-sm">
              <div>
                <strong>{oportunidades.find((op) => op.id === a.oportunidad_id)?.codigo || a.oportunidad_id}</strong>
                <p>{orden?.items?.find((item) => item.id === a.orden_compra_item_id)?.descripcion || 'Ítem'}</p>
                <p className="text-gray-600">{Number(a.cantidad).toLocaleString('es-CL')} {a.unidad || 'unidades'} · ${Number(a.costo_asignado).toLocaleString('es-CL')}</p>
              </div>
              <button onClick={() => removeAsignacion(a.id)} className="text-red-600 text-xs font-bold">Quitar</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
