-- Lets a signed-in person delete their own account.
-- Every table points to the account with "on delete cascade",
-- so all of their posts, comments, likes, stories, reviews,
-- Course work plan, plan comments, timer/schedule data,
-- notifications and reports are deleted with it.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
notify pgrst, 'reload schema';
