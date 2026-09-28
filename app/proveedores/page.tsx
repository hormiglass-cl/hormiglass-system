'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [direccionProv, setDireccionProv] = useState('');
  const [comunaProv, setComunaProv] = useState('');

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

    const channel = supabase
      .channel('proveedores_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_proveedor' }, () => loadData())
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
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
      direccion: direccionProv,
      comuna: comunaProv,
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
    setTelefonoProv('');
    setCorreoProv('');
    setDireccionProv('');
    setComunaProv('');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e5e7e4] pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#252b2d] flex items-center gap-2">
            <Truck className="w-6 h-6 text-[#f97316]" />
            <span>Proveedores & Órdenes de Compra (OC)</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Gestión de abastecimiento de materias primas (cemento, agregados, herrajes de aluminio).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProvModal(true)}
            className="bg-[#f4f5f3] hover:bg-gray-700 text-gray-700 font-semibold text-xs px-3.5 py-2.5 rounded-md border border-[#e5e7e4] transition"
          >
            + Nuevo Proveedor
          </button>
          <button
            onClick={() => setShowPedidoModal(true)}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Generar Orden de Compra</span>
          </button>
          <Link
            href="/ordenes-compra/nuevo"
            className="bg-white hover:bg-orange-50 text-[#f97316] font-semibold text-xs px-4 py-2.5 rounded-md border border-orange-200 transition flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span>OC Oficial</span>
          </Link>
        </div>
      </div>

      {/* Directorio de Proveedores */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-[#252b2d] flex items-center gap-2">
          <Building className="w-4 h-4 text-[#f97316]" />
          <span>Directorio de Proveedores</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proveedores.map((prov) => (
            <div key={prov.id} className="bg-white p-4 rounded-lg border border-[#e5e7e4] flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-[#252b2d] text-sm">{prov.nombre}</h3>
                <p className="text-xs text-gray-500 font-mono">RUT: {prov.rut}</p>
                <div className="text-xs text-gray-600 pt-2 space-y-0.5">
                  <p>Contacto: <span className="font-semibold text-[#252b2d]">{prov.contacto || 'General'}</span></p>
                  <p>Dirección: <span className="text-gray-600">{[prov.direccion, prov.comuna].filter(Boolean).join(', ') || 'No registrada'}</span></p>
                  <p>Teléfono: <span className="text-gray-600">{prov.telefono}</span></p>
                  <p>Correo: <span className="text-gray-600">{prov.correo}</span></p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[10px] font-bold uppercase bg-[#f4f5f3] text-emerald-700 px-2 py-0.5 rounded border border-[#e5e7e4]">
                  Verificado
                </span>
                <Link
                  href={`/ordenes-compra/nuevo?proveedor_id=${prov.id}`}
                  className="text-[10px] font-black uppercase bg-orange-50 text-[#f97316] px-2 py-1 rounded-lg border border-orange-200 hover:bg-[#f97316] hover:text-white transition"
                >
                  Crear OC
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Historial de Órdenes de Compra */}
      <div className="hg-list-group space-y-3 p-4">
        <h2 className="text-sm font-bold text-[#252b2d] flex items-center gap-2 border-b border-[#e5e7e4] pb-3">
          <FileText className="w-4 h-4 text-[#f97316]" />
          <span>Órdenes de Compra Registradas ({pedidos.length})</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="hg-list-table w-full min-w-[700px] text-left text-xs">
            <thead className="bg-[#f7f7f5] text-gray-500 uppercase text-[10px] tracking-normal border-b border-[#e5e7e4]">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Descripción del Pedido</th>
                <th className="p-3">Estado OC</th>
                <th className="p-3 text-right">Monto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff0ee]">
              {paginatedPedidos.map((ped) => (
                <tr key={ped.id} className="hover:bg-[#f7f7f5] transition">
                  <td className="p-3 text-gray-500 font-mono">{ped.fecha}</td>
                  <td className="p-3 font-semibold text-[#252b2d]">{ped.proveedor?.nombre || 'Proveedor'}</td>
                  <td className="p-3 text-gray-600">{ped.descripcion}</td>
                  <td className="p-3">
                    <span className="text-[10px] font-bold uppercase bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                      {ped.estado}
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-[#252b2d]">${ped.monto.toLocaleString('es-CL')}</td>
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
          <div className="bg-white border border-[#e5e7e4] rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-xs">
            <h3 className="text-base font-bold text-[#252b2d]">Registrar Proveedor</h3>
            <form onSubmit={handleAddProveedor} className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1">Nombre Empresa</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Cementos Polpaico S.A."
                  value={nombreProv}
                  onChange={(e) => setNombreProv(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">RUT *</label>
                <input
                  type="text"
                  required
                  placeholder="90.120.000-4"
                  value={rutProv}
                  onChange={(e) => setRutProv(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Contacto Comercial</label>
                <input
                  type="text"
                  value={contactoProv}
                  onChange={(e) => setContactoProv(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Dirección</label>
                <input
                  type="text"
                  value={direccionProv}
                  onChange={(e) => setDireccionProv(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Comuna</label>
                <input
                  type="text"
                  value={comunaProv}
                  onChange={(e) => setComunaProv(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={telefonoProv}
                    onChange={(e) => setTelefonoProv(e.target.value)}
                    className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Correo</label>
                  <input
                    type="email"
                    value={correoProv}
                    onChange={(e) => setCorreoProv(e.target.value)}
                    className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProvModal(false)}
                  className="px-4 py-2 bg-[#f4f5f3] text-gray-600 rounded-md"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#f97316] text-white font-bold rounded-md">
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
          <div className="bg-white border border-[#e5e7e4] rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-xs">
            <h3 className="text-base font-bold text-[#252b2d]">Generar Orden de Compra (OC)</h3>
            <form onSubmit={handleAddPedido} className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1">Proveedor *</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                >
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.rut})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Descripción del Pedido *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ej. Cemento Portland 50 sacos 25kg"
                  value={descripcionPedido}
                  onChange={(e) => setDescripcionPedido(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">Monto Total OC ($) *</label>
                <input
                  type="number"
                  required
                  value={montoPedido}
                  onChange={(e) => setMontoPedido(Number(e.target.value))}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPedidoModal(false)}
                  className="px-4 py-2 bg-[#f4f5f3] text-gray-600 rounded-md"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-[#f97316] text-white font-bold rounded-md">
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
