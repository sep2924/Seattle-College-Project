-- Run once in Supabase > SQL Editor. Lets logged-out visitors see ONLY the
-- 5 latest post titles + first 90 characters. Nothing else becomes public.
create or replace function public.public_preview()
returns table (title text, body text)
language sql
security definer
set search_path = public
as $$
  select p.title, left(p.body, 90) as body
  from public.posts p
  where p.is_sample = false
  order by p.created_at desc
  limit 5;
$$;

revoke all on function public.public_preview() from public;
grant execute on function public.public_preview() to anon, authenticated;
