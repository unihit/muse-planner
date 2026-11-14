-- 일정(schedules) 테이블 및 트리거 마이그레이션
-- 기존 가계부 테이블과 데이터는 건드리지 않습니다.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_at timestamptz null,
  end_at timestamptz null,
  title text not null,
  type text not null default 'schedule',
  done boolean not null default false,
  done_at timestamptz null,
  source text not null default 'app',
  memo text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_title_not_empty_check check (btrim(title) <> ''),
  constraint schedules_type_check check (type in ('schedule', 'task', 'reminder')),
  constraint schedules_source_check check (source in ('muse', 'app')),
  constraint schedules_time_order_check check (
    end_at is null or (start_at is not null and end_at >= start_at)
  )
);

create index if not exists schedules_date_start_at_idx
  on public.schedules (date, start_at asc nulls last);

create index if not exists schedules_start_at_idx
  on public.schedules (start_at);

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute function public.touch_updated_at();

alter table public.schedules enable row level security;

revoke all on table public.schedules from anon;
grant select, insert, update, delete on table public.schedules to authenticated, service_role;

drop policy if exists "Authenticated users can manage schedules" on public.schedules;
create policy "Authenticated users can manage schedules"
  on public.schedules
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedules'
  ) then
    alter publication supabase_realtime add table public.schedules;
  end if;
end $$;

notify pgrst, 'reload schema';
