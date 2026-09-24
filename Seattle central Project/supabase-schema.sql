-- ============================================================================
-- Seattle Central Community — Supabase schema + Row Level Security
-- ============================================================================
-- Run this once in your Supabase project's SQL editor (Database > SQL Editor)
-- AFTER you've created the project and turned on email auth.
--
-- This matches the table/column names js/store.js already calls — you should
-- not need to change store.js to use this schema. Once this has run, fill in
-- config.js's supabaseUrl and supabaseAnonKey and the app switches from
-- "local demo" mode to "live" mode automatically.
--
-- WHY THIS FILE MATTERS: store.js already checks things like
-- `post.authorId !== session.userId` before allowing an edit or delete — but
-- that check only runs in the browser. Once Supabase is wired in, anyone can
-- call the REST API directly with your public anon key and skip the app
-- entirely. The Row Level Security policies below are what actually enforce
-- "you can only edit your own posts" at the database level. Do not go live
-- without RLS enabled on every table.
--
-- ALSO REQUIRED (as of Supabase's April 2026 platform change, default for
-- all new projects since May 30, 2026): tables are no longer exposed to the
-- Data API (what supabase-js/store.js calls) just by existing. Each table
-- below has an explicit `grant` statement for this reason — without it,
-- every query fails with "permission denied for table X" (Postgres 42501)
-- even though RLS is set up correctly. Grants and RLS are two separate
-- layers; grants decide if a role can touch the table at all, RLS decides
-- which rows. This file already includes the grants you need — you don't
-- need to check any "automatically expose new tables" box during project
-- creation, and it's fine either way if you leave it unchecked (the new
-- default).
-- ============================================================================

-- ---------- PROFILES ----------
-- One row per signed-in user. id matches auth.users.id exactly.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Anonymous Beaver',
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Required as of Supabase's April 2026 change: new tables are no longer
-- exposed to the Data API (what supabase-js calls) by default. Without this
-- grant, every query below would fail with "permission denied for table
-- profiles" (Postgres error 42501) regardless of the RLS policies — grants
-- and RLS are two separate layers, and grants are checked first.
grant select, insert, update on public.profiles to authenticated;

-- Any signed-in student can see any nickname (needed to render "who posted this").
create policy "profiles are readable by signed-in students"
  on public.profiles for select
  to authenticated
  using (true);

-- You can only create/update your own profile row.
create policy "users manage their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---------- POSTS ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  board text not null,
  title text not null,
  body text not null,
  likes integer not null default 0,
  edited boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

grant select, insert, update, delete on public.posts to authenticated;

create policy "posts are readable by signed-in students"
  on public.posts for select
  to authenticated
  using (true);

create policy "students create posts as themselves"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

-- This is the enforcement that matters: only the author can edit or delete.
-- Sample/demo posts (is_sample = true) can also be deleted by anyone signed
-- in, mirroring store.js's current client-side deletePost() behavior.
create policy "authors edit their own posts"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors or anyone delete sample posts"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid() or is_sample = true);


-- ---------- COMMENTS ----------
-- store.js queries this as posts.select('*, comments(*)') — a related table
-- via post_id, with author_id/nickname/body/created_at read back into
-- {authorId, name, text, ts}.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null,
  body text not null,
  edited boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

grant select, insert, update, delete on public.comments to authenticated;

create policy "comments are readable by signed-in students"
  on public.comments for select
  to authenticated
  using (true);

create policy "students create comments as themselves"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "authors edit their own comments"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors delete their own comments"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());


-- ---------- TRANSFER STORIES ----------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  from_school text not null,
  to_school text not null,
  major text not null,
  gpa text,
  body text not null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

grant select, insert, update, delete on public.stories to authenticated;

create policy "stories are readable by signed-in students"
  on public.stories for select
  to authenticated
  using (true);

create policy "students create stories as themselves"
  on public.stories for insert
  to authenticated
  with check (author_id = auth.uid());

-- NOTE: store.js doesn't have updateStory/deleteStory methods yet (only
-- createStory). These policies are ready for when that UI is added.
create policy "authors edit their own stories"
  on public.stories for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors delete their own stories"
  on public.stories for delete
  to authenticated
  using (author_id = auth.uid());


-- ---------- PROFESSOR REVIEWS ----------
create table if not exists public.prof_reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  prof_name text not null,
  course text not null,
  quarter text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.prof_reviews enable row level security;

grant select, insert, update, delete on public.prof_reviews to authenticated;

create policy "reviews are readable by signed-in students"
  on public.prof_reviews for select
  to authenticated
  using (true);

create policy "students create reviews as themselves"
  on public.prof_reviews for insert
  to authenticated
  with check (author_id = auth.uid());

-- NOTE: store.js doesn't have updateReview/deleteReview methods yet either.
-- Same situation as stories above — policies ready, client UI not built yet.
create policy "authors edit their own reviews"
  on public.prof_reviews for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "authors delete their own reviews"
  on public.prof_reviews for delete
  to authenticated
  using (author_id = auth.uid());


-- ---------- REPORTS ----------
-- Write-only from the client on purpose: there is no moderator role concept
-- yet, so nobody (including the reporter) can read reports back through the
-- app. Review them via the Supabase dashboard's table editor for now. Add a
-- "select" policy scoped to a moderator role once you build that out.
--
-- NOTE: store.js's report() function currently only writes to local storage
-- (this.db.reports.push(...)) — it does not yet call supabase.from('reports')
-- in live mode. You'll need to add that call to store.js's report() function
-- for reports to actually reach this table.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('post', 'story', 'review', 'comment')),
  target_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- insert only — matches the write-only design below (no select/update/delete
-- policy exists, so granting more than insert would have no effect anyway).
grant insert on public.reports to authenticated;

create policy "students file reports as themselves"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Intentionally no select/update/delete policy yet — see note above.


-- ---------- NOTIFICATIONS ----------
-- NOTE: like reports, store.js's notifications()/markNotificationsRead()
-- currently only read/write local storage. Wiring live mode to read from
-- this table is a small follow-up in store.js, not included here.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- select + update only — the client (js/store.js) only ever reads its own
-- notifications and marks them read. No insert grant: the trigger further
-- down creates notification rows itself, running as SECURITY DEFINER, which
-- executes as the function's owner and is unaffected by these grants (grants
-- only gate the Data API path that supabase-js uses, not internal trigger
-- execution) — see the "Who is affected" note in Supabase's April 2026
-- changelog on this. If a student's own client could insert into this table,
-- they could spam fake notifications to other students.
grant select, update on public.notifications to authenticated;

-- You can only ever read/update your own notifications.
create policy "users read their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Deliberately NO client-side insert policy for notifications. If any
-- signed-in user could insert a row with an arbitrary user_id, they could
-- spam fake notifications to other students. Instead, a trigger creates the
-- notification automatically (as the database, not as the commenter) whenever
-- someone comments on a post that isn't their own:
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, post_id, text)
  select p.author_id, new.post_id, new.nickname || ' commented on your post'
  from public.posts p
  where p.id = new.post_id
    and p.author_id <> new.author_id;
  return new;
end;
$$;

drop trigger if exists on_comment_notify on public.comments;
create trigger on_comment_notify
  after insert on public.comments
  for each row execute function public.notify_on_comment();


-- ---------- HELPFUL INDEXES ----------
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists stories_created_at_idx on public.stories (created_at desc);
create index if not exists reviews_created_at_idx on public.prof_reviews (created_at desc);
create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);
