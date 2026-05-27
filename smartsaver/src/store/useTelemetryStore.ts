import { create } from 'zustand';
import { TelemetryReading, WSMessage } from '../types/telemetry';
import { wsService } from '../services/WebSocketService';
import { sendLocalNotification } from '../utils/notifications';

interface TelemetryState {
  latestReadings: Record<string, TelemetryReading>;
  deviceOnlineStatus: Record<string, boolean>;
  activeBmsAlerts: Record<string, { msg: string; ai_status: number } | null>;
  isConnected: boolean;
  isInitialized: boolean;

  startConnection: () => void;
  stopConnection: () => void;
  resolveBmsAlert: (mac: string) => void;
}

const MOCK_MAC = '00:1B:44:11:3A:B7';
const MOCK_TELEMETRY: TelemetryReading = {
  voltaje: 11.85,
  corriente: 1.22,
  potencia: 14.45,
  tiempo_operacion_s: 0,
  ai_status: 0,
};

let unsubscribeStatus: (() => void) | null = null;
let unsubscribeMessages: (() => void) | null = null;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  latestReadings: {},
  deviceOnlineStatus: {},
  activeBmsAlerts: {},
  isConnected: false,
  isInitialized: false,

  startConnection: () => {
    if (get().isInitialized) return;

    // Connect real WebSocket service (disabled in production until backend WebSocket is active)
    /*
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
    */

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

        // Fire real-time notification
        sendLocalNotification(
          '🚨 Alerta Crítica (IA)',
          `${msg.data.alerta}`
        );
      }
    });

    // Mock telemetry fallback timer for simulated environments
    setTimeout(() => {
      // Only mock if not already receiving active messages
      if (Object.keys(get().latestReadings).length === 0) {
        set({
          isConnected: true,
          latestReadings: { [MOCK_MAC]: MOCK_TELEMETRY },
          deviceOnlineStatus: { [MOCK_MAC]: true },
        });
      }
    }, 1000);

    set({ isInitialized: true });
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
}));
