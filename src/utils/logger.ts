import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const logActivity = async (
  action: string,
  details: string,
  adminId: string,
  adminName: string,
  targetUserId?: string,
  targetUserName?: string
) => {
  try {
    await addDoc(collection(db, 'activity_logs'), {
      action,
      details,
      adminId,
      adminName,
      targetUserId: targetUserId || null,
      targetUserName: targetUserName || null,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};
