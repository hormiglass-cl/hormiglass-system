'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/context/AuthContext';
import { createClient } from '../lib/supabase/client';
import { MOCK_CLIENTES, MOCK_COTIZACIONES, MOCK_OPORTUNIDADES } from '../lib/supabase/mock-data';
import { Cliente, Cotizacion, OportunidadVenta } from '../lib/types';
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
} from 'lucide-react';

export default function Dashboard() {
  const { currentUser } = useAuth();
  const supabase = createClient();

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');

  useEffect(() => {
    let ignore = false;
    async function loadDashboardData() {
      try {
        const [cotRes, opRes, cliRes] = await Promise.all([
          supabase.from('cotizaciones').select('*'),
          supabase.from('oportunidades').select('*'),
          supabase.from('clientes').select('*'),
        ]);

        if (!ignore) {
          if (cotRes.data) setCotizaciones(cotRes.data as Cotizacion[]);
          else setCotizaciones([]);

          if (opRes.data) setOportunidades(opRes.data as OportunidadVenta[]);
          else setOportunidades([]);

          if (cliRes.data) setClientes(cliRes.data as Cliente[]);
          else setClientes([]);
        }
      } catch (err) {
        console.error('Error loading dashboard data from Supabase:', err);
        if (!ignore) {
          setCotizaciones([]);
          setOportunidades([]);
          setClientes([]);
        }
      }
    }

    loadDashboardData();
    return () => {
      ignore = true;
    };
  }, []);

  // Helper: Get true opportunity value (sum of linked quotes in 'enviada' or 'aprobada' status)
  const getOportunidadTrueValue = (op: OportunidadVenta) => {
    const linkedQuotes = cotizaciones.filter(
      (c) => c.oportunidad_id === op.id && (c.estado === 'enviada' || c.estado === 'aprobada')
    );
    return linkedQuotes.reduce((sum, c) => sum + (c.monto_total || 0), 0);
  };

  // Filter opportunities by date range picker
  const oportunidadesFiltradas = oportunidades.filter((op) => {
    if (fechaDesde) {
      const d = new Date(fechaDesde);
      const opDate = new Date(op.fecha_inicio || (op as any).created_at || '');
      if (opDate < d) return false;
    }
    if (fechaHasta) {
      const h = new Date(fechaHasta);
      h.setHours(23, 59, 59, 999);
      const opDate = new Date(op.fecha_inicio || (op as any).created_at || '');
      if (opDate > h) return false;
    }
    return true;
  });

  // Filter calculations based on pipeline opportunities
  const opNuevas = oportunidadesFiltradas.filter((o) => o.estado_pipeline === 'nueva');
  const opPagadas = oportunidadesFiltradas.filter((o) => o.estado_pipeline === 'pagada');
  const opProgramadas = oportunidadesFiltradas.filter((o) => o.estado_pipeline === 'programada');
  const opEntregadas = oportunidadesFiltradas.filter((o) => o.estado_pipeline === 'entregada');

  // Facturación total proyectada desde oportunidades (únicamente cotizaciones enviada/aprobada)
  const totalFacturadoPipeline = oportunidadesFiltradas.reduce(
    (acc, op) => acc + getOportunidadTrueValue(op),
    0
  );

  // Total Abonado Acumulado
  const totalAbonadoAcumulado = oportunidadesFiltradas.reduce(
    (acc, op) => acc + (op.monto_abonado || 0),
    0
  );

  // Total Pendiente de Pago (Saldo)
  const totalPendientePago = oportunidadesFiltradas.reduce((acc, op) => {
    const trueVal = getOportunidadTrueValue(op);
    const abonado = op.monto_abonado || 0;
    return acc + Math.max(0, trueVal - abonado);
  }, 0);

  return (
    <div className="space-y-8 text-[#363636]">
      {/* Saludo de bienvenida y Filtro por Período de Calendario */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#363636] flex items-center gap-2 tracking-tight">
            <span>¡Hola, {currentUser?.nombre?.split(' ')[0] || 'Usuario'}!</span>
            <span className="animate-bounce">👋</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Resumen comercial y estado financiero de Oportunidades de Venta de Hormiglass.
          </p>
        </div>

        {/* Filtro Calendario Fecha Inicio - Fecha Fin */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 p-2.5 rounded-2xl shadow-xs text-xs self-start md:self-auto">
          <div className="flex items-center gap-1.5 font-extrabold text-[#363636]">
            <Calendar className="w-4 h-4 text-[#F7931F]" />
            <span>Filtro Calendario:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-gray-500 font-semibold">Desde:</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-[#363636] font-bold text-xs px-2.5 py-1 rounded-xl focus:outline-none focus:border-[#F7931F]"
            />
            <label className="text-[11px] text-gray-500 font-semibold">Hasta:</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="bg-gray-50 border border-gray-300 text-[#363636] font-bold text-xs px-2.5 py-1 rounded-xl focus:outline-none focus:border-[#F7931F]"
            />
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                }}
                className="text-[11px] text-red-600 font-bold hover:underline ml-1"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid de 3 columnas principales: Tarjeta destacada + Clientes/Cotizaciones + Accesos Rápido */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda (7 cols): Tarjeta Destacada Naranja + Sub-cards de KPIs de Pipeline */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tarjeta Destacada Valor Total */}
          <div className="bg-[#F7931F] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[160px]">
            <div className="flex items-center justify-between z-10">
              <span className="text-xs font-extrabold tracking-wider uppercase opacity-90">
                Valor Total del Pipeline de Ventas
              </span>
              <div className="w-9 h-9 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>

            <div className="my-3 z-10">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl sm:text-4xl font-black tracking-tight">
                  ${totalFacturadoPipeline.toLocaleString('es-CL')} CLP
                </span>
                <span className="bg-emerald-400 text-emerald-950 text-xs font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                  {oportunidadesFiltradas.length} ops filtradas
                </span>
              </div>
              <p className="text-[11px] text-white/80 font-medium mt-1">
                Suma real de cotizaciones marcadas en estado Enviada o Aprobada
              </p>
            </div>

            {/* Efecto decorativo de fondo */}
            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* KPI Cards Secundarias de Finanzas en Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[11px] font-extrabold uppercase text-emerald-800 tracking-wider block">
                  Total Abonado Acumulado
                </span>
                <span className="text-xl font-black text-emerald-950 block mt-0.5">
                  ${totalAbonadoAcumulado.toLocaleString('es-CL')} CLP
                </span>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Pagos y abonos recibidos en pipeline
                </span>
              </div>
              <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold shadow-xs shrink-0">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[11px] font-extrabold uppercase text-amber-800 tracking-wider block">
                  Pendiente de Pago
                </span>
                <span className="text-xl font-black text-amber-950 block mt-0.5">
                  ${totalPendientePago.toLocaleString('es-CL')} CLP
                </span>
                <span className="text-[10px] text-amber-700 font-semibold">
                  Saldo por cobrar respecto al valor total
                </span>
              </div>
              <div className="w-9 h-9 bg-[#F7931F] text-white rounded-xl flex items-center justify-center font-bold shadow-xs shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Grid de 4 KPIs por Estado de Pipeline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* KPI 1: Nuevas Oportunidades */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Nuevas Oportunidades</span>
                <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[#363636]">{opNuevas.length}</span>
                  <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    En Evaluación
                  </span>
                </div>
                <span className="text-[11px] text-gray-400 font-medium">Cotizaciones iniciales</span>
              </div>
            </div>

            {/* KPI 2: Pagos Validados */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Pago Validado</span>
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-[#363636]">{opPagadas.length}</span>
                  <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    Cobrado
                  </span>
                </div>
                <span className="text-[11px] text-blue-600 font-bold">
                  ${totalAbonadoAcumulado.toLocaleString('es-CL')} abonados
                </span>
              </div>
            </div>

            {/* KPI 3: En Programación / Planta */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">En Programación</span>
                <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
                  <BarChart3 className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-[#363636]">{opProgramadas.length}</span>
                <p className="text-[11px] text-gray-400 font-medium">Fabricación & Logística</p>
              </div>
            </div>

            {/* KPI 4: Entregadas & Cierre */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500">Entregadas & Cierre</span>
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-black text-[#363636]">{opEntregadas.length}</span>
                <p className="text-[11px] text-emerald-600 font-medium">Completadas con éxito</p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Resumen de Clientes, Cotizaciones y Accesos Rápido */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tarjetas Informativas de Clientes y Cotizaciones */}
          <div className="grid grid-cols-2 gap-4">
            <Link
              href="/clientes"
              className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm hover:border-[#F7931F] transition group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">Directorio Clientes</span>
                <Users className="w-4 h-4 text-[#F7931F]" />
              </div>
              <span className="text-2xl font-black text-[#363636] group-hover:text-[#F7931F]">{clientes.length}</span>
              <p className="text-[10px] text-gray-400 font-medium mt-1">Contactos registrados</p>
            </Link>

            <Link
              href="/cotizaciones"
              className="bg-white p-4 rounded-3xl border border-gray-200 shadow-sm hover:border-[#F7931F] transition group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">Total Cotizaciones</span>
                <FileText className="w-4 h-4 text-[#F7931F]" />
              </div>
              <span className="text-2xl font-black text-[#363636] group-hover:text-[#F7931F]">{cotizaciones.length}</span>
              <p className="text-[10px] text-gray-400 font-medium mt-1">Emitidas en sistema</p>
            </Link>
          </div>

          {/* Desglose por Etapa Comercial */}
          <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-[#363636]">Estado del Pipeline de Ventas</h3>
                <p className="text-[11px] text-gray-400 font-medium">Etapas comerciales de la empresa</p>
              </div>
              <div className="w-8 h-8 bg-[#363636] text-white rounded-full flex items-center justify-center">
                <PieChart className="w-4 h-4 text-[#F7931F]" />
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-bold text-[#363636]">1. Nuevas Oportunidades</span>
                </div>
                <span className="font-extrabold text-amber-700">{opNuevas.length}</span>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="font-bold text-[#363636]">2. Pago Validado</span>
                </div>
                <span className="font-extrabold text-blue-700">{opPagadas.length}</span>
              </div>

              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="font-bold text-[#363636]">3. En Programación</span>
                </div>
                <span className="font-extrabold text-purple-700">{opProgramadas.length}</span>
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-bold text-[#363636]">4. Entregadas & Cierre</span>
                </div>
                <span className="font-extrabold text-emerald-700">{opEntregadas.length}</span>
              </div>
            </div>

            <Link
              href="/ventas"
              className="w-full bg-[#363636] hover:bg-black text-white text-xs font-extrabold py-3 rounded-2xl transition shadow-md flex items-center justify-center gap-2"
            >
              <span>Ir al Pipeline de Ventas</span>
              <ChevronRight className="w-4 h-4 text-[#F7931F]" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tabla Reciente de Cotizaciones y Oportunidades Integradas */}
      <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="font-extrabold text-base text-[#363636]">Cotizaciones Recientes & Oportunidades</h3>
            <p className="text-xs text-gray-500">Últimas operaciones comerciales registradas</p>
          </div>
          <Link
            href="/cotizaciones"
            className="text-xs text-[#F7931F] font-bold hover:underline flex items-center gap-1"
          >
            <span>Ver todas</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-600 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="py-3 px-4">N° Cotización</th>
                <th className="py-3 px-4">Cliente / Empresa</th>
                <th className="py-3 px-4">Monto Total</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[#363636]">
              {cotizaciones.slice(0, 5).map((cot) => (
                <tr key={cot.id} className="hover:bg-orange-50/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-[#F7931F]">
                    {cot.numero_cotizacion}
                  </td>
                  <td className="py-3 px-4 font-bold">
                    {cot.cliente?.nombre || 'Cliente General'}
                  </td>
                  <td className="py-3 px-4 font-extrabold">
                    ${(cot.monto_total || 0).toLocaleString('es-CL')}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                      cot.estado === 'aprobada'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : cot.estado === 'enviada'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : cot.estado === 'declinada' || cot.estado === 'rechazada'
                        ? 'bg-red-100 text-red-800 border-red-300'
                        : 'bg-gray-100 text-gray-800 border-gray-300'
                    }`}>
                      {cot.estado}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href="/cotizaciones"
                      className="text-xs font-bold text-[#F7931F] hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Detalles</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

