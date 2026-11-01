# Family Health Hub deployment handoff — 2026-10-31

## Supabase (created)
- Organization: bangdw-hash
- Project: Family Health Hub
- Region: ap-northeast-2 (Seoul)
- Project ID: ynstvmzhtzokvllrnjtn
- URL: https://ynstvmzhtzokvllrnjtn.supabase.co
- Migration applied: `supabase/migrations/20261031000000_initial.sql`
- Verification: 9 public tables with RLS enabled, 0 patient records.
- Other projects including `asea-business-card` were NOT modified or deleted.

## GitHub Pages (NOT DEPLOYED)
- Repository: bangdw-hash/family-health-hub
- Development branch: dev/family-health-hub-supabase-v1
- Workflow: .github/workflows/pages.yml (manual deploy job)
- Intended URL: https://bangdw-hash.github.io/family-health-hub/
- GitHub Actions variables to configure:
  - FHH_SUPABASE_URL = https://ynstvmzhtzokvllrnjtn.supabase.co
  - FHH_SUPABASE_PUBLISHABLE_KEY = active Supabase publishable key (from API Keys dashboard)
- Configure Settings > Pages > Build and deployment > GitHub Actions.
- Workflow should only be run after application security and end-to-end testing. Current app is an incomplete development preview.

## Auth
- Set Supabase Auth site URL and allowed redirect URLs to the actual Pages origin and path.
- Confirm email sign-up / verification policy and test user login.
- Never expose service_role or secret keys in web or mobile clients.

## Mobile
- Current React web UI is responsive; there is no Android APK or iOS binary yet.
- Mobile apps must use the same Supabase project URL and publishable key, with the same auth identity and patient RLS rules.
- Push notification and background medication reminders require separate platform validation.

## Safety gate
- Do not enter real medical records until patient permission administration, audit logging, export controls, storage policies, and account-to-patient linking have been implemented and tested.
- GitHub repository is PUBLIC; do not commit private medical data or secrets.

## 2026-11-01 업데이트 (v0.3.0)
- 추가 마이그레이션 `supabase/migrations/20261101000000_collaboration.sql` **미적용**. 적용 전에는 앱이 "서버 업데이트가 필요합니다" 화면을 표시합니다.
- 적용 후 확인: 테이블 `med_intakes`, `attachments`, `user_consents` 생성, Storage 버킷 `fhh-attachments`(비공개) 및 정책 3개, Realtime 게시 테이블, 함수 권한(anon 실행 불가).
- 로컬 검증: `npm test`(단위 + RLS), `npm run build`.

## 2026-11-01 적용 결과 (collaboration)
- `20261101000000_collaboration.sql` 적용 완료(방시원님이 SQL Editor에서 실행). 테이블 3개, RPC 14개, 트리거 12개, 비공개 버킷 `fhh-attachments` + 정책 3개, 실시간 10개 테이블, anon 권한 0건 확인. 기존 환자 2건 보존.
- 남은 경고: Auth "유출 비밀번호 보호"가 꺼져 있음(대시보드 Authentication 설정에서 켜야 함).

## 2026-11-02 v0.4.0 (캘린더·카카오톡) — 적용 필요
1. SQL Editor에서 `supabase/migrations/20261102000000_calendar_feeds.sql` 실행.
2. 엣지 함수 `calendar-feed` 배포(Verify JWT 끔). 배포 후 `https://ynstvmzhtzokvllrnjtn.supabase.co/functions/v1/calendar-feed/<64자리 토큰>.ics` 형식으로 응답해야 함(잘못된 토큰은 404).
3. 카카오 개발자 콘솔 → 앱 생성 → 플랫폼(Web)에 `https://bangdw-hash.github.io` 등록 → JavaScript 키를 GitHub Actions 변수 `FHH_KAKAO_JS_KEY`에 등록(콘솔 메뉴 이름은 변경될 수 있어 확인 필요).
