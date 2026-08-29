# Travel Log · 여행 기록장

시/군/구 및 세계 행정구역 지도 위에 다녀온 곳과 계획을 기록하는 앱.
데이터는 **Supabase**에 저장되고, **이메일 매직링크**로 로그인합니다.

## 구조

| 파일 | 내용 |
|------|------|
| `index.html` | 마크업 (로그인 화면 + 앱) |
| `style.css` | 스타일 |
| `script.js` | 앱 로직 · Supabase 연동 |
| `data/*.json` | 지도 데이터 (KR_MAP / WORLD_MAP / 국경 외곽선) |
| `supabase/schema.sql` | `travel_entries` 테이블 + RLS 정책 |

## 데이터 저장 방식

`travel_entries` 테이블에 **사용자당 한 행**(`user_id`, `data` jsonb, `updated_at`)을 두고
기록 배열 전체를 `data` 에 넣습니다. 기존 `window.storage` 를 그대로 대체하는 구조라
저장/삭제 시 행 전체를 upsert 합니다.

## Supabase 설정 (최초 1회)

1. **테이블 / RLS** — 대시보드 > SQL Editor 에서 `supabase/schema.sql` 실행.
   (테이블이 이미 있으면 RLS 정책 부분만 실행하면 됩니다.)
2. **이메일 인증 켜기** — Authentication > Providers > Email 활성화 (기본 켜짐).
3. **리디렉트 URL 등록** — Authentication > URL Configuration
   - Site URL: 배포 주소 (예: `https://woong2-rice.github.io/Travel-log/`)
   - Redirect URLs 에 로컬/배포 주소 모두 추가
     (`http://localhost:3000`, `https://woong2-rice.github.io/Travel-log/`)

`script.js` 상단의 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 는 publishable(anon) 키라 클라이언트에 공개돼도 됩니다. 보안은 RLS로 걸립니다.

## 실행

`fetch` 를 쓰므로 로컬 서버가 필요합니다.

```
npx serve .
```
