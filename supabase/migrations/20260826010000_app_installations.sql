create table if not exists public.app_installations (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  platform text,
  app_version text,
  build_number integer,
  locale text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_app_installations_user
  on public.app_installations(user_id);
create index if not exists idx_app_installations_created
  on public.app_installations(created_at desc);

alter table public.app_installations enable row level security;
revoke all on table public.app_installations from public, anon, authenticated;
grant select, insert, update, delete on table public.app_installations to service_role;
