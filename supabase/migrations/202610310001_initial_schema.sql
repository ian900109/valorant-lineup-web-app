create extension if not exists pgcrypto;

create table if not exists public.maps (
  id text primary key,
  name text not null,
  short_name text not null,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id text primary key,
  name text not null,
  role text not null,
  portrait_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.abilities (
  id text primary key,
  agent_id text not null references public.agents(id) on delete cascade,
  key text not null,
  name text not null,
  icon_path text,
  unique (agent_id, key)
);

create table if not exists public.lineups (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps(id),
  agent_id text not null references public.agents(id),
  ability_id text not null references public.abilities(id),
  title text not null,
  site text not null,
  start_label text not null,
  side text not null check (side in ('進攻', '防守')),
  start_x double precision not null check (start_x between 0 and 1),
  start_y double precision not null check (start_y between 0 and 1),
  impact_x double precision not null check (impact_x between 0 and 1),
  impact_y double precision not null check (impact_y between 0 and 1),
  instructions text not null default '',
  video_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_lineup_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

alter table public.maps enable row level security;
alter table public.agents enable row level security;
alter table public.abilities enable row level security;
alter table public.lineups enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "Public can read maps" on public.maps;
drop policy if exists "Admins manage maps" on public.maps;
create policy "Public can read maps" on public.maps for select using (true);
create policy "Admins manage maps" on public.maps for all to authenticated using (public.is_lineup_admin()) with check (public.is_lineup_admin());
drop policy if exists "Public can read agents" on public.agents;
drop policy if exists "Admins manage agents" on public.agents;
create policy "Public can read agents" on public.agents for select using (true);
create policy "Admins manage agents" on public.agents for all to authenticated using (public.is_lineup_admin()) with check (public.is_lineup_admin());
drop policy if exists "Public can read abilities" on public.abilities;
drop policy if exists "Admins manage abilities" on public.abilities;
create policy "Public can read abilities" on public.abilities for select using (true);
create policy "Admins manage abilities" on public.abilities for all to authenticated using (public.is_lineup_admin()) with check (public.is_lineup_admin());
drop policy if exists "Public can read lineups" on public.lineups;
drop policy if exists "Admins manage lineups" on public.lineups;
create policy "Public can read lineups" on public.lineups for select using (true);
create policy "Admins manage lineups" on public.lineups for all to authenticated using (public.is_lineup_admin()) with check (public.is_lineup_admin());
drop policy if exists "Admins can read admin list" on public.admin_users;
create policy "Admins can read admin list" on public.admin_users for select to authenticated using (public.is_lineup_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lineup-assets', 'lineup-assets', true, 52428800, array['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;

drop policy if exists "Anyone can read lineup assets" on storage.objects;
drop policy if exists "Admins upload lineup assets" on storage.objects;
drop policy if exists "Admins update lineup assets" on storage.objects;
drop policy if exists "Admins delete lineup assets" on storage.objects;
create policy "Anyone can read lineup assets" on storage.objects for select using (bucket_id = 'lineup-assets');
create policy "Admins upload lineup assets" on storage.objects for insert to authenticated with check (bucket_id = 'lineup-assets' and public.is_lineup_admin());
create policy "Admins update lineup assets" on storage.objects for update to authenticated using (bucket_id = 'lineup-assets' and public.is_lineup_admin()) with check (bucket_id = 'lineup-assets' and public.is_lineup_admin());
create policy "Admins delete lineup assets" on storage.objects for delete to authenticated using (bucket_id = 'lineup-assets' and public.is_lineup_admin());
