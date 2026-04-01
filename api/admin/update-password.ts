import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    let serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountRaw) {
      console.error('FIREBASE_SERVICE_ACCOUNT_KEY not found in environment variables');
    } else {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountRaw);
      } catch (e) {
        try {
          const fixed = serviceAccountRaw.replace(/\n/g, '\\n');
          serviceAccount = JSON.parse(fixed);
        } catch (e2) {
          throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string.');
        }
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized successfully in Vercel function');
    }
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
    console.error("Admin SDK not initialized");
    return res.status(500).json({ error: "Firebase Admin not initialized. Check server logs for details." });
  }

  const { uid, newPassword, adminToken } = req.body;

  if (!uid || !newPassword) {
    return res.status(400).json({ error: "UID and newPassword are required." });
  }

  try {
    // Verify the requester is an admin
    const decodedToken = await admin.auth().verifyIdToken(adminToken);
    
    // Check if the requester is the super admin
    const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
    
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Unauthorized. Only super admins can change passwords." });
    }

    await admin.auth().updateUser(uid, {
      password: newPassword
    });

    return res.status(200).json({ message: "Successfully updated user password." });

  } catch (error: any) {
    console.error("Error updating password:", error);
    return res.status(500).json({ error: error.message || "Failed to update password." });
  }
}
