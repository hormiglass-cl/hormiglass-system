'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useAjuste } from '../../lib/ajustes';
import { Cliente, NICHOS_CLIENTE_DEFAULT, OportunidadVenta, Usuario } from '../../lib/types';
import { logSistema } from '../../lib/logger';
import {
  UserPlus,
  Search,
  ChevronRight,
  AlertCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { SearchableSelect } from '../../components/SearchableSelect';
import { REGIONES_CHILE, TODAS_COMUNAS_CHILE } from '../../lib/chile-data';
import { mensajeError } from '../../lib/errores';
import { Button, Dialog, Panel } from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { AvatarBadge } from '../../components/ui/AvatarBadge';
import { ColumnMenu, useColumnPrefs } from '../../components/ui/ColumnMenu';
import { FloatingActionBar } from '../../components/ui/FloatingActionBar';
import { FilterMenu, FilterBar, useFilterUi, FilterDefinition, matchNumberFilter, parseMulti } from '../../components/ui/FilterPills';
import clsx from 'clsx';

type ClienteCol = 'rut' | 'ejecutivo' | 'nicho' | 'cant_oportunidades' | 'correo' | 'telefono';

const CLIENTE_COL_ORDER: ClienteCol[] = ['rut', 'ejecutivo', 'nicho', 'cant_oportunidades', 'correo', 'telefono'];

const DEFAULT_CLIENT_COLUMNS: Record<ClienteCol, boolean> = {
  rut: true,
  ejecutivo: true,
  nicho: true,
  cant_oportunidades: true,
  correo: true,
  telefono: true,
};

const CLIENTE_COL_LABELS: Record<ClienteCol, string> = {
  rut: 'RUT',
  ejecutivo: 'Ejecutivo asignado',
  nicho: 'Nicho de mercado',
  cant_oportunidades: 'Oportunidades de venta',
  correo: 'Correo',
  telefono: 'Teléfono',
};

const CLIENTE_COL_HEAD: Record<ClienteCol, string> = {
  rut: 'RUT',
  ejecutivo: 'Ejecutivo asignado',
  nicho: 'Nicho',
  cant_oportunidades: 'Oportunidades',
  correo: 'Correo',
  telefono: 'Teléfono',
};

const CLIENTE_COL_WIDTH: Record<ClienteCol, string> = {
  rut: 'min-w-[120px]',
  ejecutivo: 'min-w-[160px]',
  nicho: 'min-w-[150px]',
  cant_oportunidades: 'min-w-[120px]',
  correo: 'min-w-[200px]',
  telefono: 'min-w-[140px]',
};

import { swrCache } from '../../lib/cache/swr-cache';
import { Select } from '../../components/ui/FormControls';

export default function ClientesPage() {
  const tiposVenta = useAjuste('tipos_venta').valor.lista;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchDeb, setSearchDeb] = useState('');
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>(() => swrCache.get('clientes:oportunidades') || []);
  const [usuariosList, setUsuariosList] = useState<Usuario[]>([]);
  const [nichos, setNichos] = useState<string[]>(NICHOS_CLIENTE_DEFAULT);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [nichoFiltro, setNichoFiltro] = useState<string>('todos');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [showModal, setShowModal] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const router = useRouter();
  const filterUi = useFilterUi();
  const confirmDialog = useConfirm();
  const toast = useToast();

  // Columnas: visibilidad y orden (se recuerdan en este navegador)
  const colPrefs = useColumnPrefs<ClienteCol>('hormiglass_client_cols_v5', CLIENTE_COL_ORDER, DEFAULT_CLIENT_COLUMNS);

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

  const supabase = useMemo(() => createClient(), []);

  // Helper para normalizar RUT chileno
  const normalizeRut = (rutStr: string): string => {
    if (!rutStr) return '';
    const clean = rutStr.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length < 2) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    return `${body}-${dv}`;
  };

  const formatRutClean = (rutStr?: string | null): string => {
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

  // Oportunidades y usuarios: conjuntos pequeños que se cargan una sola vez.
  useEffect(() => {
    let ignore = false;
    async function loadAux() {
      try {
        const [opRes, usrRes] = await Promise.all([
          supabase.from('oportunidades').select('id, cliente_id'),
          supabase.from('usuarios').select('*').eq('activo', true).order('nombre'),
        ]);
        if (ignore) return;
        if (opRes.data) {
          const opData = opRes.data as OportunidadVenta[];
          setOportunidades(opData);
          swrCache.set('clientes:oportunidades', opData);
        }
        if (usrRes.data) setUsuariosList(usrRes.data as Usuario[]);
      } catch (err) {
        console.error('Error cargando oportunidades y usuarios:', err);
      }
    }
    void loadAux();
    return () => {
      ignore = true;
    };
  }, [supabase]);

  // La búsqueda espera a que termines de escribir antes de consultar.
  useEffect(() => {
    const t = window.setTimeout(() => setSearchDeb(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const opCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of oportunidades) {
      if (o.cliente_id) m.set(o.cliente_id, (m.get(o.cliente_id) ?? 0) + 1);
    }
    return m;
  }, [oportunidades]);

  // Vuelve a la página 1 cuando cambia la búsqueda o un filtro.
  const firmaFiltros = `${searchDeb}|${nichoFiltro}|${JSON.stringify(activeFilters)}`;
  const [firmaPrevia, setFirmaPrevia] = useState(firmaFiltros);
  if (firmaPrevia !== firmaFiltros) {
    setFirmaPrevia(firmaFiltros);
    setCurrentPage(1);
  }

  // Una página de clientes a la vez: búsqueda, filtros y paginación se resuelven en el servidor.
  useEffect(() => {
    let ignore = false;
    async function cargarPagina() {
      setLoading(true);
      try {
        let q = supabase.from('clientes').select('*', { count: 'exact' });

        const term = searchDeb.trim().replace(/[,()%*]/g, ' ').replace(/\s+/g, ' ').trim();
        if (term) {
          const rutTerm = term.replace(/\./g, '');
          q = q.or([
            `nombre.ilike.%${term}%`,
            `apellido_razon_social.ilike.%${term}%`,
            `correo.ilike.%${term}%`,
            `telefono.ilike.%${term}%`,
            `rut.ilike.%${rutTerm}%`,
          ].join(','));
        }

        const nichos = parseMulti(activeFilters.nicho || (nichoFiltro !== 'todos' ? nichoFiltro : undefined));
        if (nichos.length) q = q.in('nicho', nichos);

        const ejec = parseMulti(activeFilters.ejecutivo);
        if (ejec.length) {
          const sinAsignar = ejec.includes('sin_asignar');
          const ids = ejec.filter((v) => v !== 'sin_asignar');
          if (sinAsignar && ids.length) q = q.or(`asignado_a.is.null,asignado_a.in.(${ids.join(',')})`);
          else if (sinAsignar) q = q.is('asignado_a', null);
          else q = q.in('asignado_a', ids);
        }

        const filtroOp = activeFilters.oportunidades;
        if (filtroOp && filtroOp.includes(':')) {
          const entradas = Array.from(opCounts.entries());
          if (matchNumberFilter(filtroOp, 0)) {
            const excluidos = entradas.filter(([, n]) => !matchNumberFilter(filtroOp, n)).map(([id]) => id);
            if (excluidos.length) q = q.not('id', 'in', `(${excluidos.join(',')})`);
          } else {
            const incluidos = entradas.filter(([, n]) => matchNumberFilter(filtroOp, n)).map(([id]) => id);
            q = q.in('id', incluidos.length ? incluidos : ['00000000-0000-0000-0000-000000000000']);
          }
        }

        const desde = (currentPage - 1) * itemsPerPage;
        const { data, count, error } = await q
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(desde, desde + itemsPerPage - 1);
        if (error) throw error;
        if (ignore) return;
        const filas = (data || []) as Cliente[];
        setClientes(filas);
        setTotalItems(count ?? filas.length);
        const nichosPagina = filas.map((c) => c.nicho).filter(Boolean) as string[];
        if (nichosPagina.length) setNichos((prev) => Array.from(new Set([...prev, ...nichosPagina])));
      } catch (err) {
        console.error('Error cargando directorio de clientes:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void cargarPagina();
    return () => {
      ignore = true;
    };
  }, [supabase, currentPage, itemsPerPage, searchDeb, activeFilters, nichoFiltro, opCounts, reloadKey]);

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

  const filterDefinitions: FilterDefinition[] = useMemo(() => [
    {
      id: 'nicho',
      label: 'Nicho',
      allLabel: 'Todos los nichos',
      options: nichos.map((n) => ({ value: n, label: n })),
    },
    {
      id: 'ejecutivo',
      label: 'Ejecutivo',
      allLabel: 'Todos los ejecutivos',
      options: [
        { value: 'sin_asignar', label: 'Sin asignar' },
        ...usuariosList.map((u) => ({ value: u.id, label: u.nombre })),
      ],
    },
    {
      id: 'oportunidades',
      label: 'Oportunidades',
      type: 'number',
      options: [],
    },
  ], [nichos, usuariosList]);

  const filteredClientes = clientes;
  const paginatedClientes = clientes;

  const getOportunidadesCount = (clienteId: string) => {
    return oportunidades.filter((o) => o.cliente_id === clienteId).length;
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedClientIds([]);
    } else {
      setSelectedClientIds(Array.from(new Set([...selectedClientIds, ...filteredClientes.map((c) => c.id)])));
    }
  };

  const toggleSelectClient = (id: string) => {
    if (selectedClientIds.includes(id)) {
      setSelectedClientIds(selectedClientIds.filter((item) => item !== id));
    } else {
      setSelectedClientIds([...selectedClientIds, id]);
    }
  };

  const isAllSelected = filteredClientes.length > 0 && filteredClientes.every((c) => selectedClientIds.includes(c.id));

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
      setReloadKey((k) => k + 1);
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

    if (!nombre.trim()) {
      setDuplicateError('Por favor completa todos los campos requeridos (*).');
      return;
    }

    if (rutBody.trim() || rutDv.trim()) {
      const { valido, mensaje } = validarRutChileno(rutBody, rutDv);
      if (!valido) {
        setDuplicateError(mensaje);
        return;
      }
    }

    const formattedRut = rutBody.trim() ? normalizeRut(`${rutBody}-${rutDv}`) : null;

    // Duplicados: se consulta al servidor (la lista en pantalla es solo una página).
    let duplicateByRut: { nombre: string } | null = null;
    let duplicateByEmail: { nombre: string } | null = null;
    try {
      if (formattedRut) {
        const [cuerpo, dv] = formattedRut.split('-');
        const conPuntos = `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
        const { data } = await supabase.from('clientes').select('nombre').in('rut', [formattedRut, conPuntos]).limit(1);
        duplicateByRut = data?.[0] ?? null;
      }
      if (correo.trim()) {
        const exacto = correo.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data } = await supabase.from('clientes').select('nombre').ilike('correo', exacto).limit(1);
        duplicateByEmail = data?.[0] ?? null;
      }
    } catch (err) {
      console.error('No se pudo verificar duplicados:', err);
    }

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
    const tipoClienteCalculado = formattedRut ? (rutNum >= 50000000 ? 'juridica' : 'natural') : null;

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

      setCurrentPage(1);
      setReloadKey((k) => k + 1);
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

  const cerrarModalCliente = () => {
    setShowAddNichoInput(false);
    setNuevoNichoInput('');
    setUsarMismaRazonSocial(true);
    setApellidoRazon('');
    setShowModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Barra de herramientas: búsqueda, filtros y acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-surface-muted p-1">
          <div className="relative w-full sm:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              aria-label="Buscar clientes"
              placeholder="Buscar cliente o RUT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-line-subtle bg-surface pl-8 pr-3 text-[13px] text-ink shadow-[var(--hg-shadow-card)] placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Menú para escoger y ordenar columnas */}
          <ColumnMenu labels={CLIENTE_COL_LABELS} prefs={colPrefs} />

          <FilterMenu
            triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
            filters={filterDefinitions}
            activeFilters={activeFilters}
            ui={filterUi}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
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
            <span>Nuevo cliente</span>
          </Button>
        </div>
      </div>

      <FilterBar
        filters={filterDefinitions}
        activeFilters={activeFilters}
        onFilterChange={(id, val) => setActiveFilters((prev) => ({ ...prev, [id]: val }))}
        onClearAll={() => {
              setActiveFilters({});
              setNichoFiltro('todos');
              setSearch('');
            }}
        ui={filterUi}
      />

      {/* Lista de Clientes */}
      <Panel className="overflow-hidden">
        <div className="md:hidden divide-y divide-line-subtle">
          {loading ? (
            [...Array(4)].map((_, idx) => (
              <div key={`skel-cli-mob-${idx}`} className="p-4 space-y-2 animate-pulse">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-40 rounded bg-surface-muted hg-skeleton" />
                    <div className="h-3 w-28 rounded bg-surface-muted hg-skeleton" />
                  </div>
                  <div className="h-4 w-14 rounded bg-surface-muted hg-skeleton" />
                </div>
              </div>
            ))
          ) : paginatedClientes.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No se encontraron clientes.</p>
          ) : (
            paginatedClientes.map((cli) => (
              <div
                key={cli.id}
                onClick={() => router.push(`/clientes/${cli.id}`)}
                className="p-3 space-y-2 hover:bg-surface-muted/60 transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedClientIds.includes(cli.id)}
                        onChange={() => toggleSelectClient(cli.id)}
                        aria-label={`Seleccionar ${cli.nombre}`}
                        className="shrink-0 accent-accent"
                      />
                    </div>
                    <AvatarBadge name={cli.nombre} size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clientes/${cli.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate text-sm font-semibold text-ink hover:text-accent-ink"
                      >
                        {cli.nombre}
                      </Link>
                      <span className="block truncate text-[11px] text-ink-muted t-num">
                        {formatRutClean(cli.rut)} · {cli.nicho || 'Sin nicho'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-ink-muted t-num font-semibold">
                      {getOportunidadesCount(cli.id)} ops
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-ink-muted hover:text-accent" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left min-w-[900px] text-[13px]">
            <thead>
              <tr className="bg-surface-muted/60 text-ink-muted text-xs font-medium border-b border-line">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="rounded cursor-pointer accent-accent"
                  />
                </th>
                <th className="py-3 px-3 min-w-[220px] font-medium">Cliente</th>
                {colPrefs.visibleOrder.map((k) => (
                  <th key={k} className={`py-3 px-3 font-medium ${CLIENTE_COL_WIDTH[k]}`}>{CLIENTE_COL_HEAD[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-[13px] text-ink">
              {loading ? (
                [...Array(6)].map((_, idx) => (
                  <tr key={`skel-cli-${idx}`} className="animate-pulse">
                    <td className="py-3 px-3 text-center">
                      <div className="w-4 h-4 rounded bg-surface-muted hg-skeleton mx-auto" />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-muted hg-skeleton shrink-0" />
                        <div className="space-y-1 flex-1">
                          <div className="h-3.5 w-36 rounded bg-surface-muted hg-skeleton" />
                          <div className="h-2.5 w-24 rounded bg-surface-muted hg-skeleton" />
                        </div>
                      </div>
                    </td>
                    {colPrefs.visibleOrder.map((k) => (
                      <td key={k} className="py-3 px-3">
                        <div className="h-3.5 w-24 rounded bg-surface-muted hg-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={2 + colPrefs.visibleOrder.length} className="py-8 text-center text-ink-muted font-medium">
                    No se encontraron clientes registrados.
                  </td>
                </tr>
              ) : (
                paginatedClientes.map((cli) => {
                  const oportunidadesCount = getOportunidadesCount(cli.id);
                  const isSelected = selectedClientIds.includes(cli.id);
                  const ejecutivoAsignado = usuariosList.find((u) => u.id === cli.asignado_a);
                  const cells: Record<ClienteCol, React.ReactNode> = {
                    rut: (
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{formatRutClean(cli.rut)}</span>
                      </td>
                    ),
                    ejecutivo: (
                      <td className="py-3 px-3">
                        {ejecutivoAsignado ? (
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <AvatarBadge name={ejecutivoAsignado.nombre} size="xs" className="shrink-0" />
                            <span className="truncate text-ink">{ejecutivoAsignado.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted">Sin asignar</span>
                        )}
                      </td>
                    ),
                    nicho: <td className="py-3 px-3 text-ink">{cli.nicho || 'Sin nicho'}</td>,
                    cant_oportunidades: (
                      <td className="py-3 px-3">
                        <span className="t-num text-ink">{oportunidadesCount}</span>
                      </td>
                    ),
                    correo: (
                      <td className="py-3 px-3">
                        {cli.correo ? (
                          <span className="block max-w-[220px] truncate text-ink" title={cli.correo}>{cli.correo}</span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    ),
                    telefono: (
                      <td className="py-3 px-3">
                        {cli.telefono ? <span className="t-num text-ink">{cli.telefono}</span> : <span className="text-ink-muted">—</span>}
                      </td>
                    ),
                  };

                  return (
                    <tr
                      key={cli.id}
                      onClick={() => router.push(`/clientes/${cli.id}`)}
                      className={clsx(
                        'hover:bg-surface-muted/60 transition group cursor-pointer border-b border-line-subtle',
                        isSelected ? 'bg-surface-muted/90' : ''
                      )}
                    >
                      {/* Checkbox Selección Individual */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectClient(cli.id)}
                          className="rounded cursor-pointer accent-accent"
                        />
                      </td>

                      {/* Cliente / Razón Social con AvatarBadge */}
                      <td className="py-3 px-3 font-semibold">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AvatarBadge name={cli.nombre} size="md" className="shrink-0" />
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/clientes/${cli.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[13px] font-semibold leading-tight text-ink hover:text-accent-ink hover:underline transition truncate block"
                            >
                              {cli.nombre}
                            </Link>
                            {cli.apellido_razon_social && cli.apellido_razon_social !== cli.nombre && (
                              <span className="text-xs text-ink-muted font-normal truncate block">
                                {cli.apellido_razon_social}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {colPrefs.visibleOrder.map((k) => (
                        <React.Fragment key={k}>{cells[k]}</React.Fragment>
                      ))}
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

      {/* Registrar nuevo cliente */}
      <Dialog
        open={showModal}
        title="Registrar nuevo cliente"
        size="lg"
        onClose={cerrarModalCliente}
        footer={
          <>
            <Button variant="secondary" onClick={cerrarModalCliente}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-nuevo-cliente">
              Guardar cliente
            </Button>
          </>
        }
      >
        <div className="space-y-4">
            {duplicateError && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-3 rounded-md text-xs flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                <span>{duplicateError}</span>
              </div>
            )}

            <form id="form-nuevo-cliente" onSubmit={handleCreateCliente} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">Nicho de mercado *</label>
                  {!showAddNichoInput ? (
                    <div className="flex gap-1.5">
                      <Select
                        value={nichoSeleccionado}
                        onChange={(e) => setNichoSeleccionado(e.target.value)}
                        className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent font-medium text-xs"
                      >
                        {nichos.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </Select>
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
                  <Select
                    value={tipoVentaSeleccionado}
                    onChange={(e) => setTipoVentaSeleccionado(e.target.value)}
                    className="w-full bg-surface border border-line rounded-md px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent font-medium text-xs"
                  >
                    {tiposVenta.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">Ejecutivo</label>
                  <Select
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
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">RUT empresa / persona (opcional)</label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <input
                        type="text"
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
            </form>
        </div>
      </Dialog>

      {/* Barra de Acciones Masivas Flotante (Twenty CRM Style) */}
      <FloatingActionBar
        selectedCount={selectedClientIds.length}
        onClearSelection={() => setSelectedClientIds([])}
        itemLabel="clientes"
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDeleteSelected}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar ({selectedClientIds.length})</span>
        </Button>
      </FloatingActionBar>
    </div>
  );
}
