'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import {
  Abono,
  CuentaBancaria,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '../../lib/types';
import {
  DollarSign,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  FileText,
  AlertCircle,
  Eye,
  Landmark,
  Check,
  X,
  Search,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../lib/context/AuthContext';
import { Pagination } from '../../components/Pagination';
import { mensajeError } from '../../lib/errores';

export default function CajaPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // Tabs
  const [activeTab, setActiveTab] = useState<'validacion' | 'movimientos'>('validacion');

  // Estados principales
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  // Mensajes de feedback
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Mapeo de banco seleccionado por abono pendiente: { [abonoId]: cuentaBancariaId }
  const [selectedBanks, setSelectedBanks] = useState<Record<string, string>>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal Rechazo
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [abonoToReject, setAbonoToReject] = useState<Abono | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState('');

  // Modal Registrar Movimiento Manual
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [tipo, setTipo] = useState<TipoMovimientoCaja>('ingreso');
  const [monto, setMonto] = useState<number>(100000);
  const [categoria, setCategoria] = useState('Venta Directa');
  const [descripcion, setDescripcion] = useState('');
  const [modalCuentaId, setModalCuentaId] = useState<string>('');

  // Filtros de validación
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstadoAbono, setFiltroEstadoAbono] = useState<'todos' | 'pendiente' | 'validado' | 'rechazado'>('pendiente');

  // Paginación para movimientos
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Paginación para historial de abonos
  const [abonosPage, setAbonosPage] = useState(1);
  const [abonosPerPage, setAbonosPerPage] = useState(10);

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Cuentas bancarias activas
      const { data: cuentasData } = await supabase
        .from('cuentas_bancarias')
        .select('*, empresa:empresas(*)')
        .eq('activo', true)
        .order('alias');

      if (cuentasData) {
        setCuentas(cuentasData as CuentaBancaria[]);
      }

      // 2. Movimientos de caja
      const { data: movsData } = await supabase
        .from('caja_movimientos')
        .select('*, cuenta_bancaria:cuentas_bancarias(id, alias, banco, empresa:empresas(slug, razon_social))')
        .order('fecha', { ascending: false });

      if (movsData) {
        setMovimientos(movsData as MovimientoCaja[]);
      }

      // 3. Abonos
      const { data: abonosData, error: abonosErr } = await supabase
        .from('abonos')
        .select(`
          *,
          cuenta_bancaria:cuentas_bancarias(id, alias, banco),
          oportunidad:oportunidades(
            id,
            codigo,
            titulo,
            cliente:clientes(id, nombre, apellido_razon_social, rut)
          )
        `)
        .order('fecha', { ascending: false });

      if (abonosErr) {
        console.error('Error cargando abonos:', abonosErr);
      } else if (abonosData) {
        setAbonos(abonosData as Abono[]);
      }
    } catch (err) {
      console.error('Error cargando datos de caja:', err);
      setErrorMsg('No se pudieron cargar los datos de caja.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();

    // Suscripción Realtime para abonos y movimientos
    const channel = supabase
      .channel('caja_full_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caja_movimientos' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'abonos' }, () => void loadData())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadData, supabase]);

  // Asignar banco por defecto a abonos pendientes cuando se cargan las cuentas
  useEffect(() => {
    if (cuentas.length > 0 && abonos.length > 0) {
      setSelectedBanks((prev) => {
        const next = { ...prev };
        abonos.forEach((ab) => {
          if (!next[ab.id]) {
            next[ab.id] = ab.cuenta_bancaria_id || cuentas[0].id;
          }
        });
        return next;
      });
    }
  }, [cuentas, abonos]);

  // Cálculos de KPIs
  const totalIngresos = movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const totalEgresos = movimientos
    .filter((m) => m.tipo === 'egreso')
    .reduce((acc, m) => acc + Number(m.monto || 0), 0);

  const flujoNeto = totalIngresos - totalEgresos;

  const abonosPendientes = abonos.filter((a) => a.estado === 'pendiente');
  const totalMontoPendiente = abonosPendientes.reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const abonosValidados = abonos.filter((a) => a.estado === 'validado');
  const totalMontoValidado = abonosValidados.reduce((acc, a) => acc + Number(a.monto || 0), 0);

  // Apertura de comprobante seguro
  const handleVerComprobante = async (storedUrl?: string | null) => {
    if (!storedUrl) {
      setErrorMsg('El abono no tiene comprobante adjunto.');
      return;
    }

    const publicMarker = '/storage/v1/object/public/documentos/';
    const privateMarker = '/storage/v1/object/sign/documentos/';
    const marker = storedUrl.includes(publicMarker) ? publicMarker : privateMarker;
    const path = storedUrl.includes(marker)
      ? decodeURIComponent(storedUrl.split(marker)[1].split('?')[0])
      : storedUrl;

    if (!path || /^https?:/i.test(path)) {
      window.open(storedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 120);
      if (error || !data?.signedUrl) {
        throw new Error(mensajeError(error, 'No se pudo generar el enlace seguro al comprobante.'));
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al abrir comprobante');
    }
  };

  // Validar Abono (Aprobación en 1 clic)
  const handleValidarAbono = async (abonoId: string) => {
    const cuentaId = selectedBanks[abonoId] || cuentas[0]?.id;
    if (!cuentaId) {
      setErrorMsg('Debes seleccionar una cuenta bancaria a la que ingresó el pago.');
      return;
    }

    setActionLoadingId(abonoId);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data, error } = await supabase.rpc('validar_abono', {
        p_abono_id: abonoId,
        p_cuenta_bancaria_id: cuentaId,
      });

      if (error) throw error;

      setSuccessMsg(`¡Pago validado exitosamente! Se registró el ingreso en Caja (${data?.cuenta_bancaria_alias || 'Banco'}).`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: unknown) {
      console.error('Error al validar abono:', err);
      setErrorMsg(mensajeError(err, 'No se pudo validar el abono. Verifica tus permisos.'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Abrir modal de rechazo
  const handleOpenRejectModal = (abono: Abono) => {
    setAbonoToReject(abono);
    setRejectMotivo('');
    setRejectModalOpen(true);
  };

  // Confirmar rechazo de abono
  const handleConfirmReject = async () => {
    if (!abonoToReject) return;
    if (!rejectMotivo.trim()) {
      setErrorMsg('Debes ingresar el motivo del rechazo para informar a la vendedora.');
      return;
    }

    setActionLoadingId(abonoToReject.id);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.rpc('rechazar_abono', {
        p_abono_id: abonoToReject.id,
        p_motivo: rejectMotivo.trim(),
      });

      if (error) throw error;

      setSuccessMsg(`Abono rechazado. Se notificó el motivo a la vendedora.`);
      setRejectModalOpen(false);
      setAbonoToReject(null);
      setRejectMotivo('');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: unknown) {
      console.error('Error al rechazar abono:', err);
      setErrorMsg(mensajeError(err, 'No se pudo rechazar el abono.'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Registrar Movimiento Manual
  const handleAddMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || !categoria) return;

    const newMovPayload = {
      tipo,
      monto: Number(monto),
      categoria,
      descripcion: descripcion || categoria,
      usuario_id: currentUser?.id || null,
      cuenta_bancaria_id: modalCuentaId || null,
      fecha: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from('caja_movimientos')
        .insert([newMovPayload]);

      if (error) throw error;

      setSuccessMsg('Movimiento de caja registrado exitosamente.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setShowModal(false);
      setMonto(100000);
      setDescripcion('');
      setModalCuentaId('');
      await loadData();
    } catch (err) {
      console.error('Error adding movimiento to Supabase:', err);
      setFormError('No se pudo guardar el movimiento. Verifica los datos y tus permisos.');
    }
  };

  // Filtrado de abonos
  const filteredAbonos = abonos.filter((a) => {
    if (filtroEstadoAbono !== 'todos' && a.estado !== filtroEstadoAbono) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCodigo = a.oportunidad?.codigo?.toLowerCase().includes(term);
      const matchTitulo = a.oportunidad?.titulo?.toLowerCase().includes(term);
      const clienteNombre = a.oportunidad?.cliente
        ? `${a.oportunidad.cliente.nombre || ''} ${a.oportunidad.cliente.apellido_razon_social || ''}`.trim()
        : '';
      const matchCliente =
        clienteNombre.toLowerCase().includes(term) ||
        (a.oportunidad?.cliente?.nombre_completo?.toLowerCase().includes(term) ?? false) ||
        (a.oportunidad?.cliente?.razon_social?.toLowerCase().includes(term) ?? false);
      const matchVendedora = a.creado_por_nombre?.toLowerCase().includes(term);
      const matchNota = a.nota?.toLowerCase().includes(term);
      return matchCodigo || matchTitulo || matchCliente || matchVendedora || matchNota;
    }
    return true;
  });

  // Paginación abonos
  const paginatedAbonos = filteredAbonos.slice(
    (abonosPage - 1) * abonosPerPage,
    abonosPage * abonosPerPage
  );

  // Paginación movimientos
  const paginatedMovimientos = movimientos.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="hg-page space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e5e7e4] pb-5">
        <div>
          <p className="hg-overline">Finanzas / Tesorería</p>
          <h1 className="text-2xl font-extrabold text-[#252b2d] flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-[#f97316]" />
            <span>Caja & Validación de Pagos</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Valida los comprobantes de ventas ingresándolos directamente al banco respectivo y controla el flujo de caja diario.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadData()}
            title="Recargar datos"
            className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-md text-gray-600 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {(currentUser?.rol === 'admin' || currentUser?.rol === 'finanzas') && (
            <Link
              href="/caja/configuracion"
              className="hg-button-secondary flex items-center gap-1.5 text-xs font-bold"
            >
              <Building className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Bancos & Empresas</span>
            </Link>
          )}

          <Link href="/reportes" className="hg-button-secondary">
            Ver reportes
          </Link>

          <button
            onClick={() => setShowModal(true)}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-semibold text-xs px-4 py-2 rounded-md shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Movimiento</span>
          </button>
        </div>
      </div>

      {/* Alertas globales */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selector de Pestañas Principales */}
      <div className="flex border-b border-gray-200 gap-2">
        <button
          onClick={() => setActiveTab('validacion')}
          className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'validacion'
              ? 'border-[#f97316] text-[#f97316]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Validación de Pagos</span>
          {abonosPendientes.length > 0 && (
            <span className="bg-[#f97316] text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
              {abonosPendientes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('movimientos')}
          className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'movimientos'
              ? 'border-[#f97316] text-[#f97316]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>Movimientos de Caja ({movimientos.length})</span>
        </button>
      </div>

      {/* PESTAÑA 1: VALIDACIÓN DE PAGOS */}
      {activeTab === 'validacion' && (
        <div className="space-y-5">
          {/* Tarjetas resumen de validación */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-amber-50/60 p-4 rounded-lg border border-amber-200">
              <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Pagos Pendientes de Validar</span>
              </span>
              <p className="text-2xl font-black text-amber-900 mt-2">
                ${totalMontoPendiente.toLocaleString('es-CL')}
              </p>
              <span className="text-[11px] text-amber-700 font-medium">
                {abonosPendientes.length} comprobante(s) subido(s) por el equipo
              </span>
            </div>

            <div className="bg-emerald-50/60 p-4 rounded-lg border border-emerald-200">
              <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Pagos Validados en Caja</span>
              </span>
              <p className="text-2xl font-black text-emerald-900 mt-2">
                ${totalMontoValidado.toLocaleString('es-CL')}
              </p>
              <span className="text-[11px] text-emerald-700 font-medium">
                {abonosValidados.length} comprobante(s) ingresado(s) a bancos
              </span>
            </div>

            <div className="bg-white p-4 rounded-lg border border-[#e5e7e4]">
              <span className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-gray-500" />
                <span>Cuentas Bancarias Operativas</span>
              </span>
              <p className="text-2xl font-black text-[#252b2d] mt-2">{cuentas.length}</p>
              <span className="text-[11px] text-gray-500 font-medium">
                Santander, Scotiabank, Mercado Pago, Caja Chica, etc.
              </span>
            </div>
          </div>

          {/* Filtros y Búsqueda */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-[#e5e7e4]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por Nota de Venta (NV), cliente o vendedora..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setAbonosPage(1);
                }}
                className="w-full bg-[#f4f5f3] pl-9 pr-3 py-1.5 rounded-md text-xs border border-transparent focus:border-[#f97316] focus:bg-white transition"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Estado:</span>
              <select
                value={filtroEstadoAbono}
                onChange={(e) => {
                  setFiltroEstadoAbono(e.target.value as any);
                  setAbonosPage(1);
                }}
                className="bg-[#f4f5f3] border border-[#e5e7e4] rounded-md px-3 py-1.5 text-xs text-[#252b2d] font-semibold"
              >
                <option value="pendiente">Pendientes ({abonosPendientes.length})</option>
                <option value="validado">Validados ({abonosValidados.length})</option>
                <option value="rechazado">Rechazados</option>
                <option value="todos">Todos los comprobantes</option>
              </select>
            </div>
          </div>

          {/* Tabla de Abonos */}
          <div className="bg-white rounded-lg border border-[#e5e7e4] overflow-hidden shadow-xs">
            <div className="p-4 border-b border-[#e5e7e4] flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#252b2d] flex items-center gap-2">
                <span>Comprobantes de Pago y Abonos</span>
                <span className="text-xs font-normal text-gray-500">
                  ({filteredAbonos.length} {filtroEstadoAbono})
                </span>
              </h2>
            </div>

            {filteredAbonos.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-gray-700">No hay comprobantes en este estado.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Cuando el equipo comercial suba un comprobante en ventas, aparecerá aquí inmediatamente.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[950px]">
                  <thead className="bg-[#f7f7f5] text-gray-500 uppercase text-[10px] tracking-normal border-b border-[#e5e7e4]">
                    <tr>
                      <th className="p-3.5">Nota de Venta / Ref</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5 text-right">Monto</th>
                      <th className="p-3.5">Fecha / Subido Por</th>
                      <th className="p-3.5">Comprobante</th>
                      <th className="p-3.5">Asignar a Banco</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eff0ee]">
                    {paginatedAbonos.map((ab) => {
                      const isPending = ab.estado === 'pendiente';
                      const isActing = actionLoadingId === ab.id;

                      return (
                        <tr key={ab.id} className="hover:bg-[#fbfbfa] transition">
                          {/* Nota de Venta */}
                          <td className="p-3.5">
                            <div className="font-bold text-[#213343]">
                              {ab.oportunidad?.codigo || 'NV-S/C'}
                            </div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[180px]">
                              {ab.oportunidad?.titulo || 'Venta'}
                            </div>
                            {ab.nota && (
                              <div className="text-[10px] text-gray-400 italic mt-0.5">
                                «{ab.nota}»
                              </div>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="p-3.5">
                            <div className="font-semibold text-gray-800">
                              {ab.oportunidad?.cliente?.apellido_razon_social ||
                                ab.oportunidad?.cliente?.nombre ||
                                ab.oportunidad?.cliente?.razon_social ||
                                ab.oportunidad?.cliente?.nombre_completo ||
                                'Cliente no especificado'}
                            </div>
                            {ab.oportunidad?.cliente?.rut && (
                              <div className="font-mono text-[10px] text-gray-400">
                                {ab.oportunidad?.cliente?.rut}
                              </div>
                            )}
                          </td>

                          {/* Monto */}
                          <td className="p-3.5 text-right font-black text-sm text-[#213343]">
                            ${Number(ab.monto || 0).toLocaleString('es-CL')}
                          </td>

                          {/* Fecha y Vendedora */}
                          <td className="p-3.5 text-gray-600">
                            <div>
                              {new Date(ab.fecha).toLocaleDateString('es-CL', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className="text-[10px] text-[#f97316] font-semibold">
                              {ab.creado_por_nombre || 'Equipo Comercial'}
                            </div>
                          </td>

                          {/* Comprobante */}
                          <td className="p-3.5">
                            {ab.comprobante_url ? (
                              <button
                                type="button"
                                onClick={() => void handleVerComprobante(ab.comprobante_url)}
                                className="inline-flex items-center gap-1.5 text-xs text-[#f97316] hover:text-[#ea580c] font-semibold border border-orange-200 bg-orange-50/60 hover:bg-orange-100/60 px-2 py-1 rounded transition"
                                title="Ver comprobante de pago"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[110px]">
                                  {ab.comprobante_nombre || 'Ver archivo'}
                                </span>
                              </button>
                            ) : (
                              <span className="text-gray-400 italic text-[11px]">Sin archivo</span>
                            )}
                          </td>

                          {/* Selector de Banco */}
                          <td className="p-3.5">
                            {isPending ? (
                              <select
                                value={selectedBanks[ab.id] || cuentas[0]?.id || ''}
                                onChange={(e) =>
                                  setSelectedBanks((prev) => ({
                                    ...prev,
                                    [ab.id]: e.target.value,
                                  }))
                                }
                                className="bg-[#f4f5f3] border border-gray-300 rounded px-2 py-1 text-xs text-[#213343] font-medium max-w-[200px]"
                              >
                                {cuentas.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.alias} ({c.banco})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="text-gray-700 font-medium flex items-center gap-1">
                                <Landmark className="w-3.5 h-3.5 text-gray-400" />
                                <span>{ab.cuenta_bancaria?.alias || 'Banco asignado'}</span>
                              </div>
                            )}
                          </td>

                          {/* Estado */}
                          <td className="p-3.5 text-center">
                            {ab.estado === 'pendiente' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3" />
                                <span>Por validar</span>
                              </span>
                            )}
                            {ab.estado === 'validado' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Validado</span>
                              </span>
                            )}
                            {ab.estado === 'rechazado' && (
                              <div className="text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                  <XCircle className="w-3 h-3" />
                                  <span>Rechazado</span>
                                </span>
                                {ab.motivo_rechazo && (
                                  <p className="text-[10px] text-red-600 mt-1 max-w-[120px] truncate" title={ab.motivo_rechazo}>
                                    «{ab.motivo_rechazo}»
                                  </p>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="p-3.5 text-right">
                            {isPending ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => void handleValidarAbono(ab.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded transition flex items-center gap-1 disabled:opacity-50"
                                  title="Validar pago e ingresar dinero a Caja"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{isActing ? 'Validando...' : 'Validar'}</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleOpenRejectModal(ab)}
                                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs px-2 py-1 rounded transition"
                                  title="Rechazar comprobante con motivo"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11px] text-gray-400">
                                {ab.validado_por_nombre && (
                                  <span>Por: {ab.validado_por_nombre}</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación de abonos */}
            <div className="p-3 border-t border-[#e5e7e4]">
              <Pagination
                currentPage={abonosPage}
                totalItems={filteredAbonos.length}
                itemsPerPage={abonosPerPage}
                onPageChange={setAbonosPage}
                onItemsPerPageChange={setAbonosPerPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: MOVIMIENTOS DE CAJA & FLUJO */}
      {activeTab === 'movimientos' && (
        <div className="space-y-5">
          {/* Tarjetas KPI de Estado de Resultados */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Total Ingresos</span>
                <div className="p-2 bg-emerald-500/10 text-emerald-700 rounded-lg">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-700 mt-3">
                ${totalIngresos.toLocaleString('es-CL')}
              </p>
              <span className="text-xs text-gray-500 font-medium">Abonos y Ventas Liquidadas</span>
            </div>

            <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Total Egresos</span>
                <div className="p-2 bg-red-500/10 text-red-700 rounded-lg">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-red-700 mt-3">
                ${totalEgresos.toLocaleString('es-CL')}
              </p>
              <span className="text-xs text-gray-500 font-medium">Pagos Proveedores y Operación</span>
            </div>

            <div className="bg-white p-5 rounded-lg border border-[#e5e7e4] shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">Saldo neto de Caja</span>
                <div className="p-2 bg-[#f97316]/10 text-[#f97316] rounded-lg">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-[#252b2d] mt-3">
                ${flujoNeto.toLocaleString('es-CL')}
              </p>
              <span className="text-xs text-gray-500 font-medium">Ingresos menos egresos registrados</span>
            </div>
          </div>

          {/* Historial de Movimientos de Caja */}
          <div className="hg-list-group p-4 space-y-4">
            <h2 className="text-sm font-bold text-[#252b2d] border-b border-[#e5e7e4] pb-3">
              Historial de Movimientos de Caja ({movimientos.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="hg-list-table w-full min-w-[750px] text-left text-xs">
                <thead className="bg-[#f7f7f5] text-gray-500 uppercase text-[10px] tracking-normal border-b border-[#e5e7e4]">
                  <tr>
                    <th className="p-3.5">Fecha</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Categoría</th>
                    <th className="p-3.5">Descripción / Glosa</th>
                    <th className="p-3.5">Cuenta Bancaria</th>
                    <th className="p-3.5 text-right">Monto ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eff0ee]">
                  {paginatedMovimientos.map((m) => (
                    <tr key={m.id} className="hover:bg-[#f7f7f5] transition">
                      <td className="p-3.5 text-gray-500 font-mono">
                        {new Date(m.fecha).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            m.tipo === 'ingreso'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {m.tipo}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-[#252b2d]">{m.categoria}</td>
                      <td className="p-3.5 text-gray-600">{m.descripcion || '-'}</td>
                      <td className="p-3.5 text-gray-700">
                        {m.cuenta_bancaria?.alias ? (
                          <span className="inline-flex items-center gap-1 font-medium bg-gray-50 border border-gray-200 px-2 py-0.5 rounded text-[11px]">
                            <Landmark className="w-3 h-3 text-[#f97316]" />
                            <span>{m.cuenta_bancaria.alias}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">—</span>
                        )}
                      </td>
                      <td
                        className={`p-3.5 text-right font-black text-sm ${
                          m.tipo === 'ingreso' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toLocaleString('es-CL')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2">
              <Pagination
                currentPage={currentPage}
                totalItems={movimientos.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Rechazar Abono con Motivo */}
      {rejectModalOpen && abonoToReject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e7e4] rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-red-600 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                <span>Rechazar Comprobante de Pago</span>
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-red-50 p-3 rounded border border-red-200 space-y-1">
              <p className="font-bold text-red-900">
                Abono de ${Number(abonoToReject.monto || 0).toLocaleString('es-CL')}
              </p>
              <p className="text-red-700">
                {abonoToReject.oportunidad?.codigo} — {abonoToReject.oportunidad?.titulo}
              </p>
              <p className="text-[11px] text-red-600">
                Subido por: {abonoToReject.creado_por_nombre || 'Equipo Comercial'}
              </p>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-1">
                Motivo del Rechazo *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Ej: El comprobante no coincide con la cartola / Faltan datos de la transferencia..."
                value={rejectMotivo}
                onChange={(e) => setRejectMotivo(e.target.value)}
                className="w-full bg-[#f4f5f3] border border-gray-300 rounded-md p-2.5 text-xs text-[#252b2d] focus:bg-white focus:border-red-500 focus:outline-none"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Este mensaje se enviará como notificación a la vendedora para que suba el comprobante correcto.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReject()}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Movimiento Manual */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-[#e5e7e4] rounded-lg max-w-md w-full p-6 space-y-4 shadow-sm text-xs">
            <h3 className="text-base font-bold text-[#252b2d]">Registrar Movimiento de Caja</h3>
            {formError && (
              <p role="alert" className="rounded-lg bg-red-50 p-2 text-red-700 font-semibold">
                {formError}
              </p>
            )}
            <form onSubmit={handleAddMovimiento} className="space-y-3">
              <div>
                <label className="block text-gray-600 mb-1">Tipo de Movimiento</label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoMovimientoCaja)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                >
                  <option value="ingreso">Ingreso (Abono / Cobro Venta)</option>
                  <option value="egreso">Egreso (Pago Proveedor / Gasto Operativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Monto ($) *</label>
                <input
                  type="number"
                  required
                  value={monto}
                  onChange={(e) => setMonto(Number(e.target.value))}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Cuenta Bancaria / Destino</label>
                <select
                  value={modalCuentaId}
                  onChange={(e) => setModalCuentaId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                >
                  <option value="">(Sin asignar o Caja Efectivo)</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.alias} ({c.banco})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Categoría *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Abono 50% / Materia Prima / Flete"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Descripción / Glosa</label>
                <textarea
                  rows={2}
                  placeholder="Detalle o respaldo del movimiento..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-[#e5e7e4] rounded-md p-2.5 text-[#252b2d]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-[#f4f5f3] text-gray-600 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#f97316] text-white font-bold rounded-md"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
