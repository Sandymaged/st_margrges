/**
 * Frontend auth client — replaces supabase.auth.*
 *
 * Manages JWT token storage and provides login/register/logout/getSession
 * that match the existing call patterns used throughout the app.
 */

const TOKEN_KEY = 'app_auth_token';
const USER_KEY = 'app_auth_user';

export interface AuthSession {
  token: string;
  user: { id: string; phone: string; role: string };
  profile: any;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): { id: string; phone: string; role: string } | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export interface LoginResult extends AuthSession {
  requiresPasswordSetup?: boolean;
  message?: string;
}

export async function login(phone: string, password: string): Promise<LoginResult> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

  if (data.requiresPasswordSetup) {
    return { requiresPasswordSetup: true, message: data.message, user: data.user, token: '', profile: null };
  }

  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function register(params: {
  phone: string;
  password: string;
  name: string;
  stage: string;
  badge1?: string;
  badge2?: string;
}): Promise<AuthSession> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'فشل إنشاء الحساب');
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {
    // Ignore network errors — clear locally anyway
  }
  clearSession();
}

export async function getSession(): Promise<AuthSession | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      const storedUser = getStoredUser();
      return storedUser ? { token, user: storedUser, profile: null } : null;
    }
    if (!res.ok) {
      clearSession();
      return null;
    }
    const data = await res.json();
    return { token, user: data.user, profile: data.profile };
  } catch {
    clearSession();
    return null;
  }
}

export async function rpc(functionName: string, params: Record<string, any> = {}): Promise<{ data?: any; error?: any }> {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
  try {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers,
      body: JSON.stringify({ function: functionName, params }),
    });
    const data = await res.json();
    if (!res.ok) return { error: new Error(data.error || `RPC failed: ${functionName}`) };
    return { data: data.data };
  } catch (error) {
    return { error };
  }
}

export async function apiQuery(params: {
  table: string;
  columns?: string;
  method?: 'select' | 'insert' | 'update' | 'delete';
  filters?: { method: string; column: string; value: any }[];
  data?: any;
}): Promise<{ data?: any; error?: any }> {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const responseData = await res.json();
    if (!res.ok) return { error: new Error(responseData.error || `Query failed: ${params.table}`) };
    return { data: responseData.data };
  } catch (error) {
    return { error };
  }
}
