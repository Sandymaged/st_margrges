import { VercelRequest, VercelResponse } from '@vercel/node';
import { initStatus, getSupabaseAdmin, verifyAdminToken, hashPassword } from './lib/admin.js';
import { notifyProfileChanged } from '../sse/profileNotifier.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح به' });
    }
    const adminToken = authHeader.substring(7);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { uid, newPassword } = body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'UID and newPassword are required.' });
    }

    const requester = await verifyAdminToken(adminToken);

    if (!requester.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can change passwords.' });
    }

    const passwordHash = await hashPassword(newPassword);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userRow } = await (supabaseAdmin as any).from('profiles').select('token_version').eq('id', uid).maybeSingle();
    const currentVersion = (userRow as { token_version?: number } | null)?.token_version ?? 0;
    const { error } = await (supabaseAdmin as any).from('profiles').update({ password_hash: passwordHash, token_version: currentVersion + 1 }).eq('id', uid);
    if (error) throw error;

    notifyProfileChanged(uid);

    return res.status(200).json({ message: 'Successfully updated user password.' });
  } catch (error: any) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: error.message || 'Failed to update password.' });
  }
}
