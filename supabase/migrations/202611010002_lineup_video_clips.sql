alter table public.lineups
  add column if not exists video_mode text not null default 'full',
  add column if not exists video_start_seconds integer,
  add column if not exists video_end_seconds integer;

alter table public.lineups
  drop constraint if exists lineups_video_mode_check,
  add constraint lineups_video_mode_check check (video_mode in ('full', 'clip')),
  drop constraint if exists lineups_video_clip_times_check,
  add constraint lineups_video_clip_times_check check (
    (video_mode = 'full' and video_start_seconds is null and video_end_seconds is null)
    or (video_mode = 'clip' and video_start_seconds is not null and video_end_seconds is not null
      and video_start_seconds >= 0 and video_end_seconds > video_start_seconds)
  );
