import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeState {
  isDark: boolean;
  _hasHydrated: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
  _setHydrated: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      _hasHydrated: false,
      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
      setTheme: (isDark) => set({ isDark }),
      _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        state?._setHydrated?.();
      },
    }
  )
);

export const getColors = (isDark: boolean) => ({
  background: isDark ? '#0F172A' : '#F8FAFC',
  card: isDark ? '#1E293B' : '#FFFFFF',
  text: isDark ? '#F8FAFC' : '#0F172A',
  textSecondary: isDark ? '#94A3B8' : '#64748B',
  border: isDark ? '#334155' : '#E2E8F0',
  borderSoft: isDark ? '#1E293B' : '#F1F5F9',
  iconBg: isDark ? '#334155' : '#F8FAFC',
  dangerBg: isDark ? '#450a0a' : '#FEE2E2',
  warningBg: isDark ? '#422006' : '#FEF3C7',
  successBg: isDark ? '#064e3b' : '#ECFDF5',
  infoBg: isDark ? '#172554' : '#EFF6FF',
  zoneSafeBg: isDark ? '#064e3b' : '#ECFDF5',
  zoneSafeText: isDark ? '#34D399' : '#10B981',
  zoneWarningBg: isDark ? '#422006' : '#FFFBEB',
  zoneWarningText: isDark ? '#FBBF24' : '#F59E0B',
  zoneCriticalBg: isDark ? '#450a0a' : '#FEF2F2',
  zoneCriticalText: isDark ? '#F87171' : '#EF4444',
  bmsAlertBg: isDark ? '#450a0a' : '#FEF2F2',
  bmsAlertText: isDark ? '#F87171' : '#EF4444',
  autoKillBg: isDark ? '#1e1b4b' : '#EEF2FF',
  autoKillBorder: isDark ? '#312e81' : '#C7D2FE',
  autoKillText: isDark ? '#818CF8' : '#6366F1',
});
