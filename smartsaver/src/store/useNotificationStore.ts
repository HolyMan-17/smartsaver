import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../services/apiClient';
import { NotificacionUsuarioResponse } from '../types/api';

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
  syncBackendNotifications: () => Promise<void>;
}

const generateId = () => `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
const MAX_NOTIFICATIONS = 100; // Cap at 100 notifications to save space

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (title, body, data) =>
        set((state) => {
          let backendId: number | null = null;
          if (data && data.backendId !== undefined && data.backendId !== null) {
            backendId = typeof data.backendId === 'string' ? parseInt(data.backendId, 10) : Number(data.backendId);
          }

          const id = backendId ? `db_${backendId}` : generateId();

          // Deduplicate if a notification with this ID (or same title and body within 1 minute) already exists
          const exists = state.notifications.some((n) => {
            if (n.id === id) return true;
            if (n.title === title && n.body === body) {
              const diffMs = Math.abs(new Date(n.timestamp).getTime() - Date.now());
              if (diffMs < 60000) return true;
            }
            return false;
          });

          if (exists) {
            return state;
          }

          const newItem: NotificationItem = {
            id,
            title,
            body,
            timestamp: new Date().toISOString(),
            read: false,
            data: backendId ? { ...data, backendId } : data,
          };
          // Prepend and cap size
          const updated = [newItem, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
          return { notifications: updated };
        }),

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
        if (id.startsWith('db_')) {
          const backendId = parseInt(id.replace('db_', ''), 10);
          apiClient.markNotificationRead(backendId).catch(console.error);
        }
      },

      markAllAsRead: () => {
        const state = get();
        const unreadDbIds = state.notifications
          .filter((n) => !n.read && n.id.startsWith('db_'))
          .map((n) => parseInt(n.id.replace('db_', ''), 10));

        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));

        for (const backendId of unreadDbIds) {
          apiClient.markNotificationRead(backendId).catch(console.error);
        }
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
        if (id.startsWith('db_')) {
          const backendId = parseInt(id.replace('db_', ''), 10);
          apiClient.deleteNotification(backendId).catch(console.error);
        }
      },

      clearAll: () => {
        set({ notifications: [] });
        apiClient.clearAllNotifications().catch(console.error);
      },

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },

      syncBackendNotifications: async () => {
        try {
          const dbNotifs = await apiClient.getNotifications();
          if (!dbNotifs) return;

          const mapped: NotificationItem[] = dbNotifs.map((n: NotificacionUsuarioResponse) => ({
            id: `db_${n.id}`,
            title: n.titulo,
            body: n.cuerpo,
            timestamp: n.timestamp,
            read: n.leido,
            data: { backendId: n.id },
          }));

          set((state) => {
            const existingList = state.notifications;
            const localNotifications = existingList.filter((n) => !n.id.startsWith('db_'));
            
            // Rebuild list combining local notifications and currently valid server notifications.
            const combined = [...localNotifications, ...mapped];

            // Sort by timestamp descending
            combined.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            const updated = combined.slice(0, MAX_NOTIFICATIONS);
            return { notifications: updated };
          });
        } catch (e) {
          console.error('Failed to sync notifications from backend:', e);
        }
      },
    }),
    {
      name: 'smartsaver-notifications-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
