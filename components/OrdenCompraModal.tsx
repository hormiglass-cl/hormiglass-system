'use client';

/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../lib/context/AuthContext';
import { EstadoOrdenCompra, OrdenCompra, OrdenCompraItem, Proveedor, OportunidadVenta, ProductoCatalogo } from '../lib/types';
import { logSistema } from '../lib/logger';
import { AlertTriangle, Calculator, Check, ChevronDown, FileText, Plus, Save, Trash2, X } from 'lucide-react';
import { mensajeError } from '../lib/errores';
import { Button, IconButton, CodeStamp } from './ui/crm';

interface OrdenCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrden?: OrdenCompra | null;
  proveedorIdInicial?: string;
  oportunidadIdInicial?: string;
  onSuccess?: () => void;
}

const defaultItem: OrdenCompraItem = {
  articulo_codigo: '',
  descripcion: 'BALDOSA MINVU 0 40X40 COLOR GRIS',
  cantidad: 1,
  precio_unitario: 0,
  total_item: 0,
};

const isUUID = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const today = () => new Date().toISOString().split('T')[0];

const generateOcNumber = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `OC-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

const formatCLP = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export function OrdenCompraModal({
  isOpen,
  onClose,
  initialOrden,
  proveedorIdInicial,
  oportunidadIdInicial,
  onSuccess,
}: OrdenCompraModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const { currentUser } = useAuth();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [catalogo, setCatalogo] = useState<ProductoCatalogo[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [proveedorId, setProveedorId] = useState(proveedorIdInicial || '');
  const [oportunidadId, setOportunidadId] = useState(oportunidadIdInicial || '');
  const [numeroOc, setNumeroOc] = useState(() => generateOcNumber());
  const [fechaEmision, setFechaEmision] = useState(today());
  const [estado, setEstado] = useState<EstadoOrdenCompra>('borrador');
  const [condicionPago, setCondicionPago] = useState('Contado');
  const [contactoPagoNombre, setContactoPagoNombre] = useState('');
  const [contactoPagoTelefono, setContactoPagoTelefono] = useState('');
  const [contactoPagoEmail, setContactoPagoEmail] = useState('');
  const [envieAContacto, setEnvieAContacto] = useState('Isaac Calderon');
  const [envieADireccion, setEnvieADireccion] = useState('Portezuelo 1502, San Bernardo.');
  const [envieATelefono, setEnvieATelefono] = useState('227253725');
  const [envieAEmail, setEnvieAEmail] = useState('hormiglass@gmail.com');
  const [instrucciones, setInstrucciones] = useState('Retiro de fabrica.');
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [otrosCargos, setOtrosCargos] = useState(0);
  const [items, setItems] = useState<OrdenCompraItem[]>([defaultItem]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [showVersionConfirmModal, setShowVersionConfirmModal] = useState(false);
  const [nextVersionPreview, setNextVersionPreview] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      const [provRes, opRes, productRes] = await Promise.all([
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('oportunidades').select('*').order('created_at', { ascending: false }),
        supabase.from('catalogo_productos').select('*').eq('activo', true).order('nombre'),
      ]);

      const loadedProveedores = (provRes.data || []) as Proveedor[];
      setProveedores(loadedProveedores);
      setCatalogo((productRes.data || []) as ProductoCatalogo[]);
      setOportunidades((opRes.data || []) as OportunidadVenta[]);

      if (!initialOrden && !proveedorIdInicial && loadedProveedores.length > 0) {
        setProveedorId(loadedProveedores[0].id);
      }
    }

    loadData();
  }, [isOpen, initialOrden, proveedorIdInicial, supabase]);

  useEffect(() => {
    if (initialOrden) {
      setProveedorId(initialOrden.proveedor_id);
      setOportunidadId(initialOrden.oportunidad_id || '');
      setNumeroOc(initialOrden.numero_oc);
      setFechaEmision(initialOrden.fecha_emision || today());
      setEstado(initialOrden.estado);
      setCondicionPago(initialOrden.condicion_pago || 'Contado');
      setContactoPagoNombre(initialOrden.contacto_pago_nombre || '');
      setContactoPagoTelefono(initialOrden.contacto_pago_telefono || '');
      setContactoPagoEmail(initialOrden.contacto_pago_email || '');
      setEnvieAContacto(initialOrden.envie_a_contacto || 'Isaac Calderon');
      setEnvieADireccion(initialOrden.envie_a_direccion || 'Portezuelo 1502, San Bernardo.');
      setEnvieATelefono(initialOrden.envie_a_telefono || '227253725');
      setEnvieAEmail(initialOrden.envie_a_email || 'hormiglass@gmail.com');
      setInstrucciones(initialOrden.instrucciones_especiales || 'Retiro de fabrica.');
      setCostoEnvio(Number(initialOrden.costo_envio || 0));
      setOtrosCargos(Number(initialOrden.otros_cargos || 0));
      setItems(initialOrden.items && initialOrden.items.length > 0 ? initialOrden.items : [defaultItem]);
    } else if (isOpen) {
      setProveedorId(proveedorIdInicial || '');
      setOportunidadId(oportunidadIdInicial || '');
      setNumeroOc(generateOcNumber());
      setFechaEmision(today());
      setEstado('borrador');
      setCondicionPago('Contado');
      setContactoPagoNombre('');
      setContactoPagoTelefono('');
      setContactoPagoEmail('');
      setEnvieAContacto('Isaac Calderon');
      setEnvieADireccion('Portezuelo 1502, San Bernardo.');
      setEnvieATelefono('227253725');
      setEnvieAEmail('hormiglass@gmail.com');
      setInstrucciones('Retiro de fabrica.');
      setCostoEnvio(0);
      setOtrosCargos(0);
      setItems([defaultItem]);
    }
  }, [initialOrden, isOpen, proveedorIdInicial, oportunidadIdInicial]);

  const selectedProveedor = proveedores.find((p) => p.id === proveedorId);
  const filteredProveedores = proveedores.filter((p) => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return true;
    return [p.nombre, p.rut, p.contacto, p.correo, p.telefono].some((value) => value?.toLowerCase().includes(q));
  });

  const subtotal = useMemo(() => items.reduce((acc, item) => acc + Number(item.total_item || 0), 0), [items]);
  const montoIva = Math.round(subtotal * 0.19);
  const montoTotal = subtotal + montoIva + Number(costoEnvio || 0) + Number(otrosCargos || 0);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleItemChange = (index: number, field: keyof OrdenCompraItem, value: string | number) => {
    const updated = [...items];
    const next = { ...updated[index], [field]: value };
    if (field === 'descripcion' || field === 'articulo_codigo') next.producto_catalogo_id = null;
    if (field === 'cantidad' || field === 'precio_unitario') {
      next.total_item = Number(next.cantidad || 0) * Number(next.precio_unitario || 0);
    }
    updated[index] = next;
    setItems(updated);
  };

  const selectCatalogItem = (index: number, productId: string) => {
    const product = catalogo.find((entry) => entry.id === productId);
    if (!product) return;
    setItems((previous) => previous.map((item, itemIndex) => itemIndex === index
      ? { ...item, producto_catalogo_id: product.id, articulo_codigo: product.codigo,
          descripcion: product.nombre, precio_unitario: Number(product.costo_referencia),
          total_item: Number(item.cantidad) * Number(product.costo_referencia) }
      : item));
  };

  const handleAddItem = () => {
    setItems([...items, { ...defaultItem, descripcion: '', precio_unitario: 0, total_item: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, currentIndex) => currentIndex !== index));
  };

  const validateForm = () => {
    if (!proveedorId) {
      setErrorMsg('Debes seleccionar un proveedor.');
      return false;
    }

    if (!numeroOc.trim()) {
      setErrorMsg('Debes ingresar un número de OC.');
      return false;
    }

    const validItems = items.filter((item) => item.descripcion.trim());
    if (validItems.length === 0) {
      setErrorMsg('Debes agregar al menos un ítem con descripción.');
      return false;
    }
    return true;
  };

  const hasChanges = () => {
    if (!initialOrden) return true;
    if (initialOrden.proveedor_id !== proveedorId) return true;
    if ((initialOrden.oportunidad_id || '') !== (oportunidadId || '')) return true;
    if (initialOrden.numero_oc !== numeroOc.trim()) return true;
    if (initialOrden.fecha_emision !== fechaEmision) return true;
    if (initialOrden.estado !== estado) return true;
    if (initialOrden.condicion_pago !== condicionPago) return true;
    if ((initialOrden.contacto_pago_nombre || '') !== contactoPagoNombre) return true;
    if ((initialOrden.contacto_pago_telefono || '') !== contactoPagoTelefono) return true;
    if ((initialOrden.contacto_pago_email || '') !== contactoPagoEmail) return true;
    if (initialOrden.envie_a_contacto !== envieAContacto) return true;
    if (initialOrden.envie_a_direccion !== envieADireccion) return true;
    if (initialOrden.envie_a_telefono !== envieATelefono) return true;
    if (initialOrden.envie_a_email !== envieAEmail) return true;
    if ((initialOrden.instrucciones_especiales || '') !== instrucciones) return true;
    if (Number(initialOrden.costo_envio || 0) !== Number(costoEnvio || 0)) return true;
    if (Number(initialOrden.otros_cargos || 0) !== Number(otrosCargos || 0)) return true;
    if (Number(initialOrden.monto_total || 0) !== Number(montoTotal || 0)) return true;

    const originalItems = initialOrden.items || [];
    if (originalItems.length !== items.length) return true;
    return items.some((item, index) => {
      const original = originalItems[index];
      return (
        (item.articulo_codigo || '') !== (original?.articulo_codigo || '') ||
        item.descripcion !== original?.descripcion ||
        Number(item.cantidad || 0) !== Number(original?.cantidad || 0) ||
        Number(item.precio_unitario || 0) !== Number(original?.precio_unitario || 0) ||
        Number(item.total_item || 0) !== Number(original?.total_item || 0)
      );
    });
  };

  const getNextAvailableVersion = async () => {
    if (!initialOrden) return 1;
    const baseNumeroOc = (initialOrden?.numero_oc || numeroOc.trim()).replace(/-v\d+$/i, '');
    const { data: existingVersions, error: versionError } = await supabase
      .from('ordenes_compra')
      .select('version, numero_oc')
      .or(`numero_oc.eq.${baseNumeroOc},numero_oc.like.${baseNumeroOc}-v%`);

    if (versionError) {
      throw new Error(mensajeError(versionError));
    }

    const maxExistingVersion = (existingVersions || []).reduce((maxVersion: number, orden: { version?: number; numero_oc?: string }) => {
      const explicitVersion = Number(orden.version || 1);
      const suffixVersion = Number(String(orden.numero_oc || '').match(/-v(\d+)$/i)?.[1] || 1);
      return Math.max(maxVersion, explicitVersion, suffixVersion);
    }, 1);
    return maxExistingVersion + 1;
  };

  const saveOrdenToBackend = async (createNewVersion: boolean) => {
    const validItems = items.filter((item) => item.descripcion.trim());
    setLoading(true);
    setErrorMsg('');

    const baseNumeroOc = (initialOrden?.numero_oc || numeroOc.trim()).replace(/-v\d+$/i, '');

    try {
      const nextVersion = initialOrden && createNewVersion ? await getNextAvailableVersion() : initialOrden?.version || 1;
      const finalNumeroOc = initialOrden && createNewVersion ? `${baseNumeroOc}-v${nextVersion}` : numeroOc.trim();
      const originalItems = initialOrden?.items || [];
      const itemsChanged = originalItems.length !== validItems.length || validItems.some((item, index) => {
        const original = originalItems[index];
        return (item.articulo_codigo || '') !== (original?.articulo_codigo || '') ||
          item.descripcion !== original?.descripcion ||
          Number(item.cantidad) !== Number(original?.cantidad) ||
          Number(item.precio_unitario) !== Number(original?.precio_unitario) ||
          Number(item.total_item) !== Number(original?.total_item);
      });
      let duplicateQuery = supabase
        .from('ordenes_compra')
        .select('id')
        .eq('numero_oc', finalNumeroOc)
        .limit(1);

      if (initialOrden && !createNewVersion) {
        duplicateQuery = duplicateQuery.neq('id', initialOrden.id);
      }

      const { data: duplicateOrden, error: duplicateError } = await duplicateQuery.maybeSingle();
      if (duplicateError) throw new Error(mensajeError(duplicateError));
      if (duplicateOrden) {
        setErrorMsg(`Ya existe una orden de compra con el número ${finalNumeroOc}.`);
        setLoading(false);
        return;
      }

      if (initialOrden && !createNewVersion && itemsChanged) {
        const { count, error: countError } = await supabase.from('orden_compra_asignaciones')
          .select('id', { count: 'exact', head: true }).eq('orden_compra_id', initialOrden.id);
        if (countError) throw countError;
        if (count) throw new Error('Quita las asignaciones antes de modificar los ítems de esta OC.');
      }

      const payload = {
        numero_oc: finalNumeroOc,
        proveedor_id: proveedorId,
        oportunidad_id: isUUID(oportunidadId) ? oportunidadId : null,
        usuario_id: isUUID(currentUser?.id) ? currentUser?.id : null,
        fecha_emision: fechaEmision,
        version: nextVersion,
        estado: initialOrden && createNewVersion ? 'borrador' : estado,
        envie_a_nombre: 'Sociedad Inmobiliaria Hormiglass Spa',
        envie_a_rut: '77.615.313-3',
        envie_a_contacto: envieAContacto,
        envie_a_direccion: envieADireccion,
        envie_a_telefono: envieATelefono,
        envie_a_email: envieAEmail,
        condicion_pago: condicionPago,
        contacto_pago_nombre: contactoPagoNombre || null,
        contacto_pago_telefono: contactoPagoTelefono || null,
        contacto_pago_email: contactoPagoEmail || null,
        instrucciones_especiales: instrucciones,
        subtotal,
        iva_porcentaje: 19,
        monto_iva: montoIva,
        costo_envio: Number(costoEnvio || 0),
        otros_cargos: Number(otrosCargos || 0),
        monto_total: montoTotal,
      };

      const isEditing = Boolean(initialOrden && !createNewVersion);
      let insertedOrdenId: string | null = null;
      const { data: ordenData, error: ordenError } = isEditing
        ? await supabase.from('ordenes_compra').update(payload).eq('id', initialOrden!.id).select().single()
        : await supabase.from('ordenes_compra').insert([payload]).select().single();

      if (ordenError || !ordenData) throw new Error(mensajeError(ordenError, 'No se pudo guardar la orden.'));
      if (!isEditing) {
        insertedOrdenId = ordenData.id;
      }

      if (isEditing && itemsChanged) {
        const { error: deleteItemsError } = await supabase
          .from('orden_compra_items')
          .delete()
          .eq('orden_compra_id', initialOrden!.id);
        if (deleteItemsError) throw new Error(mensajeError(deleteItemsError));
      }

      const itemPayload = validItems.map((item) => ({
        orden_compra_id: ordenData.id,
        articulo_codigo: item.articulo_codigo || null,
        producto_catalogo_id: item.producto_catalogo_id || null,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad || 0),
        precio_unitario: Number(item.precio_unitario || 0),
        total_item: Number(item.total_item || 0),
      }));

      const { data: savedItems, error: itemsError } = isEditing && !itemsChanged
        ? { data: originalItems, error: null }
        : await supabase.from('orden_compra_items').insert(itemPayload).select();
      if (itemsError) {
        if (insertedOrdenId) {
          await supabase.from('ordenes_compra').delete().eq('id', insertedOrdenId);
        }
        throw new Error(mensajeError(itemsError));
      }

      const persistedItems = savedItems as OrdenCompraItem[] | null;
      if (!isEditing && isUUID(oportunidadId) && persistedItems?.length) {
        const { error: assignmentError } = await supabase.from('orden_compra_asignaciones').insert(
          persistedItems.filter((item) => Number(item.cantidad) > 0).map((item) => ({
            orden_compra_id: ordenData.id,
            orden_compra_item_id: item.id,
            oportunidad_id: oportunidadId,
            cantidad: item.cantidad,
            costo_asignado: item.total_item,
          }))
        );
        if (assignmentError) {
          if (insertedOrdenId) await supabase.from('ordenes_compra').delete().eq('id', insertedOrdenId);
          throw assignmentError;
        }
      }

      await logSistema({
        tipo_accion: isEditing ? 'actualizacion' : 'creacion',
        entidad: 'ordenes_compra',
        entidad_id: ordenData.id,
        descripcion: initialOrden && createNewVersion
          ? `Nueva versión (v${nextVersion}) creada para OC ${initialOrden.numero_oc}`
          : `Orden de compra ${payload.numero_oc} ${isEditing ? 'actualizada' : 'creada'} por $${montoTotal.toLocaleString('es-CL')}`,
        usuario_id: currentUser?.id,
        datos_anteriores: initialOrden || undefined,
        datos_nuevos: { ...ordenData, items: itemPayload },
      });

      onSuccess?.();
      setShowVersionConfirmModal(false);
      onClose();
    } catch (err: unknown) {
      console.error('Error saving orden de compra:', err);
      const message = mensajeError(err, 'Revisa los campos.');
      setErrorMsg(message.startsWith('Ya existe una orden de compra') || message.startsWith('Quita las asignaciones')
        ? message
        : 'No se pudo guardar la orden de compra. Revisa los datos e intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg('');

    if (!validateForm()) return;

    if (initialOrden) {
      if (!hasChanges()) {
        onClose();
        return;
      }
      try {
        setNextVersionPreview(await getNextAvailableVersion());
      } catch (err) {
        console.error('Error calculating next OC version:', err);
        setErrorMsg('No se pudo preparar la nueva versión de la OC. Intenta nuevamente.');
        return;
      }
      setShowVersionConfirmModal(true);
      return;
    }

    await saveOrdenToBackend(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-ink/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-line rounded-panel max-w-4xl w-full shadow-[var(--hg-shadow-popover)] text-ink max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <header className="shrink-0 flex items-center justify-between border-b border-line-subtle px-5 py-4 bg-surface">
          <h3 className="t-section flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent-ink shrink-0" />
            <span>{initialOrden ? `Editar OC ${initialOrden.numero_oc}` : 'Emitir Nueva Orden de Compra'}</span>
          </h3>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>

        <form id="form-oc-modal" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="bg-danger-soft border border-danger-line text-danger p-3.5 rounded-lg text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 bg-surface-muted p-4 rounded-lg border border-line">
            <div className="lg:col-span-2 relative">
              <label className="block font-semibold text-ink mb-1">Proveedor *</label>
              <button
                type="button"
                onClick={() => setSupplierOpen(!supplierOpen)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-left font-semibold text-ink flex items-center justify-between hover:border-accent transition cursor-pointer"
              >
                <span className="truncate">{selectedProveedor ? selectedProveedor.nombre : 'Seleccionar proveedor...'}</span>
                <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
              </button>
              {supplierOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-surface border border-line rounded-lg shadow-sm z-50 p-2 max-h-64 overflow-y-auto space-y-1">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="w-full bg-surface-muted border border-line rounded-md px-3 py-2 text-xs mb-1 text-ink focus:outline-none focus:border-accent"
                  />
                  {filteredProveedores.map((prov) => (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => {
                        setProveedorId(prov.id);
                        setSupplierOpen(false);
                      }}
                      className="w-full p-2 hover:bg-surface-muted rounded-md cursor-pointer flex items-center justify-between text-left transition"
                    >
                      <span>
                        <span className="block font-semibold text-ink">{prov.nombre}</span>
                        <span className="block text-[11px] text-ink-muted font-mono">RUT: {prov.rut}</span>
                      </span>
                      {prov.id === proveedorId && <Check className="w-4 h-4 text-accent-ink" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Número OC *</label>
              <input
                value={numeroOc}
                onChange={(e) => setNumeroOc(e.target.value)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 font-mono font-semibold text-ink focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Fecha</label>
              <input
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 font-semibold text-ink focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoOrdenCompra)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 font-semibold text-ink focus:outline-none focus:border-accent"
              >
                <option value="borrador">Borrador</option>
                <option value="emitida">Emitida</option>
                <option value="aprobada">Aprobada</option>
                <option value="recibida">Recibida</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block font-semibold text-ink mb-1">Oportunidad asociada</label>
              <select
                value={oportunidadId}
                onChange={(e) => setOportunidadId(e.target.value)}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 font-semibold text-ink focus:outline-none focus:border-accent"
              >
                <option value="">-- Sin oportunidad vinculada --</option>
                {oportunidades.map((op) => (
                  <option key={op.id} value={op.id}>{op.codigo} - {op.titulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface p-4 rounded-lg border border-line space-y-3">
              <h4 className="font-semibold text-accent-ink text-xs uppercase tracking-wide">Envío</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value="Sociedad Inmobiliaria Hormiglass Spa" disabled className="sm:col-span-2 bg-surface-muted border border-line rounded-md px-3 py-2 text-ink font-semibold" />
                <input value="77.615.313-3" disabled className="bg-surface-muted border border-line rounded-md px-3 py-2 text-ink font-semibold font-mono" />
                <input value={envieAContacto} onChange={(e) => setEnvieAContacto(e.target.value)} placeholder="Contacto" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={envieADireccion} onChange={(e) => setEnvieADireccion(e.target.value)} placeholder="Dirección" className="sm:col-span-2 bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={envieATelefono} onChange={(e) => setEnvieATelefono(e.target.value)} placeholder="Teléfono" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={envieAEmail} onChange={(e) => setEnvieAEmail(e.target.value)} placeholder="Email" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
              </div>
            </div>

            <div className="bg-surface p-4 rounded-lg border border-line space-y-3">
              <h4 className="font-semibold text-accent-ink text-xs uppercase tracking-wide">Condiciones de pago</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)} placeholder="Condición de pago" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={contactoPagoNombre} onChange={(e) => setContactoPagoNombre(e.target.value)} placeholder="Nombre contacto" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={contactoPagoTelefono} onChange={(e) => setContactoPagoTelefono(e.target.value)} placeholder="Teléfono" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
                <input value={contactoPagoEmail} onChange={(e) => setContactoPagoEmail(e.target.value)} placeholder="Email" className="bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent" />
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-surface p-4 rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
              <span className="font-semibold text-ink flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-accent-ink" />
                <span>Artículos (valores netos en peso chileno)</span>
              </span>
              <Button variant="secondary" size="sm" onClick={handleAddItem}>
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar ítem</span>
              </Button>
            </div>

            <div className="space-y-2.5">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                <span className="col-span-2">Código</span>
                <span className="col-span-4">Descripción</span>
                <span className="col-span-2 text-right">Cantidad</span>
                <span className="col-span-2 text-right">Precio Unitario CLP</span>
                <span className="col-span-1 text-right">Total CLP</span>
                <span className="col-span-1 text-center">Quitar</span>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center bg-surface-muted p-3 rounded-lg border border-line">
                  <select
                    aria-label={`Producto de compra ${index + 1}`}
                    value={item.producto_catalogo_id || ''}
                    onChange={(e) => selectCatalogItem(index, e.target.value)}
                    className="col-span-12 bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink font-medium focus:outline-none focus:border-accent"
                  >
                    <option value="">Partida libre / seleccionar catálogo</option>
                    {catalogo.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.requiere_revision ? '⚠️ ' : ''}{product.codigo} · {product.nombre} ({product.unidad}){product.requiere_revision ? ' [Revisar costo]' : ''}
                      </option>
                    ))}
                  </select>
                  {catalogo.find((p) => p.id === item.producto_catalogo_id)?.requiere_revision && (
                    <div className="col-span-12 text-[11px] text-warning bg-warning-soft border border-warning-line rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>Producto con costo referencial / OCR. Confirmar costo con la cotización oficial del proveedor antes de emitir la OC.</span>
                    </div>
                  )}
                  <input
                    value={item.articulo_codigo || ''}
                    onChange={(e) => handleItemChange(index, 'articulo_codigo', e.target.value)}
                    placeholder="Código"
                    aria-label="Código artículo"
                    className="col-span-12 sm:col-span-2 bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink font-mono focus:outline-none focus:border-accent"
                  />
                  <input
                    value={item.descripcion}
                    onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)}
                    placeholder="Descripción"
                    aria-label="Descripción artículo"
                    className="col-span-12 sm:col-span-4 bg-surface border border-line rounded-md px-2.5 py-1.5 font-semibold text-ink focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.cantidad}
                    onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)}
                    aria-label="Cantidad"
                    className="col-span-6 sm:col-span-2 bg-surface border border-line rounded-md px-2.5 py-1.5 text-right font-semibold text-ink t-num focus:outline-none focus:border-accent"
                  />
                  <div className="col-span-6 sm:col-span-2 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-muted">CLP</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.precio_unitario}
                      onChange={(e) => handleItemChange(index, 'precio_unitario', e.target.value)}
                      aria-label="Precio unitario en pesos chilenos"
                      className="w-full bg-surface border border-line rounded-md pl-9 pr-2.5 py-1.5 text-right font-semibold text-ink t-num focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div className="col-span-10 sm:col-span-1 font-bold text-right text-ink t-num">
                    {formatCLP(Number(item.total_item || 0))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    aria-label="Quitar ítem"
                    className="col-span-2 sm:col-span-1 text-ink-muted hover:text-danger flex justify-center transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <div>
              <label className="block font-semibold text-ink mb-1">Comentarios o instrucciones especiales</label>
              <textarea
                value={instrucciones}
                onChange={(e) => setInstrucciones(e.target.value)}
                rows={5}
                className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
              />
            </div>
            <div className="bg-surface-muted border border-line rounded-lg p-4 space-y-2 text-xs">
              <div className="flex justify-between text-ink"><span className="text-ink-muted">Subtotal</span><strong className="t-num font-semibold">{formatCLP(subtotal)}</strong></div>
              <div className="flex justify-between text-ink"><span className="text-ink-muted">IVA 19%</span><strong className="t-num font-semibold">{formatCLP(montoIva)}</strong></div>
              <label className="flex items-center justify-between gap-3 text-ink">
                <span className="text-ink-muted">Envío</span>
                <span className="relative w-36">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-muted">CLP</span>
                  <input
                    type="number"
                    min="0"
                    value={costoEnvio}
                    onChange={(e) => setCostoEnvio(Number(e.target.value) || 0)}
                    aria-label="Envío en pesos chilenos"
                    className="w-full bg-surface border border-line rounded-md pl-9 pr-2 py-1 text-right font-semibold text-ink t-num focus:outline-none focus:border-accent"
                  />
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 text-ink">
                <span className="text-ink-muted">Otro</span>
                <span className="relative w-36">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-muted">CLP</span>
                  <input
                    type="number"
                    value={otrosCargos}
                    onChange={(e) => setOtrosCargos(Number(e.target.value) || 0)}
                    aria-label="Otros cargos en pesos chilenos"
                    className="w-full bg-surface border border-line rounded-md pl-9 pr-2 py-1 text-right font-semibold text-ink t-num focus:outline-none focus:border-accent"
                  />
                </span>
              </label>
              <div className="flex justify-between border-t border-line pt-3 text-sm text-ink font-bold">
                <span>Total</span>
                <span className="t-num text-accent-ink font-bold">{formatCLP(montoTotal)}</span>
              </div>
            </div>
          </div>
        </form>

        <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3.5">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="form-oc-modal" disabled={loading}>
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : 'Guardar OC'}</span>
          </Button>
        </footer>
      </div>

      {showVersionConfirmModal && initialOrden && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-[110]">
          <div className="bg-surface border border-line rounded-panel max-w-md w-full p-6 space-y-4 shadow-[var(--hg-shadow-popover)] text-ink">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <span>Confirmar Guardado de Cambios</span>
              </h3>
              <IconButton icon={X} label="Cerrar" onClick={() => setShowVersionConfirmModal(false)} />
            </div>

            <div className="space-y-3 text-xs text-ink">
              <p>
                Se detectaron cambios en la OC <CodeStamp>{initialOrden.numero_oc} (v{initialOrden.version || 1})</CodeStamp>.
              </p>
              <p className="bg-warning-soft p-3 rounded-md border border-warning-line text-warning font-medium">
                Puedes guardar como una versión nueva incrementada (v{nextVersionPreview || (initialOrden.version || 1) + 1}) o sobreescribir la versión actual.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 text-xs">
              <Button
                variant="secondary"
                onClick={() => saveOrdenToBackend(false)}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                Sobreescribir Versión Actual
              </Button>

              <Button
                variant="primary"
                onClick={() => saveOrdenToBackend(true)}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <Save className="w-4 h-4" />
                <span>Crear Nueva Versión (v{nextVersionPreview || (initialOrden.version || 1) + 1})</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
