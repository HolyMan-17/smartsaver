import { create } from 'zustand';
import { TelemetryReading, WSMessage } from '../types/telemetry';
import { wsService } from '../services/WebSocketService';

interface TelemetryState {
  latestReadings: Record<string, TelemetryReading>;
  deviceOnlineStatus: Record<string, boolean>;
  activeBmsAlerts: Record<string, { msg: string; ai_status: number } | null>;
  isConnected: boolean;
  isInitialized: boolean;
  lastManualCommands: Record<string, number>;
  prevPowerStates: Record<string, boolean>;

  startConnection: () => void;
  stopConnection: () => void;
  resolveBmsAlert: (mac: string) => void;
  recordManualToggle: (mac: string) => void;
}



let unsubscribeStatus: (() => void) | null = null;
let unsubscribeMessages: (() => void) | null = null;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  latestReadings: {},
  deviceOnlineStatus: {},
  activeBmsAlerts: {},
  isConnected: false,
  isInitialized: false,
  lastManualCommands: {},
  prevPowerStates: {},

  startConnection: () => {
    if (get().isInitialized) return;

    // Defensively clean up any previous subscription/interval resources to prevent leaks & duplicate timers
    try {
      wsService.disconnect();
      if (unsubscribeStatus) {
        unsubscribeStatus();
        unsubscribeStatus = null;
      }
      if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
      }
    } catch (err) {
      console.warn('Failed during defensive store cleanup:', err);
    }

    set({ isInitialized: true });

    // Connect real WebSocket service (disabled in production until backend WebSocket is active)
    // Connect real WebSocket service
    wsService.setTokenGetter(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('./useAuthStore');
        return useAuthStore.getState().getAccessToken();
      } catch {
        return null;
      }
    });

    wsService.connect();

    unsubscribeStatus = wsService.subscribeToStatus((status) => {
      set({ isConnected: status });
    });

    unsubscribeMessages = wsService.subscribeToMessages((msg: WSMessage) => {
      if (msg.type === 'telemetria') {
        set((state) => ({
          latestReadings: { 
            ...state.latestReadings, 
            [msg.mac]: {
              ...msg.data,
              ai_status: msg.data.ai_status ?? 0,
            } 
          },
        }));
      } else if (msg.type === 'conexion') {
        set((state) => ({
          deviceOnlineStatus: { ...state.deviceOnlineStatus, [msg.mac]: msg.data.is_online },
        }));
      } else if (msg.type === 'alerta') {
        set((state) => ({
          activeBmsAlerts: {
            ...state.activeBmsAlerts,
            [msg.mac]: {
              msg: msg.data.alerta,
              ai_status: msg.data.ai_status,
            },
          },
          // Real-time OFF state update on BMS alert
          deviceOnlineStatus: { ...state.deviceOnlineStatus, [msg.mac]: false },
        }));
      } else if (msg.type === 'auto_kill_warning') {
        // Handled by backend push
      } else if (msg.type === 'auto_kill_executed') {
        // Handled by backend push
      } else if (msg.type === 'auto_kill_cancelled') {
        // Handled by backend push
      }
    });

  },

  stopConnection: () => {
    wsService.disconnect();
    
    if (unsubscribeStatus) {
      unsubscribeStatus();
      unsubscribeStatus = null;
    }
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    set({
      isInitialized: false,
      isConnected: false,
    });
  },

  resolveBmsAlert: (mac: string) => {
    set((state) => ({
      activeBmsAlerts: {
        ...state.activeBmsAlerts,
        [mac]: null,
      },
    }));
  },

  recordManualToggle: (mac: string) => {
    set((state) => ({
      lastManualCommands: {
        ...state.lastManualCommands,
        [mac]: Date.now(),
      },
    }));
  },
}));
