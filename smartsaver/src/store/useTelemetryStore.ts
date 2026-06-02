import { create } from 'zustand';
import { TelemetryReading, WSMessage } from '../types/telemetry';
import { wsService } from '../services/WebSocketService';
import { sendLocalNotification } from '../utils/notifications';
import { apiClient } from '../services/apiClient';
import { useEventLogStore } from './useEventLogStore';

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
let scheduleInterval: any = null;

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
      if (scheduleInterval) {
        clearInterval(scheduleInterval);
        scheduleInterval = null;
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

        // Fire real-time notification
        sendLocalNotification(
          '🚨 Alerta Crítica (IA)',
          `${msg.data.alerta}`
        );
      } else if (msg.type === 'auto_kill_warning') {
        sendLocalNotification(
          '⚠️ Apagado IA Programado',
          `El dispositivo se apagará automáticamente en ${msg.data.grace_period_min} minutos por consumo excesivo.`
        );
      } else if (msg.type === 'auto_kill_executed') {
        sendLocalNotification(
          '⚡ Dispositivo Apagado',
          `El dispositivo fue apagado automáticamente debido a consumo excesivo prolongado.`
        );
      } else if (msg.type === 'auto_kill_cancelled') {
        sendLocalNotification(
          '✅ Apagado IA Cancelado',
          `El consumo se normalizó y se canceló el apagado programado.`
        );
      }
    });

    let isChecking = false;

    // Start background automation transition monitor
    const checkScheduleTransitions = async () => {
      if (isChecking) return;
      isChecking = true;

      try {
        const apiDevices = await apiClient.getDevices();
        if (!apiDevices) return;

        const currentStates = get().prevPowerStates;
        const newStates: Record<string, boolean> = { ...currentStates };

        for (const device of apiDevices) {
          const mac = device.mac;
          const currentPower = device.estado_reportado;
          const previousPower = currentStates[mac];

          // If we had a previous power state cached, and it changed
          if (previousPower !== undefined && currentPower !== previousPower) {
            const lastManualTime = get().lastManualCommands[mac] || 0;
            const isManualCooldown = Date.now() - lastManualTime < 15000; // 15 seconds cooldown
            const isAutomation = device.automatizacion_activa === true;

            if (isAutomation && !isManualCooldown) {
              const deviceName = device.nombre_personalizado || mac;
              const actionWord = currentPower ? 'encendido' : 'apagado';
              const title = `📅 Horario: ${deviceName}`;
              const body = `El dispositivo se ha ${actionWord} automáticamente por horario programado.`;

              // Send push local notification (which also saves it to the notification store history)
              await sendLocalNotification(title, body);

              // Log in frontend event log store
              try {
                useEventLogStore.getState().addLog({
                  type: 'AI_ACTION',
                  title: 'Horario Ejecutado',
                  message: `El dispositivo "${deviceName}" se ha ${actionWord} automáticamente por horario programado.`,
                  device_id: String(device.id),
                  device_name: deviceName,
                });
              } catch (e) {
                console.warn('Failed to add schedule log:', e);
              }
            }
          }
          newStates[mac] = currentPower;
        }

        set({ prevPowerStates: newStates });
      } catch {
        // Silent catch to prevent background interval crashes in offline conditions
      } finally {
        isChecking = false;
      }
    };

    // Run check on start, and set up light polling interval
    checkScheduleTransitions();
    scheduleInterval = setInterval(checkScheduleTransitions, 7000);


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
    if (scheduleInterval) {
      clearInterval(scheduleInterval);
      scheduleInterval = null;
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
