import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissions } from '../src/utils/notifications';
import { useUserStore } from '../src/store/useUserStore';
import { useAuthStore } from '../src/store/useAuthStore';
import { setAccessTokenGetter } from '../src/services/apiClient';
import { LoginScreen } from '../src/screens/LoginScreen/LoginScreen';

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
  const colorScheme = useColorScheme();
  const loadUser = useUserStore((state) => state.loadUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const rehydrate = useAuthStore((state) => state.rehydrate);

  useEffect(() => {
    requestNotificationPermissions();
    loadUser();
    rehydrate();
    setAccessTokenGetter(useAuthStore.getState().getAccessToken);
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}