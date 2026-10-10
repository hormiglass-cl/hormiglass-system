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
} from 'lucide-react';
import {
  PageHeader,
  StatusBadge,
} from '../components/ui';

import { SalesTimelineChart } from '../components/dashboard/SalesTimelineChart';
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
  const [abonosPendientes, setAbonosPendientes] = useState<Abono[]>([]);
  const [casosPostventa, setCasosPostventa] = useState<CasoPostventa[]>([]);

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

      setDeliveryAccreditation(
        Object.fromEntries(
          ((accreditationRows || []) as { venta_id: string; acreditada: boolean }[]).map((row) => [
            row.venta_id,
            row.acreditada,
          ])
        )
      );
      setLoadError(null);

      setCotizaciones((cotRes.data || []) as Cotizacion[]);
      setOportunidades((opRes.data || []) as OportunidadVenta[]);
      setClientes((cliRes.data || []) as Cliente[]);
      setUsuarios((userRes.data || []) as Usuario[]);
      setEventos((evRes.data || []) as EventoProduccionLogistica[]);
      setRecordatorios((recRes.data || []) as Recordatorio[]);
      setAbonosPendientes((aboRes.data || []) as Abono[]);
      setCasosPostventa((postRes.data || []) as CasoPostventa[]);

      setLoading(false);
    } catch (err) {
      console.error('Error loading live dashboard data from Supabase:', err);
      setLoadError('No se pudieron cargar los datos del panel. Reintenta más tarde.');
      setLoading(false);
    }
  }, [currentUserId, supabase]);

  useEffect(() => {
    const loadTimeout = window.setTimeout(() => {
      void loadDashboardData();
    }, 0);

    // Supabase Realtime multi-table sync
    const channel = supabase
      .channel('dashboard_live_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizacion_items' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos_produccion_logistica' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recordatorios' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abonos' }, () => void loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'postventa_casos' }, () => void loadDashboardData())
      .subscribe();

    return () => {
      window.clearTimeout(loadTimeout);
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

  const quickFilterOptions: { id: QuickFilterPreset; label: string }[] = [
    { id: 'all', label: 'Todo' },
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
  ];

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
      {/* 1. CABECERA & FILTROS TEMPORALES RÁPIDOS                  */}
      {/* ========================================================= */}
      <PageHeader
        title="Panel operativo"
        description={`Prioridades comerciales, pipeline y operación activa para ${currentUser?.nombre?.split(' ')[0] || 'el equipo'}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Píldoras de rango rápido */}
            <div className="inline-flex rounded-control border border-line bg-surface p-1 text-xs font-medium">
              {quickFilterOptions.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => applyQuickFilter(f.id)}
                  className={`cursor-pointer rounded-control px-2.5 py-1 transition ${
                    quickFilter === f.id
                      ? 'bg-accent text-on-accent font-semibold shadow-xs'
                      : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Datepicker Rango Manual */}
            <div className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-xs">
              <Calendar className="h-3.5 w-3.5 text-accent-ink" aria-hidden />
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setQuickFilter('custom');
                  setFechaDesde(e.target.value);
                }}
                className="bg-transparent text-xs text-ink focus:outline-none"
                title="Fecha inicial"
              />
              <span className="text-ink-muted">-</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setQuickFilter('custom');
                  setFechaHasta(e.target.value);
                }}
                className="bg-transparent text-xs text-ink focus:outline-none"
                title="Fecha final"
              />
              {(fechaDesde || fechaHasta) && (
                <button
                  type="button"
                  onClick={() => applyQuickFilter('all')}
                  className="ml-1 cursor-pointer p-0.5 text-ink-muted transition hover:text-danger"
                  title="Limpiar filtro de fechas"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>
        }
      />

      {/* ========================================================= */}
      {/* 2. SECCIÓN: QUÉ NECESITA MI ATENCIÓN HOY                 */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <h2 className="t-section text-ink">
          Qué necesita atención hoy
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {/* Tarjeta 1: Despachos en riesgo / activos */}
          <Link
            href="/planificacion/calendario"
            className="group flex flex-col justify-between rounded-panel border border-line bg-surface p-4 transition hover:border-accent hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-warning-soft text-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </span>
                <span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                  Logística
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink group-hover:text-accent-ink transition">
                Despachos en riesgo o activos
              </p>
              <p className="t-caption mt-0.5 text-ink-muted">
                {despachosEnRiesgo.length === 0
                  ? 'Sin entregas atrasadas ni reprogramadas'
                  : `${despachosEnRiesgo.length} evento(s) requieren supervisión`}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-2.5">
              <span className="t-figure text-ink">
                {despachosEnRiesgo.length}
              </span>
              <span className="t-micro flex items-center gap-0.5 font-medium text-accent-ink">
                Ver calendario <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Tarjeta 2: Pagos por validar en Caja */}
          <Link
            href="/caja"
            className="group flex flex-col justify-between rounded-panel border border-line bg-surface p-4 transition hover:border-accent hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-success-soft text-success">
                  <Wallet className="h-4 w-4" aria-hidden />
                </span>
                <span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                  Finanzas
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink group-hover:text-accent-ink transition">
                Abonos por validar
              </p>
              <p className="t-caption mt-0.5 text-ink-muted">
                {abonosPendientes.length === 0
                  ? 'Todos los comprobantes conciliados'
                  : `$${totalMontoAbonosPorValidar.toLocaleString('es-CL')} pendientes en caja`}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-2.5">
              <span className="t-figure text-ink">
                {abonosPendientes.length}
              </span>
              <span className="t-micro flex items-center gap-0.5 font-medium text-accent-ink">
                Validar en caja <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Tarjeta 3: Casos de postventa abiertos */}
          <Link
            href="/postventa"
            className="group flex flex-col justify-between rounded-panel border border-line bg-surface p-4 transition hover:border-accent hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink">
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                </span>
                <span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                  Calidad
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink group-hover:text-accent-ink transition">
                Garantías y reclamos abiertos
              </p>
              <p className="t-caption mt-0.5 text-ink-muted">
                {casosPostventa.length === 0
                  ? 'Sin casos de garantía pendientes'
                  : `${casosPostventa.length} caso(s) en seguimiento técnico`}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-2.5">
              <span className="t-figure text-ink">
                {casosPostventa.length}
              </span>
              <span className="t-micro flex items-center gap-0.5 font-medium text-accent-ink">
                Ver casos <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </Link>

          {/* Tarjeta 4: Recordatorios pendientes del usuario */}
          <Link
            href="/administracion?empresa=inmobiliaria&seccion=pendientes_generales"
            className="group flex flex-col justify-between rounded-panel border border-line bg-surface p-4 transition hover:border-accent hover:shadow-xs"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-info-soft text-info">
                  <Clock className="h-4 w-4" aria-hidden />
                </span>
                <span className="t-micro rounded-full border border-line bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                  Tareas
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-ink group-hover:text-accent-ink transition">
                Recordatorios y compromisos
              </p>
              <p className="t-caption mt-0.5 text-ink-muted">
                {recordatoriosStats.pendientes === 0
                  ? 'Compromisos al día (100%)'
                  : `${recordatoriosStats.pendientes} pendientes · ${recordatoriosStats.cumplimiento}% cumplimiento`}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-2.5">
              <span className="t-figure text-ink">
                {recordatoriosStats.pendientes}
              </span>
              <span className="t-micro flex items-center gap-0.5 font-medium text-accent-ink">
                Ver todos <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. RIEL AGREGADO DE LA SEMANA (FIRMA DE HORMIGLASS)       */}
      {/* ========================================================= */}
      <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center border-b border-line-subtle pb-3">
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

        {/* Bloques de avance tipo pallet */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rielObrasSemana.map((etapa, idx) => (
            <div
              key={etapa.id}
              className="relative flex flex-col justify-between rounded-control border border-line bg-surface-muted p-3.5"
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

      {/* ========================================================= */}
      {/* 4. CIFRAS CLAVE DEL NEGOCIO (.t-figure)                   */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex min-h-[120px] flex-col justify-center rounded-panel border border-line bg-surface p-4 text-center">
          <p className="t-figure text-ink">
            ${totalFacturado.toLocaleString('es-CL')}
          </p>
          <p className="t-caption mt-1.5 font-semibold text-ink">
            Ventas comerciales
          </p>
          <p className="t-micro text-ink-muted">
            {filteredOportunidades.length} contratos en el período
          </p>
        </div>

        <div className="flex min-h-[120px] flex-col justify-center rounded-panel border border-line bg-surface p-4 text-center">
          <p className="t-figure text-warning">
            ${totalPendientePorPagar.toLocaleString('es-CL')}
          </p>
          <p className="t-caption mt-1.5 font-semibold text-ink">
            Por cobrar
          </p>
          <p className="t-micro text-ink-muted">
            ${totalAbonado.toLocaleString('es-CL')} recaudados
          </p>
        </div>

        <div className="flex min-h-[120px] flex-col justify-center rounded-panel border border-line bg-surface p-4 text-center">
          <p className="t-figure text-info">
            ${totalPipelineWeighted.toLocaleString('es-CL')}
          </p>
          <p className="t-caption mt-1.5 font-semibold text-ink">
            Proyección pipeline
          </p>
          <p className="t-micro text-ink-muted">
            Valor ponderado estimado
          </p>
        </div>

        <div className="flex min-h-[120px] flex-col justify-center rounded-panel border border-line bg-surface p-4 text-center">
          <p className="t-figure text-ink">
            {eventos.filter((e) => ['por_hacer', 'en_curso'].includes(e.estado)).length}
          </p>
          <p className="t-caption mt-1.5 font-semibold text-ink">
            Operaciones activas
          </p>
          <p className="t-micro text-ink-muted">
            {clientes.length} clientes en directorio
          </p>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5. EVOLUCIÓN DE VENTAS & BALANCE FINANCIERO               */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SalesTimelineChart
            dailyData={dailySeries}
            monthlyData={monthlySeries}
            totalPeriodSales={totalPeriodTimelineSales}
          />
        </div>

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
      {/* 6. SEGMENTACIÓN DE CLIENTES & MÉTODOS DE PAGO             */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <DonutChart
          title="Segmentación de clientes"
          subtitle="Distribución entre empresas corporativas y clientes particulares"
          icon={Building2}
          segments={segmentacionClientes}
          centerLabel="Clientes"
          centerValue={clientes.length.toString()}
        />

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
      {/* 7. RANKINGS OPERATIVOS: COMUNAS, PRODUCTOS Y VENDEDORES  */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <RankingBarChart
          title="Comunas más vendidas"
          subtitle="Ubicación geográfica con mayor volumen de venta"
          icon={MapPin}
          items={rankingComunas}
          emptyMessage="No hay registros de comunas en el período seleccionado."
          maxItems={5}
        />

        <RankingBarChart
          title="Productos más vendidos"
          subtitle="Líneas de producto con mayor demanda del catálogo"
          icon={Package}
          items={rankingProductos}
          emptyMessage="No hay productos cotizados en el período seleccionado."
          maxItems={5}
        />

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
      {/* 8. PROYECCIÓN DE PIPELINE & OPERACIÓN EN PLANTA           */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PipelineFunnelChart
            stages={funnelStages}
            totalPipelineNominal={totalPipelineNominal}
            totalPipelineWeighted={totalPipelineWeighted}
          />
        </div>

        <div className="space-y-6 lg:col-span-5">
          {/* Obras y programación en planta */}
          <div className="space-y-4 rounded-panel border border-line bg-surface p-5">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <span className="grid h-7 w-7 place-items-center rounded-control bg-surface-muted text-accent-ink">
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
              <div className="space-y-2 text-xs">
                {eventos
                  .filter((e) => ['por_hacer', 'en_curso', 'reprogramado'].includes(e.estado))
                  .slice(0, 4)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="space-y-1 rounded-control border border-line bg-surface-muted/60 p-3 transition hover:bg-surface-muted"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate font-semibold text-ink max-w-[200px]">
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

          {/* Recordatorios pendientes */}
          <div className="space-y-4 rounded-panel border border-line bg-surface p-5">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <span className="grid h-7 w-7 place-items-center rounded-control bg-surface-muted text-accent-ink">
                    <Clock className="h-4 w-4" aria-hidden />
                  </span>
                  <span>Recordatorios pendientes</span>
                </h3>
                <p className="t-caption mt-0.5 text-ink-muted">
                  {recordatoriosStats.pendientes} pendientes · {recordatoriosStats.cumplimiento}% cumplimiento
                </p>
              </div>
              <Link
                href="/administracion?empresa=inmobiliaria&seccion=pendientes_generales"
                className="t-micro flex items-center gap-0.5 font-semibold text-accent-ink hover:underline"
              >
                <span>Ver todos</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {topRecordatoriosPendientes.length === 0 ? (
              <div className="p-8 text-center text-xs italic text-ink-muted">
                Sin recordatorios pendientes.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {topRecordatoriosPendientes.map((recordatorio) => {
                  const vencido = recordatorio.fecha_vencimiento < new Date().toISOString().split('T')[0];

                  return (
                    <div
                      key={recordatorio.id}
                      className={`flex items-start gap-3 rounded-control border p-3 transition ${
                        vencido
                          ? 'border-danger-line bg-danger-soft'
                          : 'border-line bg-surface-muted/60 hover:bg-surface-muted'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void handleCompleteRecordatorio(recordatorio)}
                        className="mt-0.5 cursor-pointer text-accent-ink hover:text-success transition"
                        title="Completar recordatorio"
                        aria-label="Completar recordatorio"
                      >
                        {recordatorio.completado ? (
                          <CheckSquare className="h-4 w-4 text-success" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-ink">
                            {recordatorio.titulo}
                          </span>
                          {vencido && (
                            <StatusBadge tone="danger">Vencido</StatusBadge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-muted">
                          <span className="font-mono">{recordatorio.fecha_vencimiento}</span>
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
