import { create } from 'zustand';
import { TelemetryReading, WSMessage } from '../types/telemetry';
import { wsService } from '../services/WebSocketService';
import { useUpsStore } from './useUpsStore';

interface TelemetryState {
  latestReadings: Record<string, TelemetryReading>;
  deviceOnlineStatus: Record<string, boolean>;
  relayStates: Record<string, boolean>;
  relayStatesUpdatedAt: Record<string, number>;
  autoKillStates: Record<string, string | null>;
  activeBmsAlerts: Record<string, { id: number; tipo_alerta: string; fecha: string } | null>;
  isConnected: boolean;
  isInitialized: boolean;

  startConnection: () => void;
  stopConnection: () => void;
  setAutoKillFromHTTP: (mac: string, value: string | null) => void;
  forceReconnect: () => void;
}



let unsubscribeStatus: (() => void) | null = null;
let unsubscribeMessages: (() => void) | null = null;

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  latestReadings: {},
  deviceOnlineStatus: {},
  relayStates: {},
  relayStatesUpdatedAt: {},
  autoKillStates: {},
  activeBmsAlerts: {},
  isConnected: false,
  isInitialized: false,

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

    // Connect real WebSocket service
    wsService.setTokenGetter(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { useAuthStore } = require('./useAuthStore');
        return await Promise.race([
          useAuthStore.getState().getAccessToken(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
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
              receivedAt: Date.now()
            } 
          },
        }));
      } else if (msg.type === 'conexion') {
        set((state) => {
          const updates: Partial<TelemetryState> = {};
          if (msg.data.is_online !== undefined) {
            updates.deviceOnlineStatus = { ...state.deviceOnlineStatus, [msg.mac]: msg.data.is_online };
          }
          if (msg.data.estado_reportado !== undefined) {
            updates.relayStates = { ...state.relayStates, [msg.mac]: msg.data.estado_reportado };
            updates.relayStatesUpdatedAt = { ...state.relayStatesUpdatedAt, [msg.mac]: Date.now() };
          }
          return updates;
        });
      } else if (msg.type === 'alerta') {
        set((state) => ({
          relayStates: { ...state.relayStates, [msg.mac]: msg.data.estado_reportado },
          relayStatesUpdatedAt: { ...state.relayStatesUpdatedAt, [msg.mac]: Date.now() },
          activeBmsAlerts: {
            ...state.activeBmsAlerts,
            [msg.mac]: msg.data.alerta === 'bms_critica'
              ? { id: Date.now(), tipo_alerta: 'bms_critica', fecha: new Date().toISOString() }
              : null,
          },
        }));
      } else if (msg.type === 'auto_kill_warning') {
        set((state) => ({ autoKillStates: { ...state.autoKillStates, [msg.mac]: msg.data.auto_kill_at } }));
      } else if (msg.type === 'auto_kill_executed') {
        set((state) => ({
          autoKillStates: { ...state.autoKillStates, [msg.mac]: null },
          relayStates: { ...state.relayStates, [msg.mac]: false },
          relayStatesUpdatedAt: { ...state.relayStatesUpdatedAt, [msg.mac]: Date.now() },
        }));
      } else if (msg.type === 'auto_kill_cancelled') {
        set((state) => ({ autoKillStates: { ...state.autoKillStates, [msg.mac]: null } }));
      } else if (msg.type === 'gateway_alerta') {
        if (msg.data.alerta === 'UPS_BATTERY_MODE') {
          useUpsStore.getState().setUpsMode(1);
        } else if (msg.data.alerta === 'UPS_LINE_MODE') {
          useUpsStore.getState().setUpsMode(0);
        } else {
          console.debug('Unhandled gateway_alerta:', msg.data.alerta);
        }
      } else if (msg.type === 'gateway_telemetria') {
        useUpsStore.getState().updateSystemPower(msg.data);
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
      latestReadings: {},
      deviceOnlineStatus: {},
      relayStates: {},
      relayStatesUpdatedAt: {},
      autoKillStates: {},
      activeBmsAlerts: {},
    });
  },

  setAutoKillFromHTTP: (mac: string, value: string | null) => {
    set((state) => {
      const current = state.autoKillStates[mac];
      if (current && value === null) {
        return state;
      }
      return { autoKillStates: { ...state.autoKillStates, [mac]: value } };
    });
  },

  forceReconnect: () => {
    wsService.disconnect();
    if (unsubscribeStatus) { unsubscribeStatus(); unsubscribeStatus = null; }
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
    set({ isInitialized: false, isConnected: false });
    get().startConnection();
  },
}));
