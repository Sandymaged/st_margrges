-- Migration: Add token_version column for JWT invalidation
-- Increment this column on password changes to invalidate existing tokens.

alter table public.users
  add column if not exists token_version integer not null default 1;

-- Existing users get version 1 by default.
update public.users set token_version = 1 where token_version is null;
