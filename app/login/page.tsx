'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { Mail, Lock, AlertCircle, LogIn, User, Eye, EyeOff, CheckCircle2, UserPlus, Clock } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

function readInactiveNotice(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('error') === 'inactivo'
    ? 'Tu cuenta está desactivada. Contacta a un administrador.'
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
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.user) {
        setError('Correo o contraseña incorrectos.');
        setLoading(false);
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios')
        .select('activo')
        .eq('auth_id', data.user.id)
        .maybeSingle();

      if (perfilError || !perfil || perfil.activo === false) {
        await supabase.auth.signOut();
        setError('Tu cuenta no está habilitada para acceder al sistema.');
        setLoading(false);
        return;
      }

      router.replace('/');
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
        const errText = signUpError.message || (typeof signUpError === 'object' ? JSON.stringify(signUpError) : String(signUpError));
        if (errText.toLowerCase().includes('rate limit')) {
          setCooldownSeconds(300); // 5 minutos de temporizador
          setError(`Supabase ha limitado los envíos de correo por esta hora. Podrás reintentar el registro en ${formatTimer(300)} min.`);
        } else {
          setError(errText === '{}' ? 'No se pudo completar el registro en Supabase. Intenta nuevamente o verifica la conexión.' : errText);
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

  return (
    <div className="fixed inset-0 bg-[#363636] z-50 flex items-center justify-center p-4 text-[#363636]">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-gray-200 shadow-2xl space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-2">
            <Image
              src="/logo-completo-hormiglass.webp"
              alt="Hormiglass Logo"
              width={220}
              height={55}
              className="h-14 w-auto object-contain"
              priority
            />
          </div>
          <h2 className="text-xl font-extrabold text-[#363636]">
            {mode === 'login' ? 'Inicio de Sesión' : 'Crear Nueva Cuenta'}
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            {mode === 'login'
              ? 'Ingresa tus credenciales para acceder a la plataforma.'
              : 'Completa tus datos para registrarte en el sistema.'}
          </p>
        </div>

        {/* Selector de Pestañas: Login vs Registro */}
        <div className="flex bg-gray-100 p-1 rounded-2xl text-xs font-extrabold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 rounded-xl transition text-center flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-white text-[#363636] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Iniciar Sesión</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-2 rounded-xl transition text-center flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'bg-white text-[#363636] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Crear Cuenta</span>
          </button>
        </div>

        {(error || inactiveNotice) && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              {cooldownSeconds > 0
                ? `Supabase ha limitado los envíos de correo. Tiempo restante para reintentar: ${formatTimer(cooldownSeconds)}`
                : error || inactiveNotice}
            </span>
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <div>
              <label className="block font-bold text-gray-700 mb-1">Nombre Completo</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-300 rounded-2xl pl-9 pr-3 py-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                  placeholder="Ej: Marcos Catalán"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-gray-700 mb-1">Correo Electrónico</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-2xl pl-9 pr-3 py-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                placeholder="correo@hormiglass.cl"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-2xl pl-9 pr-10 py-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 focus:outline-none"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <div className="text-right">
              <Link href="/auth/recuperar" className="text-[11px] font-bold text-[#F7931F] hover:underline">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || cooldownSeconds > 0}
            className="w-full bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold py-3 rounded-2xl transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm mt-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {cooldownSeconds > 0 ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>Reintento en {formatTimer(cooldownSeconds)} min</span>
              </>
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Iniciando Sesión...' : 'Ingresar'}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Registrando...' : 'Registrar Cuenta'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
