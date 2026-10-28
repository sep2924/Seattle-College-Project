-- Run once in Supabase > SQL Editor (paste everything, then Run).
-- Adds: comments on reviews, review tags, one review per professor + class,
-- and class requirements that students add and confirm with votes.
-- Safe to run more than once.

-- ---------- 1. Review tags + edited flag ----------
alter table public.prof_reviews add column if not exists tags text[] not null default '{}';
alter table public.prof_reviews add column if not exists edited boolean not null default false;

-- ---------- 2. One review per person for the same professor + class ----------
-- (If you already have duplicates, this step is skipped and the app still blocks new ones.)
do $$
begin
  create unique index if not exists prof_reviews_one_per_class on public.prof_reviews (
    author_id, lower(trim(prof_name)),
    upper(regexp_replace(split_part(course, ' · ', 1), '[^A-Za-z0-9]', '', 'g'))
  );
exception when unique_violation then
  raise notice 'Skipped the one-review rule because duplicate reviews already exist.';
end $$;

-- ---------- 3. Comments on reviews ----------
create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.prof_reviews(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  helpful boolean not null default false,
  edited boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists review_comments_review_idx on public.review_comments (review_id, created_at);

alter table public.review_comments enable row level security;
revoke all on public.review_comments from anon, authenticated;
grant select, insert, delete on public.review_comments to authenticated;
-- Commenters can only change the text. "Helpful" is set by the review's author (function below).
grant update (body, edited) on public.review_comments to authenticated;

drop policy if exists "review comments read" on public.review_comments;
drop policy if exists "review comments insert own" on public.review_comments;
drop policy if exists "review comments update own" on public.review_comments;
drop policy if exists "review comments delete own" on public.review_comments;
create policy "review comments read" on public.review_comments for select to authenticated using (true);
create policy "review comments insert own" on public.review_comments for insert to authenticated
  with check (author_id = auth.uid() and helpful = false);
create policy "review comments update own" on public.review_comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "review comments delete own" on public.review_comments for delete to authenticated
  using (author_id = auth.uid());

-- The review's author marks one comment as the helpful answer.
create or replace function public.mark_review_comment_helpful(comment_id uuid, on_off boolean)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid; cauthor uuid;
begin
  select c.review_id, c.author_id into rid, cauthor
  from public.review_comments c join public.prof_reviews r on r.id = c.review_id
  where c.id = comment_id and r.author_id = auth.uid();
  if rid is null then raise exception 'Only the review author can do this'; end if;
  if on_off and cauthor = auth.uid() then raise exception 'You cannot mark your own comment'; end if;
  update public.review_comments set helpful = false where review_id = rid and helpful;
  if on_off then update public.review_comments set helpful = true where id = comment_id; end if;
end; $$;
revoke all on function public.mark_review_comment_helpful(uuid, boolean) from public, anon;
grant execute on function public.mark_review_comment_helpful(uuid, boolean) to authenticated;

-- Notify the review's author when someone comments.
alter table public.notifications add column if not exists review_id uuid references public.prof_reviews(id) on delete cascade;

create or replace function public.notify_on_review_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, review_id, text)
  select r.author_id, new.review_id, 'Someone commented on your review'
  from public.prof_reviews r
  where r.id = new.review_id and r.author_id <> new.author_id;
  return new;
end; $$;

drop trigger if exists on_review_comment_notify on public.review_comments;
create trigger on_review_comment_notify after insert on public.review_comments
  for each row execute function public.notify_on_review_comment();

-- ---------- 4. Class requirements (take FROM before TO), added by students ----------
create table if not exists public.course_links (
  id uuid primary key default gen_random_uuid(),
  from_key text not null check (from_key ~ '^[A-Z0-9]{3,14}$'),
  to_key text not null check (to_key ~ '^[A-Z0-9]{3,14}$'),
  from_code text not null check (char_length(from_code) between 2 and 20),
  to_code text not null check (char_length(to_code) between 2 and 20),
  note text not null default '' check (char_length(note) <= 120),
  source_url text check (source_url is null or (char_length(source_url) <= 300 and source_url ~* '^https?://')),
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_key <> to_key),
  unique (from_key, to_key)
);

create table if not exists public.course_link_votes (
  link_id uuid not null references public.course_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (link_id, user_id)
);

alter table public.course_links enable row level security;
alter table public.course_link_votes enable row level security;
revoke all on public.course_links from anon, authenticated;
revoke all on public.course_link_votes from anon, authenticated;
grant select, insert, delete on public.course_links to authenticated;
grant select, insert, update, delete on public.course_link_votes to authenticated;

drop policy if exists "links read" on public.course_links;
drop policy if exists "links insert own" on public.course_links;
drop policy if exists "links delete own" on public.course_links;
create policy "links read" on public.course_links for select to authenticated using (true);
create policy "links insert own" on public.course_links for insert to authenticated with check (author_id = auth.uid());
create policy "links delete own" on public.course_links for delete to authenticated using (author_id = auth.uid());

drop policy if exists "link votes read" on public.course_link_votes;
drop policy if exists "link votes insert own" on public.course_link_votes;
drop policy if exists "link votes update own" on public.course_link_votes;
drop policy if exists "link votes delete own" on public.course_link_votes;
create policy "link votes read" on public.course_link_votes for select to authenticated using (true);
-- One vote per person (primary key), and nobody votes on their own suggestion.
create policy "link votes insert own" on public.course_link_votes for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.course_links l where l.id = link_id and l.author_id = auth.uid()));
create policy "link votes update own" on public.course_link_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "link votes delete own" on public.course_link_votes for delete to authenticated
  using (user_id = auth.uid());

-- ---------- 5. Reports can point at review comments and class requirements ----------
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check
  check (kind in ('post', 'story', 'review', 'comment', 'review_comment', 'course_link'));

-- ---------- 6. What guests (not logged in) can read ----------
drop function if exists public.public_reviews();
create function public.public_reviews()
returns table (id uuid, prof_name text, course text, quarter text, rating smallint, body text, tags text[], edited boolean, created_at timestamptz)
language sql security definer set search_path = public as $$
  select r.id, r.prof_name, r.course, r.quarter, r.rating, r.body, r.tags, r.edited, r.created_at
  from public.prof_reviews r
  where r.is_sample = false
  order by r.created_at desc
  limit 10;
$$;

-- Comments on those same 10 reviews, already labeled Author / Anonymous 1, 2... (no ids of people).
create or replace function public.public_review_comments()
returns table (id uuid, review_id uuid, body text, created_at timestamptz, who text, helpful boolean, edited boolean)
language sql security definer set search_path = public as $$
  with pr as (
    select r.id, r.author_id from public.prof_reviews r
    where r.is_sample = false order by r.created_at desc limit 10
  ),
  firsts as (
    select c.review_id, c.author_id, min(c.created_at) as f
    from public.review_comments c join pr on pr.id = c.review_id
    where c.author_id <> pr.author_id
    group by c.review_id, c.author_id
  ),
  ranked as (
    select review_id, author_id, row_number() over (partition by review_id order by f) as n from firsts
  )
  select c.id, c.review_id, c.body, c.created_at,
    case when c.author_id = pr.author_id then 'Author' else 'Anonymous ' || rk.n end,
    c.helpful, c.edited
  from public.review_comments c
  join pr on pr.id = c.review_id
  left join ranked rk on rk.review_id = c.review_id and rk.author_id = c.author_id
  order by c.created_at, c.id;
$$;

-- Class requirements with vote counts (no ids of people).
create or replace function public.public_course_links()
returns table (id uuid, from_key text, to_key text, from_code text, to_code text, note text, source_url text, up bigint, down bigint, created_at timestamptz)
language sql security definer set search_path = public as $$
  select l.id, l.from_key, l.to_key, l.from_code, l.to_code, l.note, l.source_url,
    (select count(*) from public.course_link_votes v where v.link_id = l.id and v.vote = 1),
    (select count(*) from public.course_link_votes v where v.link_id = l.id and v.vote = -1),
    l.created_at
  from public.course_links l;
$$;

revoke all on function public.public_reviews() from public;
revoke all on function public.public_review_comments() from public;
revoke all on function public.public_course_links() from public;
grant execute on function public.public_reviews() to anon, authenticated;
grant execute on function public.public_review_comments() to anon, authenticated;
grant execute on function public.public_course_links() to anon, authenticated;

notify pgrst, 'reload schema';
