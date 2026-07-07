import { VercelRequest, VercelResponse } from '@vercel/node';
import { initStatus, getSupabaseAdmin, verifyAdminToken } from './lib/admin.js';

const PHONE_REGEX = /^01[0125]\d{8}$/;

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
    const { name, phone, password, stage, role, adminToken } = body;

    if (!name || !phone || !password || !stage || !role) {
      return res.status(400).json({ error: 'يرجى ملء جميع البيانات المطلوبة' });
    }

    if (!PHONE_REGEX.test(phone)) {
      return res.status(400).json({ error: 'رقم الهاتف غير صحيح (يجب أن يكون 11 رقم)' });
    }

    if (!/^[؀-ۿa-zA-Z0-9\s]+$/.test(String(name).trim())) {
      return res.status(400).json({ error: 'الاسم يجب أن يحتوي على حروف عربية أو إنجليزية أو أرقام ومسافات فقط.' });
    }

    const requester = await verifyAdminToken(adminToken);
    if (!requester.isSuperAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only super admins can create accounts.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const fakeEmail = `${phone}@scouts.local`;

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      const message = createError?.message?.includes('already been registered')
        ? 'هذا الرقم مسجل بالفعل'
        : createError?.message || 'حدث خطأ أثناء إنشاء الحساب';
      return res.status(400).json({ error: message });
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: created.user.id,
      name,
      email: fakeEmail,
      number: phone,
      stage,
      role,
      is_verified: true,
      badges: {
        badge1: { name: '', progress: 0, notes: '', completedRequirements: [] },
        badge2: { name: '', progress: 0, notes: '', completedRequirements: [] },
        badge3: { name: '', progress: 0, notes: '', completedRequirements: [] },
      },
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: 'حدث خطأ أثناء حفظ بيانات الحساب' });
    }

    return res.status(200).json({ message: 'تم إنشاء الحساب بنجاح', uid: created.user.id });
  } catch (error: any) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: error.message || 'حدث خطأ أثناء إنشاء الحساب' });
  }
}
