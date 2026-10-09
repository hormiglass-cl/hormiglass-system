'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { Cliente, NICHOS_CLIENTE_DEFAULT, OportunidadVenta, Usuario } from '../../lib/types';
import { logSistema } from '../../lib/logger';
import {
  UserPlus,
  Search,
  Phone,
  Mail,
  ChevronRight,
  SlidersHorizontal,
  TrendingUp,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { SearchableSelect } from '../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../lib/chile-data';
import { mensajeError } from '../../lib/errores';
import { Button, CodeStamp, PageHeader, Panel, StatusBadge } from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';

interface ColumnState {
  rut: boolean;
  ejecutivo: boolean;
  nicho: boolean;
  cant_oportunidades: boolean;
  contacto: boolean;
}

const DEFAULT_CLIENT_COLUMNS: ColumnState = {
  rut: true,
  ejecutivo: true,
  nicho: true,
  cant_oportunidades: true,
  contacto: true,
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [nichos, setNichos] = useState<string[]>(NICHOS_CLIENTE_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [nichoFiltro, setNichoFiltro] = useState<string>('todos');
  const [showModal, setShowModal] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const confirmDialog = useConfirm();
  const toast = useToast();

  // Column visibility state
  const [columns, setColumns] = useState<ColumnState>(() => {
    if (typeof window === 'undefined') return DEFAULT_CLIENT_COLUMNS;
    const savedCols = window.localStorage.getItem('hormiglass_client_cols_v4');
    if (!savedCols) return DEFAULT_CLIENT_COLUMNS;
    try {
      return { ...DEFAULT_CLIENT_COLUMNS, ...JSON.parse(savedCols) };
    } catch {
      return DEFAULT_CLIENT_COLUMNS;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('hormiglass_client_cols_v4', JSON.stringify(columns));
    } catch {
      // ignore
    }
  }, [columns]);

  const toggleColumn = (key: keyof ColumnState) => {
    const updated = { ...columns, [key]: !columns[key] };
    setColumns(updated);
  };

  // Form states
  const [nombre, setNombre] = useState('');
  const [usarMismaRazonSocial, setUsarMismaRazonSocial] = useState(true);
  const [apellidoRazon, setApellidoRazon] = useState('');
  const [rutBody, setRutBody] = useState('');
  const [rutDv, setRutDv] = useState('');
  const [nichoSeleccionado, setNichoSeleccionado] = useState<string>(NICHOS_CLIENTE_DEFAULT[0]);
  const [tipoVentaSeleccionado, setTipoVentaSeleccionado] = useState<string>('Instalación');
  const [asignadoA, setAsignadoA] = useState<string>('');
  const [nuevoNichoInput, setNuevoNichoInput] = useState('');
  const [showAddNichoInput, setShowAddNichoInput] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [correosSecundariosInput, setCorreosSecundariosInput] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');
  const [region, setRegion] = useState('');

  const supabase = createClient();

  // Helper para normalizar RUT chileno
  const normalizeRut = (rutStr: string): string => {
    if (!rutStr) return '';
    const clean = rutStr.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body}-${dv}`;
  };

  const formatRutClean = (rutStr?: string): string => {
    if (!rutStr) return 'Sin RUT';
    return normalizeRut(rutStr);
  };

  // Helper para validar RUT con Algoritmo Módulo 11
  const validarRutChileno = (body: string, dv: string): { valido: boolean; mensaje: string } => {
    if (!body || !dv) return { valido: false, mensaje: 'Ingresa RUT y DV' };
    const cleanBody = body.replace(/[^0-9]/g, '');
    if (cleanBody.length < 7 || cleanBody.length > 8) {
      return { valido: false, mensaje: 'El cuerpo debe tener 7 u 8 dígitos' };
    }

    let suma = 0;
    let multiplo = 2;
    for (let i = cleanBody.length - 1; i >= 0; i--) {
      suma += parseInt(cleanBody.charAt(i), 10) * multiplo;
      multiplo = multiplo === 7 ? 2 : multiplo + 1;
    }
    const resto = suma % 11;
    let dvEsperado = (11 - resto).toString();
    if (dvEsperado === '11') dvEsperado = '0';
    if (dvEsperado === '10') dvEsperado = 'K';

    const cleanDv = dv.toUpperCase();
    if (cleanDv !== dvEsperado) {
      return { valido: false, mensaje: `DV incorrecto (debería ser ${dvEsperado})` };
    }
    return { valido: true, mensaje: 'RUT Válido' };
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [cliRes, opRes, usrRes] = await Promise.all([
          supabase.from('clientes').select('*').order('created_at', { ascending: false }),
          supabase.from('oportunidades').select('*'),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre'),
        ]);

        if (!ignore) {
          if (cliRes.data) {
            setClientes(cliRes.data as Cliente[]);
            const dbNichos = Array.from(new Set(cliRes.data.map((c: Cliente) => c.nicho).filter(Boolean)));
            const allNichos = Array.from(new Set([...NICHOS_CLIENTE_DEFAULT, ...dbNichos]));
            setNichos(allNichos as string[]);
          }
          if (opRes.data) setOportunidades(opRes.data as OportunidadVenta[]);
          if (usrRes.data) setUsuariosList(usrRes.data as Usuario[]);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error cargando directorio de clientes:', err);
        if (!ignore) setLoading(false);
      }
    }

    loadData();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  const handleUpdateNicho = async (clienteId: string, nuevoNicho: string) => {
    setClientes((prev) =>
      prev.map((c) => (c.id === clienteId ? { ...c, nicho: nuevoNicho } : c))
    );
    try {
      const { error } = await supabase.from('clientes').update({ nicho: nuevoNicho }).eq('id', clienteId);
      if (error) console.error('Error updating nicho on cliente:', error);
    } catch (err) {
      console.error('Error updating nicho on cliente:', err);
    }
  };

  const handleCreateNicho = () => {
    if (!nuevoNichoInput.trim()) return;
    const formatted = nuevoNichoInput.trim();
    if (!nichos.includes(formatted)) {
      setNichos([...nichos, formatted]);
    }
    setNichoSeleccionado(formatted);
    setNuevoNichoInput('');
    setShowAddNichoInput(false);
  };

  const filteredClientes = clientes.filter((c) => {
    const q = search.toLowerCase();
    const rutClean = (c.rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
    const searchClean = q.replace(/[^0-9kK]/g, '');

    const matchSearch =
      c.nombre.toLowerCase().includes(q) ||
      (c.apellido_razon_social && c.apellido_razon_social.toLowerCase().includes(q)) ||
      (c.correo && c.correo.toLowerCase().includes(q)) ||
      (c.telefono && c.telefono.includes(q)) ||
      (searchClean && rutClean.includes(searchClean));

    const matchNicho = nichoFiltro === 'todos' || c.nicho === nichoFiltro;

    return matchSearch && matchNicho;
  });

  // Calculate pagination
  const totalItems = filteredClientes.length;
  const paginatedClientes = filteredClientes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getOportunidadesCount = (clienteId: string) => {
    return oportunidades.filter((o) => o.cliente_id === clienteId).length;
  };

  const handleSelectAll = () => {
    if (selectedClientIds.length === filteredClientes.length) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(filteredClientes.map((c) => c.id));
    }
  };

  const toggleSelectClient = (id: string) => {
    if (selectedClientIds.includes(id)) {
      setSelectedClientIds(selectedClientIds.filter((item) => item !== id));
    } else {
      setSelectedClientIds([...selectedClientIds, id]);
    }
  };

  const isAllSelected = filteredClientes.length > 0 && selectedClientIds.length === filteredClientes.length;

  const handleDeleteClient = async (cli: Cliente) => {
    const ok = await confirmDialog({
      title: 'Eliminar Cliente',
      message: `¿Estás seguro de que deseas eliminar a "${cli.nombre}" (${formatRutClean(cli.rut)})? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar Cliente',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('clientes').delete().eq('id', cli.id);
      if (error) throw error;
      setClientes((prev) => prev.filter((c) => c.id !== cli.id));
      setSelectedClientIds((prev) => prev.filter((id) => id !== cli.id));
      toast({
        message: `Cliente ${cli.nombre} eliminado.`,
        tone: 'success',
      });
    } catch (err) {
      console.error('Error deleting client:', err);
      toast({
        message: 'No se pudo eliminar el cliente.',
        tone: 'danger',
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedClientIds.length === 0) return;
    const ok = await confirmDialog({
      title: 'Eliminar Clientes',
      message: `¿Estás seguro de que deseas eliminar permanentemente los ${selectedClientIds.length} clientes seleccionados?`,
      confirmLabel: 'Eliminar Selección',
      destructive: true,
    });
    if (!ok) return;

    try {
      const { error } = await supabase.from('clientes').delete().in('id', selectedClientIds);
      if (error) throw error;
      setClientes((prev) => prev.filter((c) => !selectedClientIds.includes(c.id)));
      toast({
        message: `${selectedClientIds.length} cliente(s) eliminados correctamente.`,
        tone: 'success',
      });
      setSelectedClientIds([]);
    } catch (err) {
      console.error('Error eliminando clientes seleccionados:', err);
      toast({
        message: 'No se pudieron eliminar los clientes seleccionados.',
        tone: 'danger',
      });
    }
  };

  const handleCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateError('');

    if (!nombre.trim() || !rutBody.trim() || !rutDv.trim()) {
      setDuplicateError('Por favor completa todos los campos requeridos (*).');
      return;
    }

    const { valido, mensaje } = validarRutChileno(rutBody, rutDv);
    if (!valido) {
      setDuplicateError(mensaje);
      return;
    }

    const formattedRut = normalizeRut(`${rutBody}-${rutDv}`);

    const duplicateByRut = clientes.find(
      (c) => normalizeRut(c.rut || '') === formattedRut
    );

    const duplicateByEmail = correo.trim()
      ? clientes.find(
          (c) => (c.correo || '').toLowerCase() === correo.trim().toLowerCase()
        )
      : null;

    if (duplicateByRut) {
      setDuplicateError(`Ya existe un cliente registrado con el RUT ${formattedRut} (${duplicateByRut.nombre}).`);
      return;
    }

    if (duplicateByEmail) {
      setDuplicateError(`Ya existe un cliente con el correo ${correo} (${duplicateByEmail.nombre}).`);
      return;
    }

    const secArray = correosSecundariosInput
      ? correosSecundariosInput.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const finalRazonSocial = usarMismaRazonSocial ? nombre : (apellidoRazon.trim() || nombre);
    const rutNum = parseInt(rutBody.replace(/[^0-9]/g, ''), 10);
    const tipoClienteCalculado = rutNum >= 50000000 ? 'juridica' : 'natural';

    const newClientData: Partial<Cliente> = {
      nombre,
      apellido_razon_social: finalRazonSocial,
      rut: formattedRut,
      tipo_cliente: tipoClienteCalculado,
      nicho: nichoSeleccionado,
      tipo_venta: tipoVentaSeleccionado || 'Instalación',
      asignado_a: asignadoA || undefined,
      telefono: telefono || undefined,
      correo: correo || undefined,
      correos_secundarios: secArray.length > 0 ? secArray : undefined,
      direccion: direccion || undefined,
      comuna: comuna || undefined,
      region: region || undefined,
    };

    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([newClientData])
        .select()
        .single();

      if (error || !data) {
        setDuplicateError(mensajeError(error, 'No se pudo crear el cliente.'));
        return;
      }

      setClientes([data as Cliente, ...clientes]);
      toast({
        message: `Cliente ${nombre} creado exitosamente.`,
        tone: 'success',
      });

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'clientes',
        entidad_id: data.id,
        descripcion: `Nuevo cliente registrado: ${nombre} (${formattedRut})`,
        datos_nuevos: data,
      });
    } catch (err: unknown) {
      console.error('Error creating client in Supabase:', err);
      setDuplicateError(mensajeError(err, 'No se pudo crear el cliente.'));
      return;
    }

    setShowModal(false);
    setShowAddNichoInput(false);
    setNuevoNichoInput('');
    setNombre('');
    setUsarMismaRazonSocial(true);
    setApellidoRazon('');
    setRutBody('');
    setRutDv('');
    setTelefono('');
    setCorreo('');
    setCorreosSecundariosInput('');
    setDireccion('');
    setComuna('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Directorio de Clientes"
        description="Visualización clasificada por Nichos de Mercado con deduplicación automática por RUT y correos."
        actions={
          <div className="flex items-center gap-2">
            {selectedClientIds.length > 0 && (
              <Button
                variant="destructive"
                onClick={handleDeleteSelected}
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Selección ({selectedClientIds.length})</span>
              </Button>
            )}

            <Button
              variant="primary"
              onClick={() => {
                setDuplicateError('');
                setShowAddNichoInput(false);
                setNuevoNichoInput('');
                setNombre('');
                setUsarMismaRazonSocial(true);
                setApellidoRazon('');
                setRutBody('');
                setRutDv('');
                setShowModal(true);
              }}
            >
              <UserPlus className="w-4 h-4" />
              <span>Nuevo Cliente</span>
            </Button>
          </div>
        }
      />

      {/* Barra de Filtros, Búsqueda y Personalización de Columnas */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, razón social o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-line rounded-md text-ink placeholder:text-ink-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted font-medium">Nicho:</span>
            <select
              value={nichoFiltro}
              onChange={(e) => setNichoFiltro(e.target.value)}
              className="bg-surface text-ink border border-line text-xs rounded-md px-3 py-2 focus:outline-none focus:border-accent font-medium"
            >
              <option value="todos">Todos los nichos ({clientes.length})</option>
              {nichos.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Menú para Escoger Columnas Visibles */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowColumnMenu(!showColumnMenu)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-accent-ink" />
              <span>Columnas</span>
            </Button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-surface border border-line rounded-lg shadow-sm p-3 z-30 space-y-2 text-xs">
                <p className="font-semibold text-ink border-b border-line pb-1">Columnas Visibles</p>
                <div className="space-y-1 text-ink">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.rut}
                      onChange={() => toggleColumn('rut')}
                      className="rounded accent-accent"
                    />
                    <span>RUT</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.ejecutivo}
                      onChange={() => toggleColumn('ejecutivo')}
                      className="rounded accent-accent"
                    />
                    <span>Ejecutivo asignado</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.nicho}
                      onChange={() => toggleColumn('nicho')}
                      className="rounded accent-accent"
                    />
                    <span>Nicho de mercado</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.cant_oportunidades}
                      onChange={() => toggleColumn('cant_oportunidades')}
                      className="rounded accent-accent"
                    />
                    <span>Oportunidades de venta</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-surface-muted rounded cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.contacto}
                      onChange={() => toggleColumn('contacto')}
                      className="rounded accent-accent"
                    />
                    <span>Contacto (tel/emails)</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {nichoFiltro !== 'todos' && (
        <div aria-label="Filtros activos" className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNichoFiltro('todos')}
            className="text-xs bg-surface-muted border border-line px-2.5 py-1 rounded-md text-ink hover:bg-line-subtle transition"
          >
            Nicho: {nichoFiltro} ✕
          </button>
        </div>
      )}

      {/* Lista de Clientes */}
      <Panel className="overflow-hidden">
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            <p className="p-5 text-sm text-ink-muted">Cargando clientes…</p>
          ) : paginatedClientes.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron clientes.</p>
          ) : (
            paginatedClientes.map((cli) => (
              <div key={cli.id} className="p-4 space-y-2 hover:bg-surface-muted transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedClientIds.includes(cli.id)}
                      onChange={() => toggleSelectClient(cli.id)}
                      aria-label={`Seleccionar ${cli.nombre}`}
                      className="shrink-0 accent-accent"
                    />
                    <Link href={`/clientes/${cli.id}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink hover:text-accent">{cli.nombre}</span>
                      <span className="block truncate text-xs text-ink-muted t-num">{formatRutClean(cli.rut)} · {cli.nicho || 'Sin nicho'}</span>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ink-muted t-num font-semibold">{getOportunidadesCount(cli.id)} ops</span>
                    <Link href={`/clientes/${cli.id}`}>
                      <ChevronRight className="h-4 w-4 text-ink-muted hover:text-accent" />
                    </Link>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[900px] text-xs">
            <thead>
              <tr className="bg-surface-muted text-ink-muted text-[11px] font-semibold border-b border-line uppercase tracking-normal">
                <th className="py-3.5 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="rounded cursor-pointer accent-accent"
                  />
                </th>
                <th className="py-3.5 px-6 min-w-[200px] text-ink">Cliente / Razón social</th>
                {columns.rut && <th className="py-3.5 px-6 min-w-[130px] text-ink">RUT</th>}
                {columns.ejecutivo && <th className="py-3.5 px-6 min-w-[170px] text-ink">Ejecutivo asignado</th>}
                {columns.nicho && <th className="py-3.5 px-6 min-w-[160px] text-ink">Nicho de mercado</th>}
                {columns.cant_oportunidades && <th className="py-3.5 px-6 min-w-[180px] text-ink">Oportunidades de venta</th>}
                {columns.contacto && <th className="py-3.5 px-6 min-w-[200px] text-ink">Contacto</th>}
                <th className="py-3.5 px-6 text-right min-w-[120px] text-ink">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-xs text-ink">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted font-medium">
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron clientes registrados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => {
                  const oportunidadesCount = getOportunidadesCount(cli.id);
                  const isSelected = selectedClientIds.includes(cli.id);

                  return (
                    <tr key={cli.id} className={`hover:bg-surface-muted/50 transition group ${isSelected ? 'bg-surface-muted' : ''}`}>
                      {/* Checkbox Selección Individual */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(cli.id)}
                          className="rounded cursor-pointer accent-accent"
                        />
                      </td>

                      {/* Cliente / Razón Social */}
                      <td className="py-3.5 px-6 font-semibold">
                        <Link
                          href={`/clientes/${cli.id}`}
                          className="text-ink hover:text-accent transition flex flex-col"
                        >
                          <span className="text-sm font-semibold leading-tight group-hover:underline">{cli.nombre}</span>
                          {cli.apellido_razon_social && cli.apellido_razon_social !== cli.nombre && (
                            <span className="text-xs text-ink-muted font-normal">{cli.apellido_razon_social}</span>
                          )}
                        </Link>
                      </td>

                      {/* RUT */}
                      {columns.rut && (
                        <td className="py-3.5 px-6 font-medium text-xs">
                          <CodeStamp>{formatRutClean(cli.rut)}</CodeStamp>
                        </td>
                      )}

                      {/* Ejecutivo Asignado */}
                      {columns.ejecutivo && (
                        <td className="py-3.5 px-6">
                          <select
                            value={cli.asignado_a || ''}
                            onChange={async (e) => {
                              const newUid = e.target.value || null;
                              setClientes((prev) =>
                                prev.map((c) => (c.id === cli.id ? { ...c, asignado_a: newUid } : c))
                              );
                              try {
                                const { error } = await supabase.from('clientes').update({ asignado_a: newUid }).eq('id', cli.id);
                                if (error) console.error('Error updating asignado_a on cliente:', error);
                              } catch (err) {
                                console.error('Error updating asignado_a on cliente:', err);
                              }
                            }}
                            className="text-xs font-medium px-2 py-1 rounded-md bg-surface border border-line text-ink focus:outline-none focus:border-accent cursor-pointer min-w-[140px] truncate"
                          >
                            <option value="">-- Sin asignar --</option>
                            {usuariosList.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Nicho de Mercado */}
                      {columns.nicho && (
                        <td className="py-3.5 px-6">
                          <select
                            value={cli.nicho || 'Constructora B2B'}
                            onChange={(e) => handleUpdateNicho(cli.id, e.target.value)}
                            className="text-xs font-medium px-2 py-1 rounded-md bg-surface border border-line text-ink focus:outline-none focus:border-accent cursor-pointer min-w-[140px]"
                          >
                            {nichos.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Cantidad de oportunidades de venta */}
                      {columns.cant_oportunidades && (
                        <td className="py-3.5 px-6">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-muted text-ink border border-line rounded-md font-medium text-xs">
                            <TrendingUp className="w-3.5 h-3.5 text-accent-ink" />
                            <span className="t-num">{oportunidadesCount} {oportunidadesCount === 1 ? 'oportunidad' : 'oportunidades'}</span>
                          </div>
                        </td>
                      )}

                      {/* Contacto */}
                      {columns.contacto && (
                        <td className="py-3.5 px-6 space-y-1">
                          {cli.telefono && (
                            <p className="flex items-center gap-1.5 text-ink">
                              <Phone className="w-3 h-3 text-ink-muted shrink-0" />
                              <span className="t-num">{cli.telefono}</span>
                            </p>
                          )}
                          {cli.correo && (
                            <p className="flex items-center gap-1.5 text-ink font-medium">
                              <Mail className="w-3 h-3 text-accent-ink shrink-0" />
                              <span className="truncate max-w-[150px]" title={`Correo Primario: ${cli.correo}`}>{cli.correo}</span>
                            </p>
                          )}
                          {cli.correos_secundarios && cli.correos_secundarios.length > 0 && (
                            <div className="text-[11px] text-ink-muted">
                              +{cli.correos_secundarios.length} correo(s) sec.
                            </div>
                          )}
                        </td>
                      )}

                      {/* Acciones */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/clientes/${cli.id}`}
                            className="inline-flex items-center gap-1 text-accent-ink font-semibold hover:underline"
                          >
                            <span>Ficha</span>
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                          <Button
                            variant="subtle"
                            size="sm"
                            onClick={() => handleDeleteClient(cli)}
                            title="Eliminar Cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-danger" />
                          </Button>
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
      </Panel>

      {/* Modal para Crear Cliente Nuevo */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-lg max-w-lg w-full p-6 space-y-4 shadow-sm text-ink max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-accent-ink" />
                <span>Registrar Nuevo Cliente</span>
              </h3>
              <button
                onClick={() => {
                  setShowAddNichoInput(false);
                  setNuevoNichoInput('');
                  setUsarMismaRazonSocial(true);
                  setApellidoRazon('');
                  setShowModal(false);
                }}
                className="text-ink-muted hover:text-ink text-lg font-semibold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {duplicateError && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-md text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span>{duplicateError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCliente} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">Nicho de mercado *</label>
                  {!showAddNichoInput ? (
                    <div className="flex gap-1.5">
                      <select
                        value={nichoSeleccionado}
                        onChange={(e) => setNichoSeleccionado(e.target.value)}
                        className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent font-medium text-xs"
                      >
                        {nichos.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddNichoInput(true)}
                        className="p-1.5 bg-surface-muted hover:bg-line-subtle text-ink rounded-md border border-line transition cursor-pointer"
                        title="Crear nuevo nicho"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Ej. Minería"
                        value={nuevoNichoInput}
                        onChange={(e) => setNuevoNichoInput(e.target.value)}
                        className="w-full bg-surface border border-line rounded-md px-2 py-1 text-ink text-xs"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={handleCreateNicho}
                      >
                        OK
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">Tipo de venta</label>
                  <select
                    value={tipoVentaSeleccionado}
                    onChange={(e) => setTipoVentaSeleccionado(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent font-medium text-xs"
                  >
                    <option value="Instalación">Instalación</option>
                    <option value="Suministro">Suministro</option>
                    <option value="Reventa de Material">Reventa de Material</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">Ejecutivo</label>
                  <select
                    value={asignadoA}
                    onChange={(e) => setAsignadoA(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent font-medium text-xs"
                  >
                    <option value="">-- Sin asignar --</option>
                    {usuariosList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">RUT empresa / persona *</label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <input
                        type="text"
                        required
                        maxLength={8}
                        placeholder="Ej. 12345678"
                        value={rutBody}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setRutBody(val);
                        }}
                        className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink t-num text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                    <span className="font-semibold text-ink-muted text-sm">-</span>
                    <div className="w-14">
                      <input
                        type="text"
                        required
                        maxLength={1}
                        placeholder="K"
                        value={rutDv}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9kK]/g, '').toUpperCase();
                          setRutDv(val);
                        }}
                        className="w-full bg-surface border border-line rounded-md px-2 py-2 text-center text-ink t-num font-semibold text-xs uppercase focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  {rutBody && (
                    <div className="mt-1">
                      {validarRutChileno(rutBody, rutDv).valido ? (
                        <span className="text-[11px] text-accent-ink font-medium">
                          ✓ RUT válido ({rutBody}-{rutDv.toUpperCase()})
                        </span>
                      ) : (
                        <span className="text-[11px] text-danger font-medium">
                          {validarRutChileno(rutBody, rutDv).mensaje}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">Nombre comercial *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Constructora Besalco"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Razón social *</label>
                <div className="space-y-2 bg-surface-muted p-3 rounded-lg border border-line">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs font-medium text-ink">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(true)}
                        className="accent-accent"
                      />
                      <span>Misma que el nombre comercial</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={!usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(false)}
                        className="accent-accent"
                      />
                      <span>Usar una diferente</span>
                    </label>
                  </div>

                  {!usarMismaRazonSocial ? (
                    <input
                      type="text"
                      required
                      placeholder="Ej. Constructora Besalco S.A."
                      value={apellidoRazon}
                      onChange={(e) => setApellidoRazon(e.target.value)}
                      className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent font-medium"
                    />
                  ) : (
                    <p className="text-xs text-ink-muted">
                      Se registrará como: <strong className="text-ink font-semibold">{nombre || 'Mismo nombre comercial'}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+56 9 1234 5678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink t-num focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">Correo primario</label>
                  <input
                    type="email"
                    placeholder="contacto@empresa.cl"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Correos Secundarios (Separados por coma)</label>
                <input
                  type="text"
                  placeholder="ventas@empresa.cl, adquisiciones@empresa.cl"
                  value={correosSecundariosInput}
                  onChange={(e) => setCorreosSecundariosInput(e.target.value)}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-ink mb-1">Dirección (Calle y Número)</label>
                  <input
                    type="text"
                    placeholder="Av. Los Pajaritos 1230"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-ink text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Región"
                    value={region}
                    onChange={(val) => setRegion(val)}
                    options={REGIONES_CHILE.map((r) => r.region)}
                    placeholder="Seleccionar o buscar región..."
                  />
                </div>

                <div>
                  <SearchableSelect
                    label="Comuna"
                    value={comuna}
                    onChange={(val) => {
                      setComuna(val);
                      if (!region && val) {
                        const foundReg = REGIONES_CHILE.find((r) => r.comunas.includes(val));
                        if (foundReg) {
                          setRegion(foundReg.region);
                        }
                      }
                    }}
                    options={
                      region
                        ? (REGIONES_CHILE.find((r) => r.region === region)?.comunas || TODAS_COMUNAS_CHILE)
                        : TODAS_COMUNAS_CHILE
                    }
                    placeholder="Seleccionar o buscar comuna..."
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-line">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddNichoInput(false);
                    setNuevoNichoInput('');
                    setUsarMismaRazonSocial(true);
                    setApellidoRazon('');
                    setShowModal(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                >
                  Guardar cliente
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
