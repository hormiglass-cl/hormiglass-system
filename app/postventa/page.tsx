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
  FileCheck,
  FileText,
  Filter,
  HardHat,
  Kanban,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Table as TableIcon,
  Trash2,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type {
  AntecedentesVentaPostventa,
  CasoPostventa,
  CausaRaizPostventa,
  Cliente,
  EstadoPostventa,
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
import {
  Button,
  CodeStamp,
  Dialog,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  Sheet,
  StatusBadge,
  SummaryLine,
  Tabs,
  Tone,
} from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';

const ESTADOS_MAP: Record<EstadoPostventa, { label: string; tone: Tone }> = {
  recibido: { label: 'Recibido', tone: 'neutral' },
  en_revision: { label: 'En revisión', tone: 'warning' },
  visita_programada: { label: 'Visita programada', tone: 'info' },
  reparacion_programada: { label: 'Reparación programada', tone: 'accent' },
  cerrado: { label: 'Cerrado', tone: 'success' },
  abierto: { label: 'Abierto', tone: 'neutral' },
  programado: { label: 'Programado', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'warning' },
  resuelto: { label: 'Resuelto', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
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
  garantia: { label: 'Garantía total', desc: 'Reparación o reposición sin costo para el cliente' },
  responsabilidad_parcial: { label: 'Responsabilidad parcial', desc: 'Acuerdo comercial compartido con el cliente' },
  no_garantia: { label: 'No corresponde garantía', desc: 'Generar cotización por costo de reparación' },
  transportista: { label: 'Transportista externo', desc: 'Derivar cobro o responsabilidad al transportista' },
  en_evaluacion: { label: 'En evaluación', desc: 'Pendiente de diagnóstico técnico definitivo' },
};

export default function PostventaPage() {
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();
  const toast = useToast();

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

  // Modales y Sheets
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
      toast({ message: mensajeError(casosErr), tone: 'danger' });
    } else {
      const data = (casosData || []) as unknown as CasoPostventa[];
      setCasos(data);
      setSelectedCaso((prev) => (prev ? data.find((c) => c.id === prev.id) || prev : null));
    }

    if (opsData) setOportunidades(opsData as OportunidadVenta[]);
    if (clientesData) setClientes(clientesData as Cliente[]);
    if (trabajadores) setTrabajadores(trabData as Trabajador[]);
    if (usrsData) setUsuarios(usrsData as Usuario[]);
    if (prodsData) setProductos(prodsData as ProductoCatalogo[]);

    setLoading(false);
  }, [supabase, toast]);

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
      toast({ message: 'Debes asociar una Nota de Venta (Oportunidad) y describir el reclamo.', tone: 'warning' });
      return;
    }

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
      toast({ message: mensajeError(errInsert), tone: 'danger' });
    } else {
      toast({ message: `Caso creado con éxito con folio ${nuevo.folio}`, tone: 'success' });
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

    setSelectedCaso((prev) => (prev ? { ...prev, antecedentes_venta: ant } : null));
    setCasos((prev) => prev.map((c) => (c.id === selectedCaso.id ? { ...c, antecedentes_venta: ant } : c)));

    const { error: errUpd } = await supabase
      .from('postventa_casos')
      .update({ antecedentes_venta: ant })
      .eq('id', selectedCaso.id);

    if (errUpd) {
      toast({ message: mensajeError(errUpd), tone: 'danger' });
      await loadData();
    }
  };

  // Actualizar diagnóstico / causa raíz / resolución
  const handleUpdateDiagnostico = async (updates: Partial<CasoPostventa>) => {
    if (!selectedCaso) return;

    setSelectedCaso((prev) => (prev ? { ...prev, ...updates } : null));
    setCasos((prev) => prev.map((c) => (c.id === selectedCaso.id ? { ...c, ...updates } : c)));

    const { error: errUpd } = await supabase
      .from('postventa_casos')
      .update(updates)
      .eq('id', selectedCaso.id);

    if (errUpd) {
      toast({ message: mensajeError(errUpd), tone: 'danger' });
      await loadData();
    } else {
      toast({ message: 'Diagnóstico y resolución actualizados', tone: 'success' });
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
      toast({ message: mensajeError(errIns), tone: 'danger' });
    } else {
      setNuevoCosto({
        tipo_costo: 'materiales',
        descripcion: '',
        monto: '',
        proveedor_o_maestro: '',
        fecha: new Date().toISOString().split('T')[0],
      });
      toast({ message: 'Costo imputado registrado y sincronizado en la Nota de Venta', tone: 'success' });
      await loadData();
    }
  };

  // Eliminar costo con confirmDialog
  const handleEliminarCosto = async (costoId: string) => {
    const ok = await confirm({
      title: '¿Eliminar costo imputado?',
      message: 'Esta acción restará el gasto del costo total de postventa y de la Nota de Venta.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;

    const { error: errDel } = await supabase.from('postventa_costos').delete().eq('id', costoId);
    if (errDel) {
      toast({ message: mensajeError(errDel), tone: 'danger' });
    } else {
      toast({ message: 'Costo eliminado', tone: 'success' });
      await loadData();
    }
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
      toast({ message: mensajeError(errIns), tone: 'danger' });
    } else {
      setNuevaEvidencia({
        tipo_evidencia: 'despues',
        archivo_url: '',
        nombre_archivo: '',
        descripcion: '',
      });
      toast({ message: 'Evidencia registrada con éxito', tone: 'success' });
      await loadData();
    }
  };

  // Validar requisitos para cierre del caso
  const validacionCierre = useMemo(() => {
    if (!selectedCaso) return { listo: false, fotos: false, conformidad: false, causa: false, costos: false };
    const fotos = (selectedCaso.evidencias || []).some((e) => ['despues', 'conformidad'].includes(e.tipo_evidencia));
    const conformidad =
      Boolean(selectedCaso.conformidad_cliente) ||
      (selectedCaso.evidencias || []).some((e) => e.tipo_evidencia === 'conformidad');
    const causa =
      Boolean(selectedCaso.causa_raiz) && selectedCaso.causa_raiz !== 'Sin determinar' && (selectedCaso.causa_raiz?.trim() ?? '') !== '';
    const costos =
      Number(selectedCaso.costo_total || 0) > 0 || (selectedCaso.costos && selectedCaso.costos.length > 0);

    const listo = fotos && conformidad && causa && costos;
    return { listo, fotos, conformidad, causa, costos };
  }, [selectedCaso]);

  // Cambiar estado o Cerrar caso
  const handleCambiarEstado = async (nuevoEstado: EstadoPostventa) => {
    if (!selectedCaso) return;

    if (nuevoEstado === 'cerrado' && !validacionCierre.listo) {
      toast({
        message: 'Para cerrar el caso debes cumplir las 4 condiciones obligatorias.',
        tone: 'warning',
      });
      return;
    }

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
      toast({ message: mensajeError(errUpd), tone: 'danger' });
    } else {
      toast({ message: `Estado actualizado a "${ESTADOS_MAP[nuevoEstado]?.label || nuevoEstado}"`, tone: 'success' });
      await loadData();
    }
  };

  const tabsVista = [
    { id: 'tabla', label: 'Tabla' },
    { id: 'kanban', label: 'Tablero kanban' },
    { id: 'metricas', label: 'Causa raíz & KPIs' },
  ];

  const tabsFicha = [
    { id: 'general', label: 'General & antecedentes' },
    { id: 'diagnostico', label: 'Diagnóstico & causa raíz' },
    { id: 'costos', label: `Costos ($${Number(selectedCaso?.costo_total || 0).toLocaleString('es-CL')})` },
    { id: 'evidencias', label: `Evidencias (${selectedCaso?.evidencias?.length || 0})` },
    { id: 'garantia', label: 'Certificado de garantía' },
  ];

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldAlert size={24} className="text-accent-ink" aria-hidden />
            <span>Postventa, Garantías y Reclamos</span>
          </span>
        }
        description="Gestión del ciclo de vida de reclamos, evaluación técnica, garantías, evidencias fotográficas e imputación de costos a la Nota de Venta."
        actions={
          <Button
            variant="primary"
            icon={Plus}
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
          >
            Nuevo reclamo / caso
          </Button>
        }
      />

      {/* Resumen en una Línea: Reemplaza las 5 tarjetas KPI */}
      <Panel>
        <div className="px-4 py-3">
          <SummaryLine
            items={[
              {
                label: 'casos totales',
                value: stats.total,
                tone: 'neutral',
                active: filtroEstado === 'todos',
                onClick: () => setFiltroEstado('todos'),
              },
              {
                label: 'en curso',
                value: stats.abiertos,
                tone: 'warning',
                active:
                  filtroEstado === 'en_revision' ||
                  filtroEstado === 'visita_programada' ||
                  filtroEstado === 'reparacion_programada',
                onClick: () => setFiltroEstado(filtroEstado === 'en_revision' ? 'todos' : 'en_revision'),
              },
              {
                label: 'cerrados con conformidad',
                value: stats.cerrados,
                tone: 'success',
                active: filtroEstado === 'cerrado',
                onClick: () => setFiltroEstado(filtroEstado === 'cerrado' ? 'todos' : 'cerrado'),
              },
              {
                label: 'costo total imputado',
                value: `$${stats.costoTotal.toLocaleString('es-CL')}`,
                tone: 'danger',
              },
              {
                label: 'con garantía',
                value: `${stats.tasaGarantia}%`,
                tone: 'info',
                active: filtroResolucion === 'garantia',
                onClick: () => setFiltroResolucion(filtroResolucion === 'garantia' ? 'todas' : 'garantia'),
              },
            ]}
          />
        </div>
      </Panel>

      {/* Filtros y Selector de Vistas */}
      <FilterBar>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between w-full">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                aria-label="Buscar casos de postventa"
                placeholder="Buscar por folio, cliente, NV, obra o descripción..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="hg-field pl-9 text-xs"
              />
            </div>

            <select
              aria-label="Filtrar por estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="hg-field w-auto text-xs font-semibold"
            >
              <option value="todos">Estado: Todos</option>
              <option value="recibido">Recibido</option>
              <option value="en_revision">En revisión</option>
              <option value="visita_programada">Visita programada</option>
              <option value="reparacion_programada">Reparación programada</option>
              <option value="cerrado">Cerrado</option>
            </select>

            <select
              aria-label="Filtrar por causa raíz"
              value={filtroCausa}
              onChange={(e) => setFiltroCausa(e.target.value)}
              className="hg-field w-auto text-xs font-semibold"
            >
              <option value="todas">Causa raíz: Todas</option>
              {CAUSAS_RAIZ.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por resolución"
              value={filtroResolucion}
              onChange={(e) => setFiltroResolucion(e.target.value)}
              className="hg-field w-auto text-xs font-semibold"
            >
              <option value="todas">Resolución: Todas</option>
              {Object.entries(RESOLUCIONES_MAP).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por cuadrilla"
              value={filtroCuadrilla}
              onChange={(e) => setFiltroCuadrilla(e.target.value)}
              className="hg-field w-auto text-xs font-semibold"
            >
              <option value="todas">Cuadrilla: Todas</option>
              {trabajadores.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>

            {(busqueda || filtroEstado !== 'todos' || filtroCausa !== 'todas' || filtroResolucion !== 'todas' || filtroCuadrilla !== 'todas') && (
              <Button
                variant="subtle"
                size="sm"
                icon={RefreshCw}
                onClick={() => {
                  setBusqueda('');
                  setFiltroEstado('todos');
                  setFiltroCausa('todas');
                  setFiltroResolucion('todas');
                  setFiltroCuadrilla('todas');
                }}
              >
                Limpiar
              </Button>
            )}
          </div>

          <div className="shrink-0">
            <Tabs items={tabsVista} active={vista} onChange={(v) => setVista(v as typeof vista)} />
          </div>
        </div>
      </FilterBar>

      {/* VISTA 1: TABLA */}
      {vista === 'tabla' && (
        <Panel>
          <div className="overflow-x-auto">
            <table className="hg-table text-xs">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Nota de Venta / Obra</th>
                  <th>Cliente</th>
                  <th>Problema / Descripción</th>
                  <th>Causa raíz</th>
                  <th>Resolución</th>
                  <th className="text-right">Costo total</th>
                  <th className="text-center">Estado</th>
                  <th className="text-center">Evidencias</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-ink-muted">
                      Cargando casos de postventa...
                    </td>
                  </tr>
                )}
                {!loading && casosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-ink-muted">
                      {casos.length === 0
                        ? 'No hay reclamos o casos registrados. Crea uno con el botón "Nuevo reclamo / caso".'
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
                        className="cursor-pointer transition-colors hover:bg-surface-muted"
                      >
                        {/* Folio */}
                        <td>
                          <div className="flex flex-col">
                            <CodeStamp>{caso.folio}</CodeStamp>
                            <span className="t-caption text-ink-muted font-mono t-num mt-0.5">
                              {caso.fecha_reclamo || caso.created_at.split('T')[0]}
                            </span>
                          </div>
                        </td>

                        {/* NV / Obra */}
                        <td>
                          <div className="font-semibold text-ink">
                            <CodeStamp>{caso.oportunidad?.codigo || 'NV'}</CodeStamp>
                          </div>
                          <div className="t-caption text-ink-muted line-clamp-1 mt-0.5">
                            {caso.obra || caso.oportunidad?.titulo || '—'}
                          </div>
                        </td>

                        {/* Cliente */}
                        <td>
                          <div className="font-semibold text-ink">{clienteNom}</div>
                          {caso.cliente?.telefono && (
                            <div className="t-caption text-ink-muted">{caso.cliente.telefono}</div>
                          )}
                        </td>

                        {/* Problema */}
                        <td className="max-w-xs">
                          <div className="font-medium text-ink line-clamp-1">{caso.descripcion}</div>
                          <div className="t-caption text-ink-muted capitalize">
                            {caso.tipo?.replaceAll('_', ' ')}
                          </div>
                        </td>

                        {/* Causa Raíz */}
                        <td>
                          <StatusBadge
                            tone={caso.causa_raiz && caso.causa_raiz !== 'Sin determinar' ? 'accent' : 'neutral'}
                          >
                            {caso.causa_raiz || 'Sin determinar'}
                          </StatusBadge>
                        </td>

                        {/* Resolución */}
                        <td>
                          {caso.resolucion ? (
                            <span className="font-medium text-ink">
                              {RESOLUCIONES_MAP[caso.resolucion]?.label || caso.resolucion}
                            </span>
                          ) : (
                            <span className="text-ink-muted">Pendiente</span>
                          )}
                        </td>

                        {/* Costo Total */}
                        <td className="text-right font-mono t-num font-bold text-ink">
                          ${Number(caso.costo_total || 0).toLocaleString('es-CL')}
                          <span className="block t-micro text-ink-muted font-sans font-normal">
                            {(caso.costos || []).length} costos
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="text-center">
                          <StatusBadge tone={estadoInfo.tone}>
                            {estadoInfo.label}
                          </StatusBadge>
                        </td>

                        {/* Evidencias */}
                        <td className="text-center">
                          <div className="inline-flex items-center gap-1 text-xs text-ink-muted">
                            <Camera size={13} aria-hidden />
                            <span className="font-semibold text-ink">{caso.evidencias?.length || 0}</span>
                            {tieneFinal && (
                              <CheckCircle2 size={13} className="text-success" aria-label="Fotos finales registradas" />
                            )}
                          </div>
                        </td>

                        {/* Acciones */}
                        <td className="text-right">
                          <Button
                            variant="subtle"
                            size="sm"
                            icon={ChevronRight}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCaso(caso);
                            }}
                          >
                            Ficha
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>
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
              <div key={est} className="rounded-panel border border-line bg-surface-muted p-2.5 flex flex-col min-h-[500px]">
                <div className="flex items-center justify-between pb-2 border-b border-line-subtle mb-2">
                  <span className="text-xs font-bold text-ink">{conf.label}</span>
                  <span className="hg-list-count">{tarjetas.length}</span>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {tarjetas.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCaso(c)}
                      className="rounded-control border border-line bg-surface p-3 hover:border-line-subtle shadow-xs cursor-pointer transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <CodeStamp>{c.folio}</CodeStamp>
                        <CodeStamp>{c.oportunidad?.codigo || 'NV'}</CodeStamp>
                      </div>
                      <div className="text-xs font-semibold text-ink line-clamp-2">{c.descripcion}</div>
                      <div className="t-caption text-ink-muted">
                        {c.cliente?.apellido_razon_social || c.cliente?.nombre || 'Cliente'}
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-line-subtle text-xs">
                        <span className="font-semibold text-ink t-num">
                          ${Number(c.costo_total || 0).toLocaleString('es-CL')}
                        </span>
                        <StatusBadge tone={c.causa_raiz && c.causa_raiz !== 'Sin determinar' ? 'accent' : 'neutral'}>
                          {c.causa_raiz || 'Sin causa'}
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                  {tarjetas.length === 0 && (
                    <div className="text-center py-10 t-caption text-ink-muted">Sin casos en esta etapa</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA 3: MÉTRICAS Y CAUSA RAÍZ */}
      {vista === 'metricas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Distribución por Causa Raíz */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <span className="inline-flex items-center gap-2">
                  <Wrench size={16} className="text-accent-ink" aria-hidden />
                  <span>Distribución por Causa Raíz</span>
                </span>
                <span className="hg-list-count">{stats.total} analizados</span>
              </div>
            }
          >
            <div className="p-4 space-y-3">
              <p className="t-caption text-ink-muted">
                Identifica el origen técnico de las fallas para evaluar fugas operacionales en Fabricación, Instalación o Despacho.
              </p>

              <div className="space-y-3 pt-2">
                {CAUSAS_RAIZ.map((causa) => {
                  const count = stats.causasCount[causa] || 0;
                  const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

                  return (
                    <div key={causa} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-ink">
                        <span>{causa}</span>
                        <span className="t-num">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden border border-line-subtle">
                        <div
                          className="h-2 rounded-full bg-accent transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Impacto por Cuadrilla / Maestro */}
          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <HardHat size={16} className="text-accent-ink" aria-hidden />
                <span>Reclamos por Cuadrilla / Maestro</span>
              </span>
            }
          >
            <div className="p-4 space-y-3">
              <p className="t-caption text-ink-muted">
                Trazabilidad operativa de cuadrillas de obra y concentración de reparaciones técnicas.
              </p>

              <div className="divide-y divide-line-subtle max-h-80 overflow-y-auto">
                {trabajadores
                  .filter((t) =>
                    t.area?.includes('Operaciones') ||
                    t.area?.includes('Taller') ||
                    t.cargo?.includes('Maestro') ||
                    t.cargo?.includes('Instalación')
                  )
                  .map((t) => {
                    const casosDeTrabajador = casos.filter((c) => c.cuadrilla_id === t.id);
                    const costoTrabajador = casosDeTrabajador.reduce((acc, c) => acc + Number(c.costo_total || 0), 0);

                    return (
                      <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-ink">{t.nombre}</div>
                          <div className="t-caption text-ink-muted">{t.cargo}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-ink t-num">{casosDeTrabajador.length} casos</span>
                          <span className="block t-caption text-ink-muted font-mono t-num">
                            ${costoTrabajador.toLocaleString('es-CL')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* DIÁLOGO: NUEVO RECLAMO / CASO */}
      <Dialog
        open={showNuevoModal}
        onClose={() => setShowNuevoModal(false)}
        title="Recepción de reclamo / Nueva postventa"
        description="Registra la incidencia asociada a una Nota de Venta para iniciar la evaluación técnica."
        size="lg"
      >
        <form onSubmit={handleCrearCaso} className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block t-caption font-semibold text-ink mb-1">Nota de Venta / Oportunidad (NV) *</label>
              <select
                required
                value={nuevoForm.oportunidad_id}
                onChange={(e) => handleSelectOportunidad(e.target.value)}
                className="hg-field font-semibold"
              >
                <option value="">Selecciona la Nota de Venta asociada</option>
                {oportunidades.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.codigo} — {op.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Cliente</label>
              <select
                value={nuevoForm.cliente_id}
                onChange={(e) => setNuevoForm({ ...nuevoForm, cliente_id: e.target.value })}
                className="hg-field"
              >
                <option value="">Seleccionar cliente</option>
                {clientes.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.apellido_razon_social || cl.nombre} ({cl.rut})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Obra / Ubicación</label>
              <input
                value={nuevoForm.obra}
                onChange={(e) => setNuevoForm({ ...nuevoForm, obra: e.target.value })}
                placeholder="Lugar de la instalación"
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Producto afectado (Catálogo)</label>
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
                className="hg-field"
              >
                <option value="">Seleccionar producto (opcional)</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Detalle producto / partida</label>
              <input
                value={nuevoForm.producto_texto}
                onChange={(e) => setNuevoForm({ ...nuevoForm, producto_texto: e.target.value })}
                placeholder="Ej. Pastelón 40x40 / Tubo hormigón"
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Tipo de problema</label>
              <select
                value={nuevoForm.tipo}
                onChange={(e) => setNuevoForm({ ...nuevoForm, tipo: e.target.value as TipoProblemaPostventa })}
                className="hg-field font-semibold"
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
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Fecha del reclamo</label>
              <input
                type="date"
                value={nuevoForm.fecha_reclamo}
                onChange={(e) => setNuevoForm({ ...nuevoForm, fecha_reclamo: e.target.value })}
                className="hg-field"
              />
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Ejecutivo comercial a cargo</label>
              <select
                value={nuevoForm.vendedor_id}
                onChange={(e) => setNuevoForm({ ...nuevoForm, vendedor_id: e.target.value })}
                className="hg-field"
              >
                <option value="">Seleccionar ejecutivo</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.rol})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block t-caption font-semibold text-ink mb-1">Cuadrilla / Maestro asignado</label>
              <select
                value={nuevoForm.cuadrilla_id}
                onChange={(e) => setNuevoForm({ ...nuevoForm, cuadrilla_id: e.target.value })}
                className="hg-field"
              >
                <option value="">Seleccionar cuadrilla</option>
                {trabajadores.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} — {t.cargo}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block t-caption font-semibold text-ink mb-1">Descripción detallada del reclamo *</label>
              <textarea
                required
                rows={3}
                value={nuevoForm.descripcion}
                onChange={(e) => setNuevoForm({ ...nuevoForm, descripcion: e.target.value })}
                placeholder="Indica qué ocurrió, en qué sector y qué solicita el cliente..."
                className="hg-field p-3 leading-relaxed"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line-subtle pt-3">
            <Button variant="secondary" onClick={() => setShowNuevoModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              Registrar caso (generar folio)
            </Button>
          </div>
        </form>
      </Dialog>

      {/* SHEET LATERAL: FICHA DETALLADA DEL CASO */}
      <Sheet
        open={Boolean(selectedCaso)}
        onClose={() => setSelectedCaso(null)}
        width="lg"
        title={
          selectedCaso ? (
            <div className="flex items-center gap-2">
              <CodeStamp>{selectedCaso.folio}</CodeStamp>
              <StatusBadge tone={ESTADOS_MAP[selectedCaso.estado]?.tone || 'neutral'}>
                {ESTADOS_MAP[selectedCaso.estado]?.label || selectedCaso.estado}
              </StatusBadge>
              <CodeStamp>{selectedCaso.oportunidad?.codigo || 'NV'}</CodeStamp>
            </div>
          ) : (
            'Ficha de caso'
          )
        }
      >
        {selectedCaso && (
          <div className="space-y-5">
            {/* Cabecera y descripción rápida */}
            <div>
              <h3 className="t-section text-ink">{selectedCaso.descripcion}</h3>
              <div className="mt-2 flex items-center gap-2">
                <span className="t-caption text-ink-muted">Estado actual:</span>
                <select
                  value={selectedCaso.estado}
                  onChange={(e) => void handleCambiarEstado(e.target.value as EstadoPostventa)}
                  className="hg-field w-auto py-1 text-xs font-semibold"
                >
                  <option value="recibido">Recibido</option>
                  <option value="en_revision">En revisión</option>
                  <option value="visita_programada">Visita programada</option>
                  <option value="reparacion_programada">Reparación programada</option>
                  <option value="cerrado">Cerrar caso</option>
                </select>
              </div>
            </div>

            {/* Pestañas de la Ficha */}
            <Tabs items={tabsFicha} active={activeTabFicha} onChange={(t) => setActiveTabFicha(t as typeof activeTabFicha)} />

            {/* TAB 1: GENERAL & ANTECEDENTES */}
            {activeTabFicha === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-surface-muted p-3.5 rounded-panel border border-line text-xs">
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Cliente:</span>
                    <span className="font-semibold text-ink">
                      {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre || 'Sin cliente'}
                    </span>
                    <span className="t-caption text-ink-muted font-mono block">{selectedCaso.cliente?.rut}</span>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Obra / Ubicación:</span>
                    <span className="font-semibold text-ink">{selectedCaso.obra || '—'}</span>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Nota de Venta (NV):</span>
                    <div className="mt-0.5">
                      <CodeStamp>{selectedCaso.oportunidad?.codigo || 'NV'}</CodeStamp>
                    </div>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Ejecutivo Comercial:</span>
                    <span className="font-semibold text-ink">{selectedCaso.vendedor?.nombre || '—'}</span>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Cuadrilla / Maestro:</span>
                    <span className="font-semibold text-ink">{selectedCaso.cuadrilla?.nombre || '—'}</span>
                  </div>
                  <div>
                    <span className="t-caption text-ink-muted block font-semibold">Fecha del Reclamo:</span>
                    <span className="font-semibold text-ink font-mono t-num">
                      {selectedCaso.fecha_reclamo || selectedCaso.created_at.split('T')[0]}
                    </span>
                  </div>
                </div>

                {/* Checklist Obligatorio de Antecedentes */}
                <Panel
                  title={
                    <span className="inline-flex items-center gap-2">
                      <FileCheck size={16} className="text-accent-ink" aria-hidden />
                      <span>Checklist de Antecedentes de Venta</span>
                    </span>
                  }
                >
                  <div className="p-4 space-y-3">
                    <p className="t-caption text-ink-muted">
                      Verifica lo cotizado, contratado y entregado antes de emitir la resolución técnica.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label className="flex items-center gap-2 p-2 bg-surface rounded-control border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCaso.antecedentes_venta?.cotizado_verificado || false}
                          onChange={(e) => void handleUpdateAntecedentes('cotizado_verificado', e.target.checked)}
                          className="rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="text-ink">¿Se verificó lo cotizado originalmente?</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 bg-surface rounded-control border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCaso.antecedentes_venta?.contratado_verificado || false}
                          onChange={(e) => void handleUpdateAntecedentes('contratado_verificado', e.target.checked)}
                          className="rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="text-ink">¿Se verificó lo contratado / ordenado?</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 bg-surface rounded-control border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCaso.antecedentes_venta?.entregado_verificado || false}
                          onChange={(e) => void handleUpdateAntecedentes('entregado_verificado', e.target.checked)}
                          className="rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="text-ink">¿Se verificó lo instalado o entregado en obra?</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 bg-surface rounded-control border border-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCaso.antecedentes_venta?.guia_recepcion_verificada || false}
                          onChange={(e) => void handleUpdateAntecedentes('guia_recepcion_verificada', e.target.checked)}
                          className="rounded border-line text-accent focus:ring-accent"
                        />
                        <span className="text-ink">¿Existe Guía de Despacho con firma conforme?</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Condiciones del terreno:</label>
                        <input
                          value={selectedCaso.antecedentes_venta?.condiciones_terreno || ''}
                          onChange={(e) => void handleUpdateAntecedentes('condiciones_terreno', e.target.value)}
                          placeholder="Nivelación, humedad, pendientes, etc."
                          className="hg-field text-xs"
                        />
                      </div>
                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Observaciones de instalación inicial:</label>
                        <input
                          value={selectedCaso.antecedentes_venta?.observaciones_instalacion || ''}
                          onChange={(e) => void handleUpdateAntecedentes('observaciones_instalacion', e.target.value)}
                          placeholder="Detalles del montaje o entrega"
                          className="hg-field text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {/* TAB 2: DIAGNÓSTICO & CAUSA RAÍZ */}
            {activeTabFicha === 'diagnostico' && (
              <div className="space-y-4">
                <Panel
                  title={
                    <span className="inline-flex items-center gap-2">
                      <Wrench size={16} className="text-accent-ink" aria-hidden />
                      <span>Evaluación Técnica y Clasificación de Causa Raíz</span>
                    </span>
                  }
                >
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Causa raíz identificada *</label>
                        <select
                          value={selectedCaso.causa_raiz || 'Sin determinar'}
                          onChange={(e) => void handleUpdateDiagnostico({ causa_raiz: e.target.value as CausaRaizPostventa })}
                          className="hg-field font-semibold"
                        >
                          {CAUSAS_RAIZ.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Resolución del caso *</label>
                        <select
                          value={selectedCaso.resolucion || 'en_evaluacion'}
                          onChange={(e) => void handleUpdateDiagnostico({ resolucion: e.target.value as ResolucionPostventa })}
                          className="hg-field font-semibold"
                        >
                          {Object.entries(RESOLUCIONES_MAP).map(([key, item]) => (
                            <option key={key} value={key}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="p-3 bg-surface-muted rounded-panel border border-line text-xs">
                      <p className="font-semibold text-ink">
                        {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.label}
                      </p>
                      <p className="t-caption text-ink-muted mt-0.5">
                        {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.desc}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Reasignar cuadrilla / maestro a cargo:</label>
                        <select
                          value={selectedCaso.cuadrilla_id || ''}
                          onChange={(e) => void handleUpdateDiagnostico({ cuadrilla_id: e.target.value || null })}
                          className="hg-field"
                        >
                          <option value="">Sin cuadrilla</option>
                          {trabajadores.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre} ({t.cargo})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block t-caption font-semibold text-ink mb-1">Fecha compromiso de visita / reparación:</label>
                        <input
                          type="date"
                          value={selectedCaso.fecha_compromiso || ''}
                          onChange={(e) => void handleUpdateDiagnostico({ fecha_compromiso: e.target.value || null })}
                          className="hg-field"
                        />
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {/* TAB 3: COSTOS IMPUTADOS */}
            {activeTabFicha === 'costos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-danger-soft/30 p-3.5 rounded-panel border border-danger-line">
                  <div>
                    <span className="t-caption font-semibold text-danger block">Costo total imputado a la postventa</span>
                    <span className="t-caption text-ink-muted">
                      Se integra al costo total de la Nota de Venta {selectedCaso.oportunidad?.codigo} en la Matriz de Margen.
                    </span>
                  </div>
                  <span className="text-xl font-bold text-danger font-mono t-num">
                    ${Number(selectedCaso.costo_total || 0).toLocaleString('es-CL')}
                  </span>
                </div>

                {/* Formulario nuevo costo */}
                <form onSubmit={handleAgregarCosto} className="bg-surface-muted p-3.5 rounded-panel border border-line space-y-3">
                  <span className="t-caption font-semibold text-ink block">Registrar nuevo costo imputado</span>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
                    <select
                      value={nuevoCosto.tipo_costo}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, tipo_costo: e.target.value as TipoCostoPostventa })}
                      className="hg-field font-semibold text-xs"
                    >
                      <option value="materiales">Materiales</option>
                      <option value="flete">Flete / Traslado</option>
                      <option value="mano_obra">Mano de Obra</option>
                      <option value="reposicion">Reposición</option>
                      <option value="otro">Otro</option>
                    </select>
                    <input
                      required
                      placeholder="Descripción del gasto"
                      value={nuevoCosto.descripcion}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, descripcion: e.target.value })}
                      className="hg-field text-xs sm:col-span-2"
                    />
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Monto ($)"
                      value={nuevoCosto.monto}
                      onChange={(e) => setNuevoCosto({ ...nuevoCosto, monto: e.target.value })}
                      className="hg-field text-xs font-mono text-right"
                    />
                    <Button type="submit" variant="primary" size="sm">
                      + Agregar
                    </Button>
                  </div>
                </form>

                {/* Listado de costos */}
                <div className="border border-line rounded-panel overflow-hidden">
                  <table className="hg-table text-xs">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th>Fecha</th>
                        <th className="text-right">Monto ($)</th>
                        <th className="text-center" />
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCaso.costos || []).map((c) => (
                        <tr key={c.id}>
                          <td className="capitalize font-semibold">{c.tipo_costo.replaceAll('_', ' ')}</td>
                          <td>{c.descripcion}</td>
                          <td className="text-ink-muted t-num">{c.fecha}</td>
                          <td className="text-right font-mono t-num font-bold text-ink">
                            ${Number(c.monto).toLocaleString('es-CL')}
                          </td>
                          <td className="text-center">
                            <Button
                              variant="destructive"
                              size="sm"
                              icon={Trash2}
                              onClick={() => void handleEliminarCosto(c.id)}
                            />
                          </td>
                        </tr>
                      ))}
                      {(selectedCaso.costos || []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-ink-muted">
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
                <form onSubmit={handleAgregarEvidencia} className="bg-surface-muted p-3.5 rounded-panel border border-line space-y-3">
                  <span className="t-caption font-semibold text-ink block">Registrar fotografía o acta de evidencia</span>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                    <select
                      value={nuevaEvidencia.tipo_evidencia}
                      onChange={(e) => setNuevaEvidencia({ ...nuevaEvidencia, tipo_evidencia: e.target.value as TipoEvidenciaPostventa })}
                      className="hg-field text-xs font-semibold"
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
                      className="hg-field text-xs sm:col-span-2"
                    />
                    <Button type="submit" variant="primary" size="sm" icon={Camera}>
                      Subir
                    </Button>
                  </div>
                </form>

                {/* Conformidad del cliente */}
                <div className="bg-surface rounded-panel border border-line p-3.5 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCaso.conformidad_cliente}
                      onChange={(e) => void handleUpdateDiagnostico({ conformidad_cliente: e.target.checked })}
                      className="rounded border-line text-success focus:ring-success w-4 h-4"
                    />
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 size={15} className="text-success" aria-hidden />
                      <span>Conformidad expresa del cliente validada y recibida</span>
                    </span>
                  </label>
                  <input
                    value={selectedCaso.conformidad_observaciones || ''}
                    onChange={(e) => void handleUpdateDiagnostico({ conformidad_observaciones: e.target.value })}
                    placeholder="Observaciones de recepción conforme (ej. firmado en terreno sin reparos)"
                    className="hg-field text-xs"
                  />
                </div>

                {/* Galería de evidencias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(selectedCaso.evidencias || []).map((ev) => (
                    <div key={ev.id} className="border border-line rounded-control overflow-hidden bg-surface shadow-xs space-y-2 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <StatusBadge tone={ev.tipo_evidencia === 'conformidad' ? 'success' : 'neutral'}>
                          {ev.tipo_evidencia.toUpperCase()}
                        </StatusBadge>
                        <span className="t-caption text-ink-muted t-num">{ev.created_at.split('T')[0]}</span>
                      </div>
                      <div className="aspect-video bg-surface-muted rounded-control overflow-hidden flex items-center justify-center border border-line-subtle">
                        {ev.archivo_url.startsWith('http') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ev.archivo_url} alt={ev.nombre_archivo || 'Foto'} className="w-full h-full object-cover" />
                        ) : (
                          <Camera size={24} className="text-ink-muted" aria-hidden />
                        )}
                      </div>
                      <p className="t-caption text-ink line-clamp-2">{ev.descripcion || ev.nombre_archivo}</p>
                    </div>
                  ))}
                  {(selectedCaso.evidencias || []).length === 0 && (
                    <div className="col-span-3 text-center py-8 t-caption text-ink-muted">
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
                  <span className="t-caption font-semibold text-ink flex items-center gap-2">
                    <Shield size={16} className="text-accent-ink" aria-hidden />
                    <span>Certificado de Garantía Técnica Hormiglass</span>
                  </span>
                  <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
                    Imprimir certificado
                  </Button>
                </div>

                {/* Hoja de Garantía */}
                <div className="bg-surface border border-line rounded-panel p-6 space-y-4 text-xs font-sans text-ink shadow-xs">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <h2 className="t-section text-ink">HORMIGLASS PREFABRICADOS</h2>
                      <p className="t-caption text-ink-muted">Sociedad Comercial y de Transportes Valverde e Hijos Ltda.</p>
                      <p className="t-caption text-ink-muted">Portezuelo 1502, San Bernardo, Santiago</p>
                    </div>
                    <div className="text-right">
                      <CodeStamp>{selectedCaso.folio}</CodeStamp>
                      <span className="t-caption text-ink-muted block mt-1">
                        Emisión: {new Date().toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  </div>

                  <div className="text-center py-2">
                    <h3 className="t-section uppercase tracking-wide text-ink">
                      CERTIFICADO DE RESOLUCIÓN Y COBERTURA DE GARANTÍA TÉCNICA
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-surface-muted p-3.5 rounded-control border border-line">
                    <div>
                      <strong>Cliente:</strong> {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre}
                    </div>
                    <div>
                      <strong>RUT:</strong> {selectedCaso.cliente?.rut || '—'}
                    </div>
                    <div>
                      <strong>Obra:</strong> {selectedCaso.obra || '—'}
                    </div>
                    <div>
                      <strong>Nota de Venta (NV):</strong> {selectedCaso.oportunidad?.codigo}
                    </div>
                    <div>
                      <strong>Producto / Partida:</strong> {selectedCaso.producto_texto || selectedCaso.producto?.nombre || 'Prefabricados de Hormigón'}
                    </div>
                    <div>
                      <strong>Resolución:</strong> {RESOLUCIONES_MAP[selectedCaso.resolucion || 'en_evaluacion']?.label}
                    </div>
                  </div>

                  <div className="space-y-1.5 leading-relaxed">
                    <h4 className="font-bold text-ink uppercase t-caption">1. Alcance de la Cobertura:</h4>
                    <p className="text-ink-muted">
                      Hormiglass certifica que el reclamo registrado bajo el folio {selectedCaso.folio} ha sido evaluado técnicamente conforme a los estándares de fabricación de hormigón. En mérito del diagnóstico ({selectedCaso.causa_raiz || 'Técnico'}), se determina la resolución de cobertura correspondiente a reparación, reposición y/o ajuste de obra según lo pactado.
                    </p>
                  </div>

                  <div className="space-y-1.5 leading-relaxed">
                    <h4 className="font-bold text-ink uppercase t-caption">2. Exclusiones y Condiciones:</h4>
                    <p className="text-ink-muted">
                      La presente garantía no cubre daños atribuibles a movimientos imprevistos del terreno, sobrecargas vehiculares no especificadas en la cotización original, modificaciones posteriores ejecutadas por terceros o negligencia en el mantenimiento de juntas y sellos.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-8 pt-8 border-t border-line text-center">
                    <div>
                      <div className="border-b border-line w-48 mx-auto mb-1" />
                      <span className="block font-semibold text-ink">Mariela Valverde / Gerencia Técnica</span>
                      <span className="t-caption text-ink-muted">Hormiglass Prefabricados</span>
                    </div>
                    <div>
                      <div className="border-b border-line w-48 mx-auto mb-1" />
                      <span className="block font-semibold text-ink">Conformidad del Cliente</span>
                      <span className="t-caption text-ink-muted">
                        {selectedCaso.cliente?.apellido_razon_social || selectedCaso.cliente?.nombre}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN DE CIERRE CON EXPLICACIÓN VISUAL DE CONDICIONES */}
            <div className="border-t border-line pt-4 space-y-3 bg-surface-muted p-4 rounded-panel">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-ink block">Condiciones obligatorias para cierre del caso:</span>
                  <p className="t-caption text-ink-muted mt-0.5">
                    El sistema exige acreditar estos 4 hitos antes de marcar el caso como cerrado.
                  </p>
                </div>
              </div>

              {/* Lista interactiva de condiciones con explicación de bloqueo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className={`p-2 rounded-control border flex items-center gap-2 ${validacionCierre.fotos ? 'bg-success-soft border-success-line text-success' : 'bg-surface border-line text-ink-muted'}`}>
                  {validacionCierre.fotos ? <CheckCircle2 size={15} /> : <XCircle size={15} className="text-danger" />}
                  <span>Fotografías finales (después o conformidad)</span>
                </div>

                <div className={`p-2 rounded-control border flex items-center gap-2 ${validacionCierre.conformidad ? 'bg-success-soft border-success-line text-success' : 'bg-surface border-line text-ink-muted'}`}>
                  {validacionCierre.conformidad ? <CheckCircle2 size={15} /> : <XCircle size={15} className="text-danger" />}
                  <span>Conformidad expresa del cliente validada</span>
                </div>

                <div className={`p-2 rounded-control border flex items-center gap-2 ${validacionCierre.causa ? 'bg-success-soft border-success-line text-success' : 'bg-surface border-line text-ink-muted'}`}>
                  {validacionCierre.causa ? <CheckCircle2 size={15} /> : <XCircle size={15} className="text-danger" />}
                  <span>Causa raíz técnica clasificada</span>
                </div>

                <div className={`p-2 rounded-control border flex items-center gap-2 ${validacionCierre.costos ? 'bg-success-soft border-success-line text-success' : 'bg-surface border-line text-ink-muted'}`}>
                  {validacionCierre.costos ? <CheckCircle2 size={15} /> : <XCircle size={15} className="text-danger" />}
                  <span>Costos imputados registrados (&gt; $0)</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {!validacionCierre.listo && selectedCaso.estado !== 'cerrado' && selectedCaso.estado !== 'resuelto' && (
                  <p className="t-caption text-danger flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>Cierre bloqueado: completa los requisitos marcados con cruz roja.</span>
                  </p>
                )}

                {selectedCaso.estado !== 'cerrado' && selectedCaso.estado !== 'resuelto' ? (
                  <Button
                    variant="primary"
                    disabled={!validacionCierre.listo}
                    onClick={() => void handleCambiarEstado('cerrado')}
                    icon={CheckCircle2}
                    className="ml-auto"
                  >
                    Cerrar caso de postventa
                  </Button>
                ) : (
                  <div className="ml-auto">
                    <StatusBadge tone="success">
                      Caso cerrado el {selectedCaso.fecha_cierre?.split('T')[0] || 'hoy'}
                    </StatusBadge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
