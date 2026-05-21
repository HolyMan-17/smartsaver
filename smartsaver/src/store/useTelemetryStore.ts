import { create } from 'zustand';
import { TelemetryReading } from '../types/telemetry';
// import { WSMessage } from '../types/telemetry';
// import { wsService } from '../services/WebSocketService';

interface TelemetryState {
  latestReadings: Record<string, TelemetryReading>;
  deviceOnlineStatus: Record<string, boolean>;
  isConnected: boolean;
  isInitialized: boolean;

  startConnection: () => void;
  stopConnection: () => void;
}

const MOCK_MAC = '00:1B:44:11:3A:B7';
const MOCK_TELEMETRY: TelemetryReading = {
  voltaje: 11.85,
  corriente: 1.22,
  potencia: 14.45,
  tiempo_operacion_s: 0,
};

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  latestReadings: {},
  deviceOnlineStatus: {},
  isConnected: false,
  isInitialized: false,

  startConnection: () => {
    if (get().isInitialized) return;

    // ==========================================
    // DISABLED FOR UI TESTING
    // wsService.connect();
    // unsubscribeStatus = wsService.subscribeToStatus((status) => set({ isConnected: status }));
    // unsubscribeMessages = wsService.subscribeToMessages((msg: WSMessage) => {
    //   if (msg.type === 'telemetria') {
    //     set((state) => ({
    //       latestReadings: { ...state.latestReadings, [msg.mac]: msg.data },
    //     }));
    //   } else if (msg.type === 'conexion') {
    //     set((state) => ({
    //       deviceOnlineStatus: { ...state.deviceOnlineStatus, [msg.mac]: msg.data.is_online },
    //     }));
    //   }
    // });
    // ==========================================

    setTimeout(() => {
      set({
        isConnected: true,
        latestReadings: { [MOCK_MAC]: MOCK_TELEMETRY },
        deviceOnlineStatus: { [MOCK_MAC]: true },
      });
    }, 1000);

    set({ isInitialized: true });
  },

  stopConnection: () => {
    // wsService.disconnect();
    set({
      isInitialized: false,
      isConnected: false,
    });
  },
}));
