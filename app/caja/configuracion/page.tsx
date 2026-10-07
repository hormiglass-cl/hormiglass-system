'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { useAuth } from '../../../lib/context/AuthContext';
import { Empresa, CuentaBancaria, TipoCuentaBancaria } from '../../../lib/types';
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
  Building,
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

export default function CajaConfiguracionPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaBancaria | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formEmpresaId, setFormEmpresaId] = useState('');
  const [formBanco, setFormBanco] = useState(BANCOS_SUGERIDOS[0]);
  const [formTipo, setFormTipo] = useState<TipoCuentaBancaria>('corriente');
  const [formNumero, setFormNumero] = useState('');
  const [formAlias, setFormAlias] = useState('');
  const [formSaldoInicial, setFormSaldoInicial] = useState<number>(0);
  const [formActivo, setFormActivo] = useState(true);

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

      const [resEmpresas, resCuentas] = await Promise.all([
        supabase.from('empresas').select('*').order('slug'),
        supabase.from('cuentas_bancarias').select('*, empresa:empresas(*)').order('created_at'),
      ]);

      if (resEmpresas.error) throw resEmpresas.error;
      if (resCuentas.error) throw resCuentas.error;

      setEmpresas((resEmpresas.data || []) as Empresa[]);
      setCuentas((resCuentas.data || []) as CuentaBancaria[]);
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
    setFormSaldoInicial(Number(cuenta.saldo_inicial) || 0);
    setFormActivo(cuenta.activo);
    setShowModal(true);
  };

  const handleSaveCuenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAlias.trim()) {
      setErrorMsg('Debes indicar un alias identificador para la cuenta.');
      return;
    }
    if (!formEmpresaId) {
      setErrorMsg('Debes seleccionar una empresa.');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg('');

      const payload = {
        empresa_id: formEmpresaId,
        banco: formBanco,
        tipo_cuenta: formTipo,
        numero_cuenta: formNumero.trim(),
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
            <span>Configuración Bancaria y Sociedades</span>
          </h1>
          <p className="text-xs text-gray-500">
            Administra las cuentas bancarias de las 3 razones sociales para asignación de movimientos y validación de cobros.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-[#f97316] hover:bg-[#ea580c] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Cuenta Bancaria</span>
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
            <span>Cuentas Bancarias Activas ({cuentas.length})</span>
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
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition ${
                            c.activo
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                          }`}
                          title="Clic para cambiar estado"
                        >
                          {c.activo ? 'Activa' : 'Inactiva'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(c)}
                          className="p-1 text-gray-500 hover:text-[#f97316] hover:bg-orange-50 rounded transition inline-flex items-center"
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

      {/* Modal Crear / Editar Cuenta */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-extrabold text-[#213343] flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#f97316]" />
                <span>{editingCuenta ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCuenta} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Empresa / Razón Social *</label>
                <select
                  value={formEmpresaId}
                  onChange={(e) => setFormEmpresaId(e.target.value)}
                  required
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-bold focus:outline-none focus:border-[#f97316]"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.razon_social} ({emp.slug.toUpperCase()} · RUT: {emp.rut})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Alias de la Cuenta *</label>
                <input
                  type="text"
                  required
                  value={formAlias}
                  onChange={(e) => setFormAlias(e.target.value)}
                  placeholder="Ej: Santander Comercial, Scotiabank Transportes, Caja Chica"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
                />
                <span className="text-[10px] text-gray-400">Nombre con el que Mariela identificará esta cuenta en Caja.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Banco / Entidad *</label>
                  <input
                    type="text"
                    required
                    list="bancos-list"
                    value={formBanco}
                    onChange={(e) => setFormBanco(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
                  />
                  <datalist id="bancos-list">
                    {BANCOS_SUGERIDOS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de Cuenta *</label>
                  <select
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value as TipoCuentaBancaria)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
                  >
                    {TIPOS_CUENTA.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">N° de Cuenta</label>
                  <input
                    type="text"
                    value={formNumero}
                    onChange={(e) => setFormNumero(e.target.value)}
                    placeholder="Ej: 00-12345-6"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-mono focus:outline-none focus:border-[#f97316]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Saldo Inicial ($)</label>
                  <input
                    type="number"
                    value={formSaldoInicial}
                    onChange={(e) => setFormSaldoInicial(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-[#213343] font-mono focus:outline-none focus:border-[#f97316]"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={formActivo}
                    onChange={(e) => setFormActivo(e.target.checked)}
                    className="rounded border-gray-300 text-[#f97316] focus:ring-[#f97316]"
                  />
                  <span>Cuenta activa para operaciones diarias</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#f97316] hover:bg-[#ea580c] text-white rounded-lg font-extrabold transition shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingCuenta ? 'Actualizar Cuenta' : 'Guardar Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
