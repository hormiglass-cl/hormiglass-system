'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';

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
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError('No se pudo actualizar la contraseña. Vuelve a solicitar el link.');
      return;
    }

    setOk(true);
    setTimeout(() => {
      router.replace('/');
      router.refresh();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-[#f7f7f5] z-50 flex items-center justify-center p-4 text-[#252b2d]">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-[#e5e7e4] shadow-[var(--hg-shadow-card)] space-y-6">
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
          <h2 className="text-xl font-extrabold text-[#213343]">Define tu contraseña</h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-lg text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-3.5 rounded-lg text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <span>Contraseña actualizada. Redirigiendo...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-gray-700 mb-1">Nueva Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-gray-700 mb-1">Confirmar Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="password"
                required
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2.5 text-[#213343] font-medium focus:outline-none focus:border-[#f97316]"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-on-accent font-extrabold py-3 rounded-lg transition shadow-sm disabled:opacity-50 text-sm mt-2"
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
