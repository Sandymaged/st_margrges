import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyPassword, createToken, validatePhone, detectCodeInjection } from './lib/auth.js';

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { phone, password } = body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف وكلمة المرور' });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
    }

    if (detectCodeInjection(password)) {
      return res.status(400).json({ error: 'لأسباب أمنية، غير مسموح باستخدام رموز خاصة في كلمة المرور' });
    }

    const supabase = getSupabaseAdmin();

    let { data: profile, error: profileError } = await (supabase as any)
      .from('profiles')
      .select('id, number, name, email, stage, team, role, is_verified, show_welcome_groups, amount_paid, attendance, badges, past_waves, passed_badges, permissions, created_at, join_date, password_hash, token_version')
      .eq('number', phone)
      .maybeSingle();

    if (profileError) {
      return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
    }

    if (!profile) {
      return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const profileData = profile as {
      id: string; number: string; name: string; role: string; token_version: number;
      password_hash: string | null;
    };

    if (!profileData.password_hash) {
      return res.status(200).json({
        requiresPasswordSetup: true,
        message: 'هذا الحساب لا يحتوي على كلمة مرور. يرجى استخدام خيار "نسيت كلمة المرور" للتواصل مع المسؤول.',
        user: { id: profileData.id, phone: profileData.number, role: profileData.role }
      });
    }

    const valid = await verifyPassword(password, profileData.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const token = createToken({ userId: profileData.id, phone: profileData.number, role: profileData.role }, profileData.token_version);

    return res.status(200).json({ token, profile: profile, user: { id: profileData.id, phone: profileData.number, role: profileData.role } });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
  }
}
