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
} from '../lib/types';
import { completeRecordatorio } from '../lib/recordatorios';
import { totalAbonado as calcularAbonado, totalComercial } from '../lib/oportunidad-finanzas';
import {
  DollarSign,
  Calendar,
  ChevronRight,
  Factory,
  MapPin,
  Building2,
  Award,
  Package,
  CreditCard,
  Target,
  Clock,
  CheckSquare,
  HardHat,
  ListChecks,
  RotateCcw,
  Square,
} from 'lucide-react';

import { SalesTimelineChart, TimelineDataPoint } from '../components/dashboard/SalesTimelineChart';
import { DonutChart, DonutSegment } from '../components/dashboard/DonutChart';
import { RankingBarChart, RankingItem } from '../components/dashboard/RankingBarChart';
import { FinancialBalanceCard } from '../components/dashboard/FinancialBalanceCard';
import { PipelineFunnelChart, FunnelStageData } from '../components/dashboard/PipelineFunnelChart';

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

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [deliveryAccreditation, setDeliveryAccreditation] = useState<Record<string, boolean>>({});
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);

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

      const [cotRes, opRes, cliRes, userRes, evRes, recRes] = await Promise.all([
        supabase.from('cotizaciones').select('*, items:cotizacion_items(*), cliente:clientes(*)'),
        supabase.from('oportunidades').select('*, cliente:clientes(*), cotizaciones:cotizaciones!cotizaciones_oportunidad_id_fkey(*)'),
        supabase.from('clientes').select('*'),
        supabase.from('usuarios').select('*').eq('activo', true),
        supabase.from('eventos_produccion_logistica').select('*, responsable:usuarios!responsable_id(*)'),
        recordatoriosQuery,
      ]);

      const queryError = [cotRes, opRes, cliRes, userRes, evRes, recRes].find((result) => result.error)?.error;
      if (queryError) throw queryError;
      const closedIds = ((opRes.data || []) as OportunidadVenta[])
        .filter((op) => ['entregada', 'prod_finalizado', 'rev_entregado'].includes(op.estado_pipeline))
        .map((op) => op.id);
      const { data: accreditationRows, error: accreditationError } = closedIds.length
        ? await supabase.rpc('estado_entrega_acreditada', { p_ventas: closedIds })
        : { data: [], error: null };
      if (accreditationError) throw accreditationError;
      setDeliveryAccreditation(Object.fromEntries(((accreditationRows || []) as { venta_id: string; acreditada: boolean }[])
        .map((row) => [row.venta_id, row.acreditada])));
      setLoadError(null);

      if (cotRes.data) setCotizaciones(cotRes.data as Cotizacion[]);
      else setCotizaciones([]);

      if (opRes.data) setOportunidades(opRes.data as OportunidadVenta[]);
      else setOportunidades([]);

      if (cliRes.data) setClientes(cliRes.data as Cliente[]);
      else setClientes([]);

      if (userRes.data) setUsuarios(userRes.data as Usuario[]);
      else setUsuarios([]);

      if (evRes.data) setEventos(evRes.data as EventoProduccionLogistica[]);
      else setEventos([]);

      if (recRes.data) setRecordatorios(recRes.data as Recordatorio[]);
      else setRecordatorios([]);

      setLoading(false);
    } catch (err) {
      console.error('Error loading live dashboard data from Supabase:', err);
      setLoadError('No se pudieron cargar los datos del panel. Reintenta más tarde.');
      setLoading(false);
    }
  }, [currentUserId, supabase]);

  useEffect(() => {
    const loadTimeout = window.setTimeout(() => {
      loadDashboardData();
    }, 0);

    // Supabase Realtime multi-table sync
    const channel = supabase
      .channel('dashboard_live_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizacion_items' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => loadDashboardData())
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeout);
      supabase.removeChannel(channel);
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

  // ===== MÉTRICAS FINANCIERAS Y DE COBRANZA =====
  const totalFacturado = useMemo(() => {
    return filteredOportunidades.reduce((sum, op) => sum + getOportunidadTrueValue(op), 0);
  }, [filteredOportunidades]);

  const totalAbonado = useMemo(() => {
    return filteredOportunidades.reduce((sum, op) => sum + calcularAbonado(op), 0);
  }, [filteredOportunidades]);

  const totalPendientePorPagar = useMemo(() => {
    return Math.max(0, totalFacturado - totalAbonado);
  }, [totalFacturado, totalAbonado]);

  // ===== 1. GRÁFICO DE EVOLUCIÓN DE VENTAS (DIARIAS Y MENSUALES) =====
  const { dailySeries, monthlySeries, totalPeriodTimelineSales } = useMemo(() => {
    const dailyMap: Record<string, { label: string; fullDateLabel: string; monto: number; count: number }> = {};
    const monthlyMap: Record<string, { label: string; fullDateLabel: string; monto: number; count: number }> = {};

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Inicializar últimos 14 días para asegurar continuidad visual
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

    // Inicializar últimos 6 meses
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

    // Agregar datos de oportunidades y cotizaciones
    filteredOportunidades.forEach((op) => {
      const dateStr = op.fecha_inicio || op.created_at;
      if (!dateStr) return;

      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;

      const dayKey = d.toISOString().split('T')[0];
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const val = getOportunidadTrueValue(op);
      accumulatedSales += val;

      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = {
          label: `${d.getDate()} ${monthNames[d.getMonth()]}`,
          fullDateLabel: d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
          monto: 0,
          count: 0,
        };
      }
      dailyMap[dayKey].monto += val;
      dailyMap[dayKey].count += 1;

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
          fullDateLabel: d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
          monto: 0,
          count: 0,
        };
      }
      monthlyMap[monthKey].monto += val;
      monthlyMap[monthKey].count += 1;
    });

    const dSeries: TimelineDataPoint[] = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, data]) => ({ dateKey, ...data }));

    const mSeries: TimelineDataPoint[] = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, data]) => ({ dateKey, ...data }));

    return {
      dailySeries: dSeries,
      monthlySeries: mSeries,
      totalPeriodTimelineSales: accumulatedSales,
    };
  }, [filteredOportunidades]);

  // ===== 2. SEGMENTACIÓN: PERSONA NATURAL VS JURÍDICA (PARTICULAR VS EMPRESA) =====
  const segmentacionClientes = useMemo((): DonutSegment[] => {
    let countEmpresa = 0;
    let countParticular = 0;
    let montoEmpresa = 0;
    let montoParticular = 0;

    clientes.forEach((cli) => {
      const esEmpresa = cli.tipo_cliente === 'juridica' || (cli.rut && parseInt(cli.rut.replace(/[^0-9]/g, ''), 10) >= 50000000);
      if (esEmpresa) {
        countEmpresa++;
      } else {
        countParticular++;
      }
    });

    filteredOportunidades.forEach((op) => {
      const cli = op.cliente || clientes.find((c) => c.id === op.cliente_id);
      const esEmpresa = cli?.tipo_cliente === 'juridica' || (cli?.rut && parseInt(cli.rut.replace(/[^0-9]/g, ''), 10) >= 50000000);
      const val = getOportunidadTrueValue(op);

      if (esEmpresa) {
        montoEmpresa += val;
      } else {
        montoParticular += val;
      }
    });

    return [
      {
        id: 'empresa',
        label: 'Empresas / Jurídicas',
        value: countEmpresa,
        monto: montoEmpresa,
        color: '#F7931F',
        sublabel: 'clientes corporativos',
      },
      {
        id: 'particular',
        label: 'Particulares / Naturales',
        value: countParticular,
        monto: montoParticular,
        color: '#3b82f6',
        sublabel: 'clientes residenciales',
      },
    ];
  }, [clientes, filteredOportunidades]);

  // ===== 3. MÉTODOS DE PAGO MÁS UTILIZADOS =====
  const metodosPagoSegmentos = useMemo((): DonutSegment[] => {
    const methodCounts: Record<string, { count: number; monto: number; label: string; color: string }> = {
      transferencia: { count: 0, monto: 0, label: 'Transferencia electrónica', color: '#10b981' },
      cheque: { count: 0, monto: 0, label: 'Cheque 30 / 60 días', color: '#8b5cf6' },
      efectivo: { count: 0, monto: 0, label: 'Efectivo / Anticipo', color: '#F7931F' },
      tarjeta: { count: 0, monto: 0, label: 'Tarjetas / Webpay', color: '#3b82f6' },
      credito: { count: 0, monto: 0, label: 'Crédito directo', color: '#f59e0b' },
    };

    filteredOportunidades.forEach((op) => {
      const val = getOportunidadTrueValue(op);
      const rawCond = (op.condicion_pago || '').toLowerCase();

      if (rawCond.includes('cheque')) {
        methodCounts.cheque.count++;
        methodCounts.cheque.monto += val;
      } else if (rawCond.includes('efectivo') || rawCond.includes('abono')) {
        methodCounts.efectivo.count++;
        methodCounts.efectivo.monto += val;
      } else if (rawCond.includes('webpay') || rawCond.includes('debito') || rawCond.includes('credito')) {
        methodCounts.tarjeta.count++;
        methodCounts.tarjeta.monto += val;
      } else {
        methodCounts.transferencia.count++;
        methodCounts.transferencia.monto += val;
      }
    });

    return Object.entries(methodCounts)
      .filter(([, data]) => data.count > 0)
      .map(([id, data]) => ({
        id,
        label: data.label,
        value: data.count,
        monto: data.monto,
        color: data.color,
        sublabel: 'operaciones',
      }));
  }, [filteredOportunidades]);

  // ===== 4. RANKING: COMUNAS MÁS VENDIDAS =====
  const rankingComunas = useMemo((): RankingItem[] => {
    const comunaMap: Record<string, { count: number; monto: number }> = {};

    filteredOportunidades.forEach((op) => {
      let comuna = op.comuna || op.cliente?.comuna;
      if (!comuna && op.cliente_id) {
        const found = clientes.find((c) => c.id === op.cliente_id);
        if (found?.comuna) comuna = found.comuna;
      }
      const cleanComuna = comuna && comuna.trim() ? comuna.trim() : 'Sin comuna asignada';
      const val = getOportunidadTrueValue(op);

      if (!comunaMap[cleanComuna]) {
        comunaMap[cleanComuna] = { count: 0, monto: 0 };
      }
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

  // ===== 5. RANKING: PRODUCTOS MÁS VENDIDOS =====
  const rankingProductos = useMemo((): RankingItem[] => {
    const prodMap: Record<string, { count: number; monto: number }> = {};

    // Extraer de items de cotizaciones
    filteredCotizaciones.forEach((cot) => {
      if (cot.items && Array.isArray(cot.items)) {
        cot.items.forEach((item) => {
          const name = item.producto ? item.producto.trim() : 'Bloques de vidrio estándar';
          if (!prodMap[name]) {
            prodMap[name] = { count: 0, monto: 0 };
          }
          prodMap[name].count += Number(item.cantidad || 1);
          prodMap[name].monto += Number(item.total_item || 0);
        });
      }
    });

    // Fallback de oportunidades si aún no hay items en cotizaciones
    if (Object.keys(prodMap).length === 0) {
      filteredOportunidades.forEach((op) => {
        if (op.productos && Array.isArray(op.productos)) {
          op.productos.forEach((p) => {
            const producto = p as ProductoDashboard;
            const name = typeof producto === 'string' ? producto : producto.nombre || 'Bloques de vidrio estándar';
            const qty = typeof producto === 'string' ? 1 : Number(producto.cantidad || 1);
            const val = typeof producto === 'string' ? 0 : Number(producto.precio || producto.total || 0);
            if (!prodMap[name]) {
              prodMap[name] = { count: 0, monto: 0 };
            }
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

  // ===== 6. RANKING: VENTAS POR VENDEDOR / EJECUTIVO =====
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

  // ===== 7. PROYECCIONES DE VENTA EN PIPELINE =====
  const { funnelStages, totalPipelineNominal, totalPipelineWeighted } = useMemo(() => {
    const stageDefs: { id: string; label: string; prob: number; color: string; bg: string }[] = [
      { id: 'nueva', label: '1. Nuevas oportunidades', prob: 20, color: '#f59e0b', bg: '#fef3c7' },
      { id: 'pagada', label: '2. Pago validado', prob: 90, color: '#3b82f6', bg: '#dbeafe' },
      { id: 'programada', label: '3. En programación', prob: 70, color: '#8b5cf6', bg: '#ede9fe' },
      { id: 'prod_fabricacion', label: '4. En fabricación', prob: 80, color: '#6366f1', bg: '#e0e7ff' },
      { id: 'prod_instalacion', label: '5. En instalación & obra', prob: 90, color: '#06b6d4', bg: '#cffafe' },
      { id: 'entregada', label: '6. Entregadas & cierre', prob: 100, color: '#10b981', bg: '#d1fae5' },
      { id: 'sin_acreditar', label: 'Entregas históricas sin acreditar', prob: 0, color: '#b45309', bg: '#fef3c7' },
    ];

    let totalNominal = 0;
    let totalWeighted = 0;

    const stages: FunnelStageData[] = stageDefs.map((def) => {
      const opsInStage = filteredOportunidades.filter((o) => {
        if (def.id === 'entregada') {
          return ['entregada', 'prod_finalizado', 'rev_entregado'].includes(o.estado_pipeline) && deliveryAccreditation[o.id] === true;
        }
        if (def.id === 'sin_acreditar') {
          return ['entregada', 'prod_finalizado', 'rev_entregado'].includes(o.estado_pipeline) && deliveryAccreditation[o.id] !== true;
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

  // Eventos activos de producción y obras
  const eventosActivos = useMemo(() => {
    return eventos.filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado));
  }, [eventos]);

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

  const quickFilterOptions: { id: QuickFilterPreset; label: string }[] = [
    { id: 'all', label: 'Todo' },
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
  ];

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
        Cargando centro de control y métricas en vivo...
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-6 text-sm font-medium text-red-800">
        {loadError}
        <button type="button" onClick={() => { setLoading(true); void loadDashboardData(); }} className="ml-3 underline">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[#213343] pb-8">
      {/* ========================================================= */}
      {/* 1. CABECERA, SALUDO & FILTROS TEMPORALES RÁPIDOS          */}
      {/* ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-xs">
        <div>
          <p className="text-[11px] font-extrabold uppercase text-gray-400">Workspace</p>
          <h1 className="text-xl font-black text-[#213343] flex items-center gap-2 tracking-normal">
            <span>Panel operativo</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Prioridades comerciales, pipeline y operación activa para {currentUser?.nombre?.split(' ')[0] || 'Hormiglass'}.
          </p>
        </div>

        {/* Barra de Filtros Rápidos */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Píldoras de rango rápido */}
          <div className="inline-flex bg-gray-100 p-1 rounded-md text-xs font-bold text-gray-600">
            {quickFilterOptions.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => applyQuickFilter(f.id)}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                  quickFilter === f.id
                    ? 'bg-white text-[#f97316] shadow-xs font-black'
                    : 'hover:text-[#213343]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Datepicker Rango Manual */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-md text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#f97316]" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setQuickFilter('custom');
                setFechaDesde(e.target.value);
              }}
              className="bg-transparent text-[#213343] font-bold text-xs focus:outline-none"
              title="Fecha inicial"
            />
            <span className="text-gray-400 font-bold">-</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setQuickFilter('custom');
                setFechaHasta(e.target.value);
              }}
              className="bg-transparent text-[#213343] font-bold text-xs focus:outline-none"
              title="Fecha final"
            />
            {(fechaDesde || fechaHasta) && (
              <button
                type="button"
                onClick={() => applyQuickFilter('all')}
                className="text-gray-400 hover:text-red-500 transition ml-1 p-0.5"
                title="Limpiar filtro de fechas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. FILA DE 4 KPIS EJECUTIVOS DESTACADOS                  */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Ventas comerciales', value: `$${totalFacturado.toLocaleString('es-CL')}`, note: `${filteredOportunidades.length} oportunidades en el período`, tone: 'text-[#252b2d]' },
          { label: 'Por cobrar', value: `$${totalPendientePorPagar.toLocaleString('es-CL')}`, note: `$${totalAbonado.toLocaleString('es-CL')} abonados`, tone: 'text-amber-800' },
          { label: 'Proyección pipeline', value: `$${totalPipelineWeighted.toLocaleString('es-CL')}`, note: 'Valor ponderado estimado', tone: 'text-blue-700' },
          { label: 'Operación activa', value: String(eventosActivos.length), note: `${clientes.length} clientes en directorio`, tone: 'text-[#252b2d]' },
        ].map((kpi) => <div key={kpi.label} className="hg-panel flex min-h-[146px] flex-col items-center justify-center p-4 text-center">
          <p className={`hg-kpi-value tabular-nums ${kpi.tone}`}>{kpi.value}</p>
          <p className="hg-overline mt-2">{kpi.label}</p>
          <p className="mt-1 text-[11px] text-[#8a9390]">{kpi.note}</p>
        </div>)}
      </div>

      {/* ========================================================= */}
      {/* 3. EVOLUCIÓN DE VENTAS & BALANCE FINANCIERO               */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Gráfico de Ventas Diarias / Mensuales (7 cols) */}
        <div className="lg:col-span-7">
          <SalesTimelineChart
            dailyData={dailySeries}
            monthlyData={monthlySeries}
            totalPeriodSales={totalPeriodTimelineSales}
          />
        </div>

        {/* Estado Financiero y Cuánto Falta por Pagar (5 cols) */}
        <div className="lg:col-span-5">
          <FinancialBalanceCard
            totalVendido={totalFacturado}
            totalAbonado={totalAbonado}
            totalPendiente={totalPendientePorPagar}
            totalOps={filteredOportunidades.length}
          />
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. SEGMENTACIÓN DE CLIENTES & MÉTODOS DE PAGO             */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Segmentación Natural vs Jurídica / Particular vs Empresa */}
        <DonutChart
          title="Segmentación de clientes"
          subtitle="Distribución entre empresas corporativas y clientes particulares"
          icon={Building2}
          segments={segmentacionClientes}
          centerLabel="Clientes"
          centerValue={clientes.length.toString()}
        />

        {/* Métodos de Pago Más Utilizados */}
        <DonutChart
          title="Métodos de pago utilizados"
          subtitle="Preferencia y recaudación según condición y medio de pago"
          icon={CreditCard}
          segments={metodosPagoSegmentos}
          centerLabel="Operaciones"
          centerValue={filteredOportunidades.length.toString()}
        />
      </div>

      {/* ========================================================= */}
      {/* 5. RANKINGS OPERATIVOS: COMUNAS, PRODUCTOS Y VENDEDORES  */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Ranking 1: Comunas Más Vendidas */}
        <RankingBarChart
          title="Comunas más vendidas"
          subtitle="Ubicación geográfica con mayor volumen de venta"
          icon={MapPin}
          items={rankingComunas}
          emptyMessage="No hay registros de comunas en el período seleccionado."
          maxItems={5}
        />

        {/* Ranking 2: Productos Más Vendidos */}
        <RankingBarChart
          title="Productos más vendidos"
          subtitle="Líneas de producto con mayor demanda del catálogo"
          icon={Package}
          items={rankingProductos}
          emptyMessage="No hay productos cotizados en el período seleccionado."
          maxItems={5}
        />

        {/* Ranking 3: Ventas por Vendedor / Ejecutivo */}
        <RankingBarChart
          title="Ventas por vendedor"
          subtitle="Rendimiento y volumen comercial por ejecutivo asignado"
          icon={Award}
          items={rankingVendedores}
          emptyMessage="No hay ventas asignadas a vendedores en el período."
          maxItems={5}
        />
      </div>

      {/* ========================================================= */}
      {/* 6. PROYECCIÓN DE VENTAS EN PIPELINE & ACCESOS RÁPIDOS     */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Embudo y Proyecciones Ponderadas del Pipeline (7 cols) */}
        <div className="lg:col-span-7">
          <PipelineFunnelChart
            stages={funnelStages}
            totalPipelineNominal={totalPipelineNominal}
            totalPipelineWeighted={totalPipelineWeighted}
          />
        </div>

        {/* Obras y Despachos Activos de Producción & Logística (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-purple-50 text-purple-600">
                    <Factory className="w-4 h-4" />
                  </div>
                  <span>Obras y programación en planta</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Eventos activos de fabricación, instalación y despacho
                </p>
              </div>
              <Link
                href="/planificacion/calendario"
                className="text-xs text-[#f97316] font-bold hover:underline flex items-center gap-0.5"
              >
                <span>Calendario</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {eventosActivos.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs italic">
                ✓ Sin eventos ni obras pendientes para este período.
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                {eventosActivos.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 bg-gray-50 hover:bg-orange-50/40 rounded-lg border border-gray-200 transition space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[#213343] truncate max-w-[200px]">
                        {ev.titulo}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 capitalize text-gray-600">
                        {ev.tipo_evento}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-gray-500 font-mono text-[11px]">
                      <span>{ev.fecha_inicio?.split('T')[0] || ev.fecha_evento}</span>
                      <span>{ev.responsable?.nombre || 'Sin responsable'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-[#213343] flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-orange-50 text-[#f97316]">
                    <ListChecks className="w-4 h-4" />
                  </div>
                  <span>Recordatorios pendientes</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  {recordatoriosStats.pendientes} pendientes · {recordatoriosStats.cumplimiento}% cumplimiento
                </p>
              </div>
              <Link
                href="/administracion?empresa=inmobiliaria&seccion=pendientes_generales"
                className="text-xs text-[#f97316] font-bold hover:underline flex items-center gap-0.5"
              >
                <span>Ver todos</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {topRecordatoriosPendientes.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs italic">
                ✓ Sin recordatorios pendientes.
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                {topRecordatoriosPendientes.map((recordatorio) => {
                  const vencido = recordatorio.fecha_vencimiento < new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={recordatorio.id}
                      className={`p-3 rounded-lg border transition flex items-start gap-3 ${
                        vencido ? 'bg-red-50 border-red-200' : 'bg-gray-50 hover:bg-orange-50/40 border-gray-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleCompleteRecordatorio(recordatorio)}
                        className="mt-0.5 text-[#f97316] hover:text-emerald-600 transition"
                        title="Completar recordatorio"
                      >
                        {recordatorio.completado ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-[#213343] truncate">
                            {recordatorio.titulo}
                          </span>
                          {vencido && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white">
                              Vencido
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-gray-500 font-mono text-[11px] mt-1">
                          <span>{recordatorio.fecha_vencimiento}</span>
                          <span className="capitalize">{recordatorio.recurrencia}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
