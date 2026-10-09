'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  cotizacionVigente,
  saldoPendiente,
  totalAbonado,
  totalComercial,
} from '../../../lib/oportunidad-finanzas';
import type {
  AntecedenteDocumento,
  ChatMensaje,
  Cotizacion,
  EstadoPipeline,
  MargenPorNV,
  OportunidadVenta,
  TipoAntecedenteDocumento,
  Usuario,
} from '../../../lib/types';
import { mensajeError } from '../../../lib/errores';
import {
  PageHeader,
  Panel,
  Button,
  StatusBadge,
  CodeStamp,
  StageRail,
  SummaryLine,
  EmptyState,
} from '../../../components/ui/crm';
import { useConfirm, useToast } from '../../../components/ui/feedback';
import {
  Building2,
  Calendar,
  Clock,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Mail,
  Paperclip,
  Phone,
  Send,
  Truck,
  User,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'pagada', label: 'Abono / Pago' },
  { id: 'operacion', label: 'Abastecimiento' },
  { id: 'despacho', label: 'Logística' },
  { id: 'entregada', label: 'Cierre / Entrega' },
] as const;

function getStageIndex(estado: EstadoPipeline): number {
  if (estado === 'nueva') return 0;
  if (estado === 'pagada') return 2;
  if (estado.startsWith('prod_') || estado.startsWith('rev_') || estado === 'programada') {
    if (estado === 'prod_finalizado' || estado === 'rev_entregado') return 4;
    return 3;
  }
  if (estado === 'entregada') return 5;
  return 1;
}

function getStageTone(estado: EstadoPipeline): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  if (estado === 'entregada' || estado === 'prod_finalizado' || estado === 'rev_entregado') return 'success';
  if (estado === 'nueva') return 'accent';
  if (estado === 'pagada') return 'success';
  if (estado.startsWith('prod_') || estado.startsWith('rev_')) return 'warning';
  return 'neutral';
}

const money = (val: number) => `$${Number(val || 0).toLocaleString('es-CL')}`;

export default function FichaOportunidadPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClient(), []);
  const { currentUser, usersList } = useAuth();
  const confirmDialog = useConfirm();
  const toast = useToast();

  const [op, setOp] = useState<OportunidadVenta | null>(null);
  const [quotes, setQuotes] = useState<Cotizacion[]>([]);
  const [actividades, setActividades] = useState<ChatMensaje[]>([]);
  const [antecedentes, setAntecedentes] = useState<AntecedenteDocumento[]>([]);
  const [margen, setMargen] = useState<MargenPorNV | null>(null);
  const [deliveryAccredited, setDeliveryAccredited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Compositor de actividad
  const [comentarioTexto, setComentarioTexto] = useState('');
  const [comentarioTipo, setComentarioTipo] = useState<'comentario' | 'actualizacion' | 'seguimiento'>('comentario');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // Subida de antecedentes
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [nuevoDocTipo, setNuevoDocTipo] = useState<TipoAntecedenteDocumento>('contrato');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [
        opRes,
        quotesRes,
        actividadesRes,
        antecedentesRes,
        margenRes,
        accreditationRes,
      ] = await Promise.all([
        supabase.from('oportunidades').select('*, cliente:clientes(*)').eq('id', id).single(),
        supabase.from('cotizaciones').select('*, items:cotizacion_items(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('actividades_op').select('*').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('oportunidad_antecedentes').select('*').eq('oportunidad_id', id).eq('eliminado', false).order('created_at', { ascending: false }),
        supabase.from('v_margen_por_nv').select('*').eq('oportunidad_id', id).maybeSingle(),
        supabase.rpc('entrega_acreditada', { p_venta: id }),
      ]);

      if (opRes.error) throw opRes.error;

      setOp(opRes.data as OportunidadVenta);
      setQuotes((quotesRes.data || []) as Cotizacion[]);
      setActividades((actividadesRes.data || []).map((a: {
        id: string;
        usuario_id?: string;
        usuario_nombre?: string;
        contenido?: string;
        created_at: string;
        tipo?: string;
      }) => ({
        id: a.id,
        usuario_id: a.usuario_id || '',
        usuario_nombre: a.usuario_nombre || 'Usuario',
        contenido: a.contenido || '',
        texto: a.contenido || '',
        created_at: a.created_at,
        tipo: a.tipo as ChatMensaje['tipo'] || 'actualizacion',
      })));
      setAntecedentes((antecedentesRes.data || []).map((doc: {
        id: string;
        oportunidad_id?: string;
        nombre: string;
        tipo?: string;
        public_url?: string;
        created_at?: string;
        subido_por_nombre?: string;
      }) => ({
        id: doc.id,
        oportunidad_id: doc.oportunidad_id,
        nombre: doc.nombre,
        tipo: (doc.tipo as TipoAntecedenteDocumento) || 'otro',
        url: doc.public_url || '#',
        fecha_iso: doc.created_at || new Date().toISOString(),
        subido_por: doc.subido_por_nombre || 'Usuario',
      })));
      setMargen((margenRes.data as MargenPorNV) || null);
      setDeliveryAccredited(accreditationRes.data === true);
    } catch (err) {
      console.error('Error cargando ficha de oportunidad:', err);
      setError(mensajeError(err, 'No se pudo cargar la oportunidad de venta.'));
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  // Cambiar etapa
  const handleCambiarEtapa = async (nuevaEtapa: EstadoPipeline) => {
    if (!op || op.estado_pipeline === nuevaEtapa) return;

    if (['entregada', 'prod_finalizado', 'rev_entregado'].includes(nuevaEtapa) && !deliveryAccredited) {
      toast({
        message: 'La venta aún no tiene entrega completa acreditada. Revisa guías o excepciones en la vista operativa.',
        tone: 'warning',
      });
      return;
    }

    const ok = await confirmDialog({
      title: 'Cambiar etapa',
      message: `¿Deseas mover la oportunidad a la etapa "${nuevaEtapa}"?`,
      confirmLabel: 'Mover etapa',
    });
    if (!ok) return;

    try {
      const { error: updateError } = await supabase
        .from('oportunidades')
        .update({ estado_pipeline: nuevaEtapa })
        .eq('id', op.id);

      if (updateError) throw updateError;

      await supabase.from('actividades_op').insert({
        oportunidad_id: op.id,
        usuario_id: currentUser?.id || null,
        usuario_nombre: currentUser?.nombre || 'Sistema',
        contenido: `Etapa cambiada de "${op.estado_pipeline}" a "${nuevaEtapa}".`,
        tipo: 'actualizacion',
      });

      toast({
        message: `Oportunidad movida a ${nuevaEtapa}.`,
        tone: 'success',
      });
      await loadData();
    } catch (err) {
      toast({
        message: mensajeError(err, 'No se pudo actualizar la etapa.'),
        tone: 'danger',
      });
    }
  };

  // Enviar comentario
  const handleEnviarComentario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comentarioTexto.trim() || !op) return;

    setEnviandoComentario(true);
    try {
      const { error: insertError } = await supabase.from('actividades_op').insert({
        oportunidad_id: op.id,
        usuario_id: currentUser?.id || null,
        usuario_nombre: currentUser?.nombre || 'Usuario',
        contenido: comentarioTexto.trim(),
        tipo: comentarioTipo,
      });

      if (insertError) throw insertError;

      setComentarioTexto('');
      toast({
        message: 'Se añadió la nota a la línea de tiempo.',
        tone: 'success',
      });
      await loadData();
    } catch (err) {
      toast({
        message: mensajeError(err, 'No se pudo registrar la nota.'),
        tone: 'danger',
      });
    } finally {
      setEnviandoComentario(false);
    }
  };

  // Subir antecedente
  const handleSubirAntecedente = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !op) return;

    setSubiendoArchivo(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `antecedentes/${op.id}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('administracion')
        .upload(storagePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('administracion')
        .getPublicUrl(storagePath);

      const { error: insertError } = await supabase.from('oportunidad_antecedentes').insert({
        oportunidad_id: op.id,
        nombre: file.name,
        tipo: nuevoDocTipo,
        storage_path: storagePath,
        public_url: publicUrlData?.publicUrl || '',
        bucket_id: 'administracion',
        subido_por_nombre: currentUser?.nombre || 'Usuario',
        subido_por_id: currentUser?.id || null,
      });

      if (insertError) throw insertError;

      toast({
        message: `Se adjuntó "${file.name}" a los antecedentes.`,
        tone: 'success',
      });
      await loadData();
    } catch (err) {
      toast({
        message: mensajeError(err, 'No se pudo subir el archivo.'),
        tone: 'danger',
      });
    } finally {
      setSubiendoArchivo(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-ink-muted">
        Cargando ficha de la oportunidad...
      </div>
    );
  }

  if (error || !op) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger font-medium">
          {error || 'No se encontró la oportunidad solicitada.'}
        </div>
        <Link href="/ventas">
          <Button variant="secondary" size="sm">Volver al pipeline</Button>
        </Link>
      </div>
    );
  }

  const quoteVigente = cotizacionVigente(op, quotes);
  const total = totalComercial(op, quotes);
  const abonado = totalAbonado(op);
  const saldo = saldoPendiente(op, quotes);
  const stageIndex = getStageIndex(op.estado_pipeline);
  const stageTone = getStageTone(op.estado_pipeline);
  const asignadoUser = (usersList as Usuario[])?.find((u) => u.id === op.asignado_a);

  return (
    <div className="space-y-6 text-ink">
      {/* Encabezado Principal */}
      <PageHeader
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <CodeStamp>{op.codigo}</CodeStamp>
            <span className="truncate">{op.titulo}</span>
            <StatusBadge tone={stageTone}>{op.estado_pipeline}</StatusBadge>
          </div>
        }
        description={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Building2 size={13} className="text-ink-subtle" />
              {op.cliente ? (
                <Link href={`/clientes/${op.cliente.id}`} className="font-semibold text-accent-ink hover:underline">
                  {op.cliente.nombre}
                </Link>
              ) : (
                'Cliente no asignado'
              )}
            </span>
            {op.cliente?.rut && <span>RUT: {op.cliente.rut}</span>}
            <span className="flex items-center gap-1">
              <Calendar size={13} className="text-ink-subtle" />
              Inicio: {op.fecha_inicio}
            </span>
            {op.fecha_limite && (
              <span className="flex items-center gap-1 font-semibold text-warning-ink">
                <Clock size={13} />
                Límite: {op.fecha_limite}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/ventas/${op.id}/operacion`}>
              <Button variant="primary" size="sm">
                <Truck size={14} aria-hidden />
                Operación y entregas
              </Button>
            </Link>
            <Link href="/ventas">
              <Button variant="secondary" size="sm">
                ← Pipeline
              </Button>
            </Link>
          </div>
        }
      />

      {/* Riel de Obra Superior */}
      <Panel className="p-4">
        <StageRail current={stageIndex} stages={PIPELINE_STAGES} size="lg" />
      </Panel>

      {/* Resumen Financiero en Línea */}
      <Panel className="p-3.5">
        <SummaryLine
          items={[
            { label: 'Total comercial', value: money(total), tone: 'neutral' },
            { label: 'Abonado', value: money(abonado), tone: 'success' },
            { label: 'Saldo por pagar', value: money(saldo), tone: saldo > 0 ? 'warning' : 'neutral' },
            {
              label: 'Entrega',
              value: deliveryAccredited ? 'Acreditada' : 'Pendiente',
              tone: deliveryAccredited ? 'success' : 'warning',
            },
            ...(margen?.margen_bruto_real != null
              ? [{ label: 'Margen est.', value: money(margen.margen_bruto_real), tone: 'accent' as const }]
              : []),
          ]}
        />
      </Panel>

      {/* Estructura en 2 Columnas (8/4) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Columna Principal (8 columnas) */}
        <div className="space-y-6 lg:col-span-8">
          {/* Ficha del Cliente y Datos Comerciales */}
          <Panel title="Datos Comerciales y Cliente" className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="t-micro text-ink-muted block">Cliente</span>
                <div className="font-semibold text-ink mt-0.5">
                  {op.cliente?.nombre || 'Sin cliente asignado'}
                </div>
                {op.cliente?.rut && (
                  <div className="text-xs text-ink-muted">RUT: {op.cliente.rut}</div>
                )}
                {op.cliente?.telefono && (
                  <div className="text-xs text-ink-muted flex items-center gap-1 mt-1">
                    <Phone size={12} className="text-ink-subtle" />
                    {op.cliente.telefono}
                  </div>
                )}
                {op.cliente?.correo && (
                  <div className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
                    <Mail size={12} className="text-ink-subtle" />
                    {op.cliente.correo}
                  </div>
                )}
              </div>

              <div>
                <span className="t-micro text-ink-muted block">Condiciones de Venta</span>
                <div className="space-y-1 mt-0.5 text-xs">
                  <div>
                    <span className="text-ink-muted">Tipo de venta:</span>{' '}
                    <span className="font-semibold text-ink">{op.tipo_venta || 'Instalación'}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Modalidad:</span>{' '}
                    <span className="font-semibold text-ink">{op.modalidad_requerimiento || 'Material + Instalación'}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted">Prioridad:</span>{' '}
                    <StatusBadge tone={op.prioridad === 'urgente' ? 'danger' : op.prioridad === 'alta' ? 'warning' : 'neutral'}>
                      {op.prioridad || 'normal'}
                    </StatusBadge>
                  </div>
                  <div>
                    <span className="text-ink-muted">Responsable comercial:</span>{' '}
                    <span className="font-semibold text-ink">{asignadoUser?.nombre || 'Sin asignar'}</span>
                  </div>
                </div>
              </div>
            </div>

            {op.direccion_obra && (
              <div className="border-t border-line-subtle pt-3 text-xs">
                <span className="t-micro text-ink-muted block">Dirección de obra / despacho</span>
                <span className="font-semibold text-ink mt-0.5 block">{op.direccion_obra}</span>
              </div>
            )}
          </Panel>

          {/* Cotizaciones Asociadas y Partidas */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <span>Cotizaciones y Partidas ({quotes.length})</span>
                {quoteVigente && (
                  <StatusBadge tone="success">
                    Vigente: {quoteVigente.numero_cotizacion} (v{quoteVigente.version || 1})
                  </StatusBadge>
                )}
              </div>
            }
            className="p-4 space-y-4"
          >
            {quotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sin cotizaciones asociadas"
                description="Crea una cotización en el módulo comercial para asociar partidas a esta oportunidad."
              />
            ) : (
              <div className="space-y-4">
                {/* Desglose de Ítems de la Cotización Vigente */}
                {quoteVigente?.items && quoteVigente.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted text-ink-muted border-b border-line">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Producto</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Cant.</th>
                          <th className="py-2.5 px-3 font-semibold text-right">P. Unitario</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-subtle">
                        {quoteVigente.items.map((item) => (
                          <tr key={item.id} className="hover:bg-surface-muted/50">
                            <td className="py-2 px-3 font-medium text-ink">
                              {item.producto}
                              {item.descripcion && (
                                <span className="block text-[11px] text-ink-muted">{item.descripcion}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right t-num text-ink">{item.cantidad}</td>
                            <td className="py-2 px-3 text-right t-num text-ink">{money(item.precio_unitario)}</td>
                            <td className="py-2 px-3 text-right t-num font-semibold text-ink">{money(item.total_item)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">La cotización vigente no tiene ítems desglosados.</p>
                )}

                {/* Histórico de Versiones */}
                <div className="border-t border-line-subtle pt-3">
                  <span className="t-micro text-ink-muted block mb-2">Todas las versiones</span>
                  <div className="space-y-2">
                    {quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between rounded-lg border border-line-subtle bg-surface-muted/30 p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CodeStamp>{q.numero_cotizacion}</CodeStamp>
                          <span className="text-ink-muted">v{q.version || 1}</span>
                          <StatusBadge tone={q.estado === 'aprobada' ? 'success' : q.estado === 'enviada' ? 'accent' : 'neutral'}>
                            {q.estado}
                          </StatusBadge>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="t-num font-semibold text-ink">{money(q.monto_total)}</span>
                          <Link href={`/cotizaciones/${q.id}`} className="text-accent-ink hover:underline font-semibold flex items-center gap-0.5">
                            <span>Ver</span>
                            <ExternalLink size={11} />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* Antecedentes y Archivos Adjuntos */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <span>Documentos y Antecedentes ({antecedentes.length})</span>
                <div className="flex items-center gap-2">
                  <select
                    value={nuevoDocTipo}
                    onChange={(e) => setNuevoDocTipo(e.target.value as TipoAntecedenteDocumento)}
                    className="rounded-md border border-line bg-surface p-1 text-xs text-ink"
                    aria-label="Tipo de antecedente"
                  >
                    <option value="contrato">Contrato</option>
                    <option value="anexo">Anexo</option>
                    <option value="documento_empresa">Doc. Empresa</option>
                    <option value="otro">Otro</option>
                  </select>
                  <label className="cursor-pointer text-xs font-semibold text-accent-ink hover:underline flex items-center gap-1">
                    <Paperclip size={13} />
                    <span>{subiendoArchivo ? 'Subiendo...' : 'Adjuntar'}</span>
                    <input
                      type="file"
                      className="hidden"
                      disabled={subiendoArchivo}
                      onChange={handleSubirAntecedente}
                    />
                  </label>
                </div>
              </div>
            }
            className="p-4 space-y-3"
          >
            {antecedentes.length === 0 ? (
              <EmptyState
                icon={Paperclip}
                title="Sin antecedentes adjuntos"
                description="Adjunta contratos firmados, órdenes de compra, planos o especificaciones técnicas."
              />
            ) : (
              <div className="divide-y divide-line-subtle">
                {antecedentes.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCheck2 size={14} className="text-accent-ink shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-ink block truncate">{doc.nombre}</span>
                        <span className="text-ink-muted t-micro">
                          Tipo: {doc.tipo} · Subido por {doc.subido_por}
                        </span>
                      </div>
                    </div>
                    {doc.url && doc.url !== '#' && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted flex items-center gap-1 shrink-0 ml-2"
                      >
                        <Download size={12} />
                        <span>Descargar</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Columna Lateral (4 columnas) */}
        <div className="space-y-6 lg:col-span-4">
          {/* Panel de Etapa */}
          <Panel title="Control de Etapa" className="p-4 space-y-3">
            <div>
              <span className="t-micro text-ink-muted block mb-1">Etapa actual</span>
              <StatusBadge tone={stageTone}>{op.estado_pipeline}</StatusBadge>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-line-subtle">
              <span className="t-micro text-ink-muted block">Mover a otra etapa:</span>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {(['nueva', 'pagada', 'prod_cola', 'prod_fabricacion', 'prod_finalizado', 'entregada'] as EstadoPipeline[]).map(
                  (stage) => (
                    <button
                      key={stage}
                      onClick={() => handleCambiarEtapa(stage)}
                      disabled={op.estado_pipeline === stage}
                      className={`rounded-md border px-2.5 py-1.5 font-semibold text-left transition ${
                        op.estado_pipeline === stage
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-line bg-surface text-ink hover:bg-surface-muted'
                      }`}
                    >
                      {stage}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-line-subtle">
              <Link href={`/ventas/${op.id}/operacion`} className="w-full block">
                <Button variant="secondary" size="sm" className="w-full justify-center">
                  <Truck size={14} aria-hidden />
                  Ver entregas y logística
                </Button>
              </Link>
            </div>
          </Panel>

          {/* Actividades y Chat Interno */}
          <Panel title="Actividades y Notas" className="p-4 space-y-3">
            {/* Compositor */}
            <form onSubmit={handleEnviarComentario} className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={comentarioTipo}
                  onChange={(e) => setComentarioTipo(e.target.value as typeof comentarioTipo)}
                  className="rounded-md border border-line bg-surface p-1.5 text-xs text-ink"
                >
                  <option value="comentario">Comentario</option>
                  <option value="actualizacion">Actualización</option>
                  <option value="seguimiento">Seguimiento</option>
                </select>
              </div>

              <textarea
                placeholder="Escribe una nota o actualización sobre esta venta..."
                value={comentarioTexto}
                onChange={(e) => setComentarioTexto(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-line bg-surface p-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={enviandoComentario || !comentarioTexto.trim()}
                  variant="primary"
                  size="sm"
                >
                  <Send size={12} aria-hidden />
                  <span>Publicar nota</span>
                </Button>
              </div>
            </form>

            {/* Listado de Actividades */}
            <div className="pt-3 border-t border-line-subtle">
              {actividades.length === 0 ? (
                <p className="text-xs text-ink-muted text-center py-4">
                  No hay notas registradas para esta oportunidad.
                </p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {actividades.map((act) => (
                    <div key={act.id} className="rounded-lg border border-line-subtle bg-surface-muted/30 p-2.5 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-ink-muted t-micro">
                        <span className="font-semibold text-ink flex items-center gap-1">
                          <User size={11} className="text-ink-subtle" />
                          {act.usuario_nombre}
                        </span>
                        <span>{new Date(act.created_at).toLocaleDateString('es-CL')}</span>
                      </div>
                      <p className="text-ink whitespace-pre-wrap">{act.contenido || act.texto}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
