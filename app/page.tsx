'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import {
  Cliente,
  Cotizacion,
  OportunidadVenta,
  Usuario,
  EventoProduccionLogistica,
  Recordatorio,
  Abono,
  CasoPostventa,
} from '../lib/types';
import { completeRecordatorio } from '../lib/recordatorios';
import { totalAbonado as calcularAbonado, totalComercial } from '../lib/oportunidad-finanzas';
import {
  ChevronRight,
  Factory,
  MapPin,
  Building2,
  Award,
  Package,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  Clock,
  TrendingUp,
  FolderKanban,
  Users,
  LayoutDashboard,
  Target,
} from 'lucide-react';
import clsx from 'clsx';
import { MetricCard } from '../components/ui/MetricCard';
import { DateRangePicker } from '../components/ui/DateRangePicker';

import { SalesTimelineChart } from '../components/dashboard/SalesTimelineChart';
import { DonutChart, DonutSegment } from '../components/dashboard/DonutChart';
import { RankingBarChart, RankingItem } from '../components/dashboard/RankingBarChart';
import { ColumnChart, TreemapChart, StageStepper, WeekAgenda, StackedBar, RadialGauge, ProgressList, formatShortMoney } from '../components/dashboard/visuals';
import { PipelineFunnelChart, FunnelStageData } from '../components/dashboard/PipelineFunnelChart';
import { RecentLeadsCard } from '../components/dashboard/RecentLeadsCard';
import { TasksActivityCard } from '../components/dashboard/TasksActivityCard';
import { swrCache } from '../lib/cache/swr-cache';

export type DashboardTab = 'general' | 'ventas' | 'operaciones' | 'finanzas';
type QuickFilterPreset = 'all' | 'today' | 'week' | 'month' | 'year';
type ProductoDashboard = string | {
  nombre?: string;
  cantidad?: number | string;
  precio?: number | string;
  total?: number | string;
};

export default function Dashboard() {
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id;
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState<boolean>(() => !swrCache.has('dashboard:cotizaciones'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(() => swrCache.get('dashboard:cotizaciones') || []);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>(() => swrCache.get('dashboard:oportunidades') || []);
  const [deliveryAccreditation, setDeliveryAccreditation] = useState<Record<string, boolean>>(() => swrCache.get('dashboard:deliveryAccreditation') || {});
  const [clientes, setClientes] = useState<Cliente[]>(() => swrCache.get('dashboard:clientes') || []);
  const [usuarios, setUsuarios] = useState<Usuario[]>(() => swrCache.get('dashboard:usuarios') || []);
  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>(() => swrCache.get('dashboard:eventos') || []);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>(() => swrCache.get('dashboard:recordatorios') || []);
  const [abonosPendientes, setAbonosPendientes] = useState<Abono[]>(() => swrCache.get('dashboard:abonosPendientes') || []);
  const [casosPostventa, setCasosPostventa] = useState<CasoPostventa[]>(() => swrCache.get('dashboard:casosPostventa') || []);

  // Pestaña de análisis seleccionada (estilo píldora)
  const [activeTab, setActiveTab] = useState<DashboardTab>('general');

  // Filtros de fecha rápidos y personalizados
  // Por defecto: mes en curso, del día 1 hasta hoy.
  const [, setQuickFilter] = useState<QuickFilterPreset | 'custom'>('month');
  const [fechaDesde, setFechaDesde] = useState<string>(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [fechaHasta, setFechaHasta] = useState<string>(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });

  // Carga de datos 100% en vivo desde Supabase
  const loadDashboardData = useCallback(async () => {
    try {
      const recordatoriosQuery = currentUserId
        ? supabase
            .from('recordatorios')
            .select('*')
            .eq('asignado_a_id', currentUserId)
            .eq('activo', true)
            .order('completado', { ascending: true })
            .order('fecha_vencimiento', { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [cotRes, opRes, cliRes, userRes, evRes, recRes, aboRes, postRes] = await Promise.all([
        supabase.from('cotizaciones').select('*, items:cotizacion_items(*), cliente:clientes(*)'),
        supabase.from('oportunidades').select('*, cliente:clientes(*), cotizaciones:cotizaciones!cotizaciones_oportunidad_id_fkey(*)'),
        supabase.from('clientes').select('*'),
        supabase.from('usuarios').select('*').eq('activo', true),
        supabase.from('eventos_produccion_logistica').select('*, responsable:usuarios!responsable_id(*)'),
        recordatoriosQuery,
        supabase.from('abonos').select('*').eq('estado', 'pendiente'),
        supabase.from('postventa_casos').select('*').in('estado', ['abierto', 'programado', 'en_curso']),
      ]);

      const queryError = [cotRes, opRes, cliRes, userRes, evRes, recRes, aboRes, postRes].find((result) => result.error)?.error;
      if (queryError) throw queryError;

      const closedIds = ((opRes.data || []) as OportunidadVenta[])
        .filter((op) => ['prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline))
        .map((op) => op.id);

      const { data: accreditationRows, error: accreditationError } = closedIds.length
        ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
        : { data: [], error: null };
      if (accreditationError) throw accreditationError;

      const accreditationMap = Object.fromEntries(
        ((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [
          row.venta_id,
          row.acreditada,
        ])
      );

      setDeliveryAccreditation(accreditationMap);
      setLoadError(null);

      const cotData = (cotRes.data || []) as Cotizacion[];
      const opData = (opRes.data || []) as OportunidadVenta[];
      const cliData = (cliRes.data || []) as Cliente[];
      const usrData = (userRes.data || []) as Usuario[];
      const evData = (evRes.data || []) as EventoProduccionLogistica[];
      const recData = (recRes.data || []) as Recordatorio[];
      const aboData = (aboRes.data || []) as Abono[];
      const postData = (postRes.data || []) as CasoPostventa[];

      setCotizaciones(cotData);
      setOportunidades(opData);
      setClientes(cliData);
      setUsuarios(usrData);
      setEventos(evData);
      setRecordatorios(recData);
      setAbonosPendientes(aboData);
      setCasosPostventa(postData);

      // Guardar en caché SWR para render inmediato en futuras navegaciones
      swrCache.set('dashboard:cotizaciones', cotData);
      swrCache.set('dashboard:oportunidades', opData);
      swrCache.set('dashboard:deliveryAccreditation', accreditationMap);
      swrCache.set('dashboard:clientes', cliData);
      swrCache.set('dashboard:usuarios', usrData);
      swrCache.set('dashboard:eventos', evData);
      swrCache.set('dashboard:recordatorios', recData);
      swrCache.set('dashboard:abonosPendientes', aboData);
      swrCache.set('dashboard:casosPostventa', postData);

      setLoading(false);
    } catch (err) {
      console.error('Error loading live dashboard data from Supabase:', err);
      setLoadError('No se pudieron cargar los datos del panel. Reintenta más tarde.');
      setLoading(false);
    }
  }, [currentUserId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos al montar y suscripción Realtime
    void loadDashboardData();

    // Supabase Realtime multi-table sync con debounce de 300ms
    let debounceTimer: number | null = null;
    const triggerDebouncedReload = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void loadDashboardData();
      }, 300);
    };

    const channel = supabase
      .channel('dashboard_live_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizacion_items' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abonos' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'postventa_casos' }, triggerDebouncedReload)
      .subscribe();

    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [loadDashboardData, supabase]);

  // Helper para obtener el valor monetario real de una oportunidad
  const getOportunidadTrueValue = (op: OportunidadVenta): number => {
    return totalComercial(op, op.cotizaciones || []);
  };

  // Oportunidades filtradas por rango temporal
  const filteredOportunidades = useMemo(() => {
    return oportunidades.filter((op) => {
      if (!fechaDesde && !fechaHasta) return true;
      const opDateStr = op.fecha_inicio || op.created_at || '';
      if (!opDateStr) return true;

      const opDate = new Date(opDateStr);
      if (fechaDesde) {
        const d = new Date(`${fechaDesde}T00:00:00`);
        d.setHours(0, 0, 0, 0);
        if (opDate < d) return false;
      }
      if (fechaHasta) {
        const h = new Date(`${fechaHasta}T00:00:00`);
        h.setHours(23, 59, 59, 999);
        if (opDate > h) return false;
      }
      return true;
    });
  }, [oportunidades, fechaDesde, fechaHasta]);

  // Cotizaciones filtradas por rango temporal
  const filteredCotizaciones = useMemo(() => {
    return cotizaciones.filter((cot) => {
      if (!fechaDesde && !fechaHasta) return true;
      const cotDateStr = cot.created_at || '';
      if (!cotDateStr) return true;

      const cotDate = new Date(cotDateStr);
      if (fechaDesde) {
        const d = new Date(`${fechaDesde}T00:00:00`);
        d.setHours(0, 0, 0, 0);
        if (cotDate < d) return false;
      }
      if (fechaHasta) {
        const h = new Date(`${fechaHasta}T00:00:00`);
        h.setHours(23, 59, 59, 999);
        if (cotDate > h) return false;
      }
      return true;
    });
  }, [cotizaciones, fechaDesde, fechaHasta]);

  // Métricas Financieras
  const totalFacturado = useMemo(() => {
    return filteredOportunidades.reduce((sum, op) => sum + getOportunidadTrueValue(op), 0);
  }, [filteredOportunidades]);

  const totalAbonado = useMemo(() => {
    return filteredOportunidades.reduce((sum, op) => sum + calcularAbonado(op), 0);
  }, [filteredOportunidades]);

  const totalPendientePorPagar = useMemo(() => {
    return Math.max(0, totalFacturado - totalAbonado);
  }, [totalFacturado, totalAbonado]);

  // Atención hoy: Obras y despachos activos o en riesgo
  const despachosEnRiesgo = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return eventos.filter(
      (e) =>
        ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado) &&
        (e.estado === 'reprogramado' ||
          (['despacho_cliente', 'retiro_proveedor', 'logistica'].includes(e.tipo_evento) &&
            ((e.fecha_inicio?.split('T')[0] ?? e.fecha_evento ?? '') <= today)))
    );
  }, [eventos]);

  // Atención hoy: Total monto abonos por validar
  const totalMontoAbonosPorValidar = useMemo(() => {
    return abonosPendientes.reduce((sum, a) => sum + Number(a.monto || 0), 0);
  }, [abonosPendientes]);

  // Riel agregado de la semana: distribución de oportunidades activas por etapa de obra
  const rielObrasSemana = useMemo(() => {
    const etapas = [
      { id: 'cotizacion', label: 'Cotización', stages: ['nueva'] },
      { id: 'venta', label: 'Venta', stages: ['pagada'] },
      { id: 'aprobada', label: 'Venta Aprobada', stages: ['entregada'] },
      { id: 'abastecimiento', label: 'Fabricación', stages: ['programada', 'prod_fabricacion'] },
      { id: 'despacho', label: 'Despacho', stages: ['prod_instalacion'] },
      { id: 'entrega', label: 'Entrega / Cierre', stages: ['prod_finalizado', 'rev_entregado'] },
    ];

    return etapas.map((e) => {
      const ops = filteredOportunidades.filter((o) => e.stages.includes(o.estado_pipeline));
      const monto = ops.reduce((acc, o) => acc + getOportunidadTrueValue(o), 0);
      return {
        id: e.id,
        label: e.label,
        count: ops.length,
        monto,
      };
    });
  }, [filteredOportunidades]);

  // Gráfico de Evolución de Ventas
  const { dailySeries, monthlySeries, totalPeriodTimelineSales } = useMemo(() => {
    const dailyMap: Record<string, { label: string; fullDateLabel: string; monto: number; count: number }> = {};
    const monthlyMap: Record<string, { label: string; fullDateLabel: string; monto: number; count: number }> = {};

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const k = d.toISOString().split('T')[0];
      const lbl = `${d.getDate()} ${monthNames[d.getMonth()]}`;
      dailyMap[k] = {
        label: lbl,
        fullDateLabel: d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        monto: 0,
        count: 0,
      };
    }

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthlyMap[k] = {
        label: lbl,
        fullDateLabel: d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
        monto: 0,
        count: 0,
      };
    }

    let accumulatedSales = 0;

    oportunidades.forEach((op) => {
      const dateStr = op.fecha_inicio || op.created_at;
      if (!dateStr) return;

      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;

      const dayKey = d.toISOString().split('T')[0];
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const val = getOportunidadTrueValue(op);

      accumulatedSales += val;

      if (dailyMap[dayKey]) {
        dailyMap[dayKey].monto += val;
        dailyMap[dayKey].count += 1;
      }

      if (monthlyMap[monthKey]) {
        monthlyMap[monthKey].monto += val;
        monthlyMap[monthKey].count += 1;
      }
    });

    return {
      dailySeries: Object.entries(dailyMap).map(([k, v]) => ({ dateKey: k, ...v })),
      monthlySeries: Object.entries(monthlyMap).map(([k, v]) => ({ dateKey: k, ...v })),
      totalPeriodTimelineSales: accumulatedSales,
    };
  }, [oportunidades]);

  // Segmentación de Clientes
  const segmentacionClientes = useMemo((): DonutSegment[] => {
    let naturalCount = 0;
    let juridicaCount = 0;

    clientes.forEach((c) => {
      if (c.tipo_cliente === 'juridica' || c.apellido_razon_social) {
        juridicaCount += 1;
      } else {
        naturalCount += 1;
      }
    });

    return [
      {
        id: 'juridica',
        label: 'Empresas',
        value: juridicaCount,
        color: 'var(--hg-accent)',
        sublabel: 'jurídicos',
      },
      {
        id: 'natural',
        label: 'Particulares',
        value: naturalCount,
        color: 'var(--hg-info)',
        sublabel: 'personas',
      },
    ];
  }, [clientes]);

  // Métodos de Pago
  const metodosPagoSegmentos = useMemo((): DonutSegment[] => {
    const methodCounts: Record<string, { count: number; monto: number; label: string; color: string }> = {
      transferencia: { count: 0, monto: 0, label: 'Transferencia electrónica', color: 'var(--hg-accent)' },
      cheque: { count: 0, monto: 0, label: 'Cheque 30 / 60 días', color: 'var(--hg-info)' },
      efectivo: { count: 0, monto: 0, label: 'Efectivo / Anticipo', color: 'var(--hg-success)' },
      tarjeta: { count: 0, monto: 0, label: 'Tarjetas / Webpay', color: 'var(--hg-warning)' },
    };

    filteredOportunidades.forEach((op) => {
      const val = getOportunidadTrueValue(op);
      const rawCond = ((op as unknown as { condicion_pago?: string }).condicion_pago || '').toLowerCase();

      if (rawCond.includes('cheque')) {
        methodCounts.cheque.count += 1;
        methodCounts.cheque.monto += val;
      } else if (rawCond.includes('efectivo') || rawCond.includes('abono')) {
        methodCounts.efectivo.count += 1;
        methodCounts.efectivo.monto += val;
      } else if (rawCond.includes('webpay') || rawCond.includes('debito') || rawCond.includes('credito') || rawCond.includes('tarjeta')) {
        methodCounts.tarjeta.count += 1;
        methodCounts.tarjeta.monto += val;
      } else {
        methodCounts.transferencia.count += 1;
        methodCounts.transferencia.monto += val;
      }
    });

    return Object.entries(methodCounts).map(([key, data]) => ({
      id: key,
      label: data.label,
      value: data.count,
      monto: data.monto,
      color: data.color,
      sublabel: 'contratos',
    }));
  }, [filteredOportunidades]);

  // Ranking Comunas
  const rankingComunas = useMemo((): RankingItem[] => {
    const comunaMap: Record<string, { count: number; monto: number }> = {};
    const cliComunaMap = new Map<string, string>();
    clientes.forEach((c) => {
      if (c.comuna) cliComunaMap.set(c.id, c.comuna.trim());
    });

    filteredOportunidades.forEach((op) => {
      let rawComuna = op.comuna;
      if (!rawComuna && op.cliente_id) rawComuna = cliComunaMap.get(op.cliente_id);
      const cleanComuna = (rawComuna || 'Sin comuna especificada').trim();
      const val = getOportunidadTrueValue(op);

      if (!comunaMap[cleanComuna]) comunaMap[cleanComuna] = { count: 0, monto: 0 };
      comunaMap[cleanComuna].count += 1;
      comunaMap[cleanComuna].monto += val;
    });

    return Object.entries(comunaMap)
      .map(([comuna, data]) => ({
        id: comuna,
        title: comuna,
        count: data.count,
        countLabel: data.count === 1 ? 'proyecto' : 'proyectos',
        monto: data.monto,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [filteredOportunidades, clientes]);

  // Ranking Productos
  const rankingProductos = useMemo((): RankingItem[] => {
    const prodMap: Record<string, { count: number; monto: number }> = {};

    filteredCotizaciones.forEach((cot) => {
      if (cot.items && Array.isArray(cot.items)) {
        cot.items.forEach((item) => {
          const name = item.producto ? item.producto.trim() : 'Prefabricados estándar';
          if (!prodMap[name]) prodMap[name] = { count: 0, monto: 0 };
          prodMap[name].count += Number(item.cantidad || 1);
          prodMap[name].monto += Number(item.total_item || 0);
        });
      }
    });

    if (Object.keys(prodMap).length === 0) {
      filteredOportunidades.forEach((op) => {
        if (op.productos && Array.isArray(op.productos)) {
          op.productos.forEach((p) => {
            const producto = p as ProductoDashboard;
            const name = typeof producto === 'string' ? producto : producto.nombre || 'Prefabricados estándar';
            const qty = typeof producto === 'string' ? 1 : Number(producto.cantidad || 1);
            const val = typeof producto === 'string' ? 0 : Number(producto.precio || producto.total || 0);
            if (!prodMap[name]) prodMap[name] = { count: 0, monto: 0 };
            prodMap[name].count += qty;
            prodMap[name].monto += val;
          });
        }
      });
    }

    return Object.entries(prodMap)
      .map(([prodName, data]) => ({
        id: prodName,
        title: prodName,
        count: data.count,
        countLabel: 'unidades',
        monto: data.monto,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [filteredCotizaciones, filteredOportunidades]);

  // Ranking Vendedores
  const rankingVendedores = useMemo((): RankingItem[] => {
    const userMap: Record<string, { nombre: string; count: number; monto: number }> = {};
    usuarios.forEach((u) => {
      userMap[u.id] = { nombre: u.nombre, count: 0, monto: 0 };
    });

    filteredOportunidades.forEach((op) => {
      const uid = op.asignado_a;
      const val = getOportunidadTrueValue(op);

      if (uid && userMap[uid]) {
        userMap[uid].count += 1;
        userMap[uid].monto += val;
      } else {
        const sinAsignarKey = 'sin_asignar';
        if (!userMap[sinAsignarKey]) {
          userMap[sinAsignarKey] = { nombre: 'Sin ejecutivo asignado', count: 0, monto: 0 };
        }
        userMap[sinAsignarKey].count += 1;
        userMap[sinAsignarKey].monto += val;
      }
    });

    return Object.entries(userMap)
      .filter(([, data]) => data.count > 0 || data.monto > 0)
      .map(([id, data]) => {
        const parts = data.nombre.split(' ');
        const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : data.nombre.slice(0, 2).toUpperCase();
        return {
          id,
          title: data.nombre,
          count: data.count,
          countLabel: data.count === 1 ? 'oportunidad' : 'oportunidades',
          monto: data.monto,
          avatarText: initials,
        };
      })
      .sort((a, b) => b.monto - a.monto);
  }, [usuarios, filteredOportunidades]);

  // Proyecciones de Venta en Pipeline
  const funnel = useMemo(() => {
    const stageDefs: { id: string; label: string; prob: number; color: string; bg: string }[] = [
      { id: 'nueva', label: '1. Nuevas oportunidades', prob: 20, color: 'var(--hg-warning)', bg: 'var(--hg-surface-muted)' },
      { id: 'pagada', label: '2. Pago validado', prob: 70, color: 'var(--hg-info)', bg: 'var(--hg-surface-muted)' },
      { id: 'entregada', label: '3. Venta aprobada', prob: 85, color: 'var(--hg-accent)', bg: 'var(--hg-surface-muted)' },
      { id: 'programada', label: '4. En programación', prob: 80, color: 'var(--hg-accent-line)', bg: 'var(--hg-surface-muted)' },
      { id: 'prod_fabricacion', label: '5. En fabricación', prob: 85, color: 'var(--hg-accent-line)', bg: 'var(--hg-surface-muted)' },
      { id: 'prod_instalacion', label: '6. En instalación & obra', prob: 90, color: 'var(--hg-info)', bg: 'var(--hg-surface-muted)' },
      { id: 'cierre', label: '7. Entregadas & cierre', prob: 100, color: 'var(--hg-success)', bg: 'var(--hg-surface-muted)' },
      { id: 'sin_acreditar', label: 'Entregas históricas sin acreditar', prob: 0, color: 'var(--hg-warning)', bg: 'var(--hg-surface-muted)' },
    ];

    const build = (ops: OportunidadVenta[]) => {
    let totalNominal = 0;
    let totalWeighted = 0;

    const stages: FunnelStageData[] = stageDefs.map((def) => {
      const opsInStage = ops.filter((o) => {
        if (def.id === 'entregada') {
          return o.estado_pipeline === 'entregada';
        }
        if (def.id === 'cierre') {
          return ['prod_finalizado', 'rev_entregado'].includes(o.estado_pipeline) && deliveryAccreditation[o.id] === true;
        }
        if (def.id === 'sin_acreditar') {
          return ['prod_finalizado', 'rev_entregado'].includes(o.estado_pipeline) && deliveryAccreditation[o.id] !== true;
        }
        return o.estado_pipeline === def.id;
      });

      const nominalMonto = opsInStage.reduce((sum, o) => sum + getOportunidadTrueValue(o), 0);
      const weightedMonto = Math.round((nominalMonto * def.prob) / 100);

      totalNominal += nominalMonto;
      totalWeighted += weightedMonto;

      return {
        stageId: def.id,
        label: def.label,
        count: opsInStage.length,
        nominalMonto,
        probabilidad: def.prob,
        weightedMonto,
        color: def.color,
        bgColor: def.bg,
      };
    });

    return { stages, totalNominal, totalWeighted };
    };

    return build(filteredOportunidades);
  }, [filteredOportunidades, deliveryAccreditation]);
  const totalPipelineNominal = funnel.totalNominal;

  const recordatoriosStats = useMemo(() => {
    const completados = recordatorios.filter((item) => item.completado || item.estado === 'completada').length;
    const pendientes = recordatorios.filter((item) => !item.completado && item.estado !== 'completada').length;
    const total = completados + pendientes;
    const cumplimiento = total > 0 ? Math.round((completados / total) * 100) : 100;
    return { completados, pendientes, cumplimiento };
  }, [recordatorios]);

  const handleCompleteRecordatorio = async (recordatorio: Recordatorio) => {
    setRecordatorios((prev) =>
      prev.map((item) => (item.id === recordatorio.id ? { ...item, completado: true, estado: 'completada' } : item))
    );

    try {
      const { error } = await completeRecordatorio(supabase, recordatorio);
      if (error) throw error;
      await loadDashboardData();
    } catch (err) {
      console.error('Error completando recordatorio desde dashboard:', err);
      await loadDashboardData();
    }
  };

  const dashboardTabs = [
    { id: 'general' as const, label: 'General', icon: LayoutDashboard },
    { id: 'ventas' as const, label: 'Ventas', icon: Target },
    { id: 'operaciones' as const, label: 'Operaciones', icon: Factory },
    { id: 'finanzas' as const, label: 'Finanzas', icon: Wallet },
  ];

  const totalDealsClosed = filteredOportunidades.filter((o) =>
    ['entregada', 'prod_finalizado', 'rev_entregado'].includes(o.estado_pipeline)
  ).length;

  const averageDealSize =
    totalDealsClosed > 0
      ? Math.round(totalFacturado / totalDealsClosed)
      : filteredOportunidades.length > 0
      ? Math.round(totalFacturado / filteredOportunidades.length)
      : 0;

  const obrasEnRielCount = filteredOportunidades.filter((o) =>
    ['entregada', 'programada', 'prod_fabricacion', 'prod_instalacion'].includes(o.estado_pipeline)
  ).length;

  const totalAlertasCount =
    despachosEnRiesgo.length +
    abonosPendientes.length +
    casosPostventa.length +
    recordatoriosStats.pendientes;

  if (loading) {
    return (
      <div className="py-16 text-center text-ink-muted">
        Cargando centro de control y métricas en vivo…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-panel border border-danger-line bg-danger-soft p-6 text-sm text-danger">
        {loadError}
        <button type="button" onClick={() => { setLoading(true); void loadDashboardData(); }} className="ml-3 font-semibold underline">
          Reintentar
        </button>
      </div>
    );
  }

  const CARD = 'rounded-[20px] border border-line bg-surface p-6';
  const calendarioPlantaHref = '/calendarios/general?contexto=produccion_logistica';
  const pctCobrado = Math.round((totalAbonado / Math.max(1, totalFacturado)) * 100);
  const eventosActivos = eventos.filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado));

  const atencion = [
    { href: calendarioPlantaHref, icon: AlertTriangle, tone: 'bg-warning-soft text-warning', label: 'Despachos en riesgo', count: despachosEnRiesgo.length },
    { href: '/caja', icon: Wallet, tone: 'bg-success-soft text-success', label: 'Abonos por validar', count: abonosPendientes.length },
    { href: '/postventa', icon: ShieldAlert, tone: 'bg-accent-soft text-accent-ink', label: 'Garantías y reclamos', count: casosPostventa.length },
    { href: '/administracion?empresa=inmobiliaria&seccion=pendientes_generales', icon: Clock, tone: 'bg-info-soft text-info', label: 'Compromisos pendientes', count: recordatoriosStats.pendientes },
  ];

  // Series de 6 meses para los gráficos de columnas (independientes del filtro de fechas)
  const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const serie6Meses = (() => {
    const ahora = new Date();
    const meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MESES_CORTO[d.getMonth()], nuevas: 0, cerradas: 0, facturado: 0, cobrado: 0 };
    });
    oportunidades.forEach((op) => {
      const raw = op.fecha_inicio || op.created_at;
      const d = raw ? new Date(raw) : null;
      if (!d || isNaN(d.getTime())) return;
      const mes = meses.find((m) => m.key === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      if (!mes) return;
      mes.nuevas += 1;
      if (['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline)) mes.cerradas += 1;
      mes.facturado += getOportunidadTrueValue(op);
      mes.cobrado += calcularAbonado(op);
    });
    return meses;
  })();

  const saldosPorCobrar = filteredOportunidades
    .map((op) => ({ op, total: getOportunidadTrueValue(op), done: calcularAbonado(op) }))
    .filter((r) => r.total - r.done > 0)
    .sort((a, b) => (b.total - b.done) - (a.total - a.done))
    .slice(0, 5)
    .map((r) => ({
      id: r.op.id,
      title: r.op.cliente?.nombre || r.op.codigo || 'Oportunidad',
      sub: r.op.codigo || undefined,
      total: r.total,
      done: r.done,
      href: `/ventas?oportunidad=${r.op.id}`,
    }));

  const agendaEventos = eventosActivos.map((ev) => ({
    id: ev.id,
    titulo: ev.titulo,
    fecha: ev.fecha_inicio?.split('T')[0] || ev.fecha_evento || '',
    hora: ev.hora_evento,
    alerta: ev.estado === 'reprogramado',
  }));

  const postventaSegmentos = [
    { id: 'abierto', label: 'Abiertos', value: casosPostventa.filter((c) => c.estado === 'abierto').length, color: 'bg-danger' },
    { id: 'programado', label: 'Programados', value: casosPostventa.filter((c) => c.estado === 'programado').length, color: 'bg-warning' },
    { id: 'en_curso', label: 'En curso', value: casosPostventa.filter((c) => c.estado === 'en_curso').length, color: 'bg-info' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Barra superior: pestañas y rango de fechas (sin título: la ruta ya lo indica) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-11 items-center gap-1 rounded-full border border-line bg-surface-muted p-1">
          {dashboardTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex h-full cursor-pointer select-none items-center gap-2 rounded-full px-4 text-xs font-semibold transition-all duration-200 sm:px-5 sm:text-sm',
                  isActive ? 'bg-accent text-on-accent shadow-xs' : 'text-ink-muted hover:bg-surface/60 hover:text-ink'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <DateRangePicker
          from={fechaDesde}
          to={fechaHasta}
          onChange={(desde, hasta) => {
            setQuickFilter(desde || hasta ? 'custom' : 'all');
            setFechaDesde(desde);
            setFechaHasta(hasta);
          }}
        />
      </div>

      {/* ===== GENERAL ===== */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Facturado en el período"
              value={`$${totalFacturado.toLocaleString('es-CL')}`}
              icon={TrendingUp}
              tone="warning"
              change={{ value: `${pctCobrado}% cobrado`, trend: 'neutral', label: `$${totalAbonado.toLocaleString('es-CL')} recaudados` }}
            />
            <MetricCard title="Clientes" value={clientes.length} icon={Building2} tone="success" />
            <MetricCard title="Obras en ejecución" value={obrasEnRielCount} icon={Factory} tone="info" />
            <MetricCard
              title="Requieren atención"
              value={totalAlertasCount}
              icon={AlertTriangle}
              tone="danger"
              change={despachosEnRiesgo.length > 0 ? { value: `${despachosEnRiesgo.length} despachos`, trend: 'down', label: 'en riesgo' } : undefined}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesTimelineChart
                dailyData={dailySeries}
                monthlyData={monthlySeries}
                totalPeriodSales={totalPeriodTimelineSales}
                totalDealsClosed={totalDealsClosed}
                averageDealSize={averageDealSize}
              />
            </div>

            <section className={CARD}>
              <h3 className="text-base font-semibold text-ink">Atención hoy</h3>
              <ul className="mt-4 divide-y divide-line-subtle">
                {atencion.map((row) => (
                  <li key={row.label}>
                    <Link href={row.href} className="group flex items-center gap-3 py-3.5">
                      <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', row.tone)}>
                        <row.icon className="h-[18px] w-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-accent-ink">{row.label}</span>
                      <span className="t-num text-xl font-bold text-ink">{row.count}</span>
                      <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-accent-ink" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <RecentLeadsCard oportunidades={filteredOportunidades} />
            <TasksActivityCard recordatorios={recordatorios} eventos={eventos} onToggleComplete={handleCompleteRecordatorio} />
          </div>
        </div>
      )}

      {/* ===== VENTAS: embudo, evolución mensual, geografía, clientes, vendedores ===== */}
      {activeTab === 'ventas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Prospectos" value={oportunidades.length} icon={Users} tone="info" subtitle={`${filteredOportunidades.length} en el período`} />
            <MetricCard
              title="En pipeline"
              value={filteredOportunidades.filter((op) => !['prod_finalizado', 'rev_entregado', 'perdida'].includes(op.estado_pipeline)).length}
              icon={FolderKanban}
              tone="accent"
              subtitle={`$${Math.round(totalPipelineNominal / 1000).toLocaleString('es-CL')}k en negociación`}
            />
            <MetricCard
              title="Conversión"
              value={`${totalDealsClosed > 0 ? Math.round((totalDealsClosed / Math.max(1, filteredOportunidades.length)) * 100) : 0}%`}
              icon={Target}
              tone="success"
              change={totalDealsClosed > 0 ? { value: `${totalDealsClosed} cerradas`, trend: 'up' } : undefined}
            />
            <MetricCard title="Ticket promedio" value={`$${averageDealSize.toLocaleString('es-CL')}`} icon={TrendingUp} tone="warning" />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <PipelineFunnelChart stages={funnel.stages} totalNominal={funnel.totalNominal} />
            <div className="flex flex-col gap-5">
              <div className="flex-1">
                <ColumnChart
                  compact
                  title="Oportunidades por mes"
                  hint="Nuevas frente a cerradas, últimos 6 meses"
                  data={serie6Meses.map((m) => ({ label: m.label, a: m.nuevas, b: m.cerradas }))}
                  aLabel="Nuevas"
                  bLabel="Cerradas"
                  format={(n) => String(n)}
                />
              </div>
              <div className="flex-1">
                <DonutChart
                  compact
                  title="Tipo de cliente"
                  icon={Building2}
                  segments={segmentacionClientes}
                  centerLabel="Clientes"
                  centerValue={clientes.length.toString()}
                />
              </div>
            </div>
          </div>

          <TreemapChart
            title="Dónde vendemos"
            hint="Monto por comuna: más grande, más ventas"
            items={rankingComunas.map((c) => ({ id: c.id, label: c.title, value: c.monto, sub: `${c.count} ${c.countLabel ?? 'proyectos'}` }))}
            empty="No hay comunas registradas en el período."
          />

          <RankingBarChart
            title="Ventas por vendedor"
            icon={Award}
            items={rankingVendedores}
            emptyMessage="No hay ventas asignadas a vendedores en el período."
            maxItems={5}
          />
        </div>
      )}

      {/* ===== OPERACIONES: etapas de obra, agenda, postventa, productos ===== */}
      {activeTab === 'operaciones' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Obras en riel" value={obrasEnRielCount} icon={Factory} tone="info" />
            <MetricCard
              title="En fabricación"
              value={filteredOportunidades.filter((o) => o.estado_pipeline === 'prod_fabricacion').length}
              icon={Package}
              tone="warning"
            />
            <MetricCard title="Despachos activos" value={despachosEnRiesgo.length} icon={MapPin} tone="accent" />
            <MetricCard title="Casos postventa" value={casosPostventa.length} icon={ShieldAlert} tone="success" />
          </div>

          <StageStepper
            title="Obras por etapa"
            hint="Dónde está cada obra hoy"
            stages={rielObrasSemana}
            href="/ventas"
            hrefLabel="Ver pipeline"
          />

          <WeekAgenda
            title="Próximos 7 días en planta"
            hint="Fabricación, despachos e instalaciones"
            events={agendaEventos}
            href={calendarioPlantaHref}
            hrefLabel="Calendario"
          />

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
            <StackedBar title="Postventa abierta" hint="Casos por estado" segments={postventaSegmentos} href="/postventa" hrefLabel="Ver casos" />
            <div className="lg:col-span-2">
              <RankingBarChart
                title="Productos más cotizados"
                icon={Package}
                items={rankingProductos}
                emptyMessage="No hay productos cotizados en el período seleccionado."
                maxItems={5}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===== FINANZAS: facturación mensual, cobranza, saldos, abonos, medios de pago ===== */}
      {activeTab === 'finanzas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Facturado" value={`$${totalFacturado.toLocaleString('es-CL')}`} icon={TrendingUp} tone="warning" />
            <MetricCard title="Recaudado" value={`$${totalAbonado.toLocaleString('es-CL')}`} icon={Wallet} tone="success" />
            <MetricCard title="Por cobrar" value={`$${totalPendientePorPagar.toLocaleString('es-CL')}`} icon={CreditCard} tone="danger" subtitle={`${filteredOportunidades.length} contratos`} />
            <MetricCard
              title="Por conciliar"
              value={`$${totalMontoAbonosPorValidar.toLocaleString('es-CL')}`}
              icon={AlertTriangle}
              tone="info"
              change={abonosPendientes.length > 0 ? { value: `${abonosPendientes.length} abonos`, trend: 'neutral' } : undefined}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ColumnChart
                title="Facturado y cobrado por mes"
                hint="Lo vendido cada mes y cuánto se ha cobrado de ello"
                data={serie6Meses.map((m) => ({ label: m.label, a: m.facturado, b: m.cobrado }))}
                aLabel="Facturado"
                bLabel="Cobrado"
              />
            </div>
            <RadialGauge
              title="Cobranza del período"
              percent={pctCobrado}
              centerLabel="cobrado"
              rows={[
                { label: 'Facturado', value: formatShortMoney(totalFacturado), dot: 'bg-accent' },
                { label: 'Recaudado', value: formatShortMoney(totalAbonado), dot: 'bg-success' },
                { label: 'Por cobrar', value: formatShortMoney(totalPendientePorPagar), dot: 'bg-danger' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
            <ProgressList title="Mayores saldos por cobrar" hint="Cuánto falta y cuánto se ha cobrado" rows={saldosPorCobrar} />

            <section className={CARD}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">Abonos por conciliar</h3>
                <Link href="/caja" className="flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline">
                  Ir a Caja <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
              {abonosPendientes.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">No hay comprobantes pendientes en Caja.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line-subtle">
                  {abonosPendientes.slice(0, 5).map((abono) => (
                    <li key={abono.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{abono.cuenta_bancaria?.banco || abono.cuenta_bancaria?.alias || 'Comprobante de abono'}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{abono.oportunidad?.codigo || abono.oportunidad_id?.slice(0, 8)} · {abono.fecha?.split('T')[0] || 'Pendiente'}</p>
                      </div>
                      <span className="t-num shrink-0 text-sm font-bold text-success">+${(abono.monto || 0).toLocaleString('es-CL')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <DonutChart
              title="Medios de pago"
              icon={CreditCard}
              segments={metodosPagoSegmentos}
              centerLabel="Operaciones"
              centerValue={filteredOportunidades.length.toString()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
