-- Course work plans: one plan per user, plus anonymous comments on plans.
create table if not exists public.course_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  major text not null default '',
  other_majors text[] not null default '{}',
  dream_schools text[] not null default '{}',
  quarters jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_comments (
  id uuid primary key default gen_random_uuid(),
  plan_user_id uuid not null references public.course_plans(user_id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.course_plans enable row level security;
alter table public.plan_comments enable row level security;

grant select, insert, update, delete on public.course_plans to authenticated;
grant select, insert, delete on public.plan_comments to authenticated;

drop policy if exists "plans read" on public.course_plans;
drop policy if exists "plans insert own" on public.course_plans;
drop policy if exists "plans update own" on public.course_plans;
drop policy if exists "plans delete own" on public.course_plans;
create policy "plans read" on public.course_plans for select to authenticated using (true);
create policy "plans insert own" on public.course_plans for insert to authenticated with check (user_id = auth.uid());
create policy "plans update own" on public.course_plans for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plans delete own" on public.course_plans for delete to authenticated using (user_id = auth.uid());

drop policy if exists "plan comments read" on public.plan_comments;
drop policy if exists "plan comments insert own" on public.plan_comments;
drop policy if exists "plan comments delete own" on public.plan_comments;
create policy "plan comments read" on public.plan_comments for select to authenticated using (true);
create policy "plan comments insert own" on public.plan_comments for insert to authenticated with check (author_id = auth.uid());
create policy "plan comments delete own" on public.plan_comments for delete to authenticated using (author_id = auth.uid());
