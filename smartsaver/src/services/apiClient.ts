import {
  TelemetriaResponse,
  DispositivoResponse,
  DispositivoLimitesCommand,
} from '../types/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.thesisbroker.com';
const REQUEST_TIMEOUT = 10000; // 10 seconds

let getAccessTokenFn: (() => Promise<string | null>) | null = null;

export function setAccessTokenGetter(fn: () => Promise<string | null>) {
  getAccessTokenFn = fn;
}

async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  retryOn401: boolean = true,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const token = getAccessTokenFn ? await getAccessTokenFn() : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (res.status === 401 && retryOn401 && getAccessTokenFn) {
      // Token may be expired — refresh and retry once
      const { refreshAccessToken } = require('./authService');
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        return authenticatedFetch(url, options, false);
      }
      // Refresh failed — force logout
      const { useAuthStore } = require('../store/useAuthStore');
      useAuthStore.getState().logout();
      throw new Error('Session expired. Please log in again.');
    }

    return res;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── GET /api/dispositivos — List user's devices ─────────────

async function getDevices(): Promise<DispositivoResponse[]> {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export const apiClient = {
  // ─── Diagnostics ────────────────────────────────────────

  getHealth: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    } catch (e) {
      throw e;
    }
  },

  // ─── Telemetry ──────────────────────────────────────────

  getTelemetryHistory: async (macDispositivo: string, limite: number = 50): Promise<TelemetriaResponse[]> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/telemetria?limite=${limite}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  // ─── Control Commands ───────────────────────────────────

  setDeviceState: async (macDispositivo: string, encendido: boolean): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/comando/estado`, {
        method: 'POST',
        body: JSON.stringify({ encendido }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  setDeviceLimits: async (macDispositivo: string, limits: DispositivoLimitesCommand): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/comando/limites`, {
        method: 'POST',
        body: JSON.stringify(limits),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ─── Device ──────────────────────────────────────────────

  getDeviceDetail: async (macDispositivo: string): Promise<DispositivoResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getDevices,

  // ─── Health (unauthenticated) ───────────────────────────

  healthCheck: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    } catch (e) {
      throw e;
    }
  },
};