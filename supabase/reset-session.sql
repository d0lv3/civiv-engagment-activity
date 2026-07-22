-- Wipe the board between two runs of the activity (e.g. two different classes).
-- Paste into the Supabase SQL Editor and run.

delete from public.words;

update public.settings
   set submissions_open = true,
       speaking_enabled = false
 where id = 1;
