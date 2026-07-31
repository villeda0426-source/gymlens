alter table public.coach_trainer_jobs
  add column if not exists idempotency_key text;

alter table public.coach_trainer_jobs
  drop constraint if exists coach_trainer_jobs_idempotency_key_length;

alter table public.coach_trainer_jobs
  add constraint coach_trainer_jobs_idempotency_key_length
  check (
    idempotency_key is null
    or char_length(idempotency_key) between 16 and 200
  );

create unique index if not exists coach_trainer_jobs_user_idempotency_key
  on public.coach_trainer_jobs(user_id, idempotency_key)
  where idempotency_key is not null;

drop policy if exists "Users view own coach trainer jobs"
  on public.coach_trainer_jobs;

create policy "Users view own coach trainer jobs"
  on public.coach_trainer_jobs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.coach_trainer_jobs from anon;
grant select on table public.coach_trainer_jobs to authenticated;
grant select, insert, update, delete on table public.coach_trainer_jobs to service_role;
