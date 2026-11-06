'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import { recoveryRedirectUrl } from '../../../lib/site-url';
import {
  AuthShell,
  AuthField,
  AuthPasswordField,
  AuthCodeField,
  AuthAlert,
  AuthLoading,
  authPrimaryButton,
  authSecondaryButton,
  authLink,
} from '../../../components/auth/AuthShell';

/* Recuperación por código de un solo uso (OTP), sin enlaces:
   1) correo → Supabase envía un código  2) código → verifyOtp abre sesión
   3) nueva contraseña → updateUser.
   El largo del código debe coincidir con "Email OTP Length" en Supabase Auth. */
const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;
const MIN_PASSWORD = 8;

type Step = 'email' | 'code' | 'password' | 'done';

function isRateLimit(err: { status?: number; code?: string } | null) {
  return !!err && (err.status === 429 || err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit');
}

export default function RecuperarPasswordPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <RecuperarPasswordForm />
    </Suspense>
  );
}

function RecuperarPasswordForm() {
  const router = useRouter();
  const supabase = createClient();
  // El enlace del correo llega con ?paso=codigo: se abre directo en "ingresar código".
  const openedFromEmail = useSearchParams().get('paso') === 'codigo';

  const [step, setStep] = useState<Step>(openedFromEmail ? 'code' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const goTo = (next: Step) => {
    setError('');
    setInfo('');
    setStep(next);
  };

  const sendCode = async (): Promise<boolean> => {
    setError('');
    setInfo('');
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: recoveryRedirectUrl(),
    });
    setLoading(false);

    if (isRateLimit(resetError)) {
      setError('Pediste demasiados códigos seguidos. Espera unos minutos e intenta nuevamente.');
      return false;
    }
    // Mismo resultado exista o no la cuenta — evita confirmar qué correos están registrados.
    if (resetError && resetError.status && resetError.status >= 500) {
      setError('No se pudo procesar la solicitud. Intenta nuevamente.');
      return false;
    }
    setCooldown(RESEND_SECONDS);
    return true;
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await sendCode()) {
      setCode('');
      setStep('code');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    if (await sendCode()) setInfo('Te enviamos un código nuevo. El anterior ya no sirve.');
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (code.length !== OTP_LENGTH) {
      setError(`El código tiene ${OTP_LENGTH} dígitos.`);
      return;
    }
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'recovery' });
    setLoading(false);
    if (verifyError) {
      setError(isRateLimit(verifyError) ? 'Demasiados intentos. Espera un momento e intenta nuevamente.' : 'El código es incorrecto o ya venció.');
      return;
    }
    goTo('password');
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD) {
      setError(`La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
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
      setError('No se pudo actualizar la contraseña. Vuelve a pedir un código.');
      return;
    }
    setStep('done');
    setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 1500);
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    email: { title: 'Recuperar contraseña', subtitle: 'Te enviaremos un código de verificación a tu correo.' },
    code: {
      title: 'Ingresa tu código',
      subtitle: email.trim()
        ? `Enviamos un código de ${OTP_LENGTH} dígitos a ${email.trim()}.`
        : `Ingresa tu correo y el código de ${OTP_LENGTH} dígitos que te enviamos.`,
    },
    password: { title: 'Define tu nueva contraseña', subtitle: `Ingresa una clave segura de al menos ${MIN_PASSWORD} caracteres.` },
    done: { title: 'Contraseña actualizada', subtitle: 'Te estamos llevando al panel operativo.' },
  };

  return (
    <AuthShell
      title={titles[step].title}
      subtitle={titles[step].subtitle}
      footer={
        step !== 'done' ? (
          <Link href="/login" className={`inline-flex items-center gap-1.5 py-1 ${authLink}`}>
            <ArrowLeft size={14} aria-hidden />
            <span>Volver al inicio de sesión</span>
          </Link>
        ) : undefined
      }
    >
      {error && <AuthAlert tone="danger">{error}</AuthAlert>}
      {info && <AuthAlert tone="success">{info}</AuthAlert>}

      {step === 'email' && (
        <form onSubmit={handleEmail} className="space-y-4">
          <AuthField
            id="input-recuperar-email"
            label="Correo electrónico registrado"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="usuario@hormiglass.cl"
          />
          <button type="submit" disabled={loading} className={`mt-2 ${authPrimaryButton}`}>
            <span>{loading ? 'Enviando código...' : 'Enviar código'}</span>
            <ArrowRight size={16} aria-hidden />
          </button>
          <p className="text-center">
            <button
              type="button"
              disabled={!email.trim()}
              onClick={() => goTo('code')}
              className={`${authLink} disabled:opacity-40 disabled:no-underline`}
            >
              Ya tengo un código
            </button>
          </p>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleCode} className="space-y-4">
          {openedFromEmail && (
            <AuthField
              id="input-codigo-email"
              label="Correo electrónico"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@hormiglass.cl"
            />
          )}
          <AuthCodeField id="input-otp" label="Código de verificación" length={OTP_LENGTH} value={code} onChange={setCode} />
          <button type="submit" disabled={loading || code.length !== OTP_LENGTH || !email.trim()} className={`mt-2 ${authPrimaryButton}`}>
            <span>{loading ? 'Verificando...' : 'Verificar código'}</span>
            <ArrowRight size={16} aria-hidden />
          </button>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => goTo('email')} className={authLink}>
              Cambiar correo
            </button>
            <button type="button" onClick={handleResend} disabled={cooldown > 0 || loading || !email.trim()} className={`${authLink} disabled:opacity-50 disabled:no-underline`}>
              {cooldown > 0 ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}
            </button>
          </div>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handlePassword} className="space-y-4">
          <AuthPasswordField
            id="input-new-password"
            label="Nueva contraseña"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
          />
          <AuthPasswordField
            id="input-confirm-password"
            label="Confirmar contraseña"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            placeholder="Repite la nueva contraseña"
          />
          <button type="submit" disabled={loading} className={`mt-2 ${authPrimaryButton}`}>
            <span>{loading ? 'Guardando...' : 'Guardar contraseña'}</span>
            <ArrowRight size={16} aria-hidden />
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <AuthAlert tone="success">Tu contraseña se actualizó con éxito.</AuthAlert>
          <Link href="/" className={authSecondaryButton}>
            <Check size={15} aria-hidden />
            <span>Ir al panel operativo</span>
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
