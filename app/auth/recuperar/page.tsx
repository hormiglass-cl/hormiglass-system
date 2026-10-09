'use client';

import React, { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { Mail, AlertCircle, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function RecuperarPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const redirectUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hormiglass-system.vercel.app';
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${redirectUrl}/auth/callback?next=/auth/actualizar-password`,
    });

    setLoading(false);
    // Mismo mensaje exista o no la cuenta — evita confirmar qué emails están registrados.
    if (resetError) {
      setError('No se pudo procesar la solicitud. Intenta nuevamente.');
      return;
    }
    setOk(true);
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
          <h1 className="t-page mb-1.5 text-ink">Recuperar contraseña</h1>
          <p className="t-caption text-ink-muted">
            Te enviaremos un enlace seguro a tu correo para definir una contraseña nueva.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 bg-danger-soft border border-danger-line text-danger p-3.5 rounded-control text-[13px] flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {ok && (
          <div role="status" className="mb-4 bg-success-soft border border-success-line text-success p-3.5 rounded-control text-[13px] flex items-start gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-success" aria-hidden />
            <span>Si el correo está registrado en el sistema, recibirás las instrucciones en unos minutos.</span>
          </div>
        )}

        {!ok ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="input-recuperar-email" className="block text-[13px] font-medium text-ink mb-1.5">
                Correo electrónico registrado
              </label>
              <div className="relative">
                <Mail size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
                <input
                  id="input-recuperar-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface border border-line rounded-control pl-10 pr-3.5 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="usuario@hormiglass.cl"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 min-h-11 bg-accent text-on-accent hover:bg-accent-hover font-semibold py-2.5 px-4 rounded-control transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{loading ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}</span>
              <ArrowRight size={16} aria-hidden />
            </button>
          </form>
        ) : (
          <div className="pt-2">
            <Link
              href="/login"
              className="w-full min-h-11 bg-surface-muted hover:bg-surface border border-line text-ink font-medium py-2.5 px-4 rounded-control transition-colors flex items-center justify-center gap-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft size={15} aria-hidden />
              <span>Volver a iniciar sesión</span>
            </Link>
          </div>
        )}

        <div className="text-center pt-6 mt-6 border-t border-line">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control px-2 py-1"
          >
            <ArrowLeft size={14} aria-hidden />
            <span>Volver al inicio de sesión</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
