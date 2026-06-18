import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';

import { useThemeStore, getColors } from '../src/store/useThemeStore';
import { requestNotificationPermissions, getPushToken } from '../src/utils/notifications';
import { useNotificationStore } from '../src/store/useNotificationStore';
import { useUserStore } from '../src/store/useUserStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { apiClient, setAccessTokenGetter } from '../src/services/apiClient';
import { LoginScreen } from '../src/screens/LoginScreen/LoginScreen';
import { useTelemetryStore } from '../src/store/useTelemetryStore';
import '../src/utils/backgroundNotificationTask';

// Must be at app root level so it intercepts the Auth0 callback
// deep link BEFORE Expo Router tries to match it as a route.
WebBrowser.maybeCompleteAuthSession();

let lastNotifSyncAt = 0;

export const unstable_settings = {
  anchor: 'index',
};

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);

export default function RootLayout() {
  const isDark = useThemeStore((state) => state.isDark);
  const colors = getColors(isDark);
  const router = useRouter();

  const loadUser = useUserStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const rehydrate = useAuthStore((state) => state.rehydrate);
  
  const startConnection = useTelemetryStore((state) => state.startConnection);
  const stopConnection = useTelemetryStore((state) => state.stopConnection);

  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const foregroundListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    loadUser();
    rehydrate();
    setAccessTokenGetter(useAuthStore.getState().getAccessToken);
  }, []);

  // Handle notification taps — navigate to notification detail
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const title = response.notification.request.content.title ?? '';
      const body = response.notification.request.content.body ?? '';

      // Skip silent/empty push notifications
      if (!title.trim() && !body.trim()) {
        return;
      }

      // Save remote push notifications to the in-app store
      if (data?._isRemote || !data?._localId) {
        try {
          const store = useNotificationStore.getState();
          store.addNotification(title, body, data);
        } catch { /* already saved or store error */ }
      }

      // Navigate to the notifications list
      router.push('/notifications');
    });

    foregroundListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      const title = notification.request.content.title ?? '';
      const body = notification.request.content.body ?? '';

      // Skip silent/empty push notifications
      if (!title.trim() && !body.trim()) {
        return;
      }

      // Save remote push notifications to the in-app store when they arrive in foreground
      if (data?._isRemote || !data?._localId) {
        try {
          const store = useNotificationStore.getState();
          store.addNotification(title, body, data);
        } catch { /* already saved or store error */ }
      }
    });


    return () => {
      responseListener.current?.remove();
      foregroundListener.current?.remove();
    };
  }, [router]);

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
          } else {
            try { await apiClient.updateUserSettings({ expo_push_token: null }); } catch (e) { console.warn('Failed to clear push token', e); }
          }
        } catch (e) {
          console.warn('Failed to register push token:', e);
        }
      })();

      if (Date.now() - lastNotifSyncAt > 30000) {
        lastNotifSyncAt = Date.now();
        useNotificationStore.getState().syncBackendNotifications().catch(e => console.warn('notif sync failed', e));
      }

    } else {
      stopConnection();
    }
  }, [isAuthenticated, startConnection, stopConnection]);

  const themeHydrated = useThemeStore((state) => state._hasHydrated);

  if (isLoading || !themeHydrated) {
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
        </Stack>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}