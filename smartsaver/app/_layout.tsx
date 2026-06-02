import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useThemeStore, getColors } from '../src/store/useThemeStore';
import { requestNotificationPermissions, getPushToken } from '../src/utils/notifications';
import { useUserStore } from '../src/store/useUserStore';
import { useAuthStore } from '../src/store/useAuthStore';
import apiClient, { setAccessTokenGetter } from '../src/services/apiClient';
import { LoginScreen } from '../src/screens/LoginScreen/LoginScreen';
import { useTelemetryStore } from '../src/store/useTelemetryStore';

// Must be at app root level so it intercepts the Auth0 callback
// deep link BEFORE Expo Router tries to match it as a route.
WebBrowser.maybeCompleteAuthSession();

export const unstable_settings = {
  anchor: 'index',
};

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);

export default function RootLayout() {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);

  const loadUser = useUserStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const rehydrate = useAuthStore((state) => state.rehydrate);
  
  const startConnection = useTelemetryStore((state) => state.startConnection);
  const stopConnection = useTelemetryStore((state) => state.stopConnection);

  useEffect(() => {
    loadUser();
    rehydrate();
    setAccessTokenGetter(useAuthStore.getState().getAccessToken);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      startConnection();
      
      // Register Push Token with backend
      (async () => {
        try {
          const granted = await requestNotificationPermissions();
          if (granted) {
            const token = await getPushToken();
            if (token) {
              await apiClient.updateUserSettings({ expo_push_token: token });
            }
          }
        } catch (e) {
          console.warn('Failed to register push token:', e);
        }
      })();

    } else {
      stopConnection();
    }
  }, [isAuthenticated, startConnection, stopConnection]);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ 
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }
        }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}