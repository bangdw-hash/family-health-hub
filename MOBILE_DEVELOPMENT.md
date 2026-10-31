# Family Health Hub — Android / iOS development

Status: **source scaffolding only**, version 0.2.0. No APK/IPA has been verified or distributed.

## Shared architecture
- Web: React/Vite (GitHub Pages target)
- Native Android/iOS: Capacitor 7 WebView shell, using the **same** React UI and Supabase Auth/PostgreSQL/RLS.
- App ID: `com.bangdw.familyhealthhub` (must remain unchanged for future updates).
- Server: `https://ynstvmzhtzokvllrnjtn.supabase.co` (Seoul).
- Authentication: Supabase email/password. User's data isolation enforced by DB RLS, not merely UI.

## Build locally
Requirements: Node.js 20+, npm, Java 21 + Android SDK (Android); macOS + Xcode + CocoaPods (iOS).
1. Copy `.env.example` to `.env.local`, replace the placeholder publishable key. Never use a secret or service-role key.
2. `npm install`
3. `npm run build`
4. `npx cap add android` or `npx cap add ios` (only the first time)
5. `npx cap sync android` / `npx cap sync ios`
6. Android: `cd android && ./gradlew assembleDebug`
7. iOS: open `ios/App/App.xcworkspace` in Xcode; select your signing team to build on a device.

Native folders are generated in CI and locally. Do not run `cap add` twice on the same generated folder.

## GitHub Actions
- `.github/workflows/android-debug.yml`: on-demand / PR Android debug APK artifact. Debug build is not production signed.
- `.github/workflows/ios-validate.yml`: on-demand unsigned iOS Simulator compilation only; does not generate installable signed IPA.
- Configure repository **Actions variables** `FHH_SUPABASE_URL` and `FHH_SUPABASE_PUBLISHABLE_KEY` with the dedicated project's public values.
- Workflow run status and native device behavior must be checked before distributing artifacts.

## Mobile security and permissions
- Do not embed service-role keys, database passwords or patient records in app source.
- Native medication notifications must be scheduled only for the patient's own account/device, after patient identity is verified and permissions granted. Current code **does not schedule** medication reminders.
- Current auth uses the Supabase JS default persisted session; production-grade secure token storage, account switching and cache cleanup are pending.
- Android notification runtime permissions and iOS notification entitlements need device verification.
- Medical images/files and export must be private, with RLS/Storage policies and audit trails before real patient data.

## Remaining feature backlog
1. Patient account linking and patient-by-patient grant/revoke UI + authorization tests.
2. Complete medical records, documents, OCR, compression and encrypted/private Storage.
3. Appointments calendar and reminder management.
4. Medication plan schedule and patient-only notifications; missed-dose tracking.
5. Native camera/gallery/file integrations and PDF/ZIP export.
6. Accessibility/button scaling, secure offline behavior and device QA.
7. Android stable signed release with preserved signing key; iOS developer account and signed TestFlight distribution.

No deployment to app stores has been performed.
