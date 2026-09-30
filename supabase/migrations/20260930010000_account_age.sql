-- Account age capture, asked at sign-in (not at registration or as a
-- separate post-login gate — see app/(auth)/birth-year.tsx and the
-- extended AuthGate in app/_layout.tsx). One code path covers both new and
-- existing accounts: everyone's profile starts with age_band = 'unknown',
-- and AuthGate routes anyone in that state to the birth-year screen right
-- after they authenticate, before they ever reach the tab navigator.
--
-- Additive only; apply through the project's normal Supabase migration
-- workflow.

alter table public.profiles
  add column if not exists birth_year smallint,
  add column if not exists age_band text not null default 'unknown';

alter table public.profiles
  drop constraint if exists profiles_birth_year_check,
  add constraint profiles_birth_year_check check (
    birth_year is null or birth_year between 1900 and extract(year from now())::int
  ),
  drop constraint if exists profiles_age_band_check,
  add constraint profiles_age_band_check check (age_band in ('unknown', 'under_18', 'adult_18_59', 'over_59'));

-- Pure and immutable so it gives the same answer wherever it's called from.
create or replace function public.compute_age_band(p_birth_year smallint)
returns text
language sql
immutable
as $$
  select case
    when p_birth_year is null then 'unknown'
    when (extract(year from now())::int - p_birth_year) < 18 then 'under_18'
    when (extract(year from now())::int - p_birth_year) > 59 then 'over_59'
    else 'adult_18_59'
  end;
$$;

revoke all on function public.compute_age_band(smallint) from public, anon;
grant execute on function public.compute_age_band(smallint) to authenticated, service_role;
