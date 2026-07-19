import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { initStatus, getSupabaseAdmin, verifyAdminToken, hashPassword } from './lib/admin.js';

const PHONE_REGEX = /^01[0125]\d{8}$/;

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
    const { name, phone, password, stage, role } = body;

    if (!name || !phone || !password || !stage || !role) {
      return res.status(400).json({ error: 'يرجى ملء جميع البيانات المطلوبة' });
    }

    if (!PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح (يجب أن يكون 11 رقم)' });
    }

    if (!/^[\u0600-\u06FFa-zA-Z0-9\s]+$/.test(String(name).trim())) {
      return res.status(400).json({ error: 'الاسم يجب أن يحتوي على حروف عربية أو إنجليزية أو أرقام ومسافات فقط.' });
    }

    const requester = await verifyAdminToken(adminToken);
    if (!requester.isSuperAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only super admins can create accounts.' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existing } = await (supabaseAdmin as any)
      .from('profiles')
      .select('id')
      .eq('number', phone)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }

    const passwordHash = await hashPassword(password);
    const fakeEmail = `${phone}@scouts.local`;
    const userId = randomUUID();

    const { error: createError } = await (supabaseAdmin as any).from('profiles').insert({
      id: userId,
      name,
      email: fakeEmail,
      number: phone,
      stage,
      role,
      is_verified: true,
      password_hash: passwordHash,
      token_version: 1,
      badges: {
        badge1: { name: '', progress: 0, notes: '', completedRequirements: [] },
        badge2: { name: '', progress: 0, notes: '', completedRequirements: [] },
        badge3: { name: '', progress: 0, notes: '', completedRequirements: [] },
      },
    });

    if (createError) {
      return res.status(400).json({ error: 'هذا الرقم مسجل بالفعل' });
    }

    return res.status(200).json({ message: 'تم إنشاء الحساب بنجاح', uid: userId });
  } catch (error: any) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: error.message || 'حدث خطأ أثناء إنشاء الحساب' });
  }
}
