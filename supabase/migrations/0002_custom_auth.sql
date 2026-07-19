-- Migration: Replace Supabase Auth with custom authentication
-- Run this after 0001_init.sql has been applied.
-- 
-- Changes:
-- 1. Creates public.users table for local auth (replaces auth.users)
-- 2. Removes FK dependency on auth.users from profiles
-- 3. Disables RLS (authorization moves to backend)
-- 4. Updates all RPCs to use p_caller_id instead of auth.uid()

-- ============================================================================
-- 1. Create local users table
-- ============================================================================

create table public.users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  password_hash text not null,
  role text not null default 'scout' check (role in ('scout', 'admin')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Remove FK to auth.users from profiles
--    First we need to handle the existing constraint.
--    The FK is: profiles.id -> auth.users(id) on delete cascade
-- ============================================================================

-- We cannot drop the FK if there are existing profiles referencing auth.users.
-- The profiles already have UUIDs in their id column. We just need to remove
-- the foreign key constraint so profiles can exist without auth.users.
-- We keep the id as primary key.

-- Check what the actual constraint name is
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'profiles'
    and con.confrelid = (select oid from pg_class where relname = 'users' and relnamespace = (select oid from pg_namespace where nspname = 'auth'))
    and con.contype = 'f';

  if constraint_name is not null then
    execute 'alter table public.profiles drop constraint ' || constraint_name;
  end if;
end $$;

-- Also drop any FK to auth.users (the actual constraint name may differ)
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'profiles'
    and con.confrelid = (select oid from pg_class where relname = 'users' and relnamespace = (select oid from pg_namespace where nspname = 'auth'))
    and con.contype = 'f';

  if constraint_name is not null then
    execute 'alter table public.profiles drop constraint ' || constraint_name;
  end if;
end $$;

-- Drop references to auth.users in activity_logs and deleted_accounts_logs too
-- (These reference public.profiles, not auth.users directly, so they should be fine.)

-- ============================================================================
-- 3. Disable Row Level Security on all tables
--    Authorization is now handled by the backend via JWT verification.
-- ============================================================================

alter table public.profiles disable row level security;
alter table public.app_settings disable row level security;
alter table public.activity_logs disable row level security;
alter table public.deleted_accounts_logs disable row level security;

-- Drop all existing RLS policies
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;
drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_write_admin on public.app_settings;
drop policy if exists app_settings_update_admin on public.app_settings;
drop policy if exists activity_logs_select on public.activity_logs;
drop policy if exists activity_logs_insert on public.activity_logs;
drop policy if exists activity_logs_delete on public.activity_logs;
drop policy if exists deleted_accounts_logs_select on public.deleted_accounts_logs;
drop policy if exists deleted_accounts_logs_insert on public.deleted_accounts_logs;
drop policy if exists deleted_accounts_logs_delete on public.deleted_accounts_logs;

-- ============================================================================
-- 4. Update all RPCs to use p_caller_id instead of auth.uid()
-- ============================================================================

-- Helper functions unchanged (they accept uid parameter, not auth.uid())
-- is_admin(uid) and is_super_admin(uid) stay the same.

-- bootstrap_first_admin: was using auth.uid(), now accepts p_caller_id
create or replace function public.bootstrap_first_admin(
  p_caller_id uuid,
  p_name text,
  p_number text,
  p_email text,
  p_stage text default 'قادة'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  admin_permissions jsonb := jsonb_build_object(
    'canManagePermissions', true,
    'canManageAllBadges', true,
    'canDeleteAccounts', true,
    'canManageAttendance', true,
    'canManagePayments', true,
    'canManageBadgeRequirements', true,
    'managedStages', '[]'::jsonb,
    'managedBadges', '[]'::jsonb
  );
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An admin already exists.';
  end if;

  insert into public.profiles (id, name, email, number, stage, role, is_verified, permissions)
  values (p_caller_id, p_name, p_email, p_number, p_stage, 'admin', true, admin_permissions)
  on conflict (id) do update
    set role = 'admin', permissions = admin_permissions
  returning * into result;

  return result;
end;
$$;

-- set_attendance: was using auth.uid(), now accepts p_caller_id
create or replace function public.set_attendance(p_caller_id uuid, p_user_id uuid, p_date text, p_present boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can update attendance.';
  end if;

  update public.profiles
  set attendance = jsonb_set(coalesce(attendance, '{}'::jsonb), array[p_date], to_jsonb(p_present), true)
  where id = p_user_id;
end;
$$;

-- update_badge_slot: was using auth.uid(), now accepts p_caller_id
create or replace function public.update_badge_slot(p_caller_id uuid, p_user_id uuid, p_slot text, p_badge jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_progress int;
  new_progress int;
begin
  if p_slot not in ('badge1', 'badge2', 'badge3') then
    raise exception 'Invalid badge slot: %', p_slot;
  end if;

  if p_caller_id <> p_user_id and not public.is_admin(p_caller_id) then
    raise exception 'Not authorized to update this profile.';
  end if;

  if not public.is_admin(p_caller_id) then
    select coalesce((badges->p_slot->>'progress')::int, 0) into current_progress
    from public.profiles where id = p_user_id;
    new_progress := coalesce((p_badge->>'progress')::int, 0);
    if new_progress <> 0 and new_progress <> current_progress then
      raise exception 'Scouts cannot set their own badge progress.';
    end if;
  end if;

  update public.profiles
  set badges = jsonb_set(coalesce(badges, '{}'::jsonb), array[p_slot], p_badge, true)
  where id = p_user_id;
end;
$$;

-- add_completed_requirement: was using auth.uid(), now accepts p_caller_id
create or replace function public.add_completed_requirement(p_caller_id uuid, p_user_id uuid, p_slot text, p_requirement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can grade requirements.';
  end if;

  select coalesce(badges->p_slot->'completedRequirements', '[]'::jsonb) into existing
  from public.profiles where id = p_user_id;

  if not (existing @> to_jsonb(p_requirement)) then
    existing := existing || to_jsonb(p_requirement);
  end if;

  update public.profiles
  set badges = jsonb_set(coalesce(badges, '{}'::jsonb), array[p_slot, 'completedRequirements'], existing, true)
  where id = p_user_id;
end;
$$;

-- remove_completed_requirement: was using auth.uid(), now accepts p_caller_id
create or replace function public.remove_completed_requirement(p_caller_id uuid, p_user_id uuid, p_slot text, p_requirement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  filtered jsonb;
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can grade requirements.';
  end if;

  select coalesce(badges->p_slot->'completedRequirements', '[]'::jsonb) into existing
  from public.profiles where id = p_user_id;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into filtered
  from jsonb_array_elements_text(existing) as value
  where value <> p_requirement;

  update public.profiles
  set badges = jsonb_set(coalesce(badges, '{}'::jsonb), array[p_slot, 'completedRequirements'], filtered, true)
  where id = p_user_id;
end;
$$;

-- update_permissions: was using auth.uid(), now accepts p_caller_id
create or replace function public.update_permissions(p_caller_id uuid, p_user_id uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can update permissions.';
  end if;

  update public.profiles set permissions = p_permissions where id = p_user_id;
end;
$$;

-- merge_app_settings: was using auth.uid(), now accepts p_caller_id
create or replace function public.merge_app_settings(p_caller_id uuid, p_key text, p_patch jsonb)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_settings;
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can update settings.';
  end if;

  insert into public.app_settings (key, value)
  values (p_key, p_patch)
  on conflict (key) do update
    set value = public.app_settings.value || excluded.value
  returning * into result;

  return result;
end;
$$;

-- dismiss_welcome_groups: was using auth.uid(), now accepts p_caller_id
create or replace function public.dismiss_welcome_groups(p_caller_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set show_welcome_groups = false where id = p_caller_id;
$$;

-- log_activity: was using auth.uid(), now accepts p_caller_id
create or replace function public.log_activity(
  p_caller_id uuid,
  p_action text,
  p_details text,
  p_target_user_id uuid default null,
  p_target_user_name text default null
)
returns public.activity_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_name text;
  result public.activity_logs;
begin
  if not public.is_admin(p_caller_id) then
    raise exception 'Only admins can log activity.';
  end if;

  select name into caller_name from public.profiles where id = p_caller_id;

  insert into public.activity_logs (action, details, admin_id, admin_name, target_user_id, target_user_name)
  values (p_action, p_details, p_caller_id, coalesce(caller_name, 'Unknown'), p_target_user_id, p_target_user_name)
  returning * into result;

  return result;
end;
$$;
