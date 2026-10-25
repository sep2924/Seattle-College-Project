-- Each person can read only their own profile (nickname + email).
drop policy if exists "profiles are readable by signed-in students" on public.profiles;
drop policy if exists "profiles readable by owner" on public.profiles;
create policy "profiles readable by owner" on public.profiles for select to authenticated using (id = auth.uid());
notify pgrst, 'reload schema';
