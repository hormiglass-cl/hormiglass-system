'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { Cliente, NICHOS_CLIENTE_DEFAULT, OportunidadVenta, Usuario } from '../../lib/types';
import { logSistema } from '../../lib/logger';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  SlidersHorizontal,
  TrendingUp,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { SearchableSelect } from '../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../lib/chile-data';

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
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientsToDelete, setClientsToDelete] = useState<Cliente[] | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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

  // Helper to format RUT: 12345678-K (sin puntos y con guion)
  const formatRutClean = (rawRut: string) => {
    const clean = rawRut.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length <= 1) return clean;
    const dv = clean.slice(-1);
    const body = clean.slice(0, -1);
    return `${body}-${dv}`;
  };

  useEffect(() => {
    let ignore = false;
    async function getClientesData() {
      try {
        const [cliRes, opRes, nichoRes, userRes] = await Promise.all([
          supabase.from('clientes').select('*').order('created_at', { ascending: false }),
          supabase.from('oportunidades').select('id, cliente_id'),
          supabase.from('campos_personalizados').select('opciones').eq('campo_supabase', 'nicho').maybeSingle(),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre', { ascending: true }),
        ]);

        if (!ignore) {
          if (cliRes.data) {
            setClientes(cliRes.data as Cliente[]);
          } else {
            setClientes([]);
          }

          if (opRes.data) {
            setOportunidades(opRes.data as OportunidadVenta[]);
          } else {
            setOportunidades([]);
          }

          if (userRes.data) {
            setUsuariosList(userRes.data as Usuario[]);
          }

          if (nichoRes.data && nichoRes.data.opciones && nichoRes.data.opciones.length > 0) {
            setNichos(nichoRes.data.opciones);
            setNichoSeleccionado(nichoRes.data.opciones[0]);
          }

          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching clientes from Supabase:', err);
        if (!ignore) {
          setClientes([]);
          setOportunidades([]);
          setLoading(false);
        }
      }
    }

    getClientesData();

    const channel = supabase
      .channel('realtime_clientes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clientes',
        },
        () => {
          getClientesData();
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCreateNicho = async () => {
    if (!nuevoNichoInput.trim()) return;
    const newNichoName = nuevoNichoInput.trim();
    let updatedNichos = [...nichos];
    if (!nichos.includes(newNichoName)) {
      updatedNichos = [...nichos, newNichoName];
      setNichos(updatedNichos);

      try {
        await supabase
          .from('campos_personalizados')
          .update({ opciones: updatedNichos })
          .eq('campo_supabase', 'nicho');
      } catch (err) {
        console.error('Error updating nicho options in Supabase:', err);
      }
    }
    setNichoSeleccionado(newNichoName);
    setNuevoNichoInput('');
    setShowAddNichoInput(false);
  };

  const handleUpdateNicho = async (clienteId: string, newNicho: string) => {
    setClientes((prev) =>
      prev.map((c) => (c.id === clienteId ? { ...c, nicho: newNicho } : c))
    );
    try {
      await supabase.from('clientes').update({ nicho: newNicho }).eq('id', clienteId);
    } catch (err) {
      console.error('Error updating client nicho:', err);
    }
  };

  const filteredClientes = clientes.filter((c) => {
    const matchesSearch =
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.rut.toLowerCase().includes(search.toLowerCase()) ||
      (c.apellido_razon_social && c.apellido_razon_social.toLowerCase().includes(search.toLowerCase()));

    const matchesNicho = nichoFiltro === 'todos' || c.nicho === nichoFiltro;

    return matchesSearch && matchesNicho;
  });

  // Calculate pagination
  const totalItems = filteredClientes.length;
  const paginatedClientes = filteredClientes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Multi-select helpers
  const isAllSelected =
    filteredClientes.length > 0 &&
    filteredClientes.every((c) => selectedClientIds.includes(c.id));

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(filteredClientes.map((c) => c.id));
    }
  };

  const toggleSelectClient = (id: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirmDeleteClients = async () => {
    if (!clientsToDelete || clientsToDelete.length === 0) return;
    const idsToDelete = clientsToDelete.map((c) => c.id);

    try {
      const { error } = await supabase.from('clientes').delete().in('id', idsToDelete);
      if (error) {
        setDuplicateError(`Error al eliminar cliente(s) en Supabase: ${error.message}`);
      } else {
        setClientes((prev) => prev.filter((c) => !idsToDelete.includes(c.id)));
        setSelectedClientIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));

        for (const c of clientsToDelete) {
          await logSistema({
            tipo_accion: 'eliminacion',
            entidad: 'clientes',
            entidad_id: c.id,
            descripcion: `Cliente ${c.nombre} (${c.rut}) eliminado del sistema`,
            datos_anteriores: c,
          });
        }

        setSuccessMsg(
          idsToDelete.length === 1
            ? `Cliente "${clientsToDelete[0].nombre}" eliminado de Supabase exitosamente.`
            : `Se eliminaron ${idsToDelete.length} clientes de Supabase exitosamente.`
        );
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err: unknown) {
      console.error('Error deleting client(s):', err);
      setDuplicateError(`Error al eliminar: ${err instanceof Error ? err.message : 'No se pudo eliminar.'}`);
    }

    setClientsToDelete(null);
  };

  const getOportunidadesCount = (clienteId: string) =>
    oportunidades.filter((o) => o.cliente_id === clienteId).length;

  // Chilean RUT Modulo 11 validation helpers
  const calcularDV = (rutBody: string): string => {
    const cleanBody = rutBody.replace(/[^0-9]/g, '');
    if (!cleanBody) return '';
    let sum = 0;
    let multiplier = 2;
    for (let i = cleanBody.length - 1; i >= 0; i--) {
      sum += parseInt(cleanBody.charAt(i), 10) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expectedMod = 11 - (sum % 11);
    if (expectedMod === 11) return '0';
    if (expectedMod === 10) return 'K';
    return expectedMod.toString();
  };

  const validarRutChileno = (rutBody: string, dv: string): { valido: boolean; mensaje?: string } => {
    const cleanBody = rutBody.replace(/[^0-9]/g, '');
    const cleanDv = dv.trim().toUpperCase();
    if (!cleanBody) return { valido: false, mensaje: 'Ingresa el número de RUT' };
    if (cleanBody.length < 7 || cleanBody.length > 8) return { valido: false, mensaje: 'El RUT debe tener entre 7 y 8 dígitos' };
    if (!cleanDv) return { valido: false, mensaje: 'Ingresa el DV' };
    if (!/^[0-9K]$/.test(cleanDv)) return { valido: false, mensaje: 'DV inválido (0-9 o K)' };

    const dvEsperado = calcularDV(cleanBody);
    if (dvEsperado !== cleanDv) {
      return { valido: false, mensaje: `RUT Inválido. El DV para ${cleanBody} es ${dvEsperado}` };
    }
    return { valido: true };
  };

  const handleCreateCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateError('');

    if (!nombre || !rutBody || !rutDv) return;

    const valRut = validarRutChileno(rutBody, rutDv);
    if (!valRut.valido) {
      setDuplicateError(valRut.mensaje || 'RUT inválido. Verifica el número y el dígito verificador.');
      return;
    }

    const formattedRut = `${rutBody.replace(/[^0-9]/g, '')}-${rutDv.trim().toUpperCase()}`;

    // Deduplication check: verify if RUT or email already exists
    const duplicateByRut = clientes.find((c) => formatRutClean(c.rut) === formattedRut);
    const duplicateByEmail = correo
      ? clientes.find(
          (c) =>
            (c.correo && c.correo.toLowerCase() === correo.toLowerCase()) ||
            c.correos_secundarios?.some((sec) => sec.toLowerCase() === correo.toLowerCase())
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
        setDuplicateError(`Error al guardar en Supabase: ${error?.message || 'No se pudo crear el cliente.'}`);
        return;
      }

      setClientes([data as Cliente, ...clientes]);

      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'clientes',
        entidad_id: data.id,
        descripcion: `Nuevo cliente registrado: ${nombre} (${formattedRut})`,
        datos_nuevos: data,
      });
    } catch (err: unknown) {
      console.error('Error creating client in Supabase:', err);
      setDuplicateError(`Error de conexión con Supabase: ${err instanceof Error ? err.message : 'No se pudo crear el cliente.'}`);
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
    <div className="space-y-6 text-[#213343]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#213343] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#f97316]" />
            <span>Directorio de Clientes</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Visualización clasificada por Nichos de Mercado con deduplicación automática de contactos por RUT sin puntos y correos.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          {selectedClientIds.length > 0 && (
            <button
              onClick={() => {
                const toDel = clientes.filter((c) => selectedClientIds.includes(c.id));
                if (toDel.length > 0) setClientsToDelete(toDel);
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar Selección ({selectedClientIds.length})</span>
            </button>
          )}

          <button
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
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-4 py-3 rounded-lg flex items-center gap-2 font-bold ">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Barra de Filtros, Búsqueda y Personalización de Columnas */}
      <div className="hg-list-toolbar relative">
        <div className="relative min-w-[220px] flex-[2]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nombre, razón social o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="hg-list-search w-full pl-9 pr-3 py-2 text-sm text-[#252b2d] placeholder-gray-400"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-semibold">Nicho de Mercado:</span>
            <select
              value={nichoFiltro}
              onChange={(e) => setNichoFiltro(e.target.value)}
              className="bg-white text-[#213343] border border-gray-300 text-xs rounded-md px-3 py-2 focus:outline-none focus:border-[#f97316] font-medium"
            >
              <option value="todos">Todos los nichos ({clientes.length})</option>
              {nichos.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Menú para Escoger Columnas Visibles */}
          <div className="relative">
            <button
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="bg-white hover:bg-gray-100 text-[#213343] border border-gray-300 text-xs font-bold px-3 py-2 rounded-md transition flex items-center gap-1.5 shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Personalizar Vista</span>
            </button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-sm p-3 z-30 space-y-2 text-xs">
                <p className="font-extrabold text-[#213343] border-b border-gray-100 pb-1.5 text-xs">
                  Campos visibles en tabla
                </p>

                <div className="space-y-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.rut}
                      onChange={() => toggleColumn('rut')}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>RUT</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.ejecutivo}
                      onChange={() => toggleColumn('ejecutivo')}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>Ejecutivo asignado</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.nicho}
                      onChange={() => toggleColumn('nicho')}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>Nicho de mercado</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.cant_oportunidades}
                      onChange={() => toggleColumn('cant_oportunidades')}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>Oportunidades de venta</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.contacto}
                      onChange={() => toggleColumn('contacto')}
                      className="rounded text-[#f97316] focus:ring-[#F7931F]"
                    />
                    <span>Contacto (tel/emails)</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {nichoFiltro !== 'todos' && <div aria-label="Filtros activos" className="flex flex-wrap gap-2"><button type="button" onClick={() => setNichoFiltro('todos')} className="hg-list-meta hover:bg-[#ecefed]">Nicho: {nichoFiltro} ×</button></div>}

      {/* Lista de Clientes (Tabla Incrustada en el Fondo sin Scroll Interno) */}
      <div className="hg-list-group">
        <div className="hg-list-group-heading"><span>Clientes</span><span className="hg-list-count">{filteredClientes.length}</span></div>
        <div className="md:hidden">
          {loading ? <p className="p-5 text-sm text-[#66716f]">Cargando clientes…</p> : paginatedClientes.length === 0 ? <p className="p-5 text-sm text-[#66716f]">No se encontraron clientes.</p> : paginatedClientes.map((cli) => <div key={cli.id} className="hg-list-row">
            <input type="checkbox" checked={selectedClientIds.includes(cli.id)} onChange={() => toggleSelectClient(cli.id)} aria-label={`Seleccionar ${cli.nombre}`} className="shrink-0 accent-[#e87622]" />
            <Link href={`/clientes/${cli.id}`} className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{cli.nombre}</span><span className="block truncate text-xs text-[#8a9390]">{formatRutClean(cli.rut)} · {cli.nicho || 'Sin nicho'}</span></Link>
            <span className="hg-list-count" title="Oportunidades">{getOportunidadesCount(cli.id)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#a8afac]" aria-hidden="true" />
          </div>)}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="hg-list-table w-full text-left min-w-[900px]">
            <thead>
              <tr className="bg-[#f4f5f3] text-[#66716f] text-xs font-bold">
                <th className="py-4 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="rounded text-[#f97316] focus:ring-[#F7931F] cursor-pointer accent-[#F7931F]"
                  />
                </th>
                <th className="py-4 px-6 min-w-[200px]">Cliente / Razón social</th>
                {columns.rut && <th className="py-4 px-6 min-w-[130px]">RUT</th>}
                {columns.ejecutivo && <th className="py-4 px-6 min-w-[170px]">Ejecutivo asignado</th>}
                {columns.nicho && <th className="py-4 px-6 min-w-[160px]">Nicho de mercado</th>}
                {columns.cant_oportunidades && <th className="py-4 px-6 min-w-[180px]">Oportunidades de venta</th>}
                {columns.contacto && <th className="py-4 px-6 min-w-[200px]">Contacto</th>}
                <th className="py-4 px-6 text-right min-w-[120px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs text-[#213343]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                    No se encontraron clientes registrados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => {
                  const oportunidadesCount = getOportunidadesCount(cli.id);
                  const isSelected = selectedClientIds.includes(cli.id);

                  return (
                    <tr key={cli.id} className={`hover:bg-orange-50/50 transition group ${isSelected ? 'bg-orange-50/40' : ''}`}>
                      {/* Checkbox Selección Individual */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(cli.id)}
                          className="rounded text-[#f97316] focus:ring-[#F7931F] cursor-pointer accent-[#F7931F]"
                        />
                      </td>

                      {/* Cliente / Razón Social */}
                      <td className="py-4 px-6 font-bold">
                        <Link
                          href={`/clientes/${cli.id}`}
                          className="text-[#213343] hover:text-[#f97316] transition flex flex-col"
                        >
                          <span className="text-sm font-bold leading-tight group-hover:underline">{cli.nombre}</span>
                          {cli.apellido_razon_social && cli.apellido_razon_social !== cli.nombre && (
                            <span className="text-xs text-gray-500 font-normal">{cli.apellido_razon_social}</span>
                          )}
                        </Link>
                      </td>

                      {/* RUT (sin puntos y con guion) */}
                      {columns.rut && (
                        <td className="py-4 px-6 font-mono font-semibold text-gray-700 text-xs">
                          {formatRutClean(cli.rut)}
                        </td>
                      )}

                      {/* Ejecutivo Asignado (al lado del RUT) */}
                      {columns.ejecutivo && (
                        <td className="py-4 px-6">
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
                            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer min-w-[150px] truncate"
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

                      {/* Nicho de Mercado (Editable directamente en tabla) */}
                      {columns.nicho && (
                        <td className="py-4 px-6">
                          <select
                            value={cli.nicho || 'Constructora B2B'}
                            onChange={(e) => handleUpdateNicho(cli.id, e.target.value)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-orange-50 text-[#f97316] border border-orange-200 focus:outline-none focus:ring-1 focus:ring-[#F7931F] cursor-pointer min-w-[150px]"
                          >
                            {nichos.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Cantidad de oportunidades de venta asignadas */}
                      {columns.cant_oportunidades && (
                        <td className="py-4 px-6">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-[#f97316] border border-orange-200 rounded-md font-bold text-xs">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>{oportunidadesCount} {oportunidadesCount === 1 ? 'oportunidad' : 'oportunidades'}</span>
                          </div>
                        </td>
                      )}

                      {/* Contacto (Teléfono y Correos Primario/Secundarios) */}
                      {columns.contacto && (
                        <td className="py-4 px-6 space-y-1">
                          {cli.telefono && (
                            <p className="flex items-center gap-1.5 text-gray-700">
                              <Phone className="w-3 h-3 text-gray-400 shrink-0" />
                              <span>{cli.telefono}</span>
                            </p>
                          )}
                          {cli.correo && (
                            <p className="flex items-center gap-1.5 text-gray-700 font-medium">
                              <Mail className="w-3 h-3 text-[#f97316] shrink-0" />
                              <span className="truncate max-w-[150px]" title={`Correo Primario: ${cli.correo}`}>{cli.correo}</span>
                            </p>
                          )}
                          {cli.correos_secundarios && cli.correos_secundarios.length > 0 && (
                            <div className="text-[10px] text-gray-400">
                              +{cli.correos_secundarios.length} correo(s) sec.
                            </div>
                          )}
                        </td>
                      )}

                      {/* Acciones: Ver Ficha y Eliminar */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/clientes/${cli.id}`}
                            className="inline-flex items-center gap-1 text-[#f97316] font-bold hover:underline"
                          >
                            <span>Ficha</span>
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => setClientsToDelete([cli])}
                            title="Eliminar Cliente de Supabase"
                            className="p-1 text-gray-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
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

      {/* Modal para Crear Cliente Nuevo */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-sm text-[#213343] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-extrabold text-[#213343] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#f97316]" />
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
                className="text-gray-400 hover:text-[#213343] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {duplicateError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-center gap-2 font-bold ">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{duplicateError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCliente} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nicho de mercado *</label>
                  {!showAddNichoInput ? (
                    <div className="flex gap-1.5">
                      <select
                        value={nichoSeleccionado}
                        onChange={(e) => setNichoSeleccionado(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] font-semibold text-xs"
                      >
                        {nichos.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddNichoInput(true)}
                        className="p-2 bg-orange-50 hover:bg-[#f97316] text-[#f97316] hover:text-white rounded-md border border-orange-200 transition cursor-pointer"
                        title="Crear nuevo nicho"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Ej. Minería / Obras Viales"
                        value={nuevoNichoInput}
                        onChange={(e) => setNuevoNichoInput(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-[#213343] text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNicho}
                        className="px-3 py-1 bg-[#f97316] text-white font-bold rounded-md text-xs cursor-pointer"
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de venta habitual</label>
                  <select
                    value={tipoVentaSeleccionado}
                    onChange={(e) => setTipoVentaSeleccionado(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] font-semibold text-xs"
                  >
                    <option value="Instalación">Instalación</option>
                    <option value="Suministro">Suministro</option>
                    <option value="Reventa de Material">Reventa de Material</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Ejecutivo asignado</label>
                  <select
                    value={asignadoA}
                    onChange={(e) => setAsignadoA(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] font-semibold text-xs"
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
                  <label className="block font-bold text-gray-700 mb-1">RUT empresa / persona *</label>
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
                        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] font-mono text-xs focus:outline-none focus:border-[#f97316]"
                      />
                    </div>
                    <span className="font-extrabold text-gray-400 text-sm">-</span>
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
                        className="w-full bg-white border border-gray-300 rounded-md px-2 py-2 text-center text-[#213343] font-mono font-bold text-xs uppercase focus:outline-none focus:border-[#f97316]"
                      />
                    </div>
                  </div>
                  {rutBody && (
                    <div className="mt-1">
                      {validarRutChileno(rutBody, rutDv).valido ? (
                        <span className="text-[10px] text-emerald-600 font-bold">
                          ✓ RUT válido ({rutBody}-{rutDv.toUpperCase()})
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-500 font-bold">
                          {validarRutChileno(rutBody, rutDv).mensaje}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nombre comercial *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Constructora Besalco / Juan Pérez"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Razón social *</label>
                <div className="space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs font-semibold text-[#213343]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(true)}
                        className="text-[#f97316] focus:ring-[#F7931F]"
                      />
                      <span>Misma que el nombre comercial</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={!usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(false)}
                        className="text-[#f97316] focus:ring-[#F7931F]"
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
                      className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316] font-medium"
                    />
                  ) : (
                    <p className="text-xs text-gray-500 italic">
                      Se registrará automáticamente como: <strong className="text-[#213343] font-semibold">{nombre || 'Mismo nombre comercial'}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+56 9 1234 5678"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Correo primario (deduplicación)</label>
                  <input
                    type="email"
                    placeholder="contacto@empresa.cl"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Correos Secundarios (Opcional - Separados por coma)</label>
                <input
                  type="text"
                  placeholder="ventas@empresa.cl, adquisiciones@empresa.cl"
                  value={correosSecundariosInput}
                  onChange={(e) => setCorreosSecundariosInput(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] focus:outline-none focus:border-[#f97316]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 mb-1">Dirección (Calle y Número)</label>
                  <input
                    type="text"
                    placeholder="Av. Los Pajaritos 1230"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[#213343] text-xs focus:outline-none focus:border-[#f97316]"
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

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddNichoInput(false);
                    setNuevoNichoInput('');
                    setUsarMismaRazonSocial(true);
                    setApellidoRazon('');
                    setShowModal(false);
                  }}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-md font-extrabold transition shadow-sm cursor-pointer"
                >
                  Guardar cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Eliminar Cliente(s) en Supabase */}
      {clientsToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 ">
          <div className="bg-white border border-gray-200 rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-[#213343]">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-extrabold">¿Eliminar Cliente(s)?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {clientsToDelete.length === 1 ? (
                <>
                  ¿Estás seguro de que deseas eliminar permanentemente a{' '}
                  <strong className="text-[#213343] font-bold">{clientsToDelete[0].nombre}</strong> de Supabase? Esta acción eliminará el registro de la base de datos y no se podrá deshacer.
                </>
              ) : (
                <>
                  ¿Estás seguro de que deseas eliminar permanentemente los{' '}
                  <strong className="text-[#213343] font-bold">{clientsToDelete.length} clientes seleccionados</strong> de Supabase? Esta acción eliminará los registros de la base de datos y no se podrá deshacer.
                </>
              )}
            </p>

            {clientsToDelete.length > 1 && (
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2.5 rounded-md border border-gray-200 text-[11px] space-y-1">
                {clientsToDelete.map((c) => (
                  <div key={c.id} className="flex justify-between text-gray-700 font-medium">
                    <span className="font-bold truncate">{c.nombre}</span>
                    <span className="font-mono text-gray-500 shrink-0">{c.rut}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setClientsToDelete(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteClients}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-extrabold shadow-sm transition flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar de Supabase</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
