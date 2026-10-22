-- Per-user scan history for equipment_identifications.
--
-- The table holds two kinds of rows: one global aggregate per equipment
-- (user_id null — scan_count across everyone) and one row per user per
-- equipment (what the Search tab's "Recent" list reads). Production carries
-- a plain UNIQUE (equipment_id) from an older design, so the global row
-- claims each equipment_id and every per-user insert fails with 23505:
-- nobody's scans ever reached their history (0 per-user rows as of
-- 2026-10-21). Replace it with one unique index per kind of row.
--
-- Safe on existing data: every current row is a global aggregate and
-- equipment_id is already unique among them. Idempotent.

alter table public.equipment_identifications
  drop constraint if exists equipment_identifications_equipment_id_key;

create unique index if not exists equipment_identifications_global_key
  on public.equipment_identifications (equipment_id)
  where user_id is null;

create unique index if not exists equipment_identifications_user_key
  on public.equipment_identifications (user_id, equipment_id)
  where user_id is not null;
