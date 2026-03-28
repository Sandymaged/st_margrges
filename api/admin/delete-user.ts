import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not initialized. Please set FIREBASE_SERVICE_ACCOUNT_KEY environment variable.' });
  }

  const { uid, phone, adminToken } = req.body;

  if (!adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!uid && !phone) {
    return res.status(400).json({ error: 'UID or Phone is required.' });
  }

  try {
    // Verify admin token
    const decodedToken = await admin.auth().verifyIdToken(adminToken);
    
    // Check if user is admin in Firestore
    const adminDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required.' });
    }

    let userToDeleteUid = uid;

    // If UID is not provided, try to find user by phone (email)
    if (!userToDeleteUid && phone) {
      try {
        const userRecord = await admin.auth().getUserByEmail(`${phone}@scouts.local`);
        userToDeleteUid = userRecord.uid;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          // User not found in Auth, but might still exist in Firestore
          console.log(`User with phone ${phone} not found in Auth, proceeding to delete from Firestore if exists.`);
        } else {
          throw error;
        }
      }
    }

    // Delete from Firebase Auth if UID is known
    if (userToDeleteUid) {
      try {
        await admin.auth().deleteUser(userToDeleteUid);
        console.log(`Successfully deleted user from Auth: ${userToDeleteUid}`);
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found') {
          console.error('Error deleting user from Auth:', error);
          throw error;
        }
      }
    }

    // Delete from Firestore
    // We try to delete by UID first, if not available, we delete by querying phone
    if (userToDeleteUid) {
      await admin.firestore().collection('users').doc(userToDeleteUid).delete();
      console.log(`Successfully deleted user from Firestore: ${userToDeleteUid}`);
    } else if (phone) {
      const usersRef = admin.firestore().collection('users');
      const snapshot = await usersRef.where('number', '==', phone).get();
      
      if (!snapshot.empty) {
        const batch = admin.firestore().batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Successfully deleted user(s) from Firestore by phone: ${phone}`);
      }
    }

    res.status(200).json({ message: 'User deleted successfully from Auth and Firestore.' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
