import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: false,
      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
      setTheme: (isDark) => set({ isDark }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
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
});
