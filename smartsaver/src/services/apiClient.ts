import {
  TelemetriaResponse,
  DispositivoEstado,
  DispositivoLimites,
  DispositivoEstadoResponse,
} from '../types/api';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.thesisbroker.com';

export const apiClient = {
  // ─── Diagnostics ────────────────────────────────────────

  /** GET /health */
  healthCheck: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    } catch (e) {
      console.error('API Health Check Error:', e);
      throw e;
    }
  },

  // ─── Telemetry ──────────────────────────────────────────

  /** GET /api/telemetria/{mac_dispositivo}?limite= */
  getTelemetryHistory: async (macDispositivo: string, limite: number = 50): Promise<TelemetriaResponse[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/telemetria/${macDispositivo}?limite=${limite}`);
      if (!res.ok) return [];
      return res.json();
    } catch (e) {
      return [];
    }
  },

  // ─── Control Commands ───────────────────────────────────

  /** POST /api/comando/estado — Toggle device power state and sync DB */
  setDeviceState: async (payload: DispositivoEstado): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/comando/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.warn('Failed to send device state command:', e);
      return false;
    }
  },

  /** POST /api/comando/limites — Set operational safety limits */
  setDeviceLimits: async (payload: DispositivoLimites): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/comando/limites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.warn('Failed to send device limits command:', e);
      return false;
    }
  },

  // ─── Device State ───────────────────────────────────────

  /** GET /api/dispositivos/{mac_dispositivo}/estado — Fetch current relay state from DB */
  getDeviceConnectionState: async (macDispositivo: string): Promise<DispositivoEstadoResponse | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dispositivos/${macDispositivo}/estado`);
      if (!res.ok) return null;
      return res.json();
    } catch (e) {
      return null;
    }
  },
};
