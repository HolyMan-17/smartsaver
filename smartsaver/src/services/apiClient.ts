import { TelemetriaResponse, DispositivoEstado, DispositivoLimites } from '../types/api';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.thesisbroker.com';

export const apiClient = {
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

  getTelemetryHistory: async (macDispositivo: string, limite: number = 50): Promise<TelemetriaResponse[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/telemetria/${macDispositivo}?limite=${limite}`);
      if (!res.ok) {
        return [];
      }
      return res.json();
    } catch (e) {
      return [];
    }
  },

  /**
   * POST /api/comando/estado
   * Toggle device power state (relay ON/OFF)
   */
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

  /**
   * POST /api/comando/limites
   * Set operational safety limits (voltage, current, wattage thresholds)
   */
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
};
