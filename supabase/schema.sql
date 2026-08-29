-- 여행 기록장 · Supabase 스키마
-- entries: 기록 하나당 한 행. 추가/삭제/변경은 그 행만 insert/delete/update 합니다.
-- 사진은 trip-photos Storage 버킷(공개)에 올리고 공개 URL만 photo_url 에 저장합니다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

-- ── 테이블 ───────────────────────────────────────────────
create table if not exists public.entries (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  scope          text        not null,                       -- 'domestic' | 'world'
  region_id      text        not null,
  region_name    text        not null,
  status         text        not null default 'visited',      -- 'visited' | 'planned'
  start_date     date        not null,
  end_date       date,
  companion      text,
  place          text,
  note           text,
  cost_lodging   integer     default 0,
  cost_transport integer     default 0,
  cost_food      integer     default 0,
  cost_other     integer     default 0,
  photo_url      text,
  created_at     timestamptz default now()
);

create index if not exists entries_user_id_idx on public.entries (user_id);

-- ── 행 단위 보안(RLS): 로그인한 사용자는 자기 행만 ────────
alter table public.entries enable row level security;

drop policy if exists "entries own select" on public.entries;
drop policy if exists "entries own insert" on public.entries;
drop policy if exists "entries own update" on public.entries;
drop policy if exists "entries own delete" on public.entries;

create policy "entries own select" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries own insert" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries own update" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "entries own delete" on public.entries
  for delete using (auth.uid() = user_id);

-- ── Storage: trip-photos 버킷 ────────────────────────────
-- 대시보드 > Storage 에서 'trip-photos' 버킷을 Public 으로 만든 뒤 아래 정책을 실행.
-- 파일 경로는 `<user_id>/<uuid>.jpg` 형태라, 폴더 첫 조각이 곧 소유자입니다.

drop policy if exists "trip-photos public read"   on storage.objects;
drop policy if exists "trip-photos owner insert"  on storage.objects;
drop policy if exists "trip-photos owner delete"  on storage.objects;

create policy "trip-photos public read" on storage.objects
  for select using (bucket_id = 'trip-photos');

create policy "trip-photos owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "trip-photos owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── (선택) 예전 travel_entries 테이블은 더 이상 쓰지 않습니다 ──
-- drop table if exists public.travel_entries;
