-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  username text,
  language text default 'en',
  guest_uses int default 0,
  created_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Equipment master catalog
create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_es text,
  category text check (category in ('machine', 'free_weight', 'cable', 'accessory', 'cardio')),
  description text,
  description_es text,
  muscle_groups text[],
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tutorial_steps jsonb,
  safety_tips text[],
  safety_tips_es text[],
  image_url text,
  created_at timestamptz default now()
);

-- AI Identification results
create table equipment_identifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  equipment_id uuid references equipment(id),
  image_url text,
  raw_result jsonb,
  confidence float,
  created_at timestamptz default now()
);

-- Curated video links
create table equipment_videos (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id),
  youtube_id text not null unique,
  title text,
  thumbnail_url text,
  duration text,
  language text default 'en',
  curator_approved boolean default false,
  created_at timestamptz default now()
);

-- User saved equipment
create table saved_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  equipment_id uuid references equipment(id),
  saved_at timestamptz default now(),
  unique(user_id, equipment_id)
);

-- Feedback
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  identification_id uuid references equipment_identifications(id),
  rating int check (rating between 1 and 5),
  category text check (category in ('wrong_id', 'missing_info', 'video_quality', 'other')),
  message text,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table equipment_identifications enable row level security;
alter table saved_equipment enable row level security;
alter table feedback enable row level security;

-- Profiles: users can only read/update their own
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Equipment: public read
create policy "Equipment is publicly readable" on equipment for select using (true);

-- Identifications: users see own
create policy "Users see own identifications" on equipment_identifications for select using (auth.uid() = user_id);
create policy "Users insert own identifications" on equipment_identifications for insert with check (auth.uid() = user_id);

-- Saved: users manage own
create policy "Users manage own saved equipment" on saved_equipment for all using (auth.uid() = user_id);

-- Videos: public read
create policy "Videos are publicly readable" on equipment_videos for select using (true);

-- Feedback: users insert own
create policy "Users submit own feedback" on feedback for insert with check (auth.uid() = user_id or user_id is null);

-- Indexes
create index idx_equipment_category on equipment(category);
create index idx_identifications_user on equipment_identifications(user_id);
create index idx_saved_user on saved_equipment(user_id);
create index idx_videos_equipment on equipment_videos(equipment_id);
