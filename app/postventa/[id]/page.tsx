'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, CheckCircle2, Minus, ExternalLink, FileText, Link2, Pencil, Plus, Printer, Shield, Trash2, Upload } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { useClienteOpciones } from '../../../lib/clientes-opciones';
import type {
  CasoPostventa,
  CausaRaizPostventa,
  EstadoPostventa,
  ProductoCatalogo,
  ResolucionPostventa,
  TipoCostoPostventa,
  TipoEvidenciaPostventa,
  TipoProblemaPostventa,
  Trabajador,
  Usuario,
} from '../../../lib/types';
import { useAuth } from '../../../lib/context/AuthContext';
import { useBreadcrumb } from '../../../lib/context/BreadcrumbContext';
import { mensajeError } from '../../../lib/errores';
import { etiquetaProducto } from '../../../lib/productos';
import {
  Button,
  CodeStamp,
  Dialog,
  EmptyState,
  IconButton,
  Panel,
  RecordLayout,
  StatusBadge,
} from '../../../components/ui/crm';
import { SearchSelect } from '../../../components/ui/SearchSelect';
import { DatePicker } from '../../../components/ui/DatePicker';
import { useConfirm, useToast } from '../../../components/ui/feedback';
import {
  CAUSAS_RAIZ,
  ESTADOS_EDITABLES,
  ESTADOS_MAP,
  RESOLUCIONES_MAP,
  TIPOS_COSTO,
  TIPOS_EVIDENCIA,
  TIPOS_PROBLEMA,
} from '../../../lib/postventa-config';

type TabId = 'diagnostico' | 'costos' | 'evidencias' | 'cierre' | 'garantia';

const hoy = () => new Date().toISOString().split('T')[0];

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="t-caption block text-ink-muted">{label}</span>
      <span className="mt-0.5 block text-[13px] font-semibold text-ink">{children}</span>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="t-caption mb-1 block font-semibold text-ink">{label}</label>
      {children}
    </div>
  );
}

interface HistorialItem {
  id: string;
  evento: 'creado' | 'estado' | 'cierre' | 'reapertura' | 'conformidad';
  estado_anterior: string | null;
  estado_nuevo: string | null;
  detalle: string | null;
  created_at: string;
  usuario: { nombre: string } | { nombre: string }[] | null;
}

function textoHistorial(h: HistorialItem): string {
  const label = (e: string | null) => (e ? ESTADOS_MAP[e as keyof typeof ESTADOS_MAP]?.label || e : '—');
  switch (h.evento) {
    case 'creado':
      return 'Caso creado';
    case 'cierre':
      return 'Caso cerrado';
    case 'reapertura':
      return `Caso reabierto (${label(h.estado_nuevo)})`;
    case 'conformidad':
      return h.detalle || 'Conformidad actualizada';
    default:
      return `${label(h.estado_anterior)} → ${label(h.estado_nuevo)}`;
  }
}

export default function CasoPostventaPage() {
  const params = useParams();
  const casoId = params.id as string;
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();
  const { setCustomTitle } = useBreadcrumb();

  const [caso, setCaso] = useState<CasoPostventa | null>(null);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId | null>(null);
  const [showCosto, setShowCosto] = useState(false);
  const [showEvidencia, setShowEvidencia] = useState(false);
  const [showEditar, setShowEditar] = useState(false);
  const [showConformidad, setShowConformidad] = useState(false);
  const [conformidadObs, setConformidadObs] = useState('');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [modoEvidencia, setModoEvidencia] = useState<'archivo' | 'enlace'>('archivo');
  const [archivoEvidencia, setArchivoEvidencia] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [editForm, setEditForm] = useState({
    descripcion: '',
    tipo: 'problema_instalacion' as TipoProblemaPostventa,
    cliente_id: '',
    obra: '',
    producto_id: '',
    producto_texto: '',
    vendedor_id: '',
    fecha_reclamo: '',
  });

  const [nuevoCosto, setNuevoCosto] = useState({
    tipo_costo: 'materiales' as TipoCostoPostventa,
    descripcion: '',
    monto: '',
  });
  const [nuevaEvidencia, setNuevaEvidencia] = useState({
    tipo_evidencia: 'despues' as TipoEvidenciaPostventa,
    archivo_url: '',
  });

  const clientesSel = useClienteOpciones(editForm.cliente_id);

  const load = useCallback(async () => {
    const [{ data, error }, { data: trab }, { data: usrs }, { data: prods }] = await Promise.all([
      supabase
        .from('postventa_casos')
        .select(`
          *,
          oportunidad:oportunidades(id, codigo, titulo, cliente_id, asignado_a),
          cliente:clientes(id, nombre, apellido_razon_social, rut, telefono, correo),
          vendedor:usuarios!postventa_casos_vendedor_id_fkey(id, nombre, email),
          cuadrilla:trabajadores(id, nombre, cargo, area),
          producto:catalogo_productos(id, codigo, nombre, unidad),
          evidencias:postventa_evidencias(*),
          costos:postventa_costos(*)
        `)
        .eq('id', casoId)
        .maybeSingle(),
      supabase.from('trabajadores').select('*').order('nombre'),
      supabase.from('usuarios').select('id, nombre, email, rol').order('nombre'),
      supabase.from('catalogo_productos').select('id, codigo, nombre, unidad').order('nombre'),
    ]);
    if (error) toast({ message: mensajeError(error), tone: 'danger' });
    const { data: hist } = await supabase
      .from('postventa_historial')
      .select('id, evento, estado_anterior, estado_nuevo, detalle, created_at, usuario:usuarios(nombre)')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false });
    setHistorial((hist || []) as unknown as HistorialItem[]);
    setCaso((data as unknown as CasoPostventa) || null);
    if (trab) setTrabajadores(trab as Trabajador[]);
    if (usrs) setUsuarios(usrs as Usuario[]);
    if (prods) setProductos(prods as ProductoCatalogo[]);
    setLoading(false);
  }, [supabase, casoId, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la ficha
    void load();
  }, [load]);

  const folio = caso?.folio ?? null;
  useEffect(() => {
    setCustomTitle(folio);
    return () => setCustomTitle(null);
  }, [folio, setCustomTitle]);

  const persistir = async (updates: Partial<CasoPostventa>, okMessage?: string) => {
    if (!caso) return;
    setCaso((prev) => (prev ? { ...prev, ...updates } : prev));
    const { error } = await supabase.from('postventa_casos').update(updates).eq('id', caso.id);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
      await load();
    } else if (okMessage) {
      toast({ message: okMessage, tone: 'success' });
    }
  };

  const validacionCierre = useMemo(() => {
    if (!caso) return { listo: false, fotos: false, conformidad: false, causa: false, costos: false };
    const fotos = (caso.evidencias || []).some((e) => ['despues', 'conformidad'].includes(e.tipo_evidencia));
    const conformidad =
      Boolean(caso.conformidad_cliente) || (caso.evidencias || []).some((e) => e.tipo_evidencia === 'conformidad');
    const causa = Boolean(caso.causa_raiz) && caso.causa_raiz !== 'Sin determinar';
    const costos = Number(caso.costo_total || 0) > 0 || (caso.costos && caso.costos.length > 0);
    return { listo: fotos && conformidad && causa, fotos, conformidad, causa, costos: Boolean(costos) };
  }, [caso]);

  const handleCambiarEstado = async (nuevoEstado: EstadoPostventa) => {
    if (!caso) return;
    if (nuevoEstado === 'cerrado' && !validacionCierre.listo) {
      toast({ message: 'Para cerrar el caso debes cumplir las condiciones de cierre.', tone: 'warning' });
      return;
    }
    const payload: Partial<CasoPostventa> = { estado: nuevoEstado };
    if (nuevoEstado === 'cerrado') {
      payload.fecha_cierre = new Date().toISOString();
      payload.cerrado_por = currentUser?.id || null;
    }
    const { error } = await supabase.from('postventa_casos').update(payload).eq('id', caso.id);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: `Estado actualizado a "${ESTADOS_MAP[nuevoEstado]?.label || nuevoEstado}"`, tone: 'success' });
      await load();
    }
  };

  const handleAgregarCosto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caso || !nuevoCosto.descripcion.trim() || !nuevoCosto.monto) return;
    const monto = Number(nuevoCosto.monto);
    if (monto < 0) return;
    const { error } = await supabase.from('postventa_costos').insert({
      caso_id: caso.id,
      tipo_costo: nuevoCosto.tipo_costo,
      descripcion: nuevoCosto.descripcion.trim(),
      monto,
      proveedor_o_maestro: null,
      fecha: hoy(),
    });
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      setNuevoCosto({ tipo_costo: 'materiales', descripcion: '', monto: '' });
      setShowCosto(false);
      toast({ message: 'Costo registrado y sincronizado con la Nota de Venta', tone: 'success' });
      await load();
    }
  };

  const handleEliminarCosto = async (costoId: string) => {
    const ok = await confirm({
      title: '¿Eliminar costo imputado?',
      message: 'Esta acción restará el gasto del costo total de postventa y de la Nota de Venta.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('postventa_costos').delete().eq('id', costoId);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: 'Costo eliminado', tone: 'success' });
      await load();
    }
  };

  const abrirEditar = () => {
    if (!caso) return;
    setEditForm({
      descripcion: caso.descripcion || '',
      tipo: caso.tipo,
      cliente_id: caso.cliente_id || '',
      obra: caso.obra || '',
      producto_id: caso.producto_id || '',
      producto_texto: caso.producto_texto || '',
      vendedor_id: caso.vendedor_id || '',
      fecha_reclamo: caso.fecha_reclamo || '',
    });
    setShowEditar(true);
  };

  const handleGuardarCaso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caso || !editForm.descripcion.trim()) return;
    const { error } = await supabase
      .from('postventa_casos')
      .update({
        descripcion: editForm.descripcion.trim(),
        tipo: editForm.tipo,
        cliente_id: editForm.cliente_id || null,
        obra: editForm.obra.trim() || null,
        producto_id: editForm.producto_id || null,
        producto_texto: editForm.producto_texto.trim() || null,
        vendedor_id: editForm.vendedor_id || null,
        fecha_reclamo: editForm.fecha_reclamo || null,
      })
      .eq('id', caso.id);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: 'Caso actualizado', tone: 'success' });
      setShowEditar(false);
      await load();
    }
  };

  const handleAgregarEvidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caso) return;
    let url = nuevaEvidencia.archivo_url.trim();
    let nombre = 'Enlace';

    if (modoEvidencia === 'archivo') {
      if (!archivoEvidencia) return;
      if (archivoEvidencia.size > 15 * 1024 * 1024) {
        toast({ message: 'El archivo supera los 15 MB.', tone: 'warning' });
        return;
      }
      setSubiendo(true);
      const limpio = archivoEvidencia.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ruta = `postventa/${caso.id}/${Date.now()}_${limpio}`;
      const { error: errSubida } = await supabase.storage
        .from('documentos')
        .upload(ruta, archivoEvidencia, { contentType: archivoEvidencia.type || undefined, upsert: false });
      if (errSubida) {
        setSubiendo(false);
        toast({ message: mensajeError(errSubida, 'No se pudo subir el archivo.'), tone: 'danger' });
        return;
      }
      url = supabase.storage.from('documentos').getPublicUrl(ruta).data.publicUrl;
      nombre = archivoEvidencia.name;
    } else if (!url) {
      return;
    }

    const { error } = await supabase.from('postventa_evidencias').insert({
      caso_id: caso.id,
      tipo_evidencia: nuevaEvidencia.tipo_evidencia,
      archivo_url: url,
      nombre_archivo: nombre,
      descripcion: null,
      usuario_id: currentUser?.id || null,
    });
    setSubiendo(false);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      setNuevaEvidencia({ tipo_evidencia: 'despues', archivo_url: '' });
      setArchivoEvidencia(null);
      setShowEvidencia(false);
      toast({ message: 'Evidencia guardada', tone: 'success' });
      await load();
    }
  };

  const handleEliminarEvidencia = async (id: string, url: string) => {
    const ok = await confirm({
      title: '¿Eliminar evidencia?',
      message: 'Se quitará del caso. Si era un archivo subido, también se borra del almacenamiento.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    const marca = '/object/public/documentos/';
    const idx = url.indexOf(marca);
    if (idx >= 0) {
      await supabase.storage.from('documentos').remove([decodeURIComponent(url.slice(idx + marca.length))]);
    }
    const { error } = await supabase.from('postventa_evidencias').delete().eq('id', id);
    if (error) {
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: 'Evidencia eliminada', tone: 'success' });
      await load();
    }
  };

  const handleRegistrarConformidad = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistir(
      { conformidad_cliente: true, conformidad_observaciones: conformidadObs.trim() || null },
      'Conformidad registrada'
    );
    setShowConformidad(false);
  };

  if (loading) {
    return (
      <Panel>
        <p className="p-5 text-sm text-ink-muted">Cargando caso…</p>
      </Panel>
    );
  }

  if (!caso) {
    return (
      <EmptyState
        title="Caso no encontrado"
        description="No se encontró ningún caso de postventa con ese identificador."
        action={
          <Link href="/postventa">
            <Button variant="primary">Volver a postventa</Button>
          </Link>
        }
      />
    );
  }

  const cerrado = columnaCerrado(caso.estado);
  const clienteNombre = caso.cliente?.apellido_razon_social || caso.cliente?.nombre || 'Sin cliente';
  const tipoLabel = TIPOS_PROBLEMA.find((t) => t.value === caso.tipo)?.label || '—';
  const resolucion = RESOLUCIONES_MAP[caso.resolucion || 'en_evaluacion'];
  const costos = caso.costos || [];
  const evidencias = caso.evidencias || [];

  const faltantes = [
    !validacionCierre.causa && 'causa raíz',
    !validacionCierre.fotos && 'foto final o acta',
    !validacionCierre.conformidad && 'conformidad del cliente',
  ].filter(Boolean) as string[];
  const pasos: { id: Exclude<TabId, 'garantia'>; label: string; ok: boolean; detalle: string }[] = [
    {
      id: 'diagnostico',
      label: 'Diagnóstico',
      ok: validacionCierre.causa,
      detalle: validacionCierre.causa ? String(caso.causa_raiz) : 'Definir causa raíz',
    },
    {
      id: 'costos',
      label: 'Costos',
      ok: true,
      detalle: validacionCierre.costos ? `$${Number(caso.costo_total || 0).toLocaleString('es-CL')}` : 'Sin costos (opcional)',
    },
    {
      id: 'evidencias',
      label: 'Evidencias',
      ok: validacionCierre.fotos,
      detalle: validacionCierre.fotos
        ? `${evidencias.length} ${evidencias.length === 1 ? 'archivo' : 'archivos'}`
        : 'Falta foto o acta',
    },
    {
      id: 'cierre',
      label: 'Cierre',
      ok: cerrado,
      detalle: cerrado ? 'Cerrado' : validacionCierre.listo ? 'Listo para cerrar' : 'Revisar y cerrar',
    },
  ];
  const siguiente = pasos.find((p) => !p.ok)?.id;
  const tabActiva: TabId = tab ?? siguiente ?? 'diagnostico';

  return (
    <div className="space-y-4 pb-12">
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold leading-tight text-ink">{caso.descripcion}</h1>
        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton icon={Pencil} label="Editar caso" onClick={abrirEditar} className="bg-surface shadow-[var(--hg-shadow-card)] hover:bg-surface-muted" />
          <IconButton
            icon={Shield}
            label="Garantía"
            aria-pressed={tabActiva === 'garantia'}
            onClick={() => setTab(tabActiva === 'garantia' ? siguiente ?? 'diagnostico' : 'garantia')}
            className={
              tabActiva === 'garantia'
                ? 'bg-accent text-on-accent hover:bg-accent hover:text-on-accent'
                : 'bg-surface shadow-[var(--hg-shadow-card)] hover:bg-surface-muted'
            }
          />
        </div>
      </div>

      <RecordLayout
        sidebar={
          <Panel>
            <div className="space-y-4 p-4">
              <div className="space-y-1.5 rounded-xl bg-surface-muted p-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      { neutral: 'bg-ink-muted', warning: 'bg-warning', info: 'bg-info', accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger' }[
                        ESTADOS_MAP[caso.estado]?.tone || 'neutral'
                      ]
                    }`}
                  />
                  Etapa del caso
                </label>
                <SearchSelect
                  value={caso.estado}
                  onChange={(v) => void handleCambiarEstado(v as EstadoPostventa)}
                  options={ESTADOS_EDITABLES}
                  searchable={false}
                  ariaLabel="Etapa del caso"
                />
              </div>

              <div className="space-y-3 border-t border-line-subtle pt-4">
                <h2 className="text-base font-semibold text-accent-ink">Caso</h2>
                <Dato label="ID del caso">
                  <span className="t-num">{caso.folio}</span>
                </Dato>
                <Dato label="Tipo de problema">{tipoLabel}</Dato>
                <Dato label="Producto">{caso.producto_texto || caso.producto?.nombre || '—'}</Dato>
                <Dato label="Ejecutivo">{caso.vendedor?.nombre || '—'}</Dato>
                <Dato label="Cuadrilla">{caso.cuadrilla?.nombre || '—'}</Dato>
                <div className="grid grid-cols-2 gap-3">
                  <Dato label="Reclamo">
                    <span className="t-num">{caso.fecha_reclamo || caso.created_at.split('T')[0]}</span>
                  </Dato>
                  <Dato label="Compromiso">
                    <span className="t-num">{caso.fecha_compromiso || '—'}</span>
                  </Dato>
                </div>
              </div>

              <div className="space-y-3 border-t border-line-subtle pt-4">
                <h2 className="text-base font-semibold text-accent-ink">Venta</h2>
                <Dato label="Cliente">
                  {caso.cliente?.id ? (
                    <Link href={`/clientes/${caso.cliente.id}`} className="hover:underline">
                      {clienteNombre}
                    </Link>
                  ) : (
                    clienteNombre
                  )}
                  {caso.cliente?.rut && <span className="t-caption t-num block font-normal text-ink-muted">{caso.cliente.rut}</span>}
                </Dato>
                <Dato label="Nota de Venta">
                  {caso.oportunidad?.id ? (
                    <Link href={`/ventas?oportunidad=${caso.oportunidad.id}`} className="t-num hover:underline">
                      {caso.oportunidad.codigo}
                    </Link>
                  ) : (
                    '—'
                  )}
                </Dato>
                <Dato label="Obra">{caso.obra || '—'}</Dato>
              </div>

            </div>
          </Panel>
        }
      >
        <div className="space-y-4">
          {/* Barra superior: pasos del caso y acciones */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-line bg-accent-soft p-2">
            <ol className="flex min-w-0 flex-1 flex-wrap items-stretch gap-1">
              {pasos.map((paso, i) => {
                const actual = paso.id === tabActiva;
                const pendienteSiguiente = !paso.ok && paso.id === siguiente;
                return (
                  <li key={paso.id} className="min-w-[140px] flex-1">
                    <button
                      type="button"
                      onClick={() => setTab(paso.id)}
                      aria-current={actual ? 'step' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                        actual ? 'bg-surface shadow-[var(--hg-shadow-card)]' : 'hover:bg-surface/60'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                          paso.ok ? 'bg-success text-on-accent' : pendienteSiguiente ? 'bg-accent text-on-accent' : 'bg-surface text-ink-muted'
                        }`}
                      >
                        {paso.ok ? <Check size={13} aria-hidden /> : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-ink">{paso.label}</span>
                        <span className="block truncate t-caption text-ink-muted">{paso.detalle}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* DIAGNÓSTICO */}
          {tabActiva === 'diagnostico' && (
            <article className="rounded-xl border border-line bg-surface p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Causa raíz">
                  <SearchSelect
                    value={caso.causa_raiz || 'Sin determinar'}
                    onChange={(v) => void persistir({ causa_raiz: v as CausaRaizPostventa }, 'Diagnóstico actualizado')}
                    options={CAUSAS_RAIZ.map((c) => ({ value: c, label: c }))}
                    searchPlaceholder="Buscar causa..."
                    searchable
                  />
                </Campo>
                <Campo label="Resolución">
                  <SearchSelect
                    value={caso.resolucion || 'en_evaluacion'}
                    onChange={(v) => void persistir({ resolucion: v as ResolucionPostventa }, 'Resolución actualizada')}
                    options={Object.entries(RESOLUCIONES_MAP).map(([key, item]) => ({ value: key, label: item.label, hint: item.desc }))}
                    searchPlaceholder="Buscar resolución..."
                    searchable
                    menuMinWidth={300}
                  />
                </Campo>
                <Campo label="Cuadrilla / maestro">
                  <SearchSelect
                    value={caso.cuadrilla_id || ''}
                    onChange={(v) => void persistir({ cuadrilla_id: v || null }, 'Cuadrilla actualizada')}
                    placeholder="Sin cuadrilla"
                    clearLabel="Sin cuadrilla"
                    searchPlaceholder="Buscar cuadrilla..."
                    searchable
                    options={trabajadores.map((t) => ({ value: t.id, label: t.nombre, hint: t.cargo }))}
                  />
                </Campo>
                <Campo label="Fecha compromiso">
                  <DatePicker
                    value={caso.fecha_compromiso || ''}
                    onChange={(v) => void persistir({ fecha_compromiso: v || null }, 'Fecha actualizada')}
                    placeholder="Sin fecha"
                  />
                </Campo>
              </div>
            </article>
          )}

          {/* COSTOS */}
          {tabActiva === 'costos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-muted">
                  Total <span className="t-num ml-1 text-lg font-semibold text-ink">${Number(caso.costo_total || 0).toLocaleString('es-CL')}</span>
                </p>
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowCosto(true)}>
                  Agregar costo
                </Button>
              </div>

              <div className="overflow-hidden rounded-xl border border-line bg-surface">
                <table className="w-full text-left text-[13px]">
                  <thead className="border-b border-line bg-surface-muted/60 text-xs font-medium text-ink-muted">
                    <tr>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Descripción</th>
                      <th className="px-3 py-3">Fecha</th>
                      <th className="px-3 py-3 text-right">Monto</th>
                      <th className="w-12 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {costos.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-3 font-semibold text-ink">
                          {TIPOS_COSTO.find((t) => t.value === c.tipo_costo)?.label || c.tipo_costo}
                        </td>
                        <td className="px-3 py-3 text-ink">{c.descripcion}</td>
                        <td className="t-num px-3 py-3 text-ink-muted">{c.fecha}</td>
                        <td className="t-num px-3 py-3 text-right font-semibold text-ink">
                          ${Number(c.monto).toLocaleString('es-CL')}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            aria-label="Eliminar costo"
                            onClick={() => void handleEliminarCosto(c.id)}
                            className="rounded-control p-1.5 text-ink-muted transition hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {costos.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-ink-muted">
                          Sin costos registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EVIDENCIAS */}
          {tabActiva === 'evidencias' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowEvidencia(true)}>
                  Agregar evidencia
                </Button>
              </div>

              {evidencias.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line py-10 text-center text-[13px] text-ink-muted">
                  Sin fotos ni documentos.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {evidencias.map((ev) => {
                    const esImagen = /\.(png|jpe?g|gif|webp|avif)$/i.test(ev.archivo_url.split('?')[0]);
                    return (
                      <div key={ev.id} className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <StatusBadge tone={ev.tipo_evidencia === 'conformidad' ? 'success' : 'neutral'}>
                            {TIPOS_EVIDENCIA.find((t) => t.value === ev.tipo_evidencia)?.label || ev.tipo_evidencia}
                          </StatusBadge>
                          <button
                            type="button"
                            aria-label="Eliminar evidencia"
                            onClick={() => void handleEliminarEvidencia(ev.id, ev.archivo_url)}
                            className="rounded-control p-1 text-ink-muted transition hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                        <a
                          href={ev.archivo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex aspect-video items-center justify-center overflow-hidden rounded-control border border-line-subtle bg-surface-muted transition hover:border-accent"
                        >
                          {esImagen ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ev.archivo_url} alt={ev.nombre_archivo || 'Evidencia'} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center gap-1.5 px-3 text-center text-ink-muted">
                              {ev.nombre_archivo && ev.nombre_archivo !== 'Enlace' ? <FileText size={24} aria-hidden /> : <Link2 size={24} aria-hidden />}
                              <span className="line-clamp-2 text-xs font-semibold text-ink">{ev.nombre_archivo || 'Abrir enlace'}</span>
                              <span className="inline-flex items-center gap-1 text-[11px]"><ExternalLink size={11} aria-hidden />Abrir</span>
                            </span>
                          )}
                        </a>
                        <p className="t-caption t-num text-ink-muted">{ev.created_at.split('T')[0]}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* CIERRE */}
          {tabActiva === 'cierre' && (
            <div className="space-y-3">
              {!cerrado && faltantes.length > 0 && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[13px] text-ink"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                  <span>Antes de cerrar falta: {faltantes.join(', ')}.</span>
                </div>
              )}

              <div className="divide-y divide-line-subtle rounded-xl border border-line bg-surface">
                {[
                  {
                    label: 'Diagnóstico',
                    ok: validacionCierre.causa,
                    valor: validacionCierre.causa ? `${caso.causa_raiz} · ${resolucion?.label}` : 'Sin causa raíz definida',
                    ir: 'diagnostico' as TabId,
                  },
                  {
                    label: 'Costos',
                    ok: true,
                    opcionalVacio: !validacionCierre.costos,
                    valor: validacionCierre.costos
                      ? `${costos.length} ${costos.length === 1 ? 'registro' : 'registros'} · $${Number(caso.costo_total || 0).toLocaleString('es-CL')}`
                      : 'Sin costos registrados (opcional)',
                    ir: 'costos' as TabId,
                  },
                  {
                    label: 'Evidencias',
                    ok: validacionCierre.fotos,
                    valor: validacionCierre.fotos
                      ? `${evidencias.length} ${evidencias.length === 1 ? 'archivo' : 'archivos'}`
                      : 'Sin foto final ni acta',
                    ir: 'evidencias' as TabId,
                  },
                ].map((fila) => (
                  <div key={fila.label} className="flex items-center gap-3 px-4 py-3">
                    {'opcionalVacio' in fila && fila.opcionalVacio ? (
                      <Minus size={17} className="shrink-0 text-ink-muted" aria-hidden />
                    ) : fila.ok ? (
                      <CheckCircle2 size={17} className="shrink-0 text-success" aria-hidden />
                    ) : (
                      <AlertTriangle size={17} className="shrink-0 text-warning" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink">{fila.label}</p>
                      <p className="truncate text-xs text-ink-muted">{fila.valor}</p>
                    </div>
                    {!cerrado && (
                      <Button variant="secondary" size="sm" className="w-32" onClick={() => setTab(fila.ir)}>
                        {'opcionalVacio' in fila && fila.opcionalVacio ? 'Agregar' : fila.ok ? 'Revisar' : 'Completar'}
                      </Button>
                    )}
                  </div>
                ))}

                <div className="flex items-center gap-3 px-4 py-3">
                  {validacionCierre.conformidad ? (
                    <CheckCircle2 size={17} className="shrink-0 text-success" aria-hidden />
                  ) : (
                    <AlertTriangle size={17} className="shrink-0 text-warning" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">Conformidad del cliente</p>
                    <p className="truncate text-xs text-ink-muted">
                      {validacionCierre.conformidad
                        ? caso.conformidad_observaciones || 'Recibida'
                        : 'Pendiente de registrar'}
                    </p>
                  </div>
                  {!cerrado &&
                    (caso.conformidad_cliente ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-32"
                        onClick={() => void persistir({ conformidad_cliente: false, conformidad_observaciones: null }, 'Conformidad quitada')}
                      >
                        Quitar
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-32"
                        icon={CheckCircle2}
                        onClick={() => {
                          setConformidadObs('');
                          setShowConformidad(true);
                        }}
                      >
                        Registrar
                      </Button>
                    ))}
                </div>
              </div>

              <div className="flex items-center justify-end">
                {cerrado ? (
                  <StatusBadge tone="success">Cerrado el {caso.fecha_cierre?.split('T')[0] || 'hoy'}</StatusBadge>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-32"
                    icon={CheckCircle2}
                    disabled={!validacionCierre.listo}
                    onClick={() => void handleCambiarEstado('cerrado')}
                  >
                    Cerrar caso
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* HISTORIAL (se muestra junto al cierre) */}
          {tabActiva === 'cierre' && historial.length > 0 && (
            <div className="rounded-xl border border-line bg-surface">
              <h3 className="border-b border-line-subtle px-4 py-2.5 text-[13px] font-semibold text-ink">Historial</h3>
              <ul className="divide-y divide-line-subtle">
                {historial.map((h) => {
                  const autor = Array.isArray(h.usuario) ? h.usuario[0]?.nombre : h.usuario?.nombre;
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                      <span className="min-w-0 truncate text-ink">{textoHistorial(h)}</span>
                      <span className="shrink-0 t-num text-ink-muted">
                        {autor || 'Sistema'} ·{' '}
                        {new Date(h.created_at).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* GARANTÍA */}
          {tabActiva === 'garantia' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                  Imprimir
                </Button>
              </div>

              <div className="space-y-4 rounded-xl border border-line bg-surface p-6 text-xs text-ink">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <h2 className="t-section text-ink">HORMIGLASS PREFABRICADOS</h2>
                    <p className="t-caption text-ink-muted">Sociedad Comercial y de Transportes Valverde e Hijos Ltda.</p>
                    <p className="t-caption text-ink-muted">Portezuelo 1502, San Bernardo, Santiago</p>
                  </div>
                  <div className="text-right">
                    <CodeStamp>{caso.folio}</CodeStamp>
                    <span className="t-caption mt-1 block text-ink-muted">Emisión: {new Date().toLocaleDateString('es-CL')}</span>
                  </div>
                </div>

                <h3 className="py-2 text-center t-section uppercase tracking-wide text-ink">
                  Certificado de resolución y cobertura de garantía técnica
                </h3>

                <div className="grid grid-cols-2 gap-3 rounded-control border border-line bg-surface-muted p-3.5">
                  <div><strong>Cliente:</strong> {clienteNombre}</div>
                  <div><strong>RUT:</strong> {caso.cliente?.rut || '—'}</div>
                  <div><strong>Obra:</strong> {caso.obra || '—'}</div>
                  <div><strong>Nota de Venta:</strong> {caso.oportunidad?.codigo}</div>
                  <div><strong>Producto / partida:</strong> {caso.producto_texto || caso.producto?.nombre || 'Prefabricados de Hormigón'}</div>
                  <div><strong>Resolución:</strong> {resolucion?.label}</div>
                </div>

                <div className="space-y-1.5 leading-relaxed">
                  <h4 className="t-caption font-bold uppercase text-ink">1. Alcance de la cobertura</h4>
                  <p className="text-ink-muted">
                    Hormiglass certifica que el reclamo registrado bajo el folio {caso.folio} ha sido evaluado técnicamente conforme a los estándares de fabricación de hormigón. En mérito del diagnóstico ({caso.causa_raiz || 'Técnico'}), se determina la resolución de cobertura correspondiente a reparación, reposición y/o ajuste de obra según lo pactado.
                  </p>
                </div>

                <div className="space-y-1.5 leading-relaxed">
                  <h4 className="t-caption font-bold uppercase text-ink">2. Exclusiones y condiciones</h4>
                  <p className="text-ink-muted">
                    La presente garantía no cubre daños atribuibles a movimientos imprevistos del terreno, sobrecargas vehiculares no especificadas en la cotización original, modificaciones posteriores ejecutadas por terceros o negligencia en el mantenimiento de juntas y sellos.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-8 border-t border-line pt-8 text-center">
                  <div>
                    <div className="mx-auto mb-1 w-48 border-b border-line" />
                    <span className="block font-semibold text-ink">Mariela Valverde / Gerencia Técnica</span>
                    <span className="t-caption text-ink-muted">Hormiglass Prefabricados</span>
                  </div>
                  <div>
                    <div className="mx-auto mb-1 w-48 border-b border-line" />
                    <span className="block font-semibold text-ink">Conformidad del Cliente</span>
                    <span className="t-caption text-ink-muted">{clienteNombre}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </RecordLayout>

      <Dialog open={showCosto} onClose={() => setShowCosto(false)} title="Agregar costo" size="sm">
        <form onSubmit={handleAgregarCosto} className="space-y-4">
          <Campo label="Tipo">
            <SearchSelect
              value={nuevoCosto.tipo_costo}
              onChange={(v) => setNuevoCosto({ ...nuevoCosto, tipo_costo: v as TipoCostoPostventa })}
              options={TIPOS_COSTO}
              searchable={false}
            />
          </Campo>
          <Campo label="Descripción">
            <input
              required
              autoFocus
              placeholder="Ej. Reposición de pastelones"
              value={nuevoCosto.descripcion}
              onChange={(e) => setNuevoCosto({ ...nuevoCosto, descripcion: e.target.value })}
              className="hg-field-compact w-full"
            />
          </Campo>
          <Campo label="Monto ($)">
            <input
              required
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={nuevoCosto.monto}
              onChange={(e) => setNuevoCosto({ ...nuevoCosto, monto: e.target.value })}
              className="hg-field-compact t-num w-full"
            />
          </Campo>
          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowCosto(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Agregar costo
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={showEvidencia} onClose={() => setShowEvidencia(false)} title="Agregar evidencia" size="sm">
        <form onSubmit={handleAgregarEvidencia} className="space-y-4">
          <Campo label="Tipo">
            <SearchSelect
              value={nuevaEvidencia.tipo_evidencia}
              onChange={(v) => setNuevaEvidencia({ ...nuevaEvidencia, tipo_evidencia: v as TipoEvidenciaPostventa })}
              options={TIPOS_EVIDENCIA}
              searchable={false}
            />
          </Campo>

          <div role="tablist" aria-label="Origen de la evidencia" className="flex items-center gap-0.5 rounded-xl bg-surface-muted p-1">
            {([
              ['archivo', 'Subir archivo'],
              ['enlace', 'Pegar enlace'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={modoEvidencia === id}
                onClick={() => setModoEvidencia(id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  modoEvidencia === id ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {modoEvidencia === 'archivo' ? (
            <Campo label="Archivo (imagen, PDF o documento · máx. 15 MB)">
              <label className="flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-line bg-surface px-3 py-3 text-[13px] transition hover:border-accent">
                <Upload size={15} className="shrink-0 text-ink-muted" aria-hidden />
                <span className={`truncate ${archivoEvidencia ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                  {archivoEvidencia ? archivoEvidencia.name : 'Elegir archivo…'}
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="sr-only"
                  onChange={(e) => setArchivoEvidencia(e.target.files?.[0] || null)}
                />
              </label>
            </Campo>
          ) : (
            <Campo label="Enlace">
              <input
                autoFocus
                placeholder="https://"
                value={nuevaEvidencia.archivo_url}
                onChange={(e) => setNuevaEvidencia({ ...nuevaEvidencia, archivo_url: e.target.value })}
                className="hg-field-compact w-full"
              />
            </Campo>
          )}

          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowEvidencia(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={subiendo || (modoEvidencia === 'archivo' ? !archivoEvidencia : !nuevaEvidencia.archivo_url.trim())}
            >
              {subiendo ? 'Subiendo…' : 'Guardar evidencia'}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={showConformidad} onClose={() => setShowConformidad(false)} title="Conformidad del cliente" size="sm">
        <form onSubmit={handleRegistrarConformidad} className="space-y-4">
          <Campo label="Observaciones (opcional)">
            <input
              autoFocus
              placeholder="Ej. Firmó conforme en terreno"
              value={conformidadObs}
              onChange={(e) => setConformidadObs(e.target.value)}
              className="hg-field-compact w-full"
            />
          </Campo>
          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowConformidad(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Registrar conformidad
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={showEditar} onClose={() => setShowEditar(false)} title="Editar caso" size="lg">
        <form onSubmit={handleGuardarCaso} className="space-y-4">
          <Campo label="Descripción del reclamo">
            <textarea
              required
              rows={3}
              value={editForm.descripcion}
              onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
              className="hg-field p-3 leading-relaxed"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Cliente">
              <SearchSelect
                value={editForm.cliente_id}
                onChange={(v) => setEditForm({ ...editForm, cliente_id: v })}
                placeholder="Seleccionar cliente"
                searchPlaceholder="Buscar por nombre o RUT..."
                searchable
                menuMinWidth={320}
                options={clientesSel.opciones}
                onSearch={clientesSel.onSearch}
              />
            </Campo>
            <Campo label="Obra">
              <input
                value={editForm.obra}
                onChange={(e) => setEditForm({ ...editForm, obra: e.target.value })}
                className="hg-field-compact w-full"
              />
            </Campo>
            <Campo label="Tipo de problema">
              <SearchSelect
                value={editForm.tipo}
                onChange={(v) => setEditForm({ ...editForm, tipo: v as TipoProblemaPostventa })}
                options={TIPOS_PROBLEMA}
                searchPlaceholder="Buscar tipo..."
                searchable
              />
            </Campo>
            <Campo label="Ejecutivo">
              <SearchSelect
                value={editForm.vendedor_id}
                onChange={(v) => setEditForm({ ...editForm, vendedor_id: v })}
                placeholder="Seleccionar ejecutivo"
                clearLabel="Sin ejecutivo"
                searchPlaceholder="Buscar ejecutivo..."
                searchable
                options={usuarios.map((u) => ({ value: u.id, label: u.nombre, hint: u.rol }))}
              />
            </Campo>
            <Campo label="Producto del catálogo">
              <SearchSelect
                value={editForm.producto_id}
                onChange={(v) => {
                  const prod = productos.find((x) => x.id === v);
                  setEditForm({
                    ...editForm,
                    producto_id: v,
                    producto_texto: prod ? `${prod.codigo} - ${etiquetaProducto(prod)}` : editForm.producto_texto,
                  });
                }}
                placeholder="Sin producto del catálogo"
                clearLabel="Sin producto del catálogo"
                searchPlaceholder="Buscar producto..."
                searchable
                menuMinWidth={320}
                options={productos.map((x) => ({ value: x.id, label: etiquetaProducto(x), hint: x.codigo }))}
              />
            </Campo>
            <Campo label="Detalle del producto">
              <input
                value={editForm.producto_texto}
                onChange={(e) => setEditForm({ ...editForm, producto_texto: e.target.value })}
                className="hg-field-compact w-full"
              />
            </Campo>
            <Campo label="Fecha del reclamo">
              <DatePicker
                value={editForm.fecha_reclamo}
                onChange={(v) => setEditForm({ ...editForm, fecha_reclamo: v })}
                clearable={false}
              />
            </Campo>
          </div>
          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowEditar(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Guardar cambios
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function columnaCerrado(estado: EstadoPostventa): boolean {
  return estado === 'cerrado' || estado === 'resuelto';
}
