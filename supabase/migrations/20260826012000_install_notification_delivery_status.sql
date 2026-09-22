alter table public.app_installations
  add column if not exists notification_sent_at timestamptz,
  add column if not exists notification_attempted_at timestamptz,
  add column if not exists notification_error text;
