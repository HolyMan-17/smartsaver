import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Ensure notifications show up when app is in foreground on mobile
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const NotificationService = {
  sendNotification: async (title: string, body: string) => {
    try {
      if (Platform.OS === 'web') {
        if ('Notification' in window) {
          if (window.Notification.permission === 'granted') {
            new window.Notification(title, { body });
          } else if (window.Notification.permission !== 'denied') {
            const permission = await window.Notification.requestPermission();
            if (permission === 'granted') {
              new window.Notification(title, { body });
            }
          }
        }
      } else {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          if (newStatus !== 'granted') return;
        }
        await Notifications.scheduleNotificationAsync({
          content: { title, body },
          trigger: null, // send immediately
        });
      }
    } catch (e) {
      console.warn("Failed to send notification", e);
    }
  }
};
