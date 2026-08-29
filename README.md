# Travel Log · 여행 기록장

시/군/구 및 세계 행정구역 지도 위에 다녀온 곳과 계획을 기록하는 앱.
데이터는 **Supabase**에 저장되고, **이메일 8자리 코드(OTP)**로 로그인합니다.

## 구조

| 파일 | 내용 |
|------|------|
| `index.html` | 마크업 (로그인 화면 + 앱) |
| `style.css` | 스타일 |
| `script.js` | 앱 로직 · Supabase 연동 |
| `data/*.json` | 지도 데이터 (KR_MAP / WORLD_MAP / 국경 외곽선) |
| `supabase/schema.sql` | `entries` 테이블 + RLS + `trip-photos` Storage 정책 |
| `manifest.json` · `sw.js` | PWA 매니페스트 · 서비스워커 |
| `favicon.*` · `icon-*.png` · `apple-touch-icon.png` | 앱 아이콘 |

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
