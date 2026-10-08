'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
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
  Landmark,
  Building2,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Wallet,
  ShieldCheck,
  CreditCard,
  FolderTree,
  Tag,
  Layers,
  Check,
  X,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

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
  { label: string; tipo: 'ingreso' | 'egreso'; color: string; bg: string }
> = {
  costo_directo: {
    label: 'Costos Directos de Venta',
    tipo: 'egreso',
    color: 'text-amber-800',
    bg: 'bg-amber-50 border-amber-200',
  },
  gasto_operacional: {
    label: 'Gastos Operacionales Planta',
    tipo: 'egreso',
    color: 'text-blue-800',
    bg: 'bg-blue-50 border-blue-200',
  },
  gasto_administrativo: {
    label: 'Gastos Administrativos',
    tipo: 'egreso',
    color: 'text-purple-800',
    bg: 'bg-purple-50 border-purple-200',
  },
  gasto_financiero: {
    label: 'Gastos Financieros',
    tipo: 'egreso',
    color: 'text-rose-800',
    bg: 'bg-rose-50 border-rose-200',
  },
  ingreso_operacional: {
    label: 'Ingresos Operacionales (Ventas)',
    tipo: 'ingreso',
    color: 'text-emerald-800',
    bg: 'bg-emerald-50 border-emerald-200',
  },
  ingreso_no_operacional: {
    label: 'Otros Ingresos',
    tipo: 'ingreso',
    color: 'text-teal-800',
    bg: 'bg-teal-50 border-teal-200',
  },
};

export default function CajaConfiguracionPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Tabs
  const [activeTab, setActiveTab] = useState<'cuentas' | 'categorias'>('cuentas');

  // Cuentas y Empresas
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [categorias, setCategorias] = useState<CajaCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
      setErrorMsg('');

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
      setErrorMsg(`No se pudieron cargar los datos de bancos: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
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
      setErrorMsg('El alias identificador y la empresa asociada son obligatorios.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');

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
        setSuccessMsg(`Cuenta "${payload.alias}" actualizada correctamente.`);
      } else {
        const { error } = await supabase
          .from('cuentas_bancarias')
          .insert([payload]);
        if (error) throw error;
        setSuccessMsg(`Cuenta "${payload.alias}" registrada exitosamente.`);
      }

      setShowModal(false);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      console.error('Error guardando cuenta:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la cuenta';
      setErrorMsg(message);
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
      setSuccessMsg(`Cuenta "${cuenta.alias}" ${nuevoEstado ? 'activada' : 'desactivada'}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      console.error('Error cambiando estado:', err);
      const message = err instanceof Error ? err.message : 'Error al cambiar estado';
      setErrorMsg(message);
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
      setErrorMsg('El nombre y la categoría principal son requeridos.');
      return;
    }

    try {
      setSavingSubcat(true);
      setErrorMsg('');

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
        setSuccessMsg(`Subcategoría "${payload.nombre}" actualizada.`);
      } else {
        const { error } = await supabase
          .from('caja_subcategorias')
          .insert([payload]);
        if (error) throw error;
        setSuccessMsg(`Subcategoría "${payload.nombre}" creada exitosamente.`);
      }

      setShowSubcatModal(false);
      await loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      console.error('Error guardando subcategoría:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la subcategoría';
      setErrorMsg(message);
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
      setSuccessMsg(`Subcategoría "${subcat.nombre}" ${nuevoEstado ? 'activada' : 'desactivada'}.`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      console.error('Error actualizando subcategoría:', err);
      setErrorMsg('No se pudo actualizar el estado de la subcategoría.');
    }
  };

  if (!isAuthorized && !loading) {
    return (
      <div className="p-8 text-center text-gray-600">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-2" />
        <h2 className="text-base font-bold text-gray-800">Acceso Restringido</h2>
        <p className="text-xs text-gray-500 mt-1">Esta sección está reservada para administración y finanzas.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Encabezado y Navegación */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/caja"
              className="text-xs font-bold text-gray-500 hover:text-[#f97316] flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a Caja</span>
            </Link>
          </div>
          <h1 className="text-xl font-extrabold text-[#213343] flex items-center gap-2">
            <Landmark className="w-6 h-6 text-[#f97316]" />
            <span>Configuración Financiera y Estructura de Costos</span>
          </h1>
          <p className="text-xs text-gray-500">
            Administra cuentas bancarias operativas, sociedades del grupo y la matriz de categorización de costos y gastos.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'cuentas' ? (
            <button
              onClick={handleOpenCreateModal}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Cuenta Bancaria</span>
            </button>
          ) : (
            <button
              onClick={() => handleOpenCreateSubcatModal()}
              className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Subcategoría</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Principales */}
      <div className="flex border-b border-gray-200 gap-4">
        <button
          onClick={() => setActiveTab('cuentas')}
          className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'cuentas'
              ? 'border-[#f97316] text-[#f97316]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Cuentas Bancarias & Empresas ({cuentas.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('categorias')}
          className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'categorias'
              ? 'border-[#f97316] text-[#f97316]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>Categorías de Costos y Gastos ({categorias.length})</span>
        </button>
      </div>

      {/* Alertas */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CONTENIDO TAB 1: Cuentas y Empresas */}
      {activeTab === 'cuentas' && (
        <div className="space-y-6">
          {/* Resumen de Sociedades */}
          <div>
            <h2 className="text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span>Empresas del Grupo (3 Razones Sociales)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {empresas.map((emp) => {
                const cuentasEmpresa = cuentas.filter((c) => c.empresa_id === emp.id);
                return (
                  <div
                    key={emp.id}
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-2 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold font-mono uppercase bg-orange-100 text-[#f97316] px-2 py-0.5 rounded">
                          {emp.slug}
                        </span>
                        <h3 className="font-extrabold text-sm text-[#213343] mt-1">{emp.razon_social}</h3>
                      </div>
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5 pt-1">
                      <div>RUT: <span className="font-mono font-bold text-gray-700">{emp.rut}</span></div>
                      <div>Cuentas activas: <span className="font-bold text-gray-800">{cuentasEmpresa.filter(c => c.activo).length} de {cuentasEmpresa.length}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Catálogo de Cuentas Bancarias */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-[#213343] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#f97316]" />
                <span>Cuentas Bancarias Operativas ({cuentas.length})</span>
              </h2>
              <span className="text-xs text-gray-500 font-medium">
                Operando en las 3 empresas del grupo
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-gray-500">Cargando cuentas bancarias...</div>
            ) : cuentas.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">No hay cuentas bancarias registradas.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 text-[11px] uppercase">
                      <th className="py-3 px-4">Alias / Identificador</th>
                      <th className="py-3 px-4">Empresa</th>
                      <th className="py-3 px-4">Banco</th>
                      <th className="py-3 px-4">Tipo</th>
                      <th className="py-3 px-4">N° Cuenta</th>
                      <th className="py-3 px-4 text-right">Saldo Inicial</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cuentas.map((c) => {
                      const emp = c.empresa || empresas.find((e) => e.id === c.empresa_id);
                      return (
                        <tr key={c.id} className="hover:bg-gray-50/70 transition">
                          <td className="py-3 px-4 font-extrabold text-[#213343] flex items-center gap-2">
                            <Wallet className="w-3.5 h-3.5 text-[#f97316] shrink-0" />
                            <span>{c.alias}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                              {emp?.slug || 'Sin empresa'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-700">{c.banco}</td>
                          <td className="py-3 px-4 text-gray-600 capitalize">
                            {TIPOS_CUENTA.find((t) => t.id === c.tipo_cuenta)?.label || c.tipo_cuenta}
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-600">
                            {c.numero_cuenta || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-gray-800">
                            ${Number(c.saldo_inicial || 0).toLocaleString('es-CL')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleActivo(c)}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer ${
                                c.activo
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                              }`}
                            >
                              {c.activo ? 'Activa' : 'Inactiva'}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenEditModal(c)}
                              className="p-1.5 text-gray-500 hover:text-[#f97316] hover:bg-orange-50 rounded transition"
                              title="Editar cuenta"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: Categorías y Subcategorías */}
      {activeTab === 'categorias' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-[#213343] flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-[#f97316]" />
                <span>Estructura del Estado de Resultados (EE.RR)</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Clasificación contable para costeo por Nota de Venta (NV), control de planta y gastos operacionales.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-gray-500">Cargando categorías...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {categorias.map((cat) => {
                const info = CLASIFICACIONES_INFO[cat.clasificacion] || {
                  label: cat.nombre,
                  tipo: cat.tipo,
                  color: 'text-gray-800',
                  bg: 'bg-gray-50 border-gray-200',
                };
                const subcats = cat.subcategorias || [];

                return (
                  <div
                    key={cat.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col"
                  >
                    {/* Header Categoría */}
                    <div className={`p-4 border-b ${info.bg} flex items-start justify-between`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded font-mono ${
                              cat.tipo === 'ingreso'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                          </span>
                          <span className="text-[10px] font-bold text-gray-500 uppercase">
                            {info.label}
                          </span>
                        </div>
                        <h3 className="text-base font-extrabold text-[#213343] mt-1 flex items-center gap-2">
                          {cat.tipo === 'ingreso' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-amber-600" />
                          )}
                          <span>{cat.nombre}</span>
                        </h3>
                        {cat.descripcion && (
                          <p className="text-xs text-gray-500 mt-0.5">{cat.descripcion}</p>
                        )}
                      </div>

                      <button
                        onClick={() => handleOpenCreateSubcatModal(cat.id)}
                        className="text-xs font-bold text-[#f97316] hover:bg-white/80 p-1.5 rounded transition flex items-center gap-1 border border-orange-200 shrink-0"
                        title="Agregar subcategoría"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Subcategoría</span>
                      </button>
                    </div>

                    {/* Lista de Subcategorías */}
                    <div className="p-4 flex-1">
                      {subcats.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Sin subcategorías registradas.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {subcats.map((sub) => (
                            <div
                              key={sub.id}
                              className="py-2.5 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex-1">
                                <div className="font-extrabold text-[#213343] flex items-center gap-1.5">
                                  <Tag className="w-3 h-3 text-gray-400" />
                                  <span>{sub.nombre}</span>
                                </div>
                                {sub.descripcion && (
                                  <p className="text-[11px] text-gray-500 pl-4">{sub.descripcion}</p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSubcatActivo(sub)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                                    sub.activo
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
                                  }`}
                                >
                                  {sub.activo ? 'Activa' : 'Inactiva'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSubcatModal(sub)}
                                  className="p-1 text-gray-400 hover:text-[#f97316] rounded"
                                  title="Editar subcategoría"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Cuenta Bancaria */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#f97316]" />
                <span>{editingCuenta ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Empresa / Razón Social *
                </label>
                <select
                  value={formEmpresaId}
                  onChange={(e) => setFormEmpresaId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  required
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razon_social} ({emp.slug}) - RUT: {emp.rut}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Banco / Entidad *</label>
                  <select
                    value={formBanco}
                    onChange={(e) => setFormBanco(e.target.value)}
                    className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  >
                    {BANCOS_SUGERIDOS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Tipo de Cuenta *</label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as TipoCuentaBancaria)}
                    className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  >
                    {TIPOS_CUENTA.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Alias / Identificador para Caja *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Santander Comercial, Scotiabank Operaciones"
                  value={formAlias}
                  onChange={(e) => setFormAlias(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  required
                />
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  Este es el nombre visible en la bandeja de validación y selectores de caja.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Número de Cuenta (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 000-12345678-9"
                    value={formNumero}
                    onChange={(e) => setFormNumero(e.target.value)}
                    className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Saldo Inicial ($ CLP)</label>
                  <input
                    type="number"
                    value={formSaldoInicial}
                    onChange={(e) => setFormSaldoInicial(Number(e.target.value))}
                    className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cuentaActiva"
                  checked={formActivo}
                  onChange={(e) => setFormActivo(e.target.checked)}
                  className="rounded text-[#f97316] focus:ring-[#f97316]"
                />
                <label htmlFor="cuentaActiva" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Cuenta activa para operaciones de caja y tesorería
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingCuenta ? 'Actualizar Cuenta' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Subcategoría */}
      {showSubcatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#f97316]" />
                <span>{editingSubcat ? 'Editar Subcategoría' : 'Nueva Subcategoría'}</span>
              </h3>
              <button
                onClick={() => setShowSubcatModal(false)}
                className="text-gray-400 hover:text-gray-600 transition font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSubcat} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Categoría Principal *
                </label>
                <select
                  value={subcatCategoriaId}
                  onChange={(e) => setSubcatCategoriaId(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  required
                >
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre} ({cat.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Nombre de la Subcategoría *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Materiales e Insumos, Fletes y Despachos"
                  value={subcatNombre}
                  onChange={(e) => setSubcatNombre(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343] font-semibold"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Descripción / Propósito (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Explica qué tipo de gastos o ingresos se agrupan aquí..."
                  value={subcatDescripcion}
                  onChange={(e) => setSubcatDescripcion(e.target.value)}
                  className="w-full bg-[#f4f5f3] border border-gray-300 rounded-lg p-2.5 text-xs text-[#213343]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="subcatActiva"
                  checked={subcatActivo}
                  onChange={(e) => setSubcatActivo(e.target.checked)}
                  className="rounded text-[#f97316] focus:ring-[#f97316]"
                />
                <label htmlFor="subcatActiva" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Subcategoría activa para imputación en Caja
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowSubcatModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSubcat}
                  className="px-4 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingSubcat
                    ? 'Guardando...'
                    : editingSubcat
                    ? 'Actualizar Subcategoría'
                    : 'Crear Subcategoría'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
