-- Run once in Supabase > SQL Editor (Database mode): paste everything, then Run.
-- Adds replies to comments on posts. Safe to run more than once.

-- ---------- 1. A comment can point at the comment it replies to ----------
-- If the parent comment is deleted, its replies stay as normal comments.
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete set null;
create index if not exists comments_parent_id_idx on public.comments (parent_id);

-- ---------- 2. Rules: a reply must answer a top-level comment on the same post ----------
create or replace function public.check_comment_parent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id
       or not exists (select 1 from public.comments c
                      where c.id = new.parent_id and c.post_id = new.post_id and c.parent_id is null)
       or exists (select 1 from public.comments k where k.parent_id = new.id) then
      raise exception 'A reply must answer a comment on the same post';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_comment_parent_check on public.comments;
create trigger on_comment_parent_check
  before insert or update of parent_id, post_id on public.comments
  for each row execute function public.check_comment_parent();

-- ---------- 3. Notifications: also tell the person whose comment got a reply ----------
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The post's author (unless they wrote the comment themselves).
  insert into public.notifications (user_id, post_id, text)
  select p.author_id, new.post_id, new.nickname || ' commented on your post'
  from public.posts p
  where p.id = new.post_id
    and p.author_id <> new.author_id;

  -- The author of the comment being replied to (unless it is the replier or the post's author, who was just told).
  if new.parent_id is not null then
    insert into public.notifications (user_id, post_id, text)
    select c.author_id, new.post_id, 'Someone replied to your comment'
    from public.comments c join public.posts p on p.id = c.post_id
    where c.id = new.parent_id
      and c.author_id <> new.author_id
      and c.author_id <> p.author_id;
  end if;
  return new;
end; $$;

notify pgrst, 'reload schema';
