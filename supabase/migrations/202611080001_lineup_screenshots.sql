create table if not exists public.lineup_images (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lineup_images_lineup_position_idx
  on public.lineup_images (lineup_id, position);

alter table public.lineup_images enable row level security;

drop policy if exists "Site members can read lineup images" on public.lineup_images;
create policy "Site members can read lineup images" on public.lineup_images
  for select to authenticated using (public.can_access_lineup_site());

drop policy if exists "Admins manage lineup images" on public.lineup_images;
create policy "Admins manage lineup images" on public.lineup_images
  for all to authenticated using (public.is_lineup_admin()) with check (public.is_lineup_admin());

grant select, insert, update, delete on public.lineup_images to authenticated;
