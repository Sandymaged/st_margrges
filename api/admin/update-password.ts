import { VercelRequest, VercelResponse } from '@vercel/node';
import { initStatus, getSupabaseAdmin, verifyAdminToken } from './lib/admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
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
    return res.status(500).json({ error: 'Supabase admin not configured. ' + (status.error || '') });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error('Failed to parse req.body:', e);
      }
    }
    const { uid, newPassword, adminToken } = body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'UID and newPassword are required.' });
    }

    const requester = await verifyAdminToken(adminToken);

    if (!requester.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can change passwords.' });
    }

    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(uid, { password: newPassword });
    if (error) throw error;

    return res.status(200).json({ message: 'Successfully updated user password.' });
  } catch (error: any) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: error.message || 'Failed to update password.' });
  }
}
