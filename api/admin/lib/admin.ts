import { createClient, SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let adminClient: SupabaseClient | null = null;

/** Service-role Supabase client — bypasses RLS, server-side only. */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

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

/**
 * Verifies a Supabase session access token and loads the caller's profile
 * permissions. Throws if the token is invalid/expired.
 */
export async function verifyAdminToken(adminToken: string): Promise<AdminAuthResult> {
  if (!adminToken) throw new Error('Missing admin token.');

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(adminToken);
  if (error || !data.user) {
    throw new Error('Invalid or expired admin token.');
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, permissions')
    .eq('id', data.user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  const isSuperAdmin = isAdmin && !!profile?.permissions?.canManagePermissions;

  return {
    userId: data.user.id,
    role: profile?.role ?? null,
    permissions: profile?.permissions ?? null,
    isAdmin,
    isSuperAdmin,
  };
}
