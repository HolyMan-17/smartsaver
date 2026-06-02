import { sendLocalNotification } from '../utils/notifications';

/**
 * Unified notification service.
 * Delegates to sendLocalNotification so that every notification goes through
 * the single deduplication gate and is saved to the persistent history store.
 */
export const NotificationService = {
  sendNotification: async (title: string, body: string) => {
    await sendLocalNotification(title, body);
  },
};
