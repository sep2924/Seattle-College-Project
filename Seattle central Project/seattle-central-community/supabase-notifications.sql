-- Run once in Supabase > SQL Editor (Database mode): paste everything, then Run.
-- Better notifications: which comment, what kind (comment / reply / like), and likes.
-- Run supabase-replies.sql first. Safe to run more than once.

-- ---------- 1. What each notification is about ----------
alter table public.notifications add column if not exists kind text not null default 'comment';
-- The comment it is about. If that comment is deleted, the notification goes too.
alter table public.notifications
  add column if not exists comment_id uuid references public.comments(id) on delete cascade;
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- 2. Comments and replies ----------
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  select p.author_id into post_author from public.posts p where p.id = new.post_id;
  if new.parent_id is not null then
    select c.author_id into parent_author from public.comments c where c.id = new.parent_id;
  end if;

  -- The post's author: "commented on your post", or "replied to your comment" if it answers their comment.
  if post_author is not null and post_author <> new.author_id then
    insert into public.notifications (user_id, post_id, comment_id, kind, text)
    values (post_author, new.post_id, new.id,
      case when parent_author = post_author then 'reply' else 'comment' end,
      case when parent_author = post_author then 'Someone replied to your comment' else 'Someone commented on your post' end);
  end if;

  -- The person whose comment got a reply (if they are not the replier or the post's author, already told above).
  if parent_author is not null and parent_author <> new.author_id and parent_author is distinct from post_author then
    insert into public.notifications (user_id, post_id, comment_id, kind, text)
    values (parent_author, new.post_id, new.id, 'reply', 'Someone replied to your comment');
  end if;
  return new;
end; $$;

drop trigger if exists on_comment_notify on public.comments;
create trigger on_comment_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------- 3. Likes (who liked is never stored in the notification) ----------
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, post_id, kind, text)
    select p.author_id, new.post_id, 'like', 'Someone liked your post'
    from public.posts p
    where p.id = new.post_id and p.author_id <> new.user_id;
    return new;
  else
    -- Unlike: take back one like notification for that post.
    delete from public.notifications
    where id = (select n.id from public.notifications n join public.posts p on p.id = n.post_id
                where n.post_id = old.post_id and n.kind = 'like' and n.user_id = p.author_id
                order by n.read, n.created_at desc limit 1);
    return old;
  end if;
end; $$;

drop trigger if exists on_like_notify on public.post_likes;
create trigger on_like_notify after insert or delete on public.post_likes
  for each row execute function public.notify_on_like();

-- ---------- 4. Comments on reviews ----------
create or replace function public.notify_on_review_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, review_id, kind, text)
  select r.author_id, new.review_id, 'review_comment', 'Someone commented on your review'
  from public.prof_reviews r
  where r.id = new.review_id and r.author_id <> new.author_id;
  return new;
end; $$;

-- ---------- 5. Older notifications get a kind too ----------
update public.notifications set kind = 'review_comment' where review_id is not null and kind = 'comment';
update public.notifications set kind = 'reply' where text ilike '%replied to your comment%' and kind = 'comment';

notify pgrst, 'reload schema';
