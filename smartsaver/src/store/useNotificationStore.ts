import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  timestamp: string; // ISO string
  read: boolean;
  data?: any;
}

interface NotificationState {
  notifications: NotificationItem[];
  addNotification: (title: string, body: string, data?: any) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadCount: () => number;
}

const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const MAX_NOTIFICATIONS = 100; // Cap at 100 notifications to save space

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (title, body, data) =>
        set((state) => {
          const newItem: NotificationItem = {
            id: generateId(),
            title,
            body,
            timestamp: new Date().toISOString(),
            read: false,
            data,
          };
          // Prepend and cap size
          const updated = [newItem, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
          return { notifications: updated };
        }),

      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      deleteNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearAll: () => set({ notifications: [] }),

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },
    }),
    {
      name: 'smartsaver-notifications-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
