-- 반복 루틴 템플릿(routine_templates) 및 날짜별 적용 기록(routine_applications) 마이그레이션
-- 매일 / 특정 요일 반복 루틴을 날짜별 실제 schedules 행으로 자동 실체화합니다.

create table if not exists public.routine_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'schedule',
  start_time text null,
  duration_min integer not null default 30,
  weekdays smallint[] not null default '{0,1,2,3,4,5,6}',
  memo text null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_templates_title_not_empty_check check (btrim(title) <> ''),
  constraint routine_templates_type_check check (type in ('schedule', 'task', 'reminder')),
  constraint routine_templates_start_time_check check (
    start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  constraint routine_templates_duration_check check (duration_min >= 0 and duration_min <= 1440),
  constraint routine_templates_weekdays_check check (
    cardinality(weekdays) > 0 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

drop trigger if exists routine_templates_touch_updated_at on public.routine_templates;
create trigger routine_templates_touch_updated_at
  before update on public.routine_templates
  for each row execute function public.touch_updated_at();

alter table public.routine_templates enable row level security;

revoke all on table public.routine_templates from anon;
grant select, insert, update, delete on table public.routine_templates to authenticated, service_role;

drop policy if exists "Authenticated users can manage routine_templates" on public.routine_templates;
create policy "Authenticated users can manage routine_templates"
  on public.routine_templates
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create table if not exists public.routine_applications (
  date date not null,
  template_id uuid not null references public.routine_templates(id) on delete cascade,
  applied_at timestamptz not null default now(),
  primary key (date, template_id)
);

alter table public.routine_applications enable row level security;

revoke all on table public.routine_applications from anon;
grant select, insert, update, delete on table public.routine_applications to authenticated, service_role;

drop policy if exists "Authenticated users can manage routine_applications" on public.routine_applications;
create policy "Authenticated users can manage routine_applications"
  on public.routine_applications
  for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

alter table public.schedules
  add column if not exists template_id uuid null references public.routine_templates(id) on delete set null;

create index if not exists schedules_template_id_idx
  on public.schedules (template_id)
  where template_id is not null;

-- 특정 날짜에 아직 적용되지 않은 요일 일치 루틴을 원자적으로 schedules에 채우는 RPC
drop function if exists public.apply_routines_for_date(date);

create or replace function public.apply_routines_for_date(
  target_date date,
  include_past boolean default false
)
returns integer
language plpgsql
security invoker
as $$
declare
  target_dow smallint;
  v_today_kst date;
  inserted_count integer := 0;
  tpl record;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_existing_id uuid;
  v_existing_tpl_id uuid;
begin
  if auth.uid() is null
     and current_user <> 'service_role'
     and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  target_dow := extract(dow from target_date)::smallint;
  v_today_kst := (now() at time zone 'Asia/Seoul')::date;

  for tpl in
    select id, title, type, start_time, duration_min, memo
    from public.routine_templates
    where enabled = true
      and target_dow = any(weekdays)
    order by start_time asc nulls last, created_at asc
  loop
    if tpl.start_time is not null then
      v_start_at := ((target_date::text || ' ' || tpl.start_time || ':00+09:00'))::timestamptz;
      if tpl.duration_min > 0 then
        v_end_at := v_start_at + make_interval(mins => tpl.duration_min);
      else
        v_end_at := null;
      end if;
    else
      v_start_at := null;
      v_end_at := null;
    end if;

    -- 작업 1: 동일 (date, title, start_at) 기존 행이 있으면 새로 만들지 않고 template_id 연결
    v_existing_id := null;
    v_existing_tpl_id := null;
    select s.id, s.template_id
      into v_existing_id, v_existing_tpl_id
    from public.schedules s
    where s.date = target_date
      and btrim(s.title) = btrim(tpl.title)
      and (
        (s.start_at is null and v_start_at is null)
        or s.start_at = v_start_at
      )
    order by
      (s.template_id = tpl.id) desc,
      (s.template_id is not null) desc,
      s.created_at asc
    limit 1;

    if v_existing_id is not null then
      if v_existing_tpl_id is null then
        update public.schedules
        set template_id = tpl.id
        where id = v_existing_id;
        inserted_count := inserted_count + 1;
      end if;

      insert into public.routine_applications (date, template_id)
      values (target_date, tpl.id)
      on conflict (date, template_id) do nothing;

      continue;
    end if;

    if exists (
      select 1
      from public.routine_applications ra
      where ra.date = target_date
        and ra.template_id = tpl.id
    ) then
      continue;
    end if;

    -- 작업 2: 오늘 날짜이고 이미 지난 시작 시각이면 오늘 행은 생성하지 않음 (include_past=true 예외)
    if not coalesce(include_past, false)
       and target_date = v_today_kst
       and v_start_at is not null
       and v_start_at < now() then
      continue;
    end if;

    insert into public.routine_applications (date, template_id)
    values (target_date, tpl.id)
    on conflict (date, template_id) do nothing;

    insert into public.schedules (
      date, start_at, end_at, title, type, done, done_at, source, memo, template_id
    )
    values (
      target_date, v_start_at, v_end_at, tpl.title, tpl.type, false, null, 'app', tpl.memo, tpl.id
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.apply_routines_for_date(date, boolean) from public, anon;
grant execute on function public.apply_routines_for_date(date, boolean) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'routine_templates'
  ) then
    alter publication supabase_realtime add table public.routine_templates;
  end if;
end $$;

notify pgrst, 'reload schema';
