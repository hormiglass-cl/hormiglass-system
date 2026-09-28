'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '../../../../../../lib/supabase/client';
import type { GuiaDespacho, OportunidadVenta } from '../../../../../../lib/types';

export default function GuiaImprimiblePage() {
  const { id, guiaId } = useParams<{ id: string; guiaId: string }>();
  const supabase = useMemo(() => createClient(), []);
  const [guia, setGuia] = useState<GuiaDespacho | null>(null);
  const [venta, setVenta] = useState<OportunidadVenta | null>(null);
  const [acreditada, setAcreditada] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [guideResult, saleResult, documentResult, exceptionResult] = await Promise.all([
      supabase.from('guias_despacho').select('*, items:guia_despacho_items(*)').eq('id', guiaId).eq('oportunidad_id', id).single(),
      supabase.from('oportunidades').select('*, cliente:clientes(nombre, apellido_razon_social, rut, direccion, comuna)').eq('id', id).single(),
      supabase.from('guia_despacho_documentos').select('id').eq('guia_despacho_id', guiaId).eq('tipo', 'firma'),
      supabase.from('operacion_excepciones').select('id').eq('guia_despacho_id', guiaId).eq('tipo', 'firma_entrega').eq('estado', 'aprobada'),
    ]);
    const queryError = guideResult.error || saleResult.error || documentResult.error || exceptionResult.error;
    if (queryError) { setError(queryError.message); return; }
    setGuia(guideResult.data as GuiaDespacho); setVenta(saleResult.data as OportunidadVenta);
    setAcreditada(guideResult.data?.estado === 'entregada' && Boolean(documentResult.data?.length || exceptionResult.data?.length));
  }, [guiaId, id, supabase]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (error) return <p role="alert" className="p-6 text-red-700">{error}</p>;
  if (!guia || !venta) return <p className="p-6">Cargando orden de despacho...</p>;
  return <main className="mx-auto max-w-4xl bg-white p-8 text-[#213343] print:max-w-none print:p-0">
    <div className="mb-6 flex justify-between gap-3 print:hidden"><Link href={`/ventas/${id}/operacion`} className="text-[#f97316]">← Volver a la operación</Link><button onClick={() => window.print()} className="rounded-md bg-[#213343] px-4 py-2 font-bold text-white">Imprimir</button></div>
    <div className="border-b-2 border-[#213343] pb-4"><h1 className="text-2xl font-bold">Orden de despacho interna</h1><p className="text-sm">Documento de control operativo. No es una guía tributaria electrónica ni reemplaza los documentos exigidos por el SII.</p></div>
    <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
      <p><strong>Folio interno:</strong> {guia.numero_guia}</p><p><strong>Venta:</strong> {venta.codigo}</p>
      <p><strong>Fecha salida:</strong> {guia.fecha_salida ? new Date(guia.fecha_salida).toLocaleString('es-CL') : 'Por definir'}</p><p><strong>Estado operativo:</strong> {guia.estado}</p>
      <p className="col-span-2"><strong>Acreditación:</strong> {acreditada ? 'Respaldo firmado o excepción aprobada' : 'Pendiente de respaldo válido'}</p>
      <p><strong>Cliente:</strong> {venta.cliente?.nombre} {venta.cliente?.apellido_razon_social || ''}</p><p><strong>RUT:</strong> {venta.cliente?.rut || '—'}</p>
      <p><strong>Origen:</strong> {guia.origen || '—'}</p><p><strong>Destino:</strong> {guia.destino || venta.direccion_obra || '—'}</p>
      <p><strong>Transporte:</strong> {guia.tipo_transporte || 'propio'} · {guia.vehiculo || 'Sin vehículo'}</p><p><strong>Chofer:</strong> {guia.chofer || '—'}</p>
    </div>
    <table className="mt-6 w-full border-collapse text-sm"><thead><tr className="bg-gray-100"><th className="border p-2 text-left">Producto</th><th className="border p-2 text-right">Planificado</th><th className="border p-2 text-right">Cargado</th><th className="border p-2 text-right">Recibido</th></tr></thead><tbody>{(guia.items || []).map((item) => <tr key={item.id}><td className="border p-2">{item.producto}</td><td className="border p-2 text-right">{item.cantidad_planificada}</td><td className="border p-2 text-right">{item.cantidad_cargada}</td><td className="border p-2 text-right">{item.cantidad_recibida}</td></tr>)}</tbody></table>
    <div className="mt-14 grid grid-cols-2 gap-10 text-sm"><div className="border-t border-gray-500 pt-2">Verificación de carga / firma</div><div className="border-t border-gray-500 pt-2">Recepción conforme / firma<br />{guia.recibido_por || 'Nombre: ____________________'}</div></div>
    <p className="mt-8 text-xs text-gray-600">Registrar cualquier diferencia en el sistema y adjuntar respaldo firmado a esta orden.</p>
  </main>;
}
