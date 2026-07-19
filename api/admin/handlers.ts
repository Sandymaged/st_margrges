import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { initStatus, getSupabaseAdmin, verifyAdminToken, hashPassword } from './lib/admin.js';
import { notifyProfileChanged } from '../sse/profileNotifier.js';

const PHONE_REGEX = /^01[0125]\d{8}$/;

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

export async function statusHandler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json(status);
}

export async function createAccountHandler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  setCors(res);
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

export async function deleteUserHandler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  setCors(res);
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

export async function updatePasswordHandler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  setCors(res);
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
    const { uid, newPassword } = body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'UID and newPassword are required.' });
    }

    const requester = await verifyAdminToken(adminToken);

    if (!requester.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized. Only admins can change passwords.' });
    }

    const passwordHash = await hashPassword(newPassword);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userRow } = await (supabaseAdmin as any).from('profiles').select('token_version').eq('id', uid).maybeSingle();
    const currentVersion = (userRow as { token_version?: number } | null)?.token_version ?? 0;
    const { error } = await (supabaseAdmin as any).from('profiles').update({ password_hash: passwordHash, token_version: currentVersion + 1 }).eq('id', uid);
    if (error) throw error;

    notifyProfileChanged(uid);

    return res.status(200).json({ message: 'Successfully updated user password.' });
  } catch (error: any) {
    console.error('Error updating password:', error);
    return res.status(500).json({ error: error.message || 'Failed to update password.' });
  }
}

export async function updatePhoneHandler(req: VercelRequest, res: VercelResponse) {
  const status = initStatus();
  setCors(res);
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
