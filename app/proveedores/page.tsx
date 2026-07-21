'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import { Proveedor, PedidoProveedor } from '../../lib/types';
import {
  Truck,
  Plus,
  Building,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';

export default function ProveedoresPage() {
  const supabase = createClient();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showProvModal, setShowProvModal] = useState(false);
  const [showPedidoModal, setShowPedidoModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [nombreProv, setNombreProv] = useState('');
  const [rutProv, setRutProv] = useState('');
  const [contactoProv, setContactoProv] = useState('');
  const [telefonoProv, setTelefonoProv] = useState('');
  const [correoProv, setCorreoProv] = useState('');

  const [proveedorId, setProveedorId] = useState('');
  const [descripcionPedido, setDescripcionPedido] = useState('');
  const [montoPedido, setMontoPedido] = useState(150000);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const { data: provsData } = await supabase
          .from('proveedores')
          .select('*')
          .order('nombre');

        const { data: pedsData } = await supabase
          .from('pedidos_proveedor')
          .select('*, proveedor:proveedores(*)')
          .order('created_at', { ascending: false });

        if (!ignore) {
          const loadedProvs = provsData ? (provsData as Proveedor[]) : [];
          const loadedPeds = pedsData ? (pedsData as PedidoProveedor[]) : [];

          setProveedores(loadedProvs);
          setPedidos(loadedPeds);
          if (loadedProvs.length > 0) {
            setProveedorId(loadedProvs[0].id);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading proveedores from Supabase:', err);
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const handleAddProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProv || !rutProv) return;

    const newProvPayload = {
      nombre: nombreProv,
      rut: rutProv,
      contacto: contactoProv,
      telefono: telefonoProv,
      correo: correoProv,
    };

    try {
      const { data, error } = await supabase
        .from('proveedores')
        .insert([newProvPayload])
        .select()
        .single();

      if (data) {
        setProveedores([...proveedores, data as Proveedor]);
        if (!proveedorId) setProveedorId((data as Proveedor).id);
      }
    } catch (err) {
      console.error('Error adding proveedor to Supabase:', err);
    }

    setShowProvModal(false);
    setNombreProv('');
    setRutProv('');
    setContactoProv('');
  };

  const handleAddPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcionPedido || !proveedorId) return;

    const selectedProv = proveedores.find((p) => p.id === proveedorId);

    const newPedPayload = {
      proveedor_id: proveedorId,
      descripcion: descripcionPedido,
      monto: Number(montoPedido) || 0,
      estado: 'solicitado' as const,
      fecha: new Date().toISOString().split('T')[0],
    };

    try {
      const { data, error } = await supabase
        .from('pedidos_proveedor')
        .insert([newPedPayload])
        .select('*, proveedor:proveedores(*)')
        .single();

      if (data) {
        setPedidos([data as PedidoProveedor, ...pedidos]);
      } else {
        const fallbackPed: PedidoProveedor = {
          id: `ped-${Date.now()}`,
          ...newPedPayload,
          proveedor: selectedProv,
        };
        setPedidos([fallbackPed, ...pedidos]);
      }
    } catch (err) {
      console.error('Error creating purchase order in Supabase:', err);
    }

    setShowPedidoModal(false);
    setDescripcionPedido('');
  };

  // Pagination for pedidos
  const totalItems = pedidos.length;
  const paginatedPedidos = pedidos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#F7931F]" />
            <span>Proveedores & Órdenes de Compra (OC)</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Gestión de abastecimiento de materias primas (cemento, agregados, herrajes de aluminio).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProvModal(true)}
            className="bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs px-3.5 py-2.5 rounded-xl border border-gray-700 transition"
          >
            + Nuevo Proveedor
          </button>
          <button
            onClick={() => setShowPedidoModal(true)}
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Generar Orden de Compra</span>
          </button>
        </div>
      </div>

      {/* Directorio de Proveedores */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Building className="w-4 h-4 text-[#F7931F]" />
          <span>Directorio de Proveedores</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proveedores.map((prov) => (
            <div key={prov.id} className="bg-gray-900 p-4 rounded-2xl border border-gray-800 flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-white text-sm">{prov.nombre}</h3>
                <p className="text-xs text-gray-400 font-mono">RUT: {prov.rut}</p>
                <div className="text-xs text-gray-300 pt-2 space-y-0.5">
                  <p>Contacto: <span className="font-semibold text-white">{prov.contacto || 'General'}</span></p>
                  <p>Teléfono: <span className="text-gray-300">{prov.telefono}</span></p>
                  <p>Correo: <span className="text-gray-300">{prov.correo}</span></p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase bg-gray-800 text-emerald-400 px-2 py-0.5 rounded border border-gray-700">
                Verificado
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Historial de Órdenes de Compra */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-visible shadow-xl space-y-3 p-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
          <FileText className="w-4 h-4 text-[#F7931F]" />
          <span>Órdenes de Compra Registradas ({pedidos.length})</span>
        </h2>

        <div className="overflow-visible">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-800/60 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Descripción del Pedido</th>
                <th className="p-3">Estado OC</th>
                <th className="p-3 text-right">Monto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginatedPedidos.map((ped) => (
                <tr key={ped.id} className="hover:bg-gray-800/40 transition">
                  <td className="p-3 text-gray-400 font-mono">{ped.fecha}</td>
                  <td className="p-3 font-semibold text-white">{ped.proveedor?.nombre || 'Proveedor'}</td>
                  <td className="p-3 text-gray-300">{ped.descripcion}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                      {ped.estado}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-white">${ped.monto.toLocaleString('es-CL')}</td>
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

      {/* Modal Nuevo Proveedor */}
      {showProvModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-base font-bold text-white">Registrar Proveedor</h3>
            <form onSubmit={handleAddProveedor} className="space-y-3">
              <div>
                <label className="block text-gray-300 mb-1">Nombre Empresa</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Cementos Polpaico S.A."
                  value={nombreProv}
                  onChange={(e) => setNombreProv(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">RUT *</label>
                <input
                  type="text"
                  required
                  placeholder="90.120.000-4"
                  value={rutProv}
                  onChange={(e) => setRutProv(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Contacto Comercial</label>
                <input
                  type="text"
                  value={contactoProv}
                  onChange={(e) => setContactoProv(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProvModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#F7931F] text-white font-bold rounded-xl">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nueva Orden de Compra */}
      {showPedidoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-base font-bold text-white">Generar Orden de Compra (OC)</h3>
            <form onSubmit={handleAddPedido} className="space-y-3">
              <div>
                <label className="block text-gray-300 mb-1">Proveedor *</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                >
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rut})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Descripción del Pedido *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ej. Cemento Portland 50 sacos 25kg"
                  value={descripcionPedido}
                  onChange={(e) => setDescripcionPedido(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Monto Total OC ($) *</label>
                <input
                  type="number"
                  required
                  value={montoPedido}
                  onChange={(e) => setMontoPedido(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPedidoModal(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#F7931F] text-white font-bold rounded-xl">
                  Generar OC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
