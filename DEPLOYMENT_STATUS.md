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
