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
