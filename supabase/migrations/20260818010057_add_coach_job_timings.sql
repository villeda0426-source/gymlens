alter table public.coach_trainer_jobs
  add column if not exists timings jsonb not null default '{}'::jsonb;

comment on column public.coach_trainer_jobs.timings is
  'Privacy-safe stage durations and retry counts for Coach jobs; never stores prompts, plans, or user notes.';
