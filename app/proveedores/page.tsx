'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { Proveedor, PedidoProveedor } from '../../lib/types';
import {
  Plus,
  Building,
  FileText,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import {
  Button,
  CodeStamp,
  Dialog,
  PageHeader,
  Panel,
  StatusBadge,
} from '../../components/ui/crm';
import { useToast } from '../../components/ui/feedback';

export default function ProveedoresPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

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
            setProveedorId((current) => current || loadedProvs[0].id);
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
  }, [supabase]);

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

      if (error) throw error;

      if (data) {
        setProveedores([...proveedores, data as Proveedor]);
        if (!proveedorId) setProveedorId((data as Proveedor).id);
        toast({ message: `Proveedor ${nombreProv} registrado exitosamente.`, tone: 'success' });
      }
    } catch (err) {
      console.error('Error adding proveedor to Supabase:', err);
      toast({ message: 'No se pudo guardar el proveedor. Revisa los datos.', tone: 'danger' });
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

      if (error) throw error;

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
      toast({ message: 'Orden de compra rápida generada.', tone: 'success' });
    } catch (err) {
      console.error('Error creating purchase order in Supabase:', err);
      toast({ message: 'No se pudo generar la orden de compra.', tone: 'danger' });
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
    <div className="hg-page space-y-6">
      <PageHeader
        title="Proveedores & Abastecimiento"
        description="Gestión de abastecimiento de materias primas (cemento, agregados, herrajes de aluminio) y catálogo de proveedores."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowProvModal(true)}
              icon={Plus}
            >
              Nuevo Proveedor
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowPedidoModal(true)}
            >
              Generar OC Rápida
            </Button>
            <Link href="/ordenes-compra/nuevo">
              <Button variant="primary" icon={FileText}>
                OC Oficial
              </Button>
            </Link>
          </>
        }
      />

      {/* Directorio de Proveedores */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Building className="w-4 h-4 text-accent-ink" />
            <span>Directorio de Proveedores ({proveedores.length})</span>
          </span>
        }
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <p className="t-caption text-ink-muted col-span-2 py-4 text-center">Cargando directorio de proveedores...</p>
          ) : proveedores.length === 0 ? (
            <p className="t-caption text-ink-muted col-span-2 py-4 text-center">No hay proveedores registrados aún.</p>
          ) : (
            proveedores.map((prov) => (
              <div
                key={prov.id}
                className="bg-surface-muted p-4 rounded-lg border border-line flex items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <h3 className="font-semibold text-ink text-sm truncate">{prov.nombre}</h3>
                  <p className="text-xs text-ink-muted font-mono">
                    RUT: <CodeStamp>{prov.rut}</CodeStamp>
                  </p>
                  <div className="text-xs text-ink-muted pt-2 space-y-0.5">
                    <p>Contacto: <span className="font-medium text-ink">{prov.contacto || 'General'}</span></p>
                    <p>Dirección: <span className="text-ink">{[prov.direccion, prov.comuna].filter(Boolean).join(', ') || 'No registrada'}</span></p>
                    <p>Teléfono: <span className="text-ink">{prov.telefono || 'Sin teléfono'}</span></p>
                    <p>Correo: <span className="text-ink">{prov.correo || 'Sin correo'}</span></p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge tone="success">Verificado</StatusBadge>
                  <Link href={`/ordenes-compra/nuevo?proveedor_id=${prov.id}`}>
                    <Button variant="secondary" size="sm">
                      Crear OC
                    </Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>

      {/* Historial de Órdenes de Compra */}
      <Panel
        title={
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-ink" />
            <span>Órdenes de Compra Registradas ({pedidos.length})</span>
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="hg-table w-full min-w-[700px] text-left text-xs">
            <thead>
              <tr>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Proveedor</th>
                <th className="py-3 px-4">Descripción del Pedido</th>
                <th className="py-3 px-4">Estado OC</th>
                <th className="py-3 px-4 text-right">Monto ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {paginatedPedidos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-muted font-medium">
                    No se han registrado órdenes de compra rápidas.
                  </td>
                </tr>
              ) : (
                paginatedPedidos.map((ped) => (
                  <tr key={ped.id} className="hover:bg-surface-muted transition">
                    <td className="py-3 px-4 text-ink-muted font-mono">{ped.fecha}</td>
                    <td className="py-3 px-4 font-semibold text-ink">{ped.proveedor?.nombre || 'Proveedor'}</td>
                    <td className="py-3 px-4 text-ink-muted">{ped.descripcion}</td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        tone={
                          ped.estado === 'recibido'
                            ? 'success'
                            : ped.estado === 'solicitado'
                            ? 'info'
                            : 'neutral'
                        }
                      >
                        {ped.estado}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-ink t-num">
                      ${ped.monto.toLocaleString('es-CL')}
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
      </Panel>

      {/* Modal Nuevo Proveedor */}
      <Dialog
        open={showProvModal}
        onClose={() => setShowProvModal(false)}
        title="Registrar Proveedor"
        description="Agrega un nuevo proveedor al directorio de abastecimiento."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowProvModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-proveedor">
              Guardar Proveedor
            </Button>
          </>
        }
      >
        <form id="form-proveedor" onSubmit={handleAddProveedor} className="space-y-3 text-xs">
          <div>
            <label className="block text-ink font-semibold mb-1">Nombre Empresa *</label>
            <input
              type="text"
              required
              placeholder="Ej. Cementos Polpaico S.A."
              value={nombreProv}
              onChange={(e) => setNombreProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">RUT *</label>
            <input
              type="text"
              required
              placeholder="90.120.000-4"
              value={rutProv}
              onChange={(e) => setRutProv(e.target.value)}
              className="hg-field font-mono"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Contacto Comercial</label>
            <input
              type="text"
              value={contactoProv}
              onChange={(e) => setContactoProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Dirección</label>
            <input
              type="text"
              value={direccionProv}
              onChange={(e) => setDireccionProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Comuna</label>
            <input
              type="text"
              value={comunaProv}
              onChange={(e) => setComunaProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-ink font-semibold mb-1">Teléfono</label>
              <input
                type="text"
                value={telefonoProv}
                onChange={(e) => setTelefonoProv(e.target.value)}
                className="hg-field"
              />
            </div>
            <div>
              <label className="block text-ink font-semibold mb-1">Correo</label>
              <input
                type="email"
                value={correoProv}
                onChange={(e) => setCorreoProv(e.target.value)}
                className="hg-field"
              />
            </div>
          </div>
        </form>
      </Dialog>

      {/* Modal Nueva Orden de Compra Rápida */}
      <Dialog
        open={showPedidoModal}
        onClose={() => setShowPedidoModal(false)}
        title="Generar Orden de Compra Rápida"
        description="Registra un pedido directo a un proveedor existente."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPedidoModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-pedido">
              Generar OC
            </Button>
          </>
        }
      >
        <form id="form-pedido" onSubmit={handleAddPedido} className="space-y-3 text-xs">
          <div>
            <label className="block text-ink font-semibold mb-1">Proveedor *</label>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="hg-field"
            >
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.rut})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Descripción del Pedido *</label>
            <textarea
              rows={2}
              required
              placeholder="Ej. Cemento Portland 50 sacos 25kg"
              value={descripcionPedido}
              onChange={(e) => setDescripcionPedido(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Monto Total OC ($) *</label>
            <input
              type="number"
              required
              value={montoPedido}
              onChange={(e) => setMontoPedido(Number(e.target.value))}
              className="hg-field t-num"
            />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
