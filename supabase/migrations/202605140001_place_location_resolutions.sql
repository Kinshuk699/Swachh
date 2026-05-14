create table if not exists public.place_location_resolutions (
  id uuid primary key default gen_random_uuid(),
  google_curated_place_id uuid not null references public.google_curated_places(id) on delete cascade,
  latitude numeric not null check (latitude >= -90 and latitude <= 90),
  longitude numeric not null check (longitude >= -180 and longitude <= 180),
  coordinate_source text not null check (coordinate_source in ('osm', 'overture', 'osm_overture', 'manual', 'crowdsourced')),
  coordinate_source_id text not null,
  coordinate_source_label text,
  coordinate_confidence numeric not null check (coordinate_confidence >= 0 and coordinate_confidence <= 1),
  open_source_agreement_meters numeric check (open_source_agreement_meters is null or open_source_agreement_meters >= 0),
  resolution_status text not null default 'needs_review' check (resolution_status in ('auto_approved', 'needs_review', 'rejected', 'superseded')),
  rejection_reason text,
  opening_hours text,
  opening_hours_source text check (opening_hours_source is null or opening_hours_source in ('osm', 'overture', 'manual', 'crowdsourced', 'official_open_source')),
  opening_hours_source_id text,
  opening_hours_checked_at timestamptz,
  resolved_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (google_curated_place_id, coordinate_source, coordinate_source_id)
);

create index if not exists place_location_resolutions_google_curated_place_id_idx
  on public.place_location_resolutions(google_curated_place_id);

create index if not exists place_location_resolutions_map_ready_idx
  on public.place_location_resolutions(resolution_status, coordinate_confidence);

alter table public.place_location_resolutions enable row level security;

drop policy if exists "map-ready place location resolutions are public" on public.place_location_resolutions;
drop policy if exists "admins manage place location resolutions" on public.place_location_resolutions;

create policy "map-ready place location resolutions are public" on public.place_location_resolutions
  for select using (resolution_status = 'auto_approved' or public.is_admin());

create policy "admins manage place location resolutions" on public.place_location_resolutions
  for all using (public.is_admin());