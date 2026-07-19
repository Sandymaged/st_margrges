import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET must be set in production'); })() : 'dev-secret-change-in-production');
const SALT_ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: string;
  phone: string;
  role: string;
  tokenVersion?: number;
}

export function createToken(payload: JwtPayload, tokenVersion?: number): string {
  return jwt.sign({ ...payload, tokenVersion }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function verifyTokenVersion(
  supabase: any,
  userId: string,
  tokenVersion?: number
): Promise<boolean> {
  if (tokenVersion === undefined) return true;
  const { data: user } = await (supabase as any)
    .from('profiles')
    .select('token_version')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return false;
  return (user as { token_version: number }).token_version === tokenVersion;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

const PHONE_REGEX = /^01[0125]\d{8}$/;

export function validatePhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function sanitizeName(name: string): boolean {
  return /^[\u0600-\u06FFa-zA-Z0-9\s]+$/.test(name.trim());
}

export function detectCodeInjection(text: string): boolean {
  const patterns = [
    /select\s+.*?\s+from/i,
    /insert\s+into/i,
    /drop\s+(table|database)/i,
    /update\s+.*?\s+set/i,
    /delete\s+from/i,
    /union\s+select/i,
    /<script.*?>/i,
    /(javascript|vbscript):/i,
    /1\s*=\s*1/i,
  ];
  return patterns.some(p => p.test(text));
}
