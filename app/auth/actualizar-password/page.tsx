'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff, Check, ArrowRight } from 'lucide-react';
import Image from 'next/image';

export default function ActualizarPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
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
    <main className="min-h-screen bg-app flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-surface border border-line rounded-panel p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Image
              src="/logo-only-h-removebg-preview.png"
              alt="Hormiglass"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              priority
            />
            <span className="text-[17px] font-bold tracking-tight text-ink">Hormiglass</span>
          </div>
          <h1 className="t-page mb-1.5 text-ink">Define tu nueva contraseña</h1>
          <p className="t-caption text-ink-muted">
            Ingresa una clave segura de al menos 8 caracteres para tu cuenta.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 bg-danger-soft border border-danger-line text-danger p-3.5 rounded-control text-[13px] flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {ok && (
          <div role="status" className="mb-4 bg-success-soft border border-success-line text-success p-3.5 rounded-control text-[13px] flex items-center gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
            <span>Contraseña actualizada con éxito. Redirigiendo al panel operativo...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="input-new-password" className="block text-[13px] font-medium text-ink mb-1.5">
              Nueva contraseña
            </label>
            <div className="relative">
              <Lock size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
              <input
                id="input-new-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface border border-line rounded-control pl-10 pr-10 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute right-2.5 top-2.5 p-1 rounded-control text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="input-confirm-password" className="block text-[13px] font-medium text-ink mb-1.5">
              Confirmar contraseña
            </label>
            <div className="relative">
              <Lock size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
              <input
                id="input-confirm-password"
                type={showConfirmar ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full bg-surface border border-line rounded-control pl-10 pr-10 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="Repite la nueva contraseña"
              />
              <button
                type="button"
                onClick={() => setShowConfirmar(!showConfirmar)}
                aria-label={showConfirmar ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute right-2.5 top-2.5 p-1 rounded-control text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {showConfirmar ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || ok}
            className="w-full mt-2 min-h-11 bg-accent text-on-accent hover:bg-accent-hover font-semibold py-2.5 px-4 rounded-control transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {ok ? (
              <>
                <Check size={16} aria-hidden />
                <span>Listo</span>
              </>
            ) : (
              <>
                <span>{loading ? 'Guardando...' : 'Guardar nueva contraseña'}</span>
                <ArrowRight size={16} aria-hidden />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
