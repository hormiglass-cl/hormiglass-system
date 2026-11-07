'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { LogIn, UserPlus, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { AuthShell, AuthField, AuthPasswordField, AuthAlert, authPrimaryButton, authLink } from '../../components/auth/AuthShell';
import { mensajeError } from '../../lib/errores';

function readInactiveNotice(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('error') === 'inactivo'
    ? 'Tu cuenta está desactivada. Contacta a un administrador para reactivar el acceso.'
    : '';
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [inactiveNotice] = useState(readInactiveNotice);

  // Contador en vivo de espera para reintentos por rate limit
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    if (mode === 'login') {
      try {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError || !data.user) {
          setError('Correo electrónico o contraseña incorrectos.');
          return;
        }

        // signInWithPassword ya guarda la sesión en las cookies del cliente SSR.
        let { data: perfil, error: perfilError } = await supabase
          .from('usuarios')
          .select('activo')
          .eq('auth_id', data.user.id)
          .maybeSingle();

        // Manejar desajuste de reloj (clock skew) si el token fue emitido con un iat futuro
        if (perfilError && (perfilError.message?.includes('future') || perfilError.message?.includes('JWT'))) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
          const retry = await supabase
            .from('usuarios')
            .select('activo')
            .eq('auth_id', data.user.id)
            .maybeSingle();
          perfil = retry.data;
          perfilError = retry.error;
        }

        if (perfilError) {
          console.error('Error validando perfil de acceso:', perfilError.message);
          await supabase.auth.signOut();
          setError('No se pudo validar tu perfil de acceso. Intenta nuevamente.');
          return;
        }

        if (!perfil || perfil.activo === false) {
          await supabase.auth.signOut();
          setError('Tu cuenta no está habilitada para acceder al sistema.');
          return;
        }

        router.replace('/');
        router.refresh();
      } catch (loginError) {
        console.error('Error durante el inicio de sesión:', loginError);
        setError('No se pudo completar el inicio de sesión. Revisa la conexión e intenta nuevamente.');
      } finally {
        setLoading(false);
      }
    } else {
      // REGISTRO DE NUEVO USUARIO
      if (!nombre.trim()) {
        setError('Por favor ingresa tu nombre completo.');
        setLoading(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.hostname === 'localhost' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || 'https://portal.hormiglass.cl')}/`,
          data: {
            nombre: nombre.trim(),
          },
        },
      });

      if (signUpError) {
        const errText = signUpError.message || '';
        if (errText.toLowerCase().includes('rate limit')) {
          setCooldownSeconds(300); // 5 minutos de temporizador
          setError(`Se alcanzó el límite de registros por esta hora. Podrás reintentar el registro en ${formatTimer(300)} min.`);
        } else {
          setError(mensajeError(signUpError, 'No se pudo completar el registro. Intenta nuevamente o verifica la conexión.'));
        }
        setLoading(false);
        return;
      }

      if (signUpData.user) {
        setSuccessMsg('¡Cuenta registrada exitosamente! Iniciando sesión...');
        // Intentar iniciar sesión automáticamente
        const { data: signInData, error: autoLoginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (!autoLoginError && signInData.user) {
          setTimeout(() => {
            router.replace('/');
          }, 1500);
        } else {
          setLoading(false);
          setMode('login');
        }
      } else {
        setLoading(false);
      }
    }
  };

  const activeNotice = cooldownSeconds > 0
    ? `Límite temporal alcanzado. Tiempo de espera restante: ${formatTimer(cooldownSeconds)} min.`
    : error || inactiveNotice;

  const segment = (active: boolean) =>
    `py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-[13px] font-medium ${
      active ? 'bg-white/15 text-white font-semibold shadow-sm' : 'text-white/70 hover:text-white'
    }`;

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setSuccessMsg('');
  };

  return (
    <AuthShell
      title={mode === 'login' ? 'Bienvenido a Hormiglass' : 'Crear nueva cuenta'}
      subtitle={
        mode === 'login'
          ? 'Ingresa tus credenciales autorizadas para acceder al sistema.'
          : 'Completa tus datos personales para solicitar acceso.'
      }
    >
      {/* Selector de modo */}
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
        <button type="button" onClick={() => switchMode('login')} aria-pressed={mode === 'login'} className={segment(mode === 'login')}>
          <LogIn size={15} aria-hidden />
          <span>Iniciar sesión</span>
        </button>
        <button type="button" onClick={() => switchMode('register')} aria-pressed={mode === 'register'} className={segment(mode === 'register')}>
          <UserPlus size={15} aria-hidden />
          <span>Crear cuenta</span>
        </button>
      </div>

      {activeNotice && <AuthAlert tone="danger">{activeNotice}</AuthAlert>}
      {successMsg && <AuthAlert tone="success">{successMsg}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <AuthField
            id="input-nombre"
            label="Nombre completo"
            type="text"
            required
            autoComplete="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Marcos Catalán"
          />
        )}

        <AuthField
          id="input-email"
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@hormiglass.cl"
        />

        <AuthPasswordField
          id="input-password"
          label="Contraseña"
          required
          minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          labelAction={
            mode === 'login' ? (
              <Link href="/auth/recuperar" className={authLink}>
                ¿Olvidaste tu contraseña?
              </Link>
            ) : undefined
          }
        />

        <button type="submit" disabled={loading || cooldownSeconds > 0} className={`mt-2 ${authPrimaryButton}`}>
          {cooldownSeconds > 0 ? (
            <>
              <Clock size={16} className="animate-spin" aria-hidden />
              <span>Reintentar en {formatTimer(cooldownSeconds)} min</span>
            </>
          ) : mode === 'login' ? (
            <>
              <span>{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}</span>
              <ArrowRight size={16} aria-hidden />
            </>
          ) : (
            <>
              <UserPlus size={16} aria-hidden />
              <span>{loading ? 'Creando cuenta...' : 'Crear cuenta'}</span>
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
