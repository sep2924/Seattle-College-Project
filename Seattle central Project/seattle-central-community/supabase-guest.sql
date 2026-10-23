-- Run once in Supabase > SQL Editor.
-- Lets logged-out visitors read ONLY the 10 newest posts, stories and reviews.
-- No author ids, no comments. Your tables themselves stay private.

create or replace function public.public_posts()
returns table (id uuid, board text, title text, body text, likes integer, created_at timestamptz, comment_count bigint)
language sql security definer set search_path = public as $$
  select p.id, p.board, p.title, p.body, p.likes, p.created_at,
         (select count(*) from public.comments c where c.post_id = p.id)
  from public.posts p
  where p.is_sample = false
  order by p.created_at desc
  limit 10;
$$;

create or replace function public.public_stories()
returns table (id uuid, from_school text, to_school text, major text, gpa text, body text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select s.id, s.from_school, s.to_school, s.major, s.gpa, s.body, s.created_at
  from public.stories s
  where s.is_sample = false
  order by s.created_at desc
  limit 10;
$$;

create or replace function public.public_reviews()
returns table (id uuid, prof_name text, course text, quarter text, rating smallint, body text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select r.id, r.prof_name, r.course, r.quarter, r.rating, r.body, r.created_at
  from public.prof_reviews r
  where r.is_sample = false
  order by r.created_at desc
  limit 10;
$$;

revoke all on function public.public_posts() from public;
revoke all on function public.public_stories() from public;
revoke all on function public.public_reviews() from public;
grant execute on function public.public_posts() to anon, authenticated;
grant execute on function public.public_stories() to anon, authenticated;
grant execute on function public.public_reviews() to anon, authenticated;
