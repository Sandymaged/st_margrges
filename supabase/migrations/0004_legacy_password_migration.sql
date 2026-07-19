-- Migration: Support legacy users without password_hash
-- 
-- Changes:
-- 1. Makes password_hash nullable in public.users
-- 2. Legacy users (migrated from Supabase Auth) have NULL password_hash
-- 3. They must create a password via /api/auth/setup-password before logging in

alter table public.users
  alter column password_hash drop not null;
