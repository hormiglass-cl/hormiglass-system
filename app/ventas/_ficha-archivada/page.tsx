'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import { useBreadcrumb } from '../../../lib/context/BreadcrumbContext';
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
  EstadoCotizacion,
  EstadoPipeline,
  EventoProduccionLogistica,
  GuiaDespacho,
  GuiaDespachoDocumento,
  MargenPorNV,
  OperacionExcepcion,
  OportunidadVenta,
  OrdenCompra,
  OrdenCompraAsignacion,
  OrdenProduccion,
  PostventaCaso,
  ProduccionDiaria,
  TipoAntecedenteDocumento,
  Usuario,
  VisitaTerreno,
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
  Tabs,
} from '../../../components/ui/crm';
import { useConfirm, useToast } from '../../../components/ui/feedback';
import { CotizacionModal } from '../../../components/CotizacionModal';
import { PdfPreviewModal } from '../../../components/PdfPreviewModal';
import { OrdenCompraModal } from '../../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../../components/OrdenCompraPdfPreviewModal';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FilePlus,
  FileText,
  Mail,
  Paperclip,
  Phone,
  Plus,
  Send,
  ShoppingCart,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'cotizacion', label: 'Cotización' },
  { id: 'pagada', label: 'Abono / Pago' },
  { id: 'aprobada', label: 'Venta Aprobada' },
  { id: 'operacion', label: 'Abastecimiento' },
  { id: 'entregada', label: 'Cierre / Entrega' },
] as const;

function getStageIndex(estado: EstadoPipeline): number {
  if (estado === 'nueva') return 0;
  if (estado === 'pagada') return 2;
  if (estado === 'entregada') return 3;
  if (estado.startsWith('prod_') || estado.startsWith('rev_') || estado === 'programada') {
    if (estado === 'prod_finalizado' || estado === 'rev_entregado') return 5;
    return 4;
  }
  return 1;
}

function getStageTone(estado: EstadoPipeline): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  if (estado === 'entregada' || estado === 'prod_finalizado' || estado === 'rev_entregado') return 'success';
  if (estado === 'nueva') return 'accent';
  if (estado === 'pagada') return 'success';
  if (estado.startsWith('prod_') || estado.startsWith('rev_')) return 'warning';
  return 'neutral';
}

const STAGE_LABELS: Record<string, string> = {
  nueva: 'Nueva Oportunidad',
  pagada: 'Pago Validado',
  programada: 'En Programación',
  entregada: 'Venta Aprobada',
  prod_pendiente: 'Pendiente Planif.',
  prod_cola: 'Cola Fabricación',
  prod_fabricacion: 'En Fabricación',
  prod_listo_instalacion: 'Listo p/ Instal.',
  prod_instalacion: 'En Instalación',
  prod_finalizado: 'Finalizado / Entregado',
  rev_coordinacion: 'Coord. Proveedor',
  rev_stock: 'Confirm. Stock',
  rev_listo_retiro: 'Listo Retiro',
  rev_listo_despacho: 'Listo Despacho',
  rev_entregado: 'Entregado al Cliente',
  rev_postventa: 'Postventa',
};

type FichaTab = 'resumen' | 'cotizaciones' | 'abastecimiento' | 'operacion';

function normalizeTab(raw: string | null, isManoObra: boolean): FichaTab {
  if (raw === 'cotizaciones' || raw === 'abastecimiento' || raw === 'operacion' || raw === 'resumen') {
    return raw;
  }
  return isManoObra ? 'operacion' : 'resumen';
}

const money = (val: number) => `$${Number(val || 0).toLocaleString('es-CL')}`;

export default function FichaOportunidadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { currentUser, usersList } = useAuth();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const { setCustomTitle, setOnBack } = useBreadcrumb();

  const isManoObra = currentUser?.rol === 'mano_obra';
  const canSeeFinance = !isManoObra;

  const [tabOverride, setTabOverride] = useState<FichaTab | null>(null);
  const paramTab = searchParams.get('tab');
  const activeTab: FichaTab = isManoObra
    ? 'operacion'
    : tabOverride ?? normalizeTab(paramTab, isManoObra);

  const handleTabChange = (nextTab: string) => {
    const normalized = normalizeTab(nextTab, isManoObra);
    setTabOverride(normalized);
    const params = new URLSearchParams(searchParams.toString());
    if (normalized === 'resumen' && !isManoObra) {
      params.delete('tab');
    } else {
      params.set('tab', normalized);
    }
    const qs = params.toString();
    router.replace(qs ? `/ventas/${id}?${qs}` : `/ventas/${id}`, { scroll: false });
  };

  // Datos principales de la oportunidad
  const [op, setOp] = useState<OportunidadVenta | null>(null);
  const [quotes, setQuotes] = useState<Cotizacion[]>([]);
  const [clientQuotes, setClientQuotes] = useState<Cotizacion[]>([]);
  const [actividades, setActividades] = useState<ChatMensaje[]>([]);
  const [antecedentes, setAntecedentes] = useState<AntecedenteDocumento[]>([]);
  const [margen, setMargen] = useState<MargenPorNV | null>(null);
  const [deliveryAccredited, setDeliveryAccredited] = useState(false);

  // Datos de Abastecimiento, OC y Calendario
  const [ordenesCompra, setOrdenesCompra] = useState<(OrdenCompra & { asignaciones?: OrdenCompraAsignacion[] })[]>([]);
  const [visitas, setVisitas] = useState<VisitaTerreno[]>([]);
  const [eventosCalendario, setEventosCalendario] = useState<EventoProduccionLogistica[]>([]);

  // Datos de Operación, Producción, Guías y Postventa
  const [orders, setOrders] = useState<OrdenProduccion[]>([]);
  const [daily, setDaily] = useState<ProduccionDiaria[]>([]);
  const [guides, setGuides] = useState<GuiaDespacho[]>([]);
  const [purchaseAssignments, setPurchaseAssignments] = useState(0);
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [postventa, setPostventa] = useState<PostventaCaso[]>([]);
  const [exceptions, setExceptions] = useState<OperacionExcepcion[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Modales de Cotizaciones y OC
  const [showCotModal, setShowCotModal] = useState(false);
  const [editCotId, setEditCotId] = useState<string | undefined>(undefined);
  const [previewCot, setPreviewCot] = useState<Cotizacion | null>(null);
  const [selectedCandidateCotId, setSelectedCandidateCotId] = useState('');

  const [showOcModal, setShowOcModal] = useState(false);
  const [previewOc, setPreviewOc] = useState<OrdenCompra | null>(null);

  // Compositor de actividad
  const [comentarioTexto, setComentarioTexto] = useState('');
  const [comentarioTipo, setComentarioTipo] = useState<'comentario' | 'actualizacion' | 'seguimiento'>('comentario');
  const [enviandoComentario, setEnviandoComentario] = useState(false);

  // Subida de antecedentes
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [nuevoDocTipo, setNuevoDocTipo] = useState<TipoAntecedenteDocumento>('contrato');

  // Registro de Abonos
  const [nuevoAbonoMonto, setNuevoAbonoMonto] = useState('');
  const [nuevoAbonoNota, setNuevoAbonoNota] = useState('');
  const [nuevoAbonoFile, setNuevoAbonoFile] = useState<File | null>(null);
  const [nuevoAbonoFileName, setNuevoAbonoFileName] = useState('');
  const [abonoErrorMsg, setAbonoErrorMsg] = useState('');
  const [abonoSaving, setAbonoSaving] = useState(false);

  // Liquidación de comisión
  const [liquidandoComision, setLiquidandoComision] = useState(false);

  // Estado operativo (Tab 4 y Cobranza)
  const [dueDate, setDueDate] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
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
        orderRes,
        dailyRes,
        guideRes,
        postventaRes,
        purchaseRes,
        exceptionRes,
        visitasRes,
        eventosRes,
        allOcsRes,
      ] = await Promise.all([
        supabase.from('oportunidades').select('*, cliente:clientes(*)').eq('id', id).single(),
        supabase.from('cotizaciones').select('*, cliente:clientes(*), items:cotizacion_items(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('actividades_op').select('*').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('oportunidad_antecedentes').select('*').eq('oportunidad_id', id).eq('eliminado', false).order('created_at', { ascending: false }),
        supabase.from('v_margen_por_nv').select('*').eq('oportunidad_id', id).maybeSingle(),
        supabase.rpc('entrega_acreditada', { p_venta: id }),
        supabase.from('ordenes_produccion').select('*, items:orden_produccion_items(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('produccion_diaria').select('*').eq('oportunidad_id', id).order('fecha_produccion', { ascending: false }),
        supabase.from('guias_despacho').select('*, items:guia_despacho_items(*), documentos:guia_despacho_documentos(*)').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('postventa_casos').select('*').eq('oportunidad_id', id).order('created_at', { ascending: false }),
        supabase.from('orden_compra_asignaciones').select('*').eq('oportunidad_id', id),
        supabase.from('operacion_excepciones').select('*').eq('oportunidad_id', id).order('solicitado_at', { ascending: false }),
        supabase.from('visitas_terreno').select('*').eq('oportunidad_id', id).order('fecha_visita_terreno', { ascending: false }),
        supabase.from('eventos_calendario').select('*').eq('oportunidad_id', id).order('fecha_inicio', { ascending: false }),
        supabase.from('ordenes_compra').select('*, proveedor:proveedores(*), items:orden_compra_items(*)').order('created_at', { ascending: false }),
      ]);

      if (opRes.error) throw opRes.error;
      const opData = opRes.data as OportunidadVenta;
      setOp(opData);
      setDueDate(opData.fecha_vencimiento_cobro || '');

      const linkedQuotes = (quotesRes.data || []) as Cotizacion[];
      setQuotes(linkedQuotes);

      if (opData.cliente_id) {
        const { data: cliQuotes } = await supabase
          .from('cotizaciones')
          .select('*, cliente:clientes(*), items:cotizacion_items(*)')
          .eq('cliente_id', opData.cliente_id)
          .order('created_at', { ascending: false });
        setClientQuotes((cliQuotes || []) as Cotizacion[]);
      }

      setActividades(
        (actividadesRes.data || []).map((a: {
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
          tipo: (a.tipo as ChatMensaje['tipo']) || 'actualizacion',
        }))
      );

      setAntecedentes(
        (antecedentesRes.data || []).map((doc: {
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
        }))
      );

      setMargen((margenRes.data as MargenPorNV) || null);
      setDeliveryAccredited(accreditationRes.data === true);
      setOrders((orderRes.data || []) as OrdenProduccion[]);
      setDaily((dailyRes.data || []) as ProduccionDiaria[]);
      setGuides((guideRes.data || []) as GuiaDespacho[]);
      setPostventa((postventaRes.data || []) as PostventaCaso[]);
      setExceptions((exceptionRes.data || []) as OperacionExcepcion[]);
      setVisitas((visitasRes.data || []) as VisitaTerreno[]);
      setEventosCalendario((eventosRes.data || []) as EventoProduccionLogistica[]);

      const assignments = (purchaseRes.data || []) as OrdenCompraAsignacion[];
      setPurchaseAssignments(assignments.length);
      setPurchaseCost(
        assignments.reduce((sum, a) => sum + Number(a.costo_asignado || 0), 0)
      );

      const assignedOcIds = new Set(assignments.map((a) => a.orden_compra_id));
      const matchedOcs = ((allOcsRes.data || []) as OrdenCompra[])
        .filter((oc) => oc.oportunidad_id === id || assignedOcIds.has(oc.id))
        .map((oc) => ({
          ...oc,
          asignaciones: assignments.filter((a) => a.orden_compra_id === oc.id),
        }));
      setOrdenesCompra(matchedOcs);
      setError('');
    } catch (err) {
      console.error('Error cargando ficha maestra de oportunidad:', err);
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

  useEffect(() => {
    if (op) {
      setCustomTitle(op.titulo || op.codigo || 'Oportunidad');
      setOnBack(() => () => {
        router.push(`/ventas?oportunidad=${op.id}`);
      });
    } else {
      setCustomTitle(null);
      setOnBack(null);
    }
    return () => {
      setCustomTitle(null);
      setOnBack(null);
    };
  }, [op, router, setCustomTitle, setOnBack]);

  const logOperation = async (message: string) => {
    await supabase.from('actividades_op').insert({
      oportunidad_id: id,
      usuario_id: currentUser?.id || null,
      usuario_nombre: currentUser?.nombre || 'Sistema',
      contenido: message,
      tipo: 'actualizacion',
    });
  };

  // Actualizar un campo de la oportunidad
  const handleUpdateField = async (field: keyof OportunidadVenta, value: unknown, logMsg?: string) => {
    if (!op) return;
    try {
      const { error: updateErr } = await supabase
        .from('oportunidades')
        .update({ [field]: value })
        .eq('id', op.id);
      if (updateErr) throw updateErr;
      setOp((prev) => (prev ? { ...prev, [field]: value } : null));
      if (logMsg) {
        await logOperation(logMsg);
      }
      toast({ message: 'Datos actualizados.', tone: 'success' });
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo actualizar el campo.'), tone: 'danger' });
    }
  };

  // Cambiar etapa
  const handleCambiarEtapa = async (nuevaEtapa: EstadoPipeline) => {
    if (!op || op.estado_pipeline === nuevaEtapa) return;

    if (['prod_finalizado', 'rev_entregado'].includes(nuevaEtapa) && !deliveryAccredited) {
      toast({
        message: 'La venta aún no tiene entrega completa acreditada. Revisa la pestaña Producción, Despachos & Guías.',
        tone: 'warning',
      });
      handleTabChange('operacion');
      return;
    }

    const ok = await confirmDialog({
      title: 'Cambiar etapa',
      message: `¿Deseas mover la oportunidad a la etapa "${STAGE_LABELS[nuevaEtapa] || nuevaEtapa}"?`,
      confirmLabel: 'Mover etapa',
    });
    if (!ok) return;

    try {
      const { error: updateError } = await supabase
        .from('oportunidades')
        .update({ estado_pipeline: nuevaEtapa })
        .eq('id', op.id);

      if (updateError) throw updateError;

      await logOperation(`Etapa cambiada de "${op.estado_pipeline}" a "${nuevaEtapa}".`);

      toast({
        message: `Oportunidad movida a ${STAGE_LABELS[nuevaEtapa] || nuevaEtapa}.`,
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
        message: 'Se añadió la nota a la bitácora.',
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

  // Liquidación de Comisión Comercial
  const handleLiquidarComision = async () => {
    if (!op) return;
    const asignado = (usersList as Usuario[])?.find((u) => u.id === op.asignado_a);
    const montoComision = op.comision_monto || Math.round((op.monto_estimado || 0) * ((op.comision_porcentaje || 3) / 100));
    const ok = await confirmDialog({
      title: '¿Confirmar liquidación de comisión?',
      message: `Se marcará como pagada la comisión por ${money(montoComision)} correspondiente al ejecutivo comercial ${asignado?.nombre || 'asignado'}.`,
      confirmLabel: 'Confirmar pago de comisión',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      setLiquidandoComision(true);
      const { error: rpcErr } = await supabase.rpc('marcar_comision_pagada', {
        p_oportunidad_id: op.id,
      });
      if (rpcErr) throw rpcErr;
      toast({ message: 'Comisión liquidada y marcada como pagada exitosamente.', tone: 'success' });
      await loadData();
    } catch (err: unknown) {
      toast({ message: mensajeError(err, 'No se pudo liquidar la comisión.'), tone: 'danger' });
    } finally {
      setLiquidandoComision(false);
    }
  };

  // Vincular cotización existente del cliente
  const handleLinkExistingQuote = async () => {
    if (!op || !selectedCandidateCotId) return;
    try {
      setBusy(true);
      const { error: linkErr } = await supabase
        .from('cotizaciones')
        .update({ oportunidad_id: op.id })
        .eq('id', selectedCandidateCotId);
      if (linkErr) throw linkErr;
      await supabase
        .from('oportunidades')
        .update({ cotizacion_actual_id: selectedCandidateCotId })
        .eq('id', op.id);
      await logOperation('Cotización vinculada a la oportunidad.');
      setSelectedCandidateCotId('');
      toast({ message: 'Cotización vinculada.', tone: 'success' });
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo vincular la cotización.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  // Cambiar estado de cotización
  const handleQuoteStatusChange = async (cot: Cotizacion, nuevoEstado: EstadoCotizacion) => {
    if (!op) return;
    try {
      const { error: qErr } = await supabase
        .from('cotizaciones')
        .update({ estado: nuevoEstado })
        .eq('id', cot.id);
      if (qErr) throw qErr;
      if (nuevoEstado === 'aprobada' || nuevoEstado === 'enviada') {
        await supabase
          .from('oportunidades')
          .update({ cotizacion_actual_id: cot.id, monto_estimado: cot.monto_total })
          .eq('id', op.id);
      }
      await logOperation(`Cotización ${cot.numero_cotizacion} actualizada a "${nuevoEstado}".`);
      toast({ message: `Cotización ${cot.numero_cotizacion}: ${nuevoEstado}`, tone: 'success' });
      await loadData();
    } catch (err) {
      toast({ message: mensajeError(err, 'No se pudo actualizar la cotización.'), tone: 'danger' });
    }
  };

  // Registrar Abono
  const handleRegistrarAbono = async () => {
    if (!op) return;
    const rawVal = Number(nuevoAbonoMonto);
    if (!rawVal || rawVal <= 0) {
      setAbonoErrorMsg('Ingresa un monto de abono válido.');
      return;
    }
    if (!nuevoAbonoFile) {
      setAbonoErrorMsg('El comprobante de pago es obligatorio.');
      return;
    }

    setAbonoSaving(true);
    setAbonoErrorMsg('');
    const pagoId = crypto.randomUUID();
    let fileName = '';
    try {
      const cleanFileName = nuevoAbonoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      fileName = `abonos/${op.id}/${crypto.randomUUID()}_${cleanFileName}`;
      const { data: upload, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, nuevoAbonoFile, {
          contentType: nuevoAbonoFile.type || undefined,
          upsert: false,
        });
      if (uploadError || !upload) throw new Error(mensajeError(uploadError, 'No se pudo subir el comprobante.'));

      const { error: rpcError } = await supabase.rpc('registrar_abono_atomico', {
        p_oportunidad_id: op.id,
        p_pago: {
          id: pagoId,
          monto: rawVal,
          fecha: new Date().toLocaleString('es-CL'),
          fecha_iso: new Date().toISOString(),
          nota: nuevoAbonoNota || 'Abono registrado',
          comprobante_nombre: nuevoAbonoFile.name,
          comprobante_url: fileName,
        },
        p_operacion: 'crear',
      });
      if (rpcError) throw rpcError;

      await logOperation(`Abono por ${money(rawVal)} enviado a validación en Caja.`);
      setNuevoAbonoMonto('');
      setNuevoAbonoNota('');
      setNuevoAbonoFile(null);
      setNuevoAbonoFileName('');
      toast({ message: 'Abono registrado y enviado a validación en Caja.', tone: 'success' });
      await loadData();
    } catch (err) {
      if (fileName) {
        await supabase.storage.from('documentos').remove([fileName]);
      }
      setAbonoErrorMsg(mensajeError(err, 'No se pudo registrar el abono.'));
    } finally {
      setAbonoSaving(false);
    }
  };

  const abrirComprobanteAbono = async (storedUrl: string) => {
    const publicMarker = '/storage/v1/object/public/documentos/';
    const privateMarker = '/storage/v1/object/sign/documentos/';
    const marker = storedUrl.includes(publicMarker) ? publicMarker : privateMarker;
    const path = storedUrl.includes(marker)
      ? decodeURIComponent(storedUrl.split(marker)[1].split('?')[0])
      : storedUrl;
    if (!path || /^https?:/i.test(path)) {
      toast({ message: 'El comprobante no tiene una ruta privada válida.', tone: 'warning' });
      return;
    }
    const { data, error: signErr } = await supabase.storage.from('documentos').createSignedUrl(path, 60);
    if (signErr || !data?.signedUrl) {
      toast({ message: mensajeError(signErr, 'No se pudo abrir el comprobante.'), tone: 'danger' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  // --- Lógica Operativa (Tab 4: Producción, Despachos & Guías) ---
  const quoteVigente = op ? cotizacionVigente(op, quotes) : undefined;
  const quoteItems = quoteVigente?.items || [];

  const allCommitted = (itemId?: string) =>
    guides
      .filter((g) => g.estado !== 'cancelada')
      .reduce(
        (sum, guide) =>
          sum +
          (guide.items || [])
            .filter((item) => item.cotizacion_item_id === itemId)
            .reduce(
              (subtotal, item) =>
                subtotal + Number(guide.estado === 'entregada' ? item.cantidad_recibida : item.cantidad_planificada),
              0
            ),
        0
      );

  const guideHasEvidence = (guide: GuiaDespacho) =>
    (guide.documentos || []).some((document) => document.tipo === 'firma') ||
    exceptions.some(
      (entry) => entry.tipo === 'firma_entrega' && entry.guia_despacho_id === guide.id && entry.estado === 'aprobada'
    );

  const allReceived = (itemId?: string) =>
    guides
      .filter((g) => g.estado === 'entregada' && guideHasEvidence(g))
      .flatMap((g) => g.items || [])
      .filter((item) => item.cotizacion_item_id === itemId)
      .reduce((sum, item) => sum + Number(item.cantidad_recibida), 0);

  const delivered = deliveryAccredited;
  const productionRequired = op?.abastecimiento === 'fabricar';
  const supplyDone = productionRequired
    ? orders.some((order) => order.estado === 'completada')
    : op?.abastecimiento === 'compra_proveedor'
    ? purchaseAssignments > 0
    : op?.abastecimiento === 'stock';
  const collectionDone = Boolean(op && saldoPendiente(op, quotes) <= 0 && quoteVigente);
  const dispatchCost = guides
    .filter((guide) => guide.estado !== 'cancelada')
    .reduce((sum, guide) => sum + Number(guide.costo_real_confirmado ? guide.costo_real : guide.costo_estimado || 0), 0);
  const costIncomplete = guides.some((guide) => guide.estado !== 'cancelada' && !guide.costo_real_confirmado);
  const revenue = Number(quoteVigente?.monto_total || 0);
  const estimatedMargin = revenue - purchaseCost - dispatchCost;

  const operationalSteps = [
    {
      label: 'Venta comercial',
      complete:
        op?.estado_pipeline === 'entregada' ||
        Boolean(op?.estado_pipeline?.startsWith('prod_') || op?.estado_pipeline?.startsWith('rev_')),
    },
    { label: productionRequired ? 'Producción' : 'Abastecimiento o retiro', complete: Boolean(supplyDone) },
    { label: 'Logística', complete: guides.length > 0 || delivered },
    { label: 'Entrega', complete: delivered },
    { label: 'Cobro y cierre', complete: collectionDone },
  ];

  async function requestException(tipo: OperacionExcepcion['tipo'], extra: Partial<OperacionExcepcion> = {}) {
    if (!currentUser || exceptionReason.trim().length < 8) {
      setError('Explica el motivo de la excepción con al menos ocho caracteres.');
      return;
    }
    if (
      exceptions.some(
        (entry) =>
          entry.tipo === tipo &&
          entry.estado === 'pendiente' &&
          entry.orden_produccion_id === (extra.orden_produccion_id || null) &&
          entry.cotizacion_item_id === (extra.cotizacion_item_id || null) &&
          entry.guia_despacho_id === (extra.guia_despacho_id || null)
      )
    ) {
      setError('Ya existe una solicitud pendiente para este caso.');
      return;
    }
    const { error: requestError } = await supabase.from('operacion_excepciones').insert({
      tipo,
      oportunidad_id: id,
      motivo: exceptionReason.trim(),
      solicitado_por: currentUser.id,
      orden_produccion_id: extra.orden_produccion_id || null,
      cotizacion_item_id: extra.cotizacion_item_id || null,
      guia_despacho_id: extra.guia_despacho_id || null,
      cantidad_excedente: extra.cantidad_excedente || null,
    });
    if (requestError) setError(mensajeError(requestError));
    else {
      setExceptionReason('');
      await logOperation(`Excepción ${tipo} solicitada para aprobación administrativa.`);
      await loadData();
    }
  }

  async function resolveException(entry: OperacionExcepcion, status: 'aprobada' | 'rechazada') {
    if (currentUser?.rol !== 'admin') return;
    const { error: resolveError } = await supabase.rpc('resolver_excepcion_operativa', {
      p_excepcion_id: entry.id,
      p_estado: status,
    });
    if (resolveError) {
      setError(mensajeError(resolveError));
      return;
    }
    await logOperation(`Excepción ${entry.tipo} ${status} por administración.`);
    await loadData();
  }

  async function saveDueDate() {
    if (!delivered) {
      setError('El cobro del saldo comienza cuando la entrega está acreditada.');
      return;
    }
    const { error: dateError } = await supabase
      .from('oportunidades')
      .update({ fecha_vencimiento_cobro: dueDate || null })
      .eq('id', id);
    if (dateError) setError(mensajeError(dateError));
    else {
      toast({ message: 'Vencimiento de cobro guardado.', tone: 'success' });
      await loadData();
    }
  }

  async function createProductionOrder() {
    if (!op || !quoteItems.length) {
      setError('Vincula una cotización con ítems antes de crear la orden.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: orderError } = await supabase
      .from('ordenes_produccion')
      .insert({
        oportunidad_id: id,
        fecha_inicio: new Date().toISOString().slice(0, 10),
        fecha_objetivo: productionDate || null,
        responsable_id: op.responsable_operativo_id || null,
      })
      .select('id')
      .single();
    if (orderError || !data) {
      setError(mensajeError(orderError, 'No se pudo crear la orden.'));
      setBusy(false);
      return;
    }
    const { error: itemsError } = await supabase.from('orden_produccion_items').insert(
      quoteItems.map((item) => ({
        orden_produccion_id: data.id,
        cotizacion_item_id: item.id || null,
        producto: item.producto,
        cantidad_objetivo: item.cantidad,
      }))
    );
    if (itemsError) {
      await supabase.from('ordenes_produccion').delete().eq('id', data.id);
      setError(mensajeError(itemsError));
    } else {
      await logOperation('Orden de producción creada desde la cotización vigente.');
      await loadData();
    }
    setBusy(false);
  }

  async function registerProduction() {
    const order = orders.find((entry) => entry.id === productionOrderId);
    const item = order?.items?.find((entry) => entry.id === productionItemId);
    if (!order || !item || !Number.isFinite(Number(producedQty)) || Number(producedQty) <= 0) {
      setError('Selecciona orden, producto y una cantidad positiva.');
      return;
    }
    const made = daily
      .filter((row) => row.orden_produccion_id === order.id && row.cotizacion_item_id === item.cotizacion_item_id)
      .reduce((sum, row) => sum + Number(row.cantidad_producida), 0);
    const allowedExtra = exceptions
      .filter(
        (entry) =>
          entry.tipo === 'exceso_produccion' &&
          entry.estado === 'aprobada' &&
          entry.orden_produccion_id === order.id &&
          entry.cotizacion_item_id === item.cotizacion_item_id
      )
      .reduce((sum, entry) => sum + Number(entry.cantidad_excedente || 0), 0);
    const excess = made + Number(producedQty) - Number(item.cantidad_objetivo) - allowedExtra;
    if (excess > 0) {
      if (exceptionReason.trim().length < 8) {
        setError(`La cantidad excede el objetivo por ${excess}. Escribe el motivo para solicitar aprobación.`);
        return;
      }
      await requestException('exceso_produccion', {
        orden_produccion_id: order.id,
        cotizacion_item_id: item.cotizacion_item_id,
        cantidad_excedente: excess,
      });
      return;
    }
    setBusy(true);
    setError('');
    const { error: insertError } = await supabase.from('produccion_diaria').insert({
      oportunidad_id: id,
      orden_produccion_id: order.id,
      cotizacion_item_id: item.cotizacion_item_id,
      producto: item.producto,
      cantidad_producida: Number(producedQty),
      fecha_produccion: producedDate,
      registrado_por: currentUser?.id || null,
    });
    if (insertError) setError(mensajeError(insertError));
    else {
      await logOperation(`Producción real registrada: ${item.producto}, ${producedQty}.`);
      setProducedQty('');
      await loadData();
    }
    setBusy(false);
  }

  async function createGuide() {
    const selected = quoteItems
      .map((item) => ({ item, qty: Number(guideQuantities[item.id || ''] || 0) }))
      .filter(({ qty }) => qty > 0);
    if (!op || !guideNumber.trim() || !selected.length) {
      setError('Ingresa folio y al menos una cantidad de despacho.');
      return;
    }
    if (selected.some(({ item, qty }) => qty > Math.max(0, Number(item.cantidad) - allCommitted(item.id)))) {
      setError('Una cantidad supera lo pendiente de planificar.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: guideError } = await supabase
      .from('guias_despacho')
      .insert({
        oportunidad_id: id,
        numero_guia: guideNumber.trim(),
        fecha_salida: guideDate ? new Date(guideDate).toISOString() : null,
        origen: origin.trim() || null,
        destino: destination.trim() || null,
        vehiculo: vehicle.trim() || null,
        chofer: driver.trim() || null,
        tipo_transporte: transportType,
        costo_estimado: Number(estimatedCost) || 0,
      })
      .select('id')
      .single();
    if (guideError || !data) {
      setError(mensajeError(guideError, 'No se pudo crear la guía.'));
      setBusy(false);
      return;
    }
    const { error: itemsError } = await supabase.from('guia_despacho_items').insert(
      selected.map(({ item, qty }) => ({
        guia_despacho_id: data.id,
        cotizacion_item_id: item.id || null,
        producto: item.producto,
        cantidad_planificada: qty,
      }))
    );
    if (itemsError) {
      await supabase.from('guias_despacho').delete().eq('id', data.id);
      setError(mensajeError(itemsError));
    } else {
      await logOperation(`Orden de despacho ${guideNumber.trim()} creada con ${selected.length} ítem(s).`);
      setGuideNumber('');
      setGuideQuantities({});
      setEstimatedCost('0');
      await loadData();
    }
    setBusy(false);
  }

  async function updateGuideItem(itemId: string, field: 'cantidad_cargada' | 'cantidad_recibida', value: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('La cantidad debe ser cero o mayor.');
      return;
    }
    const { error: updateError } = await supabase.from('guia_despacho_items').update({ [field]: amount }).eq('id', itemId);
    if (updateError) setError(mensajeError(updateError));
    else await loadData();
  }

  async function updateGuide(guide: GuiaDespacho, estado: GuiaDespacho['estado']) {
    if (estado === 'entregada' && !guide.carga_verificada) {
      setError('Verifica la carga antes de confirmar la entrega.');
      return;
    }
    if (estado === 'entregada' && (guide.items || []).some((item) => Number(item.cantidad_recibida) <= 0)) {
      setError('Registra la cantidad recibida de cada ítem antes de confirmar la entrega.');
      return;
    }
    if (estado === 'entregada' && !receivedBy[guide.id]?.trim() && !guide.recibido_por?.trim()) {
      setError('Indica quién recibió la entrega antes de confirmarla.');
      return;
    }
    if (estado === 'entregada' && !guideHasEvidence(guide)) {
      await requestException('firma_entrega', { guia_despacho_id: guide.id });
      return;
    }
    const { error: updateError } = await supabase
      .from('guias_despacho')
      .update({
        estado,
        entrega_conforme:
          estado === 'entregada' &&
          (guide.items || []).every((item) => Number(item.cantidad_recibida) === Number(item.cantidad_planificada)),
        recibido_por: receivedBy[guide.id]?.trim() || guide.recibido_por || null,
        entrega_confirmada_por: estado === 'entregada' ? currentUser?.id || null : null,
        entrega_confirmada_at: estado === 'entregada' ? new Date().toISOString() : null,
      })
      .eq('id', guide.id);
    if (updateError) setError(mensajeError(updateError));
    else {
      await logOperation(`Guía ${guide.numero_guia}: estado ${estado}.`);
      await loadData();
    }
  }

  async function uploadEvidence(guide: GuiaDespacho, file: File, tipo: GuiaDespachoDocumento['tipo']) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `entregas/${guide.id}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('administracion').upload(path, file, { upsert: false });
    if (uploadError) {
      setError(mensajeError(uploadError));
      return;
    }
    const { error: insertError } = await supabase.from('guia_despacho_documentos').insert({
      guia_despacho_id: guide.id,
      tipo,
      nombre: file.name,
      archivo_path: path,
    });
    if (insertError) {
      await supabase.storage.from('administracion').remove([path]);
      setError(mensajeError(insertError));
      return;
    }
    await logOperation(`Respaldo de ${tipo} adjuntado a la orden de despacho ${guide.numero_guia}: ${file.name}.`);
    await loadData();
  }

  async function updateGuideCost(guideId: string, amount: string) {
    const cost = Number(amount);
    if (!Number.isFinite(cost) || cost < 0) {
      setError('El costo debe ser cero o mayor.');
      return;
    }
    const { error: costError } = await supabase
      .from('guias_despacho')
      .update({ costo_real: cost, costo_real_confirmado: true })
      .eq('id', guideId);
    if (costError) setError(mensajeError(costError));
    else await loadData();
  }

  async function createPostventa() {
    if (!postventaDescription.trim()) {
      setError('Describe el caso de postventa.');
      return;
    }
    const quantity = postventaAdditional.trim() ? Number(postventaAdditional) : null;
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      setError('La cantidad adicional no es válida.');
      return;
    }
    if (postventaType === 'cantidad_adicional' && (!quantity || quantity <= 0)) {
      setError('Indica una cantidad adicional mayor que cero.');
      return;
    }
    if (quantity && !postventaAuthorization.trim()) {
      setError('Registra la autorización del cliente para cantidades adicionales.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: postventaError } = await supabase.rpc('crear_postventa_con_evento', {
        p_caso: {
          oportunidad_id: id,
          tipo: postventaType,
          descripcion: postventaDescription.trim(),
          cantidad_adicional: quantity,
          autorizacion_cliente: postventaAuthorization.trim() || null,
          fecha_compromiso: postventaDate || null,
          responsable_id: op?.responsable_operativo_id || null,
        },
        p_evento: postventaDate
          ? {
              titulo: `Postventa: ${postventaDescription.trim().slice(0, 90)}`,
              fecha_inicio: `${postventaDate}T12:00:00`,
              fecha_fin: `${postventaDate}T13:00:00`,
              hora_evento: '12:00',
              responsable_id: op?.responsable_operativo_id || null,
            }
          : null,
      });
      if (postventaError) throw postventaError;
      await logOperation(`Caso de postventa abierto: ${postventaDescription.trim()}`);
      setPostventaDescription('');
      setPostventaAdditional('');
      setPostventaAuthorization('');
      await loadData();
    } catch (cause) {
      setError(mensajeError(cause, 'No se pudo registrar la postventa.'));
    } finally {
      setBusy(false);
    }
  }

  async function openEvidence(document: GuiaDespachoDocumento) {
    const { data, error: signedError } = await supabase.storage
      .from('administracion')
      .createSignedUrl(document.archivo_path, 60);
    if (signedError) setError(mensajeError(signedError));
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function confirmManualDelivery() {
    if (manualReason.trim().length < 8 || !currentUser) {
      setError('Explica el motivo de la entrega manual con al menos ocho caracteres.');
      return;
    }
    if (exceptions.some((entry) => entry.tipo === 'entrega_manual' && entry.estado === 'pendiente')) {
      setError('Ya existe una solicitud de entrega manual pendiente.');
      return;
    }
    const { error: requestError } = await supabase.from('operacion_excepciones').insert({
      tipo: 'entrega_manual',
      oportunidad_id: id,
      motivo: manualReason.trim(),
      solicitado_por: currentUser.id,
    });
    if (requestError) setError(mensajeError(requestError));
    else {
      setManualReason('');
      await logOperation('Confirmación manual de entrega solicitada a administración.');
      await loadData();
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-ink-muted">
        Cargando Ficha Maestra de Venta...
      </div>
    );
  }

  if (!op) {
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

  const total = totalComercial(op, quotes);
  const abonado = totalAbonado(op);
  const saldo = saldoPendiente(op, quotes);
  const stageIndex = getStageIndex(op.estado_pipeline);
  const stageTone = getStageTone(op.estado_pipeline);
  const asignadoUser = (usersList as Usuario[])?.find((u) => u.id === op.asignado_a);
  const gestorObraUser = (usersList as Usuario[])?.find((u) => u.id === op.responsable_operativo_id);
  const nombreGestorObra = gestorObraUser?.nombre || 'Edith Tapia (Jefa de Patio & Logística)';

  const unassignedClientQuotes = clientQuotes.filter((c) => !c.oportunidad_id || c.oportunidad_id !== op.id);
  const abonosList = (op.comprobantes_pago || []).filter(
    (item) => typeof item === 'object' && item !== null && 'monto' in item
  );
  const abonosPendientes = abonosList
    .filter((item) => item.estado === 'pendiente')
    .reduce((sum, p) => sum + Number(p.monto || 0), 0);

  const checklistItems = [
    { label: 'Cotización vigente', ready: total > 0 },
    { label: 'Dirección de obra', ready: Boolean(op.direccion_obra || op.direccion) },
    { label: 'Fecha prometida', ready: Boolean(op.fecha_prometida || op.fecha_limite) },
    { label: 'Forma de entrega', ready: Boolean(op.forma_entrega) },
    { label: 'Abastecimiento', ready: Boolean(op.abastecimiento) },
    { label: 'Condición de pago', ready: Boolean(op.condicion_pago) },
  ];

  const tabItems = [
    ...(canSeeFinance
      ? [
          { id: 'resumen', label: '1. Resumen & Bitácora', count: actividades.length },
          { id: 'cotizaciones', label: '2. Cotizaciones & Pagos', count: quotes.length },
          { id: 'abastecimiento', label: '3. Abastecimiento & OC', count: ordenesCompra.length },
        ]
      : []),
    {
      id: 'operacion',
      label: canSeeFinance ? '4. Producción, Despachos & Guías' : 'Producción, Despachos & Guías',
      count: guides.length,
    },
  ];

  return (
    <div className="space-y-5 text-ink">
      {/* Encabezado Principal */}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <CodeStamp>{op.codigo}</CodeStamp>
            <span className="truncate">{op.titulo}</span>
            <StatusBadge tone={stageTone}>{STAGE_LABELS[op.estado_pipeline] || op.estado_pipeline}</StatusBadge>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
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
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canSeeFinance && (
              <Link href={`/ventas?oportunidad=${op.id}`}>
                <Button variant="primary" size="sm" className="flex items-center gap-1.5">
                  <ArrowLeft size={14} aria-hidden />
                  <span>Volver a la Oportunidad (Actividad y Seguimiento)</span>
                </Button>
              </Link>
            )}
            <Link href={`/calendarios/general?opId=${op.id}`}>
              <Button variant="secondary" size="sm">
                <Calendar size={14} aria-hidden />
                Calendario operativo
              </Button>
            </Link>
            {canSeeFinance && (
              <Link href="/ventas">
                <Button variant="secondary" size="sm">
                  <span>Pipeline</span>
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger font-medium">
          {error}
        </div>
      )}

      {['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline) && !delivered && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning-ink font-medium">
          Esta venta figura como entregada en el historial, pero no tiene acreditación completa bajo las reglas actuales. Revisa las guías en la pestaña de Producción y Despachos o solicita una excepción administrativa.
        </div>
      )}

      {/* Riel de Obra Superior */}
      <Panel className="p-4">
        <StageRail current={stageIndex} stages={PIPELINE_STAGES} size="lg" />
      </Panel>

      {/* Resumen Financiero y Operativo Superior */}
      {canSeeFinance && (
        <Panel className="p-3.5">
          <SummaryLine
            items={[
              { label: 'Total comercial', value: money(total), tone: 'neutral' },
              { label: 'Abonado validado', value: money(abonado), tone: 'success' },
              { label: 'Saldo por pagar', value: money(saldo), tone: saldo > 0 ? 'warning' : 'neutral' },
              {
                label: 'Entrega',
                value: deliveryAccredited ? 'Acreditada' : 'Pendiente',
                tone: deliveryAccredited ? 'success' : 'warning',
              },
              { label: 'Compras OC', value: money(purchaseCost), tone: 'neutral' },
              ...(margen?.margen_bruto_real != null
                ? [{ label: 'Margen est.', value: money(margen.margen_bruto_real), tone: 'accent' as const }]
                : []),
            ]}
          />
        </Panel>
      )}

      {/* Navegación por Pestañas de la Ficha Maestra */}
      <Tabs
        items={tabItems}
        active={activeTab}
        onChange={handleTabChange}
        label="Secciones de la Ficha Maestra de Venta"
      />

      {/* =====================================================================
          PESTAÑA 1: RESUMEN & BITÁCORA
         ===================================================================== */}
      {activeTab === 'resumen' && canSeeFinance && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Columna Principal (8 columnas) */}
          <div className="space-y-6 lg:col-span-8">
            {/* Ficha del Cliente y Datos Comerciales Editables */}
            <Panel title="Datos Comerciales y Cliente" className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="t-micro text-ink-muted block">Cliente</span>
                  <div className="font-semibold text-ink mt-0.5">
                    {op.cliente ? (
                      <Link href={`/clientes/${op.cliente.id}`} className="text-accent-ink hover:underline">
                        {op.cliente.nombre}
                      </Link>
                    ) : (
                      'Sin cliente asignado'
                    )}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <label className="space-y-1">
                    <span className="text-ink-muted block">Tipo de venta</span>
                    <select
                      value={op.tipo_venta || 'Instalación'}
                      onChange={(e) => void handleUpdateField('tipo_venta', e.target.value, `Tipo de venta actualizado a "${e.target.value}".`)}
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-semibold text-ink"
                    >
                      <option value="Instalación">Instalación</option>
                      <option value="Suministro">Suministro</option>
                      <option value="Reventa de Material">Reventa de Material</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-ink-muted block">Modalidad</span>
                    <select
                      value={op.modalidad_requerimiento || 'instalacion'}
                      onChange={(e) => void handleUpdateField('modalidad_requerimiento', e.target.value, `Modalidad actualizada a "${e.target.value}".`)}
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-semibold text-ink"
                    >
                      <option value="instalacion">Material + Instalación</option>
                      <option value="solo_material">Sólo material</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-ink-muted block">Prioridad</span>
                    <select
                      value={op.prioridad || 'normal'}
                      onChange={(e) => void handleUpdateField('prioridad', e.target.value, `Prioridad cambiada a "${e.target.value}".`)}
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-semibold text-ink"
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-ink-muted block">Ejecutivo comercial</span>
                    <select
                      value={op.asignado_a || ''}
                      onChange={(e) => void handleUpdateField('asignado_a', e.target.value || null, 'Ejecutivo comercial actualizado.')}
                      className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-semibold text-ink"
                    >
                      <option value="">Sin asignar</option>
                      {(usersList as Usuario[]).map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="border-t border-line-subtle pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <label className="sm:col-span-2 space-y-1">
                  <span className="t-micro text-ink-muted block">Dirección de obra / despacho</span>
                  <input
                    type="text"
                    defaultValue={op.direccion_obra || op.direccion || ''}
                    placeholder="Ingresa dirección de obra o despacho"
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (op.direccion_obra || '')) {
                        void handleUpdateField('direccion_obra', val || null, 'Dirección de obra actualizada.');
                      }
                    }}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink font-medium"
                  />
                </label>

                <label className="space-y-1">
                  <span className="t-micro text-ink-muted block">Fecha prometida / límite</span>
                  <input
                    type="date"
                    value={op.fecha_prometida || op.fecha_limite || ''}
                    onChange={(e) => void handleUpdateField('fecha_prometida', e.target.value || null, `Fecha prometida actualizada a ${e.target.value}.`)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink t-num"
                  />
                </label>
              </div>
            </Panel>

            {/* Checklist de Cierre Comercial y Paso a Operación */}
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <ClipboardCheck size={15} className="text-accent-ink" />
                  <span>Checklist de Cierre Comercial y Paso a Operación</span>
                </span>
              }
              actions={
                <StatusBadge tone={checklistItems.every((i) => i.ready) ? 'success' : 'warning'}>
                  {checklistItems.filter((i) => i.ready).length} / {checklistItems.length} listos
                </StatusBadge>
              }
              className="p-4 space-y-4"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {checklistItems.map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-md border px-3 py-2 flex items-center justify-between ${
                      item.ready
                        ? 'border-success/30 bg-success-soft text-success-ink'
                        : 'border-line bg-surface-muted/40 text-ink-muted'
                    }`}
                  >
                    <span className="font-semibold">{item.label}</span>
                    <span>{item.ready ? '✓' : 'Pend.'}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-line-subtle text-xs">
                <label className="space-y-1">
                  <span className="text-ink-muted font-medium block">Abastecimiento</span>
                  <select
                    value={op.abastecimiento || ''}
                    onChange={(e) => void handleUpdateField('abastecimiento', e.target.value || null, `Abastecimiento definido: ${e.target.value}.`)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink font-semibold"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="fabricar">Fabricar (Planta Hormiglass)</option>
                    <option value="compra_proveedor">Compra a proveedor (Reventa)</option>
                    <option value="stock">Stock disponible en patio</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-ink-muted font-medium block">Forma de entrega</span>
                  <select
                    value={op.forma_entrega || ''}
                    onChange={(e) => void handleUpdateField('forma_entrega', e.target.value || null, `Forma de entrega definida: ${e.target.value}.`)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink font-semibold"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="despacho">Despacho a obra</option>
                    <option value="retiro_cliente">Retiro en planta por cliente</option>
                    <option value="instalacion_obra">Instalación en obra</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-ink-muted font-medium block">Condición de pago</span>
                  <select
                    value={op.condicion_pago || ''}
                    onChange={(e) => void handleUpdateField('condicion_pago', e.target.value || null, `Condición de pago: ${e.target.value}.`)}
                    className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-ink font-semibold"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="contado">Contado (100% anticipado)</option>
                    <option value="50_50">50% Anticipo / 50% Contra entrega</option>
                    <option value="credito_30">Crédito 30 días / OC</option>
                    <option value="estados_pago">Estados de pago (Obra)</option>
                  </select>
                </label>
              </div>
            </Panel>

            {/* Antecedentes y Archivos Adjuntos */}
            <Panel
              title={`Documentos y Antecedentes (${antecedentes.length})`}
              actions={
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
              }
              className="p-4 space-y-3"
            >
              {antecedentes.length === 0 ? (
                <EmptyState
                  icon={Paperclip}
                  title="Sin antecedentes adjuntos"
                  description="Adjunta contratos firmados, órdenes de compra del cliente, planos o especificaciones técnicas."
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
                <StatusBadge tone={stageTone}>{STAGE_LABELS[op.estado_pipeline] || op.estado_pipeline}</StatusBadge>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-line-subtle">
                <span className="t-micro text-ink-muted block">Mover a otra etapa:</span>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {(
                    [
                      'nueva',
                      'pagada',
                      'entregada',
                      'prod_cola',
                      'prod_fabricacion',
                      'prod_finalizado',
                      'rev_coordinacion',
                      'rev_entregado',
                    ] as EstadoPipeline[]
                  ).map((stage) => (
                    <button
                      key={stage}
                      onClick={() => void handleCambiarEtapa(stage)}
                      disabled={op.estado_pipeline === stage}
                      className={`rounded-md border px-2.5 py-1.5 font-semibold text-left transition ${
                        op.estado_pipeline === stage
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-line bg-surface text-ink hover:bg-surface-muted'
                      }`}
                    >
                      {STAGE_LABELS[stage] || stage}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-line-subtle">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => handleTabChange('operacion')}
                >
                  <Truck size={14} aria-hidden />
                  Ir a Producción, Despachos & Guías
                </Button>
              </div>
            </Panel>

            {/* Panel de Comisión Comercial */}
            <Panel
              title={
                <span className="flex items-center gap-1.5">
                  <Coins size={15} className="text-accent-ink" />
                  <span>Comisión Comercial</span>
                </span>
              }
              actions={
                <StatusBadge
                  tone={
                    op.comision_estado === 'pagada'
                      ? 'success'
                      : op.comision_estado === 'lista_para_pago'
                      ? 'accent'
                      : 'warning'
                  }
                >
                  {op.comision_estado === 'pagada'
                    ? 'Pagada'
                    : op.comision_estado === 'lista_para_pago'
                    ? 'Lista para pago'
                    : 'Pendiente'}
                </StatusBadge>
              }
              className="p-4 space-y-3"
            >
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Ejecutivo acreedor:</span>
                  <span className="font-semibold text-ink">{asignadoUser?.nombre || 'Sin asignar'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Gestor de obra en patio:</span>
                  <span className="font-semibold text-ink">{nombreGestorObra}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-line-subtle">
                  <span className="text-ink-muted">Porcentaje pactado:</span>
                  <span className="t-num font-semibold text-ink">{op.comision_porcentaje || 3}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Monto comisión:</span>
                  <span className="t-num font-bold text-accent-ink">
                    {money(op.comision_monto || Math.round((op.monto_estimado || 0) * ((op.comision_porcentaje || 3) / 100)))}
                  </span>
                </div>

                {op.comision_estado === 'lista_para_pago' &&
                  (currentUser?.rol === 'admin' || currentUser?.rol === 'finanzas') && (
                    <div className="pt-2 border-t border-line-subtle">
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full justify-center"
                        onClick={() => void handleLiquidarComision()}
                        disabled={liquidandoComision}
                      >
                        <Coins size={14} className="mr-1" />
                        {liquidandoComision ? 'Liquidando...' : 'Liquidar y marcar pagada'}
                      </Button>
                    </div>
                  )}

                {op.comision_estado === 'pagada' && (
                  <div className="pt-1.5 border-t border-line-subtle text-success text-[11px] font-semibold flex items-center gap-1">
                    ✓ Comisión liquidada por Finanzas
                  </div>
                )}

                {op.comision_estado === 'pendiente' && (
                  <div className="text-[11px] text-ink-subtle">
                    Pasa automáticamente a &quot;Lista para pago&quot; cuando la venta esté cerrada y 100% pagada.
                  </div>
                )}
              </div>
            </Panel>

            {/* Actividades y Bitácora */}
            <Panel title="Actividades y Notas" className="p-4 space-y-3">
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
      )}

      {/* =====================================================================
          PESTAÑA 2: COTIZACIONES & PAGOS
         ===================================================================== */}
      {activeTab === 'cotizaciones' && canSeeFinance && (
        <div className="space-y-6">
          {/* Cotizaciones Asociadas y Partidas */}
          <Panel
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>Cotizaciones y Partidas ({quotes.length})</span>
                {quoteVigente && (
                  <StatusBadge tone="success">
                    Vigente: {quoteVigente.numero_cotizacion} (v{quoteVigente.version || 1})
                  </StatusBadge>
                )}
              </span>
            }
            actions={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditCotId(undefined);
                  setShowCotModal(true);
                }}
              >
                <FilePlus size={14} aria-hidden />
                Crear Nueva Cotización
              </Button>
            }
            className="p-4 space-y-4"
          >
            {/* Selector para vincular cotización existente del cliente */}
            {unassignedClientQuotes.length > 0 && (
              <div className="rounded-lg border border-line bg-surface-muted/50 p-3 flex flex-col sm:flex-row items-center gap-2.5 text-xs">
                <select
                  value={selectedCandidateCotId}
                  onChange={(e) => setSelectedCandidateCotId(e.target.value)}
                  className="flex-1 rounded-md border border-line bg-surface px-3 py-2 font-semibold text-ink"
                >
                  <option value="">-- Vincular cotización existente del cliente ({unassignedClientQuotes.length}) --</option>
                  {unassignedClientQuotes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_cotizacion} (v{c.version || 1}) — {money(c.monto_total)} ({c.estado})
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedCandidateCotId || busy}
                  onClick={() => void handleLinkExistingQuote()}
                >
                  Vincular a esta venta
                </Button>
              </div>
            )}

            {quotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Sin cotizaciones asociadas"
                description="Crea una nueva cotización desde aquí o vincula una existente del cliente."
              />
            ) : (
              <div className="space-y-4">
                {/* Desglose de Ítems de la Cotización Vigente */}
                {quoteVigente?.items && quoteVigente.items.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-muted text-ink-muted border-b border-line">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Producto / Partida</th>
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
                  <span className="t-micro text-ink-muted block mb-2">Versiones vinculadas a esta oportunidad</span>
                  <div className="space-y-2">
                    {quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-subtle bg-surface-muted/30 p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CodeStamp>{q.numero_cotizacion}</CodeStamp>
                          <span className="text-ink-muted">v{q.version || 1}</span>
                          <select
                            aria-label={`Estado de cotización ${q.numero_cotizacion}`}
                            value={q.estado}
                            onChange={(e) => void handleQuoteStatusChange(q, e.target.value as EstadoCotizacion)}
                            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink"
                          >
                            <option value="borrador">Borrador</option>
                            <option value="enviada">Enviada</option>
                            <option value="aprobada">Aprobada</option>
                            <option value="rechazada">Rechazada</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="t-num font-semibold text-ink">{money(q.monto_total)}</span>
                          <button
                            type="button"
                            onClick={() => setPreviewCot(q)}
                            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-muted inline-flex items-center gap-1"
                          >
                            <Eye size={12} />
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditCotId(q.id);
                              setShowCotModal(true);
                            }}
                            className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink hover:bg-surface-muted"
                          >
                            Editar / Nueva versión
                          </button>
                          <Link
                            href={`/cotizaciones/${q.id}`}
                            className="text-accent-ink hover:underline font-semibold flex items-center gap-0.5"
                          >
                            <span>Detalle</span>
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

          {/* Pagos, Abonos y Validación en Caja */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <DollarSign size={15} className="text-accent-ink" />
                <span>Abonos, Pagos y Comprobantes ({abonosList.length})</span>
              </span>
            }
            actions={
              abonosPendientes > 0 ? (
                <StatusBadge tone="warning">
                  Pendiente validación en Caja: {money(abonosPendientes)}
                </StatusBadge>
              ) : undefined
            }
            className="p-4 space-y-4"
          >
            {abonoErrorMsg && (
              <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-3 text-xs font-semibold text-danger">
                {abonoErrorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 rounded-lg border border-line bg-surface-muted/40 p-3.5 text-xs">
              <div>
                <label className="font-semibold text-ink-muted block mb-1">Monto Abono ($ CLP) *</label>
                <input
                  type="text"
                  placeholder="500.000"
                  value={nuevoAbonoMonto ? Number(nuevoAbonoMonto).toLocaleString('es-CL') : ''}
                  onChange={(e) => {
                    setNuevoAbonoMonto(e.target.value.replace(/\D/g, ''));
                    setAbonoErrorMsg('');
                  }}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 font-bold text-ink"
                />
              </div>

              <div>
                <label className="font-semibold text-ink-muted block mb-1">Comprobante de Pago *</label>
                <label className="w-full rounded-md border border-line bg-surface px-3 py-2 font-semibold text-ink cursor-pointer flex items-center justify-between hover:bg-surface-muted truncate">
                  <span className="truncate">{nuevoAbonoFileName || 'Subir archivo...'}</span>
                  <Paperclip size={13} className="text-accent-ink shrink-0 ml-1" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNuevoAbonoFile(file);
                        setNuevoAbonoFileName(file.name);
                        setAbonoErrorMsg('');
                      }
                    }}
                  />
                </label>
              </div>

              <div>
                <label className="font-semibold text-ink-muted block mb-1">Nota / Referencia</label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia #9842"
                  value={nuevoAbonoNota}
                  onChange={(e) => setNuevoAbonoNota(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-ink"
                />
              </div>

              <div className="flex items-end">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                  disabled={abonoSaving}
                  onClick={() => void handleRegistrarAbono()}
                >
                  <Plus size={14} aria-hidden />
                  {abonoSaving ? 'Guardando...' : 'Registrar Abono'}
                </Button>
              </div>
            </div>

            {abonosList.length === 0 ? (
              <p className="text-xs text-ink-muted">No hay abonos registrados para esta venta.</p>
            ) : (
              <div className="space-y-2">
                {abonosList.map((ab, idx) => (
                  <div
                    key={ab.id || idx}
                    className="rounded-lg border border-line bg-surface p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-success text-sm">{money(Number(ab.monto || 0))}</span>
                      <span className="font-semibold text-ink">— {ab.nota || 'Abono'}</span>
                      {(!ab.estado || ab.estado === 'validado') && (
                        <StatusBadge tone="success">
                          <CheckCircle2 size={11} className="mr-1 inline" />
                          Validado en Caja {ab.banco_alias ? `(${ab.banco_alias})` : ''}
                        </StatusBadge>
                      )}
                      {ab.estado === 'pendiente' && (
                        <StatusBadge tone="warning">
                          <Clock size={11} className="mr-1 inline" />
                          Pendiente de validación en Caja
                        </StatusBadge>
                      )}
                      {ab.estado === 'rechazado' && (
                        <StatusBadge tone="danger">
                          <XCircle size={11} className="mr-1 inline" />
                          Rechazado: {ab.motivo_rechazo || 'Comprobante no válido'}
                        </StatusBadge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-muted">{ab.fecha}</span>
                      {ab.comprobante_url && (
                        <button
                          type="button"
                          onClick={() => void abrirComprobanteAbono(ab.comprobante_url!)}
                          className="text-accent-ink hover:underline font-semibold"
                        >
                          Ver comprobante
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* Cobranza y Matriz de Margen por NV */}
          <Panel title="Cobranza y Matriz de Margen Operacional (NV)" className="p-4 space-y-4 text-sm">
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
                onClick={() => void saveDueDate()}
                className="rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                Guardar vencimiento
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              {!delivered
                ? 'Cobranza suspendida: acredita la entrega en la pestaña Producción, Despachos & Guías antes de fijar un vencimiento.'
                : op.fecha_vencimiento_cobro
                ? `Vence el ${op.fecha_vencimiento_cobro}`
                : 'Sin vencimiento definido; el saldo no se considera vencido.'}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-line-subtle text-xs">
              <div className="rounded-md border border-line bg-surface-muted/40 p-3">
                <span className="t-micro text-ink-muted block">Venta neta / comercial</span>
                <strong className="t-num text-sm font-bold text-ink mt-0.5 block">{money(revenue)}</strong>
              </div>
              <div className="rounded-md border border-line bg-surface-muted/40 p-3">
                <span className="t-micro text-ink-muted block">Compras OC asignadas</span>
                <strong className="t-num text-sm font-bold text-ink mt-0.5 block">
                  {money(margen?.costo_compras_asignadas ?? purchaseCost)}
                </strong>
              </div>
              <div className="rounded-md border border-line bg-surface-muted/40 p-3">
                <span className="t-micro text-ink-muted block">Fletes y traslados</span>
                <strong className="t-num text-sm font-bold text-ink mt-0.5 block">
                  {money(margen?.costo_fletes_despacho ?? dispatchCost)}
                </strong>
              </div>
              <div className="rounded-md border border-line bg-surface-muted/40 p-3">
                <span className="t-micro text-ink-muted block">Margen estimado</span>
                <strong className="t-num text-sm font-bold text-accent-ink mt-0.5 block">
                  {money(margen?.margen_bruto_proyectado ?? estimatedMargin)}
                </strong>
                <span className="t-micro text-ink-muted">
                  {costIncomplete ? 'Incluye fletes estimados' : 'Fletes confirmados'}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: ABASTECIMIENTO & OC
         ===================================================================== */}
      {activeTab === 'abastecimiento' && canSeeFinance && (
        <div className="space-y-6">
          {/* Órdenes de Compra Vinculadas */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ShoppingCart size={15} className="text-accent-ink" />
                <span>Órdenes de Compra Asignadas ({ordenesCompra.length})</span>
              </span>
            }
            actions={
              <Button variant="primary" size="sm" onClick={() => setShowOcModal(true)}>
                <Plus size={14} aria-hidden />
                Nueva Orden de Compra
              </Button>
            }
            className="p-4 space-y-4"
          >
            {ordenesCompra.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Sin órdenes de compra vinculadas"
                description="Crea una Orden de Compra para materiales o reventa asignada directamente a esta Nota de Venta."
              />
            ) : (
              <div className="space-y-3">
                {ordenesCompra.map((oc) => {
                  const asignadoEstaVenta = (oc.asignaciones || []).reduce(
                    (sum, a) => sum + Number(a.costo_asignado || 0),
                    0
                  );
                  return (
                    <div
                      key={oc.id}
                      className="rounded-lg border border-line bg-surface p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CodeStamp>{oc.numero_oc}</CodeStamp>
                          <span className="font-semibold text-ink">
                            {oc.proveedor?.nombre || 'Proveedor'}
                          </span>
                          <StatusBadge
                            tone={
                              oc.estado === 'recibida' || oc.estado === 'pagada'
                                ? 'success'
                                : oc.estado === 'cancelada'
                                ? 'danger'
                                : 'accent'
                            }
                          >
                            {oc.estado}
                          </StatusBadge>
                          <StatusBadge tone={oc.fecha_pago ? 'success' : 'warning'}>
                            {oc.fecha_pago ? 'Pagada' : 'Pendiente pago'}
                          </StatusBadge>
                        </div>
                        <p className="text-ink-muted">
                          Emisión: {oc.fecha_emision}
                          {asignadoEstaVenta > 0 ? ` · Costo asignado a esta NV: ${money(asignadoEstaVenta)}` : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <strong className="t-num text-sm font-bold text-ink">{money(oc.monto_total)}</strong>
                        <button
                          type="button"
                          onClick={() => setPreviewOc(oc)}
                          className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-muted inline-flex items-center gap-1"
                        >
                          <Eye size={12} />
                          Ver PDF
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Visitas a Terreno y Eventos de Calendario */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Calendar size={15} className="text-accent-ink" />
                <span>Visitas a Terreno y Agenda Operativa ({visitas.length + eventosCalendario.length})</span>
              </span>
            }
            actions={
              <Link href={`/calendarios/general?opId=${op.id}`}>
                <Button variant="secondary" size="sm">
                  Agendar en Calendario Maestro
                </Button>
              </Link>
            }
            className="p-4 space-y-3"
          >
            {visitas.length === 0 && eventosCalendario.length === 0 ? (
              <p className="text-xs text-ink-muted">
                No hay visitas a terreno ni eventos logísticos programados para esta oportunidad.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                {visitas.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-lg border border-line-subtle bg-surface-muted/30 p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-ink">Visita a terreno: {v.tecnico_visita}</span>
                      <span className="block text-ink-muted">
                        {v.fecha_visita_terreno} {v.hora_visita_terreno ? `· ${v.hora_visita_terreno}` : ''} {v.observaciones_visita ? `· ${v.observaciones_visita}` : ''}
                      </span>
                    </div>
                    <StatusBadge tone={v.estado_visita === 'realizada' ? 'success' : v.estado_visita === 'cancelada' ? 'danger' : 'accent'}>
                      {v.estado_visita || 'programada'}
                    </StatusBadge>
                  </div>
                ))}
                {eventosCalendario.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-lg border border-line-subtle bg-surface-muted/30 p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-ink">{ev.titulo}</span>
                      <span className="block text-ink-muted">
                        {String(ev.fecha_inicio).slice(0, 10)} · Tipo: {ev.tipo_evento} · Vehículo: {ev.recurso_vehiculo || 'No aplica'}
                      </span>
                    </div>
                    <StatusBadge tone={ev.estado === 'completado' ? 'success' : ev.estado === 'cancelado' ? 'danger' : 'warning'}>
                      {ev.estado}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: PRODUCCIÓN, DESPACHOS & GUÍAS
         ===================================================================== */}
      {activeTab === 'operacion' && (
        <div className="space-y-6">
          {/* Ruta operativa de 5 pasos */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Ruta operativa de la venta">
            {operationalSteps.map((step, index) => (
              <div
                key={step.label}
                className={`rounded-lg border p-3 text-xs ${
                  step.complete
                    ? 'bg-success-soft border-success/30 text-success-ink'
                    : 'bg-surface border-line text-ink-muted'
                }`}
              >
                <span className="block font-semibold text-ink">
                  {index + 1}. {step.label}
                </span>
                <span className="t-micro">{step.complete ? 'Completado' : 'Pendiente'}</span>
              </div>
            ))}
          </div>

          {/* Indicadores rápidos de operación */}
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
                <strong className="block t-num text-ink text-base mt-1 font-semibold">{money(saldo)}</strong>
              </Panel>
            )}
            <Panel className="p-3.5">
              <span className="t-micro text-ink-muted">Guías emitidas</span>
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

          {/* Orden de Producción y Registro Diario */}
          <Panel title="Orden de producción y bitácora de planta" className="p-4 space-y-3">
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
                onClick={() => void createProductionOrder()}
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
                      const { error: statusError } = await supabase
                        .from('ordenes_produccion')
                        .update({ estado: e.target.value })
                        .eq('id', order.id);
                      if (statusError) setError(mensajeError(statusError));
                      else await loadData();
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
                  {order.items
                    ?.map(
                      (item) =>
                        `${item.producto}: ${daily
                          .filter(
                            (row) =>
                              row.orden_produccion_id === order.id &&
                              row.cotizacion_item_id === item.cotizacion_item_id
                          )
                          .reduce((sum, row) => sum + Number(row.cantidad_producida), 0)} / ${item.cantidad_objetivo}`
                    )
                    .join(' · ')}
                </p>
              </div>
            ))}

            {orders.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-line-subtle pt-3">
                <select
                  aria-label="Orden de producción"
                  value={productionOrderId}
                  onChange={(e) => {
                    setProductionOrderId(e.target.value);
                    setProductionItemId('');
                  }}
                  className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
                >
                  <option value="">Orden</option>
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Producto producido"
                  value={productionItemId}
                  onChange={(e) => setProductionItemId(e.target.value)}
                  className="rounded-md border border-line bg-surface p-2 text-sm text-ink"
                >
                  <option value="">Producto</option>
                  {orders
                    .find((order) => order.id === productionOrderId)
                    ?.items?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.producto}
                      </option>
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
                <Button disabled={busy} onClick={() => void registerProduction()} variant="secondary" size="sm">
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

          {/* Nueva Guía de Despacho */}
          <Panel title="Nueva guía de despacho" className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <input
                aria-label="Número de guía"
                placeholder="Folio de guía"
                value={guideNumber}
                onChange={(e) => setGuideNumber(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Fecha de salida"
                type="datetime-local"
                value={guideDate}
                onChange={(e) => setGuideDate(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Vehículo"
                placeholder="Vehículo"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Origen"
                placeholder="Origen"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Destino"
                placeholder="Destino"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Chofer"
                placeholder="Chofer"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <select
                aria-label="Tipo de transporte"
                value={transportType}
                onChange={(e) => setTransportType(e.target.value as typeof transportType)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              >
                <option value="propio">Transporte propio</option>
                <option value="externo">Transporte externo</option>
                <option value="retiro_cliente">Retiro por cliente</option>
              </select>
              <input
                aria-label="Costo estimado del traslado"
                type="number"
                min="0"
                step="1"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
            </div>

            {quoteItems.map((item) => (
              <label
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm border-t border-line-subtle pt-2 text-ink"
              >
                <span>
                  {item.producto} · por planificar {Math.max(0, Number(item.cantidad) - allCommitted(item.id))} · por
                  entregar {Math.max(0, Number(item.cantidad) - allReceived(item.id))}
                </span>
                <input
                  aria-label={`Cantidad de ${item.producto}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Cantidad"
                  value={guideQuantities[item.id || ''] || ''}
                  onChange={(e) => setGuideQuantities({ ...guideQuantities, [item.id || '']: e.target.value })}
                  className="w-32 rounded-md border border-line bg-surface p-2 text-ink"
                />
              </label>
            ))}

            <button
              disabled={busy || !quoteItems.length}
              onClick={() => void createGuide()}
              className="hg-button-primary rounded-md px-3 py-2 text-sm disabled:opacity-50"
            >
              Crear guía parcial
            </button>
          </Panel>

          {/* Listado de Guías y Evidencias */}
          <Panel title="Guías y evidencias" className="p-4 space-y-3">
            {guides.map((guide) => (
              <div key={guide.id} className="rounded-lg border border-line bg-surface p-4 space-y-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CodeStamp>{guide.numero_guia}</CodeStamp>
                    <StatusBadge
                      tone={
                        guide.estado === 'entregada'
                          ? 'success'
                          : guide.estado === 'cancelada'
                          ? 'danger'
                          : 'neutral'
                      }
                    >
                      {guide.estado}
                    </StatusBadge>
                  </div>
                  <span className="text-ink-muted">
                    {guide.vehiculo || 'Sin vehículo'} · {guide.chofer || 'Sin chofer'}
                  </span>
                </div>

                {guide.estado === 'entregada' && !guideHasEvidence(guide) && (
                  <p role="alert" className="rounded-md border border-warning/30 bg-warning-soft p-2 text-warning-ink">
                    Cierre histórico sin firma ni excepción aprobada. Esta guía no acredita la entrega; adjunta solo un
                    respaldo auténtico o solicita revisión administrativa.
                  </p>
                )}

                <p className="text-ink-muted">
                  {guide.origen || 'Origen pendiente'} → {guide.destino || 'Destino pendiente'}
                </p>
                <p className="t-caption text-ink-muted">
                  {guide.tipo_transporte || 'propio'} · costo estimado {money(guide.costo_estimado || 0)} · costo real{' '}
                  {guide.costo_real_confirmado ? money(guide.costo_real || 0) : 'Sin confirmar'} · recibió{' '}
                  {guide.recibido_por || 'pendiente'}
                </p>

                <div className="flex flex-wrap gap-2 items-center">
                  <Link
                    href={`/ventas/${id}/operacion/guias/${guide.id}`}
                    className="text-accent-ink hover:underline font-semibold text-xs"
                  >
                    Ver e imprimir orden interna
                  </Link>
                  <input
                    aria-label={`Costo real de ${guide.numero_guia}`}
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={guide.costo_real || 0}
                    onBlur={(e) => void updateGuideCost(guide.id, e.target.value)}
                    className="w-36 rounded-md border border-line bg-surface p-1 text-ink"
                  />
                  <input
                    aria-label={`Recibido por en ${guide.numero_guia}`}
                    placeholder="Nombre de quien recibe"
                    value={receivedBy[guide.id] ?? guide.recibido_por ?? ''}
                    disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                    onChange={(e) => setReceivedBy({ ...receivedBy, [guide.id]: e.target.value })}
                    className="rounded-md border border-line bg-surface p-1 text-ink disabled:opacity-50"
                  />
                </div>

                {(guide.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center border-t border-line-subtle pt-2 text-ink"
                  >
                    <span>
                      {item.producto} · plan {item.cantidad_planificada}
                    </span>
                    <label className="text-ink-muted">
                      Cargado{' '}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.cantidad_cargada}
                        disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                        onBlur={(e) => void updateGuideItem(item.id, 'cantidad_cargada', e.target.value)}
                        className="w-24 rounded-md border border-line bg-surface p-1 ml-1 text-ink disabled:opacity-50"
                      />
                    </label>
                    <label className="text-ink-muted">
                      Recibido{' '}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.cantidad_recibida}
                        disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                        onBlur={(e) => void updateGuideItem(item.id, 'cantidad_recibida', e.target.value)}
                        className="w-24 rounded-md border border-line bg-surface p-1 ml-1 text-ink disabled:opacity-50"
                      />
                    </label>
                  </div>
                ))}

                <p className="t-caption text-ink-muted">
                  Diferencia total:{' '}
                  {(guide.items || [])
                    .reduce((sum, item) => sum + Number(item.cantidad_planificada) - Number(item.cantidad_recibida), 0)
                    .toLocaleString('es-CL')}
                </p>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                    onClick={async () => {
                      const { error: e } = await supabase
                        .from('guias_despacho')
                        .update({
                          carga_verificada: true,
                          carga_verificada_por: currentUser?.id || null,
                          carga_verificada_at: new Date().toISOString(),
                          estado: 'cargada',
                        })
                        .eq('id', guide.id);
                      if (e) setError(mensajeError(e));
                      else await loadData();
                    }}
                  >
                    Verificar carga
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={guide.estado === 'entregada' || guide.estado === 'cancelada'}
                    onClick={() => void updateGuide(guide, 'entregada')}
                  >
                    Confirmar entrega
                  </Button>
                  {guide.estado === 'entregada' && !guideHasEvidence(guide) && (
                    <button
                      onClick={() => void requestException('firma_entrega', { guia_despacho_id: guide.id })}
                      className="rounded-md border border-warning/30 bg-warning-soft px-3 py-1.5 font-semibold text-warning-ink text-xs"
                    >
                      Solicitar excepción de firma
                    </button>
                  )}
                  {guide.estado !== 'cancelada' && (
                    <label className="rounded-md border border-line bg-surface px-3 py-1.5 cursor-pointer text-xs font-semibold text-ink hover:bg-surface-muted">
                      Adjuntar respaldo firmado auténtico
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadEvidence(guide, file, 'firma');
                        }}
                      />
                    </label>
                  )}
                  {(guide.documentos || []).map((document) => (
                    <button
                      key={document.id}
                      onClick={() => void openEvidence(document)}
                      className="text-accent-ink underline text-xs font-semibold"
                    >
                      {document.nombre}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {guides.length === 0 && <p className="text-sm text-ink-muted">Aún no hay guías.</p>}
          </Panel>

          {/* Excepciones y aprobaciones */}
          <Panel title="Excepciones y aprobaciones" className="p-4 space-y-2 text-sm">
            {exceptions.map((entry) => (
              <div
                key={entry.id}
                className="border-t border-line-subtle pt-2 flex flex-wrap gap-2 items-center justify-between text-ink"
              >
                <span>
                  <strong>{entry.tipo.replaceAll('_', ' ')}</strong> · {entry.estado} · {entry.motivo}
                  {entry.cantidad_excedente ? ` · excedente ${entry.cantidad_excedente}` : ''}
                </span>
                {entry.estado === 'pendiente' && currentUser?.rol === 'admin' && (
                  <span className="flex gap-2">
                    <button
                      onClick={() => void resolveException(entry, 'aprobada')}
                      className="rounded border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-semibold text-success"
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => void resolveException(entry, 'rechazada')}
                      className="rounded border border-danger/30 bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger"
                    >
                      Rechazar
                    </button>
                  </span>
                )}
              </div>
            ))}
            {!exceptions.length && <p className="text-ink-muted">No hay excepciones solicitadas.</p>}
          </Panel>

          {/* Postventa */}
          <Panel title="Postventa" className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <select
                aria-label="Tipo de caso"
                value={postventaType}
                onChange={(e) => setPostventaType(e.target.value as PostventaCaso['tipo'])}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              >
                <option value="defecto">Defecto</option>
                <option value="faltante">Faltante</option>
                <option value="cantidad_adicional">Cantidad adicional</option>
                <option value="otro">Otro</option>
              </select>
              <input
                aria-label="Fecha de compromiso"
                type="date"
                value={postventaDate}
                onChange={(e) => setPostventaDate(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
              <input
                aria-label="Cantidad adicional"
                type="number"
                min="0"
                step="0.01"
                placeholder="Cantidad adicional"
                value={postventaAdditional}
                onChange={(e) => setPostventaAdditional(e.target.value)}
                className="rounded-md border border-line bg-surface p-2 text-ink"
              />
            </div>
            <textarea
              aria-label="Descripción del caso"
              placeholder="Descripción del caso"
              value={postventaDescription}
              onChange={(e) => setPostventaDescription(e.target.value)}
              className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink"
            />
            <input
              aria-label="Autorización del cliente"
              placeholder="Referencia de autorización del cliente para cantidad adicional"
              value={postventaAuthorization}
              onChange={(e) => setPostventaAuthorization(e.target.value)}
              className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink"
            />
            <Button disabled={busy} onClick={() => void createPostventa()} variant="primary" size="sm">
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
                      const { error: statusError } = await supabase
                        .from('postventa_casos')
                        .update({ estado: e.target.value })
                        .eq('id', caso.id);
                      if (statusError) setError(mensajeError(statusError));
                      else await loadData();
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
              <p className="t-caption text-ink-muted">
                Solicita aprobación al administrador cuando la entrega está acreditada fuera de las guías.
              </p>
              <input
                aria-label="Motivo de confirmación manual"
                placeholder="Motivo obligatorio"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full rounded-md border border-line bg-surface p-2 text-sm text-ink"
              />
              <Button onClick={() => void confirmManualDelivery()} variant="primary" size="sm">
                Solicitar excepción
              </Button>
            </section>
          )}
        </div>
      )}

      {/* Modales Compartidos de la Ficha Maestra */}
      <CotizacionModal
        isOpen={showCotModal}
        onClose={() => {
          setShowCotModal(false);
          setEditCotId(undefined);
        }}
        clienteIdInicial={op.cliente_id}
        oportunidadIdInicial={op.id}
        editCotizacionIdInicial={editCotId}
        onSuccess={async () => {
          await logOperation('Cotización creada/actualizada desde la Ficha Maestra.');
          await loadData();
        }}
      />

      <PdfPreviewModal cotizacion={previewCot} onClose={() => setPreviewCot(null)} />

      <OrdenCompraModal
        isOpen={showOcModal}
        onClose={() => setShowOcModal(false)}
        oportunidadIdInicial={op.id}
        onSuccess={async () => {
          await logOperation('Orden de compra vinculada desde la Ficha Maestra.');
          await loadData();
        }}
      />

      <OrdenCompraPdfPreviewModal orden={previewOc} onClose={() => setPreviewOc(null)} />
    </div>
  );
}
