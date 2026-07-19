import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, hashPassword, createToken, validatePhone, sanitizeName, detectCodeInjection } from './lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.error('[register] Received request:', req.method, req.url);

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.error('[register] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.error('[register] Validating input');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { phone, password, name, stage, badge1, badge2 } = body;

    if (!phone || !password || !name || !stage) {
      console.error('[register] Missing required fields');
      return res.status(400).json({ error: 'يرجى ملء جميع البيانات المطلوبة' });
    }

    if (!validatePhone(phone)) {
      console.error('[register] Invalid phone format:', phone);
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح' });
    }

    if (detectCodeInjection(password) || detectCodeInjection(name)) {
      console.error('[register] Code injection detected');
      return res.status(400).json({ error: 'لأسباب أمنية، غير مسموح باستخدام رموز خاصة' });
    }

    if (!sanitizeName(name)) {
      console.error('[register] Invalid name format:', name);
      return res.status(400).json({ error: 'الاسم يجب أن يحتوي على حروف عربية أو إنجليزية وأرقام ومسافات فقط' });
    }

    if (password.trim().length < 6) {
      console.error('[register] Password too short');
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    console.error('[register] Creating database client');
    const supabase = getSupabaseAdmin();

    const userId = randomUUID();

    console.error('[register] Checking if user already exists:', phone);
    const { data: existing } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('number', phone)
      .maybeSingle();

    if (existing) {
      console.error('[register] User already exists:', phone);
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }

    console.error('[register] Hashing password');
    const passwordHash = await hashPassword(password.trim());
    const fakeEmail = `${phone}@scouts.local`;

    const selectedBadges: string[] = [];
    if (badge1) selectedBadges.push(badge1);
    if (badge2) selectedBadges.push(badge2);

    const profile = {
      id: userId,
      name,
      email: fakeEmail,
      number: phone,
      stage,
      badges: {
        badge1: { name: badge1 || '', progress: 0, notes: '', completedRequirements: [] },
        badge2: { name: badge2 || '', progress: 0, notes: '', completedRequirements: [] },
        badge3: { name: '', progress: 0, notes: '', completedRequirements: [] },
      },
      role: 'scout',
      is_verified: true,
      show_welcome_groups: true,
      password_hash: passwordHash,
      token_version: 1,
    };

    console.error('[register] Inserting profile into database');
    const { error: profileError } = await (supabase as any).from('profiles').insert(profile);
    if (profileError) {
      console.error('[register] Error inserting profile:', profileError);
      return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب' });
    }

    console.error('[register] Generating JWT for user:', userId);
    const token = createToken({ userId, phone, role: 'scout' }, 1);

    console.error('[register] Registration successful for:', userId);
    return res.status(200).json({ token, profile, user: { id: userId, phone, role: 'scout' } });
  } catch (error: any) {
    console.error('[register] Unhandled exception:', error);
    console.error('[register] Stack trace:', error?.stack);
    if (error?.code === '23505' || error?.message?.includes('duplicate')) {
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }
    return res.status(500).json({ error: error?.message || 'حدث خطأ أثناء إنشاء الحساب' });
  }
}
