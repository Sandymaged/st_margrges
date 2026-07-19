import { VercelRequest, VercelResponse } from '@vercel/node';
import { initStatus, getSupabaseAdmin, verifyAdminToken } from './lib/admin.js';
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
    const { uid, newPhone } = body;

    if (!uid || !newPhone) {
      return res.status(400).json({ error: 'UID and newPhone are required.' });
    }

    const requester = await verifyAdminToken(adminToken);

    if (!requester.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can change phone numbers.' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing } = await (supabaseAdmin as any)
      .from('profiles')
      .select('id')
      .eq('number', newPhone)
      .neq('id', uid)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'رقم الهاتف هذا مسجل لحساب آخر بالفعل' });
    }

    const fakeEmail = `${newPhone}@scouts.local`;
    const { error: profileError } = await (supabaseAdmin as any).from('profiles').update({ number: newPhone, email: fakeEmail }).eq('id', uid);
    if (profileError) throw profileError;

    notifyProfileChanged(uid);

    return res.status(200).json({ message: 'Successfully updated user phone.' });
  } catch (error: any) {
    console.error('Error updating phone:', error);
    return res.status(500).json({ error: error.message || 'Failed to update phone.' });
  }
}
