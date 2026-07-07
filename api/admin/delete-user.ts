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
    const { uid, phone, adminToken } = body;

    if (!adminToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!uid && !phone) {
      return res.status(400).json({ error: 'UID or Phone is required.' });
    }

    const requester = await verifyAdminToken(adminToken);
    const canDeleteAccounts = requester.isSuperAdmin || !!requester.permissions?.canDeleteAccounts;

    if (!canDeleteAccounts) {
      return res.status(403).json({ error: 'Forbidden: Admin access with delete permissions required.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let userToDeleteUid: string | undefined = uid;

    if (!userToDeleteUid && phone) {
      const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('number', phone).maybeSingle();
      userToDeleteUid = profile?.id;
    }

    if (userToDeleteUid) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userToDeleteUid);
      if (authError && !authError.message?.includes('User not found')) {
        throw authError;
      }

      const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userToDeleteUid);
      if (profileError) throw profileError;
    } else if (phone) {
      const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('number', phone);
      if (profileError) throw profileError;
    } else {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({ message: 'User deleted successfully from Auth and profiles.' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
