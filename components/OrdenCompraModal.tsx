'use client';

/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../lib/context/AuthContext';
import { EstadoOrdenCompra, OrdenCompra, OrdenCompraItem, Proveedor, OportunidadVenta, ProductoCatalogo } from '../lib/types';
import { logSistema } from '../lib/logger';
import { AlertTriangle, Calculator, Check, ChevronDown, FileText, Plus, Save, Trash2 } from 'lucide-react';

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

  if (!isOpen) return null;

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
      setErrorMsg('Debes ingresar un numero de OC.');
      return false;
    }

    const validItems = items.filter((item) => item.descripcion.trim());
    if (validItems.length === 0) {
      setErrorMsg('Debes agregar al menos un item con descripcion.');
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
      throw new Error(versionError.message);
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
      if (duplicateError) throw new Error(duplicateError.message);
      if (duplicateOrden) {
        setErrorMsg(`Ya existe una orden de compra con el numero ${finalNumeroOc}.`);
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

      if (ordenError || !ordenData) throw new Error(ordenError?.message || 'No se pudo guardar la orden.');
      if (!isEditing) {
        insertedOrdenId = ordenData.id;
      }

      if (isEditing && itemsChanged) {
        const { error: deleteItemsError } = await supabase
          .from('orden_compra_items')
          .delete()
          .eq('orden_compra_id', initialOrden!.id);
        if (deleteItemsError) throw new Error(deleteItemsError.message);
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
        throw new Error(itemsError.message);
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
          ? `Nueva version (v${nextVersion}) creada para OC ${initialOrden.numero_oc}`
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
      const message = err instanceof Error ? err.message : 'Revisa los campos.';
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
        setErrorMsg('No se pudo preparar la nueva version de la OC. Intenta nuevamente.');
        return;
      }
      setShowVersionConfirmModal(true);
      return;
    }

    await saveOrdenToBackend(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
      <div className="bg-white border border-gray-200 rounded-lg max-w-4xl w-full p-6 space-y-5 shadow-sm text-[#213343] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <h3 className="text-lg font-extrabold flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#f97316]" />
            <span>{initialOrden ? `Editar OC ${initialOrden.numero_oc}` : 'Emitir Nueva Orden de Compra'}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-[#213343] text-xl font-bold">x</button>
        </div>

        {errorMsg && (
          <div className="bg-orange-50 border border-orange-200 text-orange-950 p-3.5 rounded-lg text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#f97316]" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="lg:col-span-2 relative">
              <label className="block font-bold text-gray-700 mb-1">Proveedor *</label>
              <button
                type="button"
                onClick={() => setSupplierOpen(!supplierOpen)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-left font-bold flex items-center justify-between"
              >
                <span className="truncate">{selectedProveedor ? selectedProveedor.nombre : 'Seleccionar proveedor...'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {supplierOpen && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-sm z-50 p-2 max-h-64 overflow-y-auto space-y-1">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-xs mb-1"
                  />
                  {filteredProveedores.map((prov) => (
                    <button
                      key={prov.id}
                      type="button"
                      onClick={() => {
                        setProveedorId(prov.id);
                        setSupplierOpen(false);
                      }}
                      className="w-full p-2 hover:bg-orange-50 rounded-md cursor-pointer flex items-center justify-between text-left"
                    >
                      <span>
                        <span className="block font-bold">{prov.nombre}</span>
                        <span className="block text-[10px] text-gray-500 font-mono">RUT: {prov.rut}</span>
                      </span>
                      {prov.id === proveedorId && <Check className="w-4 h-4 text-[#f97316]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Numero OC *</label>
              <input value={numeroOc} onChange={(e) => setNumeroOc(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-mono font-bold" />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Fecha</label>
              <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold" />
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoOrdenCompra)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold">
                <option value="borrador">Borrador</option>
                <option value="emitida">Emitida</option>
                <option value="aprobada">Aprobada</option>
                <option value="recibida">Recibida</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>

            <div className="lg:col-span-3">
              <label className="block font-bold text-gray-700 mb-1">Oportunidad asociada</label>
              <select value={oportunidadId} onChange={(e) => setOportunidadId(e.target.value)} className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 font-bold">
                <option value="">-- Sin oportunidad vinculada --</option>
                {oportunidades.map((op) => (
                  <option key={op.id} value={op.id}>{op.codigo} - {op.titulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
              <h4 className="font-black text-[#f97316] uppercase">Envie A</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value="Sociedad Inmobiliaria Hormiglass Spa" disabled className="sm:col-span-2 bg-gray-100 border border-gray-200 rounded-md px-3 py-2 font-bold" />
                <input value="77.615.313-3" disabled className="bg-gray-100 border border-gray-200 rounded-md px-3 py-2 font-bold" />
                <input value={envieAContacto} onChange={(e) => setEnvieAContacto(e.target.value)} placeholder="Contacto" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={envieADireccion} onChange={(e) => setEnvieADireccion(e.target.value)} placeholder="Direccion" className="sm:col-span-2 bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={envieATelefono} onChange={(e) => setEnvieATelefono(e.target.value)} placeholder="Telefono" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={envieAEmail} onChange={(e) => setEnvieAEmail(e.target.value)} placeholder="Email" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
              <h4 className="font-black text-[#f97316] uppercase">Pago</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)} placeholder="Condicion de pago" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={contactoPagoNombre} onChange={(e) => setContactoPagoNombre(e.target.value)} placeholder="Nombre contacto" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={contactoPagoTelefono} onChange={(e) => setContactoPagoTelefono(e.target.value)} placeholder="Telefono" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
                <input value={contactoPagoEmail} onChange={(e) => setContactoPagoEmail(e.target.value)} placeholder="Email" className="bg-white border border-gray-300 rounded-md px-3 py-2" />
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <span className="font-extrabold flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-[#f97316]" />
                <span>Articulos (valores netos en peso chileno)</span>
              </span>
              <button type="button" onClick={handleAddItem} className="bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white px-2.5 py-1 rounded-md text-[11px] font-bold border border-orange-200 transition flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar item</span>
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-2 text-[10px] font-black uppercase tracking-wide text-gray-500">
                <span className="col-span-2">Codigo</span>
                <span className="col-span-4">Descripcion</span>
                <span className="col-span-2 text-right">Cantidad</span>
                <span className="col-span-2 text-right">Precio Unitario CLP</span>
                <span className="col-span-1 text-right">Total CLP</span>
                <span className="col-span-1 text-center">Quitar</span>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center bg-gray-50 p-2.5 rounded-md border border-gray-200">
                  <select aria-label={`Producto de compra ${index + 1}`} value={item.producto_catalogo_id || ''} onChange={(e) => selectCatalogItem(index, e.target.value)} className="col-span-12 bg-white border border-gray-300 rounded-lg px-2 py-1.5"><option value="">Partida libre / seleccionar catálogo</option>{catalogo.map((product) => <option key={product.id} value={product.id}>{product.codigo} · {product.nombre} ({product.unidad})</option>)}</select>
                  <input value={item.articulo_codigo || ''} onChange={(e) => handleItemChange(index, 'articulo_codigo', e.target.value)} placeholder="Codigo" aria-label="Codigo articulo" className="col-span-12 sm:col-span-2 bg-white border border-gray-300 rounded-lg px-2 py-1.5" />
                  <input value={item.descripcion} onChange={(e) => handleItemChange(index, 'descripcion', e.target.value)} placeholder="Descripcion" aria-label="Descripcion articulo" className="col-span-12 sm:col-span-4 bg-white border border-gray-300 rounded-lg px-2 py-1.5 font-bold" />
                  <input type="number" min="0" step="0.01" value={item.cantidad} onChange={(e) => handleItemChange(index, 'cantidad', e.target.value)} aria-label="Cantidad" className="col-span-6 sm:col-span-2 bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-right font-bold" />
                  <div className="col-span-6 sm:col-span-2 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500">CLP</span>
                    <input type="number" min="0" step="1" value={item.precio_unitario} onChange={(e) => handleItemChange(index, 'precio_unitario', e.target.value)} aria-label="Precio unitario en pesos chilenos" className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-2 py-1.5 text-right font-bold" />
                  </div>
                  <div className="col-span-10 sm:col-span-1 font-black text-right">{formatCLP(Number(item.total_item || 0))}</div>
                  <button type="button" onClick={() => handleRemoveItem(index)} className="col-span-1 text-gray-400 hover:text-[#213343] flex justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
            <div>
              <label className="block font-bold text-gray-700 mb-1">Comentarios o instrucciones especiales</label>
              <textarea value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} rows={5} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between"><span>Subtotal</span><strong>{formatCLP(subtotal)}</strong></div>
              <div className="flex justify-between"><span>IVA 19%</span><strong>{formatCLP(montoIva)}</strong></div>
              <label className="flex items-center justify-between gap-3">
                <span>Envio</span>
                <span className="relative w-36">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500">CLP</span>
                  <input type="number" min="0" value={costoEnvio} onChange={(e) => setCostoEnvio(Number(e.target.value) || 0)} aria-label="Envio en pesos chilenos" className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-2 py-1 text-right font-bold" />
                </span>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span>Otro</span>
                <span className="relative w-36">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500">CLP</span>
                  <input type="number" value={otrosCargos} onChange={(e) => setOtrosCargos(Number(e.target.value) || 0)} aria-label="Otros cargos en pesos chilenos" className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-2 py-1 text-right font-bold" />
                </span>
              </label>
              <div className="flex justify-between border-t border-gray-300 pt-3 text-base text-[#f97316] font-black">
                <span>Total</span>
                <span>{formatCLP(montoTotal)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition">Cancelar</button>
            <button type="submit" disabled={loading} className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm flex items-center gap-1.5">
              <Save className="w-4 h-4" />
              <span>{loading ? 'Guardando...' : 'Guardar OC'}</span>
            </button>
          </div>
        </form>
      </div>

      {showVersionConfirmModal && initialOrden && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60] ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#f97316]" />
                <span>Confirmar Guardado de Cambios</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVersionConfirmModal(false)}
                className="text-gray-400 hover:text-[#213343] font-bold"
              >
                x
              </button>
            </div>

            <div className="space-y-3 text-xs text-gray-700">
              <p>
                Se detectaron cambios en la OC <strong className="font-mono text-[#213343]">{initialOrden.numero_oc} (Version v{initialOrden.version || 1})</strong>.
              </p>
              <p className="bg-orange-50 p-3 rounded-md border border-orange-200 text-orange-950 font-medium">
                Puedes guardar como una version nueva incrementada (v{nextVersionPreview || (initialOrden.version || 1) + 1}) o sobreescribir la version actual.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => saveOrdenToBackend(false)}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 font-bold rounded-md border border-gray-300 transition flex items-center justify-center gap-1.5"
              >
                <span>Sobreescribir Version Actual</span>
              </button>

              <button
                type="button"
                onClick={() => saveOrdenToBackend(true)}
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white font-extrabold rounded-md transition shadow-sm flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Crear Nueva Version (v{nextVersionPreview || (initialOrden.version || 1) + 1})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
