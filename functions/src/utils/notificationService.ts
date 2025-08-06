import { dbAdmin as db } from '../firebase/admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { NotificationType } from '../types.js';

export const createNotification = async (
  userId: string,
  message: string,
  options: { type: NotificationType; link?: string }
): Promise<void> => {
  const newNotification = {
    message,
    read: false,
    timestamp: FieldValue.serverTimestamp(),
    type: options.type,
    link: options.link || '',
  };
  await db.collection('users').doc(userId).collection('notifications').add(newNotification);
};