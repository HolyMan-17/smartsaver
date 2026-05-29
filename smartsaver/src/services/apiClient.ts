import {
  TelemetriaResponse,
  DispositivoResponse,
  DispositivoLimitesCommand,
  DispositivoUpdateCommand,
  DispositivoDeleteResponse,
  AgregadosResponse,
  AlertaResponse,
  EventoResponse,
  ApiErrorResponse,
  UserSettingsResponse,
  UserSettingsUpdate,
  AIOverrideResponse,
  HorarioUpdate,
  HorarioResponse,
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

    if (res.status === 403) {
      let isUserNotFound = false;
      try {
        const body = await res.clone().json();
        isUserNotFound = body.error === 'forbidden' && /not found|inactive/i.test(body.message ?? '');
      } catch {
        // Body unreadable — assume device access denied, not user-not-found
      }
      if (isUserNotFound) {
        const { useAuthStore } = require('../store/useAuthStore');
        useAuthStore.getState().logout();
        throw new Error('Usuario no encontrado. Inicia sesión nuevamente.');
      }
      throw new Error('Acceso denegado al recurso.');
    }

    if (res.status === 401 && retryOn401 && getAccessTokenFn) {
      const { refreshAccessToken } = require('./authService');
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        return authenticatedFetch(url, options, false);
      }
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

async function parseApiError(res: Response): Promise<ApiErrorResponse | null> {
  try {
    const body = await res.json();
    if (body.error && body.message) return body as ApiErrorResponse;
    return null;
  } catch {
    return null;
  }
}

// ─── GET /api/dispositivos — List user's devices ─────────────

async function getDevices(prioridad?: 'P1' | 'P2' | 'P3'): Promise<DispositivoResponse[] | null> {
  try {
    const url = prioridad 
      ? `${API_BASE_URL}/api/dispositivos?prioridad=${prioridad}` 
      : `${API_BASE_URL}/api/dispositivos`;
    const res = await authenticatedFetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
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

  getTelemetryAggregates: async (macDispositivo: string, granularity: 'hour' | 'day' = 'hour', desde?: string, hasta?: string): Promise<AgregadosResponse[]> => {
    try {
      const params = new URLSearchParams({ granularity });
      if (desde) params.append('desde', desde);
      if (hasta) params.append('hasta', hasta);
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/agregados?${params.toString()}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  // ─── Control Commands ───────────────────────────────────

  setDeviceState: async (macDispositivo: string, encendido: boolean, override_automation: boolean = false): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/comando/estado`, {
        method: 'POST',
        body: JSON.stringify({ encendido, override_automation }),
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

  updateDevice: async (mac: string, updates: DispositivoUpdateCommand): Promise<DispositivoResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${mac}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const apiError = await parseApiError(res);
        throw new Error(apiError?.message || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (error) {
      throw error;
    }
  },

  deleteDevice: async (mac: string): Promise<DispositivoDeleteResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${mac}`, {
        method: 'DELETE',
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getDevices,

  // ─── Schedule (Horario) ──────────────────────────────────

  getDeviceSchedule: async (mac: string): Promise<HorarioResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${mac}/horario`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  updateDeviceSchedule: async (mac: string, schedule: HorarioUpdate): Promise<HorarioResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${mac}/horario`, {
        method: 'PUT',
        body: JSON.stringify(schedule),
      });
      if (!res.ok) {
        const apiError = await parseApiError(res);
        throw new Error(apiError?.message || `HTTP ${res.status}`);
      }
      return res.json();
    } catch (error) {
      throw error;
    }
  },

  // ─── Alerts ─────────────────────────────────────────────

  getAlerts: async (soloActivas: boolean = true): Promise<AlertaResponse[]> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/alertas?solo_activas=${soloActivas}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

  resolveAlert: async (alertaId: number): Promise<boolean> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/alertas/${alertaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ resuelto: true }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ─── Events ─────────────────────────────────────────────

  getEvents: async (mac?: string, limite: number = 50): Promise<EventoResponse[]> => {
    try {
      const params = new URLSearchParams();
      if (mac) params.append('mac', mac);
      params.append('limite', String(limite));
      const res = await authenticatedFetch(`${API_BASE_URL}/api/eventos?${params.toString()}`);
      if (!res.ok) return [];
      return res.json();
    } catch {
      return [];
    }
  },

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

  // ─── AI Control & User Settings ──────────────────────────
  
  getUserSettings: async (): Promise<UserSettingsResponse> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/users/settings`);
      if (!res.ok) {
        return { ai_control_habilitado: false, auto_apagado_low_priority: false };
      }
      return res.json();
    } catch {
      return { ai_control_habilitado: false, auto_apagado_low_priority: false };
    }
  },

  updateUserSettings: async (data: UserSettingsUpdate): Promise<UserSettingsResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/users/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  overrideAutoKill: async (mac: string): Promise<AIOverrideResponse | null> => {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/api/dispositivos/${mac}/ai-control/override`, {
        method: 'POST',
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
};
