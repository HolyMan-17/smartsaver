import { create } from 'zustand';
import { Alert } from 'react-native';
import * as SecureStore from '../services/secureStore';
import {
  loginWithAuth0,
  refreshAccessToken,
  getAccessToken,
  getAuthUser,
  logoutAuth0,
  revokeRefreshToken,
  authConfig,
  clearTokens,
} from '../services/authService';
import { apiClient } from '../services/apiClient';
import { useTelemetryStore } from './useTelemetryStore';
import { useNotificationStore } from './useNotificationStore';
import { useUserStore } from './useUserStore';
import { useEventLogStore } from './useEventLogStore';
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
      if (!user) {
        try { await clearTokens(); } catch {}
        Alert.alert('Error de autenticación', 'No se pudo obtener el perfil. Intenta nuevamente.');
        set({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }

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
    try { await revokeRefreshToken(); } catch {}
    try { await apiClient.updateUserSettings({ expo_push_token: null }); } catch {}
    try { useTelemetryStore.getState().stopConnection(); } catch {}
    try { useNotificationStore.getState().clearAll(true); } catch {}
    try { useUserStore.getState().resetUser(); } catch {}
    try { useEventLogStore.getState().clearLogs(); } catch {}
    try { await logoutAuth0(); } catch (e) { console.warn('[Auth] logoutAuth0 failed', e); }
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
            try { await clearTokens(); } catch {}
            set({ isAuthenticated: false, isLoading: false });
            return;
          }
        }
      }

      const user = await getAuthUser();
      if (!user) {
        try { await clearTokens(); } catch {}
        if (__DEV__) console.warn('[Auth] rehydrate: getAuthUser returned null');
        set({ isAuthenticated: false, user: null, isLoading: false });
        return;
      }
      set({ isAuthenticated: true, user, isLoading: false });
    } catch {
      try { await clearTokens(); } catch {}
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  getAccessToken: async (): Promise<string | null> => {
    return getAccessToken();
  },
}));