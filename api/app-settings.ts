import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './auth/lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { key } = req.query;

    if (!key || (key !== 'badges' && key !== 'general')) {
      return res.status(400).json({ error: 'Invalid key. Must be "badges" or "general".' });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error(`App settings error (${key}):`, error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ data });
  } catch (error: any) {
    console.error('App settings error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
