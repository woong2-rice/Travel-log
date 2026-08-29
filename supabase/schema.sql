-- 여행 기록장 · Supabase 스키마
-- travel_entries: 사용자당 한 행에 기록 배열 전체를 JSON 으로 저장 (window.storage 대체).
-- 이미 만들어 둔 테이블(user_id, data, updated_at)과 동일합니다.
-- 아직 없다면 Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create table if not exists public.travel_entries (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '[]'::jsonb,   -- 기록 배열 전체
  updated_at timestamptz not null default now()
);

-- 행 단위 보안: 로그인한 사용자는 자기 행만 읽고/쓰기
alter table public.travel_entries enable row level security;

drop policy if exists "own row read"   on public.travel_entries;
drop policy if exists "own row write"  on public.travel_entries;

create policy "own row read"  on public.travel_entries
  for select using (auth.uid() = user_id);

create policy "own row write" on public.travel_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
