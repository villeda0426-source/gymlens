-- Shared equipment knowledge. All app clients have read-only access.
-- Separate from public.equipment, whose rows currently represent completed scan results.
create table public.equipment_catalog_types (
  slug text primary key,
  name text not null,
  name_es text not null,
  category text not null check (category in ('machine','cable','cardio','free_weight','accessory','bodyweight','recovery','storage','other')),
  primary_muscles text[] not null default '{}',
  aliases text[] not null default '{}',
  visual_cues text[] not null default '{}',
  metadata_basis text not null,
  classification_review_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.equipment_catalog_manufacturers (
  slug text primary key,
  name text not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.equipment_catalog_sources (
  source_key text primary key,
  title text not null,
  url text not null check (url ~ '^https://'),
  document_date date,
  accessed_on date not null,
  evidence_basis text not null,
  access_status text not null,
  locator text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.equipment_catalog_gyms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  chain text,
  location_text text not null,
  country_code text not null default 'US' check (length(country_code)=2),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.equipment_catalog_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type_slug text not null references public.equipment_catalog_types(slug),
  manufacturer_slug text references public.equipment_catalog_manufacturers(slug),
  display_name text not null,
  display_name_es text not null,
  model_identifier text,
  series_name text,
  identifier_specificity text not null check (identifier_specificity in ('reported_model','reported_series','unspecified')),
  aliases text[] not null default '{}',
  resistance_types text[] not null default '{}',
  is_identification_candidate boolean not null default true,
  catalog_status text not null default 'research' check (catalog_status in ('research','reviewed','retired')),
  visual_verification_status text not null default 'no_reference_images' check (visual_verification_status in ('no_reference_images','references_pending_review','visually_reviewed')),
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple'::regconfig, search_text)) stored,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.equipment_catalog_evidence (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  source_record_key text not null,
  catalog_item_id uuid not null references public.equipment_catalog_items(id),
  source_key text not null references public.equipment_catalog_sources(source_key),
  gym_id uuid not null references public.equipment_catalog_gyms(id),
  zone text not null,
  plan_mark text,
  source_locator text not null,
  evidence_basis text not null check (evidence_basis in ('planned_permit_schedule','operator_published_inventory','operator_published_presence','planned_layout_labels','verified_observation')),
  quantity integer check (quantity >= 0),
  quantity_unit text not null,
  quantity_usable boolean not null default false,
  availability_status text not null check (availability_status in ('planned','not_planned','operator_reported','presence_only','layout_only','verified_present')),
  current_installation_verified boolean not null default false,
  verified_at timestamptz,
  quality_flags text[] not null default '{}',
  raw_record jsonb not null,
  created_at timestamptz not null default now(),
  unique (dataset_key,source_record_key),
  check (not current_installation_verified or (verified_at is not null and evidence_basis='verified_observation' and availability_status='verified_present')),
  check (availability_status <> 'verified_present' or current_installation_verified),
  check ((availability_status='not_planned') = (quantity=0) or quantity is null),
  check (not quantity_usable or quantity is not null)
);

-- Empty initially. Store only references cleared for the intended use; user scan photos
-- remain in the app's existing identification flow, outside this shared reference table.
create table public.equipment_catalog_media (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.equipment_catalog_items(id),
  source_key text not null references public.equipment_catalog_sources(source_key),
  url text not null check (url ~ '^https://'),
  media_kind text not null check (media_kind in ('reference_photo','model_label','manual','diagram')),
  rights_status text not null check (rights_status in ('unknown','reference_link_only','licensed','owned','permission_granted')),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  usable_for_identification boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique(catalog_item_id,url),
  check (not usable_for_identification or (review_status='approved' and rights_status in ('licensed','owned','permission_granted') and media_kind in ('reference_photo','model_label')))
);

create table public.equipment_catalog_imports (
  dataset_key text primary key,
  source_sha256 text not null,
  research_date date not null,
  evidence_record_count integer not null check (evidence_record_count>=0),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index equipment_catalog_types_category_idx on public.equipment_catalog_types(category);
create index equipment_catalog_types_muscles_idx on public.equipment_catalog_types using gin(primary_muscles);
create index equipment_catalog_items_type_idx on public.equipment_catalog_items(type_slug);
create index equipment_catalog_items_manufacturer_idx on public.equipment_catalog_items(manufacturer_slug);
create index equipment_catalog_items_model_idx on public.equipment_catalog_items(model_identifier) where model_identifier is not null;
create index equipment_catalog_items_search_idx on public.equipment_catalog_items using gin(search_document);
create index equipment_catalog_items_resistance_idx on public.equipment_catalog_items using gin(resistance_types);
create index equipment_catalog_evidence_item_idx on public.equipment_catalog_evidence(catalog_item_id);
create index equipment_catalog_evidence_source_idx on public.equipment_catalog_evidence(source_key);
create index equipment_catalog_evidence_gym_idx on public.equipment_catalog_evidence(gym_id);
create index equipment_catalog_media_source_idx on public.equipment_catalog_media(source_key);

do $catalog_security$
declare table_name text;
begin
  foreach table_name in array array['equipment_catalog_types','equipment_catalog_manufacturers','equipment_catalog_sources','equipment_catalog_gyms','equipment_catalog_items','equipment_catalog_evidence','equipment_catalog_media','equipment_catalog_imports'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    execute format('grant select on table public.%I to anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on table public.%I to service_role',table_name);
    execute format('create policy catalog_read on public.%I for select to anon,authenticated using (true)',table_name);
  end loop;
end;
$catalog_security$;

create view public.equipment_catalog_search with (security_invoker=true) as
select i.id,i.slug,i.display_name,i.display_name_es,i.type_slug,t.name as type_name,t.name_es as type_name_es,
       t.category,t.primary_muscles,t.visual_cues,i.manufacturer_slug,m.name as manufacturer,
       i.model_identifier,i.series_name,i.identifier_specificity,i.aliases,i.resistance_types,
       i.catalog_status,i.visual_verification_status,i.is_identification_candidate,
       (select count(*)::integer from public.equipment_catalog_evidence e where e.catalog_item_id=i.id) as evidence_count,
       exists(select 1 from public.equipment_catalog_evidence e where e.catalog_item_id=i.id and e.current_installation_verified) as has_verified_installation,
       (select count(*)::integer from public.equipment_catalog_media im where im.catalog_item_id=i.id and im.usable_for_identification and im.review_status='approved') as approved_visual_reference_count
from public.equipment_catalog_items i
join public.equipment_catalog_types t on t.slug=i.type_slug
left join public.equipment_catalog_manufacturers m on m.slug=i.manufacturer_slug
where i.catalog_status <> 'retired';
revoke all on public.equipment_catalog_search from public,anon,authenticated;
grant select on public.equipment_catalog_search to anon,authenticated,service_role;

-- Ranking is text relevance, never a calibrated photo-identification confidence score.
create function public.search_equipment_catalog(
  p_query text default null,
  p_category text default null,
  p_manufacturer_slug text default null,
  p_type_slug text default null,
  p_muscle text default null,
  p_resistance text default null,
  p_gym_slug text default null,
  p_include_non_training boolean default false,
  p_limit integer default 25
) returns setof public.equipment_catalog_search
language sql stable security invoker
set search_path = ''
as $search$
  select v.*
  from public.equipment_catalog_search v
  join public.equipment_catalog_items i on i.id=v.id
  where (p_include_non_training or v.is_identification_candidate)
    and (p_category is null or v.category=p_category)
    and (p_manufacturer_slug is null or v.manufacturer_slug=p_manufacturer_slug)
    and (p_type_slug is null or v.type_slug=p_type_slug)
    and (p_muscle is null or v.primary_muscles @> array[p_muscle])
    and (p_resistance is null or v.resistance_types @> array[p_resistance])
    and (p_query is null or btrim(p_query)='' or
         i.search_document @@ websearch_to_tsquery('simple'::regconfig,p_query))
    and (p_gym_slug is null or exists (
      select 1 from public.equipment_catalog_evidence e
      join public.equipment_catalog_gyms g on g.id=e.gym_id
      where e.catalog_item_id=i.id and g.slug=p_gym_slug
        and e.quantity is distinct from 0 and e.availability_status<>'not_planned'
    ))
  order by case when p_query is null or btrim(p_query)='' then 0
                else ts_rank(i.search_document,websearch_to_tsquery('simple'::regconfig,p_query)) end desc,
           v.display_name,v.id
  limit greatest(1,least(coalesce(p_limit,25),100));
$search$;
revoke all on function public.search_equipment_catalog(text,text,text,text,text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.search_equipment_catalog(text,text,text,text,text,text,text,boolean,integer) to anon,authenticated,service_role;

comment on table public.equipment_catalog_evidence is 'Source assertions, not an authoritative current gym inventory. Null quantity is unknown; zero means not planned in that source.';
comment on table public.equipment_catalog_items is 'Potential identification candidates. Reported identifiers are not visually verified manufacturer model matches.';
comment on column public.equipment_catalog_types.primary_muscles is 'Curated generic type-level metadata; not a manufacturer specification or individualized exercise advice.';
comment on view public.equipment_catalog_search is 'Read-only catalog with source and image readiness. A text match must not be returned as 100% photo identification confidence.';
