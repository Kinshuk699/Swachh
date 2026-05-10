alter table public.google_curated_places
  add column if not exists cleanliness_tier text,
  add column if not exists source_category text,
  add column if not exists source_evidence text;

alter table public.google_curated_places
  drop constraint if exists google_curated_places_verification_status_check,
  add constraint google_curated_places_verification_status_check
    check (verification_status in (
      'candidate',
      'matched',
      'likely_clean',
      'verified_clean',
      'reported_unclean',
      'approved',
      'rejected'
    ));

update public.google_curated_places
set
  cleanliness_tier = case
    when proxy_type = 'premium_lavatory' or seed_name ilike '%Lavato%' then 'tier_1'
    when seed_name ilike '%NHAI Wayside%' or seed_name ilike '%NHLML Wayside%' then 'tier_1'
    when seed_name ilike '%Cube Stop%' or seed_name ilike '%PATH Recharge%' then 'tier_1'
    when seed_name ilike '%Official expressway service%' or seed_name ilike '%Yamuna Expressway facilities%' then 'tier_1'
    when seed_name ilike '%Samruddhi%' or seed_name ilike '%Purvanchal Expressway%' then 'tier_1'
    when proxy_type = 'fuel_cafe' then 'tier_2'
    when seed_name ilike '%HPCL Focus%' or seed_name ilike '%Club HP%' then 'tier_2'
    when seed_name ilike '%BPCL Pure for Sure%' or seed_name ilike '%Pure for Sure Platinum%' then 'tier_2'
    when seed_name ilike '%BPCL Ghar%' or seed_name ilike '%Indian Oil Swagat%' then 'tier_2'
    when seed_name ilike '%Indian Oil COCO%' or seed_name ilike '%Jio-bp%' then 'tier_2'
    when seed_name ilike '%Shell Select%' or seed_name ilike '%Shell Cafe%' or seed_name ilike '%Wild Bean Cafe%' then 'tier_2'
    when proxy_type = 'food_plaza' then 'tier_3'
    when proxy_type in ('qsr', 'restaurant_proxy') then 'tier_3'
    when proxy_type = 'dhaba_proxy' then 'tier_4'
    else 'tier_4'
  end,
  source_category = case
    when proxy_type = 'premium_lavatory' or seed_name ilike '%Lavato%' then 'premium_restroom'
    when seed_name ilike '%NHAI Wayside%' or seed_name ilike '%NHLML Wayside%' then 'official_wayside_amenity'
    when seed_name ilike '%Cube Stop%' or seed_name ilike '%PATH Recharge%' then 'official_wayside_amenity'
    when seed_name ilike '%Official expressway service%' or seed_name ilike '%Yamuna Expressway facilities%' then 'official_wayside_amenity'
    when seed_name ilike '%Samruddhi%' or seed_name ilike '%Purvanchal Expressway%' then 'official_wayside_amenity'
    when proxy_type = 'fuel_cafe' then 'premium_fuel_program'
    when seed_name ilike '%HPCL Focus%' or seed_name ilike '%Club HP%' then 'premium_fuel_program'
    when seed_name ilike '%BPCL Pure for Sure%' or seed_name ilike '%Pure for Sure Platinum%' then 'premium_fuel_program'
    when seed_name ilike '%BPCL Ghar%' or seed_name ilike '%Indian Oil Swagat%' then 'premium_fuel_program'
    when seed_name ilike '%Indian Oil COCO%' or seed_name ilike '%Jio-bp%' then 'premium_fuel_program'
    when seed_name ilike '%Shell Select%' or seed_name ilike '%Shell Cafe%' or seed_name ilike '%Wild Bean Cafe%' then 'premium_fuel_program'
    when proxy_type = 'food_plaza' then 'food_plaza'
    when proxy_type in ('qsr', 'restaurant_proxy') then 'organized_restaurant'
    when proxy_type = 'dhaba_proxy' then 'dhaba_candidate'
    else 'generic_candidate'
  end,
  source_evidence = coalesce(nullif(local_notes, ''), seed_name)
where cleanliness_tier is null or source_category is null or source_evidence is null;

update public.google_curated_places
set verification_status = 'likely_clean'
where verification_status = 'matched'
  and cleanliness_tier in ('tier_1', 'tier_2');

alter table public.google_curated_places
  alter column cleanliness_tier set not null,
  alter column source_category set not null,
  alter column source_evidence set not null;

alter table public.google_curated_places
  drop constraint if exists google_curated_places_cleanliness_tier_check,
  add constraint google_curated_places_cleanliness_tier_check
    check (cleanliness_tier in ('tier_1', 'tier_2', 'tier_3', 'tier_4'));

alter table public.google_curated_places
  drop constraint if exists google_curated_places_source_category_check,
  add constraint google_curated_places_source_category_check
    check (source_category in (
      'premium_restroom',
      'official_wayside_amenity',
      'premium_fuel_program',
      'organized_restaurant',
      'food_plaza',
      'dhaba_candidate',
      'generic_candidate'
    ));

drop policy if exists "approved google curated places are public" on public.google_curated_places;

create policy "approved google curated places are public" on public.google_curated_places
  for select using (
    verification_status in ('approved', 'likely_clean', 'verified_clean')
    or public.is_admin()
  );