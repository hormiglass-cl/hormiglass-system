'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Building2, Edit2, FolderOpen, Landmark, ListChecks, Trash2, Truck, Upload, Wallet } from 'lucide-react';
import { createClient } from '../../../../lib/supabase/client';
import { useAuth } from '../../../../lib/context/AuthContext';
import { useBreadcrumb } from '../../../../lib/context/BreadcrumbContext';
import type { CuentaBancaria, Empresa, EmpresaHormiglass } from '../../../../lib/types';
import { CodeStamp, IconButton, Panel, RecordLayout, StatusBadge } from '../../../../components/ui/crm';
import { Fab } from '../../../../components/ui/Fab';
import { EmpresaSeguimiento, type EmpresaSeguimientoPartes } from '../../../../components/empresa/EmpresaSeguimiento';
import { TIPOS_CUENTA, useCuentasEmpresa } from '../../../../components/empresa/useCuentasEmpresa';

const EMPRESAS_VALIDAS = ['comercial', 'transportes', 'inmobiliaria'];

const EMPRESA_VISUAL: Record<string, { icon: typeof Building2; tile: string }> = {
  comercial: { icon: Briefcase, tile: 'bg-accent-soft text-accent-ink' },
  transportes: { icon: Truck, tile: 'bg-info-soft text-info' },
  inmobiliaria: { icon: Building2, tile: 'bg-violet-soft text-violet' },
};

type TabId = 'seguimiento' | 'cuentas';

export default function EmpresaFichaPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { currentUser } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { setCustomTitle: setBreadcrumbTitle } = useBreadcrumb();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('seguimiento');

  const puedeVerCuentas = currentUser?.rol === 'admin';

  const load = useCallback(async () => {
    const { data: emp } = await supabase.from('empresas').select('*').eq('slug', slug).maybeSingle();
    setEmpresa((emp as Empresa) || null);
    if (emp) {
      const { data } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('empresa_id', (emp as Empresa).id)
        .order('created_at');
      setCuentas((data || []) as CuentaBancaria[]);
    }
    setLoading(false);
  }, [supabase, slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setBreadcrumbTitle(empresa?.razon_social ?? null);
    return () => setBreadcrumbTitle(null);
  }, [empresa?.razon_social, setBreadcrumbTitle]);

  if (loading) return <div className="p-8 text-center t-caption">Cargando empresa…</div>;
  if (!empresa) {
    return (
      <div className="space-y-3 p-8 text-center">
        <p className="t-section text-ink">Empresa no encontrada</p>
        <button type="button" onClick={() => router.push('/caja/configuracion')} className="t-caption font-semibold text-accent-ink hover:underline">
          Volver a empresas
        </button>
      </div>
    );
  }

  return (
    <FichaEmpresa
      empresa={empresa}
      cuentas={cuentas}
      puedeVerCuentas={puedeVerCuentas}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onChanged={() => void load()}
    />
  );
}

const PARTES_VACIAS: EmpresaSeguimientoPartes = {
  seccionesNav: null,
  contenido: null,
  puedeGestionar: false,
  nuevaTask: () => {},
  subirDocumento: () => {},
  documentos: 0,
  tasksAbiertas: 0,
};

/** Las empresas nuevas aún no tienen carpetas de seguimiento: solo datos y cuentas. */
function SeguimientoOpcional({
  activo,
  empresa,
  children,
}: {
  activo: boolean;
  empresa: EmpresaHormiglass;
  children: (partes: EmpresaSeguimientoPartes) => React.ReactNode;
}) {
  if (!activo) return <>{children(PARTES_VACIAS)}</>;
  return <EmpresaSeguimiento empresa={empresa}>{children}</EmpresaSeguimiento>;
}

function FichaEmpresa({
  empresa,
  cuentas,
  puedeVerCuentas,
  activeTab,
  setActiveTab,
  onChanged,
}: {
  empresa: Empresa;
  cuentas: CuentaBancaria[];
  puedeVerCuentas: boolean;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const cuentasApi = useCuentasEmpresa(empresa, onChanged);
  const visual = EMPRESA_VISUAL[String(empresa.slug)] || { icon: Building2, tile: 'bg-surface-muted text-ink' };
  const Icono = visual.icon;
  const activas = cuentas.filter((c) => c.activo);
  const saldo = activas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);
  const conSeguimiento = EMPRESAS_VALIDAS.includes(String(empresa.slug));
  const tab: TabId = !conSeguimiento ? 'cuentas' : puedeVerCuentas ? activeTab : 'seguimiento';

  return (
    <SeguimientoOpcional activo={conSeguimiento} empresa={empresa.slug as EmpresaHormiglass}>
      {(partes) => {
        const acciones = [
          ...(partes.puedeGestionar
            ? [
                { label: 'Task', icon: ListChecks, onClick: () => { setActiveTab('seguimiento'); partes.nuevaTask(); } },
                { label: 'Documento', icon: Upload, onClick: () => { setActiveTab('seguimiento'); partes.subirDocumento(); } },
              ]
            : []),
          ...(puedeVerCuentas ? [{ label: 'Cuenta', icon: Landmark, onClick: () => { setActiveTab('cuentas'); cuentasApi.openCreate(); } }] : []),
        ];
        const tabItems = [
          ...(conSeguimiento ? [{ id: 'seguimiento' as const, label: 'Seguimiento', count: partes.tasksAbiertas }] : []),
          ...(puedeVerCuentas ? [{ id: 'cuentas' as const, label: 'Cuentas bancarias', count: cuentas.length }] : []),
        ];

        return (
          <div className="space-y-4 pb-24">
            <RecordLayout
              sidebar={
                <Panel>
                  <div className="space-y-4 p-4">
                    <button
                      type="button"
                      onClick={() => router.push('/caja/configuracion')}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
                    >
                      <ArrowLeft size={15} aria-hidden />
                      <span>Volver</span>
                    </button>

                    <div className="flex flex-col items-center space-y-2 text-center">
                      <span className={`grid h-16 w-16 place-items-center rounded-2xl ${visual.tile}`}>
                        <Icono size={30} aria-hidden />
                      </span>
                      <div className="min-w-0 max-w-full">
                        <h2 className="t-section truncate text-ink">{empresa.razon_social}</h2>
                        <div className="mt-1">
                          <CodeStamp>{empresa.rut}</CodeStamp>
                        </div>
                      </div>
                    </div>

                    {acciones.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 text-center">
                        {acciones.map(({ label, icon: Accion, onClick }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={onClick}
                            className="group flex flex-col items-center gap-1 text-ink-muted transition-colors hover:text-ink"
                          >
                            <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface transition-colors group-hover:bg-surface-muted">
                              <Accion size={16} aria-hidden />
                            </span>
                            <span className="t-micro font-semibold">{label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="-mx-4 border-t border-line-subtle" />

                    <dl className="space-y-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="t-caption">Sigla</dt>
                        <dd><CodeStamp>{empresa.slug}</CodeStamp></dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="t-caption">Estado</dt>
                        <dd><StatusBadge tone={empresa.activo ? 'success' : 'neutral'}>{empresa.activo ? 'Activa' : 'Inactiva'}</StatusBadge></dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="t-caption">Documentos</dt>
                        <dd className="t-num font-semibold text-ink">{partes.documentos}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="t-caption">Tasks abiertas</dt>
                        <dd className="t-num font-semibold text-ink">{partes.tasksAbiertas}</dd>
                      </div>
                      {puedeVerCuentas && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="t-caption">Cuentas activas</dt>
                            <dd className="t-num font-semibold text-ink">{activas.length} de {cuentas.length}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <dt className="t-caption">Saldo inicial</dt>
                            <dd className="t-num font-semibold text-ink">${saldo.toLocaleString('es-CL')}</dd>
                          </div>
                        </>
                      )}
                    </dl>

                    <div className="-mx-4 border-t border-line-subtle" />

                    {conSeguimiento && (
                    <div className="space-y-2">
                      <p className="t-caption flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                        Subcarpetas
                      </p>
                      {partes.seccionesNav}
                    </div>
                    )}
                  </div>
                </Panel>
              }
            >
              <div className="space-y-4">
                <div role="tablist" aria-label="Secciones de la ficha" className="flex w-full items-center gap-0.5 rounded-xl bg-surface-muted p-1">
                  {tabItems.map((item) => {
                    const selected = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveTab(item.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-colors ${
                          selected ? 'bg-surface text-ink shadow-[var(--hg-shadow-card)]' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {item.label}
                        <span className="t-num text-[11px] font-medium text-ink-muted">{item.count}</span>
                      </button>
                    );
                  })}
                </div>

                {tab === 'seguimiento' && partes.contenido}

                {tab === 'cuentas' && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {cuentas.length === 0 && <p className="t-caption">Esta empresa no tiene cuentas registradas.</p>}
                    {cuentas.map((c) => (
                      <div
                        key={c.id}
                        className="hg-panel p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--hg-shadow-popover)] motion-reduce:transition-none"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                              <Wallet className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
                              <span className="truncate">{c.alias}</span>
                            </p>
                            <p className="t-caption mt-0.5">
                              {c.banco} · {TIPOS_CUENTA.find((t) => t.id === c.tipo_cuenta)?.label || c.tipo_cuenta}
                            </p>
                          </div>
                          <button type="button" onClick={() => void cuentasApi.toggleActivo(c)} className="cursor-pointer" title="Cambiar estado">
                            <StatusBadge tone={c.activo ? 'success' : 'neutral'}>{c.activo ? 'Activa' : 'Inactiva'}</StatusBadge>
                          </button>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="t-caption">N° cuenta</p>
                              <p className="font-mono text-xs text-ink">{c.numero_cuenta || '—'}</p>
                            </div>
                            <div>
                              <p className="t-caption">Saldo inicial</p>
                              <p className="t-num text-xs font-semibold text-ink">${Number(c.saldo_inicial || 0).toLocaleString('es-CL')}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <IconButton icon={Edit2} label="Editar cuenta" onClick={() => cuentasApi.openEdit(c)} />
                            <IconButton
                              icon={Trash2}
                              label="Eliminar cuenta"
                              className="hover:text-danger hover:bg-danger-subtle"
                              onClick={() => void cuentasApi.eliminar(c)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </RecordLayout>

            {tab === 'cuentas' && puedeVerCuentas && <Fab label="Nueva cuenta bancaria" onClick={cuentasApi.openCreate} />}
            {tab === 'seguimiento' && partes.puedeGestionar && <Fab label="Nueva task" onClick={partes.nuevaTask} />}
            {cuentasApi.dialog}
          </div>
        );
      }}
    </SeguimientoOpcional>
  );
}
