import { create } from 'zustand';
import * as SecureStore from '../services/secureStore';
import {
  loginWithAuth0,
  refreshAccessToken,
  getAccessToken,
  getAuthUser,
  logoutAuth0,
  revokeRefreshToken,
  authConfig,
} from '../services/authService';
import { AuthState } from '../types/auth';

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,

  login: async () => {
    try {
      const tokens = await loginWithAuth0();
      if (!tokens) {
        return;
      }

      const user = await getAuthUser();
      set({
        isAuthenticated: true,
        user,
        isLoading: false,
      });
    } catch (error) {
      const result = error as { type?: string };
      if (result.type === 'cancel') {
        return;
      }
      console.error('[AuthStore] Login error:', error);
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      await revokeRefreshToken();
    } catch {
      // Best effort
    }
    await logoutAuth0();
    set({ isAuthenticated: false, user: null });
  },

  rehydrate: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync(authConfig.secureStoreKeys.ACCESS_TOKEN);
      if (!accessToken) {
        set({ isAuthenticated: false, isLoading: false });
        return;
      }

      const expiryStr = await SecureStore.getItemAsync(authConfig.secureStoreKeys.TOKEN_EXPIRY);
      if (expiryStr) {
        const expiry = parseInt(expiryStr, 10);
        if (Date.now() >= expiry) {
          const newTokens = await refreshAccessToken();
          if (!newTokens) {
            set({ isAuthenticated: false, isLoading: false });
            return;
          }
        }
      }

      const user = await getAuthUser();
      set({ isAuthenticated: true, user, isLoading: false });
    } catch {
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  getAccessToken: async (): Promise<string | null> => {
    return getAccessToken();
  },
}));