'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { EstadoOrdenCompra, OrdenCompra } from '../../lib/types';
import { OrdenCompraModal } from '../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../components/OrdenCompraPdfPreviewModal';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../lib/context/AuthContext';
import { AlertTriangle, Building, CheckCircle2, Download, Edit3, Eye, FileText, Plus, Search, Trash2 } from 'lucide-react';

const statusStyles = 'bg-white text-[#363636] border-gray-300';

export default function OrdenesCompraPage() {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewOrden, setPreviewOrden] = useState<OrdenCompra | null>(null);
  const [editingOrden, setEditingOrden] = useState<OrdenCompra | null>(null);
  const [deleteOrden, setDeleteOrden] = useState<OrdenCompra | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const loadOrdenes = useCallback(async () => {
    const { data, error } = await supabase
      .from('ordenes_compra')
      .select('*, proveedor:proveedores(*), oportunidad:oportunidades(*), items:orden_compra_items(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading ordenes de compra:', error);
      setOrdenes([]);
    } else {
      setOrdenes((data || []) as OrdenCompra[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let ignore = false;

    async function initialLoad() {
      if (!ignore) await loadOrdenes();
    }

    initialLoad();

    const channel = supabase
      .channel('realtime_ordenes_compra')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_compra' }, () => loadOrdenes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orden_compra_items' }, () => loadOrdenes())
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [loadOrdenes, supabase]);

  const filtered = ordenes.filter((orden) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      orden.numero_oc.toLowerCase().includes(q) ||
      orden.estado.toLowerCase().includes(q) ||
      (orden.proveedor?.nombre || '').toLowerCase().includes(q) ||
      (orden.proveedor?.rut || '').toLowerCase().includes(q)
    );
  });

  const totalItems = filtered.length;
  const paginatedOrdenes = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleChangeStatus = async (orden: OrdenCompra, estado: EstadoOrdenCompra) => {
    setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? { ...item, estado } : item)));
    const { error } = await supabase.from('ordenes_compra').update({ estado }).eq('id', orden.id);
    if (error) {
      console.error('Error updating OC status:', error);
      setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? orden : item)));
    }
  };

  const handleDelete = async () => {
    if (!deleteOrden) return;
    setErrorMsg('');
    const { error } = await supabase.from('ordenes_compra').delete().eq('id', deleteOrden.id);
    if (error) {
      console.error('Error deleting OC:', error);
      setSuccessMsg('');
      setErrorMsg(`No se pudo eliminar la OC: ${error.message}`);
      return;
    }
    setOrdenes((prev) => prev.filter((orden) => orden.id !== deleteOrden.id));
    setErrorMsg('');
    setSuccessMsg(`Orden de compra ${deleteOrden.numero_oc} eliminada.`);
    setDeleteOrden(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const escapeCsv = (value: unknown) => {
    const text = String(value ?? '');
    return `"${text.replaceAll('"', '""')}"`;
  };

  const handleExportCsv = () => {
    const rows = filtered.map((orden) => [
      orden.numero_oc,
      orden.fecha_emision,
      orden.estado,
      orden.proveedor?.nombre || '',
      orden.proveedor?.rut || '',
      orden.subtotal || 0,
      orden.monto_iva || 0,
      orden.costo_envio || 0,
      orden.otros_cargos || 0,
      orden.monto_total || 0,
    ]);
    const header = ['OC', 'Fecha', 'Estado', 'Proveedor', 'RUT', 'Subtotal', 'IVA', 'Envio', 'Otro', 'Total'];
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ordenes-compra-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-[#363636]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F7931F]" />
            <span>Ordenes de Compra</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">Emision, seguimiento y formato oficial de OC para proveedores Hormiglass.</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-[#363636] border border-gray-300 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>
          <Link href="/ordenes-compra/nuevo" className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span>Nueva OC</span>
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className="bg-white border border-[#F7931F] text-[#363636] p-4 rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-[#F7931F]" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-orange-50 border border-orange-200 text-orange-950 p-4 rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-[#F7931F]" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por OC, proveedor, RUT o estado..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
          />
        </div>
        <div className="text-xs text-gray-600 font-semibold">Mostrando {filtered.length} ordenes</div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-visible shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead className="bg-[#363636] text-white uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4">OC #</th>
                <th className="py-3.5 px-4">Versión</th>
                <th className="py-3.5 px-4">Fecha</th>
                <th className="py-3.5 px-4">Proveedor & RUT</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Subtotal</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">Cargando ordenes de compra desde Supabase...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">No se encontraron ordenes de compra.</td>
                </tr>
              ) : (
                paginatedOrdenes.map((orden) => (
                  <tr key={orden.id} className="hover:bg-gray-50 transition">
                    <td className="py-3.5 px-4 font-bold font-mono">{orden.numero_oc}</td>
                    <td className="py-3.5 px-4 font-mono text-gray-600">v{orden.version || 1}</td>
                    <td className="py-3.5 px-4 text-gray-600 font-mono">{new Date(`${orden.fecha_emision}T00:00:00`).toLocaleDateString('es-CL')}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Building className="w-3.5 h-3.5 text-[#F7931F]" />
                          <span>{orden.proveedor?.nombre || 'Proveedor'}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-mono pl-5">RUT: {orden.proveedor?.rut || 'Sin RUT'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={orden.estado}
                        onChange={(e) => handleChangeStatus(orden, e.target.value as EstadoOrdenCompra)}
                        className={`text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-xl border cursor-pointer focus:outline-none focus:border-[#F7931F] ${statusStyles}`}
                      >
                        <option value="borrador">Borrador</option>
                        <option value="emitida">Emitida</option>
                        <option value="aprobada">Aprobada</option>
                        <option value="recibida">Recibida</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold">${Number(orden.subtotal || 0).toLocaleString('es-CL')}</td>
                    <td className="py-3.5 px-4 text-right font-black text-sm">${Number(orden.monto_total || 0).toLocaleString('es-CL')}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setPreviewOrden(orden)} className="p-1.5 bg-white hover:bg-[#F7931F] text-[#363636] hover:text-white rounded-lg transition border border-gray-300" title="Previsualizar PDF">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingOrden(orden)} className="p-1.5 bg-white hover:bg-[#363636] text-[#363636] hover:text-white rounded-lg transition border border-gray-300" title="Editar OC">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {currentUser?.rol === 'admin' && (
                          <button onClick={() => setDeleteOrden(orden)} className="p-1.5 bg-white hover:bg-[#363636] text-[#363636] hover:text-white rounded-lg transition border border-gray-300" title="Eliminar OC">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
      </div>

      <OrdenCompraPdfPreviewModal orden={previewOrden} onClose={() => setPreviewOrden(null)} />
      <OrdenCompraModal
        isOpen={!!editingOrden}
        initialOrden={editingOrden}
        onClose={() => setEditingOrden(null)}
        onSuccess={loadOrdenes}
      />

      {deleteOrden && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#363636] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#F7931F]" />
                <span>Eliminar Orden de Compra</span>
              </h3>
              <button onClick={() => setDeleteOrden(null)} className="text-gray-400 hover:text-[#363636] font-bold">x</button>
            </div>
            <p className="text-xs text-gray-700">Esta accion eliminara permanentemente la OC <strong className="font-mono">{deleteOrden.numero_oc}</strong> y sus items asociados.</p>
            {errorMsg && (
              <div className="bg-orange-50 border border-orange-200 text-orange-950 p-3 rounded-xl text-xs font-bold">
                {errorMsg}
              </div>
            )}
            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button type="button" onClick={() => setDeleteOrden(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition">Cancelar</button>
              <button type="button" onClick={handleDelete} className="px-5 py-2 bg-[#363636] hover:bg-black text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>Eliminar OC</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
