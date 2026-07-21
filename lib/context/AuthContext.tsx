'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Usuario, UserRole } from '../types';
import { createClient } from '../supabase/client';
import { MOCK_USUARIOS } from '../supabase/mock-data';

interface AuthContextType {
  currentUser: Usuario | null;
  setCurrentUser: (user: Usuario | null) => void;
  usersList: Usuario[];
  addUser: (user: Omit<Usuario, 'id' | 'created_at'>) => Promise<void>;
  updateUserRole: (id: string, newRole: UserRole, active: boolean) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  refreshUsers: () => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usersList, setUsersList] = useState<Usuario[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const supabase = createClient();

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        console.warn('Could not load users from Supabase, fallback to MOCK_USUARIOS:', error?.message);
        setUsersList(MOCK_USUARIOS);
        return MOCK_USUARIOS;
      } else {
        setUsersList(data as Usuario[]);
        return data as Usuario[];
      }
    } catch (err) {
      console.error('Error fetching users from Supabase:', err);
      setUsersList(MOCK_USUARIOS);
      return MOCK_USUARIOS;
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const list = await fetchUsers();
      if (!isMounted) return;

      const savedUserEmail = typeof window !== 'undefined' ? localStorage.getItem('hormiglass_user_email') : null;
      const initialUser = savedUserEmail ? (list.find((u) => u.email === savedUserEmail) || null) : null;
      setCurrentUser(initialUser);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const loginUser = (user: Usuario | null) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('hormiglass_user_email', user.email);
      } else {
        localStorage.removeItem('hormiglass_user_email');
      }
    }
  };

  const addUser = async (userData: Omit<Usuario, 'id' | 'created_at'>) => {
    try {
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
        console.error('Error creating user in Supabase:', error.message);
        // Fallback local update
        const newUser: Usuario = {
          ...userData,
          id: `usr-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        setUsersList((prev) => [...prev, newUser]);
      } else if (data) {
        setUsersList((prev) => [...prev, data as Usuario]);
      }
    } catch (err) {
      console.error('Unexpected error in addUser:', err);
    }
  };

  const updateUserRole = async (id: string, newRole: UserRole, active: boolean) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .update({ rol: newRole, activo: active })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating user in Supabase:', error.message);
      }

      setUsersList((prev) =>
        prev.map((u) => (u.id === id ? { ...u, rol: newRole, activo: active } : u))
      );
      if (currentUser && currentUser.id === id) {
        setCurrentUser((prev) => (prev ? { ...prev, rol: newRole, activo: active } : null));
      }
    } catch (err) {
      console.error('Unexpected error in updateUserRole:', err);
    }
  };

  const deleteUser = async (id: string) => {
    try {
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting user in Supabase:', error.message);
      }

      setUsersList((prev) => prev.filter((u) => u.id !== id));
      if (currentUser && currentUser.id === id) {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Unexpected error in deleteUser:', err);
    }
  };

  const hasPermission = (allowedRoles: UserRole[]) => {
    if (!currentUser || !currentUser.activo) return false;
    if (currentUser.rol === 'admin') return true;
    return allowedRoles.includes(currentUser.rol);
  };

  const logout = () => {
    loginUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser: loginUser,
        usersList,
        addUser,
        updateUserRole,
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
