-- One like per person per post. Tap again to undo.
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;
grant select, insert, delete on public.post_likes to authenticated;

drop policy if exists "likes read own" on public.post_likes;
drop policy if exists "likes insert own" on public.post_likes;
drop policy if exists "likes delete own" on public.post_likes;
create policy "likes read own" on public.post_likes for select to authenticated using (user_id = auth.uid());
create policy "likes insert own" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes delete own" on public.post_likes for delete to authenticated using (user_id = auth.uid());

-- Keeps posts.likes equal to the real number of likes.
create or replace function public.sync_post_likes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set likes = (select count(*)::int from public.post_likes where post_id = new.post_id) where id = new.post_id;
    return new;
  else
    update public.posts set likes = (select count(*)::int from public.post_likes where post_id = old.post_id) where id = old.post_id;
    return old;
  end if;
end $$;

drop trigger if exists post_likes_sync on public.post_likes;
create trigger post_likes_sync after insert or delete on public.post_likes
for each row execute function public.sync_post_likes();

notify pgrst, 'reload schema';
