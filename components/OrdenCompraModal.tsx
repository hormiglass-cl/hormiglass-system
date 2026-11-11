'use client';

/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '../lib/supabase/client';
import { useAuth } from '../lib/context/AuthContext';
import { EstadoOrdenCompra, OrdenCompra, OrdenCompraItem, Proveedor, OportunidadVenta, ProductoCatalogo } from '../lib/types';
import { logSistema } from '../lib/logger';
import { AlertTriangle, Plus, Save, Trash2, TrendingUp, X } from 'lucide-react';
import { mensajeError } from '../lib/errores';
import { esOportunidadPerdida } from '../lib/oportunidad-perdida';
import { etiquetaProducto } from '../lib/productos';
import { Button, IconButton, CodeStamp } from './ui/crm';
import { DateInput } from './ui/FormControls';
import { SearchSelect } from './ui/SearchSelect';

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
  descripcion: '',
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

const formatCLP = (value: number) => `$${Number(value || 0).toLocaleString('es-CL')}`;

const ESTADO_OPTIONS = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'emitida', label: 'Emitida' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'recibida', label: 'Recibida' },
  { value: 'cancelada', label: 'Cancelada' },
];

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

      setProveedores((provRes.data || []) as Proveedor[]);
      setCatalogo((productRes.data || []) as ProductoCatalogo[]);
      setOportunidades((opRes.data || []) as OportunidadVenta[]);
    }

    loadData();
  }, [isOpen, supabase]);

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
          descripcion: etiquetaProducto(product), precio_unitario: Number(product.costo_referencia),
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
      <div className="bg-surface border border-line rounded-panel max-w-3xl w-full shadow-[var(--hg-shadow-popover)] text-ink max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Header Fijo */}
        <header className="shrink-0 flex items-center justify-between border-b border-line-subtle px-5 py-3.5 bg-surface">
          <h3 className="t-section flex items-center gap-2">
            {initialOrden ? (
              <>Editar orden de compra <CodeStamp>{initialOrden.numero_oc}</CodeStamp></>
            ) : (
              'Nueva orden de compra'
            )}
          </h3>
          <IconButton icon={X} label="Cerrar" onClick={onClose} />
        </header>

        {/* Cuerpo Scrollable */}
        <form id="form-oc-modal" onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          {errorMsg && (
            <div className="bg-danger-soft border border-danger-line text-danger p-3 rounded-md text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Datos generales */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Proveedor *</label>
              <SearchSelect
                value={proveedorId}
                onChange={setProveedorId}
                options={proveedores.map((p) => ({ value: p.id, label: p.nombre, hint: p.rut }))}
                placeholder="Seleccionar proveedor"
                searchPlaceholder="Buscar por nombre o RUT..."
                searchable
                ariaLabel="Proveedor"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Oportunidad de venta</label>
              <SearchSelect
                value={oportunidadId}
                onChange={setOportunidadId}
                options={oportunidades
                  // Lost opportunities are not offered, except the one already linked so editing keeps working.
                  .filter((op) => !esOportunidadPerdida(op) || op.id === oportunidadId)
                  .map((op) => ({ value: op.id, label: op.codigo, hint: op.titulo }))}
                clearLabel="Sin oportunidad"
                placeholder="Sin oportunidad"
                searchPlaceholder="Buscar oportunidad..."
                searchable
                ariaLabel="Oportunidad de venta"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">N° de orden *</label>
              <input
                type="text"
                value={numeroOc}
                onChange={(e) => setNumeroOc(e.target.value)}
                className="hg-field-compact w-full t-num"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Fecha de emisión</label>
              <DateInput
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
                className="hg-field-compact w-full"
              />
            </div>
            {initialOrden && estado !== 'pagada' && (
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Estado</label>
                <SearchSelect
                  value={estado}
                  onChange={(v) => v && setEstado(v as EstadoOrdenCompra)}
                  options={ESTADO_OPTIONS}
                  ariaLabel="Estado de la orden"
                />
              </div>
            )}
          </section>

          {/* Productos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
              <span className="font-semibold text-ink">Productos <span className="font-normal text-ink-muted">(CLP, neto)</span></span>
              <Button variant="secondary" size="sm" onClick={handleAddItem}>
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar producto</span>
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, idx) => {
                const selectedCatalogoProd = catalogo.find((p) => p.id === item.producto_catalogo_id);
                return (
                  <div key={idx} className="space-y-2 border-b border-line-subtle pb-4 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 t-caption font-semibold text-ink-muted t-num">{idx + 1}.</span>
                      {catalogo.length > 0 && (
                        <div className="min-w-0 flex-1">
                          <SearchSelect
                            value={item.producto_catalogo_id || ''}
                            onChange={(v) => v && selectCatalogItem(idx, v)}
                            options={catalogo.map((pr) => ({
                              value: pr.id,
                              label: `${pr.codigo ? `[${pr.codigo}] ` : ''}${etiquetaProducto(pr)}`,
                              hint: `$${(pr.costo_referencia || 0).toLocaleString('es-CL')} · ${pr.unidad}`,
                            }))}
                            placeholder="Elegir del catálogo (opcional)"
                            searchPlaceholder="Buscar producto o código..."
                            searchable
                            menuMinWidth={380}
                            ariaLabel={`Producto del catálogo ${idx + 1}`}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        disabled={items.length === 1}
                        className="shrink-0 rounded-md p-1.5 text-danger transition hover:bg-danger-soft disabled:opacity-30"
                        title="Eliminar producto"
                        aria-label="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {selectedCatalogoProd?.requiere_revision && (
                      <div className="flex items-center gap-1.5 rounded-md border border-warning-line bg-warning-soft px-2.5 py-1.5 text-[11px] font-semibold text-warning">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Costo referencial: confirma el valor con la cotización oficial del proveedor antes de emitir la OC.</span>
                      </div>
                    )}

                    <textarea
                      rows={2}
                      value={item.descripcion}
                      onChange={(e) => handleItemChange(idx, 'descripcion', e.target.value)}
                      placeholder="Descripción del producto o partida"
                      aria-label={`Descripción del producto ${idx + 1}`}
                      className="hg-field-compact w-full resize-y"
                    />

                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block t-caption text-ink-muted">Código</label>
                        <input
                          type="text"
                          value={item.articulo_codigo || ''}
                          onChange={(e) => handleItemChange(idx, 'articulo_codigo', e.target.value)}
                          placeholder="Opcional"
                          className="hg-field-compact w-full"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block t-caption text-ink-muted">Cantidad</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.cantidad}
                          onChange={(e) => handleItemChange(idx, 'cantidad', e.target.value)}
                          className="hg-field-compact w-full text-right t-num"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block t-caption text-ink-muted">Precio unitario</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.precio_unitario}
                          onChange={(e) => handleItemChange(idx, 'precio_unitario', e.target.value)}
                          className="hg-field-compact w-full text-right t-num"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block t-caption text-ink-muted">Subtotal</label>
                        <div className="flex min-h-8 items-center justify-end rounded-md bg-surface-muted px-2.5 t-num font-semibold text-ink">
                          {formatCLP(Number(item.total_item || 0))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totales */}
            <dl className="ml-auto w-full space-y-1 rounded-lg bg-surface-muted p-3 sm:w-72">
              <div className="flex justify-between text-ink-muted">
                <dt>Neto</dt>
                <dd className="t-num text-ink">{formatCLP(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>IVA 19%</dt>
                <dd className="t-num text-ink">{formatCLP(montoIva)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-ink-muted">
                <dt><label htmlFor="oc-costo-envio">Envío</label></dt>
                <dd>
                  <input
                    id="oc-costo-envio"
                    type="number"
                    min="0"
                    value={costoEnvio}
                    onChange={(e) => setCostoEnvio(Number(e.target.value) || 0)}
                    className="hg-field-compact w-28 text-right t-num"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-ink-muted">
                <dt><label htmlFor="oc-otros-cargos">Otros cargos</label></dt>
                <dd>
                  <input
                    id="oc-otros-cargos"
                    type="number"
                    value={otrosCargos}
                    onChange={(e) => setOtrosCargos(Number(e.target.value) || 0)}
                    className="hg-field-compact w-28 text-right t-num"
                  />
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 text-sm font-semibold text-ink">
                <dt>Total</dt>
                <dd className="t-num">{formatCLP(montoTotal)}</dd>
              </div>
            </dl>
          </section>

          {/* Condiciones de pago */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Condición de pago</label>
              <input
                type="text"
                value={condicionPago}
                onChange={(e) => setCondicionPago(e.target.value)}
                placeholder="Contado / 30 días"
                className="hg-field-compact w-full"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Contacto de pago</label>
              <input
                type="text"
                value={contactoPagoNombre}
                onChange={(e) => setContactoPagoNombre(e.target.value)}
                placeholder="Nombre"
                className="hg-field-compact w-full"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Teléfono de pago</label>
              <input
                type="text"
                value={contactoPagoTelefono}
                onChange={(e) => setContactoPagoTelefono(e.target.value)}
                className="hg-field-compact w-full"
              />
            </div>
            <div>
              <label className="mb-1 block t-caption font-semibold text-ink">Email de pago</label>
              <input
                type="email"
                value={contactoPagoEmail}
                onChange={(e) => setContactoPagoEmail(e.target.value)}
                className="hg-field-compact w-full"
              />
            </div>
          </section>

          {/* Despacho */}
          <section className="space-y-3">
            <div className="border-b border-line-subtle pb-2">
              <span className="font-semibold text-ink">Despacho <span className="font-normal text-ink-muted">(Sociedad Inmobiliaria Hormiglass Spa · 77.615.313-3)</span></span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Contacto de recepción</label>
                <input
                  type="text"
                  value={envieAContacto}
                  onChange={(e) => setEnvieAContacto(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Teléfono</label>
                <input
                  type="text"
                  value={envieATelefono}
                  onChange={(e) => setEnvieATelefono(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Dirección</label>
                <input
                  type="text"
                  value={envieADireccion}
                  onChange={(e) => setEnvieADireccion(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div>
                <label className="mb-1 block t-caption font-semibold text-ink">Email</label>
                <input
                  type="email"
                  value={envieAEmail}
                  onChange={(e) => setEnvieAEmail(e.target.value)}
                  className="hg-field-compact w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block t-caption font-semibold text-ink">Observaciones <span className="font-normal text-ink-muted">(comentarios o instrucciones especiales para el proveedor)</span></label>
                <textarea
                  value={instrucciones}
                  onChange={(e) => setInstrucciones(e.target.value)}
                  rows={2}
                  className="hg-field-compact w-full resize-y"
                />
              </div>
            </div>
          </section>
        </form>

        {/* Footer Fijo con Botones de Acción */}
        <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-line-subtle bg-app px-5 py-3.5">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-oc-modal" disabled={loading}>
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : initialOrden ? 'Guardar cambios' : 'Crear orden'}</span>
          </Button>
        </footer>

        {/* Modal de confirmación de versionado */}
        {showVersionConfirmModal && initialOrden && (
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 z-[110]">
            <div className="bg-surface border border-line rounded-panel max-w-md w-full p-6 space-y-4 shadow-[var(--hg-shadow-popover)] text-ink">
              <div className="flex items-center gap-3 text-warning">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h4 className="font-semibold text-base text-ink">Confirmar modificación de la orden</h4>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Estás editando la orden <strong className="text-ink">{initialOrden.numero_oc}</strong> (v{initialOrden.version || 1}). Crea una versión nueva para conservar el historial o sobrescribe la versión actual.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  variant="primary"
                  onClick={() => saveOrdenToBackend(true)}
                  disabled={loading}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>Crear Nueva Versión (v{nextVersionPreview || (initialOrden.version || 1) + 1})</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => saveOrdenToBackend(false)}
                  disabled={loading}
                >
                  Sobrescribir Versión Actual (v{initialOrden.version || 1})
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => setShowVersionConfirmModal(false)}
                >
                  Volver al formulario
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
