/**
 * One-off helper: set (or reset) the password for one existing account,
 * identified by phone number. Needed for accounts that have no
 * password_hash set yet - e.g. the super admin account, or any account
 * created before password login existed.
 *
 * Prereqs:
 *  - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in .env (same values
 *    used by the app itself)
 *
 * Run with: npm run set-password -- <phone> <newPassword>
 * Example:  npm run set-password -- 01000000000 MyStrongPassword123
 *
 * This updates password_hash directly with the same bcrypt hashing the
 * app's own login/admin endpoints use, and bumps token_version so any
 * old sessions for that account are invalidated (same as the admin
 * "update password" feature does).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

dotenv.config();

const SALT_ROUNDS = 10;

async function main() {
  const [, , phone, newPassword] = process.argv;

  if (!phone || !newPassword) {
    console.error('Usage: npm run set-password -- <phone> <newPassword>');
    process.exit(1);
  }

  if (newPassword.trim().length < 6) {
    console.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY لازم يكونوا موجودين في ملف .env');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: profile, error: findError } = await (supabase as any)
    .from('profiles')
    .select('id, name, number')
    .eq('number', phone)
    .maybeSingle();

  if (findError) {
    console.error('خطأ أثناء البحث عن الحساب:', findError.message);
    process.exit(1);
  }

  if (!profile) {
    console.error(`مفيش حساب برقم الهاتف ده: ${phone}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword.trim(), SALT_ROUNDS);

  const { data: current } = await (supabase as any)
    .from('profiles')
    .select('token_version')
    .eq('id', profile.id)
    .maybeSingle();
  const currentVersion = current?.token_version ?? 0;

  const { error: updateError } = await (supabase as any)
    .from('profiles')
    .update({ password_hash: passwordHash, token_version: currentVersion + 1 })
    .eq('id', profile.id);

  if (updateError) {
    console.error('خطأ أثناء تحديث كلمة المرور:', updateError.message);
    process.exit(1);
  }

  console.log(`تم بنجاح: كلمة مرور جديدة اتحطت لحساب "${profile.name}" (${phone}).`);
}

main();
