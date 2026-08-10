'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Usuario, UserRole } from '../types';
import { createClient } from '../supabase/client';

interface AuthContextType {
  currentUser: Usuario | null;
  usersList: Usuario[];
  addUser: (user: Omit<Usuario, 'id' | 'created_at'>) => Promise<void>;
  updateUserRole: (id: string, newRole: UserRole, active: boolean) => Promise<void>;
  updateUser: (id: string, updates: { nombre?: string; rol?: UserRole; activo?: boolean }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  refreshUsers: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usersList, setUsersList] = useState<Usuario[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const supabase = createClient();

  // Directorio de usuarios (para selects de "asignado a", etc). Es solo
  // lectura de datos reales — nunca fuente de autenticación.
  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error cargando usuarios desde Supabase:', error.message);
      return [] as Usuario[];
    }
    const list = (data ?? []) as Usuario[];
    setUsersList(list);
    return list;
  }, [supabase]);

  // A partir de una sesión de Supabase Auth válida, carga (o limpia) el
  // perfil de negocio correspondiente en public.usuarios. Cualquier fallo
  // deja currentUser en null — nunca hay fallback a datos falsos/mock.
  const loadProfileForSession = useCallback(
    async (session: Session | null) => {
      if (!session?.user) {
        setCurrentUser(null);
        return;
      }
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('auth_id', session.user.id)
        .maybeSingle();

      if (error || !data || data.activo === false) {
        if (error) console.error('Error cargando perfil de usuario:', error.message);
        setCurrentUser(null);
        return;
      }
      setCurrentUser(data as Usuario);
    },
    [supabase]
  );

  useEffect(() => {
    let isMounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setTimeout(async () => {
        if (!isMounted) return;
        if (session?.user) {
          await loadProfileForSession(session);
          await fetchUsers();
        } else {
          setCurrentUser(null);
          setUsersList([]);
        }
        if (isMounted) {
          setLoading(false);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfileForSession, fetchUsers]);

  const addUser = async (userData: Omit<Usuario, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('usuarios')
      .insert([{
        nombre: userData.nombre,
        email: userData.email,
        rol: userData.rol,
        activo: userData.activo ?? true,
      }])
      .select()
      .single();

    if (error) {
      // No hay fallback local: si Supabase no lo guardó, no existe.
      throw new Error(`No se pudo crear el usuario: ${error.message}`);
    }
    setUsersList((prev) => [...prev, data as Usuario]);
  };

  const updateUserRole = async (id: string, newRole: UserRole, active: boolean) => {
    const { error } = await supabase
      .from('usuarios')
      .update({ rol: newRole, activo: active })
      .eq('id', id);

    if (error) {
      throw new Error(`No se pudo actualizar el usuario: ${error.message}`);
    }

    setUsersList((prev) =>
      prev.map((u) => (u.id === id ? { ...u, rol: newRole, activo: active } : u))
    );
    if (currentUser && currentUser.id === id) {
      setCurrentUser((prev) => (prev ? { ...prev, rol: newRole, activo: active } : null));
    }
  };

  const updateUser = async (id: string, updates: { nombre?: string; rol?: UserRole; activo?: boolean }) => {
    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`No se pudo actualizar el usuario: ${error.message}`);
    }

    const updated = data as Usuario;
    setUsersList((prev) => prev.map((u) => (u.id === id ? updated : u)));
    if (currentUser && currentUser.id === id) {
      setCurrentUser(updated);
    }
  };

  const deleteUser = async (id: string) => {
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) {
      throw new Error(`No se pudo eliminar el usuario: ${error.message}`);
    }
    setUsersList((prev) => prev.filter((u) => u.id !== id));
  };

  // Afordancia de UI únicamente (ocultar botones/menús). La aplicación real
  // de permisos vive en las políticas RLS de Supabase, no acá.
  const hasPermission = (allowedRoles: UserRole[]) => {
    if (!currentUser || !currentUser.activo) return false;
    if (currentUser.rol === 'admin') return true;
    return allowedRoles.includes(currentUser.rol);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        usersList,
        addUser,
        updateUserRole,
        updateUser,
        deleteUser,
        hasPermission,
        refreshUsers: async () => { await fetchUsers(); },
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
