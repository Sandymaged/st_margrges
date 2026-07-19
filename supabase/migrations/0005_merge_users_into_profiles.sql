-- Migration: Merge public.users into public.profiles
-- The `public.users` table was referenced by backend code but never existed in the database schema.
-- This migration adds authentication columns directly to `profiles` so the backend can
-- authenticate without a separate `users` table.
--
-- Changes:
-- 1. Adds password_hash (nullable) and token_version to public.profiles
-- 2. Drops public.users if it exists (cleanup for any environments that ran 0002_custom_auth.sql)

alter table public.profiles
  add column if not exists password_hash text,
  add column if not exists token_version integer not null default 1;

drop table if exists public.users;
