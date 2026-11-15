-- D-Day 카운트다운(planner_ddays) 테이블 마이그레이션
-- Muse Edge Function(planner-api) 및 웹/모바일 플래너가 동일한 D-Day 목록을 공유·실시간 동기화합니다.

create table if not exists public.planner_ddays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target_date date not null,
  icon text not null default '📌',
  memo text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_ddays_title_not_empty_check check (btrim(title) <> '')
);

create index if not exists planner_ddays_target_date_idx
  on public.planner_ddays (target_date asc, created_at asc);

drop trigger if exists planner_ddays_touch_updated_at on public.planner_ddays;
create trigger planner_ddays_touch_updated_at
  before update on public.planner_ddays
  for each row execute function public.touch_updated_at();

alter table public.planner_ddays enable row level security;

revoke all on table public.planner_ddays from anon;
grant select, insert, update, delete on table public.planner_ddays to authenticated, service_role;

drop policy if exists "Authenticated users can manage planner_ddays" on public.planner_ddays;
create policy "Authenticated users can manage planner_ddays"
  on public.planner_ddays
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

do $$
begin
  alter publication supabase_realtime add table public.planner_ddays;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
