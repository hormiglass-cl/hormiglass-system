'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '../../../../lib/supabase/client';
import type { OrdenCompra, OrdenCompraAsignacion, OportunidadVenta } from '../../../../lib/types';
import { mensajeError } from '../../../../lib/errores';
import { Button, CodeStamp, PageHeader, Panel } from '../../../../components/ui/crm';
import { useConfirm, useToast } from '../../../../components/ui/feedback';

export default function AsignacionesOrdenCompraPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();

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
    if (ocRes.error) setError(mensajeError(ocRes.error));
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
      setError(mensajeError(insertError));
      return;
    }
    toast({ message: 'Asignación guardada correctamente.', tone: 'success' });
    setCantidad('');
    setCosto('');
    setUnidad('');
    setNotas('');
    await load();
  }

  async function handleRemoveAsignacion(asignacionId: string) {
    const ok = await confirm({
      title: 'Quitar asignación',
      message: '¿Deseas quitar esta asignación de la venta asociada?',
      confirmLabel: 'Quitar',
      destructive: true,
    });
    if (!ok) return;

    const { error: deleteError } = await supabase.from('orden_compra_asignaciones').delete().eq('id', asignacionId);
    if (deleteError) {
      toast({ message: mensajeError(deleteError), tone: 'danger' });
    } else {
      toast({ message: 'Asignación quitada.', tone: 'success' });
      await load();
    }
  }

  return (
    <div className="hg-page space-y-5">
      <div>
        <Link
          href="/ordenes-compra"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-accent-ink transition mb-3"
        >
          <ArrowLeft size={14} aria-hidden />
          <span>Volver a Órdenes de Compra</span>
        </Link>
        <PageHeader
          title={
            <span>
              Asignaciones de {orden ? <CodeStamp>{orden.numero_oc}</CodeStamp> : 'OC'}
            </span>
          }
          description="Distribuye cada ítem entre ventas (NV). La suma asignada no puede superar lo comprado."
        />
      </div>

      {error && (
        <p role="alert" className="t-caption rounded-md border border-danger-line bg-danger-soft p-3 text-danger font-medium">
          {error}
        </p>
      )}

      {orden && (
        <Panel className="p-4">
          <label className="block text-xs font-semibold text-ink">
            Tipo de compra
            <select
              className="hg-field mt-1 max-w-xs"
              value={orden.tipo_compra || 'reventa'}
              onChange={async (e) => {
                const tipo_compra = e.target.value as 'reventa' | 'insumos_fabricacion';
                const { error: updateError } = await supabase.from('ordenes_compra').update({ tipo_compra }).eq('id', id);
                if (updateError) {
                  setError(mensajeError(updateError));
                } else {
                  setOrden({ ...orden, tipo_compra });
                  toast({ message: 'Tipo de compra actualizado.', tone: 'success' });
                }
              }}
            >
              <option value="reventa">Compra para reventa</option>
              <option value="insumos_fabricacion">Insumos de fabricación</option>
            </select>
          </label>
        </Panel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Nueva asignación" className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Ítem de la OC *</label>
            <select
              aria-label="Ítem de la OC"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setCantidad('');
                setCosto('');
              }}
              className="hg-field"
            >
              <option value="">Seleccionar ítem...</option>
              {orden?.items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.descripcion} · {item.cantidad} unidades
                </option>
              ))}
            </select>
          </div>

          {itemId && (
            <p className="t-caption text-ink-muted">
              Disponible: <strong className="t-num text-ink">{remainingQty.toLocaleString('es-CL')}</strong> unidades ·{' '}
              <strong className="t-num text-ink">${remainingCost.toLocaleString('es-CL')}</strong>
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Venta destino (NV) *</label>
            <select
              aria-label="Venta destino"
              value={opId}
              onChange={(e) => setOpId(e.target.value)}
              className="hg-field"
            >
              <option value="">Seleccionar venta...</option>
              {oportunidades.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.codigo} · {op.titulo}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Cantidad *</label>
              <input
                aria-label="Cantidad asignada"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="hg-field t-num"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1">Costo ($) *</label>
              <input
                aria-label="Costo asignado"
                type="number"
                min="0"
                step="0.01"
                placeholder="Costo $"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className="hg-field t-num"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Unidad (opcional)</label>
            <input
              aria-label="Unidad"
              placeholder="Ej. m², unidad, pallet"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="hg-field"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">Notas (opcional)</label>
            <input
              aria-label="Notas"
              placeholder="Detalle o instrucción"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="hg-field"
            />
          </div>

          <div className="pt-2">
            <Button
              variant="primary"
              disabled={saving}
              onClick={saveAsignacion}
            >
              {saving ? 'Guardando...' : 'Guardar asignación'}
            </Button>
          </div>
        </Panel>

        <Panel title="Distribución actual" className="p-4 space-y-3">
          {asignaciones.length === 0 && (
            <p className="t-caption text-ink-muted">Sin asignaciones registradas.</p>
          )}
          {asignaciones.map((a) => {
            const op = oportunidades.find((item) => item.id === a.oportunidad_id);
            const ocItem = orden?.items?.find((item) => item.id === a.orden_compra_item_id);
            return (
              <div key={a.id} className="border-b border-line-subtle pb-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CodeStamp>{op?.codigo || a.oportunidad_id}</CodeStamp>
                    {op && <span className="font-semibold text-ink truncate">{op.titulo}</span>}
                  </div>
                  <p className="text-ink-muted">{ocItem?.descripcion || 'Ítem'}</p>
                  <p className="t-num font-semibold text-ink">
                    {Number(a.cantidad).toLocaleString('es-CL')} {a.unidad || 'unidades'} · ${Number(a.costo_asignado).toLocaleString('es-CL')}
                  </p>
                  {a.notas && <p className="text-ink-muted italic">{a.notas}</p>}
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => handleRemoveAsignacion(a.id)}
                  className="text-danger hover:bg-danger-soft shrink-0"
                >
                  Quitar
                </Button>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}
