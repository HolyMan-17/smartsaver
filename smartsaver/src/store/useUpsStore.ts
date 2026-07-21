import { create } from 'zustand';
import { UpsSistema, SystemPower } from '../types/api';
import { apiClient } from '../services/apiClient';

interface UpsState {
  upsData: UpsSistema | null;
  systemPower: SystemPower | null;
  isLoading: boolean;
  fetchUpsState: () => Promise<void>;
  setUpsMode: (mode: number) => void;
  updateSystemPower: (powerData: Partial<SystemPower>) => void;
  clearUpsState: () => void;
}

export const useUpsStore = create<UpsState>((set) => ({
  upsData: null,
  systemPower: null,
  isLoading: false,

  fetchUpsState: async () => {
    set({ isLoading: true });
    try {
      const [ups, power] = await Promise.all([
        apiClient.getUpsState(),
        apiClient.getConsumoActual(),
      ]);
      set((state) => {
        if (!power) return { upsData: ups, systemPower: state.systemPower };
        return {
          upsData: ups,
          systemPower: {
            ...power,
            autonomia_estimada_min: power.autonomia_estimada_min ?? state.systemPower?.autonomia_estimada_min,
            carga_bateria_porcentaje: power.carga_bateria_porcentaje ?? state.systemPower?.carga_bateria_porcentaje,
          },
        };
      });
    } catch (e) {
      console.warn('fetchUpsState failed:', e);
    } finally {
      set({ isLoading: false });
    }
  },

  setUpsMode: (mode: number) => {
    set((state) => {
      if (!state.upsData) return {};
      return {
        upsData: {
          ...state.upsData,
          modo_actual: mode,
          actualizado_en: new Date().toISOString(),
        }
      };
    });
  },

  updateSystemPower: (powerData: Partial<SystemPower>) => {
    set((state) => {
      if (!state.systemPower) {
        return {
          systemPower: {
            cantidad_dispositivos_activos: 0,
            ...powerData,
          } as SystemPower,
        };
      }
      return {
        systemPower: {
          ...state.systemPower,
          ...powerData,
        },
      };
    });
  },

  clearUpsState: () => set({ upsData: null, systemPower: null }),
}));
