'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, Minus } from 'lucide-react';
import { NAV_GROUPS } from '../../lib/navigation';
import { useAuth } from '../../lib/context/AuthContext';
import { createClient } from '../../lib/supabase/client';
import { mensajeError } from '../../lib/errores';
import { SECCIONES_SOLO_ADMIN } from '../../lib/types';
import { Button, SearchField, Select, StatusBadge } from '../ui/crm';
import { useToast } from '../ui/feedback';
import { Grupo } from './Secciones';

const Contenedor = ({ children, ancho = 'max-w-2xl' }: { children: React.ReactNode; ancho?: string }) => (
  <div className={`mx-auto space-y-6 pb-10 ${ancho}`}>{children}</div>
);

/* ─── Roles y permisos (solo lectura) ────────────────────────────────── */

export function SeccionRoles() {
  const filas = NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ grupo: g.label, item: it })));
  const colaboradorAccede = (href: string, roles?: string[]) => {
    if (roles && !roles.includes('user')) return false;
    return !SECCIONES_SOLO_ADMIN.some((s) => href === s.prefijo || href.startsWith(`${s.prefijo}/`));
  };
  const Marca = ({ ok }: { ok: boolean }) =>
    ok ? <Check size={16} className="text-success" aria-label="Con acceso" /> : <Minus size={16} className="text-ink-subtle" aria-label="Sin acceso" />;
  return (
    <Contenedor ancho="max-w-3xl">
      <Grupo
        titulo="Acceso por sección"
        pie="El Administrador entra a todo y es el único que modifica Recursos humanos, Caja, Bancos y empresas y Configuración. El Colaborador opera el resto. Los permisos se asignan eligiendo el rol de cada persona en Usuarios."
      >
        <div className="overflow-x-auto">
          <table className="hg-table min-w-max whitespace-nowrap">
            <thead>
              <tr>
                <th>Sección</th>
                <th>Administrador</th>
                <th>Colaborador</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ grupo, item }) => (
                <tr key={item.href}>
                  <td>
                    <span className="font-medium text-ink">{item.label}</span>
                    <span className="t-caption ml-2">{grupo}</span>
                  </td>
                  <td><Marca ok /></td>
                  <td><Marca ok={colaboradorAccede(item.href, item.roles as string[] | undefined)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Grupo>
    </Contenedor>
  );
}

/* ─── Registro de actividad ──────────────────────────────────────────── */

type Log = {
  id: string;
  tipo_accion: string;
  entidad: string;
  descripcion: string;
  usuario_id: string | null;
  created_at: string;
};

const ACCIONES: Record<string, { label: string; tone: 'success' | 'info' | 'danger' | 'neutral' | 'warning' }> = {
  creacion: { label: 'Creación', tone: 'success' },
  actualizacion: { label: 'Actualización', tone: 'info' },
  eliminacion: { label: 'Eliminación', tone: 'danger' },
  comentario: { label: 'Comentario', tone: 'neutral' },
  estado_cambiado: { label: 'Cambio de estado', tone: 'warning' },
};
const PAGINA = 200;

export function SeccionActividad() {
  const supabase = useMemo(() => createClient(), []);
  const { usersList } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [entidad, setEntidad] = useState('');

  const cargar = useCallback(
    async (desde: number) => {
      const { data, error: err } = await supabase
        .from('logs_sistema')
        .select('id, tipo_accion, entidad, descripcion, usuario_id, created_at')
        .order('created_at', { ascending: false })
        .range(desde, desde + PAGINA - 1);
      if (err) {
        setError(mensajeError(err, 'No se pudo cargar el registro de actividad.'));
      } else {
        setError('');
        setLogs((prev) => (desde === 0 ? (data as Log[]) : [...prev, ...(data as Log[])]));
        setHayMas((data?.length ?? 0) === PAGINA);
      }
      setCargando(false);
    },
    [supabase],
  );

  useEffect(() => {
    window.setTimeout(() => void cargar(0), 0);
  }, [cargar]);

  const nombre = (id: string | null) => (id ? usersList.find((u) => u.id === id)?.nombre ?? 'Usuario eliminado' : 'Sistema');
  const entidades = useMemo(() => Array.from(new Set(logs.map((l) => l.entidad))).sort(), [logs]);
  const visibles = logs.filter((l) => {
    if (entidad && l.entidad !== entidad) return false;
    const q = busqueda.trim().toLowerCase();
    return !q || l.descripcion.toLowerCase().includes(q) || nombre(l.usuario_id).toLowerCase().includes(q);
  });

  return (
    <Contenedor ancho="max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField placeholder="Buscar en la actividad…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="max-w-sm" />
        <div className="w-48">
          <Select value={entidad} onChange={(e) => setEntidad(e.target.value)}>
            <option value="">Todas las secciones</option>
            {entidades.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </Select>
        </div>
      </div>
      {error && <p role="alert" className="rounded-control border border-danger-line bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <section className="hg-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="hg-table min-w-max whitespace-nowrap">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Persona</th>
                <th>Acción</th>
                <th>Sección</th>
                <th>Descripción</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={5} className="py-10 text-center text-ink-muted">Cargando actividad…</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-ink-muted">No hay actividad que coincida.</td></tr>
              ) : (
                visibles.map((l) => {
                  const a = ACCIONES[l.tipo_accion] ?? { label: l.tipo_accion, tone: 'neutral' as const };
                  return (
                    <tr key={l.id}>
                      <td className="t-num text-ink-muted">
                        {new Date(l.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')}
                        {', '}
                        {new Date(l.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="text-ink">{nombre(l.usuario_id)}</td>
                      <td><StatusBadge tone={a.tone}>{a.label}</StatusBadge></td>
                      <td className="text-ink-muted">{l.entidad}</td>
                      <td><span className="block max-w-[520px] truncate text-ink" title={l.descripcion}>{l.descripcion}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {hayMas && (
          <div className="flex justify-center border-t border-line-subtle p-3">
            <Button onClick={() => void cargar(logs.length)}>Cargar más</Button>
          </div>
        )}
      </section>
    </Contenedor>
  );
}

/* ─── Respaldo y exportación ─────────────────────────────────────────── */

const EXPORTABLES: { tabla: string; label: string; detalle: string }[] = [
  { tabla: 'clientes', label: 'Clientes', detalle: 'Datos de contacto y nichos' },
  { tabla: 'oportunidades', label: 'Oportunidades de venta', detalle: 'Pipeline completo con montos y comisiones' },
  { tabla: 'cotizaciones', label: 'Cotizaciones', detalle: 'Cotizaciones emitidas y sus versiones' },
  { tabla: 'caja_movimientos', label: 'Movimientos de caja', detalle: 'Ingresos y egresos' },
  { tabla: 'proveedores', label: 'Proveedores', detalle: 'Directorio de proveedores' },
  { tabla: 'ordenes_compra', label: 'Órdenes de compra', detalle: 'Órdenes emitidas a proveedores' },
];

function aCsv(filas: Record<string, unknown>[]): string {
  const columnas = Array.from(filas.reduce((set, f) => { Object.keys(f).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const celda = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [columnas.join(';'), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(';'))].join('\r\n');
}

export function SeccionRespaldo() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [exportando, setExportando] = useState<string | null>(null);

  const exportar = async (tabla: string, label: string) => {
    setExportando(tabla);
    try {
      const filas: Record<string, unknown>[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + 999);
        if (error) throw error;
        filas.push(...((data ?? []) as Record<string, unknown>[]));
        if ((data?.length ?? 0) < 1000) break;
      }
      if (filas.length === 0) {
        toast({ message: `${label}: no hay datos para exportar.`, tone: 'info' });
        return;
      }
      const blob = new Blob(['﻿' + aCsv(filas)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tabla}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ message: `${label}: ${filas.length} registros exportados`, tone: 'success' });
    } catch (err) {
      toast({ message: mensajeError(err, `No se pudo exportar ${label.toLowerCase()}.`), tone: 'danger' });
    } finally {
      setExportando(null);
    }
  };

  return (
    <Contenedor>
      <Grupo titulo="Exportar a Excel (CSV)" pie="Descarga una copia de los datos. Se abre directo en Excel. Es una copia de consulta; no reemplaza el respaldo automático de la base de datos.">
        {EXPORTABLES.map((e) => (
          <div key={e.tabla} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{e.label}</p>
              <p className="t-caption">{e.detalle}</p>
            </div>
            <Button icon={Download} onClick={() => void exportar(e.tabla, e.label)} disabled={exportando !== null}>
              {exportando === e.tabla ? 'Exportando…' : 'Descargar'}
            </Button>
          </div>
        ))}
      </Grupo>
    </Contenedor>
  );
}
