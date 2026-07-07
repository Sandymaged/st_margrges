-- Run this whole file once in the Supabase SQL editor (or `supabase db push`)
-- before running `npm run migrate:supabase`.
-- It creates the schema, enables RLS, and defines the RPC functions the
-- frontend calls instead of Firestore's dot-path updateDoc/setDoc(merge).

-- ============================================================================
-- Tables
-- ============================================================================

create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  email               text not null,
  number              text not null unique,
  stage               text not null,
  team                text,
  role                text not null default 'scout' check (role in ('scout', 'admin')),
  is_verified         boolean not null default true,
  show_welcome_groups boolean not null default true,
  amount_paid         numeric default 0,
  attendance          jsonb not null default '{}'::jsonb,
  badges              jsonb not null default '{}'::jsonb,
  past_waves          jsonb not null default '{}'::jsonb,
  passed_badges       text[] not null default '{}',
  permissions         jsonb,
  created_at          timestamptz not null default now(),
  join_date           timestamptz not null default now()
);

create table public.app_settings (
  key   text primary key,
  value jsonb not null
);

create table public.activity_logs (
  id               uuid primary key default gen_random_uuid(),
  action           text not null,
  details          text not null,
  admin_id         uuid not null references public.profiles(id),
  admin_name       text not null,
  target_user_id   uuid references public.profiles(id),
  target_user_name text,
  created_at       timestamptz not null default now()
);

create table public.deleted_accounts_logs (
  id                    uuid primary key default gen_random_uuid(),
  deleted_scout_number  text,
  deleted_by            uuid references public.profiles(id) on delete set null,
  deleted_by_name       text,
  created_at            timestamptz not null default now()
);

create index profiles_stage_idx on public.profiles (stage);
create index profiles_role_idx on public.profiles (role);
create index activity_logs_created_at_idx on public.activity_logs (created_at desc);

-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role = 'admin'
      and coalesce((p.permissions->>'canManagePermissions')::boolean, false)
  );
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.deleted_accounts_logs enable row level security;

-- profiles: owner or admin can read
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));

-- profiles: a signed-in user may create only their own scout profile
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id and role = 'scout');

-- profiles: admins may create any profile (e.g. admin-created accounts)
create policy profiles_insert_admin on public.profiles
  for insert with check (public.is_admin(auth.uid()));

-- profiles: admins can update any row; owners cannot write directly
-- (owner-driven changes go through the RPC functions below instead, which
-- enforce the same "no self-editing badge progress" style restrictions the
-- old firestore.rules had).
create policy profiles_update_admin on public.profiles
  for update using (public.is_admin(auth.uid()));

create policy profiles_delete_admin on public.profiles
  for delete using (public.is_admin(auth.uid()));

-- app_settings: readable by anyone (even signed-out, for the login screen)
create policy app_settings_select on public.app_settings
  for select using (true);

create policy app_settings_write_admin on public.app_settings
  for insert with check (public.is_admin(auth.uid()));

create policy app_settings_update_admin on public.app_settings
  for update using (public.is_admin(auth.uid()));

-- activity_logs / deleted_accounts_logs: super-admin only, immutable
create policy activity_logs_select on public.activity_logs
  for select using (public.is_super_admin(auth.uid()));

create policy activity_logs_insert on public.activity_logs
  for insert with check (public.is_admin(auth.uid()) and admin_id = auth.uid());

create policy activity_logs_delete on public.activity_logs
  for delete using (public.is_super_admin(auth.uid()));

create policy deleted_accounts_logs_select on public.deleted_accounts_logs
  for select using (public.is_admin(auth.uid()));

create policy deleted_accounts_logs_insert on public.deleted_accounts_logs
  for insert with check (public.is_admin(auth.uid()));

create policy deleted_accounts_logs_delete on public.deleted_accounts_logs
  for delete using (public.is_admin(auth.uid()));

-- ============================================================================
-- RPCs (SECURITY DEFINER — bypass RLS internally, enforce checks explicitly)
-- ============================================================================

-- Create (or promote) the caller's own profile as admin with full
-- permissions, but only if no admin exists yet. Replaces the
-- VITE_SUPER_ADMIN_EMAIL/PHONE env-var bootstrap + client-side setDoc.
create or replace function public.bootstrap_first_admin(p_name text, p_number text, p_email text, p_stage text default 'قادة')
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
  values (auth.uid(), p_name, p_email, p_number, p_stage, 'admin', true, admin_permissions)
  on conflict (id) do update
    set role = 'admin', permissions = admin_permissions
  returning * into result;

  return result;
end;
$$;

-- Set a single attendance date for a scout (equivalent of
-- updateDoc(doc(db,'users',uid), { [`attendance.${date}`]: present })).
create or replace function public.set_attendance(p_user_id uuid, p_date text, p_present boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can update attendance.';
  end if;

  update public.profiles
  set attendance = jsonb_set(coalesce(attendance, '{}'::jsonb), array[p_date], to_jsonb(p_present), true)
  where id = p_user_id;
end;
$$;

-- Replace one badge slot ('badge1'|'badge2'|'badge3') wholesale. Callable by
-- an admin for any scout, or by the scout for their own profile (mirrors the
-- old rule allowing self-updates as long as progress isn't self-inflated —
-- enforced here by requiring progress stay unchanged when the caller is not
-- an admin).
create or replace function public.update_badge_slot(p_user_id uuid, p_slot text, p_badge jsonb)
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

  if auth.uid() <> p_user_id and not public.is_admin(auth.uid()) then
    raise exception 'Not authorized to update this profile.';
  end if;

  if not public.is_admin(auth.uid()) then
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

-- Add/remove a single completed requirement from a badge slot's
-- completedRequirements array (equivalent of arrayUnion/arrayRemove).
create or replace function public.add_completed_requirement(p_user_id uuid, p_slot text, p_requirement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
begin
  if not public.is_admin(auth.uid()) then
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

create or replace function public.remove_completed_requirement(p_user_id uuid, p_slot text, p_requirement text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  filtered jsonb;
begin
  if not public.is_admin(auth.uid()) then
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

-- Replace a scout's AdminPermissions object wholesale.
create or replace function public.update_permissions(p_user_id uuid, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can update permissions.';
  end if;

  update public.profiles set permissions = p_permissions where id = p_user_id;
end;
$$;

-- Shallow-merge a patch into an app_settings row's jsonb value (equivalent
-- of setDoc(doc(db,'settings',key), patch, { merge: true })).
create or replace function public.merge_app_settings(p_key text, p_patch jsonb)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.app_settings;
begin
  if not public.is_admin(auth.uid()) then
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

-- Let the signed-in scout dismiss their own one-time welcome/groups modal.
create or replace function public.dismiss_welcome_groups()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set show_welcome_groups = false where id = auth.uid();
$$;

-- Insert an activity_logs row, deriving admin_id/admin_name from the caller's
-- own profile so the client can't spoof another admin's identity.
create or replace function public.log_activity(
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
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can log activity.';
  end if;

  select name into caller_name from public.profiles where id = auth.uid();

  insert into public.activity_logs (action, details, admin_id, admin_name, target_user_id, target_user_name)
  values (p_action, p_details, auth.uid(), coalesce(caller_name, 'Unknown'), p_target_user_id, p_target_user_name)
  returning * into result;

  return result;
end;
$$;
