'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import { useBreadcrumb } from '../../../lib/context/BreadcrumbContext';
import type { Proveedor, OrdenCompra, EstadoOrdenCompra, NotaProveedor, TipoNotaProveedor } from '../../../lib/types';
import { OrdenCompraPdfPreviewModal } from '../../../components/OrdenCompraPdfPreviewModal';
import { SearchableSelect } from '../../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../../lib/chile-data';
import { validarRutChileno } from '../../../lib/proveedores-csv';
import { mensajeError } from '../../../lib/errores';
import {
  Button,
  CodeStamp,
  Dialog,
  EmptyState,
  Panel,
  RecordLayout,
  StatusBadge,
  type Tone,
} from '../../../components/ui/crm';
import { useToast } from '../../../components/ui/feedback';
import { Select, DateInput } from '../../../components/ui/FormControls';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  UserCheck,
  Edit,
  Save,
  Bell,
  PhoneCall,
  Calendar,
  Eye,
  FileCheck,
  Clock,
  Plus,
  AlertTriangle,
  ExternalLink,
  Search,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  Building2,
} from 'lucide-react';

const SYSTEM_TIME_ZONE = 'America/Santiago';

const ESTADO_LABEL: Record<EstadoOrdenCompra, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  aprobada: 'Aprobada',
  recibida: 'Recibida',
  pagada: 'Pagada en Caja',
  cancelada: 'Cancelada',
};

const ESTADO_TONE: Record<EstadoOrdenCompra, Tone> = {
  borrador: 'neutral',
  emitida: 'accent',
  aprobada: 'info',
  recibida: 'warning',
  pagada: 'success',
  cancelada: 'danger',
};

const TIPO_LABEL: Record<TipoNotaProveedor, string> = {
  nota: 'Nota',
  reunion: 'Reunión',
  llamada: 'Llamada',
  recordatorio: 'Recordatorio',
  reclamo: 'Reclamo',
};

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function getDateOnly(value?: string | null) {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value;
}

function normalizeTime(value?: string | null) {
  const [hours = '09', minutes = '00', seconds = '00'] = (value || '09:00').split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
}

function formatSantiagoDateTime(value?: string | null, timeValue?: string | null) {
  if (!value) return 'Sin fecha';
  if (timeValue !== undefined) {
    const [year, month, day] = getDateOnly(value).split('-');
    if (!year || !month || !day) return 'Fecha inválida';
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} ${normalizeTime(timeValue).slice(0, 5)}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: SYSTEM_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function AsideSection({ title, count, open, onToggle, children }: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          {title}
          {count !== undefined && <span className="hg-list-count">{count}</span>}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          {open ? 'Cerrar' : 'Ver'}
          <ChevronDown size={13} className={open ? 'rotate-180' : ''} aria-hidden />
        </button>
      </div>
      {open && <div className="space-y-2.5 px-4 pb-4">{children}</div>}
    </section>
  );
}

export default function ProveedorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const toast = useToast();
  const proveedorId = params.id as string;
  const supabase = useMemo(() => createClient(), []);
  const { setCustomTitle: setBreadcrumbTitle } = useBreadcrumb();

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [notas, setNotas] = useState<NotaProveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'actividad' | 'notas' | 'reclamos' | 'metricas'>('actividad');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [asideOpen, setAsideOpen] = useState({ oc: true });
  const [previewOrden, setPreviewOrden] = useState<OrdenCompra | null>(null);

  // Nueva nota
  const [showNotaDialog, setShowNotaDialog] = useState(false);
  const [nuevaNota, setNuevaNota] = useState('');
  const [tipoActividad, setTipoActividad] = useState<TipoNotaProveedor>('nota');
  const [fechaRecordatorio, setFechaRecordatorio] = useState('');
  const [horaRecordatorio, setHoraRecordatorio] = useState('09:00');

  // Edición
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editRut, setEditRut] = useState('');
  const [editRubro, setEditRubro] = useState('');
  const [editContacto, setEditContacto] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editCorreo, setEditCorreo] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editComuna, setEditComuna] = useState('');

  useEffect(() => {
    setBreadcrumbTitle(proveedor?.nombre ?? null);
    return () => setBreadcrumbTitle(null);
  }, [proveedor?.nombre, setBreadcrumbTitle]);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      const [provRes, notasRes, ocRes] = await Promise.all([
        supabase.from('proveedores').select('*').eq('id', proveedorId).maybeSingle(),
        supabase
          .from('notas_proveedor')
          .select('*, usuario:usuarios(*)')
          .eq('proveedor_id', proveedorId)
          .order('fecha', { ascending: false }),
        supabase
          .from('ordenes_compra')
          .select('*, proveedor:proveedores(*), items:orden_compra_items(*)')
          .eq('proveedor_id', proveedorId)
          .order('created_at', { ascending: false }),
      ]);
      if (ignore) return;
      if (provRes.error) {
        console.error('Ficha proveedor:', mensajeError(provRes.error));
        setLoadError('No se pudo cargar la ficha del proveedor. Reintenta más tarde.');
        setLoading(false);
        return;
      }
      if (notasRes.error) console.warn('Ficha proveedor: no se cargaron las notas:', mensajeError(notasRes.error));
      if (ocRes.error) console.warn('Ficha proveedor: no se cargaron las órdenes:', mensajeError(ocRes.error));
      setLoadError(null);
      setProveedor((provRes.data as Proveedor | null) ?? null);
      setNotas((notasRes.data || []) as NotaProveedor[]);
      setOrdenes((ocRes.data || []) as OrdenCompra[]);
      setLoading(false);
    }

    const initial = window.setTimeout(() => { void loadData(); }, 0);
    let debounce: number | null = null;
    const reload = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => { void loadData(); }, 300);
    };
    const channel = supabase
      .channel(`realtime_proveedor_${proveedorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_proveedor' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra' }, reload)
      .subscribe();
    return () => {
      ignore = true;
      window.clearTimeout(initial);
      if (debounce) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [proveedorId, supabase]);

  const openEdit = () => {
    if (!proveedor) return;
    setEditError('');
    setEditNombre(proveedor.nombre || '');
    setEditRut(proveedor.rut || '');
    setEditRubro(proveedor.rubro || '');
    setEditContacto(proveedor.contacto || '');
    setEditTelefono(proveedor.telefono || '');
    setEditCorreo(proveedor.correo || '');
    setEditDireccion(proveedor.direccion || '');
    setEditRegion(proveedor.region || '');
    setEditComuna(proveedor.comuna || '');
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedor) return;
    setEditError('');
    const val = validarRutChileno(editRut, { estricto: false });
    if (!val.valido) {
      setEditError(`RUT inválido: ${val.mensaje}`);
      return;
    }
    const { data, error } = await supabase
      .from('proveedores')
      .update({
        nombre: editNombre.trim(),
        rut: val.rutFormateado || editRut.trim(),
        rubro: editRubro.trim() || null,
        contacto: editContacto.trim() || null,
        telefono: editTelefono.trim() || null,
        correo: editCorreo.trim().toLowerCase() || null,
        direccion: editDireccion.trim() || null,
        region: editRegion || null,
        comuna: editComuna || null,
      })
      .eq('id', proveedor.id)
      .select()
      .single();
    if (error || !data) {
      setEditError(mensajeError(error, 'No se pudo actualizar el proveedor.'));
      return;
    }
    setProveedor(data as Proveedor);
    setIsEditing(false);
    toast({ message: 'Información del proveedor actualizada', tone: 'success' });
  };

  const openNota = (tipo: TipoNotaProveedor) => {
    setTipoActividad(tipo);
    setShowNotaDialog(true);
  };

  const handleAddNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaNota.trim() || !proveedor) return;
    const validUuid = currentUser?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentUser.id);
    const { data, error } = await supabase
      .from('notas_proveedor')
      .insert([{
        proveedor_id: proveedor.id,
        usuario_id: validUuid ? currentUser?.id : null,
        contenido: nuevaNota.trim(),
        tipo_actividad: tipoActividad,
        fecha_recordatorio: tipoActividad === 'recordatorio' ? fechaRecordatorio : null,
        hora_recordatorio: tipoActividad === 'recordatorio' ? horaRecordatorio : null,
        fecha: new Date().toISOString(),
      }])
      .select('*, usuario:usuarios(*)')
      .single();
    if (error || !data) {
      toast({ message: mensajeError(error, 'No se pudo guardar el registro.'), tone: 'danger' });
      return;
    }
    setNotas((prev) => [data as NotaProveedor, ...prev]);
    toast({
      message:
        tipoActividad === 'recordatorio' ? 'Recordatorio programado' : tipoActividad === 'reclamo' ? 'Reclamo registrado' : 'Nota guardada',
      tone: 'success',
    });
    if (tipoActividad === 'recordatorio' && currentUser?.id) {
      const cuando = fechaRecordatorio ? ` - Fecha: ${formatSantiagoDateTime(fechaRecordatorio, horaRecordatorio)}` : '';
      await supabase.from('notificaciones').insert([{
        usuario_id: currentUser.id,
        mensaje: `Recordatorio (${proveedor.nombre}): ${nuevaNota.trim()}${cuando}`,
        tipo: 'asignacion',
        leido: false,
        entidad_relacionada: 'proveedores',
        fecha: new Date().toISOString(),
      }]);
    }
    setNuevaNota('');
    setFechaRecordatorio('');
    setTipoActividad('nota');
    setShowNotaDialog(false);
  };

  // ----- Métricas -----
  const vigentes = ordenes.filter((o) => o.estado !== 'cancelada');
  const totalComprado = vigentes.reduce((s, o) => s + Number(o.monto_total || 0), 0);
  const totalPagado = vigentes.filter((o) => o.estado === 'pagada').reduce((s, o) => s + Number(o.monto_total || 0), 0);
  const totalPorPagar = totalComprado - totalPagado;
  const ocAbiertas = vigentes.filter((o) => o.estado !== 'pagada').length;
  const reclamos = notas.filter((n) => n.tipo_actividad === 'reclamo');
  const notasGenerales = notas.filter((n) => n.tipo_actividad !== 'reclamo');

  const ahora = new Date();
  const proximoAviso = notas
    .filter((n) => n.tipo_actividad === 'recordatorio' && n.fecha_recordatorio)
    .map((n) => ({
      n,
      d: new Date(`${getDateOnly(n.fecha_recordatorio)}T${normalizeTime(n.hora_recordatorio)}`),
    }))
    .filter((x) => !Number.isNaN(x.d.getTime()))
    .sort((a, b) => a.d.getTime() - b.d.getTime())[0];

  const q = busqueda.trim().toLowerCase();
  const coincide = (...campos: (string | null | undefined)[]) =>
    !q || campos.some((c) => (c || '').toLowerCase().includes(q));

  const timeline = notas.filter((n) => {
    if (!coincide(n.contenido, n.usuario?.nombre, n.tipo_actividad)) return false;
    return filtroTipo === 'todos' || (n.tipo_actividad || 'nota') === filtroTipo;
  });
  const notasFiltradas = notasGenerales.filter((n) => coincide(n.contenido, n.usuario?.nombre));
  const reclamosFiltrados = reclamos.filter((n) => coincide(n.contenido, n.usuario?.nombre));

  if (loading) {
    return (
      <div className="py-16 text-center">
        <p className="t-caption text-ink-muted">Cargando la ficha del proveedor...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-5 text-sm text-danger">
        <p className="font-semibold">{loadError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 text-xs font-semibold underline">
          Reintentar
        </button>
      </div>
    );
  }

  if (!proveedor) {
    return (
      <EmptyState
        title="Proveedor no encontrado"
        description="No se encontró ningún registro para el identificador seleccionado."
        action={
          <Link href="/proveedores">
            <Button variant="primary">Volver al directorio de proveedores</Button>
          </Link>
        }
      />
    );
  }

  const tabItems = [
    { id: 'actividad', label: 'Actividad', count: notas.length },
    { id: 'notas', label: 'Notas', count: notasGenerales.length },
    { id: 'reclamos', label: 'Reclamos', count: reclamos.length },
    { id: 'metricas', label: 'Resumen', count: undefined as number | undefined },
  ];

  const renderItem = (n: NotaProveedor) => {
    const tipo = n.tipo_actividad || 'nota';
    const Icon = tipo === 'recordatorio' ? Bell : tipo === 'llamada' ? PhoneCall : tipo === 'reunion' ? UserCheck : tipo === 'reclamo' ? AlertTriangle : FileCheck;
    const tono =
      tipo === 'recordatorio'
        ? 'bg-warning-soft text-warning'
        : tipo === 'llamada'
          ? 'bg-info-soft text-info'
          : tipo === 'reunion'
            ? 'bg-success-soft text-success'
            : tipo === 'reclamo'
              ? 'bg-danger-soft text-danger'
              : 'bg-accent-soft text-accent-ink';
    return (
      <article key={n.id} className="rounded-xl border border-line bg-surface p-3.5">
        <div className="flex items-start gap-3">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tono}`}>
            <Icon size={15} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs text-ink">
                <span className="font-semibold">{TIPO_LABEL[tipo]}</span>{' '}
                <span className="text-ink-muted">por {n.usuario?.nombre || 'Usuario CRM'}</span>
              </p>
              <span className="t-caption t-num inline-flex items-center gap-1">
                <Calendar size={12} aria-hidden />
                {formatSantiagoDateTime(n.fecha)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">{n.contenido}</p>
            {n.fecha_recordatorio && (
              <p className="t-caption font-semibold text-warning">
                Recordatorio: {formatSantiagoDateTime(n.fecha_recordatorio, n.hora_recordatorio)}
              </p>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      <RecordLayout
        sidebar={
          <Panel>
            <div className="p-4 space-y-4">
              <button
                type="button"
                onClick={() => router.push('/proveedores')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
              >
                <ArrowLeft size={15} aria-hidden />
                <span>Volver</span>
              </button>

              <div className="flex flex-col items-center text-center space-y-2">
                <div
                  aria-hidden
                  className="grid h-16 w-16 place-items-center rounded-full border border-accent-line bg-accent-soft text-accent-ink select-none"
                >
                  <Building2 size={30} aria-hidden />
                </div>
                <div className="min-w-0 max-w-full">
                  <h2 className="t-section text-ink truncate">{proveedor.nombre}</h2>
                  <p className="t-caption text-ink-muted truncate">{proveedor.rubro || 'Sin rubro'}</p>
                  <div className="mt-1">
                    <CodeStamp>{proveedor.rut}</CodeStamp>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'Nota', icon: MessageSquare, onClick: () => openNota('nota') },
                  { label: 'Reclamo', icon: AlertTriangle, onClick: () => openNota('reclamo') },
                  { label: 'Aviso', icon: Bell, onClick: () => openNota('recordatorio') },
                  { label: 'Editar', icon: Edit, onClick: openEdit },
                ].map(({ label, icon: Icon, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className="group flex flex-col items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition-colors group-hover:bg-surface-muted">
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="t-micro font-semibold">{label}</span>
                  </button>
                ))}
              </div>

              <div className="-mx-4 border-t border-line-subtle" />

              <div className="space-y-3 text-xs">
                <div>
                  <span className="t-caption text-ink-muted block">Persona de contacto</span>
                  <span className="font-semibold text-ink block mt-0.5">{proveedor.contacto || 'No registrada'}</span>
                </div>
                <div>
                  <span className="t-caption text-ink-muted block">Teléfono de contacto</span>
                  <span className="font-semibold text-ink inline-flex items-center gap-1.5 mt-0.5">
                    <Phone size={13} className="text-ink-muted" aria-hidden />
                    {proveedor.telefono || 'No registrado'}
                  </span>
                </div>
                <div>
                  <span className="t-caption text-ink-muted block">Correo electrónico</span>
                  <span className="font-semibold text-ink truncate block mt-0.5">
                    <Mail size={13} className="inline mr-1 text-ink-muted" aria-hidden />
                    {proveedor.correo || 'No registrado'}
                  </span>
                </div>
                <div>
                  <span className="t-caption text-ink-muted block">Dirección</span>
                  <span className="font-semibold text-ink block mt-0.5">
                    <MapPin size={13} className="inline mr-1 text-ink-muted" aria-hidden />
                    {proveedor.direccion || 'No registrada'}
                  </span>
                </div>
                <div>
                  <span className="t-caption text-ink-muted block">Comuna / Región</span>
                  <span className="font-semibold text-ink block mt-0.5">
                    {[proveedor.comuna, proveedor.region].filter(Boolean).join(', ') || 'No registrada'}
                  </span>
                </div>
                <Button variant="secondary" size="sm" className="w-full mt-2" onClick={openEdit}>
                  Editar información
                </Button>
              </div>
            </div>
          </Panel>
        }
        aside={
          <div className="hg-panel divide-y divide-line-subtle">
            <AsideSection
              title="Órdenes de compra"
              count={ordenes.length}
              open={asideOpen.oc}
              onToggle={() => setAsideOpen((p) => ({ ...p, oc: !p.oc }))}
            >
              {ordenes.length === 0 ? (
                <p className="t-caption text-ink-muted text-center py-4">Sin órdenes de compra registradas</p>
              ) : (
                ordenes.map((oc) => (
                  <div key={oc.id} className="rounded-control border border-line bg-surface p-3 space-y-2 hover:bg-surface-muted transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="t-num font-bold text-sm text-ink block">{clp(Number(oc.monto_total || 0))} CLP</span>
                        <div className="mt-0.5">
                          <CodeStamp>{oc.numero_oc}</CodeStamp>
                        </div>
                      </div>
                      <StatusBadge tone={ESTADO_TONE[oc.estado]}>{ESTADO_LABEL[oc.estado]}</StatusBadge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-ink-muted pt-1 border-t border-line-subtle">
                      <span className="inline-flex items-center gap-1 t-num">
                        <Clock size={12} aria-hidden />
                        {oc.fecha_emision ? new Date(`${oc.fecha_emision}T00:00:00`).toLocaleDateString('es-CL') : 'Sin fecha'}
                      </span>
                      <Button variant="subtle" size="sm" icon={Eye} onClick={() => setPreviewOrden(oc)}>
                        PDF
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <Link
                href="/ordenes-compra"
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
              >
                <span>Ir a órdenes de compra</span>
                <ExternalLink size={12} aria-hidden />
              </Link>
            </AsideSection>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="search"
              aria-label="Buscar en la ficha"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en actividad, notas y reclamos..."
              className="hg-field-compact min-h-9 w-full pl-9"
            />
          </div>

          <div role="tablist" aria-label="Secciones de la ficha" className="flex w-full items-center gap-0.5 rounded-xl bg-surface-muted p-1">
            {tabItems.map((item) => {
              const selected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-colors ${
                    selected ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                  {item.count !== undefined && <span className="t-num text-[11px] font-medium text-ink-muted">{item.count}</span>}
                </button>
              );
            })}
          </div>

          {(activeTab === 'actividad' || activeTab === 'notas') && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {activeTab === 'actividad' ? (
                <Select
                  aria-label="Filtrar actividad"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="hg-field-compact min-h-8"
                >
                  <option value="todos">Toda la actividad ({notas.length})</option>
                  <option value="nota">Notas generales</option>
                  <option value="reunion">Reuniones</option>
                  <option value="llamada">Llamadas telefónicas</option>
                  <option value="recordatorio">Avisos y recordatorios</option>
                  <option value="reclamo">Reclamos</option>
                </Select>
              ) : (
                <span />
              )}
              <Button variant="primary" size="sm" icon={Plus} onClick={() => openNota('nota')}>
                Nueva nota
              </Button>
            </div>
          )}

          {activeTab === 'actividad' &&
            (timeline.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Sin actividades registradas"
                description="No hay notas ni registros que coincidan con la búsqueda o el filtro."
                action={
                  <Button variant="secondary" size="sm" onClick={() => openNota('nota')}>
                    Crear una nota
                  </Button>
                }
              />
            ) : (
              <div className="space-y-5">
                {timeline.some((n) => n.tipo_actividad === 'recordatorio') && (
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-ink">Avisos y recordatorios</h3>
                    {timeline.filter((n) => n.tipo_actividad === 'recordatorio').map(renderItem)}
                  </section>
                )}
                {timeline.some((n) => n.tipo_actividad !== 'recordatorio') && (
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-semibold text-ink">Historial de actividad</h3>
                    {timeline.filter((n) => n.tipo_actividad !== 'recordatorio').map(renderItem)}
                  </section>
                )}
              </div>
            ))}

          {activeTab === 'notas' && (
            <div className="space-y-2.5">
              {notasFiltradas.length === 0 ? (
                <EmptyState icon={MessageSquare} title="Sin notas" description="Aún no hay notas que coincidan con la búsqueda." />
              ) : (
                notasFiltradas.map(renderItem)
              )}
            </div>
          )}

          {activeTab === 'reclamos' && (
            <div className="space-y-2.5">
              <div className="flex justify-end">
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openNota('reclamo')}>
                  Nuevo reclamo
                </Button>
              </div>
              {reclamosFiltrados.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="Sin reclamos"
                  description="No se registran reclamos ni incidencias con este proveedor."
                />
              ) : (
                reclamosFiltrados.map((rec) => (
                  <article key={rec.id} className="rounded-xl border border-danger-line bg-danger-soft/40 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-ink">
                        <span className="font-semibold">Reclamo</span>{' '}
                        <span className="text-ink-muted">por {rec.usuario?.nombre || 'Usuario CRM'}</span>
                      </p>
                      <span className="t-caption t-num">{new Date(rec.fecha).toLocaleDateString('es-CL')}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-ink">{rec.contenido}</p>
                  </article>
                ))
              )}
            </div>
          )}

          {activeTab === 'metricas' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-accent" />Total comprado</span>
                <span className="t-num block text-xl font-semibold text-ink">{clp(totalComprado)} CLP</span>
                <span className="t-caption block">{vigentes.length} {vigentes.length === 1 ? 'orden vigente' : 'órdenes vigentes'}</span>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-success" />Pagado en Caja</span>
                <span className="t-num block text-xl font-semibold text-ink">{clp(totalPagado)} CLP</span>
                <span className="t-caption block">Órdenes en estado pagada</span>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-warning" />Por pagar</span>
                <span className="t-num block text-xl font-semibold text-ink">{clp(totalPorPagar)} CLP</span>
                <span className="t-caption block">{ocAbiertas} {ocAbiertas === 1 ? 'orden abierta' : 'órdenes abiertas'}</span>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5">
                <span className="flex items-center gap-1.5 t-caption"><span aria-hidden className="h-2 w-2 rounded-full bg-danger" />Reclamos</span>
                <span className="t-num block text-xl font-semibold text-ink">{reclamos.length}</span>
                <span className="t-caption block">Registrados con este proveedor</span>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="t-caption font-semibold text-ink block">Próximo aviso</span>
                  {proximoAviso && proximoAviso.d.getTime() < ahora.getTime() && <StatusBadge tone="danger">Vencido</StatusBadge>}
                </div>
                {proximoAviso ? (
                  <>
                    <span className="font-semibold text-ink block truncate">{proximoAviso.n.contenido}</span>
                    <span className="t-caption t-num block">
                      {formatSantiagoDateTime(proximoAviso.n.fecha_recordatorio, proximoAviso.n.hora_recordatorio)}
                    </span>
                  </>
                ) : (
                  <span className="t-caption text-ink-muted italic">Sin avisos pendientes</span>
                )}
              </div>
            </div>
          )}
        </div>
      </RecordLayout>

      {/* Nueva nota / reclamo / aviso */}
      <Dialog
        open={showNotaDialog}
        onClose={() => setShowNotaDialog(false)}
        title={tipoActividad === 'reclamo' ? 'Nuevo reclamo' : tipoActividad === 'recordatorio' ? 'Nuevo aviso' : 'Nueva nota'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNotaDialog(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-nueva-nota-prov" variant="primary" icon={Send}>
              {tipoActividad === 'recordatorio' ? 'Guardar aviso' : tipoActividad === 'reclamo' ? 'Guardar reclamo' : 'Guardar nota'}
            </Button>
          </>
        }
      >
        <form id="form-nueva-nota-prov" onSubmit={handleAddNota} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Tipo de actividad</label>
              <Select
                value={tipoActividad}
                onChange={(e) => setTipoActividad(e.target.value as TipoNotaProveedor)}
                className="hg-field-compact w-full"
              >
                <option value="nota">Nota general</option>
                <option value="reunion">Reunión con proveedor</option>
                <option value="llamada">Llamada telefónica</option>
                <option value="recordatorio">Aviso / recordatorio</option>
                <option value="reclamo">Reclamo</option>
              </Select>
            </div>
            {tipoActividad === 'recordatorio' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block t-caption font-semibold text-ink mb-1">Fecha *</label>
                  <DateInput required value={fechaRecordatorio} onChange={(e) => setFechaRecordatorio(e.target.value)} className="hg-field text-xs" />
                </div>
                <div>
                  <label className="block t-caption font-semibold text-ink mb-1">Hora *</label>
                  <input type="time" required value={horaRecordatorio} onChange={(e) => setHoraRecordatorio(e.target.value)} className="hg-field text-xs" />
                </div>
              </div>
            )}
          </div>
          <textarea
            rows={3}
            required
            value={nuevaNota}
            onChange={(e) => setNuevaNota(e.target.value)}
            placeholder={
              tipoActividad === 'recordatorio'
                ? 'Escribe el detalle del aviso...'
                : tipoActividad === 'reclamo'
                  ? 'Describe el reclamo (producto, entrega, calidad...)'
                  : 'Escribe el detalle de la reunión, llamada o nota...'
            }
            className="hg-field text-xs p-3 leading-relaxed"
          />
        </form>
      </Dialog>

      {/* Editar proveedor */}
      <Dialog open={isEditing} onClose={() => setIsEditing(false)} title="Editar información del proveedor" size="lg">
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {editError && (
            <p role="alert" className="rounded-md border border-danger-line bg-danger-soft p-2.5 font-semibold text-danger">
              {editError}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Nombre o razón social *</label>
              <input type="text" required value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="hg-field" />
            </div>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">RUT *</label>
              <input type="text" required value={editRut} onChange={(e) => setEditRut(e.target.value)} className="hg-field t-num" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Rubro / especialidad</label>
              <input type="text" value={editRubro} onChange={(e) => setEditRubro(e.target.value)} className="hg-field" />
            </div>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Persona de contacto</label>
              <input type="text" value={editContacto} onChange={(e) => setEditContacto(e.target.value)} className="hg-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Teléfono</label>
              <input type="text" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} className="hg-field t-num" />
            </div>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Correo electrónico</label>
              <input type="email" value={editCorreo} onChange={(e) => setEditCorreo(e.target.value)} className="hg-field" />
            </div>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Dirección</label>
              <input type="text" value={editDireccion} onChange={(e) => setEditDireccion(e.target.value)} className="hg-field" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Región</label>
              <SearchableSelect
                value={editRegion}
                onChange={(val) => {
                  setEditRegion(val);
                  setEditComuna('');
                }}
                options={REGIONES_CHILE.map((r) => r.region)}
                placeholder="Seleccionar región..."
              />
            </div>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Comuna</label>
              <SearchableSelect
                value={editComuna}
                onChange={(val) => setEditComuna(val)}
                options={
                  editRegion
                    ? (REGIONES_CHILE.find((r) => r.region === editRegion)?.comunas || TODAS_COMUNAS_CHILE)
                    : TODAS_COMUNAS_CHILE
                }
                placeholder="Seleccionar comuna..."
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line-subtle">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </Dialog>

      <OrdenCompraPdfPreviewModal orden={previewOrden} onClose={() => setPreviewOrden(null)} />
    </div>
  );
}
