'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [formError, setFormError] = useState('');

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

      if (error) throw error;
      if (data) {
        setMovimientos([data as MovimientoCaja, ...movimientos]);
      }
    } catch (err) {
      console.error('Error adding movimiento to Supabase:', err);
      setFormError('No se pudo guardar el movimiento. Verifica los datos y tus permisos.');
      return;
    }

    setFormError('');
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
    <div className="hg-page space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e5e7e4] pb-5">
        <div>
          <p className="hg-overline">Finanzas / Movimientos</p>
          <h1 className="text-2xl font-extrabold text-[#252b2d] flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#f97316]" />
            <span>Caja & Estado de Resultados</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Control de flujo de caja diario, ingresos por abonos/ventas y egresos por materias primas/gastos.
          </p>
        </div>

        <div className="flex items-center gap-2">
        <Link href="/reportes" className="hg-button-secondary">Ver reportes</Link>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Movimiento</span>
        </button>
        </div>
      </div>

      {/* Tarjetas KPI de Estado de Resultados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Total Ingresos</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-700 rounded-lg">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-3">${totalIngresos.toLocaleString('es-CL')}</p>
          <span className="text-xs text-gray-500 font-medium">Abonos y Ventas Liquidadas</span>
        </div>

        <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Total Egresos</span>
            <div className="p-2 bg-red-500/10 text-red-700 rounded-lg">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-red-700 mt-3">${totalEgresos.toLocaleString('es-CL')}</p>
          <span className="text-xs text-gray-500 font-medium">Pagos Proveedores y Operación</span>
        </div>

        <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Saldo neto de Caja</span>
            <div className="p-2 bg-[#f97316]/10 text-[#f97316] rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-[#252b2d] mt-3">${flujoNeto.toLocaleString('es-CL')}</p>
          <span className="text-xs text-gray-500 font-medium">Ingresos registrados menos egresos registrados</span>
        </div>
      </div>

      {/* Historial de Movimientos de Caja */}
      <div className="hg-list-group p-4 space-y-4">
        <h2 className="text-sm font-bold text-[#252b2d] border-b border-[#e5e7e4] pb-3">
          Historial de Movimientos de Caja ({movimientos.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="hg-list-table w-full min-w-[700px] text-left text-xs">
            <thead className="bg-[#f7f7f5] text-gray-500 uppercase text-[10px] tracking-normal border-b border-[#e5e7e4]">
              <tr>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Tipo</th>
                <th className="p-3.5">Categoría</th>
                <th className="p-3.5">Descripción / Glosa</th>
                <th className="p-3.5 text-right">Monto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0ee]">
              {paginatedMovimientos.map((m) => (
                <tr key={m.id} className="hover:bg-[#f7f7f5] transition">
                  <td className="p-3.5 text-gray-500 font-mono">
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
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {m.tipo}
                    </span>
                  </td>
                  <td className="p-3.5 font-semibold text-[#252b2d]">{m.categoria}</td>
                  <td className="p-3.5 text-gray-600">{m.descripcion || '-'}</td>
                  <td
                    className={`p-3.5 text-right font-black text-sm ${
                      m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'
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
          <div className="bg-white border border-[#e5e7e4] rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-xs">
            <h3 className="text-base font-bold text-[#252b2d]">Registrar Movimiento de Caja</h3>
            {formError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-red-700">{formError}</p>}
            <form onSubmit={handleAddMovimiento} className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1">Tipo de Movimiento</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMovimientoCaja)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                >
                  <option value="ingreso">Ingreso (Abono / Cobro Venta)</option>
                  <option value="egreso">Egreso (Pago Proveedor / Gasto Operativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Monto ($) *</label>
                <input
                  type="number"
                  required
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Categoría *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Abono 50% / Materia Prima / Flete"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Descripción / Glosa</label>
                <textarea
                  rows={2}
                  placeholder="Detalle o respaldo del movimiento..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#f4f5f3] text-gray-600 rounded-md"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#f97316] text-white font-bold rounded-md">
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
