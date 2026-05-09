create table if not exists public.google_curated_places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  seed_name text not null,
  region text not null,
  proxy_type text not null check (proxy_type in ('qsr', 'wayside_amenity', 'fuel_cafe', 'fuel_station', 'food_plaza', 'restaurant_proxy', 'premium_lavatory', 'dhaba_proxy')),
  highway_name text not null,
  route_context text,
  locality_hint text,
  restroom_confidence numeric not null check (restroom_confidence >= 0 and restroom_confidence <= 1),
  distance_from_highway_meters int check (distance_from_highway_meters >= 0 and distance_from_highway_meters <= 2000),
  local_notes text,
  verification_status text not null default 'candidate' check (verification_status in ('candidate', 'matched', 'approved', 'rejected')),
  matched_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_curated_places enable row level security;

drop policy if exists "approved google curated places are public" on public.google_curated_places;
drop policy if exists "admins manage google curated places" on public.google_curated_places;

create policy "approved google curated places are public" on public.google_curated_places
  for select using (verification_status = 'approved' or public.is_admin());

create policy "admins manage google curated places" on public.google_curated_places
  for all using (public.is_admin());