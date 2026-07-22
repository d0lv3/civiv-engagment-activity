-- =====================================================================
--  Voices of Our Community — Supabase schema
--  Paste this whole file into: Supabase dashboard -> SQL Editor -> Run
--  It is safe to run more than once.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- One row per student submission.
create table if not exists public.words (
  id             uuid primary key default gen_random_uuid(),
  text           text        not null,
  participant_id text        not null,
  is_speaking    boolean     not null default false,
  created_at     timestamptz not null default now(),
  constraint words_text_len check (char_length(btrim(text)) between 1 and 32),
  constraint words_single_word check (btrim(text) !~ '\s')
);

-- A participant may only hold one word at a time.
create unique index if not exists words_participant_key
  on public.words (participant_id);

-- Helps the admin list and the cloud order words consistently.
create index if not exists words_created_at_idx
  on public.words (created_at);

-- Single-row table holding the live session state that the admin controls.
create table if not exists public.settings (
  id                smallint primary key default 1,
  submissions_open  boolean     not null default true,
  speaking_enabled  boolean     not null default false,
  updated_at        timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1)
  on conflict (id) do nothing;

-- Keep updated_at honest.
create or replace function public.touch_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_settings();

-- When the admin turns speaking off, every raised hand drops.
create or replace function public.clear_hands_when_speaking_disabled()
returns trigger
language plpgsql
as $$
begin
  if old.speaking_enabled and not new.speaking_enabled then
    update public.words set is_speaking = false where is_speaking;
  end if;
  return new;
end;
$$;

drop trigger if exists settings_clear_hands on public.settings;
create trigger settings_clear_hands
  after update on public.settings
  for each row execute function public.clear_hands_when_speaking_disabled();

-- ---------------------------------------------------------------------
-- 2. Row Level Security
--
--    anon          = the students on their phones
--    authenticated = you, signed in on /admin
-- ---------------------------------------------------------------------

alter table public.words    enable row level security;
alter table public.settings enable row level security;

-- Everyone may read: the projector, the students and the admin.
drop policy if exists words_select_all on public.words;
create policy words_select_all
  on public.words for select
  to anon, authenticated
  using (true);

drop policy if exists settings_select_all on public.settings;
create policy settings_select_all
  on public.settings for select
  to anon, authenticated
  using (true);

-- Students may submit a word only while submissions are open.
drop policy if exists words_insert_anon on public.words;
create policy words_insert_anon
  on public.words for insert
  to anon
  with check (
    (select s.submissions_open from public.settings s where s.id = 1)
  );

-- Students may raise / lower a hand only while the admin has enabled speaking.
-- The column grant below makes sure this can ONLY ever touch is_speaking,
-- so a student can never rewrite somebody else's word.
drop policy if exists words_update_anon on public.words;
create policy words_update_anon
  on public.words for update
  to anon
  using (
    (select s.speaking_enabled from public.settings s where s.id = 1)
  )
  with check (
    (select s.speaking_enabled from public.settings s where s.id = 1)
  );

-- The admin can do anything to the words.
drop policy if exists words_admin_all on public.words;
create policy words_admin_all
  on public.words for all
  to authenticated
  using (true)
  with check (true);

-- Only the admin can flip the session switches.
drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update
  on public.settings for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------
-- 3. Column-level privileges
--    Narrow the anon UPDATE right down to the single is_speaking column.
-- ---------------------------------------------------------------------

revoke update on public.words from anon;
grant  update (is_speaking) on public.words to anon;

revoke insert, update, delete on public.settings from anon;

-- ---------------------------------------------------------------------
-- 4. Realtime — makes new words appear on the projector instantly
-- ---------------------------------------------------------------------

alter table public.words    replica identity full;
alter table public.settings replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.words;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.settings;
  exception when duplicate_object then null;
  end;
end
$$;

-- =====================================================================
--  Done. Now create your admin login:
--  Dashboard -> Authentication -> Users -> Add user
--    * pick any email + password
--    * tick "Auto Confirm User"
--  That email/password is what you type on /admin.
-- =====================================================================
