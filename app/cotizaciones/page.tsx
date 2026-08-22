'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import { logSistema } from '../../lib/logger';
import { Cotizacion, EstadoCotizacion, OportunidadVenta } from '../../lib/types';
import { PdfPreviewModal } from '../../components/PdfPreviewModal';
import { CotizacionModal } from '../../components/CotizacionModal';
import {
  FileText,
  Plus,
  Search,
  Building,
  Download,
  Eye,
  CheckSquare,
  Square,
  Edit3,
  TrendingUp,
  AlertTriangle,
  Trash2,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewCotizacion, setPreviewCotizacion] = useState<Cotizacion | null>(null);

  // Deletion State
  const [cotToDelete, setCotToDelete] = useState<Cotizacion | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Unified CotizacionModal Edit State
  const [editingCotizacion, setEditingCotizacion] = useState<Cotizacion | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const isUUID = (str?: string | null): boolean => {
    if (!str) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const supabase = createClient();

  useEffect(() => {
    let ignore = false;
    async function getCotizaciones() {
      try {
        const [cotRes, opRes] = await Promise.all([
          supabase
            .from('cotizaciones')
            .select('*, cliente:clientes(*), oportunidad:oportunidades(*), items:cotizacion_items(*)')
            .order('created_at', { ascending: false }),
          supabase.from('oportunidades').select('*'),
        ]);

        if (!ignore) {
          if (cotRes.data) {
            setCotizaciones(cotRes.data as Cotizacion[]);
          } else {
            setCotizaciones([]);
          }

          if (opRes.data) {
            setOportunidades(opRes.data as OportunidadVenta[]);
          } else {
            setOportunidades([]);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching cotizaciones from Supabase:', err);
        if (!ignore) {
          setCotizaciones([]);
          setOportunidades([]);
          setLoading(false);
        }
      }
    }

    getCotizaciones();

    const channel = supabase
      .channel('realtime_cotizaciones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cotizaciones',
        },
        () => {
          getCotizaciones();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = cotizaciones.filter(
    (c) =>
      c.numero_cotizacion.toLowerCase().includes(search.toLowerCase()) ||
      (c.referencia_cliente && c.referencia_cliente.toLowerCase().includes(search.toLowerCase())) ||
      (c.cliente && c.cliente.nombre.toLowerCase().includes(search.toLowerCase())) ||
      (c.cliente && c.cliente.rut.toLowerCase().includes(search.toLowerCase()))
  );

  // Calculate pagination
  const totalItems = filtered.length;
  const paginatedCotizaciones = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) return;
    const firstSelected = cotizaciones.find((c) => selectedIds.includes(c.id));
    if (firstSelected) setPreviewCotizacion(firstSelected);
  };

  const { currentUser } = useAuth();

  // Change quote status directly
  const handleChangeStatus = async (cotId: string, newStatus: EstadoCotizacion) => {
    const targetCot = cotizaciones.find((c) => c.id === cotId);
    setCotizaciones((prev) =>
      prev.map((c) => (c.id === cotId ? { ...c, estado: newStatus } : c))
    );
    try {
      await supabase.from('cotizaciones').update({ estado: newStatus }).eq('id', cotId);
      await logSistema({
        tipo_accion: 'estado_cambiado',
        entidad: 'cotizaciones',
        entidad_id: cotId,
        descripcion: `Estado de la cotización ${targetCot?.numero_cotizacion || cotId} cambiado a ${newStatus.toUpperCase()}`,
        usuario_id: currentUser?.id,
        datos_anteriores: targetCot,
        datos_nuevos: { estado: newStatus },
      });
    } catch (err) {
      console.error('Error updating status in Supabase:', err);
    }
  };

  // Delete quote permanently from Supabase
  const handleDeleteCotizacion = async () => {
    if (!cotToDelete) return;
    try {
      await supabase.from('cotizaciones').delete().eq('id', cotToDelete.id);
      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'cotizaciones',
        entidad_id: cotToDelete.id,
        descripcion: `Cotización ${cotToDelete.numero_cotizacion} eliminada del sistema`,
        usuario_id: currentUser?.id,
        datos_anteriores: cotToDelete,
      });
    } catch (err) {
      console.error('Error deleting quote from Supabase:', err);
    }

    setCotizaciones((prev) => prev.filter((c) => c.id !== cotToDelete.id));
    setSuccessMsg(`Cotización ${cotToDelete.numero_cotizacion} eliminada de Supabase.`);
    setCotToDelete(null);
    setTimeout(() => setSuccessMsg(''), 4000);
  };



  return (
    <div className="space-y-6 text-[#363636]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#F7931F]" />
            <span>Cotizaciones Emitidas</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Gestión comercial de cotizaciones almacenadas en Supabase. Puedes cambiar estados, asociar a oportunidades y eliminarlas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={handleDownloadSelected}
              className="bg-[#363636] hover:bg-black text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-[#F7931F]" />
              <span>Ver PDF Selección ({selectedIds.length})</span>
            </button>
          )}

          <Link
            href="/cotizaciones/nuevo"
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Nueva Cotización</span>
          </Link>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-4 rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Barra Búsqueda y Selección */}
      <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por N° cotización, cliente o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-[#363636] placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
          />
        </div>

        <div className="text-xs text-gray-600 font-semibold">
          Mostrando {filtered.length} cotizaciones {selectedIds.length > 0 && `(${selectedIds.length} seleccionadas)`}
        </div>
      </div>

      {/* Tabla de Cotizaciones */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-visible shadow-sm">
        <div className="overflow-visible">
          <table className="w-full text-left text-xs min-w-[950px]">
            <thead className="bg-[#363636] text-white uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-4 w-10 text-center">
                  <button onClick={toggleSelectAll} className="text-white hover:text-[#F7931F]">
                    {selectedIds.length === filtered.length && filtered.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-[#F7931F]" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">N° Cotización</th>
                <th className="py-3.5 px-4">Versión</th>
                <th className="py-3.5 px-4">Cliente & RUT</th>
                <th className="py-3.5 px-4">Oportunidad de Venta</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4 text-right">Monto Total</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    Cargando cotizaciones desde Supabase...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    No se encontraron cotizaciones registradas en Supabase.
                  </td>
                </tr>
              ) : (
                paginatedCotizaciones.map((cot) => {
                  const isSelected = selectedIds.includes(cot.id);
                  const linkedOp = (cot.oportunidad_id && isUUID(cot.oportunidad_id))
                    ? oportunidades.find((o) => o.id === cot.oportunidad_id)
                    : (cot.oportunidad?.id ? cot.oportunidad : null);

                  return (
                    <tr
                      key={cot.id}
                      className={`hover:bg-orange-50/50 transition ${
                        isSelected ? 'bg-orange-50/80 font-medium' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => toggleSelectOne(cot.id)}
                          className="text-[#363636] hover:text-[#F7931F]"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#F7931F]" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#363636] font-mono">{cot.numero_cotizacion}</td>
                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-extrabold uppercase bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                          v{cot.version || 1}
                        </span>
                      </td>

                      {/* Cliente & RUT */}
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/clientes/${cot.cliente_id}`}
                          className="group flex flex-col hover:text-[#F7931F] transition"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-[#363636] group-hover:text-[#F7931F] group-hover:underline">
                            <Building className="w-3.5 h-3.5 text-[#F7931F]" />
                            <span>{cot.cliente?.nombre || 'Cliente Registrado'}</span>
                          </div>
                          <span className="text-[11px] text-gray-500 font-mono pl-5">
                            RUT: {cot.cliente?.rut || 'Sin RUT'}
                          </span>
                        </Link>
                      </td>

                      {/* Oportunidad Vinculada */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        {linkedOp ? (
                          <Link
                            href={`/ventas?oportunidad=${linkedOp.id}`}
                            className="flex flex-col text-xs text-[#363636] hover:text-[#F7931F] transition font-bold group"
                          >
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5 text-[#F7931F] shrink-0" />
                              <span className="font-extrabold font-mono text-[#F7931F] group-hover:underline">{linkedOp.codigo}</span>
                              <span className="text-[10px] bg-orange-100 text-[#F7931F] font-bold px-1.5 py-0.5 rounded uppercase">
                                {linkedOp.estado_pipeline}
                              </span>
                            </div>
                            <span className="text-[11px] font-semibold text-gray-700 truncate" title={linkedOp.titulo}>
                              {linkedOp.titulo}
                            </span>
                          </Link>
                        ) : (
                          <div className="space-y-1">
                            <select
                              defaultValue=""
                              onChange={async (e) => {
                                const targetOpId = e.target.value;
                                if (!targetOpId) return;
                                setCotizaciones((prev) =>
                                  prev.map((c) => (c.id === cot.id ? { ...c, oportunidad_id: targetOpId } : c))
                                );
                                try {
                                  await supabase.from('cotizaciones').update({ oportunidad_id: targetOpId }).eq('id', cot.id);
                                } catch (err) {
                                  console.error('Error linking op:', err);
                                }
                              }}
                              className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-[11px] text-gray-700 font-medium focus:outline-none focus:border-[#F7931F] w-full"
                            >
                              <option value="">-- Asignar Oportunidad --</option>
                              {oportunidades.map((op) => (
                                <option key={op.id} value={op.id}>
                                  {op.codigo} - {op.titulo}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Selector de Estado */}
                      <td className="py-3.5 px-4">
                        <select
                          value={cot.estado}
                          onChange={(e) => handleChangeStatus(cot.id, e.target.value as EstadoCotizacion)}
                          className={`text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-xl border cursor-pointer focus:outline-none ${
                            cot.estado === 'aprobada'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : cot.estado === 'enviada'
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : cot.estado === 'declinada' || cot.estado === 'rechazada'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-amber-100 text-amber-800 border-amber-300'
                          }`}
                        >
                          <option value="borrador">Borrador</option>
                          <option value="enviada">Enviada</option>
                          <option value="aprobada">Aprobada</option>
                          <option value="declinada">Declinada</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4 text-right font-black text-[#363636] text-sm">
                        ${(cot.monto_total || 0).toLocaleString('es-CL')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setPreviewCotizacion(cot)}
                            className="p-1.5 bg-orange-50 hover:bg-[#F7931F] text-[#F7931F] hover:text-white rounded-lg transition border border-orange-200"
                            title="Previsualizar PDF"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setEditingCotizacion(cot);
                              setShowEditModal(true);
                            }}
                            className="p-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg transition border border-blue-200"
                            title="Editar Cotización"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setCotToDelete(cot)}
                            className="p-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-lg transition border border-red-200"
                            title="Eliminar Cotización de Supabase"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {/* Modal Confirmación Eliminación de Cotización */}
      {cotToDelete && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <span>Eliminar Cotización de Supabase</span>
              </h3>
              <button onClick={() => setCotToDelete(null)} className="text-gray-400 hover:text-[#363636] font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-700">
              <p>
                ¿Estás seguro de que deseas eliminar la cotización <strong className="font-mono text-[#363636]">{cotToDelete.numero_cotizacion}</strong> por un monto de <strong className="text-emerald-700">${(cotToDelete.monto_total || 0).toLocaleString('es-CL')}</strong>?
              </p>
              <p className="bg-red-50 p-3 rounded-xl border border-red-200 text-red-900 font-medium">
                Esta acción la eliminará de Supabase permanentemente.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCotToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCotizacion}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl transition shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Cotización</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Unificado de Cotizaciones (Creación y Edición con Versiones Inteligentes) */}
      <CotizacionModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCotizacion(null);
        }}
        initialCotizacion={editingCotizacion}
        onSuccess={async () => {
          const { data } = await supabase
            .from('cotizaciones')
            .select('*, cliente:clientes(*), oportunidad:oportunidades(*), items:cotizacion_items(*)')
            .order('created_at', { ascending: false });
          if (data) setCotizaciones(data as Cotizacion[]);
        }}
      />

      {/* Modal Reusable Previsualización PDF */}
      <PdfPreviewModal
        cotizacion={previewCotizacion}
        onClose={() => setPreviewCotizacion(null)}
      />
    </div>
  );
}
