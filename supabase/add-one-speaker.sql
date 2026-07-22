-- Run this if you set the database up before the "one speaker at a time" rule
-- existed. If you are running schema.sql fresh, it is already in there and you
-- do not need this file.
--
-- Paste into the Supabase SQL Editor and run.

-- Drop any hands that are already up, otherwise the new index cannot be built.
update public.words set is_speaking = false where is_speaking;

create unique index if not exists words_one_speaker
  on public.words ((is_speaking))
  where is_speaking;
