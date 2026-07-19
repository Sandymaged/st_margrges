import { getSupabaseAdmin, verifyToken, verifyTokenVersion, hashPassword } from '../../auth/lib/auth.js';

export function initStatus(): { initialized: boolean; error: string | null } {
  const initialized = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    initialized,
    error: initialized ? null : 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.',
  };
}

export interface AdminAuthResult {
  userId: string;
  role: string | null;
  permissions: Record<string, any> | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export async function verifyAdminToken(adminToken: string): Promise<AdminAuthResult> {
  if (!adminToken) throw new Error('Missing admin token.');

  const payload = verifyToken(adminToken);

  const supabaseAdmin = getSupabaseAdmin();

  const versionValid = await verifyTokenVersion(supabaseAdmin, payload.userId, payload.tokenVersion);
  if (!versionValid) {
    throw new Error('الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى');
  }

  const { data: profile } = await (supabaseAdmin as any)
    .from('profiles')
    .select('role, permissions')
    .eq('id', payload.userId)
    .maybeSingle();

  const profileData = profile as { role?: string; permissions?: { canManagePermissions?: boolean } } | null;
  const isAdmin = profileData?.role === 'admin';
  const isSuperAdmin = isAdmin && !!profileData?.permissions?.canManagePermissions;

  return {
    userId: payload.userId,
    role: profileData?.role ?? null,
    permissions: profileData?.permissions ?? null,
    isAdmin,
    isSuperAdmin,
  };
}

export { getSupabaseAdmin, hashPassword };
