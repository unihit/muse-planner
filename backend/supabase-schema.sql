-- Muse Elastic Planner - Supabase Schema
-- Supabase SQL Editor에 그대로 복사해 실행하세요.

create table if not exists schedules (
  id text primary key,
  date date not null,
  title text not null,
  start_min integer not null,
  end_min integer not null,
  category text not null default 'focus',
  done boolean not null default false,
  pinned boolean not null default false,
  note text default '',
  url text default '',
  source text default 'supabase',
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedules_date on schedules (date);

create table if not exists staged_tasks (
  id text primary key,
  date date not null,
  title text not null,
  duration_min integer not null default 30,
  category text not null default 'focus',
  done boolean not null default false,
  status text not null default 'todo', -- 'todo' | 'deferred'
  note text default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_staged_tasks_date on staged_tasks (date);

create table if not exists youtube_items (
  id text primary key,
  date date not null,
  title text not null,
  url text default '',
  duration_min integer not null default 30,
  done boolean not null default false,
  added_by text default 'Muse',
  updated_at timestamptz not null default now()
);

create index if not exists idx_youtube_items_date on youtube_items (date);

create table if not exists daily_memos (
  date date primary key,
  memo text default '',
  updated_at timestamptz not null default now()
);

-- 개인용 정적 앱(GitHub Pages) 테스트용 RLS 정책
-- 운영 환경에서는 Supabase Auth 또는 Edge Function/토큰 검증을 추가하세요.
alter table schedules enable row level security;
alter table staged_tasks enable row level security;
alter table youtube_items enable row level security;
alter table daily_memos enable row level security;

create policy "Allow anon all schedules" on schedules for all using (true) with check (true);
create policy "Allow anon all staged_tasks" on staged_tasks for all using (true) with check (true);
create policy "Allow anon all youtube_items" on youtube_items for all using (true) with check (true);
create policy "Allow anon all daily_memos" on daily_memos for all using (true) with check (true);
