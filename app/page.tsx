'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import {
  Cliente,
  Cotizacion,
  OportunidadVenta,
  Usuario,
  EventoProduccionLogistica,
} from '../lib/types';
import {
  Users,
  FileText,
  DollarSign,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  PieChart,
  BarChart3,
  TrendingUp,
  Filter,
  Wrench,
  Truck,
  Factory,
  MapPin,
  Building2,
  Award,
  Package,
  CreditCard,
  Target,
  Clock,
  CheckCircle2,
  HardHat,
  RotateCcw,
} from 'lucide-react';

import { SalesTimelineChart, TimelineDataPoint } from '../components/dashboard/SalesTimelineChart';
import { DonutChart, DonutSegment } from '../components/dashboard/DonutChart';
import { RankingBarChart, RankingItem } from '../components/dashboard/RankingBarChart';
import { FinancialBalanceCard } from '../components/dashboard/FinancialBalanceCard';
import { PipelineFunnelChart, FunnelStageData } from '../components/dashboard/PipelineFunnelChart';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [eventos, setEventos] = useState<EventoProduccionLogistica[]>([]);

  // Filtros de fecha rápidos y personalizados
  const [quickFilter, setQuickFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year' | 'custom'>('all');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  // Carga de datos 100% en vivo desde Supabase
  const loadDashboardData = async () => {
    try {
      const [cotRes, opRes, cliRes, userRes, evRes] = await Promise.all([
        supabase.from('cotizaciones').select('*, items:cotizacion_items(*), cliente:clientes(*)'),
        supabase.from('oportunidades').select('*, cliente:clientes(*), cotizaciones(*)'),
        supabase.from('clientes').select('*'),
        supabase.from('usuarios').select('*').eq('activo', true),
        supabase.from('eventos_produccion_logistica').select('*, responsable:usuarios!responsable_id(*)'),
      ]);

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

      setLoading(false);
    } catch (err) {
      console.error('Error loading live dashboard data from Supabase:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Supabase Realtime multi-table sync
    const channel = supabase
      .channel('dashboard_live_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizacion_items' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => loadDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Helper para obtener el valor monetario real de una oportunidad
  const getOportunidadTrueValue = (op: OportunidadVenta): number => {
    const aprobada = op.cotizaciones?.find((c) => c.estado === 'aprobada');
    if (aprobada && aprobada.monto_total) return Number(aprobada.monto_total);

    const enviada = op.cotizaciones?.find((c) => c.estado === 'enviada');
    if (enviada && enviada.monto_total) return Number(enviada.monto_total);

    return Number(op.monto_estimado || 0);
  };

  // Manejador de filtros rápidos de tiempo
  const applyQuickFilter = (type: 'all' | 'today' | 'week' | 'month' | 'year') => {
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
    return filteredOportunidades.reduce((sum, op) => sum + Number(op.monto_abonado || 0), 0);
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
      .filter(([_, data]) => data.count > 0)
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
          op.productos.forEach((p: any) => {
            const name = typeof p === 'string' ? p : p.nombre || 'Bloques de vidrio estándar';
            const qty = Number(p.cantidad || 1);
            const val = Number(p.precio || p.total || 0);
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
      .filter(([_, data]) => data.count > 0 || data.monto > 0)
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
    ];

    let totalNominal = 0;
    let totalWeighted = 0;

    const stages: FunnelStageData[] = stageDefs.map((def) => {
      const opsInStage = filteredOportunidades.filter((o) => {
        if (def.id === 'entregada') {
          return o.estado_pipeline === 'entregada' || o.estado_pipeline === 'prod_finalizado' || o.estado_pipeline === 'rev_entregado';
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
  }, [filteredOportunidades]);

  // Eventos activos de producción y obras
  const eventosActivos = useMemo(() => {
    return eventos.filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado));
  }, [eventos]);

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-500 font-medium animate-pulse">
        Cargando centro de control y métricas en vivo desde Supabase...
      </div>
    );
  }

  return (
    <div className="space-y-7 text-[#363636] animate-fadeIn pb-12">
      {/* ========================================================= */}
      {/* 1. CABECERA, SALUDO & FILTROS TEMPORALES RÁPIDOS          */}
      {/* ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-gray-200 shadow-xs">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#363636] flex items-center gap-2 tracking-tight">
            <span>¡Hola, {currentUser?.nombre?.split(' ')[0] || 'Equipo Hormiglass'}!</span>
            <span className="animate-bounce">👋</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Centro de control ejecutivo y rendimiento comercial 100% en vivo desde Supabase.
          </p>
        </div>

        {/* Barra de Filtros Rápidos */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Píldoras de rango rápido */}
          <div className="inline-flex bg-gray-100 p-1 rounded-2xl text-xs font-bold text-gray-600">
            {[
              { id: 'all', label: 'Todo' },
              { id: 'today', label: 'Hoy' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
              { id: 'year', label: 'Año' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => applyQuickFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                  quickFilter === f.id
                    ? 'bg-white text-[#F7931F] shadow-xs font-black'
                    : 'hover:text-[#363636]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Datepicker Rango Manual */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-2xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#F7931F]" />
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setQuickFilter('custom');
                setFechaDesde(e.target.value);
              }}
              className="bg-transparent text-[#363636] font-bold text-xs focus:outline-none"
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
              className="bg-transparent text-[#363636] font-bold text-xs focus:outline-none"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Facturación Total */}
        <div className="bg-[#F7931F] text-white p-5 rounded-3xl shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <span className="text-xs font-bold opacity-90">Ventas totales</span>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="my-2 z-10">
            <span className="text-2xl font-black block tracking-tight">
              ${totalFacturado.toLocaleString('es-CL')} CLP
            </span>
            <span className="text-[11px] opacity-90 block mt-0.5">
              {filteredOportunidades.length} {filteredOportunidades.length === 1 ? 'oportunidad' : 'oportunidades'} en el período
            </span>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-lg pointer-events-none" />
        </div>

        {/* KPI 2: Cuánto Falta por Pagar */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Falta por pagar</span>
            <div className="w-8 h-8 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-amber-900 block tracking-tight">
              ${totalPendientePorPagar.toLocaleString('es-CL')} CLP
            </span>
            <span className="text-[11px] text-amber-700 font-semibold block mt-0.5">
              ${totalAbonado.toLocaleString('es-CL')} recaudados
            </span>
          </div>
        </div>

        {/* KPI 3: Proyección del Pipeline */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Proyección pipeline</span>
            <div className="w-8 h-8 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-blue-900 block tracking-tight">
              ${totalPipelineWeighted.toLocaleString('es-CL')} CLP
            </span>
            <span className="text-[11px] text-gray-400 font-medium block mt-0.5">
              Valor ponderado de cierre estimado
            </span>
          </div>
        </div>

        {/* KPI 4: Clientes & Obras Activas */}
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Operación activa</span>
            <div className="w-8 h-8 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <HardHat className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#363636]">
                {eventosActivos.length}
              </span>
              <span className="text-xs font-bold text-purple-700">obras & despachos</span>
            </div>
            <span className="text-[11px] text-gray-400 font-medium block mt-0.5">
              {clientes.length} clientes en directorio
            </span>
          </div>
        </div>
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
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-extrabold text-base text-[#363636] flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-purple-50 text-purple-600">
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
              className="text-xs text-[#F7931F] font-bold hover:underline flex items-center gap-0.5"
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
                  className="p-3 bg-gray-50 hover:bg-orange-50/40 rounded-2xl border border-gray-200 transition space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#363636] truncate max-w-[200px]">
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
      </div>
    </div>
  );
}
