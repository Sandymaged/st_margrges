import { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, admin } from './lib/admin.js';

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
    const { uid, newPhone, adminToken } = body;

    if (!uid || !newPhone) {
      return res.status(400).json({ error: "UID and newPhone are required." });
    }

    // Verify the requester is an admin
    const decodedToken = await admin.auth().verifyIdToken(adminToken);
    
    // Check if the requester is the super admin
    const superAdminEmail = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
    const superAdminPhone = process.env.VITE_SUPER_ADMIN_PHONE || process.env.SUPER_ADMIN_PHONE;
    
    let isSuperAdmin = 
      (superAdminEmail && decodedToken.email === superAdminEmail) || 
      (superAdminPhone && decodedToken.email === `${superAdminPhone}@scouts.local`) || 
      (superAdminPhone && (decodedToken.phone_number === `+20${superAdminPhone.replace(/^0+/, '')}` || decodedToken.phone_number === `+${superAdminPhone}`));
    
    if (!isSuperAdmin) {
      const requesterDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
      if (requesterDoc.exists && requesterDoc.data()?.permissions?.canManagePermissions) {
        isSuperAdmin = true;
      }
    }

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Unauthorized. Only super admins can change phone numbers." });
    }

    const fakeEmail = `${newPhone}@scouts.local`;
    await admin.auth().updateUser(uid, {
      email: fakeEmail
    });

    return res.status(200).json({ message: "Successfully updated user phone (email)." });

  } catch (error: any) {
    console.error("Error updating phone:", error);
    return res.status(500).json({ error: error.message || "Failed to update phone." });
  }
}
