import { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, admin, getDb } from './lib/admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const status = initAdmin();
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

  if (!status.initialized) {
    return res.status(500).json({ error: "Firebase Admin not initialized. " + (status.error || "") });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error("Failed to parse req.body:", e);
      }
    }
    const { uid, phone, adminToken } = body;

    if (!adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!uid && !phone) {
      return res.status(400).json({ error: 'UID or Phone is required.' });
    }

    // Verify admin token
    const decodedToken = await admin.auth().verifyIdToken(adminToken);
    
    // Check if the requester is the super admin
    const superAdminEmail = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
    const superAdminPhone = process.env.VITE_SUPER_ADMIN_PHONE || process.env.SUPER_ADMIN_PHONE;
    
    let isSuperAdmin = 
      (superAdminEmail && decodedToken.email === superAdminEmail) || 
      (superAdminPhone && decodedToken.email === `${superAdminPhone}@scouts.local`) || 
      (superAdminPhone && (decodedToken.phone_number === `+20${superAdminPhone.replace(/^0+/, '')}` || decodedToken.phone_number === `+${superAdminPhone}`));

    let canDeleteAccounts = isSuperAdmin;

    if (!isSuperAdmin) {
      const adminDoc = await getDb().collection('users').doc(decodedToken.uid).get();
      if (adminDoc.exists) {
        const data = adminDoc.data();
        if (data?.permissions?.canManagePermissions || data?.role === 'admin') {
          isSuperAdmin = true;
          canDeleteAccounts = true;
        } else if (data?.permissions?.canDeleteAccounts) {
          canDeleteAccounts = true;
        }
      }
    }

    if (!canDeleteAccounts) {
      return res.status(403).json({ error: 'Forbidden: Admin access with delete permissions required.' });
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
      await getDb().collection('users').doc(userToDeleteUid).delete();
      console.log(`Successfully deleted user from Firestore: ${userToDeleteUid}`);
    } else if (phone) {
      const usersRef = getDb().collection('users');
      const snapshot = await usersRef.where('number', '==', phone).get();
      
      if (!snapshot.empty) {
        const batch = getDb().batch();
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
