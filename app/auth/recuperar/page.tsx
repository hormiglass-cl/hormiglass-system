'use client';

import React, { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
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
          <h2 className="text-xl font-extrabold text-[#363636]">Recuperar contraseña</h2>
          <p className="text-xs text-gray-500 font-medium">
            Te enviaremos un link para definir una contraseña nueva.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span>Si el correo está registrado, llegará un link en unos minutos.</span>
          </div>
        )}

        {!ok && (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold py-3 rounded-2xl transition shadow-md disabled:opacity-50 text-sm mt-2"
            >
              {loading ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>
          </form>
        )}

        <div className="text-center">
          <Link href="/login" className="text-[11px] font-bold text-[#F7931F] hover:underline">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
