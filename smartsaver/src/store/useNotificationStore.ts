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
  lastReadAt?: number;
  data?: any;
}

interface NotificationState {
  notifications: NotificationItem[];
  addNotification: (title: string, body: string, data?: any) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => void;
  clearAll: (localOnly?: boolean) => void;
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
            n.id === id ? { ...n, read: true, lastReadAt: Date.now() } : n
          ),
        }));
        if (id.startsWith('db_')) {
          const backendId = parseInt(id.replace('db_', ''), 10);
          if (!Number.isFinite(backendId)) { console.warn('[Notif] invalid db ID:', id); return; }
          apiClient.markNotificationRead(backendId).catch(e => console.warn('[Notif]', e.message));
        }
      },

      markAllAsRead: async () => {
        const state = get();
        const unreadDbIds = state.notifications
          .filter((n) => !n.read && n.id.startsWith('db_'))
          .map((n) => parseInt(n.id.replace('db_', ''), 10))
          .filter((id) => Number.isFinite(id));

        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        }));

        const results = await Promise.allSettled(unreadDbIds.map(id => apiClient.markNotificationRead(id)));
        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) console.warn(`[Notif] ${failedCount}/${unreadDbIds.length} mark-read failed`);
      },

      deleteNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
        if (id.startsWith('db_')) {
          const backendId = parseInt(id.replace('db_', ''), 10);
          if (!Number.isFinite(backendId)) { console.warn('[Notif] invalid db ID:', id); return; }
          apiClient.deleteNotification(backendId).catch(e => console.warn('[Notif]', e.message));
        }
      },

      clearAll: async (localOnly = false) => {
        const prev = get().notifications;
        set({ notifications: [] });
        if (!localOnly) {
          try {
            await apiClient.clearAllNotifications();
          } catch (e) {
            set({ notifications: prev });
            throw e;
          }
        }
      },

      syncBackendNotifications: async () => {
        try {
          const dbNotifs = await apiClient.getNotifications();
          if (!dbNotifs) return;

          const mapped: NotificationItem[] = dbNotifs
            .filter((n: NotificacionUsuarioResponse) => !n.eliminado)
            .map((n: NotificacionUsuarioResponse) => ({
              id: `db_${n.id}`,
              title: n.titulo,
              body: n.cuerpo,
              timestamp: n.timestamp,
              read: n.leido,
              data: { backendId: n.id },
            }));

          set((state) => {
            const existingDbMap = new Map(state.notifications.filter(n => n.id.startsWith('db_')).map(n => [n.id, n]));
            const merged = mapped.map(m => {
              const existing = existingDbMap.get(m.id);
              if (existing?.read && existing.lastReadAt && existing.lastReadAt > Date.now() - 60000) {
                return { ...m, read: true, lastReadAt: existing.lastReadAt };
              }
              return m;
            });

            const existingList = state.notifications;
            const localNotifications = existingList.filter((n) => !n.id.startsWith('db_'));
            
            // Rebuild list combining local notifications and currently valid server notifications.
            const combined = [...localNotifications, ...merged];

            const dbBackendIds = new Set(merged.map(m => m.data?.backendId).filter(Boolean));
            const dbTitleBodyKeys = new Set(merged.map(m => `${m.title}||${m.body}`));
            const deduped = combined.filter(n => {
              if (!n.id.startsWith('notif_')) return true;
              if (n.data?.backendId && dbBackendIds.has(n.data.backendId)) return false;
              if (dbTitleBodyKeys.has(`${n.title}||${n.body}`)) {
                const ageMs = Date.now() - new Date(n.timestamp).getTime();
                if (ageMs < 300000) return false;
              }
              return true;
            });

            // Sort by timestamp descending
            deduped.sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            const updated = deduped.slice(0, MAX_NOTIFICATIONS);
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
      partialize: (state) => ({ notifications: state.notifications }),
    }
  )
);
