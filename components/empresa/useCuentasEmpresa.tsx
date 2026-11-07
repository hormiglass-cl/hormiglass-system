'use client';

import React, { useMemo, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import type { Empresa, CuentaBancaria, TipoCuentaBancaria } from '../../lib/types';
import { Button, Dialog, Field, TextInput } from '../ui/crm';
import { Select } from '../ui/FormControls';
import { useToast, useConfirm } from '../ui/feedback';
import { logSistema } from '../../lib/logger';

export const TIPOS_CUENTA: { id: TipoCuentaBancaria; label: string }[] = [
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

/** Altas, ediciones, estado y bajas de las cuentas bancarias de una empresa. */
export function useCuentasEmpresa(empresa: Empresa, onChanged: () => void) {
  const toast = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [showModal, setShowModal] = useState(false);
  const [editingCuenta, setEditingCuenta] = useState<CuentaBancaria | null>(null);
  const [saving, setSaving] = useState(false);
  const [formEmpresaId, setFormEmpresaId] = useState(empresa.id);
  const [formBanco, setFormBanco] = useState(BANCOS_SUGERIDOS[0]);
  const [formTipo, setFormTipo] = useState<TipoCuentaBancaria>('corriente');
  const [formNumero, setFormNumero] = useState('');
  const [formAlias, setFormAlias] = useState('');
  const [formSaldoInicial, setFormSaldoInicial] = useState<number>(0);
  const [formActivo, setFormActivo] = useState(true);

  const openCreate = () => {
    setEditingCuenta(null);
    setFormEmpresaId(empresa.id);
    setFormBanco(BANCOS_SUGERIDOS[0]);
    setFormTipo('corriente');
    setFormNumero('');
    setFormAlias('');
    setFormSaldoInicial(0);
    setFormActivo(true);
    setShowModal(true);
  };

  const openEdit = (cuenta: CuentaBancaria) => {
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
      onChanged();
    } catch (err: unknown) {
      console.error('Error guardando cuenta:', err);
      const message = err instanceof Error ? err.message : 'Error al guardar la cuenta';
      toast({ message, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (cuenta: CuentaBancaria) => {
    try {
      const nuevoEstado = !cuenta.activo;
      const { error } = await supabase
        .from('cuentas_bancarias')
        .update({ activo: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', cuenta.id);
      if (error) throw error;
      onChanged();
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

  const eliminar = async (cuenta: CuentaBancaria) => {
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

      onChanged();
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

  const dialog = (
    <>
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
            <Field label="Número de cuenta">
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

            <Field label="Saldo inicial">
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
    </>
  );

  return { openCreate, openEdit, toggleActivo, eliminar, dialog };
}
