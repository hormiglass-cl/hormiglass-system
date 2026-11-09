'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import type { Empresa, CuentaBancaria } from '../../../lib/types';
import { Briefcase, Building2, ChevronRight, CreditCard, IdCard, Landmark, Truck, Wallet } from 'lucide-react';
import { Panel, StatusBadge, CodeStamp, Button, Dialog, Field, TextInput } from '../../../components/ui/crm';
import { Fab } from '../../../components/ui/Fab';
import { logSistema } from '../../../lib/logger';
import { useToast } from '../../../components/ui/feedback';

const EMPRESA_VISUAL_DEFAULT = { icon: Building2, tile: 'bg-surface-muted text-ink' };
const EMPRESA_VISUAL: Record<string, { icon: typeof Building2; tile: string }> = {
  comercial: { icon: Briefcase, tile: 'bg-accent-soft text-accent-ink' },
  transportes: { icon: Truck, tile: 'bg-info-soft text-info' },
  inmobiliaria: { icon: Building2, tile: 'bg-violet-soft text-violet' },
};

export default function EmpresasPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  const puedeVerCuentas = currentUser?.rol === 'admin';

  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formRazon, setFormRazon] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formRut, setFormRut] = useState('');
  const [formActiva, setFormActiva] = useState(true);

  const abrirNueva = () => {
    setFormRazon('');
    setFormSlug('');
    setFormRut('');
    setFormActiva(true);
    setNuevaOpen(true);
  };

  const guardarNueva = async () => {
    const razon = formRazon.trim();
    const rut = formRut.trim();
    const slug = (formSlug || razon).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!razon || !rut || !slug) {
      toast({ message: 'La razón social y el RUT son obligatorios.', tone: 'warning' });
      return;
    }
    if (empresas.some((e) => e.slug === slug)) {
      toast({ message: `Ya existe una empresa con la sigla "${slug}".`, tone: 'warning' });
      return;
    }
    try {
      setGuardando(true);
      const { data, error } = await supabase
        .from('empresas')
        .insert([{ slug, razon_social: razon, rut, activo: formActiva }])
        .select()
        .single();
      if (error) throw error;
      await logSistema({
        tipo_accion: 'creacion',
        entidad: 'empresas',
        entidad_id: data?.id,
        descripcion: `Empresa "${razon}" registrada`,
        datos_nuevos: data,
      });
      toast({ message: `Empresa "${razon}" registrada.`, tone: 'success' });
      setNuevaOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast({ message: err instanceof Error ? err.message : 'No se pudo registrar la empresa.', tone: 'danger' });
    } finally {
      setGuardando(false);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [resEmpresas, resCuentas] = await Promise.all([
        supabase.from('empresas').select('*').order('slug'),
        supabase.from('cuentas_bancarias').select('*').order('created_at'),
      ]);
      if (resEmpresas.error) throw resEmpresas.error;
      setEmpresas((resEmpresas.data || []) as Empresa[]);
      setCuentas((resCuentas.data || []) as CuentaBancaria[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos';
      toast({ message: `No se pudieron cargar las empresas: ${message}`, tone: 'danger' });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  return (
    <div className="hg-page space-y-5 pb-10">
      {loading ? (
          <div className="p-8 text-center t-caption">Cargando empresas…</div>
        ) : empresas.length === 0 ? (
          <div className="p-8 text-center t-caption">No hay empresas registradas.</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {empresas.map((emp, i) => {
              const cuentasEmpresa = cuentas.filter((c) => c.empresa_id === emp.id);
              const activas = cuentasEmpresa.filter((c) => c.activo);
              const saldo = activas.reduce((s, c) => s + Number(c.saldo_inicial || 0), 0);
              const bancos = Array.from(new Set(activas.map((c) => c.banco)));
              const visual = EMPRESA_VISUAL[String(emp.slug)] || EMPRESA_VISUAL_DEFAULT;
              const Icono = visual.icon;
              return (
                <div
                  key={emp.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Abrir ficha de ${emp.razon_social}`}
                  onClick={() => router.push(`/caja/configuracion/${emp.slug}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(`/caja/configuracion/${emp.slug}`);
                    }
                  }}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="hg-page-transition group cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Panel className="flex h-full flex-col gap-5 p-6 text-left transition-all duration-200 ease-out group-hover:-translate-y-1.5 group-hover:border-accent group-hover:shadow-[var(--hg-shadow-popover)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3 motion-reduce:transition-none ${visual.tile}`}>
                        <Icono className="h-7 w-7" aria-hidden />
                      </span>
                      <div className="flex items-center gap-2">
                        <CodeStamp>{emp.slug}</CodeStamp>
                        <StatusBadge tone={emp.activo ? 'success' : 'neutral'}>{emp.activo ? 'Activa' : 'Inactiva'}</StatusBadge>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="m-0 text-lg font-semibold leading-snug text-ink transition-colors group-hover:text-accent-ink">
                        {emp.razon_social}
                      </h3>
                      <p className="t-caption m-0 flex items-center gap-1.5 font-mono">
                        <IdCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {emp.rut}
                      </p>
                    </div>

                    {puedeVerCuentas && (
                      <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-surface-muted p-3.5 transition-colors group-hover:bg-accent-soft">
                        <p className="t-caption m-0 flex items-center gap-1.5">
                          <Landmark className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Cuentas activas
                        </p>
                        <p className="t-num m-0 mt-1 text-xl font-semibold text-ink">
                          {activas.length}
                          <span className="text-sm font-medium text-ink-muted"> de {cuentasEmpresa.length}</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-surface-muted p-3.5 transition-colors group-hover:bg-accent-soft">
                        <p className="t-caption m-0 flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Saldo inicial
                        </p>
                        <p className="t-num m-0 mt-1 text-xl font-semibold text-ink">${saldo.toLocaleString('es-CL')}</p>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-wrap content-start gap-2">
                      {bancos.length === 0 ? (
                        <span className="t-caption">Sin cuentas activas</span>
                      ) : (
                        bancos.map((b) => (
                          <span key={b} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink">
                            <CreditCard className="h-3 w-3 text-ink-muted" aria-hidden />
                            {b}
                          </span>
                        ))
                      )}
                    </div>

                      </>
                    )}
                    {!puedeVerCuentas && <div className="flex-1" />}

                    <div className="flex items-center justify-between border-t border-line-subtle pt-4 text-xs font-semibold text-ink-muted transition-colors group-hover:text-accent-ink">
                      <span>Ver ficha de la empresa</span>
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
                    </div>
                  </Panel>
                </div>
              );
            })}
          </div>
      )}

      {puedeVerCuentas && <Fab label="Nueva empresa" onClick={abrirNueva} />}

      <Dialog
        open={nuevaOpen}
        title="Nueva empresa"
        onClose={() => setNuevaOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNuevaOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={guardando} onClick={() => void guardarNueva()}>
              {guardando ? 'Guardando…' : 'Crear empresa'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <Field label="Razón social" required>
            {({ id }) => <TextInput id={id} value={formRazon} onChange={(e) => setFormRazon(e.target.value)} placeholder="Sociedad Ejemplo Ltda." />}
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="RUT" required>
              {({ id }) => <TextInput id={id} value={formRut} onChange={(e) => setFormRut(e.target.value)} placeholder="76.000.000-0" />}
            </Field>
            <Field label="Sigla">
              {({ id }) => <TextInput id={id} value={formSlug} onChange={(e) => setFormSlug(e.target.value)} placeholder="Se genera desde la razón social" />}
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pt-1 font-semibold text-ink">
            <input type="checkbox" checked={formActiva} onChange={(e) => setFormActiva(e.target.checked)} className="rounded-control" />
            Empresa activa
          </label>
        </div>
      </Dialog>
    </div>
  );
}
