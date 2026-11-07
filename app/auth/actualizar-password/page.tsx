'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { Check, ArrowRight } from 'lucide-react';
import { AuthShell, AuthPasswordField, AuthAlert, authPrimaryButton } from '../../../components/auth/AuthShell';

export default function ActualizarPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('No se pudo actualizar la contraseña. Por favor solicita un nuevo enlace de recuperación.');
      return;
    }

    setOk(true);
    setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 1500);
  };

  return (
    <AuthShell title="Define tu nueva contraseña" subtitle="Ingresa una clave segura de al menos 8 caracteres para tu cuenta.">
      {error && <AuthAlert tone="danger">{error}</AuthAlert>}
      {ok && <AuthAlert tone="success">Contraseña actualizada con éxito. Redirigiendo al panel operativo...</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthPasswordField
          id="input-new-password"
          label="Nueva contraseña"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 8 caracteres"
        />
        <AuthPasswordField
          id="input-confirm-password"
          label="Confirmar contraseña"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          placeholder="Repite la nueva contraseña"
        />
        <button type="submit" disabled={loading || ok} className={`mt-2 ${authPrimaryButton}`}>
          {ok ? (
            <>
              <Check size={16} aria-hidden />
              <span>Listo</span>
            </>
          ) : (
            <>
              <span>{loading ? 'Guardando...' : 'Guardar contraseña'}</span>
              <ArrowRight size={16} aria-hidden />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
