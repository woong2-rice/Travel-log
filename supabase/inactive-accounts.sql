-- 여행 기록장 · 휴면 계정 정리용 테이블
-- 1년 동안 접속이 없으면 안내 메일 → 메일을 보낸 날부터 6개월 뒤에도 접속이 없으면 계정 삭제.
-- 실제 메일 발송·삭제는 GitHub Actions(.github/workflows/inactive-accounts.yml)가 매일 한 번 한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 한 번 실행하세요.

-- ── 마지막 접속 · 안내 메일 기록 ─────────────────────────
create table if not exists public.user_activity (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),   -- 앱을 마지막으로 연 때 (12시간에 한 번만 갱신)
  warned_at    timestamptz                           -- 삭제 안내 메일을 보낸 때 (다시 접속하면 null 로 풀림)
);

-- 이 테이블은 앱에서 직접 읽거나 쓰지 않는다 (아래 함수로만). 정책 없음 = 일반 사용자 접근 불가.
alter table public.user_activity enable row level security;

-- ── 앱이 부르는 함수: '나 지금 접속했어요' ────────────────
-- 로그인한 본인 행만 갱신하고, 안내 메일을 받았던 계정이면 삭제 예정을 푼다.
create or replace function public.touch_activity()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_activity (user_id, last_seen_at, warned_at)
  values (auth.uid(), now(), null)
  on conflict (user_id) do update set last_seen_at = now(), warned_at = null;
$$;

revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;
