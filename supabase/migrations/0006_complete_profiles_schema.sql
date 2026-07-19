-- Migration: Complete profiles schema — ensures every column the backend expects exists
-- with the correct PostgreSQL type, default value, and nullability.
--
-- Safe to run on an existing table: uses IF NOT EXISTS / IF EXISTS throughout.
-- Run after 0001_init.sql + 0002_custom_auth.sql + 0005_merge_users_into_profiles.sql.

-- ============================================================================
-- 1. Drop FK to auth.users (Supabase Auth removed)
-- ============================================================================
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'profiles'
    and con.confrelid = (select oid from pg_class where relname = 'users'
                         and relnamespace = (select oid from pg_namespace where nspname = 'auth'))
    and con.contype = 'f';

  if constraint_name is not null then
    execute 'alter table public.profiles drop constraint ' || constraint_name;
  end if;
end $$;

-- ============================================================================
-- 2. Add every column the backend touches
-- ============================================================================

alter table public.profiles
  add column if not exists name                text not null,
  add column if not exists email               text not null,
  add column if not exists number              text not null,
  add column if not exists stage               text not null,
  add column if not exists team                text,
  add column if not exists role                text not null default 'scout',
  add column if not exists is_verified         boolean not null default true,
  add column if not exists show_welcome_groups boolean not null default true,
  add column if not exists amount_paid         numeric default 0,
  add column if not exists attendance          jsonb not null default '{}'::jsonb,
  add column if not exists badges              jsonb not null default '{}'::jsonb,
  add column if not exists past_waves          jsonb not null default '{}'::jsonb,
  add column if not exists passed_badges       text[] not null default '{}',
  add column if not exists permissions         jsonb,
  add column if not exists password_hash       text,
  add column if not exists token_version       integer not null default 1,
  add column if not exists created_at          timestamptz not null default now(),
  add column if not exists join_date           timestamptz not null default now();

-- ============================================================================
-- 3. Ensure constraints on columns that may already exist
-- ============================================================================

-- Unique constraint on number (must exist for login/register duplicate checks)
alter table public.profiles
  drop constraint if exists profiles_number_key;

alter table public.profiles
  add constraint profiles_number_key unique (number);

-- Role check constraint
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('scout', 'admin'));

-- ============================================================================
-- 4. Primary key (if somehow missing)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'p'
  ) then
    execute 'alter table public.profiles add primary key (id)';
  end if;
end $$;

-- ============================================================================
-- 5. Indexes
-- ============================================================================

create index if not exists profiles_stage_idx on public.profiles (stage);
create index if not exists profiles_role_idx on public.profiles (role);

-- ============================================================================
-- 6. Disable RLS (authorization moved to backend)
-- ============================================================================

alter table public.profiles disable row level security;

-- Drop any residual RLS policies
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
