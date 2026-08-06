'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import { MovimientoCaja, TipoMovimientoCaja } from '../../lib/types';
import {
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Building,
} from 'lucide-react';
import { useAuth } from '../../lib/context/AuthContext';
import { Pagination } from '../../components/Pagination';

export default function CajaPage() {
  const { currentUser } = useAuth();
  const supabase = createClient();
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [tipo, setTipo] = useState<TipoMovimientoCaja>('ingreso');
  const [monto, setMonto] = useState<number>(100000);
  const [categoria, setCategoria] = useState('Venta Directa');
  const [descripcion, setDescripcion] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    let ignore = false;
    async function loadMovimientos() {
      try {
        const { data, error } = await supabase
          .from('caja_movimientos')
          .select('*')
          .order('fecha', { ascending: false });

        if (!ignore) {
          if (!error && data) {
            setMovimientos(data as MovimientoCaja[]);
          } else {
            setMovimientos([]);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading caja movimientos:', err);
        if (!ignore) setLoading(false);
      }
    }
    loadMovimientos();

    const channel = supabase
      .channel('caja_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_movimientos' }, () => loadMovimientos())
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const totalIngresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((acc, m) => acc + m.monto, 0);

  const totalEgresos = movimientos
    .filter((m) => m.tipo === 'egreso')
    .reduce((acc, m) => acc + m.monto, 0);

  const flujoNeto = totalIngresos - totalEgresos;

  const handleAddMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || !categoria) return;

    const newMovPayload = {
      tipo,
      monto: Number(monto),
      categoria,
      descripcion: descripcion || categoria,
      usuario_id: currentUser?.id || null,
      fecha: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('caja_movimientos')
        .insert([newMovPayload])
        .select()
        .single();

      if (data) {
        setMovimientos([data as MovimientoCaja, ...movimientos]);
      }
    } catch (err) {
      console.error('Error adding movimiento to Supabase:', err);
    }

    setShowModal(false);
    setMonto(100000);
    setDescripcion('');
  };

  // Pagination for movimientos
  const totalItems = movimientos.length;
  const paginatedMovimientos = movimientos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#F7931F]" />
            <span>Caja & Estado de Resultados</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Control de flujo de caja diario, ingresos por abonos/ventas y egresos por materias primas/gastos.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-[#F7931F] hover:bg-[#e08316] text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Movimiento</span>
        </button>
      </div>

      {/* Tarjetas KPI de Estado de Resultados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Total Ingresos</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-3">${totalIngresos.toLocaleString('es-CL')}</p>
          <span className="text-xs text-gray-400 font-medium">Abonos y Ventas Liquidadas</span>
        </div>

        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Total Egresos</span>
            <div className="p-2 bg-red-500/10 text-red-400 rounded-lg">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-400 mt-3">${totalEgresos.toLocaleString('es-CL')}</p>
          <span className="text-xs text-gray-400 font-medium">Pagos Proveedores y Operación</span>
        </div>

        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Resultado Neto (Margen)</span>
            <div className="p-2 bg-[#F7931F]/10 text-[#F7931F] rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-white mt-3">${flujoNeto.toLocaleString('es-CL')}</p>
          <span className="text-xs text-emerald-400 font-medium">Balance Disponible en Planta</span>
        </div>
      </div>

      {/* Historial de Movimientos de Caja */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-visible shadow-xl p-4 space-y-4">
        <h2 className="text-sm font-bold text-white border-b border-gray-800 pb-3">
          Historial de Movimientos de Caja ({movimientos.length})
        </h2>

        <div className="overflow-visible">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-800/60 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
              <tr>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Tipo</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Descripción / Glosa</th>
                <th className="p-3.5 text-right">Monto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginatedMovimientos.map((m) => (
                <tr key={m.id} className="hover:bg-gray-800/40 transition">
                  <td className="p-3.5 text-gray-400 font-mono">
                    {new Date(m.fecha).toLocaleDateString('es-CL', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                        m.tipo === 'ingreso'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {m.tipo}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold text-white">{m.categoria}</td>
                  <td className="p-3.5 text-gray-300">{m.descripcion || '-'}</td>
                  <td
                    className={`p-3.5 text-right font-black text-sm ${
                      m.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pt-2">
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      </div>

      {/* Modal Registrar Movimiento */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-base font-bold text-white">Registrar Movimiento de Caja</h3>
            <form onSubmit={handleAddMovimiento} className="space-y-3">
              <div>
                <label className="block text-gray-300 mb-1">Tipo de Movimiento</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMovimientoCaja)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                >
                  <option value="ingreso">Ingreso (Abono / Cobro Venta)</option>
                  <option value="egreso">Egreso (Pago Proveedor / Gasto Operativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 mb-1">Monto ($) *</label>
                <input
                  type="number"
                  required
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-1">Categoría *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Abono 50% / Materia Prima / Flete"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-1">Descripción / Glosa</label>
                <textarea
                  rows={2}
                  placeholder="Detalle o respaldo del movimiento..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#F7931F] text-white font-bold rounded-xl">
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
