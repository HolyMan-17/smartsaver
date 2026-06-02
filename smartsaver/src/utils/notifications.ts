import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useNotificationStore } from '../store/useNotificationStore';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ── Deduplication Gate ──────────────────────────────────────
// Prevents the same notification (same title+body) from firing
// more than once within DEDUP_WINDOW_MS milliseconds.
const DEDUP_WINDOW_MS = 30_000; // 30 seconds
const recentNotifications = new Map<string, number>(); // key → timestamp

function isDuplicate(title: string, body: string): boolean {
  const key = `${title}::${body}`;
  const now = Date.now();
  const lastSent = recentNotifications.get(key);

  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
    return true; // duplicate — suppress
  }

  // Housekeeping: purge expired entries to prevent unbounded growth
  for (const [k, ts] of recentNotifications) {
    if (now - ts >= DEDUP_WINDOW_MS) {
      recentNotifications.delete(k);
    }
  }

  recentNotifications.set(key, now);
  return false;
}

/**
 * Request user permissions for push notifications.
 * Should be called on app mount.
 */
export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        return true;
      }
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    }
    console.log('Web notifications are not supported or blocked by browser settings.');
    return false;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#EF4444',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }
  return true;
}

/**
 * Gets the Expo Push Token for this device.
 */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const Constants = require('expo-constants').default;
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('Project ID not found in app.json for Push Notifications');
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    return tokenResponse.data;
  } catch (error) {
    console.error('Error fetching push token:', error);
    return null;
  }
}

/**
 * Schedule a local push notification.
 * Includes a 30-second deduplication window: identical title+body
 * combinations are suppressed if fired again within that window.
 * @param title The title of the notification
 * @param body The main text body
 * @param data Optional extra data payload
 */
export async function sendLocalNotification(title: string, body: string, data?: any) {
  // Deduplication: skip if same notification was sent recently
  if (isDuplicate(title, body)) {
    return;
  }

  // Store notification in our persistent local history
  try {
    useNotificationStore.getState().addNotification(title, body, data);
  } catch (err) {
    console.warn('Failed to save notification to store:', err);
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          tag: data?.tag || undefined,
        });
      } catch (e) {
        console.error('Failed to trigger web Notification:', e);
      }
    } else {
      console.log(`[Web Notification Fallback] [${title}]: ${body}`);
    }
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null, // trigger immediately
  });
}
