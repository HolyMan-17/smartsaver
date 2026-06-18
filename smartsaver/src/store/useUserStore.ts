import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserState {
  userName: string | null;
  hasCompletedOnboarding: boolean;
  isLoading: boolean;
  setUserName: (name: string) => Promise<void>;
  loadUser: () => Promise<void>;
  resetUser: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  userName: null,
  hasCompletedOnboarding: false,
  isLoading: true,

  setUserName: async (name: string) => {
    await AsyncStorage.setItem('@user_name', name);
    await AsyncStorage.setItem('@has_onboarded', 'true');
    set({ userName: name, hasCompletedOnboarding: true });
  },

  loadUser: async () => {
    try {
      const name = await AsyncStorage.getItem('@user_name');
      const onboarded = await AsyncStorage.getItem('@has_onboarded');
      set({
        userName: name,
        hasCompletedOnboarding: onboarded === 'true',
        isLoading: false,
      });
    } catch (e) {
      console.warn("Error loading user profile", e);
      set({ isLoading: false, hasCompletedOnboarding: true });
    }
  },

  resetUser: async () => {
    await AsyncStorage.removeItem('@user_name');
    await AsyncStorage.removeItem('@has_onboarded');
    set({ userName: null, hasCompletedOnboarding: false });
  }
}));
