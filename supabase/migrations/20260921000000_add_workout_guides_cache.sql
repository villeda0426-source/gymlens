-- Server-side cache for AI-generated exercise how-to guides so a repeated
-- workout search does not trigger another model call. Contains only public,
-- generic exercise content keyed by normalized query text; never user data.
create table if not exists public.workout_guides (
  cache_key text primary key,
  language text not null check (language in ('en', 'es')),
  query_normalized text not null,
  guide jsonb not null,
  hit_count int not null default 0,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz
);

alter table public.workout_guides enable row level security;

create policy "Service manages workout guides" on public.workout_guides
  for all to service_role using (true) with check (true);

create or replace function public.bump_workout_guide_hit(p_cache_key text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workout_guides
  set hit_count = hit_count + 1, last_hit_at = now()
  where cache_key = p_cache_key;
$$;

revoke all on function public.bump_workout_guide_hit(text) from public, anon, authenticated;
grant execute on function public.bump_workout_guide_hit(text) to service_role;
