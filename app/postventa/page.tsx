'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,

  HardHat,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useClienteOpciones } from '../../lib/clientes-opciones';
import type {
  CasoPostventa,
  CausaRaizPostventa,
  OportunidadVenta,
  ProductoCatalogo,
  ResolucionPostventa,
  TipoProblemaPostventa,
  Trabajador,
  Usuario,
} from '../../lib/types';
import { mensajeError } from '../../lib/errores';
import { etiquetaProducto } from '../../lib/productos';
import {
  Button,
  Dialog,
  Panel,
  Tabs,
} from '../../components/ui/crm';
import {
  CAUSAS_RAIZ,
  ESTADOS_MAP,
  RESOLUCIONES_MAP,
  TIPOS_PROBLEMA,
  columnaDe,
  type ColumnaPostventa,
} from '../../lib/postventa-config';
import { useToast } from '../../components/ui/feedback';
import { MetricCard } from '../../components/ui/MetricCard';
import { SearchSelect } from '../../components/ui/SearchSelect';
import { DatePicker } from '../../components/ui/DatePicker';
import { RankingBarChart } from '../../components/dashboard/RankingBarChart';
import { ColumnChart, RadialGauge, StackedBar, TreemapChart } from '../../components/dashboard/visuals';
import {
  FilterBar,
  FilterMenu,
  useFilterUi,
  matchNumberFilter,
  matchMultiFilter,
  type FilterDefinition,
} from '../../components/ui/FilterPills';


export default function PostventaPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();

  const [casos, setCasos] = useState<CasoPostventa[]>([]);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [columnaDestino, setColumnaDestino] = useState<ColumnaPostventa | null>(null);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  // Vista activa
  const [vista, setVista] = useState<'tablero' | 'metricas'>('tablero');

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const filterUi = useFilterUi();
  const fv = (id: string, none: string) => {
    const v = activeFilters[id];
    return v && v !== 'todos' ? v : none;
  };
  const filtroEstado = fv('estado', 'todos');
  const filtroCausa = fv('causa', 'todas');
  const filtroResolucion = fv('resolucion', 'todas');
  const filtroCuadrilla = fv('cuadrilla', 'todas');
  const setFilter = (id: string, value: string | null) =>
    setActiveFilters((prev) => {
      const next = { ...prev };
      if (value === null || prev[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });

  // Estados UI
  const [loading, setLoading] = useState(true);

  // Modales
  const [showNuevoModal, setShowNuevoModal] = useState(false);

  // Formulario nuevo caso
  const [nuevoForm, setNuevoForm] = useState({
    oportunidad_id: '',
    cliente_id: '',
    obra: '',
    producto_id: '',
    producto_texto: '',
    tipo: 'problema_instalacion' as TipoProblemaPostventa,
    descripcion: '',
    cuadrilla_id: '',
    vendedor_id: '',
    causa_raiz: 'Sin determinar' as CausaRaizPostventa,
    resolucion: 'en_evaluacion' as ResolucionPostventa,
    fecha_reclamo: new Date().toISOString().split('T')[0],
    fecha_compromiso: '',
  });

  const clientesSel = useClienteOpciones(nuevoForm.cliente_id);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: casosData, error: casosErr },
      { data: opsData },
      { data: trabData },
      { data: usrsData },
      { data: prodsData },
    ] = await Promise.all([
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
        .order('created_at', { ascending: false }),
      supabase.from('oportunidades').select('id, codigo, titulo, cliente_id, asignado_a').order('codigo'),
      supabase.from('trabajadores').select('*').order('nombre'),
      supabase.from('usuarios').select('id, nombre, email, rol').order('nombre'),
      supabase.from('catalogo_productos').select('id, codigo, nombre, unidad').order('nombre'),
    ]);

    if (casosErr) {
      toast({ message: mensajeError(casosErr), tone: 'danger' });
    } else {
      const data = (casosData || []) as unknown as CasoPostventa[];
      setCasos(data);
    }

    if (opsData) setOportunidades(opsData as OportunidadVenta[]);
    if (trabData) setTrabajadores(trabData as Trabajador[]);
    if (usrsData) setUsuarios(usrsData as Usuario[]);
    if (prodsData) setProductos(prodsData as ProductoCatalogo[]);

    setLoading(false);
  }, [supabase, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar
    void loadData();
  }, [loadData]);

  // Filtrado
  const casosFiltrados = useMemo(() => {
    return casos.filter((c) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const clienteNom = c.cliente?.apellido_razon_social || c.cliente?.nombre || '';
        const match =
          c.folio?.toLowerCase().includes(q) ||
          c.descripcion?.toLowerCase().includes(q) ||
          c.obra?.toLowerCase().includes(q) ||
          c.oportunidad?.codigo?.toLowerCase().includes(q) ||
          clienteNom.toLowerCase().includes(q) ||
          (c.producto_texto && c.producto_texto.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (!matchMultiFilter(filtroEstado, (v) => columnaDe(c.estado) === v)) return false;
      if (!matchMultiFilter(filtroCausa, (v) => c.causa_raiz === v)) return false;
      if (!matchMultiFilter(filtroResolucion, (v) => c.resolucion === v)) return false;
      if (!matchMultiFilter(filtroCuadrilla, (v) => c.cuadrilla_id === v)) return false;
      if (!matchNumberFilter(activeFilters.costo, Number(c.costo_total || 0))) return false;

      return true;
    });
  }, [casos, busqueda, filtroEstado, filtroCausa, filtroResolucion, filtroCuadrilla, activeFilters.costo]);

  // KPIs
  const stats = useMemo(() => {
    const total = casos.length;
    const cerrados = casos.filter((c) => ['cerrado', 'resuelto'].includes(c.estado)).length;
    const costoTotal = casos.reduce((acc, c) => acc + Number(c.costo_total || 0), 0);
    const garantias = casos.filter((c) => c.resolucion === 'garantia').length;
    const tasaGarantia = total > 0 ? Math.round((garantias / total) * 100) : 0;

    const causasCount: Record<string, number> = {};
    for (const c of casos) {
      const cr = c.causa_raiz || 'Sin determinar';
      causasCount[cr] = (causasCount[cr] || 0) + 1;
    }

    return { total, cerrados, costoTotal, tasaGarantia, causasCount };
  }, [casos]);

  const moverCaso = async (casoId: string, destino: ColumnaPostventa) => {
    const caso = casos.find((c) => c.id === casoId);
    if (!caso || columnaDe(caso.estado) === destino) return;
    if (destino === 'cerrado') {
      toast({ message: 'Para cerrar un caso completa el paso Cierre en su ficha.', tone: 'warning' });
      router.push(`/postventa/${casoId}`);
      return;
    }
    const anterior = caso.estado;
    setCasos((prev) => prev.map((c) => (c.id === casoId ? { ...c, estado: destino } : c)));
    const { error } = await supabase.from('postventa_casos').update({ estado: destino }).eq('id', casoId);
    if (error) {
      setCasos((prev) => prev.map((c) => (c.id === casoId ? { ...c, estado: anterior } : c)));
      toast({ message: mensajeError(error), tone: 'danger' });
    } else {
      toast({ message: `${caso.folio} → ${ESTADOS_MAP[destino].label}`, tone: 'success' });
    }
  };

  const filterDefinitions: FilterDefinition[] = useMemo(() => [
    {
      id: 'estado',
      label: 'Estado',
      allLabel: 'Todos los estados',
      options: [
        { value: 'recibido', label: 'Recibido' },
        { value: 'en_revision', label: 'En revisión' },
        { value: 'visita_programada', label: 'Visita programada' },
        { value: 'reparacion_programada', label: 'Reparación programada' },
        { value: 'cerrado', label: 'Cerrado' },
      ],
    },
    {
      id: 'causa',
      label: 'Causa raíz',
      allLabel: 'Todas las causas',
      options: CAUSAS_RAIZ.map((c) => ({ value: c, label: c })),
    },
    {
      id: 'resolucion',
      label: 'Resolución',
      allLabel: 'Todas las resoluciones',
      options: Object.entries(RESOLUCIONES_MAP).map(([key, item]) => ({ value: key, label: item.label })),
    },
    {
      id: 'cuadrilla',
      label: 'Cuadrilla',
      allLabel: 'Todas las cuadrillas',
      options: trabajadores.map((t) => ({ value: t.id, label: t.nombre })),
    },
    { id: 'costo', label: 'Costo total', type: 'number', options: [] },
  ], [trabajadores]);

  // Datos para la vista de gráficos (respeta los filtros aplicados)
  const analitica = useMemo(() => {
    const palette = [
      'var(--hg-accent)', 'var(--hg-info)', 'var(--hg-success)', 'var(--hg-warning)',
      'var(--hg-danger)', 'var(--hg-accent-ink)', 'var(--hg-text)', 'var(--hg-border)',
    ];
    const causas: Record<string, { n: number; costo: number }> = {};
    const estados = { recibido: 0, en_revision: 0, visita_programada: 0, reparacion_programada: 0, cerrado: 0 };
    const porCuadrilla: Record<string, { casos: number; costo: number }> = {};
    let cerrados = 0;
    let conGarantia = 0;

    for (const c of casosFiltrados) {
      const causa = c.causa_raiz || 'Sin determinar';
      causas[causa] = causas[causa] || { n: 0, costo: 0 };
      causas[causa].n += 1;
      causas[causa].costo += Number(c.costo_total || 0);

      if (['recibido', 'abierto'].includes(c.estado)) estados.recibido += 1;
      else if (['en_revision', 'en_curso'].includes(c.estado)) estados.en_revision += 1;
      else if (['visita_programada', 'programado'].includes(c.estado)) estados.visita_programada += 1;
      else if (c.estado === 'reparacion_programada') estados.reparacion_programada += 1;
      else if (['cerrado', 'resuelto'].includes(c.estado)) estados.cerrado += 1;

      if (['cerrado', 'resuelto'].includes(c.estado)) cerrados += 1;
      if (c.resolucion === 'garantia') conGarantia += 1;

      const key = c.cuadrilla_id || 'sin_asignar';
      porCuadrilla[key] = porCuadrilla[key] || { casos: 0, costo: 0 };
      porCuadrilla[key].casos += 1;
      porCuadrilla[key].costo += Number(c.costo_total || 0);
    }

    const total0 = casosFiltrados.length === 0;
    const causaSegments = CAUSAS_RAIZ.filter((k) => total0 || causas[k]?.n)
      .map((k, i) => ({ id: k, label: k, value: causas[k]?.n ?? 0, color: palette[i % palette.length], sublabel: 'casos' }));
    const causaCostos = CAUSAS_RAIZ.filter((k) => causas[k]?.costo || !Object.values(causas).some((v) => v.costo))
      .map((k) => ({ id: k, label: k, value: causas[k]?.costo ?? 0, sub: `${causas[k]?.n ?? 0} casos` }));
    const estadoSegments = [
      { id: 'recibido', label: 'Recibido', value: estados.recibido, color: 'bg-ink-muted' },
      { id: 'en_revision', label: 'En revisión', value: estados.en_revision, color: 'bg-warning' },
      { id: 'visita_programada', label: 'Visita programada', value: estados.visita_programada, color: 'bg-info' },
      { id: 'reparacion_programada', label: 'Reparación programada', value: estados.reparacion_programada, color: 'bg-accent' },
      { id: 'cerrado', label: 'Cerrado', value: estados.cerrado, color: 'bg-success' },
    ];
    const cuadrillasConCasos = Object.entries(porCuadrilla)
      .map(([id, v]) => {
        const t = trabajadores.find((w) => w.id === id);
        return { id, nombre: t?.nombre || 'Sin cuadrilla', cargo: t?.cargo, casos: v.casos, costo: v.costo };
      })
      .sort((a, b) => b.casos - a.casos);
    // Sin casos: se muestran las cuadrillas/maestros en cero para conservar la forma del gráfico.
    const operativos = trabajadores.filter(
      (t) => t.area?.includes('Operaciones') || t.area?.includes('Taller') || t.cargo?.includes('Maestro') || t.cargo?.includes('Instalación')
    );
    const cuadrillas = cuadrillasConCasos.length > 0
      ? cuadrillasConCasos
      : (operativos.length > 0 ? operativos : trabajadores).slice(0, 8)
          .map((t) => ({ id: t.id, nombre: t.nombre, cargo: t.cargo, casos: 0, costo: 0 }));
    const total = casosFiltrados.length;

    return {
      causaSegments, causaCostos, estadoSegments, cuadrillas,
      cerrados, conGarantia,
      pctCerrados: total > 0 ? Math.round((cerrados / total) * 100) : 0,
    };
  }, [casosFiltrados, trabajadores]);

  // Autocompletar datos cuando se selecciona oportunidad en nuevo caso
  const handleSelectOportunidad = (opId: string) => {
    const op = oportunidades.find((o) => o.id === opId);
    if (!op) {
      setNuevoForm((prev) => ({ ...prev, oportunidad_id: opId }));
      return;
    }
    setNuevoForm((prev) => ({
      ...prev,
      oportunidad_id: op.id,
      cliente_id: op.cliente_id || prev.cliente_id,
      vendedor_id: op.asignado_a || prev.vendedor_id,
      obra: op.titulo || prev.obra,
    }));
  };

  // Crear nuevo caso
  const handleCrearCaso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoForm.oportunidad_id || !nuevoForm.descripcion.trim()) {
      toast({ message: 'Debes asociar una Nota de Venta (Oportunidad) y describir el reclamo.', tone: 'warning' });
      return;
    }

    const payload = {
      oportunidad_id: nuevoForm.oportunidad_id,
      cliente_id: nuevoForm.cliente_id || null,
      vendedor_id: nuevoForm.vendedor_id || null,
      cuadrilla_id: nuevoForm.cuadrilla_id || null,
      obra: nuevoForm.obra.trim() || null,
      producto_id: nuevoForm.producto_id || null,
      producto_texto: nuevoForm.producto_texto.trim() || null,
      tipo: nuevoForm.tipo,
      descripcion: nuevoForm.descripcion.trim(),
      causa_raiz: nuevoForm.causa_raiz,
      resolucion: nuevoForm.resolucion,
      fecha_reclamo: nuevoForm.fecha_reclamo || new Date().toISOString().split('T')[0],
      fecha_compromiso: nuevoForm.fecha_compromiso || null,
      estado: 'recibido',
      antecedentes_venta: {
        cotizado_verificado: false,
        contratado_verificado: false,
        entregado_verificado: false,
        condiciones_terreno: '',
        observaciones_instalacion: '',
        guia_recepcion_verificada: false,
        pagos_al_dia: false,
      },
    };

    const { data: nuevo, error: errInsert } = await supabase
      .from('postventa_casos')
      .insert(payload)
      .select()
      .single();

    if (errInsert) {
      toast({ message: mensajeError(errInsert), tone: 'danger' });
    } else {
      toast({ message: `Caso creado con éxito con folio ${nuevo.folio}`, tone: 'success' });
      setShowNuevoModal(false);
      await loadData();
    }
  };

  const tabsVista = [
    { id: 'tablero', label: 'Tablero' },
    { id: 'metricas', label: 'Análisis' },
  ];

  return (
    <div className="space-y-4 pb-12">
      {/* KPIs (clic para filtrar) */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1">
        <MetricCard
          compact
          className="min-w-[150px] flex-1"
          title="Casos totales"
          value={stats.total}
          icon={ShieldAlert}
          tone="neutral"
          active={Object.keys(activeFilters).length === 0}
          onClick={() => setActiveFilters({})}
        />
        <MetricCard
          compact
          className="min-w-[150px] flex-1"
          title="Resueltos"
          value={stats.cerrados}
          icon={CheckCircle2}
          tone="success"
          active={filtroEstado === 'cerrado'}
          onClick={() => setFilter('estado', 'cerrado')}
        />
        <MetricCard
          compact
          className="min-w-[150px] flex-1"
          title="Costo imputado"
          value={`$${stats.costoTotal.toLocaleString('es-CL')}`}
          icon={Wallet}
          tone="danger"
        />
        <MetricCard
          compact
          className="min-w-[150px] flex-1"
          title="Con garantía"
          value={`${stats.tasaGarantia}%`}
          icon={Shield}
          tone="info"
          active={filtroResolucion === 'garantia'}
          onClick={() => setFilter('resolucion', 'garantia')}
        />
      </div>

      {/* Barra de herramientas: búsqueda, filtros, vistas y acción principal */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
            <input
              type="text"
              aria-label="Buscar casos de postventa"
              placeholder="Buscar por folio, cliente, NV, obra o descripción..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink shadow-[var(--hg-shadow-card)] placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>
          <FilterMenu
            triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
            filters={filterDefinitions}
            activeFilters={activeFilters}
            ui={filterUi}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs items={tabsVista} active={vista} onChange={(v) => setVista(v as typeof vista)} />
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setNuevoForm({
                oportunidad_id: '',
                cliente_id: '',
                obra: '',
                producto_id: '',
                producto_texto: '',
                tipo: 'problema_instalacion',
                descripcion: '',
                cuadrilla_id: '',
                vendedor_id: '',
                causa_raiz: 'Sin determinar',
                resolucion: 'en_evaluacion',
                fecha_reclamo: new Date().toISOString().split('T')[0],
                fecha_compromiso: '',
              });
              setShowNuevoModal(true);
            }}
          >
            Nuevo caso
          </Button>
        </div>
      </div>

      <FilterBar
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => setFilter(id, val === 'todos' ? null : val)}
        onClearAll={() => {
          setActiveFilters({});
          setBusqueda('');
        }}
        ui={filterUi}
      />

      {/* VISTA 1: TABLERO */}
      {vista === 'tablero' && loading && (
        <Panel>
          <p className="p-5 text-sm text-ink-muted">Cargando casos de postventa…</p>
        </Panel>
      )}
      {vista === 'tablero' && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-4">
          {(['recibido', 'en_revision', 'visita_programada', 'reparacion_programada', 'cerrado'] as ColumnaPostventa[]).map((est) => {
            const conf = ESTADOS_MAP[est];
            const tarjetas = casosFiltrados.filter((c) => columnaDe(c.estado) === est);

            return (
              <div
                key={est}
                onDragOver={(e) => {
                  if (!arrastrando) return;
                  e.preventDefault();
                  setColumnaDestino(est);
                }}
                onDragLeave={() => setColumnaDestino((c) => (c === est ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = arrastrando;
                  setArrastrando(null);
                  setColumnaDestino(null);
                  if (id) void moverCaso(id, est);
                }}
                className={`rounded-panel border bg-surface-muted p-2.5 flex flex-col min-h-[500px] transition-colors ${
                  columnaDestino === est ? 'border-accent bg-accent-soft' : 'border-line'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-line-subtle mb-2">
                  <span className="text-xs font-bold text-ink">{conf.label}</span>
                  <span className="hg-list-count">{tarjetas.length}</span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {tarjetas.map((c) => (
                    <article
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', c.id);
                        setArrastrando(c.id);
                      }}
                      onDragEnd={() => {
                        setArrastrando(null);
                        setColumnaDestino(null);
                      }}
                      onClick={() => router.push(`/postventa/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/postventa/${c.id}`);
                        }
                      }}
                      className={`cursor-grab space-y-2 rounded-control border border-line bg-surface p-3 shadow-xs transition-colors active:cursor-grabbing ${arrastrando === c.id ? 'opacity-50' : ''} hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                    >
                      <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{c.descripcion}</h3>
                      <p className="t-caption t-num text-ink-muted">{c.folio}</p>
                      <div className="border-t border-line-subtle pt-2 text-xs">
                        <span className="t-num font-semibold text-ink">
                          ${Number(c.costo_total || 0).toLocaleString('es-CL')}
                        </span>
                      </div>
                    </article>
                  ))}
                  {tarjetas.length === 0 && (
                    <div className="text-center py-10 t-caption text-ink-muted">Sin casos en esta etapa</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA 3: MÉTRICAS Y CAUSA RAÍZ */}
      {vista === 'metricas' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <ColumnChart
              title="Distribución por causa raíz"
              hint="Cantidad de casos según el origen de la falla"
              data={analitica.causaSegments.map((c) => ({ label: c.label, a: c.value }))}
              aLabel="Casos"
              format={(n) => String(n)}
              showEmpty
            />
            <RadialGauge
              title="Casos resueltos"
              hint="Porcentaje de los casos filtrados que ya se resolvieron"
              percent={analitica.pctCerrados}
              centerLabel="resueltos"
              rows={[
                { label: 'Resueltos', value: String(analitica.cerrados), dot: 'bg-success' },
                { label: 'Con garantía', value: String(analitica.conGarantia), dot: 'bg-info' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <ColumnChart
              title="Reclamos por cuadrilla / maestro"
              hint="Cantidad de casos asignados a cada uno"
              data={analitica.cuadrillas.slice(0, 8).map((q) => ({ label: q.nombre, a: q.casos }))}
              aLabel="Casos"
              format={(n) => String(n)}
              showEmpty
            />
            <RankingBarChart
              title="Costo imputado por cuadrilla"
              icon={HardHat}
              items={(analitica.cuadrillas.some((q) => q.costo > 0) ? analitica.cuadrillas.filter((q) => q.costo > 0) : analitica.cuadrillas)
                .map((q) => ({
                  id: q.id,
                  title: q.nombre,
                  subtitle: q.cargo,
                  count: q.casos,
                  countLabel: 'casos',
                  monto: q.costo,
                  avatarText: q.nombre,
                }))}
              emptyMessage=""
              maxItems={6}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <StackedBar
              title="Casos por estado"
              hint="Dónde está cada caso en el proceso"
              segments={analitica.estadoSegments}
              showEmpty
            />
            <TreemapChart
              title="Costo por causa raíz"
              hint="Más grande, más costo imputado"
              items={analitica.causaCostos}
              showEmpty
            />
          </div>
        </div>
      )}

      {/* DIÁLOGO: NUEVO CASO */}
      <Dialog
        open={showNuevoModal}
        onClose={() => setShowNuevoModal(false)}
        title="Nuevo caso"
        description="Reclamo o postventa asociado a una Nota de Venta."
        size="lg"
      >
        <form onSubmit={handleCrearCaso} className="space-y-5 text-xs">
          <section className="space-y-3">
            <h4 className="t-section text-ink">Venta asociada</h4>
            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Nota de Venta *</label>
              <SearchSelect
                value={nuevoForm.oportunidad_id}
                onChange={handleSelectOportunidad}
                placeholder="Buscar por código o título"
                searchPlaceholder="Buscar nota de venta..."
                searchable
                menuMinWidth={360}
                options={oportunidades.map((op) => ({ value: op.id, label: op.codigo, hint: op.titulo }))}
              />
              <input
                tabIndex={-1}
                aria-hidden
                required
                value={nuevoForm.oportunidad_id}
                onChange={() => {}}
                className="sr-only"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Cliente</label>
                <SearchSelect
                  value={nuevoForm.cliente_id}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, cliente_id: v })}
                  placeholder="Seleccionar cliente"
                  searchPlaceholder="Buscar por nombre o RUT..."
                  searchable
                  menuMinWidth={320}
                  options={clientesSel.opciones}
                  onSearch={clientesSel.onSearch}
                />
              </div>
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Obra / ubicación</label>
                <input
                  value={nuevoForm.obra}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, obra: e.target.value })}
                  placeholder="Lugar de la instalación"
                  className="hg-field-compact w-full"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-line-subtle pt-4">
            <h4 className="t-section text-ink">Problema</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Tipo de problema</label>
                <SearchSelect
                  value={nuevoForm.tipo}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, tipo: v as TipoProblemaPostventa })}
                  options={TIPOS_PROBLEMA}
                  searchPlaceholder="Buscar tipo..."
                  searchable
                />
              </div>
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Producto afectado</label>
                <SearchSelect
                  value={nuevoForm.producto_id}
                  onChange={(v) => {
                    const prod = productos.find((p) => p.id === v);
                    setNuevoForm({
                      ...nuevoForm,
                      producto_id: v,
                      producto_texto: prod ? `${prod.codigo} - ${etiquetaProducto(prod)}` : nuevoForm.producto_texto,
                    });
                  }}
                  placeholder="Seleccionar del catálogo (opcional)"
                  clearLabel="Sin producto del catálogo"
                  searchPlaceholder="Buscar producto..."
                  searchable
                  menuMinWidth={320}
                  options={productos.map((p) => ({ value: p.id, label: etiquetaProducto(p), hint: p.codigo }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block t-caption font-semibold text-ink mb-1">Detalle del producto / partida</label>
                <input
                  value={nuevoForm.producto_texto}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, producto_texto: e.target.value })}
                  placeholder="Ej. Pastelón 40x40 / Tubo hormigón"
                  className="hg-field-compact w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block t-caption font-semibold text-ink mb-1">Descripción del reclamo *</label>
                <textarea
                  required
                  rows={3}
                  value={nuevoForm.descripcion}
                  onChange={(e) => setNuevoForm({ ...nuevoForm, descripcion: e.target.value })}
                  placeholder="Qué ocurrió, en qué sector y qué solicita el cliente..."
                  className="hg-field p-3 leading-relaxed"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-line-subtle pt-4">
            <h4 className="t-section text-ink">Responsables y fechas</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Ejecutivo a cargo</label>
                <SearchSelect
                  value={nuevoForm.vendedor_id}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, vendedor_id: v })}
                  placeholder="Seleccionar ejecutivo"
                  clearLabel="Sin ejecutivo"
                  searchPlaceholder="Buscar ejecutivo..."
                  searchable
                  options={usuarios.map((u) => ({ value: u.id, label: u.nombre, hint: u.rol }))}
                />
              </div>
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Cuadrilla / maestro</label>
                <SearchSelect
                  value={nuevoForm.cuadrilla_id}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, cuadrilla_id: v })}
                  placeholder="Seleccionar cuadrilla"
                  clearLabel="Sin cuadrilla"
                  searchPlaceholder="Buscar cuadrilla..."
                  searchable
                  options={trabajadores.map((t) => ({ value: t.id, label: t.nombre, hint: t.cargo }))}
                />
              </div>
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Fecha del reclamo</label>
                <DatePicker
                  value={nuevoForm.fecha_reclamo}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, fecha_reclamo: v })}
                  clearable={false}
                />
              </div>
              <div>
                <label className="block t-caption font-semibold text-ink mb-1">Fecha compromiso</label>
                <DatePicker
                  value={nuevoForm.fecha_compromiso}
                  onChange={(v) => setNuevoForm({ ...nuevoForm, fecha_compromiso: v })}
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowNuevoModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Registrar caso
            </Button>
          </div>
        </form>
      </Dialog>

    </div>
  );
}
