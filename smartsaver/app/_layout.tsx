import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissions } from '../src/utils/notifications';
import { useUserStore } from '../src/store/useUserStore';

export const unstable_settings = {
  anchor: 'index',
};

// Ignore Expo Go push notification warning since we only use local notifications
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const loadUser = useUserStore((state) => state.loadUser);

  useEffect(() => {
    requestNotificationPermissions();
    loadUser();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
