'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { Proveedor, PedidoProveedor } from '../../lib/types';
import {
  Plus,
  Building,
  FileText,
  Upload,
  Download,
  AlertTriangle,
  Search,
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
import {
  validarRutChileno,
  parseProveedoresFile,
  generarPlantillaProveedoresCsv,
  generarPlantillaProveedoresXlsx,
  type ProveedorImportado,
} from '../../lib/proveedores-csv';

export default function ProveedoresPage() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showProvModal, setShowProvModal] = useState(false);
  const [showPedidoModal, setShowPedidoModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Manual provider form
  const [nombreProv, setNombreProv] = useState('');
  const [rutProv, setRutProv] = useState('');
  const [contactoProv, setContactoProv] = useState('');
  const [telefonoProv, setTelefonoProv] = useState('');
  const [correoProv, setCorreoProv] = useState('');
  const [direccionProv, setDireccionProv] = useState('');
  const [comunaProv, setComunaProv] = useState('');
  const [rubroProv, setRubroProv] = useState('');

  // Fast PO form
  const [proveedorId, setProveedorId] = useState('');
  const [descripcionPedido, setDescripcionPedido] = useState('');
  const [montoPedido, setMontoPedido] = useState(150000);

  // Bulk import states
  const [preview, setPreview] = useState<ProveedorImportado[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: provsData } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre');

      const { data: pedsData } = await supabase
        .from('pedidos_proveedor')
        .select('*, proveedor:proveedores(*)')
        .order('created_at', { ascending: false });

      const loadedProvs = provsData ? (provsData as Proveedor[]) : [];
      const loadedPeds = pedsData ? (pedsData as PedidoProveedor[]) : [];

      setProveedores(loadedProvs);
      setPedidos(loadedPeds);
      if (loadedProvs.length > 0) {
        setProveedorId((current) => current || loadedProvs[0].id);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading proveedores from Supabase:', err);
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    let ignore = false;
    void loadData();

    const channel = supabase
      .channel('proveedores_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proveedores' }, () => {
        if (!ignore) void loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_proveedor' }, () => {
        if (!ignore) void loadData();
      })
      .subscribe();

    return () => {
      ignore = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  // Validation on manual form
  const rutValidation = useMemo(() => {
    if (!rutProv.trim()) return null;
    return validarRutChileno(rutProv, { estricto: false });
  }, [rutProv]);

  const handleAddProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreProv || !rutProv) return;

    const val = validarRutChileno(rutProv, { estricto: false });
    if (!val.valido) {
      toast({ message: `RUT inválido: ${val.mensaje}`, tone: 'danger' });
      return;
    }

    const newProvPayload = {
      nombre: nombreProv.trim(),
      rut: val.rutFormateado || rutProv.trim(),
      contacto: contactoProv.trim() || null,
      telefono: telefonoProv.trim() || null,
      correo: correoProv.trim().toLowerCase() || null,
      direccion: direccionProv.trim() || null,
      comuna: comunaProv.trim() || null,
      rubro: rubroProv.trim() || null,
    };

    try {
      const { data, error } = await supabase
        .from('proveedores')
        .insert([newProvPayload])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setProveedores((prev) => [...prev, data as Proveedor]);
        if (!proveedorId) setProveedorId((data as Proveedor).id);
        toast({ message: `Proveedor ${nombreProv} registrado exitosamente.`, tone: 'success' });
      }
    } catch (err) {
      console.error('Error adding proveedor to Supabase:', err);
      toast({ message: 'No se pudo guardar el proveedor. Verifica que el RUT no esté duplicado.', tone: 'danger' });
    }

    setShowProvModal(false);
    setNombreProv('');
    setRutProv('');
    setContactoProv('');
    setTelefonoProv('');
    setCorreoProv('');
    setDireccionProv('');
    setComunaProv('');
    setRubroProv('');
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

  // Bulk import handling
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const { rows, errors, warnings } = parseProveedoresFile(buffer);
      setPreview(rows);
      setImportErrors(errors);
      setImportWarnings(warnings);
    } catch (err) {
      setImportErrors([`Error al leer el archivo: ${(err as Error).message}`]);
      setPreview([]);
      setImportWarnings([]);
    }
  };

  const handleConfirmImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);

    try {
      // Intentar RPC atómico primero
      const { data: rpcData, error: rpcError } = await supabase.rpc('upsert_proveedores_masivo', {
        p_proveedores: preview,
      });

      if (!rpcError && rpcData) {
        const insertados = rpcData.insertados ?? 0;
        const actualizados = rpcData.actualizados ?? 0;
        toast({
          message: `Carga exitosa: ${insertados} proveedores agregados, ${actualizados} actualizados.`,
          tone: 'success',
        });
      } else {
        // Fallback: upsert directo tabla por tabla
        const payload = preview.map((p) => ({
          rut: p.rut,
          nombre: p.nombre,
          contacto: p.contacto || null,
          telefono: p.telefono || null,
          correo: p.correo || null,
          direccion: p.direccion || null,
          comuna: p.comuna || null,
          region: p.region || null,
          rubro: p.rubro || null,
          activo: true,
        }));

        const { error: upsertErr } = await supabase
          .from('proveedores')
          .upsert(payload, { onConflict: 'rut' });

        if (upsertErr) throw upsertErr;

        toast({
          message: `${preview.length} proveedores importados exitosamente.`,
          tone: 'success',
        });
      }

      setShowImportModal(false);
      setPreview([]);
      setImportErrors([]);
      setImportWarnings([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err) {
      console.error('Error importing proveedores:', err);
      toast({
        message: 'No se pudo completar la importación. Revisa los datos del archivo.',
        tone: 'danger',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const csvContent = generarPlantillaProveedoresCsv();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_proveedores_hormiglass.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast({ message: 'Plantilla CSV descargada.', tone: 'info' });
  };

  const handleDownloadXlsxTemplate = () => {
    const xlsxBytes = generarPlantillaProveedoresXlsx();
    const blob = new Blob([xlsxBytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_proveedores_hormiglass.xlsx';
    link.click();
    URL.revokeObjectURL(url);
    toast({ message: 'Plantilla Excel descargada.', tone: 'info' });
  };

  // Filtrado de proveedores
  const filteredProveedores = useMemo(() => {
    if (!searchQuery.trim()) return proveedores;
    const q = searchQuery.toLowerCase().trim();
    return proveedores.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(q) ||
        p.rut?.toLowerCase().includes(q) ||
        p.contacto?.toLowerCase().includes(q) ||
        p.comuna?.toLowerCase().includes(q)
    );
  }, [proveedores, searchQuery]);

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
        description="Gestión de catálogo oficial de proveedores, órdenes de compra y carga masiva de materias primas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleDownloadXlsxTemplate}
              icon={Download}
            >
              Plantilla Excel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPreview([]);
                setImportErrors([]);
                setImportWarnings([]);
                setShowImportModal(true);
              }}
              icon={Upload}
            >
              Importar Proveedores
            </Button>
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
          </div>
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
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                placeholder="Buscar por nombre, RUT o comuna..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="hg-field pl-9"
              />
            </div>
            {searchQuery && (
              <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
                Limpiar
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <p className="t-caption text-ink-muted col-span-2 py-4 text-center">Cargando directorio de proveedores...</p>
            ) : filteredProveedores.length === 0 ? (
              <p className="t-caption text-ink-muted col-span-2 py-4 text-center">
                {searchQuery ? 'No se encontraron proveedores para la búsqueda.' : 'No hay proveedores registrados aún.'}
              </p>
            ) : (
              filteredProveedores.map((prov) => (
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
                    <StatusBadge tone="success">Oficial</StatusBadge>
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

      {/* Modal Nuevo Proveedor Manual */}
      <Dialog
        open={showProvModal}
        onClose={() => setShowProvModal(false)}
        title="Registrar Proveedor"
        description="Agrega un nuevo proveedor oficial al directorio de abastecimiento."
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
            <label className="block text-ink font-semibold mb-1">Nombre o Razón Social *</label>
            <input
              type="text"
              required
              placeholder="Ej. Cemento Polpaico S.A."
              value={nombreProv}
              onChange={(e) => setNombreProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">RUT Empresa *</label>
            <input
              type="text"
              required
              placeholder="Ej. 90.120.000-4"
              value={rutProv}
              onChange={(e) => setRutProv(e.target.value)}
              className="hg-field font-mono"
            />
            {rutValidation && (
              <p
                className={`mt-1 t-caption ${
                  rutValidation.valido && rutValidation.dvCorrecto
                    ? 'text-success'
                    : rutValidation.valido
                    ? 'text-warning'
                    : 'text-danger'
                }`}
              >
                {rutValidation.valido && rutValidation.dvCorrecto
                  ? `✓ RUT Válido (${rutValidation.rutFormateado})`
                  : rutValidation.valido
                  ? `⚠ ${rutValidation.mensaje}`
                  : `✗ ${rutValidation.mensaje}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Rubro / Especialidad</label>
            <input
              type="text"
              placeholder="Ej. Áridos, Prefabricados, Fierro"
              value={rubroProv}
              onChange={(e) => setRubroProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div>
            <label className="block text-ink font-semibold mb-1">Persona de Contacto</label>
            <input
              type="text"
              placeholder="Ej. Juan Pérez - Mesa de Ventas"
              value={contactoProv}
              onChange={(e) => setContactoProv(e.target.value)}
              className="hg-field"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-ink font-semibold mb-1">Dirección</label>
              <input
                type="text"
                placeholder="Av. Industrial 123"
                value={direccionProv}
                onChange={(e) => setDireccionProv(e.target.value)}
                className="hg-field"
              />
            </div>
            <div>
              <label className="block text-ink font-semibold mb-1">Comuna</label>
              <input
                type="text"
                placeholder="San Bernardo"
                value={comunaProv}
                onChange={(e) => setComunaProv(e.target.value)}
                className="hg-field"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-ink font-semibold mb-1">Teléfono</label>
              <input
                type="text"
                placeholder="+56 2 2700 8000"
                value={telefonoProv}
                onChange={(e) => setTelefonoProv(e.target.value)}
                className="hg-field"
              />
            </div>
            <div>
              <label className="block text-ink font-semibold mb-1">Correo Electrónico</label>
              <input
                type="email"
                placeholder="ventas@proveedor.cl"
                value={correoProv}
                onChange={(e) => setCorreoProv(e.target.value)}
                className="hg-field"
              />
            </div>
          </div>
        </form>
      </Dialog>

      {/* Modal Importar Proveedores Masivo */}
      <Dialog
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Importar Proveedores desde Archivo (CSV / Excel)"
        description="Sube una planilla con el listado de proveedores para incorporarlos automáticamente al sistema."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Cerrar
            </Button>
            {preview.length > 0 && (
              <Button
                variant="primary"
                onClick={handleConfirmImport}
                disabled={importing || preview.length === 0}
              >
                {importing
                  ? 'Importando...'
                  : `Confirmar e Importar (${preview.length} Proveedores)`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-muted rounded-lg border border-line">
            <div className="space-y-0.5">
              <p className="font-semibold text-xs text-ink">¿Aún no tienes el formato?</p>
              <p className="t-caption text-ink-muted">
                Descarga la plantilla oficial con columnas obligatorias y ejemplos validados.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleDownloadXlsxTemplate} icon={Download}>
                Descargar Excel
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDownloadCsvTemplate} icon={Download}>
                Descargar CSV
              </Button>
            </div>
          </div>

          <div className="border-2 border-dashed border-line rounded-lg p-6 text-center space-y-3 bg-surface hover:bg-surface-muted transition">
            <Upload className="w-8 h-8 text-accent-ink mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">Selecciona o arrastra tu archivo</p>
              <p className="t-caption text-ink-muted">Formatos soportados: .xlsx, .xls, .csv</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleFileChange}
              className="block w-full text-xs text-ink file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent-soft file:text-accent-ink hover:file:bg-accent-soft/80 cursor-pointer"
            />
          </div>

          {importErrors.length > 0 && (
            <div className="rounded-md border border-danger-line bg-danger-soft p-3 space-y-1 text-xs text-danger max-h-36 overflow-auto">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Se encontraron observaciones que requieren revisión:</span>
              </div>
              {importErrors.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}

          {importWarnings.length > 0 && (
            <div className="rounded-md border border-warning-line bg-warning-soft p-3 space-y-1 text-xs text-warning max-h-32 overflow-auto">
              <p className="font-semibold">Avisos informativos:</p>
              {importWarnings.map((msg, i) => (
                <p key={i}>• {msg}</p>
              ))}
            </div>
          )}

          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-xs text-ink">
                  {preview.length} proveedor(es) listos para importar
                </p>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-line">
                <table className="hg-table w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className="py-2.5 px-3">RUT</th>
                      <th className="py-2.5 px-3">Razón Social</th>
                      <th className="py-2.5 px-3">Rubro</th>
                      <th className="py-2.5 px-3">Contacto</th>
                      <th className="py-2.5 px-3">Comuna</th>
                      <th className="py-2.5 px-3">Teléfono</th>
                      <th className="py-2.5 px-3">Correo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-subtle">
                    {preview.slice(0, 50).map((row, idx) => (
                      <tr key={`${row.rut}-${idx}`} className="hover:bg-surface-muted">
                        <td className="py-2 px-3 font-mono font-medium text-ink">
                          <CodeStamp>{row.rut}</CodeStamp>
                        </td>
                        <td className="py-2 px-3 font-medium text-ink">{row.nombre}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.rubro || '-'}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.contacto || '-'}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.comuna || '-'}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.telefono || '-'}</td>
                        <td className="py-2 px-3 text-ink-muted">{row.correo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="p-2.5 bg-surface-muted text-center text-xs text-ink-muted border-t border-line">
                    Mostrando los primeros 50 de {preview.length} registros.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
