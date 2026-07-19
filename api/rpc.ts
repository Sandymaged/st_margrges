import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyToken, verifyTokenVersion } from './auth/lib/auth.js';
import { notifyProfileChanged } from './sse/profileNotifier.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'غير مصرح به' });
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { function: fnName, params } = body;

    if (!fnName || typeof fnName !== 'string') {
      return res.status(400).json({ error: 'Function name is required' });
    }

    const supabase = getSupabaseAdmin();

    const versionValid = await verifyTokenVersion(supabase, payload.userId, payload.tokenVersion);
    if (!versionValid) {
      return res.status(401).json({ error: 'الجلسة منتهية' });
    }

    const rpcParams = { ...(params as any || {}), p_caller_id: payload.userId };

    const { data, error } = await (supabase as any).rpc(fnName, rpcParams);

    if (error) {
      console.error(`RPC error (${fnName}):`, error);
      return res.status(400).json({ error: error.message });
    }

    const profileModifyingRpcs = [
      'update_badge_slot',
      'add_completed_requirement',
      'remove_completed_requirement',
      'set_attendance',
      'update_permissions',
    ];
    if (profileModifyingRpcs.includes(fnName) && rpcParams.p_user_id) {
      notifyProfileChanged(rpcParams.p_user_id);
    }

    return res.status(200).json({ data });
  } catch (error: any) {
    console.error('RPC proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
