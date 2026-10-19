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
  Calendar,
  ChevronRight,
  Factory,
  MapPin,
  Building2,
  Award,
  Package,
  CreditCard,
  CheckSquare,
  Square,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  Clock,
  RotateCcw,
  TrendingUp,
  FolderKanban,
  Users,
  Sparkles,
  LayoutDashboard,
  Target,
} from 'lucide-react';
import clsx from 'clsx';
import {
  PageHeader,
  StatusBadge,
} from '../components/ui';
import { MetricCard } from '../components/ui/MetricCard';

import { SalesTimelineChart } from '../components/dashboard/SalesTimelineChart';
import { DonutChart, DonutSegment } from '../components/dashboard/DonutChart';
import { RankingBarChart, RankingItem } from '../components/dashboard/RankingBarChart';
import { FinancialBalanceCard } from '../components/dashboard/FinancialBalanceCard';
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
  const [quickFilter, setQuickFilter] = useState<QuickFilterPreset | 'custom'>('all');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

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

  // Manejador de filtros rápidos de tiempo
  const applyQuickFilter = (type: QuickFilterPreset) => {
    setQuickFilter(type);
    const now = new Date();

    if (type === 'all') {
      setFechaDesde('');
      setFechaHasta('');
      return;
    }

    if (type === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setFechaDesde(todayStr);
      setFechaHasta(todayStr);
      return;
    }

    if (type === 'week') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      setFechaDesde(startOfWeek.toISOString().split('T')[0]);
      setFechaHasta(now.toISOString().split('T')[0]);
      return;
    }

    if (type === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setFechaDesde(startOfMonth.toISOString().split('T')[0]);
      setFechaHasta(now.toISOString().split('T')[0]);
      return;
    }

    if (type === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setFechaDesde(startOfYear.toISOString().split('T')[0]);
      setFechaHasta(now.toISOString().split('T')[0]);
      return;
    }
  };

  // Oportunidades filtradas por rango temporal
  const filteredOportunidades = useMemo(() => {
    return oportunidades.filter((op) => {
      if (!fechaDesde && !fechaHasta) return true;
      const opDateStr = op.fecha_inicio || op.created_at || '';
      if (!opDateStr) return true;

      const opDate = new Date(opDateStr);
      if (fechaDesde) {
        const d = new Date(fechaDesde);
        d.setHours(0, 0, 0, 0);
        if (opDate < d) return false;
      }
      if (fechaHasta) {
        const h = new Date(fechaHasta);
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
        const d = new Date(fechaDesde);
        d.setHours(0, 0, 0, 0);
        if (cotDate < d) return false;
      }
      if (fechaHasta) {
        const h = new Date(fechaHasta);
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

    filteredOportunidades.forEach((op) => {
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
  }, [filteredOportunidades]);

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
        label: 'Empresas y constructoras',
        value: juridicaCount,
        color: 'var(--hg-accent)',
        sublabel: 'clientes jurídicos',
      },
      {
        id: 'natural',
        label: 'Clientes particulares',
        value: naturalCount,
        color: 'var(--hg-info)',
        sublabel: 'personas naturales',
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
  const { funnelStages, totalPipelineNominal, totalPipelineWeighted } = useMemo(() => {
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

    let totalNominal = 0;
    let totalWeighted = 0;

    const stages: FunnelStageData[] = stageDefs.map((def) => {
      const opsInStage = filteredOportunidades.filter((o) => {
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

    return {
      funnelStages: stages,
      totalPipelineNominal: totalNominal,
      totalPipelineWeighted: totalWeighted,
    };
  }, [filteredOportunidades, deliveryAccreditation]);

  const recordatoriosStats = useMemo(() => {
    const completados = recordatorios.filter((item) => item.completado || item.estado === 'completada').length;
    const pendientes = recordatorios.filter((item) => !item.completado && item.estado !== 'completada').length;
    const total = completados + pendientes;
    const cumplimiento = total > 0 ? Math.round((completados / total) * 100) : 100;
    return { completados, pendientes, cumplimiento };
  }, [recordatorios]);

  const topRecordatoriosPendientes = useMemo(() => {
    return recordatorios
      .filter((item) => !item.completado && item.estado !== 'completada')
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      .slice(0, 5);
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

  return (
    <div className="space-y-6 pb-8">
      {/* ========================================================= */}
      {/* 1. CABECERA CON PESTAÑAS TIPO PÍLDORA (Ref: Cabina 1/2)   */}
      {/* ========================================================= */}
      <PageHeader
        title="Panel operativo"
        description={`Centro de control analítico y operativo de Hormiglass para ${currentUser?.nombre?.split(' ')[0] || 'el equipo'}.`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Píldoras de Navegación Analítica */}
            <div className="inline-flex h-11 items-center gap-1 rounded-full border border-line bg-surface-muted p-1 shadow-xs">
              {dashboardTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'h-full cursor-pointer rounded-full px-4 sm:px-5 text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 select-none',
                      isActive
                        ? 'bg-accent text-on-accent shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface/60'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Selector de Rango de Fechas (Mismo tamaño, altura y letra que las pestañas) */}
            <div className="inline-flex h-11 items-center gap-2.5 rounded-full border border-line bg-surface px-4 sm:px-5 shadow-xs">
              <Calendar className="h-4 w-4 text-accent-ink shrink-0" aria-hidden />
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setQuickFilter('custom');
                  setFechaDesde(e.target.value);
                }}
                className="bg-transparent text-xs sm:text-sm font-semibold text-ink focus:outline-none cursor-pointer"
                title="Fecha inicial"
              />
              <span className="text-ink-muted text-xs sm:text-sm font-semibold select-none">→</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setQuickFilter('custom');
                  setFechaHasta(e.target.value);
                }}
                className="bg-transparent text-xs sm:text-sm font-semibold text-ink focus:outline-none cursor-pointer"
                title="Fecha final"
              />
              {(fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  onClick={() => {
                    setFechaDesde('');
                    setFechaHasta('');
                    setQuickFilter('all');
                  }}
                  className="ml-1 cursor-pointer p-1 rounded-full text-ink-muted transition hover:text-danger hover:bg-surface-muted"
                  title="Restablecer fechas"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </div>
        }
      />

      {/* ========================================================= */}
      {/* 2. VISTA 1: GENERAL (Visión 360 y Alertas Prioritarias)    */}
      {/* ========================================================= */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* 4 KPIs de Visión General */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Facturación del Período"
              value={`$${totalFacturado.toLocaleString('es-CL')}`}
              icon={TrendingUp}
              tone="warning"
              change={{ value: '+20.4%', trend: 'up', label: 'vs anterior' }}
              subtitle={`$${totalAbonado.toLocaleString('es-CL')} recaudados`}
            />
            <MetricCard
              title="Total Contactos"
              value={clientes.length}
              icon={Building2}
              tone="success"
              change={{ value: '+8.1%', trend: 'up', label: 'este mes' }}
              subtitle="Cuentas activas en CRM"
            />
            <MetricCard
              title="Obras en Ejecución"
              value={obrasEnRielCount}
              icon={Factory}
              tone="info"
              change={{ value: '+14.2%', trend: 'up', label: 'activas' }}
              subtitle="Contratos en riel operativo"
            />
            <MetricCard
              title="Atención Requerida"
              value={totalAlertasCount}
              icon={AlertTriangle}
              tone="accent"
              change={{
                value: `${despachosEnRiesgo.length} despachos`,
                trend: despachosEnRiesgo.length > 0 ? 'down' : 'neutral',
                label: 'en riesgo',
              }}
              subtitle="Alertas operativas pendientes"
            />
          </div>

          {/* Fila Principal 50/50: Evolución de Ventas vs Alertas de Atención */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <div className="h-full">
              <SalesTimelineChart
                dailyData={dailySeries}
                monthlyData={monthlySeries}
                totalPeriodSales={totalPeriodTimelineSales}
                totalDealsClosed={totalDealsClosed}
                averageDealSize={averageDealSize}
              />
            </div>

            <div className="h-full flex flex-col justify-between rounded-panel border border-line bg-surface p-5 shadow-xs">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-control bg-warning-soft text-warning">
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink">
                        Qué necesita atención hoy
                      </h3>
                      <p className="t-caption text-ink-muted">
                        Alertas operativas y financieras prioritarias
                      </p>
                    </div>
                  </div>
                  <span className="t-micro rounded-full bg-surface-muted border border-line px-2.5 py-0.5 font-bold text-ink">
                    {totalAlertasCount} activas
                  </span>
                </div>

                <div className="mt-3 divide-y divide-line-subtle">
                  {/* Alerta 1: Despachos */}
                  <Link
                    href="/planificacion/calendario"
                    className="flex items-center justify-between py-3 px-2 rounded-control transition hover:bg-surface-muted group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-control bg-warning-soft text-warning shrink-0">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink group-hover:text-accent-ink transition">
                          Despachos en riesgo o activos
                        </p>
                        <p className="t-micro text-ink-muted">
                          {despachosEnRiesgo.length === 0
                            ? 'Sin entregas atrasadas ni reprogramadas'
                            : `${despachosEnRiesgo.length} evento(s) requieren supervisión`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="t-num font-bold text-ink text-sm">{despachosEnRiesgo.length}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-accent-ink" />
                    </div>
                  </Link>

                  {/* Alerta 2: Abonos */}
                  <Link
                    href="/caja"
                    className="flex items-center justify-between py-3 px-2 rounded-control transition hover:bg-surface-muted group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-control bg-success-soft text-success shrink-0">
                        <Wallet className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink group-hover:text-accent-ink transition">
                          Abonos por validar en Caja
                        </p>
                        <p className="t-micro text-ink-muted">
                          {abonosPendientes.length === 0
                            ? 'Todos los comprobantes conciliados'
                            : `$${totalMontoAbonosPorValidar.toLocaleString('es-CL')} pendientes en cuenta oficial`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="t-num font-bold text-ink text-sm">{abonosPendientes.length}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-accent-ink" />
                    </div>
                  </Link>

                  {/* Alerta 3: Postventa */}
                  <Link
                    href="/postventa"
                    className="flex items-center justify-between py-3 px-2 rounded-control transition hover:bg-surface-muted group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-control bg-accent-soft text-accent-ink shrink-0">
                        <ShieldAlert className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink group-hover:text-accent-ink transition">
                          Garantías y reclamos abiertos
                        </p>
                        <p className="t-micro text-ink-muted">
                          {casosPostventa.length === 0
                            ? 'Sin incidencias técnicas pendientes'
                            : `${casosPostventa.length} caso(s) en seguimiento técnico`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="t-num font-bold text-ink text-sm">{casosPostventa.length}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-accent-ink" />
                    </div>
                  </Link>

                  {/* Alerta 4: Compromisos */}
                  <Link
                    href="/administracion?empresa=inmobiliaria&seccion=pendientes_generales"
                    className="flex items-center justify-between py-3 px-2 rounded-control transition hover:bg-surface-muted group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-control bg-info-soft text-info shrink-0">
                        <Clock className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-ink group-hover:text-accent-ink transition">
                          Compromisos del día
                        </p>
                        <p className="t-micro text-ink-muted">
                          {recordatoriosStats.pendientes === 0
                            ? 'Compromisos al día (100%)'
                            : `${recordatoriosStats.pendientes} pendientes · ${recordatoriosStats.cumplimiento}% cumplimiento`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="t-num font-bold text-ink text-sm">{recordatoriosStats.pendientes}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted group-hover:text-accent-ink" />
                    </div>
                  </Link>
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Resumen del estado operacional</span>
                <span className="font-semibold text-accent-ink">Plataforma Hormiglass</span>
              </div>
            </div>
          </div>

          {/* Fila Secundaria 50/50: Leads Recientes y Tareas */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <RecentLeadsCard oportunidades={filteredOportunidades} />
            <TasksActivityCard
              recordatorios={recordatorios}
              eventos={eventos}
              onToggleComplete={handleCompleteRecordatorio}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. VISTA 2: VENTAS & PIPELINE                             */}
      {/* ========================================================= */}
      {activeTab === 'ventas' && (
        <div className="space-y-6">
          {/* 4 KPIs de Ventas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Prospectos"
              value={oportunidades.length}
              icon={Users}
              tone="info"
              change={{ value: '+12.5%', trend: 'up', label: 'este mes' }}
              subtitle={`${filteredOportunidades.length} en período seleccionado`}
            />
            <MetricCard
              title="Negocios en Pipeline"
              value={filteredOportunidades.filter((op) => !['prod_finalizado', 'rev_entregado', 'perdida'].includes(op.estado_pipeline)).length}
              icon={FolderKanban}
              tone="accent"
              change={{ value: '+15.3%', trend: 'up', label: 'este mes' }}
              subtitle={`$${Math.round(totalPipelineNominal / 1000).toLocaleString('es-CL')}k en negociación`}
            />
            <MetricCard
              title="Tasa de Conversión"
              value={`${totalDealsClosed > 0 ? Math.round((totalDealsClosed / Math.max(1, filteredOportunidades.length)) * 100) : 0}%`}
              icon={Target}
              tone="success"
              change={{ value: `${totalDealsClosed} cerradas`, trend: 'up', label: 'éxito' }}
              subtitle="Oportunidades concretadas"
            />
            <MetricCard
              title="Ticket Promedio"
              value={`$${averageDealSize.toLocaleString('es-CL')}`}
              icon={TrendingUp}
              tone="warning"
              change={{ value: '+10.3%', trend: 'up', label: 'vs mes anterior' }}
              subtitle="Monto medio por contrato"
            />
          </div>

          {/* Fila Principal 50/50: Evolución de Ventas & Embudo de Ventas (SIN ESPACIOS EN BLANCO) */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <div className="h-full">
              <SalesTimelineChart
                dailyData={dailySeries}
                monthlyData={monthlySeries}
                totalPeriodSales={totalPeriodTimelineSales}
                totalDealsClosed={totalDealsClosed}
                averageDealSize={averageDealSize}
              />
            </div>
            <div className="h-full">
              <PipelineFunnelChart
                stages={funnelStages}
                totalPipelineNominal={totalPipelineNominal}
                totalPipelineWeighted={totalPipelineWeighted}
              />
            </div>
          </div>

          {/* Fila Secundaria 50/50: Leads Recientes & Rankings de Vendedores y Segmentación */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <RecentLeadsCard oportunidades={filteredOportunidades} />
            <div className="space-y-5">
              <RankingBarChart
                title="Ventas por vendedor"
                subtitle="Rendimiento y volumen comercial por ejecutivo"
                icon={Award}
                items={rankingVendedores}
                emptyMessage="No hay ventas asignadas a vendedores en el período."
                maxItems={4}
              />
              <DonutChart
                title="Segmentación de clientes"
                subtitle="Distribución entre empresas corporativas y particulares"
                icon={Building2}
                segments={segmentacionClientes}
                centerLabel="Clientes"
                centerValue={clientes.length.toString()}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. VISTA 3: OPERACIONES & PLANTA                          */}
      {/* ========================================================= */}
      {activeTab === 'operaciones' && (
        <div className="space-y-6">
          {/* 4 KPIs Operativos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Obras en Riel"
              value={obrasEnRielCount}
              icon={Factory}
              tone="info"
              change={{ value: '100%', trend: 'neutral', label: 'trazabilidad' }}
              subtitle="Contratos activos en seguimiento"
            />
            <MetricCard
              title="En Fabricación Planta"
              value={filteredOportunidades.filter((o) => o.estado_pipeline === 'prod_fabricacion').length}
              icon={Package}
              tone="warning"
              change={{ value: '+4', trend: 'up', label: 'esta semana' }}
              subtitle="Lotes en moldes y fraguado"
            />
            <MetricCard
              title="Despachos Programados"
              value={despachosEnRiesgo.length}
              icon={MapPin}
              tone="accent"
              change={{ value: `${despachosEnRiesgo.length} activos`, trend: 'neutral', label: 'fletes' }}
              subtitle="Guías y rutas de despacho"
            />
            <MetricCard
              title="Casos Postventa"
              value={casosPostventa.length}
              icon={ShieldAlert}
              tone="success"
              change={{ value: 'Calidad', trend: 'neutral', label: 'técnica' }}
              subtitle="Garantías y rectificaciones"
            />
          </div>

          {/* Riel de Obra Agregado (Pallet Hormiglass) */}
          <div className="rounded-panel border border-line bg-surface p-5 space-y-4 shadow-xs">
            <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Riel de obra agregado
                </h3>
                <p className="t-caption text-ink-muted">
                  Recorrido de contratos activos por etapa del flujo comercial y logístico
                </p>
              </div>
              <Link
                href="/ventas"
                className="t-micro flex items-center gap-1 font-semibold text-accent-ink hover:underline"
              >
                Ver pipeline completo <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {rielObrasSemana.map((etapa, idx) => (
                <div
                  key={etapa.id}
                  className="relative flex flex-col justify-between rounded-control border border-line bg-surface-muted/60 p-3.5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="t-micro font-mono text-ink-muted">0{idx + 1}</span>
                      <span className="t-micro rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink">
                        {etapa.count} {etapa.count === 1 ? 'obra' : 'obras'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">
                      {etapa.label}
                    </p>
                  </div>
                  <div className="mt-3 border-t border-line-subtle pt-2">
                    <span className="t-caption t-num block font-medium text-ink-muted">
                      ${etapa.monto.toLocaleString('es-CL')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fila 50/50: Programación en Planta vs Productos Más Fabricados */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <div className="h-full flex flex-col justify-between rounded-panel border border-line bg-surface p-5 shadow-xs">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                      <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
                        <Factory className="h-4 w-4" aria-hidden />
                      </span>
                      <span>Obras y programación en planta</span>
                    </h3>
                    <p className="t-caption mt-0.5 text-ink-muted">
                      Eventos activos de fabricación, instalación y despacho
                    </p>
                  </div>
                  <Link
                    href="/planificacion/calendario"
                    className="t-micro flex items-center gap-0.5 font-semibold text-accent-ink hover:underline"
                  >
                    <span>Calendario</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {eventos.filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado)).length === 0 ? (
                  <div className="p-8 text-center text-xs italic text-ink-muted">
                    Sin eventos ni obras pendientes para este período.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-xs">
                    {eventos
                      .filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado))
                      .slice(0, 5)
                      .map((ev) => (
                        <div
                          key={ev.id}
                          className="space-y-1 rounded-control border border-line bg-surface-muted/60 p-3 transition hover:bg-surface-muted"
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate font-semibold text-ink max-w-[220px]">
                              {ev.titulo}
                            </span>
                            <StatusBadge tone={ev.estado === 'reprogramado' ? 'warning' : 'info'}>
                              {ev.tipo_evento}
                            </StatusBadge>
                          </div>
                          <div className="flex items-center justify-between text-ink-muted text-[11px]">
                            <span className="font-mono">{ev.fecha_inicio?.split('T')[0] || ev.fecha_evento}</span>
                            <span>{ev.responsable?.nombre || 'Sin responsable'}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-line pt-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Turnos de planta activos</span>
                <span className="font-semibold text-accent-ink">Líneas de moldeo y vibrado</span>
              </div>
            </div>

            <RankingBarChart
              title="Productos más vendidos y demandados"
              subtitle="Líneas de producto con mayor salida de fábrica"
              icon={Package}
              items={rankingProductos}
              emptyMessage="No hay productos cotizados en el período seleccionado."
              maxItems={5}
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. VISTA 4: FINANZAS & CAJA                               */}
      {/* ========================================================= */}
      {activeTab === 'finanzas' && (
        <div className="space-y-6">
          {/* 4 KPIs Financieros */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Total Facturado"
              value={`$${totalFacturado.toLocaleString('es-CL')}`}
              icon={TrendingUp}
              tone="warning"
              change={{ value: '+20.4%', trend: 'up', label: 'este mes' }}
              subtitle="Monto total convenido"
            />
            <MetricCard
              title="Recaudado en Caja"
              value={`$${totalAbonado.toLocaleString('es-CL')}`}
              icon={Wallet}
              tone="success"
              change={{ value: `${Math.round((totalAbonado / Math.max(1, totalFacturado)) * 100)}%`, trend: 'up', label: 'cobrado' }}
              subtitle="Abonos bancarios conciliados"
            />
            <MetricCard
              title="Saldo por Cobrar"
              value={`$${totalPendientePorPagar.toLocaleString('es-CL')}`}
              icon={CreditCard}
              tone="accent"
              change={{ value: `${filteredOportunidades.length} contratos`, trend: 'neutral', label: 'por liquidar' }}
              subtitle="Cuentas pendientes clientes"
            />
            <MetricCard
              title="Abonos por Conciliar"
              value={`$${totalMontoAbonosPorValidar.toLocaleString('es-CL')}`}
              icon={AlertTriangle}
              tone="info"
              change={{ value: `${abonosPendientes.length} pendientes`, trend: 'neutral', label: 'en caja' }}
              subtitle="Comprobantes para validar"
            />
          </div>

          {/* Fila Principal 50/50: Balance Financiero Bancario vs Abonos Pendientes */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <FinancialBalanceCard
              totalVendido={totalFacturado}
              totalAbonado={totalAbonado}
              totalPendiente={totalPendientePorPagar}
              totalOps={filteredOportunidades.length}
            />

            <div className="h-full flex flex-col justify-between rounded-panel border border-line bg-surface p-5 shadow-xs">
              <div>
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-control bg-success-soft text-success">
                      <Wallet className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink">
                        Abonos pendientes de conciliación
                      </h3>
                      <p className="t-caption text-ink-muted">
                        Comprobantes subidos que requieren validación en cuenta oficial
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/caja"
                    className="t-micro flex items-center gap-0.5 font-semibold text-accent-ink hover:underline"
                  >
                    <span>Ir a Caja</span>
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {abonosPendientes.length === 0 ? (
                  <div className="py-12 text-center text-xs text-ink-muted">
                    No hay comprobantes pendientes de conciliación en Caja.
                  </div>
                ) : (
                  <div className="mt-3 divide-y divide-line-subtle">
                    {abonosPendientes.slice(0, 5).map((abono) => (
                      <div key={abono.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {abono.cuenta_bancaria?.banco || abono.cuenta_bancaria?.alias || 'Comprobante de Abono'}
                          </p>
                          <p className="t-micro text-ink-muted">
                            Op: {abono.oportunidad?.codigo || abono.oportunidad_id?.slice(0, 8)} · {abono.fecha?.split('T')[0] || 'Pendiente'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="t-num block text-xs font-bold text-success">
                            +${(abono.monto || 0).toLocaleString('es-CL')}
                          </span>
                          <span className="t-micro text-ink-muted">
                            {abono.nota ? abono.nota.slice(0, 20) : 'Transferencia'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-line pt-3 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Total pendiente por conciliar:</span>
                <span className="font-bold text-ink t-num">
                  ${totalMontoAbonosPorValidar.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>

          {/* Fila Secundaria 50/50: Métodos de Pago & Comunas */}
          <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
            <DonutChart
              title="Métodos de pago utilizados"
              subtitle="Preferencia y recaudación según medio de pago"
              icon={CreditCard}
              segments={metodosPagoSegmentos}
              centerLabel="Operaciones"
              centerValue={filteredOportunidades.length.toString()}
            />
            <RankingBarChart
              title="Comunas más vendidas"
              subtitle="Ubicación geográfica con mayor volumen de venta"
              icon={MapPin}
              items={rankingComunas}
              emptyMessage="No hay registros de comunas en el período seleccionado."
              maxItems={5}
            />
          </div>
        </div>
      )}
    </div>
  );
}
