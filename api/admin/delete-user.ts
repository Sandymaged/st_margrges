import { VercelRequest, VercelResponse } from '@vercel/node';
import { initStatus, getSupabaseAdmin, verifyAdminToken } from './lib/admin.js';

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
    const { uid, phone } = body;

    if (!uid && !phone) {
      return res.status(400).json({ error: 'UID or Phone is required.' });
    }

    const requester = await verifyAdminToken(adminToken);
    const canDeleteAccounts = requester.isSuperAdmin || !!requester.permissions?.canDeleteAccounts;

    if (!canDeleteAccounts) {
      return res.status(403).json({ error: 'Forbidden: Admin access with delete permissions required.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let userToDeleteId: string | undefined = uid;

    if (!userToDeleteId && phone) {
      const { data: profile } = await (supabaseAdmin as any).from('profiles').select('id').eq('number', phone).maybeSingle();
      userToDeleteId = profile?.id;
    }

    if (userToDeleteId) {
      const { error: profileError } = await (supabaseAdmin as any).from('profiles').delete().eq('id', userToDeleteId);
      if (profileError) throw profileError;
    } else if (phone) {
      const { error: profileError } = await (supabaseAdmin as any).from('profiles').delete().eq('number', phone);
      if (profileError) throw profileError;
    } else {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
