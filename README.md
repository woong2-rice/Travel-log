# Travel Log · 여행 기록장

"다녀온 곳을 칠하고, 내 여행 인생을 결산한다."
시/군/구 · 세계 지도 위에 다녀온 곳을 칠하고, 연표와 결산으로 돌아보는 PWA.
빌드 도구 없는 바닐라 JS(ES 모듈) + CSS. 데이터는 **Supabase**, 로그인은 **이메일 8자리 코드(OTP)**.

화면: 지도(국내/해외) · 연표 · 분석 · 설정 — 하단 탭, 해시 라우팅(`#map` `#timeline` `#analytics` `#settings`).
로그인 전이거나 서버에 닿지 않으면 `js/data/sample.js`의 예시 기록으로 열린다.

## 구조
```
./
  index.html
  styles/
    tokens.css     색·글꼴·크기·간격 변수 (세이지 10단계 알파 포함) — 디자인 수정은 여기서
    base.css       리셋, 숫자 글꼴(.num), 버튼·입력·세그먼트 공용 컨트롤
    shell.css      하단 탭 바, 화면 머리, 태그, 접힘 섹션, 토스트, 지역 실루엣
    map.css        지도 화면 / sheet.css 바텀 시트·기록 폼
    timeline.css   연표 / analytics.css 결산 / settings.css 설정
  js/
    main.js                 시작 + 해시 라우터(#map #timeline #analytics #settings)
    lib/                    dom(h·아이콘·접힘 섹션) · format(날짜·금액) · panzoom · image · theme(칠하는 색 11가지)
    data/
      api.js                Supabase 연결 (기존 schema.sql 그대로)
      csvImport.js          CSV → 기록 (지역 이름/ID 찾기, 중복·오류 행 골라내기, 미리보기 후 저장)
      store.js              상태 + 저장/삭제 action + 모든 집계 selector
      maps.js · sample.js   지도 데이터 로딩(세계지도는 밀러 원통 도법(평면 지도)으로 다시 투영) / 예시 기록
    components/
      MapCanvas.js          칠하는 지도 (10단계, 계획=빗금, 가고 싶어요=점선)
      BottomSheet.js        반/전체 높이 시트 (끌기·Esc·포커스 복귀)
      RegionSheet.js        지역 요약 → 사진 → + 기록 추가 → 기록 목록(접힘)
      EntryForm.js          필수(상태·날짜) 먼저, 동행·비용·사진·메모는 접힘
      PhotoSlider.js · controls.js (세그먼트, 진행률 칩, 탭 바, 토스트, 지역 실루엣)
    views/   MapView · TimelineView · AnalyticsView · SettingsView
    charts/  charts.js (연도 막대, 비용 100% 막대+범례 표, 순위 목록, 시·도 진행 막대)
  data/*.json          지도 데이터 (KR_MAP / WORLD_MAP / 국경 외곽선)
  supabase/schema.sql  entries 테이블 + RLS + trip-photos Storage 정책
  supabase/inactive-accounts.sql  마지막 접속 기록(user_activity) + touch_activity()
  scripts/inactive-accounts.mjs   휴면 계정 정리 (GitHub Actions 가 매일 실행)
  manifest.json · sw.js · favicon.svg · icon/   PWA
```

## 규칙 (디자인 스킬에서)
- 색은 데이터에만: 칠하는 색(기본 세이지, 설정에서 변경)은 칠한 지역·올해 막대·진행 막대에만. 버튼은 근흑색.
- 테마는 `--accent-rgb` 하나를 바꾼다. 이전 버전에서 고른 테마(travel-app-theme)를 그대로 이어받는다.
- 숫자는 Newsreader + 고정폭 숫자(`.num`), 한글은 Pretendard.
- 합계는 항상 store.js selector에서 계산(화면마다 따로 세지 않음).
- 움직임은 사용자의 동작에 답할 때만(시트 열기, 접힘, 토스트).

## PWA

- `sw.js` 가 앱 셸(HTML/CSS/JS/아이콘/지도 JSON)을 캐시해 **오프라인에서도 지도가 열립니다**.
  폰트·`supabase-js` CDN 은 stale-while-revalidate, Supabase 인증·데이터 요청은 캐시하지 않고 항상 네트워크로 보냅니다.
- 설치: 크롬 주소창의 설치 아이콘 / iOS 사파리 "홈 화면에 추가".
- `sw.js` 를 고치면 `VERSION` 상수를 올려 캐시를 무효화하세요.
- HTTPS(또는 `localhost`)에서만 서비스워커가 동작합니다.

## 데이터 저장 방식

`entries` 테이블에 **기록 하나당 한 행**을 저장합니다. 기록 추가는 `insert`,
삭제는 `delete`, "다녀왔어요로 변경" 은 `update` 로 **그 행 하나만** 건드립니다.

사진은 base64 로 넣지 않고, 클라이언트에서 480px·JPEG 로 압축한 뒤
`trip-photos` Storage 버킷(공개)에 `<user_id>/<uuid>.jpg` 로 업로드하고,
`getPublicUrl` 로 얻은 공개 URL만 `photo_url` 컬럼에 저장합니다.
기록을 지우면 연결된 사진 파일도 Storage 에서 삭제합니다.

## Supabase 설정 (최초 1회)

1. **테이블 / RLS** — 대시보드 > SQL Editor 에서 `supabase/schema.sql` 실행.
   (테이블이 이미 있으면 RLS 정책 부분만 실행하면 됩니다.)
2. **Storage 버킷** — 대시보드 > Storage 에서 `trip-photos` 버킷을 **Public** 으로 생성한 뒤,
   `schema.sql` 하단의 `storage.objects` 정책을 실행.
3. **이메일 인증 켜기** — Authentication > Providers > Email 활성화 (기본 켜짐).
4. **이메일 템플릿에 코드 추가** — Authentication > Email Templates > "Magic Link"
   본문에 `{{ .Token }}` 를 넣어 8자리 코드가 메일에 표시되게 합니다.
   (코드 길이는 Authentication > Email 설정의 "Email OTP Length" 에서 조정)
   (기본 템플릿은 링크만 있어 코드가 보이지 않습니다.)
5. **Site URL 등록** — Authentication > URL Configuration
   - Site URL: 배포 주소 (예: `https://woong2-rice.github.io/Travel-log/`)
   - (코드 방식은 리디렉트를 쓰지 않지만 Site URL 은 설정해 두는 게 좋습니다.)

`script.js` 상단의 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 는 publishable(anon) 키라 클라이언트에 공개돼도 됩니다. 보안은 RLS로 걸립니다.

## 실행

`fetch` 를 쓰므로 로컬 서버가 필요합니다.

```
npx serve .
```

## CSV 가져오기 · 내보내기

- 설정 › 기록 내보내기: 모든 기록을 CSV로 받는다. 마지막 열 `지역ID` 덕분에 다시 올릴 때 이름이 같은 지역(중구 등)도 정확히 찾는다.
- 설정 › 기록 가져오기: CSV를 고르면 바로 저장하지 않고 '새로 추가 / 이미 있음 / 확인 필요'를 먼저 보여준다. 확인을 누르면 저장.
  - 열 이름: 시작일, 종료일, 구분(국내/해외), 상태, 지역, 동행, 세부장소, 메모, 항공료, 숙박비, 교통비, 식비, 기타비용, (선택) 지역ID
  - 날짜는 `2025-05-03`, `2025.5.3`, `2025/05/03` 모두 가능. 엑셀에서 저장한 CP949 파일도 읽는다.
  - 같은 이름이 여러 곳인 지역은 `부산 중구`처럼 시·도를 붙이거나 지역ID 열을 넣는다.
  - 같은 지역·상태·날짜의 기록이 이미 있으면 건너뛴다 (같은 파일을 두 번 올려도 두 번 생기지 않음).
  - 사진은 CSV에 담기지 않는다.

## 휴면 계정 정리

정책: **1년 동안 접속이 없으면 안내 메일 → 메일 보낸 날부터 6개월 안에 접속이 없으면 계정·기록·사진 삭제.**
앱을 한 번 열기만 해도 삭제 예정이 풀린다. (설정 › 계정에도 같은 안내가 보인다)

'접속'은 앱을 연 때(12시간에 한 번 `touch_activity()` 기록), 마지막 로그인, 가입일 중 가장 늦은 때.

### 처음 한 번 설정
1. **SQL** — Supabase 대시보드 › SQL Editor 에서 `supabase/inactive-accounts.sql` 실행.
2. **메일 계정** — 보내는 메일 주소의 SMTP 정보를 준비한다. 예) Gmail: 2단계 인증을 켠 뒤 '앱 비밀번호'를 만들어 쓴다.
3. **GitHub Secrets** — 저장소 Settings › Secrets and variables › Actions › New repository secret

   | 이름 | 값 |
   |------|----|
   | `SUPABASE_URL` | (keep-alive 용으로 이미 있음) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase › Project Settings › API › `service_role` 키 — **앱 코드에 절대 넣지 말 것** |
   | `SMTP_HOST` / `SMTP_PORT` | Gmail 이면 `smtp.gmail.com` / `465` |
   | `SMTP_USER` / `SMTP_PASS` | 보내는 메일 주소 / 앱 비밀번호 |
   | `MAIL_FROM` | `여행 기록장 <보내는주소@gmail.com>` |
   | `APP_URL` | `https://woong2-rice.github.io/Travel-log/` |

4. **연습 실행** — Actions › Inactive accounts › Run workflow (dry_run 체크된 채로). 로그에 누구에게 메일을 보내고 누구를 지울지만 나온다.
5. 이후로는 매일 새벽 3:41(한국시간)에 자동으로 실제 실행된다.

메모: 2023년 개인정보보호법 개정으로 '1년 미이용 시 파기' 의무(유효기간제)는 없어졌다. 이 정리는 서비스의 자체 정책이므로, 위 내용을 개인정보 처리방침에도 적어 두는 것이 좋다.
