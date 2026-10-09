'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Mail, Lock, AlertCircle, LogIn, User, Eye, EyeOff, CheckCircle2, UserPlus, Clock, ArrowRight, ShieldCheck, Truck, Receipt } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
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
  const [showPassword, setShowPassword] = useState(false);
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
          emailRedirectTo: 'https://hormiglass-system.vercel.app/',
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

  return (
    <main className="min-h-screen bg-app flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl bg-surface border border-line rounded-panel shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Panel lateral de marca Hormiglass (solo en pantallas medianas y grandes) */}
        <section aria-label="Identidad Hormiglass" className="relative hidden lg:flex lg:col-span-5 flex-col justify-between p-8 bg-surface-muted border-r border-line">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
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

            <h2 className="t-page mb-3 text-ink">Control integral de obras y prefabricados</h2>
            <p className="t-caption text-ink-muted mb-8 leading-relaxed">
              Plataforma operacional para cotizaciones, seguimiento de fabricación, despacho y postventa técnica.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink shrink-0 mt-0.5">
                  <Truck size={15} aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">Despachos y logística</p>
                  <p className="t-caption text-ink-muted">Trazabilidad en tiempo real de guías y vehículos en faena.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink shrink-0 mt-0.5">
                  <Receipt size={15} aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">Caja y tesorería</p>
                  <p className="t-caption text-ink-muted">Validación bancaria de comprobantes y órdenes de compra.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-control bg-accent-soft text-accent-ink shrink-0 mt-0.5">
                  <ShieldCheck size={15} aria-hidden />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">Garantías y postventa</p>
                  <p className="t-caption text-ink-muted">Resolución de casos en terreno con respaldo fotográfico.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-line mt-8 flex items-center justify-between text-[11px] text-ink-muted">
            <span className="code-stamp">HORMIGLASS CRM</span>
            <span>Chile</span>
          </div>
        </section>

        {/* Panel de formulario (Login / Registro) */}
        <section aria-labelledby="form-heading" className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
          {/* Cabecera para dispositivos móviles */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <Image
              src="/logo-only-h-removebg-preview.png"
              alt="Hormiglass"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
              priority
            />
            <span className="text-[16px] font-bold tracking-tight text-ink">Hormiglass CRM</span>
          </div>

          <div className="mb-6">
            <h1 id="form-heading" className="t-page mb-1 text-ink">
              {mode === 'login' ? 'Iniciar sesión' : 'Crear nueva cuenta'}
            </h1>
            <p className="t-caption text-ink-muted">
              {mode === 'login'
                ? 'Ingresa tus credenciales autorizadas para acceder al sistema.'
                : 'Completa tus datos personales para solicitar acceso.'}
            </p>
          </div>

          {/* Selector de modo estilo control segmentado */}
          <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-control mb-5 text-[13px]">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2 px-3 rounded-control transition-colors flex items-center justify-center gap-2 font-medium ${
                mode === 'login'
                  ? 'bg-surface text-ink font-semibold shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <LogIn size={15} aria-hidden />
              <span>Iniciar sesión</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError('');
                setSuccessMsg('');
              }}
              className={`py-2 px-3 rounded-control transition-colors flex items-center justify-center gap-2 font-medium ${
                mode === 'register'
                  ? 'bg-surface text-ink font-semibold shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <UserPlus size={15} aria-hidden />
              <span>Crear cuenta</span>
            </button>
          </div>

          {/* Avisos de error y notificaciones */}
          {activeNotice && (
            <div role="alert" className="mb-4 bg-danger-soft border border-danger-line text-danger p-3.5 rounded-control text-[13px] flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-danger" aria-hidden />
              <span>{activeNotice}</span>
            </div>
          )}

          {successMsg && (
            <div role="status" className="mb-4 bg-success-soft border border-success-line text-success p-3.5 rounded-control text-[13px] flex items-center gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="input-nombre" className="block text-[13px] font-medium text-ink mb-1.5">
                  Nombre completo
                </label>
                <div className="relative">
                  <User size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
                  <input
                    id="input-nombre"
                    type="text"
                    required
                    autoComplete="name"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full bg-surface border border-line rounded-control pl-10 pr-3.5 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    placeholder="Ej: Marcos Catalán"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="input-email" className="block text-[13px] font-medium text-ink mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
                <input
                  id="input-email"
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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="input-password" className="block text-[13px] font-medium text-ink">
                  Contraseña
                </label>
                {mode === 'login' && (
                  <Link
                    href="/auth/recuperar"
                    className="text-[12px] font-medium text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control px-1"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Lock size={16} className="text-ink-muted absolute left-3.5 top-3" aria-hidden />
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface border border-line rounded-control pl-10 pr-10 py-2 text-[14px] text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="••••••••"
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

            <button
              type="submit"
              disabled={loading || cooldownSeconds > 0}
              className="w-full mt-2 min-h-11 bg-accent text-on-accent hover:bg-accent-hover font-semibold py-2.5 px-4 rounded-control transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
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

          <footer className="mt-8 pt-6 border-t border-line text-center">
            <p className="t-caption text-ink-muted">
              Hormiglass SPA · Sistema de gestión operacional y comercial
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
