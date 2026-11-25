'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Landmark,
  Wallet,
} from 'lucide-react';
import { createClient } from '../../lib/supabase/client';
import type { CostoPorCliente, MovimientoCaja, OportunidadVenta } from '../../lib/types';
import { labelMedioPago, labelTipoDocumento } from '../../lib/caja-catalogos';
import { CodeStamp, Panel, Select, StatusBadge } from '../ui/crm';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

export function ClienteCentroCostos({
  clienteId,
  oportunidades,
}: {
  clienteId: string;
  oportunidades: OportunidadVenta[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [resumen, setResumen] = useState<CostoPorCliente | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroOpId, setFiltroOpId] = useState<string>('todas');

  const opIds = useMemo(() => oportunidades.map((o) => o.id), [oportunidades]);
  const opIdsKey = opIds.join(',');

  useEffect(() => {
    let alive = true;
    const cargar = async () => {
      setLoading(true);
      try {
        const selectMovs = `
          *,
          cuenta_bancaria:cuentas_bancarias(id, alias, banco, empresa:empresas(id, slug, razon_social)),
          centro_costo:caja_centros_costo(id, codigo, nombre),
          insumo:caja_insumos(id, codigo, nombre, grupo, unidad),
          vehiculo:caja_vehiculos(id, nombre, patente),
          oportunidad:oportunidades(id, codigo, titulo, cliente_id),
          proveedor:proveedores(id, nombre),
          trabajador:trabajadores(id, nombre, cargo)
        `;

        const orFilter =
          opIds.length > 0
            ? `cliente_id.eq.${clienteId},oportunidad_id.in.(${opIds.join(',')})`
            : `cliente_id.eq.${clienteId}`;

        const [resVista, resMovs] = await Promise.all([
          supabase
            .from('v_costos_por_cliente')
            .select('*')
            .eq('cliente_id', clienteId)
            .maybeSingle(),
          supabase
            .from('caja_movimientos')
            .select(selectMovs)
            .or(orFilter)
            .order('fecha', { ascending: false }),
        ]);

        if (!alive) return;
        setResumen((resVista.data as CostoPorCliente) || null);
        setMovimientos((resMovs.data || []) as MovimientoCaja[]);
      } catch (err) {
        console.error('Error cargando centro de costos del cliente:', err);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void cargar();
    return () => {
      alive = false;
    };
  }, [supabase, clienteId, opIdsKey, opIds]);

  const movsFiltrados = useMemo(() => {
    if (filtroOpId === 'todas') return movimientos;
    if (filtroOpId === 'sin_obra') return movimientos.filter((m) => !m.oportunidad_id);
    return movimientos.filter((m) => m.oportunidad_id === filtroOpId);
  }, [movimientos, filtroOpId]);

  const desgloseCaja = useMemo(() => {
    let materiaPrima = 0;
    let combustibles = 0;
    let trasladosTrabajadores = 0;
    let otrosEgresos = 0;

    for (const m of movsFiltrados) {
      if (m.tipo !== 'egreso' || m.orden_compra_id) continue;
      const val = Number(m.monto || 0);
      if (m.insumo?.grupo === 'materia_prima') materiaPrima += val;
      else if (m.insumo?.grupo === 'combustible') combustibles += val;
      else if (m.trabajador_id) trasladosTrabajadores += val;
      else otrosEgresos += val;
    }

    return { materiaPrima, combustibles, trasladosTrabajadores, otrosEgresos };
  }, [movsFiltrados]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface p-6 text-center t-caption">
        Cargando centro de costos del cliente…
      </div>
    );
  }

  const totalIngresos = Number(resumen?.total_ingresos || 0);
  const valorCotizado = Number(resumen?.valor_cotizado_total || 0);
  const costoTotal = Number(resumen?.costo_total || 0);
  const margenReal = Number(resumen?.margen_real || 0);
  const sobrecosto = Number(resumen?.sobrecosto || 0);
  const tieneSobrecosto = Boolean(resumen?.tiene_sobrecosto) || (costoTotal > 0 && margenReal < 0);

  const rubros = [
    { label: 'Compras asignadas (OC)', valor: Number(resumen?.costo_compras_asignadas || 0) },
    { label: 'Fletes y despachos', valor: Number(resumen?.costo_fletes_despacho || 0) },
    { label: 'Postventa y garantías', valor: Number(resumen?.costo_postventa || 0) },
    { label: 'Materia prima (caja directa)', valor: desgloseCaja.materiaPrima },
    { label: 'Combustibles (caja directa)', valor: desgloseCaja.combustibles },
    { label: 'Traslados / trabajadores', valor: desgloseCaja.trasladosTrabajadores },
    { label: 'Otros egresos de caja', valor: desgloseCaja.otrosEgresos },
  ].filter((r) => r.valor > 0);

  return (
    <div className="mt-5 space-y-4 border-t border-line-subtle pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Wallet className="h-4 w-4 text-accent-ink" aria-hidden />
            <span>Centro de costos y rentabilidad</span>
            {tieneSobrecosto ? (
              <StatusBadge tone="danger">Sobrecosto</StatusBadge>
            ) : costoTotal > 0 ? (
              <StatusBadge tone="success">En margen</StatusBadge>
            ) : null}
          </h3>
          <p className="t-caption mt-0.5">
            Consolidado de ingresos, compras, fletes, postventa y movimientos de caja imputados al cliente o sus obras.
          </p>
        </div>
        <Link
          href="/caja?tab=movimientos"
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink hover:underline"
        >
          <span>Ir a Movimientos de caja</span>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* KPIs financieros */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 space-y-1">
          <span className="flex items-center gap-1.5 t-caption">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
            Ingresos reales recibidos
          </span>
          <span className="t-num block text-xl font-semibold text-ink">{money(totalIngresos)} CLP</span>
          <span className="t-caption block">
            Cotizado total: {money(valorCotizado)} CLP
          </span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 space-y-1">
          <span className="flex items-center gap-1.5 t-caption">
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
            Costo total acumulado
          </span>
          <span className="t-num block text-xl font-semibold text-ink">{money(costoTotal)} CLP</span>
          <span className="t-caption block">
            Caja directa: {money(Number(resumen?.costo_caja_directo || 0))} · OC/Fletes/PV: {money(costoTotal - Number(resumen?.costo_caja_directo || 0))}
          </span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 space-y-1">
          <span className="flex items-center gap-1.5 t-caption">
            <span aria-hidden className={`h-2 w-2 rounded-full ${margenReal >= 0 ? 'bg-success' : 'bg-danger'}`} />
            Resultado neto (Ingresos − Costos)
          </span>
          <span className={`t-num block text-xl font-semibold ${margenReal >= 0 ? 'text-success' : 'text-danger'}`}>
            {money(margenReal)} CLP
          </span>
          <span className="t-caption block">
            {totalIngresos > 0 ? `${Number(resumen?.porcentaje_margen_real || 0).toFixed(1)}% sobre ingresos reales` : 'Sin ingresos registrados'}
          </span>
        </div>

        <div
          className={`rounded-xl border p-4 space-y-1 ${
            sobrecosto > 0 ? 'border-danger-line bg-danger-soft/50' : 'border-line bg-surface'
          }`}
        >
          <span className="flex items-center gap-1.5 t-caption">
            <AlertTriangle className={`h-3.5 w-3.5 ${sobrecosto > 0 ? 'text-danger' : 'text-ink-muted'}`} aria-hidden />
            Sobrecosto sobre presupuesto
          </span>
          <span className={`t-num block text-xl font-semibold ${sobrecosto > 0 ? 'text-danger' : 'text-ink'}`}>
            {money(sobrecosto)} CLP
          </span>
          <span className="t-caption block">
            {sobrecosto > 0 ? 'Los costos superan el monto cotizado / ingresado' : 'Dentro del presupuesto actual'}
          </span>
        </div>
      </div>

      {/* Desglose por rubro */}
      {rubros.length > 0 && (
        <Panel className="p-4 space-y-2.5">
          <p className="text-xs font-semibold text-ink">Desglose de costos por rubro</p>
          <div className="space-y-2">
            {(() => {
              const maxRubro = Math.max(...rubros.map((r) => r.valor), 1);
              return rubros.map((r) => (
                <div key={r.label}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-ink-muted">{r.label}</span>
                    <span className="t-num font-semibold text-ink">
                      {money(r.valor)} · {costoTotal > 0 ? `${Math.round((r.valor / costoTotal) * 100)}%` : '0%'}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(3, (r.valor / maxRubro) * 100)}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </Panel>
      )}

      {/* Detalle de movimientos imputados */}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle bg-surface-muted px-4 py-3">
          <span className="text-xs font-semibold text-ink">
            Movimientos de caja del centro de costos ({movsFiltrados.length})
          </span>
          {oportunidades.length > 0 && (
            <Select
              value={filtroOpId}
              onChange={(e) => setFiltroOpId(e.target.value)}
              className="hg-field-compact text-xs max-w-[230px]"
            >
              <option value="todas">Todas las obras / movimientos</option>
              <option value="sin_obra">Directos al cliente (sin NV)</option>
              {oportunidades.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.codigo} · {op.titulo}
                </option>
              ))}
            </Select>
          )}
        </div>

        {movsFiltrados.length === 0 ? (
          <p className="p-6 text-center text-xs text-ink-muted">
            No hay movimientos de caja imputados a este cliente{filtroOpId !== 'todas' ? ' con este filtro' : ''}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-line-subtle text-ink-muted">
                  <th className="p-3 font-semibold">Fecha</th>
                  <th className="p-3 font-semibold">Categoría y glosa</th>
                  <th className="p-3 font-semibold">Centro / Insumo / Responsable</th>
                  <th className="p-3 font-semibold">Respaldo</th>
                  <th className="p-3 font-semibold text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {movsFiltrados.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-muted/40">
                    <td className="t-num whitespace-nowrap p-3 text-ink-muted">
                      {new Date(m.fecha).toLocaleDateString('es-CL')}
                    </td>
                    <td className="p-3 max-w-[200px]">
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        {m.tipo === 'ingreso' ? (
                          <ArrowUpRight className="h-3.5 w-3.5 text-success shrink-0" aria-hidden />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 text-danger shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{m.categoria}</span>
                      </div>
                      {m.descripcion && m.descripcion !== m.categoria && (
                        <p className="t-micro text-ink-muted truncate pl-5">{m.descripcion}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {m.centro_costo && (
                          <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink">
                            {m.centro_costo.nombre}
                          </span>
                        )}
                        {m.insumo && (
                          <CodeStamp>{m.insumo.codigo} · {m.insumo.nombre}</CodeStamp>
                        )}
                        {m.oportunidad?.codigo && (
                          <span className="t-micro text-ink-muted">NV {m.oportunidad.codigo}</span>
                        )}
                        {m.trabajador?.nombre && (
                          <span className="t-micro text-ink-muted">Trab: {m.trabajador.nombre}</span>
                        )}
                        {m.vehiculo?.nombre && (
                          <span className="t-micro text-ink-muted">{m.vehiculo.nombre}</span>
                        )}
                        {m.proveedor?.nombre && (
                          <span className="t-micro text-ink-muted">Prov: {m.proveedor.nombre}</span>
                        )}
                        {!m.centro_costo && !m.insumo && !m.oportunidad && !m.trabajador && !m.vehiculo && !m.proveedor && (
                          <span className="text-ink-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {m.medio_pago || m.tipo_documento || m.cuenta_bancaria?.alias ? (
                        <div className="space-y-0.5">
                          {(m.medio_pago || m.tipo_documento) && (
                            <div className="text-ink">
                              {m.medio_pago ? labelMedioPago(m.medio_pago) : ''}
                              {m.medio_pago && m.tipo_documento ? ' · ' : ''}
                              {m.tipo_documento ? labelTipoDocumento(m.tipo_documento) : ''}
                            </div>
                          )}
                          {m.cuenta_bancaria?.alias && (
                            <div className="t-micro text-ink-muted inline-flex items-center gap-1">
                              <Landmark className="h-3 w-3" aria-hidden />
                              {m.cuenta_bancaria.alias}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className={`t-num p-3 text-right font-semibold whitespace-nowrap ${m.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                      {m.tipo === 'ingreso' ? '+' : '−'}${Number(m.monto).toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
