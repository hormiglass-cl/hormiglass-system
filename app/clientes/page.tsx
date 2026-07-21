'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { MOCK_CLIENTES, MOCK_OPORTUNIDADES } from '../../lib/supabase/mock-data';
import { Cliente, NICHOS_CLIENTE_DEFAULT, OportunidadVenta } from '../../lib/types';
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

interface ColumnState {
  rut: boolean;
  nicho: boolean;
  cant_oportunidades: boolean;
  contacto: boolean;
  ubicacion: boolean;
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
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
  const [columns, setColumns] = useState<ColumnState>({
    rut: true,
    nicho: true,
    cant_oportunidades: true,
    contacto: true,
    ubicacion: true,
  });

  useEffect(() => {
    const savedCols = localStorage.getItem('hormiglass_client_cols_v3');
    if (savedCols) {
      try {
        setColumns(JSON.parse(savedCols));
      } catch {
        // ignore
      }
    }
  }, []);

  const toggleColumn = (key: keyof ColumnState) => {
    const updated = { ...columns, [key]: !columns[key] };
    setColumns(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hormiglass_client_cols_v3', JSON.stringify(updated));
    }
  };

  // Hover state for tooltip on opportunities count
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  // Form states
  const [nombre, setNombre] = useState('');
  const [usarMismaRazonSocial, setUsarMismaRazonSocial] = useState(true);
  const [apellidoRazon, setApellidoRazon] = useState('');
  const [rutBody, setRutBody] = useState('');
  const [rutDv, setRutDv] = useState('');
  const [nichoSeleccionado, setNichoSeleccionado] = useState<string>(NICHOS_CLIENTE_DEFAULT[0]);
  const [nuevoNichoInput, setNuevoNichoInput] = useState('');
  const [showAddNichoInput, setShowAddNichoInput] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [correosSecundariosInput, setCorreosSecundariosInput] = useState('');
  const [direccion, setDireccion] = useState('');
  const [comuna, setComuna] = useState('');

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
        const [cliRes, opRes, nichoRes] = await Promise.all([
          supabase.from('clientes').select('*').order('created_at', { ascending: false }),
          supabase.from('oportunidades').select('*'),
          supabase.from('campos_personalizados').select('opciones').eq('campo_supabase', 'nicho').maybeSingle(),
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
    return () => {
      ignore = true;
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
    } catch (err: any) {
      console.error('Error deleting client(s):', err);
      setDuplicateError(`Error al eliminar: ${err.message}`);
    }

    setClientsToDelete(null);
  };

  const getOportunidadesBreakdown = (clienteId: string, clientRut?: string, clientName?: string) => {
    const clientOps = oportunidades.filter(
      (o) =>
        o.cliente_id === clienteId ||
        (clientRut && o.cliente?.rut === clientRut) ||
        (clientName && o.cliente?.nombre === clientName)
    );

    const nuevas = clientOps.filter((o) => o.estado_pipeline === 'nueva').length;
    const pagadas = clientOps.filter((o) => o.estado_pipeline === 'pagada').length;
    const programadas = clientOps.filter((o) => o.estado_pipeline === 'programada').length;
    const entregadas = clientOps.filter((o) => o.estado_pipeline === 'entregada').length;

    return {
      total: clientOps.length,
      nuevas,
      pagadas,
      programadas,
      entregadas,
    };
  };

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
      telefono: telefono || undefined,
      correo: correo || undefined,
      correos_secundarios: secArray.length > 0 ? secArray : undefined,
      direccion: direccion || undefined,
      comuna: comuna || undefined,
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
    } catch (err: any) {
      console.error('Error creating client in Supabase:', err);
      setDuplicateError(`Error de conexión con Supabase: ${err.message || 'No se pudo crear el cliente.'}`);
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
    <div className="space-y-6 text-[#363636]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#363636] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#F7931F]" />
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
              className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
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
            className="bg-[#F7931F] hover:bg-[#e08316] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs px-4 py-3 rounded-2xl flex items-center gap-2 font-bold animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Barra de Filtros, Búsqueda y Personalización de Columnas */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200 shadow-sm relative">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por nombre, razón social o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-xs text-[#363636] placeholder-gray-400 focus:outline-none focus:border-[#F7931F]"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-semibold">Nicho de Mercado:</span>
            <select
              value={nichoFiltro}
              onChange={(e) => setNichoFiltro(e.target.value)}
              className="bg-white text-[#363636] border border-gray-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-[#F7931F] font-medium"
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
              className="bg-white hover:bg-gray-100 text-[#363636] border border-gray-300 text-xs font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F7931F]" />
              <span>Personalizar Vista</span>
            </button>

            {showColumnMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-30 space-y-2 text-xs">
                <p className="font-extrabold text-[#363636] border-b border-gray-100 pb-1.5 text-[11px] uppercase tracking-wider">
                  Campos Visibles en Tabla
                </p>

                <div className="space-y-1">
                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.rut}
                      onChange={() => toggleColumn('rut')}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>RUT</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.nicho}
                      onChange={() => toggleColumn('nicho')}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>Nicho de Mercado</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.cant_oportunidades}
                      onChange={() => toggleColumn('cant_oportunidades')}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>Oportunidades de Venta</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.contacto}
                      onChange={() => toggleColumn('contacto')}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>Contacto (Tel/Emails)</span>
                  </label>

                  <label className="flex items-center gap-2 p-1.5 hover:bg-orange-50 rounded-lg cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={columns.ubicacion}
                      onChange={() => toggleColumn('ubicacion')}
                      className="rounded text-[#F7931F] focus:ring-[#F7931F]"
                    />
                    <span>Ubicación (Comuna)</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lista de Clientes (Tabla Incrustada en el Fondo sin Scroll Interno) */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-visible">
        <div className="overflow-visible">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-[#363636] text-white text-xs font-bold uppercase tracking-wider">
                <th className="py-4 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="rounded text-[#F7931F] focus:ring-[#F7931F] cursor-pointer accent-[#F7931F]"
                  />
                </th>
                <th className="py-4 px-6 min-w-[200px]">Cliente / Razón Social</th>
                {columns.rut && <th className="py-4 px-6 min-w-[130px]">RUT</th>}
                {columns.nicho && <th className="py-4 px-6 min-w-[160px]">Nicho de Mercado</th>}
                {columns.cant_oportunidades && <th className="py-4 px-6 min-w-[180px]">Oportunidades de Venta</th>}
                {columns.contacto && <th className="py-4 px-6 min-w-[200px]">Contacto</th>}
                {columns.ubicacion && <th className="py-4 px-6 min-w-[130px]">Ubicación</th>}
                <th className="py-4 px-6 text-right min-w-[120px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs text-[#363636]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    Cargando directorio de clientes...
                  </td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    No se encontraron clientes registrados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => {
                  const bd = getOportunidadesBreakdown(cli.id, cli.rut, cli.nombre);
                  const isSelected = selectedClientIds.includes(cli.id);

                  return (
                    <tr key={cli.id} className={`hover:bg-orange-50/50 transition group ${isSelected ? 'bg-orange-50/40' : ''}`}>
                      {/* Checkbox Selección Individual */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(cli.id)}
                          className="rounded text-[#F7931F] focus:ring-[#F7931F] cursor-pointer accent-[#F7931F]"
                        />
                      </td>

                      {/* Cliente / Razón Social */}
                      <td className="py-4 px-6 font-bold">
                        <Link
                          href={`/clientes/${cli.id}`}
                          className="text-[#363636] hover:text-[#F7931F] transition flex flex-col"
                        >
                          <span className="text-sm font-bold leading-tight group-hover:underline">{cli.nombre}</span>
                          {cli.apellido_razon_social && cli.apellido_razon_social !== cli.nombre && (
                            <span className="text-[11px] text-gray-500 font-normal">{cli.apellido_razon_social}</span>
                          )}
                        </Link>
                      </td>

                      {/* RUT (sin puntos y con guion) */}
                      {columns.rut && (
                        <td className="py-4 px-6 font-mono font-semibold text-gray-700">
                          {formatRutClean(cli.rut)}
                        </td>
                      )}

                      {/* Nicho de Mercado (Editable directamente en tabla) */}
                      {columns.nicho && (
                        <td className="py-4 px-6">
                          <select
                            value={cli.nicho || 'Constructora B2B'}
                            onChange={(e) => handleUpdateNicho(cli.id, e.target.value)}
                            className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-50 text-[#F7931F] border border-orange-200 focus:outline-none focus:ring-1 focus:ring-[#F7931F] cursor-pointer"
                          >
                            {nichos.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* Cantidad de Oportunidades de Venta + Tooltip Hover con Desglose */}
                      {columns.cant_oportunidades && (
                        <td className="py-4 px-6 relative">
                          <div
                            onMouseEnter={() => setActiveTooltipId(cli.id)}
                            onMouseLeave={() => setActiveTooltipId(null)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-[#F7931F] border border-orange-200 rounded-full font-bold cursor-pointer transition hover:bg-[#F7931F] hover:text-white"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>{bd.total} {bd.total === 1 ? 'oportunidad' : 'oportunidades'}</span>

                            {/* Tooltip flotante al pasar el cursor */}
                            {activeTooltipId === cli.id && (
                              <div className="absolute left-4 top-10 w-56 bg-[#363636] text-white p-3 rounded-2xl shadow-xl z-40 text-xs space-y-1.5 animate-fadeIn pointer-events-none">
                                <p className="font-extrabold border-b border-gray-600 pb-1 text-[11px] text-[#F7931F] uppercase">
                                  Estado en Pipeline
                                </p>
                                <div className="space-y-1 text-[11px]">
                                  <div className="flex justify-between">
                                    <span className="text-amber-400 font-semibold">Nuevas:</span>
                                    <span className="font-bold">{bd.nuevas}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-blue-400 font-semibold">Pago Validado:</span>
                                    <span className="font-bold">{bd.pagadas}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-purple-400 font-semibold">En Programación:</span>
                                    <span className="font-bold">{bd.programadas}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-emerald-400 font-semibold">Entregadas & Cierre:</span>
                                    <span className="font-bold">{bd.entregadas}</span>
                                  </div>
                                </div>
                              </div>
                            )}
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
                              <Mail className="w-3 h-3 text-[#F7931F] shrink-0" />
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

                      {/* Ubicación */}
                      {columns.ubicacion && (
                        <td className="py-4 px-6 font-medium text-gray-700">
                          <p className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                            <span>{cli.comuna || 'Sin Comuna'}</span>
                          </p>
                        </td>
                      )}

                      {/* Acciones: Ver Ficha y Eliminar */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/clientes/${cli.id}`}
                            className="inline-flex items-center gap-1 text-[#F7931F] font-bold hover:underline"
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
          <div className="bg-white border border-gray-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl text-[#363636] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-extrabold text-[#363636] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#F7931F]" />
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
                className="text-gray-400 hover:text-[#363636] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {duplicateError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-2xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{duplicateError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCliente} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nicho de Mercado *</label>
                  {!showAddNichoInput ? (
                    <div className="flex gap-1.5">
                      <select
                        value={nichoSeleccionado}
                        onChange={(e) => setNichoSeleccionado(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F] font-semibold"
                      >
                        {nichos.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowAddNichoInput(true)}
                        className="p-2 bg-orange-50 hover:bg-[#F7931F] text-[#F7931F] hover:text-white rounded-xl border border-orange-200 transition"
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
                        className="w-full bg-white border border-gray-300 rounded-xl px-2.5 py-1.5 text-[#363636]"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNicho}
                        className="px-3 py-1 bg-[#F7931F] text-white font-bold rounded-xl text-[11px]"
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">RUT Empresa / Persona *</label>
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
                        className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] font-mono text-xs focus:outline-none focus:border-[#F7931F]"
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
                        className="w-full bg-white border border-gray-300 rounded-xl px-2 py-2 text-center text-[#363636] font-mono font-bold text-xs uppercase focus:outline-none focus:border-[#F7931F]"
                      />
                    </div>
                  </div>
                  {rutBody && (
                    <div className="mt-1">
                      {validarRutChileno(rutBody, rutDv).valido ? (
                        <span className="text-[10px] text-emerald-600 font-bold">
                          ✓ RUT Válido ({rutBody}-{rutDv.toUpperCase()})
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-500 font-bold">
                          {validarRutChileno(rutBody, rutDv).mensaje}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Constructora Besalco / Juan Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Razón Social *</label>
                <div className="space-y-2 bg-gray-50 p-3 rounded-2xl border border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs font-semibold text-[#363636]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(true)}
                        className="text-[#F7931F] focus:ring-[#F7931F]"
                      />
                      <span>Misma que el nombre comercial</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="razonSocialOption"
                        checked={!usarMismaRazonSocial}
                        onChange={() => setUsarMismaRazonSocial(false)}
                        className="text-[#F7931F] focus:ring-[#F7931F]"
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
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F] font-medium"
                    />
                  ) : (
                    <p className="text-[11px] text-gray-500 italic">
                      Se registrará automáticamente como: <strong className="text-[#363636] font-semibold">{nombre || 'Mismo Nombre Comercial'}</strong>
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
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Correo Primario (Deduplicación)</label>
                  <input
                    type="email"
                    placeholder="contacto@empresa.cl"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
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
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Dirección de Despacho</label>
                  <input
                    type="text"
                    placeholder="Av. Los Pajaritos 1230"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Comuna</label>
                  <input
                    type="text"
                    placeholder="San Bernardo / Maipú"
                    value={comuna}
                    onChange={(e) => setComuna(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-[#363636] focus:outline-none focus:border-[#F7931F]"
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
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F7931F] hover:bg-[#e08316] text-white rounded-xl font-extrabold transition shadow-md"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para Eliminar Cliente(s) en Supabase */}
      {clientsToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white border border-gray-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#363636]">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-extrabold">¿Eliminar Cliente(s)?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {clientsToDelete.length === 1 ? (
                <>
                  ¿Estás seguro de que deseas eliminar permanentemente a{' '}
                  <strong className="text-[#363636] font-bold">{clientsToDelete[0].nombre}</strong> de Supabase? Esta acción eliminará el registro de la base de datos y no se podrá deshacer.
                </>
              ) : (
                <>
                  ¿Estás seguro de que deseas eliminar permanentemente los{' '}
                  <strong className="text-[#363636] font-bold">{clientsToDelete.length} clientes seleccionados</strong> de Supabase? Esta acción eliminará los registros de la base de datos y no se podrá deshacer.
                </>
              )}
            </p>

            {clientsToDelete.length > 1 && (
              <div className="max-h-32 overflow-y-auto bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-[11px] space-y-1">
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
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDeleteClients}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-extrabold shadow-md transition flex items-center gap-1.5"
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

