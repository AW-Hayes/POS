import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@pos/types';
import { api } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  pinLogin: (registerId: string, pin: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        set({ token: data.data.token, user: data.data.user, isAuthenticated: true });
      },

      pinLogin: async (registerId, pin) => {
        const { data } = await api.post('/auth/pin-login', { registerId, pin });
        set({ token: data.data.token, user: data.data.user, isAuthenticated: true });
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'pos_auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
