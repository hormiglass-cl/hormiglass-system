'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import {
  Empresa,
  CuentaBancaria,
  TipoCuentaBancaria,
  CajaCategoria,
  CajaSubcategoria,
  CajaClasificacion,
} from '../../../lib/types';
import {
  Building2,
  Plus,
  ArrowLeft,
  Edit2,
  Wallet,
  ShieldCheck,
  CreditCard,
  FolderTree,
  Tag,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import {
  PageHeader,
  Panel,
  Button,
  IconButton,
  Tabs,
  StatusBadge,
  CodeStamp,
  Dialog,
  Field,
  TextInput,
  Select,
} from '../../../components/ui/crm';
import { useToast, useConfirm } from '../../../components/ui/feedback';
import { logSistema } from '../../../lib/logger';

const TIPOS_CUENTA: { id: TipoCuentaBancaria; label: string }[] = [
  { id: 'corriente', label: 'Cuenta Corriente' },
  { id: 'vista', label: 'Cuenta Vista / RUT' },
  { id: 'mercado_pago', label: 'Mercado Pago' },
  { id: 'efectivo', label: 'Efectivo / Caja Chica' },
  { id: 'otro', label: 'Otro' },
];

const BANCOS_SUGERIDOS = [
  'Banco Santander',
  'Scotiabank',
  'Banco de Chile',
  'Banco Estado',
  'Mercado Pago',
  'Efectivo / Caja Chica',
  'Banco BCI',
  'Banco Itaú',
];

const CLASIFICACIONES_INFO: Record<
  CajaClasificacion,
  { label: string; tipo: 'ingreso' | 'egreso' }
> = {
  costo_directo: {
    label: 'Costos Directos de Venta',
    tipo: 'egreso',
  },
  gasto_operacional: {
    label: 'Gastos Operacionales Planta',
    tipo: 'egreso',
  },
  gasto_administrativo: {
    label: 'Gastos Administrativos',
    tipo: 'egreso',
  },
  gasto_financiero: {
    label: 'Gastos Financieros',
    tipo: 'egreso',
  },
  ingreso_operacional: {
    label: 'Ingresos Operacionales (Ventas)',
    tipo: 'ingreso',
  },
  ingreso_no_operacional: {
    label: 'Otros Ingresos',
    tipo: 'ingreso',
  },
};

export default function CajaConfiguracionPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  // Tabs
  const [activeTab, setActiveTab] = useState<'cuentas' | 'categorias'>('cuentas');

  // Cuentas y Empresas
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [categorias, setCategorias] = useState<CajaCategoria[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Cuenta State
  const [showModal, setShowModal] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaBancaria | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields Cuenta
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [formBanco, setFormBanco] = useState(BANCOS_SUGERIDOS[0]);
  const [formTipo, setFormTipo] = useState<TipoCuentaBancaria>('corriente');
  const [formNumero, setFormNumero] = useState('');
  const [formAlias, setFormAlias] = useState('');
  const [formSaldoInicial, setFormSaldoInicial] = useState<number>(0);
  const [formActivo, setFormActivo] = useState(true);

  // Modal Subcategoría State
  const [showSubcatModal, setShowSubcatModal] = useState(false);
  const [editingSubcat, setEditingSubcat] = useState<CajaSubcategoria | null>(null);
  const [subcatCategoriaId, setSubcatCategoriaId] = useState('');
  const [subcatNombre, setSubcatNombre] = useState('');
  const [subcatDescripcion, setSubcatDescripcion] = useState('');
  const [subcatActivo, setSubcatActivo] = useState(true);
  const [savingSubcat, setSavingSubcat] = useState(false);

  // Protección de Rol: admin y finanzas
  const isAuthorized = currentUser?.rol === 'admin' || currentUser?.rol === 'finanzas';

  useEffect(() => {
    if (currentUser && !isAuthorized) {
      router.replace('/caja');
    }
  }, [currentUser, isAuthorized, router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [resEmpresas, resCuentas, resCategorias] = await Promise.all([
        supabase.from('empresas').select('*').order('slug'),
        supabase.from('cuentas_bancarias').select('*, empresa:empresas(*)').order('created_at'),
        supabase
          .from('caja_categorias')
          .select('*, subcategorias:caja_subcategorias(*)')
          .order('orden'),
      ]);

      if (resEmpresas.error) throw resEmpresas.error;
      if (resCuentas.error) throw resCuentas.error;

      setEmpresas((resEmpresas.data || []) as Empresa[]);
      setCuentas((resCuentas.data || []) as CuentaBancaria[]);

      if (resCategorias.data) {
        setCategorias(resCategorias.data as CajaCategoria[]);
      }
    } catch (err: unknown) {
      console.error('Error cargando configuración bancaria:', err);
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar datos';
      toast({ message: `No se pudieron cargar los datos de bancos: ${message}`, tone: 'danger' });
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

  const handleOpenCreateModal = () => {
    setEditingCuenta(null);
    setFormEmpresaId(empresas[0]?.id || '');
    setFormBanco(BANCOS_SUGERIDOS[0]);
    setFormTipo('corriente');
    setFormNumero('');
    setFormAlias('');
    setFormSaldoInicial(0);
    setFormActivo(true);
    setShowModal(true);
  };

  const handleOpenEditModal = (cuenta: CuentaBancaria) => {
    setEditingCuenta(cuenta);
    setFormEmpresaId(cuenta.empresa_id);
    setFormBanco(cuenta.banco);
    setFormTipo(cuenta.tipo_cuenta);
    setFormNumero(cuenta.numero_cuenta || '');
    setFormAlias(cuenta.alias);
    setFormSaldoInicial(cuenta.saldo_inicial || 0);
    setFormActivo(cuenta.activo);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAlias.trim() || !formEmpresaId) {
      toast({ message: 'El alias identificador y la empresa asociada son obligatorios.', tone: 'warning' });
      return;
    }

    try {
      setSaving(true);

      const payload = {
        empresa_id: formEmpresaId,
        banco: formBanco,
        tipo_cuenta: formTipo,
        numero_cuenta: formNumero.trim() || null,
        alias: formAlias.trim(),
        saldo_inicial: formSaldoInicial,
        activo: formActivo,
        updated_at: new Date().toISOString(),
      };

      if (editingCuenta) {
        const { error } = await supabase
          .from('cuentas_bancarias')
          .update(payload)
          .eq('id', editingCuenta.id);
        if (error) throw error;
        await logSistema({
          tipo_accion: 'actualizacion',
          entidad: 'cuentas_bancarias',
          entidad_id: editingCuenta.id,
          descripcion: `Cuenta bancaria "${payload.alias}" actualizada`,
          datos_anteriores: editingCuenta,
          datos_nuevos: payload,
        });
        toast({ message: `Cuenta "${payload.alias}" actualizada correctamente.`, tone: 'success' });
      } else {
        const { data: inserted, error } = await supabase
          .from('cuentas_bancarias')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        await logSistema({
          tipo_accion: 'creacion',
          entidad: 'cuentas_bancarias',
          entidad_id: inserted?.id,
          descripcion: `Cuenta bancaria "${payload.alias}" (${payload.banco}) registrada`,
          datos_nuevos: inserted || payload,
        });
        toast({ message: `Cuenta "${payload.alias}" registrada exitosamente.`, tone: 'success' });
      }

      setShowModal(false);
      await loadData();
    } catch (err: unknown) {
      console.error('Error guardando cuenta:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la cuenta';
      toast({ message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (cuenta: CuentaBancaria) => {
    try {
      const nuevoEstado = !cuenta.activo;
      const { error } = await supabase
        .from('cuentas_bancarias')
        .update({ activo: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', cuenta.id);
      if (error) throw error;
      setCuentas((prev) =>
        prev.map((c) => (c.id === cuenta.id ? { ...c, activo: nuevoEstado } : c))
      );
      toast({
        message: `Cuenta "${cuenta.alias}" ${nuevoEstado ? 'activada' : 'desactivada'}.`,
        tone: 'info',
      });
    } catch (err: unknown) {
      console.error('Error cambiando estado:', err);
      const message = err instanceof Error ? err.message : 'Error al cambiar estado';
      toast({ message, tone: 'danger' });
    }
  };

  const handleDeleteCuenta = async (cuenta: CuentaBancaria) => {
    try {
      // 1. Verificación defensiva previa de movimientos y abonos
      const [{ count: movCount, error: movErr }, { count: abonoCount, error: abonoErr }] =
        await Promise.all([
          supabase
            .from('caja_movimientos')
            .select('id', { count: 'exact', head: true })
            .eq('cuenta_bancaria_id', cuenta.id),
          supabase
            .from('abonos')
            .select('id', { count: 'exact', head: true })
            .eq('cuenta_bancaria_id', cuenta.id),
        ]);

      if (movErr) throw movErr;
      if (abonoErr) throw abonoErr;

      const totalAsociados = (movCount || 0) + (abonoCount || 0);
      if (totalAsociados > 0) {
        toast({
          message: `No se puede eliminar la cuenta "${cuenta.alias}" porque tiene ${totalAsociados} registro(s) contables asociados (${movCount || 0} movimientos, ${abonoCount || 0} abonos). Desactívela en su lugar para mantener la integridad histórica.`,
          tone: 'warning',
        });
        return;
      }

      // 2. Diálogo de confirmación accesible e irreversible
      const ok = await confirm({
        title: `¿Eliminar cuenta "${cuenta.alias}"?`,
        message: (
          <p className="text-xs text-ink-muted leading-relaxed">
            Esta cuenta no registra movimientos y será eliminada permanentemente del catálogo de bancos. Esta acción no se puede deshacer.
          </p>
        ),
        confirmLabel: 'Eliminar cuenta',
        cancelLabel: 'Cancelar',
        destructive: true,
      });

      if (!ok) return;

      // 3. Ejecutar eliminación
      const { error: delErr } = await supabase
        .from('cuentas_bancarias')
        .delete()
        .eq('id', cuenta.id);

      if (delErr) throw delErr;

      // 4. Registro de auditoría
      await logSistema({
        tipo_accion: 'eliminacion',
        entidad: 'cuentas_bancarias',
        entidad_id: cuenta.id,
        descripcion: `Cuenta bancaria "${cuenta.alias}" (${cuenta.banco}) eliminada del catálogo`,
        datos_anteriores: cuenta,
      });

      setCuentas((prev) => prev.filter((c) => c.id !== cuenta.id));
      toast({
        message: `Cuenta "${cuenta.alias}" eliminada correctamente.`,
        tone: 'success',
      });
    } catch (err: unknown) {
      console.error('Error al eliminar cuenta bancaria:', err);
      const message = err instanceof Error ? err.message : 'Error al eliminar la cuenta bancaria';
      toast({ message, tone: 'danger' });
    }
  };

  // Subcategorías Handlers
  const handleOpenCreateSubcatModal = (categoriaId?: string) => {
    setEditingSubcat(null);
    setSubcatCategoriaId(categoriaId || categorias[0]?.id || '');
    setSubcatNombre('');
    setSubcatDescripcion('');
    setSubcatActivo(true);
    setShowSubcatModal(true);
  };

  const handleOpenEditSubcatModal = (subcat: CajaSubcategoria) => {
    setEditingSubcat(subcat);
    setSubcatCategoriaId(subcat.categoria_id);
    setSubcatNombre(subcat.nombre);
    setSubcatDescripcion(subcat.descripcion || '');
    setSubcatActivo(subcat.activo);
    setShowSubcatModal(true);
  };

  const handleSubmitSubcat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcatNombre.trim() || !subcatCategoriaId) {
      toast({ message: 'El nombre y la categoría principal son requeridos.', tone: 'warning' });
      return;
    }

    try {
      setSavingSubcat(true);

      const payload = {
        categoria_id: subcatCategoriaId,
        nombre: subcatNombre.trim(),
        descripcion: subcatDescripcion.trim() || null,
        activo: subcatActivo,
        updated_at: new Date().toISOString(),
      };

      if (editingSubcat) {
        const { error } = await supabase
          .from('caja_subcategorias')
          .update(payload)
          .eq('id', editingSubcat.id);
        if (error) throw error;
        toast({ message: `Subcategoría "${payload.nombre}" actualizada.`, tone: 'success' });
      } else {
        const { error } = await supabase
          .from('caja_subcategorias')
          .insert([payload]);
        if (error) throw error;
        toast({ message: `Subcategoría "${payload.nombre}" creada exitosamente.`, tone: 'success' });
      }

      setShowSubcatModal(false);
      await loadData();
    } catch (err: unknown) {
      console.error('Error guardando subcategoría:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la subcategoría';
      toast({ message, tone: 'danger' });
    } finally {
      setSavingSubcat(false);
    }
  };

  const handleToggleSubcatActivo = async (subcat: CajaSubcategoria) => {
    try {
      const nuevoEstado = !subcat.activo;
      const { error } = await supabase
        .from('caja_subcategorias')
        .update({ activo: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', subcat.id);
      if (error) throw error;
      setCategorias((prev) =>
        prev.map((cat) => ({
          ...cat,
          subcategorias: (cat.subcategorias || []).map((s) =>
            s.id === subcat.id ? { ...s, activo: nuevoEstado } : s
          ),
        }))
      );
      toast({
        message: `Subcategoría "${subcat.nombre}" ${nuevoEstado ? 'activada' : 'desactivada'}.`,
        tone: 'info',
      });
    } catch (err: unknown) {
      console.error('Error actualizando subcategoría:', err);
      toast({ message: 'No se pudo actualizar el estado de la subcategoría.', tone: 'danger' });
    }
  };

  if (!isAuthorized && !loading) {
    return (
      <div className="p-8 text-center text-ink-muted">
        <AlertCircle className="w-10 h-10 text-warning mx-auto mb-2" />
        <h2 className="t-section text-ink">Acceso restringido</h2>
        <p className="t-caption mt-1">Esta sección está reservada para administración y finanzas.</p>
      </div>
    );
  }

  return (
    <div className="hg-page space-y-5">
      {/* Encabezado y Navegación */}
      <PageHeader
        title="Configuración financiera y estructura de costos"
        description="Administra cuentas bancarias operativas, sociedades del grupo y la matriz de categorización de costos y gastos."
        actions={
          <>
            <Button
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => router.push('/caja')}
            >
              Volver a Caja
            </Button>
            {activeTab === 'cuentas' ? (
              <Button
                variant="primary"
                icon={Plus}
                onClick={handleOpenCreateModal}
              >
                Nueva cuenta bancaria
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => handleOpenCreateSubcatModal()}
              >
                Nueva subcategoría
              </Button>
            )}
          </>
        }
      />

      {/* Tabs Principales */}
      <Tabs
        items={[
          { id: 'cuentas', label: 'Cuentas bancarias y empresas', count: cuentas.length },
          { id: 'categorias', label: 'Categorías de costos y gastos', count: categorias.length },
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as 'cuentas' | 'categorias')}
      />

      {/* CONTENIDO TAB 1: Cuentas y Empresas */}
      {activeTab === 'cuentas' && (
        <div className="space-y-5">
          {/* Resumen de Sociedades */}
          <div className="space-y-3">
            <h2 className="t-caption font-semibold uppercase tracking-wider flex items-center gap-1.5 text-ink-muted">
              <Building2 className="w-4 h-4 text-ink-muted" />
              <span>Empresas del grupo (3 razones sociales)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {empresas.map((emp) => {
                const cuentasEmpresa = cuentas.filter((c) => c.empresa_id === emp.id);
                return (
                  <Panel key={emp.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CodeStamp>{emp.slug}</CodeStamp>
                        <h3 className="font-semibold text-sm text-ink mt-1.5">{emp.razon_social}</h3>
                      </div>
                      <ShieldCheck className="w-4 h-4 text-success" />
                    </div>
                    <div className="t-caption space-y-0.5 pt-1">
                      <div>RUT: <span className="font-mono font-semibold text-ink">{emp.rut}</span></div>
                      <div>Cuentas activas: <span className="font-semibold text-ink">{cuentasEmpresa.filter((c) => c.activo).length} de {cuentasEmpresa.length}</span></div>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </div>

          {/* Catálogo de Cuentas Bancarias */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-accent-ink" />
                <span>Cuentas bancarias operativas ({cuentas.length})</span>
              </span>
            }
          >
            {loading ? (
              <div className="p-8 text-center t-caption">Cargando cuentas bancarias…</div>
            ) : cuentas.length === 0 ? (
              <div className="p-8 text-center t-caption">No hay cuentas bancarias registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="hg-table w-full text-left text-xs min-w-[700px]">
                  <thead>
                    <tr>
                      <th className="p-3">Alias / Identificador</th>
                      <th className="p-3">Empresa</th>
                      <th className="p-3">Banco</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">N° Cuenta</th>
                      <th className="p-3 text-right">Saldo Inicial</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c) => {
                      const emp = c.empresa || empresas.find((e) => e.id === c.empresa_id);
                      return (
                        <tr key={c.id}>
                          <td className="p-3 font-semibold text-ink flex items-center gap-2">
                            <Wallet className="w-3.5 h-3.5 text-accent-ink shrink-0" />
                            <span>{c.alias}</span>
                          </td>
                          <td className="p-3">
                            <CodeStamp>{emp?.slug || 'S/E'}</CodeStamp>
                          </td>
                          <td className="p-3 font-medium text-ink">{c.banco}</td>
                          <td className="p-3 text-ink-muted capitalize">
                            {TIPOS_CUENTA.find((t) => t.id === c.tipo_cuenta)?.label || c.tipo_cuenta}
                          </td>
                          <td className="p-3 font-mono text-ink-muted t-micro">
                            {c.numero_cuenta || '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-semibold text-ink t-num">
                            ${Number(c.saldo_inicial || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleToggleActivo(c)}
                              className="cursor-pointer"
                              title="Cambiar estado"
                            >
                              <StatusBadge tone={c.activo ? 'success' : 'neutral'}>
                                {c.activo ? 'Activa' : 'Inactiva'}
                              </StatusBadge>
                            </button>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                icon={Edit2}
                                label="Editar cuenta"
                                onClick={() => handleOpenEditModal(c)}
                              />
                              {isAuthorized && (
                                <IconButton
                                  icon={Trash2}
                                  label="Eliminar cuenta"
                                  className="hover:text-danger hover:bg-danger-subtle"
                                  onClick={() => void handleDeleteCuenta(c)}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* CONTENIDO TAB 2: Categorías y Subcategorías */}
      {activeTab === 'categorias' && (
        <div className="space-y-5">
          <Panel className="p-4">
            <h2 className="t-section flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-accent-ink" />
              <span>Estructura del Estado de Resultados (EE.RR)</span>
            </h2>
            <p className="t-caption mt-1">
              Clasificación contable para costeo por Nota de Venta (NV), control de planta y gastos operacionales.
            </p>
          </Panel>

          {loading ? (
            <div className="p-8 text-center t-caption">Cargando categorías…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categorias.map((cat) => {
                const info = CLASIFICACIONES_INFO[cat.clasificacion] || {
                  label: cat.nombre,
                  tipo: cat.tipo,
                };
                const subcats = cat.subcategorias || [];

                return (
                  <Panel key={cat.id} className="overflow-hidden flex flex-col">
                    {/* Header Categoría */}
                    <div className="p-4 border-b border-line-subtle flex items-start justify-between bg-surface-muted">
                      <div>
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={cat.tipo === 'ingreso' ? 'success' : 'danger'}>
                            {cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                          </StatusBadge>
                          <span className="t-micro text-ink-muted uppercase font-semibold">
                            {info.label}
                          </span>
                        </div>
                        <h3 className="t-section text-ink mt-1 flex items-center gap-2">
                          {cat.tipo === 'ingreso' ? (
                            <TrendingUp className="w-4 h-4 text-success" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-warning" />
                          )}
                          <span>{cat.nombre}</span>
                        </h3>
                        {cat.descripcion && (
                          <p className="t-caption mt-0.5">{cat.descripcion}</p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        icon={Plus}
                        onClick={() => handleOpenCreateSubcatModal(cat.id)}
                      >
                        Subcategoría
                      </Button>
                    </div>

                    {/* Lista de Subcategorías */}
                    <div className="p-4 flex-1">
                      {subcats.length === 0 ? (
                        <p className="t-caption italic">Sin subcategorías registradas.</p>
                      ) : (
                        <div className="divide-y divide-line-subtle">
                          {subcats.map((sub) => (
                            <div
                              key={sub.id}
                              className="py-2.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex-1">
                                <div className="font-semibold text-ink flex items-center gap-1.5">
                                  <Tag className="w-3 h-3 text-ink-muted" />
                                  <span>{sub.nombre}</span>
                                </div>
                                {sub.descripcion && (
                                  <p className="t-micro text-ink-muted pl-4">{sub.descripcion}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleSubcatActivo(sub)}
                                  className="cursor-pointer"
                                  title="Cambiar estado"
                                >
                                  <StatusBadge tone={sub.activo ? 'success' : 'neutral'}>
                                    {sub.activo ? 'Activa' : 'Inactiva'}
                                  </StatusBadge>
                                </button>

                                <IconButton
                                  icon={Edit2}
                                  label="Editar subcategoría"
                                  onClick={() => handleOpenEditSubcatModal(sub)}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Cuenta Bancaria */}
      <Dialog
        open={showModal}
        title={editingCuenta ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={(e) => void handleSubmit(e)}
            >
              {saving ? 'Guardando…' : editingCuenta ? 'Actualizar cuenta' : 'Crear cuenta'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <Field label="Empresa / Razón social" required>
            {({ id }) => (
              <Select
                id={id}
                value={formEmpresaId}
                onChange={(e) => setFormEmpresaId(e.target.value)}
              >
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.razon_social} ({emp.slug}) - RUT: {emp.rut}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Banco / Entidad" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={formBanco}
                  onChange={(e) => setFormBanco(e.target.value)}
                >
                  {BANCOS_SUGERIDOS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Tipo de cuenta" required>
              {({ id }) => (
                <Select
                  id={id}
                  value={formTipo}
                  onChange={(e) => setFormTipo(e.target.value as TipoCuentaBancaria)}
                >
                  {TIPOS_CUENTA.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field
            label="Alias / Identificador para caja"
            required
            hint="Este es el nombre visible en la bandeja de validación y selectores de caja."
          >
            {({ id, 'aria-describedby': ariaDescribedBy }) => (
              <TextInput
                id={id}
                type="text"
                placeholder="Ej: Santander Comercial, Scotiabank Operaciones"
                value={formAlias}
                aria-describedby={ariaDescribedBy}
                onChange={(e) => setFormAlias(e.target.value)}
              />
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Número de cuenta (opcional)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="text"
                  placeholder="Ej: 000-12345678-9"
                  value={formNumero}
                  onChange={(e) => setFormNumero(e.target.value)}
                />
              )}
            </Field>

            <Field label="Saldo inicial ($ CLP)">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="number"
                  value={formSaldoInicial}
                  onChange={(e) => setFormSaldoInicial(Number(e.target.value))}
                />
              )}
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="cuentaActiva"
              checked={formActivo}
              onChange={(e) => setFormActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="cuentaActiva" className="text-xs font-semibold text-ink cursor-pointer">
              Cuenta activa para operaciones de caja y tesorería
            </label>
          </div>
        </form>
      </Dialog>

      {/* Modal Subcategoría */}
      <Dialog
        open={showSubcatModal}
        title={editingSubcat ? 'Editar subcategoría' : 'Nueva subcategoría'}
        onClose={() => setShowSubcatModal(false)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowSubcatModal(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={savingSubcat}
              onClick={(e) => void handleSubmitSubcat(e)}
            >
              {savingSubcat ? 'Guardando…' : editingSubcat ? 'Actualizar subcategoría' : 'Crear subcategoría'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitSubcat} className="space-y-3 text-xs">
          <Field label="Categoría principal" required>
            {({ id }) => (
              <Select
                id={id}
                value={subcatCategoriaId}
                onChange={(e) => setSubcatCategoriaId(e.target.value)}
              >
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre} ({cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Nombre de la subcategoría" required>
            {({ id }) => (
              <TextInput
                id={id}
                type="text"
                placeholder="Ej: Materiales e Insumos, Fletes y Despachos"
                value={subcatNombre}
                onChange={(e) => setSubcatNombre(e.target.value)}
              />
            )}
          </Field>

          <Field label="Descripción / Propósito (opcional)">
            {({ id }) => (
              <textarea
                id={id}
                rows={2}
                placeholder="Explica qué tipo de gastos o ingresos se agrupan aquí..."
                value={subcatDescripcion}
                onChange={(e) => setSubcatDescripcion(e.target.value)}
                className="hg-field w-full p-2.5"
              />
            )}
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="subcatActiva"
              checked={subcatActivo}
              onChange={(e) => setSubcatActivo(e.target.checked)}
              className="rounded-control"
            />
            <label htmlFor="subcatActiva" className="text-xs font-semibold text-ink cursor-pointer">
              Subcategoría activa para imputación en caja
            </label>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
