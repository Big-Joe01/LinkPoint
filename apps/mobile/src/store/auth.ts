import { create } from 'zustand';
import { api, setTokens, clearTokens } from '../lib/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: string;
  }) => Promise<{ emailVerifyToken: string }>;
  verifyEmail: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  hydrated: false,

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
        '/auth/login',
        { email, password },
      );
      await setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  register: async (input) => {
    set({ loading: true });
    try {
      const res = await api.post<{ userId: string; emailVerifyToken: string }>('/auth/register', input);
      return { emailVerifyToken: res.emailVerifyToken };
    } finally {
      set({ loading: false });
    }
  },

  verifyEmail: async (token) => {
    await api.post('/auth/verify-email', { token });
  },

  logout: async () => {
    await clearTokens();
    set({ user: null });
  },

  bootstrap: async () => {
    try {
      const user = await api.get<AuthUser>('/users/me');
      set({ user });
    } catch {
      set({ user: null });
    } finally {
      set({ hydrated: true });
    }
  },
}));
