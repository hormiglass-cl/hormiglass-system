'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/context/AuthContext';
import { Mail, Lock, AlertCircle, LogIn } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser, usersList } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    setTimeout(() => {
      const foundUser = usersList.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (foundUser) {
        setCurrentUser(foundUser);
        router.push('/');
      } else {
        setError('No se encontró un usuario registrado con este correo en el sistema.');
      }
      setLoading(false);
    }, 500);
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
          <h2 className="text-xl font-extrabold text-[#363636]">Inicio de Sesión</h2>
          <p className="text-xs text-gray-500 font-medium">
            Ingresa tus credenciales para acceder a la plataforma.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-2xl text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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

          <div>
            <label className="block font-bold text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-2xl pl-9 pr-3 py-2.5 text-[#363636] font-medium focus:outline-none focus:border-[#F7931F]"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F7931F] hover:bg-[#e08316] text-white font-extrabold py-3 rounded-2xl transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 text-sm mt-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Iniciando Sesión...' : 'Ingresar'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
