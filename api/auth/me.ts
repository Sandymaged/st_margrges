import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyToken, verifyTokenVersion } from './lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
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
      return res.status(401).json({ error: 'الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى' });
    }

    const supabase = getSupabaseAdmin();

    const versionValid = await verifyTokenVersion(supabase, payload.userId, payload.tokenVersion);
    if (!versionValid) {
      return res.status(401).json({ error: 'الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, name, email, number, stage, team, role, is_verified, show_welcome_groups, amount_paid, attendance, badges, past_waves, passed_badges, permissions, created_at, join_date')
      .eq('id', payload.userId)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'الملف الشخصي غير موجود' });
    }

    return res.status(200).json({ profile, user: { id: payload.userId, phone: payload.phone, role: payload.role } });
  } catch (error: any) {
    console.error('Me error:', error);
    return res.status(500).json({ error: 'حدث خطأ' });
  }
}
