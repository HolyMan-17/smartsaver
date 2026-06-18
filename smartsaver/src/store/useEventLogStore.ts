import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────

export type LogType = 'CRITICAL' | 'WARNING' | 'AI_ACTION' | 'USER_ACTION' | 'SYSTEM';

export interface EventLog {
  id: string;
  type: LogType;
  title: string;
  message: string;
  timestamp: string;   // ISO string
  device_id?: string;
  device_name?: string;
}

interface EventLogState {
  logs: EventLog[];
  addLog: (log: Omit<EventLog, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}

// ─── Helpers ──────────────────────────────────────────────

const generateId = () => `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

// ─── Store ────────────────────────────────────────────────

const MAX_LOGS = 200; // Keep the most recent 200 events

export const useEventLogStore = create<EventLogState>()(
  persist(
    (set) => ({
      logs: [],

      addLog: (logData) =>
        set((state) => {
          const newLog: EventLog = {
            ...logData,
            id: generateId(),
            timestamp: new Date().toISOString(),
          };
          // Prepend (newest first) and cap at MAX_LOGS
          const updated = [newLog, ...state.logs].slice(0, MAX_LOGS);
          return { logs: updated };
        }),

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'event-logs-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ logs: state.logs }),
    }
  )
);
