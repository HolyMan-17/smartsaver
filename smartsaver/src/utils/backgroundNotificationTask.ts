import * as TaskManager from 'expo-task-manager';
import { useNotificationStore } from '../store/useNotificationStore';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) { console.warn('[BG Notif] task error', error); return; }
  const payload = data as any;
  const title = payload?.notification?.title ?? '';
  const body = payload?.notification?.body ?? '';
  if (!title.trim() && !body.trim()) return;
  try {
    useNotificationStore.getState().addNotification(title, body, payload?.notification?.data);
  } catch (e) { console.warn('[BG Notif] save failed', e); }
});
