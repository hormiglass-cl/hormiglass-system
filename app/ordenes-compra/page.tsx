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
  Building,
  CreditCard,
  Edit3,
  Eye,
  Plus,
  Trash2,
} from 'lucide-react';
import { mensajeError } from '../../lib/errores';
import {
  Button,
  IconButton,
  PageHeader,
  Panel,
  FilterBar,
  SearchField,
  StatusBadge,
  CodeStamp,
  Dialog,
} from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';

export default function OrdenesCompraPage() {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();

  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [previewOrden, setPreviewOrden] = useState<OrdenCompra | null>(null);
  const [editingOrden, setEditingOrden] = useState<OrdenCompra | null>(null);
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return ordenes;
    return ordenes.filter(
      (orden) =>
        orden.numero_oc.toLowerCase().includes(q) ||
        orden.estado.toLowerCase().includes(q) ||
        (orden.proveedor?.nombre || '').toLowerCase().includes(q) ||
        (orden.proveedor?.rut || '').toLowerCase().includes(q)
    );
  }, [ordenes, search]);

  const totalItems = filtered.length;
  const paginatedOrdenes = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleChangeStatus = async (orden: OrdenCompra, estado: EstadoOrdenCompra) => {
    setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? { ...item, estado } : item)));
    const { error } = await supabase.from('ordenes_compra').update({ estado }).eq('id', orden.id);
    if (error) {
      console.error('Error updating OC status:', error);
      toast({ message: mensajeError(error, 'No se pudo actualizar el estado de la OC.'), tone: 'danger' });
      setOrdenes((prev) => prev.map((item) => (item.id === orden.id ? orden : item)));
    } else {
      toast({ message: `Estado actualizado a ${estado}.`, tone: 'success' });
    }
  };

  const handleDeleteClick = async (orden: OrdenCompra) => {
    const ok = await confirm({
      title: 'Eliminar Orden de Compra',
      message: `Esta acción eliminará permanentemente la OC ${orden.numero_oc} y sus ítems asociados. ¿Deseas continuar?`,
      confirmLabel: 'Eliminar OC',
      destructive: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('ordenes_compra').delete().eq('id', orden.id);
    if (error) {
      console.error('Error deleting OC:', error);
      toast({ message: mensajeError(error, 'No se pudo eliminar la OC.'), tone: 'danger' });
      return;
    }
    setOrdenes((prev) => prev.filter((item) => item.id !== orden.id));
    toast({ message: `Orden de compra ${orden.numero_oc} eliminada.`, tone: 'success' });
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
          (subData as CajaSubcategoria[]).find((s) => s.nombre.toLowerCase().includes('materiales')) || subData[0];
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

      const { error } = await supabase.rpc('pagar_orden_compra_en_caja', {
        p_orden_compra_id: payingOrden.id,
        p_cuenta_bancaria_id: payCuentaId,
        p_subcategoria_id: paySubcatId || null,
        p_descripcion: payDescripcion.trim() || null,
      });

      if (error) throw error;

      toast({
        message: `Orden de compra ${payingOrden.numero_oc} pagada exitosamente. Se generó el egreso en Caja.`,
        tone: 'success',
      });
      setPayingOrden(null);
      await loadOrdenes();
    } catch (err: unknown) {
      console.error('Error pagando orden de compra:', err);
      toast({
        message: mensajeError(err, 'No se pudo registrar el pago de la orden de compra en Caja.'),
        tone: 'danger',
      });
    } finally {
      setPayingLoading(false);
    }
  };


  return (
    <div className="hg-page space-y-5">
      <PageHeader
        title="Órdenes de Compra"
        description="Gestión de abastecimiento, distribución entre ventas y liquidación de pagos en Caja."
        actions={
          <Link href="/ordenes-compra/nuevo">
            <Button variant="primary" icon={Plus}>
              Nueva OC
            </Button>
          </Link>
        }
      />

      <FilterBar>
        <SearchField
          placeholder="Buscar por OC #, proveedor o RUT..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </FilterBar>

      <Panel>
        <div className="overflow-x-auto">
          <table className="hg-table w-full text-left text-xs min-w-[980px]">
            <thead>
              <tr>
                <th className="py-3 px-4">OC #</th>
                <th className="py-3 px-4">Versión</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Proveedor & RUT</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted font-medium">
                    Cargando órdenes de compra...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron órdenes de compra.
                  </td>
                </tr>
              ) : (
                paginatedOrdenes.map((orden) => (
                  <tr key={orden.id} className="hover:bg-surface-muted transition">
                    <td className="py-3 px-4">
                      <CodeStamp>{orden.numero_oc}</CodeStamp>
                    </td>
                    <td className="py-3 px-4 text-ink-muted font-mono">v{orden.version || 1}</td>
                    <td className="py-3 px-4 text-ink-muted font-mono">
                      {new Date(`${orden.fecha_emision}T00:00:00`).toLocaleDateString('es-CL')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-semibold text-ink">
                          <Building className="w-3.5 h-3.5 text-accent-ink shrink-0" />
                          <span>{orden.proveedor?.nombre || 'Proveedor'}</span>
                        </div>
                        <span className="text-[11px] text-ink-muted font-mono pl-5">
                          RUT: {orden.proveedor?.rut || 'Sin RUT'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {orden.estado === 'pagada' ? (
                        <StatusBadge tone="success">Pagada en Caja</StatusBadge>
                      ) : (
                        <select
                          value={orden.estado}
                          aria-label={`Estado de OC ${orden.numero_oc}`}
                          onChange={(e) => handleChangeStatus(orden, e.target.value as EstadoOrdenCompra)}
                          className="text-[11px] font-semibold uppercase px-2 py-1 rounded-md border border-line bg-surface text-ink cursor-pointer focus:outline-none focus:border-accent"
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
                    <td className="py-3 px-4 text-right font-medium text-ink-muted t-num">
                      ${Number(orden.subtotal || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-sm text-ink t-num">
                      ${Number(orden.monto_total || 0).toLocaleString('es-CL')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {orden.estado !== 'pagada' && orden.estado !== 'cancelada' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenPayModal(orden)}
                            title="Pagar Orden de Compra en Caja"
                            className="text-success border-success-line hover:bg-success-soft"
                          >
                            <CreditCard size={14} className="shrink-0" />
                            <span>Pagar</span>
                          </Button>
                        )}

                        <Link
                          href={`/ordenes-compra/${orden.id}/asignaciones`}
                          className="text-xs font-semibold text-accent-ink hover:underline px-1.5 py-1"
                          title="Distribuir OC entre ventas"
                        >
                          Asignar
                        </Link>

                        <IconButton
                          icon={Eye}
                          label="Previsualizar PDF"
                          onClick={() => setPreviewOrden(orden)}
                        />
                        <IconButton
                          icon={Edit3}
                          label="Editar OC"
                          onClick={() => setEditingOrden(orden)}
                        />
                        {currentUser?.rol === 'admin' && (
                          <IconButton
                            icon={Trash2}
                            label="Eliminar OC"
                            onClick={() => handleDeleteClick(orden)}
                            className="hover:text-danger"
                          />
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
      </Panel>

      <OrdenCompraPdfPreviewModal orden={previewOrden} onClose={() => setPreviewOrden(null)} />
      <OrdenCompraModal
        isOpen={!!editingOrden}
        initialOrden={editingOrden}
        onClose={() => setEditingOrden(null)}
        onSuccess={loadOrdenes}
      />

      {/* Modal Pagar OC en Caja */}
      <Dialog
        open={Boolean(payingOrden)}
        onClose={() => setPayingOrden(null)}
        title="Pagar Orden de Compra en Caja"
        description="Registra la liquidación de la orden con cargo directo a la cuenta seleccionada."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayingOrden(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={payingLoading}
              onClick={handleConfirmPayment}
            >
              {payingLoading ? 'Registrando Egreso...' : 'Confirmar Pago en Caja'}
            </Button>
          </>
        }
      >
        {payingOrden && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleConfirmPayment();
            }}
            className="space-y-4 text-xs"
          >
            {/* Resumen de la OC */}
            <div className="bg-surface-muted border border-line rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted font-medium">Orden de Compra:</span>
                <CodeStamp>{payingOrden.numero_oc}</CodeStamp>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted font-medium">Proveedor:</span>
                <span className="text-xs font-semibold text-ink">
                  {payingOrden.proveedor?.nombre || 'Proveedor'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line-subtle pt-2">
                <span className="text-xs font-semibold text-ink">Monto a Liquidar:</span>
                <span className="text-base font-bold text-ink t-num">
                  ${Number(payingOrden.monto_total || 0).toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">
                Cuenta Bancaria de Salida *
              </label>
              <select
                value={payCuentaId}
                onChange={(e) => setPayCuentaId(e.target.value)}
                className="hg-field"
                required
              >
                {cuentasBancarias.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.alias} ({cb.banco})
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-ink-muted mt-1 block">
                El egreso se registrará directamente con cargo a esta cuenta.
              </span>
            </div>

            <div>
              <label className="font-semibold text-ink block mb-1">
                Subcategoría de Costo *
              </label>
              <select
                value={paySubcatId}
                onChange={(e) => setPaySubcatId(e.target.value)}
                className="hg-field"
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
              <label className="font-semibold text-ink block mb-1">
                Descripción / Glosa en Caja
              </label>
              <input
                type="text"
                value={payDescripcion}
                onChange={(e) => setPayDescripcion(e.target.value)}
                className="hg-field"
              />
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
