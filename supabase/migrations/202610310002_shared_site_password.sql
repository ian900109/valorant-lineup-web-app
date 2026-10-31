-- Restrict the lineup site to the shared viewer account and approved admins.
-- Create the Auth user first, then add its UUID to public.site_access_users.

create table if not exists public.site_access_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_access_users enable row level security;
revoke all on table public.site_access_users from anon, authenticated;

create or replace function public.can_access_lineup_site()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  ) or exists (
    select 1 from public.site_access_users where user_id = (select auth.uid())
  );
$$;

revoke all on function public.can_access_lineup_site() from public, anon;
grant execute on function public.can_access_lineup_site() to authenticated;

drop policy if exists "Public can read maps" on public.maps;
drop policy if exists "Site members can read maps" on public.maps;
create policy "Site members can read maps" on public.maps
  for select to authenticated using (public.can_access_lineup_site());

drop policy if exists "Public can read agents" on public.agents;
drop policy if exists "Site members can read agents" on public.agents;
create policy "Site members can read agents" on public.agents
  for select to authenticated using (public.can_access_lineup_site());

drop policy if exists "Public can read abilities" on public.abilities;
drop policy if exists "Site members can read abilities" on public.abilities;
create policy "Site members can read abilities" on public.abilities
  for select to authenticated using (public.can_access_lineup_site());

drop policy if exists "Public can read lineups" on public.lineups;
drop policy if exists "Site members can read lineups" on public.lineups;
create policy "Site members can read lineups" on public.lineups
  for select to authenticated using (public.can_access_lineup_site());

-- Existing videos were stored as public URLs. Keep their object keys in the database
-- so the app can issue short-lived signed URLs after the bucket becomes private.
update public.lineups
set video_path = regexp_replace(video_path, '^https?://[^/]+/storage/v1/object/public/lineup-assets/', '')
where video_path ~ '^https?://[^/]+/storage/v1/object/public/lineup-assets/';

update storage.buckets set public = false where id = 'lineup-assets';

drop policy if exists "Anyone can read lineup assets" on storage.objects;
drop policy if exists "Site members can read lineup assets" on storage.objects;
create policy "Site members can read lineup assets" on storage.objects
  for select to authenticated
  using (bucket_id = 'lineup-assets' and public.can_access_lineup_site());
