import { create } from 'zustand';
import { IoTGatewayPayload } from '../types/telemetry';
// import { wsService } from '../services/WebSocketService'; // Commented out for now

interface TelemetryState {
  latestData: IoTGatewayPayload | null;
  isConnected: boolean;
  isInitialized: boolean;
  
  startConnection: () => void;
  stopConnection: () => void;
}

// --- MOCK DATA FOR UI TESTING ---
const MOCK_TELEMETRY: IoTGatewayPayload = {
  device_id: "gateway_esp32_01",
  timestamp: Date.now(),
  telemetry: {
    voltage: 11.85,
    current: 1.22,
    watts: 14.45
  },
  ml_prediction: {
    current_zone: "Warning",
    confidence_percent: 94.2
  },
  hardware_state: {
    relay_active: true
  }
};

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  latestData: null,
  isConnected: false,
  isInitialized: false,

  startConnection: () => {
    if (get().isInitialized) return;

    // ==========================================
    // DISABLED FOR UI TESTING
    // wsService.connect();
    // unsubscribeStatus = wsService.subscribeToStatus((status) => set({ isConnected: status }));
    // unsubscribeMessages = wsService.subscribeToMessages((data) => set({ latestData: data }));
    // ==========================================

    // SIMULATE A LIVE CONNECTION (Shows loading spinner for 1 second, then populates UI)
    setTimeout(() => {
      set({ 
        isConnected: true, 
        latestData: MOCK_TELEMETRY 
      });
    }, 1000);

    set({ isInitialized: true });
  },

  stopConnection: () => {
    // wsService.disconnect();
    set({ 
      isInitialized: false, 
      isConnected: false 
    });
  }
}));
