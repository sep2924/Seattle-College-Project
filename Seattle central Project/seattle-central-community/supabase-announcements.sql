-- Run once in Supabase > SQL Editor (Database mode), paste everything, then Run.
-- Creates the announcements table. You post announcements yourself in
-- Table Editor > announcements > Insert row. Students can only read them.
-- Safe to run more than once.

create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 80),
  message text not null default '' check (char_length(message) <= 300),
  link_text text not null default '' check (char_length(link_text) <= 30),
  link_url text not null default '' check (link_url = '' or link_url ~ '^(#|https?://)'),
  active boolean not null default true,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;

drop policy if exists "announcements read live" on public.announcements;
create policy "announcements read live" on public.announcements for select to anon, authenticated
  using (active and (ends_at is null or ends_at > now()));

notify pgrst, 'reload schema';
