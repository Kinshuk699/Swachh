delete from google_curated_places
where distance_from_highway_meters > 1000;

alter table google_curated_places
  drop constraint if exists google_curated_places_distance_from_highway_meters_check;

alter table google_curated_places
  add constraint google_curated_places_distance_from_highway_meters_check
  check (distance_from_highway_meters >= 0 and distance_from_highway_meters <= 1000);
