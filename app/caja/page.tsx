'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import {
  Abono,
  CuentaBancaria,
  MovimientoCaja,
} from '../../lib/types';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Landmark,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/context/AuthContext';
import { Pagination } from '../../components/Pagination';
import { mensajeError } from '../../lib/errores';
import {
  Panel,
  Button,
  IconButton,
  SearchField,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  Select,
} from '../../components/ui/crm';
import { useToast } from '../../components/ui/feedback';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { ColumnMenu, useColumnPrefs } from '../../components/ui/ColumnMenu';
import { MetricCard } from '../../components/ui/MetricCard';
import { Fab } from '../../components/ui/Fab';
import { PillTabs, PillTabsBar } from '../../components/ui/PillTabs';
import { CajaResumen } from '../../components/caja/CajaResumen';
import { CategoriasCostos } from '../../components/caja/CategoriasCostos';
import {
  MovimientoCajaDialog,
  EMPTY_CAJA_LOOKUPS,
  type CajaLookups,
} from '../../components/caja/MovimientoCajaDialog';
import { swrCache } from '../../lib/cache/swr-cache';

type AbonoCol = 'nv' | 'cliente' | 'monto' | 'fecha' | 'comprobante' | 'banco' | 'estado' | 'acciones';

const ABONO_COL_ORDER: AbonoCol[] = ['nv', 'cliente', 'monto', 'fecha', 'comprobante', 'banco', 'estado', 'acciones'];

const ABONO_COL_VISIBLE: Record<AbonoCol, boolean> = {
  nv: true,
  cliente: true,
  monto: true,
  fecha: true,
  comprobante: true,
  banco: true,
  estado: true,
  acciones: true,
};

const ABONO_COL_LABELS: Record<AbonoCol, string> = {
  nv: 'Nota de venta',
  cliente: 'Cliente',
  monto: 'Monto',
  fecha: 'Fecha y vendedor',
  comprobante: 'Comprobante',
  banco: 'Banco',
  estado: 'Estado',
  acciones: 'Acciones',
};

const ABONO_COL_ALIGN: Record<AbonoCol, string> = {
  nv: '',
  cliente: '',
  monto: 'text-right',
  fecha: '',
  comprobante: '',
  banco: '',
  estado: 'text-center',
  acciones: 'text-right',
};

export default function CajaPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const colPrefs = useColumnPrefs<AbonoCol>('hormiglass_abonos_cols_v1', ABONO_COL_ORDER, ABONO_COL_VISIBLE);
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const tabParam = searchParams.get('tab');
  const abonoParam = searchParams.get('abono');

  // Tabs
  const [activeTab, setActiveTab] = useState<'caja' | 'movimientos' | 'validacion' | 'categorias'>(
    tabParam === 'validacion' || abonoParam ? 'validacion' : tabParam === 'movimientos' ? 'movimientos' : tabParam === 'categorias' ? 'categorias' : 'caja'
  );
  const puedeVerCategorias = currentUser?.rol === 'admin';

  // Período de los gráficos y movimientos: por defecto el mes en curso, del día 1 hasta hoy.
  const [desde, setDesde] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [hasta, setHasta] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });

  // Estados principales con SWR para render instantáneo
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>(() => swrCache.get('caja:movimientos') || []);
  const [abonos, setAbonos] = useState<Abono[]>(() => swrCache.get('caja:abonos') || []);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>(() => swrCache.get('caja:cuentas') || []);
  const [lookups, setLookups] = useState<CajaLookups>(() => swrCache.get('caja:lookups') || EMPTY_CAJA_LOOKUPS);
  const [, setLoading] = useState<boolean>(() => !swrCache.has('caja:cuentas'));

  // Mapeo de banco seleccionado por abono pendiente: { [abonoId]: cuentaBancariaId }
  const [selectedBanks, setSelectedBanks] = useState<Record<string, string>>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal Rechazo
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [abonoToReject, setAbonoToReject] = useState<Abono | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');

  // Modal Registrar / Editar Movimiento Manual
  const [showModal, setShowModal] = useState(false);
  const [editingMov, setEditingMov] = useState<MovimientoCaja | null>(null);

  // Filtros de validación
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstadoAbono, setFiltroEstadoAbono] = useState<'todos' | 'pendiente' | 'validado' | 'rechazado'>('pendiente');

  // Paginación para historial de abonos
  const [abonosPage, setAbonosPage] = useState(1);
  const [abonosPerPage, setAbonosPerPage] = useState(10);

  // Cargar datos en paralelo con Promise.all
  const loadData = useCallback(async () => {
    try {
      const [
        cuentasRes,
        movsRes,
        abonosRes,
        catsRes,
        centrosRes,
        insumosRes,
        vehiculosRes,
        clientesRes,
        opsRes,
        provsRes,
        trabsRes,
      ] = await Promise.all([
        supabase
          .from('cuentas_bancarias')
          .select('*, empresa:empresas(*)')
          .eq('activo', true)
          .order('alias'),
        supabase
          .from('caja_movimientos')
          .select(`
            *,
            cuenta_bancaria:cuentas_bancarias(id, alias, banco, empresa:empresas(id, slug, razon_social)),
            categoria_rel:caja_categorias(id, nombre, tipo, clasificacion),
            subcategoria:caja_subcategorias(id, nombre),
            centro_costo:caja_centros_costo(id, codigo, nombre),
            insumo:caja_insumos(id, codigo, nombre, grupo, unidad),
            vehiculo:caja_vehiculos(id, nombre, patente),
            cliente:clientes(id, nombre, apellido_razon_social, rut),
            oportunidad:oportunidades(id, codigo, titulo, cliente_id),
            proveedor:proveedores(id, nombre),
            trabajador:trabajadores(id, nombre, cargo)
          `)
          .order('fecha', { ascending: false }),
        supabase
          .from('abonos')
          .select(`
            *,
            cuenta_bancaria:cuentas_bancarias(id, alias, banco),
            oportunidad:oportunidades(
              id,
              codigo,
              titulo,
              cliente:clientes(id, nombre, apellido_razon_social, rut)
            )
          `)
          .order('fecha', { ascending: false }),
        supabase.from('caja_categorias').select('*, subcategorias:caja_subcategorias(*)').order('orden'),
        supabase.from('caja_centros_costo').select('*').order('orden').order('nombre'),
        supabase.from('caja_insumos').select('*').order('orden').order('nombre'),
        supabase.from('caja_vehiculos').select('*').order('orden').order('nombre'),
        supabase.from('clientes').select('id, nombre, apellido_razon_social, rut').order('apellido_razon_social'),
        supabase.from('oportunidades').select('id, codigo, titulo, cliente_id').order('created_at', { ascending: false }),
        supabase.from('proveedores').select('id, nombre, rut').order('nombre'),
        supabase.from('trabajadores').select('id, nombre, cargo, activo').order('nombre'),
      ]);

      if (cuentasRes.data) {
        const cuentasData = cuentasRes.data as CuentaBancaria[];
        setCuentas(cuentasData);
        swrCache.set('caja:cuentas', cuentasData);
      }

      if (movsRes.data) {
        const movsData = movsRes.data as MovimientoCaja[];
        setMovimientos(movsData);
        swrCache.set('caja:movimientos', movsData);
      }

      if (abonosRes.error) {
        console.error('Error cargando abonos:', abonosRes.error);
      } else if (abonosRes.data) {
        const abonosData = abonosRes.data as Abono[];
        setAbonos(abonosData);
        swrCache.set('caja:abonos', abonosData);
      }

      const nextLookups: CajaLookups = {
        categorias: (catsRes.data || []) as CajaLookups['categorias'],
        centrosCosto: (centrosRes.data || []) as CajaLookups['centrosCosto'],
        insumos: (insumosRes.data || []) as CajaLookups['insumos'],
        vehiculos: (vehiculosRes.data || []) as CajaLookups['vehiculos'],
        clientes: (clientesRes.data || []) as CajaLookups['clientes'],
        oportunidades: (opsRes.data || []) as CajaLookups['oportunidades'],
        proveedores: (provsRes.data || []) as CajaLookups['proveedores'],
        trabajadores: (trabsRes.data || []) as CajaLookups['trabajadores'],
      };
      setLookups(nextLookups);
      swrCache.set('caja:lookups', nextLookups);
    } catch (err) {
      console.error('Error cargando datos de caja:', err);
      toast({ message: 'No se pudieron cargar los datos de caja.', tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar y suscripción Realtime
    void loadData();

    // Suscripción Realtime para abonos y movimientos con debounce
    let debounceTimer: number | null = null;
    const triggerDebouncedReload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void loadData();
      }, 300);
    };

    const channel = supabase
      .channel('caja_full_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_movimientos' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abonos' }, triggerDebouncedReload)
      .subscribe();

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  useEffect(() => {
    if (tabParam === 'movimientos' || tabParam === 'caja' || tabParam === 'validacion') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza la pestaña y la búsqueda con la URL
      setActiveTab(tabParam === 'validacion' ? 'validacion' : tabParam === 'movimientos' ? 'movimientos' : 'caja');
    }
    if (abonoParam) {
      setSearchTerm(abonoParam);
      setFiltroEstadoAbono('todos');
    }
  }, [tabParam, abonoParam]);

  // Asignar banco por defecto a abonos pendientes cuando se cargan las cuentas
  useEffect(() => {
    if (cuentas.length > 0 && abonos.length > 0) {
      const timer = setTimeout(() => {
        setSelectedBanks((prev) => {
          const next = { ...prev };
          abonos.forEach((ab) => {
            if (!next[ab.id]) {
              next[ab.id] = ab.cuenta_bancaria_id || cuentas[0].id;
            }
          });
          return next;
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [cuentas, abonos]);

  const abonosPendientes = abonos.filter((a) => a.estado === 'pendiente');
  const totalMontoPendiente = abonosPendientes.reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const abonosValidados = abonos.filter((a) => a.estado === 'validado');
  const totalMontoValidado = abonosValidados.reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const abonosRechazados = abonos.filter((a) => a.estado === 'rechazado');
  const totalMontoRechazado = abonosRechazados.reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const abonoMovIds = useMemo(
    () =>
      new Set(
        abonos
          .filter((a) => a.estado === 'validado' && a.caja_movimiento_id)
          .map((a) => a.caja_movimiento_id as string),
      ),
    [abonos],
  );

  // Apertura de comprobante seguro
  const handleVerComprobante = async (storedUrl?: string | null) => {
    if (!storedUrl) {
      toast({ message: 'El abono no tiene comprobante adjunto.', tone: 'warning' });
      return;
    }

    const publicMarker = '/storage/v1/object/public/documentos/';
    const privateMarker = '/storage/v1/object/sign/documentos/';
    const marker = storedUrl.includes(publicMarker) ? publicMarker : privateMarker;
    const path = storedUrl.includes(marker)
      ? decodeURIComponent(storedUrl.split(marker)[1].split('?')[0])
      : storedUrl;

    if (!path || /^https?:/i.test(path)) {
      window.open(storedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 120);
      if (error || !data?.signedUrl) {
        throw new Error(mensajeError(error, 'No se pudo generar el enlace seguro al comprobante.'));
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : 'Error al abrir comprobante',
        tone: 'danger',
      });
    }
  };

  // Validar Abono (Aprobación en 1 clic)
  const handleValidarAbono = async (abonoId: string) => {
    const cuentaId = selectedBanks[abonoId] || cuentas[0]?.id;
    if (!cuentaId) {
      toast({ message: 'Debes seleccionar una cuenta bancaria a la que ingresó el pago.', tone: 'warning' });
      return;
    }

    setActionLoadingId(abonoId);

    try {
      const { data, error } = await supabase.rpc('validar_abono', {
        p_abono_id: abonoId,
        p_cuenta_bancaria_id: cuentaId,
      });

      if (error) throw error;

      const estadoEtapa = data?.estado_pipeline === 'pagada' ? ' · Oportunidad en Pago Validado' : '';
      toast({
        message: `Pago validado exitosamente. Ingresado a ${data?.cuenta_bancaria_alias || 'Banco'}${estadoEtapa}.`,
        tone: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      console.error('Error al validar abono:', err);
      toast({
        message: mensajeError(err, 'No se pudo validar el abono. Verifica tus permisos.'),
        tone: 'danger',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Abrir modal de rechazo
  const handleOpenRejectModal = (abono: Abono) => {
    setAbonoToReject(abono);
    setRejectMotivo('');
    setRejectModalOpen(true);
  };

  // Confirmar rechazo de abono
  const handleConfirmReject = async () => {
    if (!abonoToReject) return;
    if (!rejectMotivo.trim()) {
      toast({ message: 'Debes ingresar el motivo del rechazo.', tone: 'warning' });
      return;
    }

    setActionLoadingId(abonoToReject.id);

    try {
      const { error } = await supabase.rpc('rechazar_abono', {
        p_abono_id: abonoToReject.id,
        p_motivo: rejectMotivo.trim(),
      });

      if (error) throw error;

      toast({ message: 'Abono rechazado. Se notificó el motivo a la vendedora.', tone: 'info' });
      setRejectModalOpen(false);
      setAbonoToReject(null);
      setRejectMotivo('');
      await loadData();
    } catch (err: unknown) {
      console.error('Error al rechazar abono:', err);
      toast({ message: mensajeError(err, 'No se pudo rechazar el abono.'), tone: 'danger' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Abrir modal de movimiento (nuevo o edición)
  const abrirNuevoMovimiento = () => {
    setEditingMov(null);
    setShowModal(true);
  };

  const abrirEditarMovimiento = (m: MovimientoCaja) => {
    setEditingMov(m);
    setShowModal(true);
  };

  // Filtrado de abonos
  const filteredAbonos = abonos.filter((a) => {
    if (filtroEstadoAbono !== 'todos' && a.estado !== filtroEstadoAbono) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCodigo = a.oportunidad?.codigo?.toLowerCase().includes(term);
      const matchTitulo = a.oportunidad?.titulo?.toLowerCase().includes(term);
      const clienteNombre = a.oportunidad?.cliente
        ? `${a.oportunidad.cliente.nombre || ''} ${a.oportunidad.cliente.apellido_razon_social || ''}`.trim()
        : '';
      const matchCliente =
        clienteNombre.toLowerCase().includes(term) ||
        (a.oportunidad?.cliente?.nombre_completo?.toLowerCase().includes(term) ?? false) ||
        (a.oportunidad?.cliente?.razon_social?.toLowerCase().includes(term) ?? false);
      const matchVendedora = a.creado_por_nombre?.toLowerCase().includes(term);
      const matchNota = a.nota?.toLowerCase().includes(term);
      return matchCodigo || matchTitulo || matchCliente || matchVendedora || matchNota;
    }
    return true;
  });

  // Paginación abonos
  const paginatedAbonos = filteredAbonos.slice(
    (abonosPage - 1) * abonosPerPage,
    abonosPage * abonosPerPage
  );

  return (
    <div className="hg-page space-y-5 pb-24">
      {/* Interruptor de secciones centrado y filtro de período */}
      <PillTabsBar
        tabs={
          <PillTabs
            label="Secciones de caja"
            items={[
              { id: 'caja', label: 'Caja' },
              { id: 'movimientos', label: 'Movimientos de caja' },
              { id: 'validacion', label: 'Validación de pagos', count: abonosPendientes.length },
              ...(puedeVerCategorias ? [{ id: 'categorias', label: 'Categorías de costos' }] : []),
            ]}
            active={activeTab}
            onChange={(id) => setActiveTab(id as 'caja' | 'movimientos' | 'validacion' | 'categorias')}
          />
        }
        right={
          activeTab !== 'validacion' && activeTab !== 'categorias' ? (
            <DateRangePicker
              from={desde}
              to={hasta}
              onChange={(d, h) => {
                setDesde(d);
                setHasta(h);
              }}
            />
          ) : undefined
        }
      />

      {/* PESTAÑA 1: VALIDACIÓN DE PAGOS */}
      {activeTab === 'validacion' && (
        <div className="space-y-4">
          {/* KPIs: mismas tarjetas del panel operativo; cada una filtra la tabla */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Por validar"
              value={abonosPendientes.length}
              icon={Clock}
              tone="warning"
              subtitle={`$${totalMontoPendiente.toLocaleString('es-CL')} esperando revisión`}
              active={filtroEstadoAbono === 'pendiente'}
              onClick={() => {
                setFiltroEstadoAbono('pendiente');
                setAbonosPage(1);
              }}
            />
            <MetricCard
              title="Validados"
              value={abonosValidados.length}
              icon={CheckCircle2}
              tone="success"
              subtitle={`$${totalMontoValidado.toLocaleString('es-CL')} ingresados a caja`}
              active={filtroEstadoAbono === 'validado'}
              onClick={() => {
                setFiltroEstadoAbono('validado');
                setAbonosPage(1);
              }}
            />
            <MetricCard
              title="Rechazados"
              value={abonosRechazados.length}
              icon={XCircle}
              tone="danger"
              subtitle={`$${totalMontoRechazado.toLocaleString('es-CL')} devueltos a ventas`}
              active={filtroEstadoAbono === 'rechazado'}
              onClick={() => {
                setFiltroEstadoAbono('rechazado');
                setAbonosPage(1);
              }}
            />
            <MetricCard
              title="Total de abonos"
              value={abonos.length}
              icon={Landmark}
              tone="info"
              subtitle={`$${(totalMontoPendiente + totalMontoValidado + totalMontoRechazado).toLocaleString('es-CL')} en total`}
              active={filtroEstadoAbono === 'todos'}
              onClick={() => {
                setFiltroEstadoAbono('todos');
                setAbonosPage(1);
              }}
            />
          </div>

          {/* Búsqueda y columnas */}
          <div className="flex flex-wrap items-center gap-3">
            <SearchField
              className="max-w-xs"
              placeholder="Buscar por NV, cliente o vendedora"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setAbonosPage(1);
              }}
            />
            <div className="ml-auto">
              <ColumnMenu labels={ABONO_COL_LABELS} prefs={colPrefs} locked={['acciones']} align="right" />
            </div>
          </div>

          {/* Tabla de Abonos */}
          <Panel>
            {(
              <div className="overflow-x-auto">
                <table className="hg-table w-full text-left text-xs min-w-[950px]">
                  <thead>
                    <tr>
                      {colPrefs.visibleOrder.map((k) => (
                        <th key={k} className={`p-3 ${ABONO_COL_ALIGN[k]}`}>{ABONO_COL_LABELS[k]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAbonos.length === 0 && (
                      <tr>
                        <td colSpan={colPrefs.visibleOrder.length || 1} className="p-10 text-center text-ink-muted">
                          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success opacity-50" />
                          <p className="text-sm font-semibold text-ink">No hay comprobantes en este estado.</p>
                        </td>
                      </tr>
                    )}
                    {paginatedAbonos.map((ab) => {
                      const isPending = ab.estado === 'pendiente';
                      const isActing = actionLoadingId === ab.id;

                        const celdas: Record<AbonoCol, React.ReactNode> = {
                          nv: (
                          <td className="p-3 align-top">
                            <CodeStamp title={ab.oportunidad?.titulo || 'Venta'}>
                              {ab.oportunidad?.codigo || 'NV-S/C'}
                            </CodeStamp>
                            <div className="t-caption truncate max-w-[180px] mt-1">
                              {ab.oportunidad?.titulo || 'Venta'}
                            </div>
                            {ab.nota && (
                              <div className="t-micro text-ink-muted italic mt-0.5">
                                «{ab.nota}»
                              </div>
                            )}
                          </td>
                          ),
                          cliente: (
                          <td className="p-3 align-top">
                            <div className="font-semibold text-ink">
                              {ab.oportunidad?.cliente?.apellido_razon_social ||
                                ab.oportunidad?.cliente?.nombre ||
                                ab.oportunidad?.cliente?.razon_social ||
                                ab.oportunidad?.cliente?.nombre_completo ||
                                'Cliente no especificado'}
                            </div>
                            {ab.oportunidad?.cliente?.rut && (
                              <div className="font-mono t-micro text-ink-muted mt-0.5">
                                {ab.oportunidad?.cliente?.rut}
                              </div>
                            )}
                          </td>
                          ),
                          monto: (
                          <td className="p-3 align-top text-right">
                            <span className="t-num font-semibold text-sm text-success">
                              +${Number(ab.monto || 0).toLocaleString('es-CL')}
                            </span>
                          </td>
                          ),
                          fecha: (
                          <td className="p-3 align-top text-ink-muted">
                            <div className="t-num">
                              {new Date(ab.fecha).toLocaleDateString('es-CL', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className="t-micro text-accent-ink font-semibold mt-0.5">
                              {ab.creado_por_nombre || 'Equipo Comercial'}
                            </div>
                          </td>
                          ),
                          comprobante: (
                          <td className="p-3 align-top">
                            {ab.comprobante_url ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                icon={Eye}
                                onClick={() => void handleVerComprobante(ab.comprobante_url)}
                              >
                                <span className="truncate max-w-[110px]">
                                  {ab.comprobante_nombre || 'Ver archivo'}
                                </span>
                              </Button>
                            ) : (
                              <span className="text-ink-muted italic t-micro">Sin archivo</span>
                            )}
                          </td>
                          ),
                          banco: (
                          <td className="p-3 align-top">
                            {isPending ? (
                              <Select
                                value={selectedBanks[ab.id] || cuentas[0]?.id || ''}
                                onChange={(e) =>
                                  setSelectedBanks((prev) => ({
                                    ...prev,
                                    [ab.id]: e.target.value,
                                  }))
                                }
                                className="hg-field py-1 text-xs max-w-[200px]"
                              >
                                {cuentas.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.alias} · {c.banco}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <div className="text-ink font-medium flex items-center gap-1.5">
                                <Landmark className="w-3.5 h-3.5 text-ink-muted" />
                                <span>{ab.cuenta_bancaria?.alias || 'Banco asignado'}</span>
                              </div>
                            )}
                          </td>
                          ),
                          estado: (
                          <td className="p-3 align-top text-center">
                            {ab.estado === 'pendiente' && (
                              <StatusBadge tone="warning">Por validar</StatusBadge>
                            )}
                            {ab.estado === 'validado' && (
                              <StatusBadge tone="success">Validado</StatusBadge>
                            )}
                            {ab.estado === 'rechazado' && (
                              <div className="inline-flex flex-col items-center">
                                <StatusBadge tone="danger">Rechazado</StatusBadge>
                                {ab.motivo_rechazo && (
                                  <p className="t-micro text-danger mt-1 max-w-[120px] truncate" title={ab.motivo_rechazo}>
                                    «{ab.motivo_rechazo}»
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          ),
                          acciones: (
                          <td className="p-3 align-top text-right">
                            {isPending ? (
                              <div className="inline-flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={Check}
                                  disabled={isActing}
                                  onClick={() => void handleValidarAbono(ab.id)}
                                >
                                  {isActing ? 'Validando…' : 'Validar'}
                                </Button>

                                <IconButton
                                  icon={X}
                                  label="Rechazar comprobante"
                                  disabled={isActing}
                                  onClick={() => handleOpenRejectModal(ab)}
                                />
                              </div>
                            ) : (
                              <div className="t-micro text-ink-muted">
                                {ab.validado_por_nombre && (
                                  <span>Por: {ab.validado_por_nombre}</span>
                                )}
                              </div>
                            )}
                          </td>
                          ),
                        };
                      return (
                        <tr key={ab.id}>
                          {colPrefs.visibleOrder.map((k) => React.cloneElement(celdas[k] as React.ReactElement, { key: k }))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación de abonos */}
            <div className="p-3 border-t border-line-subtle">
              <Pagination
                currentPage={abonosPage}
                totalItems={filteredAbonos.length}
                itemsPerPage={abonosPerPage}
                onPageChange={setAbonosPage}
                onItemsPerPageChange={setAbonosPerPage}
              />
            </div>
          </Panel>
        </div>
      )}

      {/* CAJA (resumen y gráficos) y MOVIMIENTOS */}
      {(activeTab === 'caja' || activeTab === 'movimientos') && (
        <CajaResumen
          vista={activeTab === 'movimientos' ? 'movimientos' : 'resumen'}
          desde={desde}
          hasta={hasta}
          movimientos={movimientos}
          cuentas={cuentas}
          lookups={lookups}
          canEdit={currentUser?.rol === 'admin'}
          abonoMovIds={abonoMovIds}
          onEditMovimiento={abrirEditarMovimiento}
          onVerMovimientos={() => setActiveTab('movimientos')}
          onReload={loadData}
        />
      )}

      {activeTab === 'categorias' && puedeVerCategorias && <CategoriasCostos />}

      {/* MODAL: Rechazar Abono con Motivo */}
      <Dialog
        open={rejectModalOpen && !!abonoToReject}
        title="Rechazar comprobante de pago"
        onClose={() => setRejectModalOpen(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRejectModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoadingId === abonoToReject?.id}
              onClick={() => void handleConfirmReject()}
            >
              {actionLoadingId === abonoToReject?.id ? 'Rechazando…' : 'Confirmar rechazo'}
            </Button>
          </>
        }
      >
        {abonoToReject && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-control border border-danger-line bg-danger-soft space-y-1">
              <p className="font-semibold text-danger">
                Abono de ${Number(abonoToReject.monto || 0).toLocaleString('es-CL')}
              </p>
              <p className="text-danger">
                {abonoToReject.oportunidad?.codigo} — {abonoToReject.oportunidad?.titulo}
              </p>
              <p className="t-micro text-danger">
                Subido por: {abonoToReject.creado_por_nombre || 'Equipo Comercial'}
              </p>
            </div>

            <Field
              label="Motivo del rechazo"
              required
              hint="Este mensaje se enviará como notificación a la vendedora para que suba el comprobante correcto."
            >
              {({ id, 'aria-describedby': ariaDescribedBy }) => (
                <textarea
                  id={id}
                  rows={3}
                  required
                  aria-describedby={ariaDescribedBy}
                  placeholder="Ej: El comprobante no coincide con la cartola / Faltan datos de la transferencia..."
                  value={rejectMotivo}
                  onChange={(e) => setRejectMotivo(e.target.value)}
                  className="hg-field w-full p-2.5"
                />
              )}
            </Field>
          </div>
        )}
      </Dialog>

      {/* MODAL: Registrar / Editar Movimiento Manual */}
      <MovimientoCajaDialog
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingMov(null);
        }}
        movimiento={editingMov}
        cuentas={cuentas}
        lookups={lookups}
        usuarioId={currentUser?.id || null}
        vinculadoAbono={!!editingMov && abonoMovIds.has(editingMov.id)}
        onSaved={loadData}
      />

      {activeTab !== 'categorias' && currentUser?.rol === 'admin' && (
        <Fab label="Registrar movimiento" onClick={abrirNuevoMovimiento} />
      )}
    </div>
  );
}
