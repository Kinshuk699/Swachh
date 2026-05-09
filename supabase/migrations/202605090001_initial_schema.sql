create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.restroom_submissions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null check (category in ('food_plaza', 'fuel_station', 'public_restroom', 'restaurant_proxy', 'toll_plaza')),
  latitude double precision not null,
  longitude double precision not null,
  highway_name text not null,
  route_context text,
  free_access boolean not null default false,
  cleanliness_rating int check (cleanliness_rating between 1 and 5),
  safety_notes text,
  women_friendly boolean not null default false,
  accessible boolean not null default false,
  google_place_id text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.restroom_reports (
  id uuid primary key default gen_random_uuid(),
  restroom_id uuid not null references public.restroom_submissions(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.restroom_submissions enable row level security;
alter table public.restroom_reports enable row level security;
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "approved restroom submissions are public" on public.restroom_submissions;
drop policy if exists "authenticated users create restroom submissions" on public.restroom_submissions;
drop policy if exists "users update own pending submissions" on public.restroom_submissions;
drop policy if exists "admins manage restroom submissions" on public.restroom_submissions;
drop policy if exists "authenticated users create reports" on public.restroom_reports;
drop policy if exists "admins read reports" on public.restroom_reports;
drop policy if exists "admins read admin list" on public.admin_users;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

create policy "approved restroom submissions are public" on public.restroom_submissions
  for select using (status = 'approved' or created_by = auth.uid() or public.is_admin());

create policy "authenticated users create restroom submissions" on public.restroom_submissions
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

create policy "users update own pending submissions" on public.restroom_submissions
  for update using (created_by = auth.uid() and status = 'pending');

create policy "admins manage restroom submissions" on public.restroom_submissions
  for all using (public.is_admin());

create policy "authenticated users create reports" on public.restroom_reports
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

create policy "admins read reports" on public.restroom_reports
  for select using (public.is_admin());

create policy "admins read admin list" on public.admin_users
  for select using (public.is_admin());
