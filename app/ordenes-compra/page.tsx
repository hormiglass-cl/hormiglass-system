'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import {
  EstadoOrdenCompra,
  OrdenCompra,
  CuentaBancaria,
  CajaSubcategoria,
} from '../../lib/types';
import { OrdenCompraModal } from '../../components/OrdenCompraModal';
import { OrdenCompraPdfPreviewModal } from '../../components/OrdenCompraPdfPreviewModal';
import { Pagination } from '../../components/Pagination';
import { useAuth } from '../../lib/context/AuthContext';
import {
  AlertTriangle,
  Building,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  Eye,
  FileText,
  Landmark,
  Plus,
  Search,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';

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

  // Pago en Caja State
  const [payingOrden, setPayingOrden] = useState<OrdenCompra | null>(null);
  const [payCuentaId, setPayCuentaId] = useState('');
  const [paySubcatId, setPaySubcatId] = useState('');
  const [payDescripcion, setPayDescripcion] = useState('');
  const [payingLoading, setPayingLoading] = useState(false);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [subcategorias, setSubcategorias] = useState<CajaSubcategoria[]>([]);

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
      setErrorMsg(mensajeError(error, 'No se pudo eliminar la OC.'));
      return;
    }
    setOrdenes((prev) => prev.filter((orden) => orden.id !== deleteOrden.id));
    setErrorMsg('');
    setSuccessMsg(`Orden de compra ${deleteOrden.numero_oc} eliminada.`);
    setDeleteOrden(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Apertura del modal de pago en caja
  const handleOpenPayModal = async (orden: OrdenCompra) => {
    setPayingOrden(orden);
    setPayDescripcion(`Pago OC ${orden.numero_oc} - ${orden.proveedor?.nombre || 'Proveedor'}`);

    if (cuentasBancarias.length === 0) {
      const { data: cbData } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('activo', true)
        .order('alias');
      if (cbData && cbData.length > 0) {
        setCuentasBancarias(cbData as CuentaBancaria[]);
        setPayCuentaId(cbData[0].id);
      }
    } else {
      setPayCuentaId(cuentasBancarias[0]?.id || '');
    }

    if (subcategorias.length === 0) {
      const { data: subData } = await supabase
        .from('caja_subcategorias')
        .select('*, categoria:caja_categorias(*)')
        .eq('activo', true)
        .order('orden');
      if (subData && subData.length > 0) {
        setSubcategorias(subData as CajaSubcategoria[]);
        const defaultSub =
          subData.find((s: any) => s.nombre.toLowerCase().includes('materiales')) || subData[0];
        setPaySubcatId(defaultSub.id);
      }
    } else {
      const defaultSub =
        subcategorias.find((s) => s.nombre.toLowerCase().includes('materiales')) || subcategorias[0];
      setPaySubcatId(defaultSub?.id || '');
    }
  };

  // Confirmación de pago en caja via RPC
  const handleConfirmPayment = async () => {
    if (!payingOrden || !payCuentaId) return;
    try {
      setPayingLoading(true);
      setErrorMsg('');

      const { error } = await supabase.rpc('pagar_orden_compra_en_caja', {
        p_orden_compra_id: payingOrden.id,
        p_cuenta_bancaria_id: payCuentaId,
        p_subcategoria_id: paySubcatId || null,
        p_descripcion: payDescripcion.trim() || null,
      });

      if (error) throw error;

      setSuccessMsg(`¡Orden de compra ${payingOrden.numero_oc} pagada exitosamente! Se generó el egreso en Caja.`);
      setPayingOrden(null);
      await loadOrdenes();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: unknown) {
      console.error('Error pagando orden de compra:', err);
      setErrorMsg(mensajeError(err, 'No se pudo registrar el pago de la orden de compra en Caja.'));
    } finally {
      setPayingLoading(false);
    }
  };

  const getStatusBadge = (estado: EstadoOrdenCompra) => {
    if (estado === 'pagada') {
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    }
    if (estado === 'aprobada') {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (estado === 'recibida') {
      return 'bg-purple-50 text-purple-800 border-purple-200';
    }
    if (estado === 'cancelada') {
      return 'bg-red-50 text-red-800 border-red-200';
    }
    return 'bg-gray-50 text-gray-700 border-gray-300';
  };

  return (
    <div className="hg-page space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-black text-[#213343] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#f97316]" />
            <span>Órdenes de Compra</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestión de abastecimiento, distribución entre ventas (NV) y liquidación de pagos en Caja.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/ordenes-compra/nuevo"
            className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva OC</span>
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por OC #, proveedor o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#f4f5f3] rounded-lg text-xs text-[#213343] font-semibold border border-transparent focus:border-[#f97316] focus:outline-none"
          />
        </div>
      </div>

      {/* Tabla Desktop */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[980px]">
            <thead className="bg-[#f4f5f3] text-[#66716f] uppercase text-[10px] tracking-normal border-b border-gray-200">
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
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    Cargando órdenes de compra...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    No se encontraron órdenes de compra.
                  </td>
                </tr>
              ) : (
                paginatedOrdenes.map((orden) => (
                  <tr key={orden.id} className="hover:bg-gray-50 transition">
                    <td className="py-3.5 px-4 font-bold font-mono text-[#213343]">
                      {orden.numero_oc}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-gray-600">v{orden.version || 1}</td>
                    <td className="py-3.5 px-4 text-gray-600 font-mono">
                      {new Date(`${orden.fecha_emision}T00:00:00`).toLocaleDateString('es-CL')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Building className="w-3.5 h-3.5 text-[#f97316]" />
                          <span>{orden.proveedor?.nombre || 'Proveedor'}</span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-mono pl-5">
                          RUT: {orden.proveedor?.rut || 'Sin RUT'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {orden.estado === 'pagada' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-2.5 py-1 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Pagada en Caja</span>
                        </span>
                      ) : (
                        <select
                          value={orden.estado}
                          onChange={(e) => handleChangeStatus(orden, e.target.value as EstadoOrdenCompra)}
                          className={`text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-md border cursor-pointer focus:outline-none focus:border-[#f97316] ${getStatusBadge(
                            orden.estado
                          )}`}
                        >
                          <option value="borrador">Borrador</option>
                          <option value="emitida">Emitida</option>
                          <option value="aprobada">Aprobada</option>
                          <option value="recibida">Recibida</option>
                          <option value="pagada">Pagada en Caja</option>
                          <option value="cancelada">Cancelada</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-gray-700">
                      ${Number(orden.subtotal || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-black text-sm text-[#213343]">
                      ${Number(orden.monto_total || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Botón de Pago en Caja si no está pagada */}
                        {orden.estado !== 'pagada' && orden.estado !== 'cancelada' && (
                          <button
                            type="button"
                            onClick={() => handleOpenPayModal(orden)}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded-md transition border border-emerald-300 font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                            title="Pagar Orden de Compra en Caja"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pagar</span>
                          </button>
                        )}

                        <Link
                          href={`/ordenes-compra/${orden.id}/asignaciones`}
                          className="text-[11px] font-bold text-[#f97316] hover:underline"
                          title="Distribuir OC entre ventas"
                        >
                          Asignar
                        </Link>

                        <button
                          onClick={() => setPreviewOrden(orden)}
                          className="p-1.5 bg-white hover:bg-[#f97316] text-[#213343] hover:text-white rounded-lg transition border border-gray-300 cursor-pointer"
                          title="Previsualizar PDF"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingOrden(orden)}
                          className="p-1.5 bg-white hover:bg-[#213343] text-[#213343] hover:text-white rounded-lg transition border border-gray-300 cursor-pointer"
                          title="Editar OC"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {currentUser?.rol === 'admin' && (
                          <button
                            onClick={() => setDeleteOrden(orden)}
                            className="p-1.5 bg-white hover:bg-[#213343] text-[#213343] hover:text-white rounded-lg transition border border-gray-300 cursor-pointer"
                            title="Eliminar OC"
                          >
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
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={setItemsPerPage}
        />
      </div>

      <OrdenCompraPdfPreviewModal orden={previewOrden} onClose={() => setPreviewOrden(null)} />
      <OrdenCompraModal
        isOpen={!!editingOrden}
        initialOrden={editingOrden}
        onClose={() => setEditingOrden(null)}
        onSuccess={loadOrdenes}
      />

      {/* Modal Pagar OC en Caja */}
      {payingOrden && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <span>Pagar Orden de Compra en Caja</span>
              </h3>
              <button
                onClick={() => setPayingOrden(null)}
                className="text-gray-400 hover:text-gray-600 transition font-bold"
              >
                ✕
              </button>
            </div>

            {/* Resumen de la OC */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-bold">Orden de Compra:</span>
                <span className="font-mono font-black text-sm text-[#213343]">
                  {payingOrden.numero_oc}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 font-bold">Proveedor:</span>
                <span className="text-xs font-extrabold text-gray-800">
                  {payingOrden.proveedor?.nombre || 'Proveedor'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="text-xs font-bold text-gray-700">Monto a Liquidar:</span>
                <span className="text-lg font-black text-[#213343]">
                  ${Number(payingOrden.monto_total || 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleConfirmPayment();
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Cuenta Bancaria de Salida *
                </label>
                <select
                  value={payCuentaId}
                  onChange={(e) => setPayCuentaId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-[#213343] font-semibold"
                  required
                >
                  {cuentasBancarias.map((cb) => (
                    <option key={cb.id} value={cb.id}>
                      {cb.alias} ({cb.banco})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  El egreso se registrará directamente con cargo a esta cuenta.
                </span>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Subcategoría de Costo *
                </label>
                <select
                  value={paySubcatId}
                  onChange={(e) => setPaySubcatId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-[#213343] font-semibold"
                  required
                >
                  {subcategorias.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">
                  Descripción / Glosa en Caja
                </label>
                <input
                  type="text"
                  value={payDescripcion}
                  onChange={(e) => setPayDescripcion(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-[#213343] font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPayingOrden(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={payingLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {payingLoading ? 'Registrando Egreso...' : 'Confirmar Pago en Caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Eliminar OC */}
      {deleteOrden && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#f97316]" />
                <span>Eliminar Orden de Compra</span>
              </h3>
              <button
                onClick={() => setDeleteOrden(null)}
                className="text-gray-400 hover:text-[#213343] font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-700">
              Esta acción eliminará permanentemente la OC{' '}
              <strong className="font-mono">{deleteOrden.numero_oc}</strong> y sus ítems asociados.
            </p>
            {errorMsg && (
              <div className="bg-orange-50 border border-orange-200 text-orange-950 p-3 rounded-md text-xs font-bold">
                {errorMsg}
              </div>
            )}
            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDeleteOrden(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-md transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-5 py-2 bg-[#213343] hover:bg-black text-white font-extrabold rounded-md transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
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
