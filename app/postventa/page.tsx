'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileCheck,
  FileText,
  Filter,
  HardHat,
  Kanban,
  LifeBuoy,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Table as TableIcon,
  Trash2,
  Truck,
  Upload,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type {
  AntecedentesVentaPostventa,
  CasoPostventa,
  CausaRaizPostventa,
  Cliente,
  CostoPostventa,
  EstadoPostventa,
  EvidenciaPostventa,
  OportunidadVenta,
  ProductoCatalogo,
  ResolucionPostventa,
  TipoCostoPostventa,
  TipoEvidenciaPostventa,
  TipoProblemaPostventa,
  Trabajador,
  Usuario,
} from '../../lib/types';
import { useAuth } from '../../lib/context/AuthContext';
import { mensajeError } from '../../lib/errores';

const ESTADOS_MAP: Record<EstadoPostventa, { label: string; color: string; bg: string; border: string }> = {
  recibido: { label: 'Recibido', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  en_revision: { label: 'En Revisión', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  visita_programada: { label: 'Visita Programada', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  reparacion_programada: { label: 'Reparación Programada', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  cerrado: { label: 'Cerrado', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  abierto: { label: 'Abierto', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  programado: { label: 'Programado', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  en_curso: { label: 'En Curso', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  resuelto: { label: 'Resuelto', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  cancelado: { label: 'Cancelado', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' },
};

const CAUSAS_RAIZ: CausaRaizPostventa[] = [
  'Fabricacion',
  'Instalacion',
  'Despacho',
  'Terreno',
  'Cliente',
  'Proveedor',
  'Transportista',
  'Sin determinar',
];

const RESOLUCIONES_MAP: Record<ResolucionPostventa, { label: string; desc: string }> = {
  garantia: { label: 'Garantía Total', desc: 'Reparación o reposición sin costo para el cliente' },
  responsabilidad_parcial: { label: 'Responsabilidad Parcial', desc: 'Acuerdo comercial compartido con el cliente' },
  no_garantia: { label: 'No Corresponde Garantía', desc: 'Generar cotización por costo de reparación' },
  transportista: { label: 'Transportista Externo', desc: 'Derivar cobro o responsabilidad al transportista' },
  en_evaluacion: { label: 'En Evaluación', desc: 'Pendiente de diagnóstico técnico definitivo' },
};

export default function PostventaPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [casos, setCasos] = useState<CasoPostventa[]>([]);
  const [oportunidades, setOportunidades] = useState<OportunidadVenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);

  // Vista activa
  const [vista, setVista] = useState<'tabla' | 'kanban' | 'metricas'>('tabla');

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroCausa, setFiltroCausa] = useState<string>('todas');
  const [filtroResolucion, setFiltroResolucion] = useState<string>('todas');
  const [filtroCuadrilla, setFiltroCuadrilla] = useState<string>('todas');

  // Estados UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modales
  const [showNuevoModal, setShowNuevoModal] = useState(false);
  const [selectedCaso, setSelectedCaso] = useState<CasoPostventa | null>(null);
  const [activeTabFicha, setActiveTabFicha] = useState<'general' | 'diagnostico' | 'costos' | 'evidencias' | 'garantia'>('general');

  // Formulario nuevo caso
  const [nuevoForm, setNuevoForm] = useState({
    oportunidad_id: '',
    cliente_id: '',
    obra: '',
    producto_id: '',
    producto_texto: '',
    tipo: 'problema_instalacion' as TipoProblemaPostventa,
    descripcion: '',
    cuadrilla_id: '',
    vendedor_id: '',
    causa_raiz: 'Sin determinar' as CausaRaizPostventa,
    resolucion: 'en_evaluacion' as ResolucionPostventa,
    fecha_reclamo: new Date().toISOString().split('T')[0],
    fecha_compromiso: '',
  });

  // Formulario nuevo costo
  const [nuevoCosto, setNuevoCosto] = useState({
    tipo_costo: 'materiales' as TipoCostoPostventa,
    descripcion: '',
    monto: '',
    proveedor_o_maestro: '',
    fecha: new Date().toISOString().split('T')[0],
  });

  // Formulario nueva evidencia
  const [nuevaEvidencia, setNuevaEvidencia] = useState({
    tipo_evidencia: 'despues' as TipoEvidenciaPostventa,
    archivo_url: '',
    nombre_archivo: '',
    descripcion: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: casosData, error: casosErr },
      { data: opsData },
      { data: clientesData },
      { data: trabData },
      { data: usrsData },
      { data: prodsData },
    ] = await Promise.all([
      supabase
        .from('postventa_casos')
        .select(`
          *,
          oportunidad:oportunidades(id, codigo, titulo, cliente_id, asignado_a),
          cliente:clientes(id, nombre, apellido_razon_social, rut, telefono, correo),
          vendedor:usuarios!postventa_casos_vendedor_id_fkey(id, nombre, email),
          cuadrilla:trabajadores(id, nombre, cargo, area),
          producto:catalogo_productos(id, codigo, nombre, unidad),
          evidencias:postventa_evidencias(*),
          costos:postventa_costos(*)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('oportunidades').select('id, codigo, titulo, cliente_id, asignado_a').order('codigo'),
      supabase.from('clientes').select('id, nombre, apellido_razon_social, rut, telefono, correo').order('nombre'),
      supabase.from('trabajadores').select('*').order('nombre'),
      supabase.from('usuarios').select('id, nombre, email, rol').order('nombre'),
      supabase.from('catalogo_productos').select('id, codigo, nombre, unidad').order('nombre'),
    ]);

    if (casosErr) {
      setError(mensajeError(casosErr));
    } else {
      const data = (casosData || []) as unknown as CasoPostventa[];
      setCasos(data);
      setSelectedCaso((prev) => (prev ? data.find((c) => c.id === prev.id) || prev : null));
      setError('');
    }

    if (opsData) setOportunidades(opsData as OportunidadVenta[]);
    if (clientesData) setClientes(clientesData as Cliente[]);
    if (trabData) setTrabajadores(trabData as Trabajador[]);
    if (usrsData) setUsuarios(usrsData as Usuario[]);
    if (prodsData) setProductos(prodsData as ProductoCatalogo[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filtrado
  const casosFiltrados = useMemo(() => {
    return casos.filter((c) => {
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const clienteNom = c.cliente?.apellido_razon_social || c.cliente?.nombre || '';
        const match =
          c.folio?.toLowerCase().includes(q) ||
          c.descripcion?.toLowerCase().includes(q) ||
          c.obra?.toLowerCase().includes(q) ||
          c.oportunidad?.codigo?.toLowerCase().includes(q) ||
          clienteNom.toLowerCase().includes(q) ||
          (c.producto_texto && c.producto_texto.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
      if (filtroCausa !== 'todas' && c.causa_raiz !== filtroCausa) return false;
      if (filtroResolucion !== 'todas' && c.resolucion !== filtroResolucion) return false;
      if (filtroCuadrilla !== 'todas' && c.cuadrilla_id !== filtroCuadrilla) return false;

      return true;
    });
  }, [casos, busqueda, filtroEstado, filtroCausa, filtroResolucion, filtroCuadrilla]);

  // KPIs
  const stats = useMemo(() => {
    const total = casos.length;
    const abiertos = casos.filter((c) => !['cerrado', 'resuelto', 'cancelado'].includes(c.estado)).length;
    const cerrados = casos.filter((c) => ['cerrado', 'resuelto'].includes(c.estado)).length;
    const costoTotal = casos.reduce((acc, c) => acc + Number(c.costo_total || 0), 0);
    const garantias = casos.filter((c) => c.resolucion === 'garantia').length;
    const tasaGarantia = total > 0 ? Math.round((garantias / total) * 100) : 0;

    // Conteo por causa raíz
    const causasCount: Record<string, number> = {};
    for (const c of casos) {
      const cr = c.causa_raiz || 'Sin determinar';
      causasCount[cr] = (causasCount[cr] || 0) + 1;
    }

    return { total, abiertos, cerrados, costoTotal, tasaGarantia, causasCount };
  }, [casos]);

  // Autocompletar datos cuando se selecciona oportunidad en nuevo caso
  const handleSelectOportunidad = (opId: string) => {
    const op = oportunidades.find((o) => o.id === opId);
    if (!op) {
      setNuevoForm((prev) => ({ ...prev, oportunidad_id: opId }));
      return;
    }
    setNuevoForm((prev) => ({
      ...prev,
      oportunidad_id: op.id,
      cliente_id: op.cliente_id || prev.cliente_id,
      vendedor_id: op.asignado_a || prev.vendedor_id,
      obra: op.titulo || prev.obra,
    }));
  };

  // Crear nuevo caso
  const handleCrearCaso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoForm.oportunidad_id || !nuevoForm.descripcion.trim()) {
      setError('Debes asociar una Nota de Venta (Oportunidad) y describir el reclamo.');
      return;
    }
    setError('');

    const payload = {
      oportunidad_id: nuevoForm.oportunidad_id,
      cliente_id: nuevoForm.cliente_id || null,
      vendedor_id: nuevoForm.vendedor_id || null,
      cuadrilla_id: nuevoForm.cuadrilla_id || null,
      obra: nuevoForm.obra.trim() || null,
      producto_id: nuevoForm.producto_id || null,
      producto_texto: nuevoForm.producto_texto.trim() || null,
      tipo: nuevoForm.tipo,
      descripcion: nuevoForm.descripcion.trim(),
      causa_raiz: nuevoForm.causa_raiz,
      resolucion: nuevoForm.resolucion,
      fecha_reclamo: nuevoForm.fecha_reclamo || new Date().toISOString().split('T')[0],
      fecha_compromiso: nuevoForm.fecha_compromiso || null,
      estado: 'recibido',
      antecedentes_venta: {
        cotizado_verificado: false,
        contratado_verificado: false,
        entregado_verificado: false,
        condiciones_terreno: '',
        observaciones_instalacion: '',
        guia_recepcion_verificada: false,
        pagos_al_dia: false,
      },
    };

    const { data: nuevo, error: errInsert } = await supabase
      .from('postventa_casos')
      .insert(payload)
      .select()
      .single();

    if (errInsert) {
      setError(mensajeError(errInsert));
    } else {
      setSuccessMsg(`Caso creado con éxito con folio ${nuevo.folio}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setShowNuevoModal(false);
      await loadData();
    }
  };

  // Actualizar checklist de antecedentes
  const handleUpdateAntecedentes = async (campo: keyof AntecedentesVentaPostventa, valor: unknown) => {
    if (!selectedCaso) return;
    const ant = {
      ...(selectedCaso.antecedentes_venta || {
        cotizado_verificado: false,
        contratado_verificado: false,
        entregado_verificado: false,
      }),
      [campo]: valor,
    };

    // Actualización optimista inmediata
    setSelectedCaso((prev) => (prev ? { ...prev, antecedentes_venta: ant } : null));
    setCasos((prev) => prev.map((c) => (c.id === selectedCaso.id ? { ...c, antecedentes_venta: ant } : c)));

    const { error: errUpd } = await supabase
      .from('postventa_casos')
      .update({ antecedentes_venta: ant })
      .eq('id', selectedCaso.id);

    if (errUpd) {
      setError(mensajeError(errUpd));
      await loadData();
    }
  };

  // Actualizar diagnóstico / causa raíz / resolución
  const handleUpdateDiagnostico = async (updates: Partial<CasoPostventa>) => {
    if (!selectedCaso) return;

    // Actualización optimista inmediata
    setSelectedCaso((prev) => (prev ? { ...prev, ...updates } : null));
    setCasos((prev) => prev.map((c) => (c.id === selectedCaso.id ? { ...c, ...updates } : c)));

    const { error: errUpd } = await supabase
      .from('postventa_casos')
      .update(updates)
      .eq('id', selectedCaso.id);

    if (errUpd) {
      setError(mensajeError(errUpd));
      await loadData();
    } else {
      setSuccessMsg('Diagnóstico y resolución actualizados.');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  // Agregar costo
  const handleAgregarCosto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaso || !nuevoCosto.descripcion.trim() || !nuevoCosto.monto) return;
    const montoNum = Number(nuevoCosto.monto);
    if (montoNum < 0) return;

    const { error: errIns } = await supabase.from('postventa_costos').insert({
      caso_id: selectedCaso.id,
      tipo_costo: nuevoCosto.tipo_costo,
      descripcion: nuevoCosto.descripcion.trim(),
      monto: montoNum,
      proveedor_o_maestro: nuevoCosto.proveedor_o_maestro.trim() || null,
      fecha: nuevoCosto.fecha,
    });

    if (errIns) {
      setError(mensajeError(errIns));
    } else {
      setNuevoCosto({
        tipo_costo: 'materiales',
        descripcion: '',
        monto: '',
        proveedor_o_maestro: '',
        fecha: new Date().toISOString().split('T')[0],
      });
      setSuccessMsg('Costo registrado y sincronizado en el total de la Nota de Venta.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    }
  };

  // Eliminar costo
  const handleEliminarCosto = async (costoId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este costo imputado?')) return;
    const { error: errDel } = await supabase.from('postventa_costos').delete().eq('id', costoId);
    if (errDel) setError(mensajeError(errDel));
    else await loadData();
  };

  // Agregar evidencia
  const handleAgregarEvidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaso || !nuevaEvidencia.archivo_url.trim()) return;

    const { error: errIns } = await supabase.from('postventa_evidencias').insert({
      caso_id: selectedCaso.id,
      tipo_evidencia: nuevaEvidencia.tipo_evidencia,
      archivo_url: nuevaEvidencia.archivo_url.trim(),
      nombre_archivo: nuevaEvidencia.nombre_archivo.trim() || 'Evidencia fotográfica',
      descripcion: nuevaEvidencia.descripcion.trim() || null,
      usuario_id: currentUser?.id || null,
    });

    if (errIns) {
      setError(mensajeError(errIns));
    } else {
      setNuevaEvidencia({
        tipo_evidencia: 'despues',
        archivo_url: '',
        nombre_archivo: '',
        descripcion: '',
      });
      setSuccessMsg('Evidencia registrada con éxito.');
      setTimeout(() => setSuccessMsg(''), 3000);
      await loadData();
    }
  };

  // Validar requisitos para cierre del caso
  const validacionCierre = useMemo(() => {
    if (!selectedCaso) return { listo: false, fotos: false, conformidad: false, causa: false, costos: false };
    const fotos = (selectedCaso.evidencias || []).some((e) => ['despues', 'conformidad'].includes(e.tipo_evidencia));
    const conformidad =
      selectedCaso.conformidad_cliente ||
      (selectedCaso.evidencias || []).some((e) => e.tipo_evidencia === 'conformidad');
    const causa =
      !!selectedCaso.causa_raiz && selectedCaso.causa_raiz !== 'Sin determinar' && selectedCaso.causa_raiz.trim() !== '';
    const costos =
      Number(selectedCaso.costo_total || 0) > 0 || (selectedCaso.costos && selectedCaso.costos.length > 0);

    const listo = fotos && conformidad && causa && costos;
    return { listo, fotos, conformidad, causa, costos };
  }, [selectedCaso]);

  // Cambiar estado o Cerrar caso
  const handleCambiarEstado = async (nuevoEstado: EstadoPostventa) => {
    if (!selectedCaso) return;
    setError('');

    const payload: Partial<CasoPostventa> = {
      estado: nuevoEstado,
    };
    if (nuevoEstado === 'cerrado') {
      payload.fecha_cierre = new Date().toISOString();
      payload.cerrado_por = currentUser?.id || null;
    }

    const { error: errUpd } = await supabase
      .from('postventa_casos')
      .update(payload)
      .eq('id', selectedCaso.id);

    if (errUpd) {
      setError(mensajeError(errUpd));
    } else {
      setSuccessMsg(`Estado actualizado a "${ESTADOS_MAP[nuevoEstado]?.label || nuevoEstado}".`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    }
  };

  const inputClass =
    'block w-full rounded-md border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:border-[#f97316]';
  const labelClass = 'text-xs font-semibold text-gray-700 space-y-1 block';

  return (
    <div className="space-y-5 text-[#213343]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#f97316]" />
            <span>Módulo de Postventa, Garantías y Reclamos</span>
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            Gestión del ciclo de vida de reclamos, evaluación técnica, garantías, evidencias fotográficas e imputación de costos a la Nota de Venta (NV).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Selector de Vistas */}
          <div className="flex items-center bg-gray-100 p-1 rounded-md border border-gray-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setVista('tabla')}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition ${
                vista === 'tabla' ? 'bg-white shadow text-[#213343]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Tabla</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('kanban')}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition ${
                vista === 'kanban' ? 'bg-white shadow text-[#213343]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Tablero Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('metricas')}
              className={`px-3 py-1.5 rounded flex items-center gap-1.5 transition ${
                vista === 'metricas' ? 'bg-white shadow text-[#213343]' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 text-[#f97316]" />
              <span>Causa Raíz & KPIs</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setNuevoForm({
                oportunidad_id: '',
                cliente_id: '',
                obra: '',
                producto_id: '',
                producto_texto: '',
                tipo: 'problema_instalacion',
                descripcion: '',
                cuadrilla_id: '',
                vendedor_id: '',
                causa_raiz: 'Sin determinar',
                resolucion: 'en_evaluacion',
                fecha_reclamo: new Date().toISOString().split('T')[0],
                fecha_compromiso: '',
              });
              setShowNuevoModal(true);
            }}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white font-bold text-xs px-4 py-2.5 rounded-md shadow-sm transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Reclamo / Caso</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Total Reclamos</span>
          <span className="text-xl font-extrabold text-[#213343]">{stats.total}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">folios generados</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">Casos en Curso</span>
          <span className="text-xl font-extrabold text-amber-800">{stats.abiertos}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">visita / reparación</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">Casos Cerrados</span>
          <span className="text-xl font-extrabold text-emerald-800">{stats.cerrados}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">con conformidad</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">Costo Acumulado</span>
          <span className="text-xl font-extrabold text-purple-800">${stats.costoTotal.toLocaleString('es-CL')}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">imputado a NVs</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">Tasa de Garantía</span>
          <span className="text-xl font-extrabold text-blue-800">{stats.tasaGarantia}%</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">resolución sin costo</span>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              aria-label="Buscar casos de postventa"
              placeholder="Buscar por folio (PV-2026-0001), cliente, NV, obra o descripción..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="hg-list-search w-full pl-9 pr-3 text-sm bg-white"
            />
          </div>

          {/* Filtro Estado */}
          <div className="w-full md:w-44">
            <select
              aria-label="Filtrar por estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todos">Estado: Todos</option>
              <option value="recibido">Recibido</option>
              <option value="en_revision">En Revisión</option>
              <option value="visita_programada">Visita Programada</option>
              <option value="reparacion_programada">Reparación Programada</option>
              <option value="cerrado">Cerrado</option>
            </select>
          </div>

          {/* Filtro Causa Raíz */}
          <div className="w-full md:w-44">
            <select
              aria-label="Filtrar por causa raíz"
              value={filtroCausa}
              onChange={(e) => setFiltroCausa(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todas">Causa Raíz: Todas</option>
              {CAUSAS_RAIZ.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Resolución */}
          <div className="w-full md:w-44">
            <select
              aria-label="Filtrar por resolución"
              value={filtroResolucion}
              onChange={(e) => setFiltroResolucion(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todas">Resolución: Todas</option>
              {Object.entries(RESOLUCIONES_MAP).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Cuadrilla */}
          <div className="w-full md:w-44">
            <select
              aria-label="Filtrar por cuadrilla"
              value={filtroCuadrilla}
              onChange={(e) => setFiltroCuadrilla(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#f97316]"
            >
              <option value="todas">Cuadrilla: Todas</option>
              {trabajadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#f97316]" />
            <span>
              Mostrando <strong className="text-[#213343]">{casosFiltrados.length}</strong> de{' '}
              <strong className="text-[#213343]">{casos.length}</strong> casos registrados
            </span>
          </div>
          {(busqueda || filtroEstado !== 'todos' || filtroCausa !== 'todas' || filtroResolucion !== 'todas' || filtroCuadrilla !== 'todas') && (
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setFiltroEstado('todos');
                setFiltroCausa('todas');
                setFiltroResolucion('todas');
                setFiltroCuadrilla('todas');
              }}
              className="text-[#f97316] hover:underline font-semibold text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* VISTA 1: TABLA */}
      {vista === 'tabla' && (
        <div className="hg-list-group overflow-x-auto">
          <table className="hg-list-table w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-gray-50 text-xs">
              <tr>
                <th className="p-3">Folio</th>
                <th className="p-3">Nota de Venta / Obra</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Problema / Descripción</th>
                <th className="p-3">Causa Raíz</th>
                <th className="p-3">Resolución</th>
                <th className="p-3 text-right">Costo Total</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-center">Evidencias</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-gray-500">
                    Cargando casos de postventa...
                  </td>
                </tr>
              )}
              {!loading && casosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-sm text-gray-500">
                    {casos.length === 0
                      ? 'No hay reclamos o casos registrados. Crea uno con el botón "Nuevo Reclamo / Caso".'
                      : 'No se encontraron casos que coincidan con los filtros seleccionados.'}
                  </td>
                </tr>
              )}
              {!loading &&
                casosFiltrados.map((caso) => {
                  const estadoInfo = ESTADOS_MAP[caso.estado] || ESTADOS_MAP.recibido;
                  const clienteNom = caso.cliente?.apellido_razon_social || caso.cliente?.nombre || 'Sin cliente';
                  const tieneFinal = (caso.evidencias || []).some((e) => ['despues', 'conformidad'].includes(e.tipo_evidencia));

                  return (
                    <tr
                      key={caso.id}
                      onClick={() => setSelectedCaso(caso)}
                      className="border-t hover:bg-orange-50/30 transition cursor-pointer"
                    >
                      {/* Folio */}
                      <td className="p-3">
                        <span className="font-mono text-xs font-extrabold text-[#f97316]">{caso.folio}</span>
                        <span className="block text-[10px] text-gray-400">
                          {caso.fecha_reclamo || caso.created_at.split('T')[0]}
                        </span>
                      </td>

                      {/* NV / Obra */}
                      <td className="p-3">
                        <div className="font-bold text-xs text-[#213343]">
                          {caso.oportunidad?.codigo || 'NV pendiente'}
                        </div>
                        <div className="text-[11px] text-gray-500 line-clamp-1">{caso.obra || caso.oportunidad?.titulo || '-'}</div>
                      </td>

                      {/* Cliente */}
                      <td className="p-3 text-xs">
                        <div className="font-semibold text-gray-800">{clienteNom}</div>
                        {caso.cliente?.telefono && (
                          <div className="text-[10px] text-gray-400">{caso.cliente.telefono}</div>
                        )}
                      </td>

                      {/* Problema */}
                      <td className="p-3 text-xs max-w-xs">
                        <div className="font-medium text-gray-900 line-clamp-1">{caso.descripcion}</div>
                        <div className="text-[10px] text-gray-400 capitalize">
                          {caso.tipo?.replaceAll('_', ' ')}
                        </div>
                      </td>

                      {/* Causa Raíz */}
                      <td className="p-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                            caso.causa_raiz && caso.causa_raiz !== 'Sin determinar'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-gray-100 text-gray-500 border-gray-200'
                          }`}
                        >
                          {caso.causa_raiz || 'Sin determinar'}
                        </span>
                      </td>

                      {/* Resolución */}
                      <td className="p-3 text-xs">
                        {caso.resolucion ? (
                          <span className="font-semibold text-gray-700">
                            {RESOLUCIONES_MAP[caso.resolucion]?.label || caso.resolucion}
                          </span>
                        ) : (
                          <span className="text-gray-400">Pendiente</span>
                        )}
                      </td>

                      {/* Costo Total */}
                      <td className="p-3 text-right font-mono text-xs font-bold text-[#213343]">
                        ${Number(caso.costo_total || 0).toLocaleString('es-CL')}
                        <span className="block text-[9px] text-gray-400 font-sans font-normal">
                          {(caso.costos || []).length} costos
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${estadoInfo.bg} ${estadoInfo.color} ${estadoInfo.border}`}
                        >
                          {estadoInfo.label}
                        </span>
                      </td>

                      {/* Evidencias */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-[11px]">
                          <Camera className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-bold">{caso.evidencias?.length || 0}</span>
                          {tieneFinal && (
                            <span title="Fotos finales registradas">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCaso(caso);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-gray-100 hover:bg-[#f97316] text-gray-700 hover:text-white px-2.5 py-1 text-xs font-bold transition"
                        >
                          <span>Ficha</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA 2: TABLERO KANBAN */}
      {vista === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-4">
          {(['recibido', 'en_revision', 'visita_programada', 'reparacion_programada', 'cerrado'] as EstadoPostventa[]).map((est) => {
            const conf = ESTADOS_MAP[est];
            const tarjetas = casosFiltrados.filter((c) => {
              if (est === 'recibido') return ['recibido', 'abierto'].includes(c.estado);
              if (est === 'en_revision') return ['en_revision', 'en_curso'].includes(c.estado);
              if (est === 'visita_programada') return ['visita_programada', 'programado'].includes(c.estado);
              if (est === 'reparacion_programada') return c.estado === 'reparacion_programada';
              if (est === 'cerrado') return ['cerrado', 'resuelto'].includes(c.estado);
              return c.estado === est;
            });

            return (
              <div key={est} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex flex-col min-h-[500px]">
                <div className={`flex items-center justify-between pb-2 border-b border-gray-200 mb-2`}>
                  <span className={`text-xs font-extrabold ${conf.color}`}>{conf.label}</span>
                  <span className="text-[11px] font-bold bg-white px-2 py-0.5 rounded-full border text-gray-600">
                    {tarjetas.length}
                  </span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {tarjetas.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCaso(c)}
                      className="bg-white border border-gray-200 hover:border-[#f97316] rounded-md p-2.5 shadow-sm cursor-pointer transition space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#f97316]">{c.folio}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{c.oportunidad?.codigo}</span>
                      </div>
                      <div className="text-xs font-bold text-gray-800 line-clamp-2">{c.descripcion}</div>
                      <div className="text-[11px] text-gray-500">
                        {c.cliente?.apellido_razon_social || c.cliente?.nombre || 'Cliente'}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[10px]">
                        <span className="font-bold text-gray-600">
                          ${Number(c.costo_total || 0).toLocaleString('es-CL')}
                        </span>
                        <span className="text-gray-400">{c.causa_raiz || 'Sin causa'}</span>
                      </div>
                    </div>
                  ))}
                  {tarjetas.length === 0 && (
                    <div className="text-center py-8 text-xs text-gray-400">Sin casos en esta etapa</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA 3: MÉTRICAS Y CAUSA RAÍZ */}
      {vista === 'metricas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Distribución por Causa Raíz */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#213343] flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#f97316]" />
                  <span>Distribución por Causa Raíz (Fallas)</span>
                </h3>
                <span className="text-xs text-gray-500">{stats.total} reclamos analizados</span>
              </div>
              <p className="text-xs text-gray-500">
                Permite detectar fugas operacionales y evaluar si las fallas provienen de Fabricación, Instalación, Despacho, etc.
              </p>

              <div className="space-y-3 pt-2">
                {CAUSAS_RAIZ.map((causa) => {
                  const count = stats.causasCount[causa] || 0;
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

                  return (
                    <div key={causa} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-700">{causa}</span>
                        <span className="text-[#213343]">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${
                            causa === 'Fabricacion'
                              ? 'bg-red-500'
                              : causa === 'Instalacion'
                              ? 'bg-amber-500'
                              : causa === 'Despacho'
                              ? 'bg-blue-500'
                              : 'bg-purple-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Impacto por Cuadrilla / Maestro */}
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#213343] flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-[#f97316]" />
                  <span>Reclamos por Cuadrilla / Maestro</span>
                </h3>
                <span className="text-xs text-gray-500">Trazabilidad operativa</span>
              </div>
              <p className="text-xs text-gray-500">
                Identifica qué cuadrillas de obra concentran más observaciones o reparaciones técnicas.
              </p>

              <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                {trabajadores
                  .filter((t) => t.area?.includes('Operaciones') || t.area?.includes('Taller') || t.cargo?.includes('Maestro') || t.cargo?.includes('Instalación'))
                  .map((t) => {
                    const casosDeTrabajador = casos.filter((c) => c.cuadrilla_id === t.id);
                    const costoTrabajador = casosDeTrabajador.reduce((acc, c) => acc + Number(c.costo_total || 0), 0);

                    return (
                      <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-gray-800">{t.nombre}</div>
                          <div className="text-[10px] text-gray-400">{t.cargo}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-[#213343]">{casosDeTrabajador.length} casos</span>
                          <span className="block text-[10px] text-gray-500 font-mono">
                            ${costoTrabajador.toLocaleString('es-CL')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NUEVO RECLAMO / CASO */}
      {showNuevoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="nuevo-caso-title"
            className="bg-white border border-gray-200 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 id="nuevo-caso-title" className="text-lg font-extrabold flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#f97316]" />
                <span>Recepción de Reclamo / Nueva Postventa</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNuevoModal(false)}
                aria-label="Cerrar modal"
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </p>
            )}

            <form onSubmit={handleCrearCaso} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Nota de Venta (Oportunidad) */}
                <label className={`${labelClass} sm:col-span-2`}>
                  <span>Nota de Venta / Oportunidad (NV) *</span>
                  <select
                    required
                    value={nuevoForm.oportunidad_id}
                    onChange={(e) => handleSelectOportunidad(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecciona la Nota de Venta asociada</option>
                    {oportunidades.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.codigo} — {op.titulo}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Cliente */}
                <label className={labelClass}>
                  <span>Cliente</span>
                  <select
                    value={nuevoForm.cliente_id}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, cliente_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Seleccionar cliente</option>
                    {clientes.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.apellido_razon_social || cl.nombre} ({cl.rut})
                      </option>
                    ))}
                  </select>
                </label>

                {/* Obra */}
                <label className={labelClass}>
                  <span>Obra / Dirección</span>
                  <input
                    value={nuevoForm.obra}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, obra: e.target.value })}
                    placeholder="Lugar de la instalación"
                    className={inputClass}
                  />
                </label>

                {/* Producto */}
                <label className={labelClass}>
                  <span>Producto Afectado (Catálogo)</span>
                  <select
                    value={nuevoForm.producto_id}
                    onChange={(e) => {
                      const prod = productos.find((p) => p.id === e.target.value);
                      setNuevoForm({
                        ...nuevoForm,
                        producto_id: e.target.value,
                        producto_texto: prod ? `${prod.codigo} - ${prod.nombre}` : nuevoForm.producto_texto,
                      });
                    }}
                    className={inputClass}
                  >
                    <option value="">Seleccionar producto (opcional)</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} · {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Producto texto alternativo */}
                <label className={labelClass}>
                  <span>Detalle Producto / Partida</span>
                  <input
                    value={nuevoForm.producto_texto}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, producto_texto: e.target.value })}
                    placeholder="Ej. Pastelón 40x40 / Tubo hormigón"
                    className={inputClass}
                  />
                </label>

                {/* Tipo de problema */}
                <label className={labelClass}>
                  <span>Tipo de problema</span>
                  <select
                    value={nuevoForm.tipo}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, tipo: e.target.value as TipoProblemaPostventa })}
                    className={inputClass}
                  >
                    <option value="problema_instalacion">Problema de Instalación</option>
                    <option value="producto_defectuoso">Producto Defectuoso</option>
                    <option value="problema_fabricacion">Problema de Fabricación</option>
                    <option value="dano_transporte">Daño durante Transporte</option>
                    <option value="uso_incorrecto">Uso Incorrecto del Producto</option>
                    <option value="movimiento_terreno">Movimiento / Condiciones del Terreno</option>
                    <option value="trabajo_adicional">Trabajo Adicional Solicitado</option>
                    <option value="dano_terceros">Daño Causado por Terceros</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>

                {/* Fecha reclamo */}
                <label className={labelClass}>
                  <span>Fecha del reclamo</span>
                  <input
                    type="date"
                    value={nuevoForm.fecha_reclamo}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, fecha_reclamo: e.target.value })}
                    className={inputClass}
                  />
                </label>

                {/* Ejecutivo Responsable */}
                <label className={labelClass}>
                  <span>Ejecutivo Comercial a cargo</span>
                  <select
                    value={nuevoForm.vendedor_id}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, vendedor_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Seleccionar ejecutivo</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.rol})
                      </option>
                    ))}
                  </select>
                </label>

                {/* Cuadrilla / Maestro */}
                <label className={labelClass}>
                  <span>Cuadrilla / Maestro asignado</span>
                  <select
                    value={nuevoForm.cuadrilla_id}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, cuadrilla_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Seleccionar cuadrilla</option>
                    {trabajadores.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} — {t.cargo}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Descripción del Reclamo */}
                <label className={`${labelClass} sm:col-span-2`}>
                  <span>Descripción detallada del reclamo por el cliente *</span>
                  <textarea
                    required
                    rows={3}
                    value={nuevoForm.descripcion}
                    onChange={(e) => setNuevoForm({ ...nuevoForm, descripcion: e.target.value })}
                    placeholder="Indica qué ocurrió, en qué sector y qué solicita el cliente..."
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNuevoModal(false)}
                  className="rounded-md border border-gray-200 px-4 py-2 text-xs font-semibold hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#f97316] hover:bg-[#ea580c] px-4 py-2 text-xs font-bold text-white shadow-sm"
                >
                  Registrar caso (generar folio)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FICHA DETALLADA DEL CASO */}
      {selectedCaso && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ficha-caso-title"
            className="bg-white border border-gray-200 rounded-lg max-w-4xl w-full p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto text-sm"
          >
            {/* Header Ficha */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-black text-[#f97316]">{selectedCaso.folio}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      ESTADOS_MAP[selectedCaso.estado]?.bg || 'bg-gray-50'
                    } ${ESTADOS_MAP[selectedCaso.estado]?.color || 'text-gray-700'} ${
                      ESTADOS_MAP[selectedCaso.estado]?.border || 'border-gray-200'
                    }`}
                  >
                    {ESTADOS_MAP[selectedCaso.estado]?.label || selectedCaso.estado}
                  </span>
                  <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded border">
                    {selectedCaso.oportunidad?.codigo}
                  </span>
                </div>
                <h3 id="ficha-caso-title" className="text-sm font-extrabold text-[#213343] mt-1">
                  {selectedCaso.descripcion}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Selector rápido de estado */}
                <select
                  value={selectedCaso.estado}
                  onChange={(e) => void handleCambiarEstado(e.target.value as EstadoPostventa)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-[#f97316]"
                >
                  <option value="recibido">Recibido</option>
                  <option value="en_revision">En Revisión</option>
                  <option value="visita_programada">Visita Programada</option>
                  <option value="reparacion_programada">Reparación Programada</option>
                  <option value="cerrado">Cerrar Caso</option>
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedCaso(null)}
                  aria-label="Cerrar ficha"
                  className="p-1 text-gray-400 hover:text-gray-700 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Pestañas de la Ficha */}
            <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTabFicha('general')}
                className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  activeTabFicha === 'general'
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>General & Antecedentes</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTabFicha('diagnostico')}
                className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  activeTabFicha === 'diagnostico'
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Diagnóstico & Causa Raíz</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTabFicha('costos')}
                className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  activeTabFicha === 'costos'
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Costos Imputados (${Number(selectedCaso.costo_total || 0).toLocaleString('es-CL')})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTabFicha('evidencias')}
                className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  activeTabFicha === 'evidencias'
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Evidencias & Fotos ({selectedCaso.evidencias?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTabFicha('garantia')}
                className={`pb-2 px-3 border-b-2 transition flex items-center gap-1.5 ${
                  activeTabFicha === 'garantia'
                    ? 'border-[#f97316] text-[#f97316]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Certificado de Garantía</span>
              </button>
            </div>

            {/* TAB 1: GENERAL & ANTECEDENTES */}
            {activeTabFicha === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                  <div>
                    <span className="text-gray-500 font-bold block">Cliente:</span>
                    <span className="font-semibold text-gray-800">
                      {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre || 'Sin cliente'}
                    </span>
                    <span className="text-gray-400 block">{selectedCaso.cliente?.rut}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block">Obra / Ubicación:</span>
                    <span className="font-semibold text-gray-800">{selectedCaso.obra || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block">Nota de Venta (NV):</span>
                    <span className="font-mono font-bold text-gray-800">{selectedCaso.oportunidad?.codigo}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block">Ejecutivo Comercial:</span>
                    <span className="font-semibold text-gray-800">{selectedCaso.vendedor?.nombre || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block">Cuadrilla / Maestro:</span>
                    <span className="font-semibold text-gray-800">{selectedCaso.cuadrilla?.nombre || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block">Fecha del Reclamo:</span>
                    <span className="font-semibold text-gray-800">
                      {selectedCaso.fecha_reclamo || selectedCaso.created_at.split('T')[0]}
                    </span>
                  </div>
                </div>

                {/* Checklist Obligatorio de Antecedentes de Venta */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-extrabold text-[#213343] uppercase tracking-wider flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-[#f97316]" />
                    <span>Checklist de Antecedentes de Venta (Obligatorio para Evaluación)</span>
                  </h4>
                  <p className="text-xs text-gray-500">
                    Verifica lo cotizado, contratado y entregado antes de emitir la resolución técnica.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <label className="flex items-center gap-2 p-2 bg-gray-50 rounded border cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCaso.antecedentes_venta?.cotizado_verificado || false}
                        onChange={(e) => void handleUpdateAntecedentes('cotizado_verificado', e.target.checked)}
                        className="accent-[#f97316] w-4 h-4"
                      />
                      <span>¿Se verificó qué se cotizó originalmente?</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-gray-50 rounded border cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCaso.antecedentes_venta?.contratado_verificado || false}
                        onChange={(e) => void handleUpdateAntecedentes('contratado_verificado', e.target.checked)}
                        className="accent-[#f97316] w-4 h-4"
                      />
                      <span>¿Se verificó qué se contrató / ordenó?</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-gray-50 rounded border cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCaso.antecedentes_venta?.entregado_verificado || false}
                        onChange={(e) => void handleUpdateAntecedentes('entregado_verificado', e.target.checked)}
                        className="accent-[#f97316] w-4 h-4"
                      />
                      <span>¿Se verificó qué se instaló o entregó en obra?</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-gray-50 rounded border cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCaso.antecedentes_venta?.guia_recepcion_verificada || false}
                        onChange={(e) => void handleUpdateAntecedentes('guia_recepcion_verificada', e.target.checked)}
                        className="accent-[#f97316] w-4 h-4"
                      />
                      <span>¿Existe Guía de Despacho y recepción conforme firmada?</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <label className={labelClass}>
                      <span>Condiciones del terreno observadas:</span>
                      <input
                        value={selectedCaso.antecedentes_venta?.condiciones_terreno || ''}
                        onChange={(e) => void handleUpdateAntecedentes('condiciones_terreno', e.target.value)}
                        placeholder="Nivelación, humedad, pendientes, etc."
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      <span>Observaciones de instalación inicial:</span>
                      <input
                        value={selectedCaso.antecedentes_venta?.observaciones_instalacion || ''}
                        onChange={(e) => void handleUpdateAntecedentes('observaciones_instalacion', e.target.value)}
                        placeholder="Detalles del montaje o entrega"
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DIAGNÓSTICO & CAUSA RAÍZ */}
            {activeTabFicha === 'diagnostico' && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                  <h4 className="text-xs font-extrabold text-[#213343] uppercase tracking-wider flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#f97316]" />
                    <span>Evaluación Técnica y Clasificación de Causa Raíz</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <label className={labelClass}>
                      <span>Causa Raíz Identificada *</span>
                      <select
                        value={selectedCaso.causa_raiz || 'Sin determinar'}
                        onChange={(e) => void handleUpdateDiagnostico({ causa_raiz: e.target.value as CausaRaizPostventa })}
                        className={inputClass}
                      >
                        {CAUSAS_RAIZ.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={labelClass}>
                      <span>Resolución del Caso *</span>
                      <select
                        value={selectedCaso.resolucion || 'en_evaluacion'}
                        onChange={(e) => void handleUpdateDiagnostico({ resolucion: e.target.value as ResolucionPostventa })}
                        className={inputClass}
                      >
                        {Object.entries(RESOLUCIONES_MAP).map(([key, item]) => (
                          <option key={key} value={key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="p-3 bg-gray-50 rounded border text-xs text-gray-700">
                    <p className="font-bold text-gray-800">
                      Detalle de resolución: {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.label}
                    </p>
                    <p className="text-gray-500 mt-0.5">
                      {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.desc}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className={labelClass}>
                      <span>Reasignar Cuadrilla / Maestro a cargo:</span>
                      <select
                        value={selectedCaso.cuadrilla_id || ''}
                        onChange={(e) => void handleUpdateDiagnostico({ cuadrilla_id: e.target.value || null })}
                        className={inputClass}
                      >
                        <option value="">Sin cuadrilla</option>
                        {trabajadores.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre} ({t.cargo})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={labelClass}>
                      <span>Fecha compromiso de visita / reparación:</span>
                      <input
                        type="date"
                        value={selectedCaso.fecha_compromiso || ''}
                        onChange={(e) => void handleUpdateDiagnostico({ fecha_compromiso: e.target.value || null })}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: COSTOS IMPUTADOS */}
            {activeTabFicha === 'costos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-purple-50 p-3 rounded-lg border border-purple-200">
                  <div>
                    <span className="text-xs font-bold text-purple-900 block">Costo Total Imputado a la Postventa</span>
                    <span className="text-[11px] text-purple-700">
                      Se integra automáticamente al costo total de la Nota de Venta {selectedCaso.oportunidad?.codigo} en la Matriz de Margen.
                    </span>
                  </div>
                  <span className="text-xl font-extrabold text-purple-900 font-mono">
                    ${Number(selectedCaso.costo_total || 0).toLocaleString('es-CL')}
                  </span>
                </div>

                {/* Formulario nuevo costo */}
                <form onSubmit={handleAgregarCosto} className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                  <span className="text-xs font-bold text-gray-700 block">Registrar nuevo costo imputado</span>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                    <select
                      value={nuevoCosto.tipo_costo}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, tipo_costo: e.target.value as TipoCostoPostventa })}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5"
                    >
                      <option value="materiales">Materiales</option>
                      <option value="flete">Flete / Traslado</option>
                      <option value="mano_obra">Mano de Obra / Maestro</option>
                      <option value="reposicion">Reposición</option>
                      <option value="otro">Otro</option>
                    </select>
                    <input
                      required
                      placeholder="Descripción del gasto"
                      value={nuevoCosto.descripcion}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, descripcion: e.target.value })}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 sm:col-span-2"
                    />
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Monto ($)"
                      value={nuevoCosto.monto}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, monto: e.target.value })}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 font-mono text-right"
                    />
                    <button
                      type="submit"
                      className="rounded bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-3 py-1.5 text-xs shadow-sm transition"
                    >
                      + Agregar
                    </button>
                  </div>
                </form>

                {/* Listado de costos */}
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2.5">Tipo</th>
                        <th className="p-2.5">Descripción</th>
                        <th className="p-2.5">Fecha</th>
                        <th className="p-2.5 text-right">Monto ($)</th>
                        <th className="p-2.5 text-center" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(selectedCaso.costos || []).map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="p-2.5 capitalize font-semibold">{c.tipo_costo.replaceAll('_', ' ')}</td>
                          <td className="p-2.5">{c.descripcion}</td>
                          <td className="p-2.5 text-gray-500">{c.fecha}</td>
                          <td className="p-2.5 text-right font-mono font-bold">${Number(c.monto).toLocaleString('es-CL')}</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => void handleEliminarCosto(c.id)}
                              className="text-gray-400 hover:text-red-600 p-1"
                              title="Eliminar costo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(selectedCaso.costos || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-gray-400 text-xs">
                            No hay costos registrados aún para este caso.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: EVIDENCIAS & FOTOS */}
            {activeTabFicha === 'evidencias' && (
              <div className="space-y-4">
                {/* Formulario nueva evidencia */}
                <form onSubmit={handleAgregarEvidencia} className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                  <span className="text-xs font-bold text-gray-700 block">Registrar fotografía o acta de evidencia</span>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <select
                      value={nuevaEvidencia.tipo_evidencia}
                      onChange={(e) => setNuevaEvidencia({ ...nuevaEvidencia, tipo_evidencia: e.target.value as TipoEvidenciaPostventa })}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5"
                    >
                      <option value="antes">Foto Antes del trabajo</option>
                      <option value="durante">Foto Durante reparación</option>
                      <option value="despues">Foto Después (Trabajo finalizado)</option>
                      <option value="conformidad">Acta / Firma de Conformidad</option>
                      <option value="diagnostico">Informe de Diagnóstico</option>
                    </select>
                    <input
                      required
                      placeholder="URL de la imagen o documento"
                      value={nuevaEvidencia.archivo_url}
                      onChange={(e) => setNuevaEvidencia({ ...nuevaEvidencia, archivo_url: e.target.value })}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 sm:col-span-2"
                    />
                    <button
                      type="submit"
                      className="rounded bg-[#f97316] hover:bg-[#ea580c] text-white font-bold px-3 py-1.5 text-xs shadow-sm transition"
                    >
                      + Subir Evidencia
                    </button>
                  </div>
                </form>

                {/* Conformidad del cliente */}
                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCaso.conformidad_cliente}
                      onChange={(e) => void handleUpdateDiagnostico({ conformidad_cliente: e.target.checked })}
                      className="accent-emerald-600 w-4 h-4"
                    />
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Conformidad expresa del cliente obtenida y validada</span>
                    </span>
                  </label>
                  <input
                    value={selectedCaso.conformidad_observaciones || ''}
                    onChange={(e) => void handleUpdateDiagnostico({ conformidad_observaciones: e.target.value })}
                    placeholder="Observaciones de recepción conforme del cliente (ej. firmado en terreno sin reparos)"
                    className={inputClass}
                  />
                </div>

                {/* Galería de evidencias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(selectedCaso.evidencias || []).map((ev) => (
                    <div key={ev.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm space-y-2 p-2">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            ev.tipo_evidencia === 'conformidad'
                              ? 'bg-emerald-50 text-emerald-700'
                              : ev.tipo_evidencia === 'despues'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {ev.tipo_evidencia.toUpperCase()}
                        </span>
                        <span className="text-gray-400 text-[10px]">{ev.created_at.split('T')[0]}</span>
                      </div>
                      <div className="aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center border">
                        {ev.archivo_url.startsWith('http') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ev.archivo_url} alt={ev.nombre_archivo || 'Foto'} className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-8 h-8 text-gray-300" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 line-clamp-2">{ev.descripcion || ev.nombre_archivo}</p>
                    </div>
                  ))}
                  {(selectedCaso.evidencias || []).length === 0 && (
                    <div className="col-span-3 text-center py-8 text-gray-400 text-xs">
                      No hay fotografías o evidencias adjuntas a este reclamo.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: CERTIFICADO DE GARANTÍA */}
            {activeTabFicha === 'garantia' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-[#213343] uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#f97316]" />
                    <span>Documento Prototipo de Cobertura de Garantía Hormiglass</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded border border-gray-200 px-3 py-1.5 text-xs font-bold hover:bg-gray-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir Certificado</span>
                  </button>
                </div>

                {/* Hoja de Garantía */}
                <div className="bg-white border-2 border-gray-300 rounded-lg p-6 space-y-4 text-xs font-sans text-gray-800 shadow-sm">
                  <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3">
                    <div>
                      <h2 className="text-base font-black text-[#213343]">HORMIGLASS PREFABRICADOS</h2>
                      <p className="text-[10px] text-gray-500">Sociedad Comercial y de Transportes Valverde e Hijos Ltda.</p>
                      <p className="text-[10px] text-gray-500">Portezuelo 1502, San Bernardo, Santiago</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-sm text-[#f97316] block">{selectedCaso.folio}</span>
                      <span className="text-[10px] text-gray-400">Emisión: {new Date().toLocaleDateString('es-CL')}</span>
                    </div>
                  </div>

                  <div className="text-center py-2">
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-900">
                      CERTIFICADO DE RESOLUCIÓN Y COBERTURA DE GARANTÍA TÉCNICA
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded border">
                    <div>
                      <strong>Cliente:</strong> {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre}
                    </div>
                    <div>
                      <strong>RUT:</strong> {selectedCaso.cliente?.rut || '-'}
                    </div>
                    <div>
                      <strong>Obra:</strong> {selectedCaso.obra || '-'}
                    </div>
                    <div>
                      <strong>Nota de Venta (NV):</strong> {selectedCaso.oportunidad?.codigo}
                    </div>
                    <div>
                      <strong>Producto / Partida:</strong> {selectedCaso.producto_texto || selectedCaso.producto?.nombre || 'Prefabricados de Hormigón'}
                    </div>
                    <div>
                      <strong>Tipo Resolución:</strong> {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.label}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-bold uppercase tracking-wider text-gray-700">1. Alcance de la Cobertura:</h5>
                    <p className="text-gray-600 leading-relaxed">
                      Hormiglass certifica que el reclamo registrado bajo el folio {selectedCaso.folio} ha sido evaluado técnicamente conforme a los estándares de fabricación de hormigón. En mérito del diagnóstico ({selectedCaso.causa_raiz || 'Técnico'}), se determina la resolución de cobertura correspondiente a reparación, reposición y/o ajuste de obra según lo pactado.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-bold uppercase tracking-wider text-gray-700">2. Exclusiones y Condiciones:</h5>
                    <p className="text-gray-600 leading-relaxed">
                      La presente garantía no cubre daños atribuibles a movimientos imprevistos del terreno, sobrecargas vehiculares no especificadas en la cotización original, modificaciones posteriores ejecutadas por terceros o negligencia en el mantenimiento de juntas y sellos.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-300 text-center">
                    <div>
                      <div className="border-b border-gray-400 w-48 mx-auto mb-1" />
                      <span className="block font-bold">Mariela Valverde / Gerencia Técnica</span>
                      <span className="text-[10px] text-gray-500">Hormiglass Prefabricados</span>
                    </div>
                    <div>
                      <div className="border-b border-gray-400 w-48 mx-auto mb-1" />
                      <span className="block font-bold">Conformidad del Cliente</span>
                      <span className="text-[10px] text-gray-500">
                        {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN DE CIERRE CON VALIDACIONES */}
            <div className="border-t border-gray-200 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-lg">
              <div>
                <span className="text-xs font-bold text-gray-800 block">Condiciones para Cierre Definitivo:</span>
                <div className="flex flex-wrap gap-2 text-[10px] mt-1">
                  <span className={validacionCierre.fotos ? 'text-emerald-700 font-bold' : 'text-red-600'}>
                    {validacionCierre.fotos ? '✓ Fotos finales' : '✗ Fotos finales'}
                  </span>
                  <span>•</span>
                  <span className={validacionCierre.conformidad ? 'text-emerald-700 font-bold' : 'text-red-600'}>
                    {validacionCierre.conformidad ? '✓ Conformidad cliente' : '✗ Conformidad cliente'}
                  </span>
                  <span>•</span>
                  <span className={validacionCierre.causa ? 'text-emerald-700 font-bold' : 'text-red-600'}>
                    {validacionCierre.causa ? '✓ Causa raíz' : '✗ Causa raíz'}
                  </span>
                  <span>•</span>
                  <span className={validacionCierre.costos ? 'text-emerald-700 font-bold' : 'text-red-600'}>
                    {validacionCierre.costos ? '✓ Costos registrados' : '✗ Costos registrados'}
                  </span>
                </div>
              </div>

              {selectedCaso.estado !== 'cerrado' && selectedCaso.estado !== 'resuelto' ? (
                <button
                  type="button"
                  disabled={!validacionCierre.listo}
                  onClick={() => void handleCambiarEstado('cerrado')}
                  className={`px-4 py-2 rounded-md font-bold text-xs transition flex items-center gap-1.5 ${
                    validacionCierre.listo
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={
                    validacionCierre.listo
                      ? 'Cerrar el caso'
                      : 'Completa todos los requisitos (fotos finales, conformidad, causa raíz y costos) para cerrar'
                  }
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Cerrar Caso de Postventa</span>
                </button>
              ) : (
                <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded border border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Caso Cerrado el {selectedCaso.fecha_cierre?.split('T')[0] || 'hoy'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
