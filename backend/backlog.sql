-- 백로그(날짜 미정: 나중에 할 일) 지원을 위한 schedules.date nullable 마이그레이션
-- 기존 날짜별 일정/할 일은 그대로 유지되며, date IS NULL 행만 공통 백로그로 관리합니다.

alter table public.schedules
  alter column date drop not null;

alter table public.schedules
  drop constraint if exists schedules_backlog_time_check;

alter table public.schedules
  add constraint schedules_backlog_time_check
  check (date is not null or (start_at is null and end_at is null));

create index if not exists schedules_backlog_idx
  on public.schedules (created_at asc)
  where date is null;

notify pgrst, 'reload schema';
