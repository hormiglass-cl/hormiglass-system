'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Coins, Hourglass, Wallet } from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import { useAuth } from '../../lib/context/AuthContext';
import type { OportunidadVenta, Usuario } from '../../lib/types';
import { Button, Panel, SearchField, StatusBadge, type Tone } from '../../components/ui/crm';
import { useConfirm, useToast } from '../../components/ui/feedback';
import { MetricCard } from '../../components/ui/MetricCard';
import { ColumnMenu, useColumnPrefs } from '../../components/ui/ColumnMenu';
import { FilterMenu, FilterBar, useFilterUi, matchMultiFilter, type FilterDefinition } from '../../components/ui/FilterPills';
import { Pagination } from '../../components/Pagination';

type Fila = OportunidadVenta & {
  cliente?: { nombre?: string; apellido_razon_social?: string; rut?: string } | null;
};
type EstadoComision = 'pendiente' | 'lista_para_pago' | 'pagada';
type Col = 'codigo' | 'cliente' | 'ejecutivo' | 'monto' | 'porcentaje' | 'comision' | 'estado' | 'fecha_pago';

const COL_ORDER: Col[] = ['codigo', 'cliente', 'ejecutivo', 'monto', 'porcentaje', 'comision', 'estado', 'fecha_pago'];
const COL_VISIBLE: Record<Col, boolean> = {
  codigo: true,
  cliente: true,
  ejecutivo: true,
  monto: true,
  porcentaje: true,
  comision: true,
  estado: true,
  fecha_pago: true,
};
const COL_LABELS: Record<Col, string> = {
  codigo: 'Oportunidad de venta',
  cliente: 'Cliente',
  ejecutivo: 'Ejecutivo',
  monto: 'Monto de la venta',
  porcentaje: '% comisión',
  comision: 'Comisión',
  estado: 'Estado',
  fecha_pago: 'Fecha de pago',
};

const ESTADO_LABEL: Record<EstadoComision, string> = {
  pendiente: 'Pendiente',
  lista_para_pago: 'Lista para pago',
  pagada: 'Pagada',
};
const ESTADO_TONE: Record<EstadoComision, Tone> = {
  pendiente: 'neutral',
  lista_para_pago: 'warning',
  pagada: 'success',
};

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function calcular(op: Fila) {
  const monto = Number(op.monto_estimado || 0);
  const pct = typeof op.comision_porcentaje === 'number' && op.comision_porcentaje >= 0 ? op.comision_porcentaje : 3;
  const comision =
    typeof op.comision_monto === 'number' && op.comision_monto >= 0 ? op.comision_monto : Math.round((monto * pct) / 100);
  const estado = (op.comision_estado || 'pendiente') as EstadoComision;
  return { monto, pct, comision, estado };
}

export default function ComisionesPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { currentUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = currentUser?.rol === 'admin';

  const [filas, setFilas] = useState<Fila[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [liquidandoId, setLiquidandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const colPrefs = useColumnPrefs<Col>('hormiglass_comisiones_cols_v1', COL_ORDER, COL_VISIBLE);
  const filterUi = useFilterUi();

  const cargar = useCallback(async () => {
    if (!currentUser) return;
    let consulta = supabase
      .from('oportunidades')
      .select('*, cliente:clientes(nombre, apellido_razon_social, rut)')
      .not('asignado_a', 'is', null)
      // A lost opportunity earns no commission.
      .is('perdida_at', null)
      .order('created_at', { ascending: false });
    // Un colaborador solo ve las comisiones de sus propias ventas.
    if (!isAdmin) consulta = consulta.eq('asignado_a', currentUser.id);
    const [opRes, usrRes] = await Promise.all([consulta, supabase.from('usuarios').select('*')]);
    if (opRes.error) {
      toast({ message: 'No se pudieron cargar las comisiones.', tone: 'danger' });
    } else {
      setFilas((opRes.data ?? []) as Fila[]);
    }
    setUsuarios((usrRes.data ?? []) as Usuario[]);
    setLoading(false);
  }, [currentUser, isAdmin, supabase, toast]);

  useEffect(() => {
    const t = window.setTimeout(() => void cargar(), 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  const nombreEjecutivo = useCallback(
    (id?: string | null) => usuarios.find((u) => u.id === id)?.nombre ?? 'Sin asignar',
    [usuarios]
  );

  const definiciones: FilterDefinition[] = useMemo(() => {
    const base: FilterDefinition[] = [
      {
        id: 'estado',
        label: 'Estado',
        allLabel: 'Todos los estados',
        options: (Object.keys(ESTADO_LABEL) as EstadoComision[]).map((v) => ({ value: v, label: ESTADO_LABEL[v] })),
      },
    ];
    if (isAdmin) {
      const ids = [...new Set(filas.map((f) => f.asignado_a).filter((x): x is string => !!x))];
      base.push({
        id: 'ejecutivo',
        label: 'Ejecutivo',
        allLabel: 'Todos los ejecutivos',
        options: ids.map((id) => ({ value: id, label: nombreEjecutivo(id) })),
      });
    }
    return base;
  }, [filas, isAdmin, nombreEjecutivo]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      const { estado } = calcular(f);
      if (!matchMultiFilter(filtros.estado, (v) => v === estado)) return false;
      if (!matchMultiFilter(filtros.ejecutivo, (v) => v === f.asignado_a)) return false;
      if (!q) return true;
      return [f.titulo, f.codigo, f.cliente?.nombre, f.cliente?.apellido_razon_social, f.cliente?.rut, nombreEjecutivo(f.asignado_a)]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [filas, filtros, busqueda, nombreEjecutivo]);

  const stats = useMemo(() => {
    const acc = {
      total: 0, nTotal: 0,
      pendiente: 0, nPendiente: 0,
      lista: 0, nLista: 0,
      pagada: 0, nPagada: 0,
    };
    for (const f of visibles) {
      const { comision, estado } = calcular(f);
      acc.total += comision;
      acc.nTotal += 1;
      if (estado === 'pagada') { acc.pagada += comision; acc.nPagada += 1; }
      else if (estado === 'lista_para_pago') { acc.lista += comision; acc.nLista += 1; }
      else { acc.pendiente += comision; acc.nPendiente += 1; }
    }
    return acc;
  }, [visibles]);

  const filtrarEstado = (estado: EstadoComision | null) => {
    setFiltros((prev) => {
      const next = { ...prev };
      if (!estado || prev.estado === estado) delete next.estado;
      else next.estado = estado;
      return next;
    });
    setPagina(1);
  };

  const liquidar = async (op: Fila) => {
    const { comision } = calcular(op);
    const ok = await confirm({
      title: 'Liquidar comisión de venta',
      message: `¿Confirmas marcar como pagada la comisión de ${clp(comision)} de "${op.titulo || op.codigo}" para ${nombreEjecutivo(op.asignado_a)}? El pago queda registrado a tu nombre.`,
      confirmLabel: 'Confirmar pago',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    try {
      setLiquidandoId(op.id);
      const { error } = await supabase.rpc('marcar_comision_pagada', { p_oportunidad_id: op.id });
      if (error) throw error;
      toast({ message: 'Comisión liquidada.', tone: 'success' });
      await cargar();
    } catch (err) {
      toast({ message: (err as Error)?.message || 'No se pudo liquidar la comisión.', tone: 'danger' });
    } finally {
      setLiquidandoId(null);
    }
  };

  const pagina_filas = visibles.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <div className="hg-page space-y-5 pb-24">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Comisión proyectada"
          value={clp(stats.total)}
          icon={Coins}
          tone="info"
          subtitle={`${stats.nTotal} ${stats.nTotal === 1 ? 'venta' : 'ventas'}`}
          active={!filtros.estado}
          onClick={() => filtrarEstado(null)}
        />
        <MetricCard
          title="Listas para pago"
          value={clp(stats.lista)}
          icon={Clock}
          tone="warning"
          subtitle={`${stats.nLista} por liquidar`}
          active={filtros.estado === 'lista_para_pago'}
          onClick={() => filtrarEstado('lista_para_pago')}
        />
        <MetricCard
          title="Pagadas"
          value={clp(stats.pagada)}
          icon={CheckCircle2}
          tone="success"
          subtitle={`${stats.nPagada} liquidadas`}
          active={filtros.estado === 'pagada'}
          onClick={() => filtrarEstado('pagada')}
        />
        <MetricCard
          title="Pendientes"
          value={clp(stats.pendiente)}
          icon={Hourglass}
          tone="neutral"
          subtitle={`${stats.nPendiente} en proceso`}
          active={filtros.estado === 'pendiente'}
          onClick={() => filtrarEstado('pendiente')}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="w-full max-w-sm"
            placeholder="Buscar por venta, cliente o ejecutivo"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
          />
          <div className="ml-auto flex items-center gap-2">
            <ColumnMenu labels={COL_LABELS} prefs={colPrefs} locked={['codigo']} align="right" />
            <FilterMenu
              iconOnly
              align="right"
              triggerClassName="min-h-9 justify-center rounded-lg px-2.5 text-[13px]"
              filters={definiciones}
              activeFilters={filtros}
              ui={filterUi}
            />
          </div>
        </div>
        <FilterBar
          filters={definiciones}
          activeFilters={filtros}
          onFilterChange={(id, val) => {
            setFiltros((prev) => ({ ...prev, [id]: val }));
            setPagina(1);
          }}
          onClearAll={() => setFiltros({})}
          ui={filterUi}
        />
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="hg-table min-w-max whitespace-nowrap">
            <thead>
              <tr>
                {colPrefs.visibleOrder.map((k) => (
                  <th key={k}>
                    {COL_LABELS[k]}
                  </th>
                ))}
                {isAdmin && <th>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colPrefs.visibleOrder.length + 1} className="p-10 text-center text-ink-muted">
                    Cargando comisiones…
                  </td>
                </tr>
              ) : pagina_filas.length === 0 ? (
                <tr>
                  <td colSpan={colPrefs.visibleOrder.length + 1} className="p-10 text-center text-ink-muted">
                    <Wallet className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                    <p className="text-sm font-semibold text-ink">No hay comisiones para mostrar.</p>
                  </td>
                </tr>
              ) : (
                pagina_filas.map((op) => {
                  const { monto, pct, comision, estado } = calcular(op);
                  const celdas: Record<Col, React.ReactNode> = {
                    codigo: (
                      <td>
                        <Link
                          href={`/ventas?oportunidad=${op.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-ink hover:text-accent-ink hover:underline"
                        >
                          {op.codigo || op.id.slice(0, 8)}
                        </Link>
                      </td>
                    ),
                    cliente: <td className="text-ink">{op.cliente?.nombre || op.cliente?.apellido_razon_social || 'Cliente directo'}</td>,
                    ejecutivo: <td className="text-ink-muted">{nombreEjecutivo(op.asignado_a)}</td>,
                    monto: <td className="t-num text-ink">{clp(monto)}</td>,
                    porcentaje: <td className="t-num text-ink-muted">{pct}%</td>,
                    comision: <td className="t-num font-semibold text-ink">{clp(comision)}</td>,
                    estado: (
                      <td>
                        <StatusBadge tone={ESTADO_TONE[estado]} icon={false}>
                          {ESTADO_LABEL[estado]}
                        </StatusBadge>
                      </td>
                    ),
                    fecha_pago: (
                      <td className="t-num text-ink-muted">
                        {estado === 'pagada' && op.comision_fecha_pago ? op.comision_fecha_pago.split('T')[0] : '—'}
                      </td>
                    ),
                  };
                  return (
                    <tr key={op.id} onClick={() => router.push(`/ventas?oportunidad=${op.id}`)} className="cursor-pointer transition-colors hover:bg-surface-muted">
                      {colPrefs.visibleOrder.map((k) => React.cloneElement(celdas[k] as React.ReactElement, { key: k }))}
                      {isAdmin && (
                        <td onClick={(e) => e.stopPropagation()}>
                          {estado === 'lista_para_pago' ? (
                            <Button variant="primary" size="sm" icon={Coins} disabled={liquidandoId === op.id} onClick={() => void liquidar(op)}>
                              {liquidandoId === op.id ? 'Pagando…' : 'Liquidar'}
                            </Button>
                          ) : (
                            <span className="t-caption text-ink-subtle">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={pagina}
          totalItems={visibles.length}
          itemsPerPage={porPagina}
          onPageChange={setPagina}
          onItemsPerPageChange={setPorPagina}
        />
      </Panel>
    </div>
  );
}
