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
- v0.3.0: 알림은 사용자가 설정 > 알림에서 직접 켠 기기에서, 사용자가 선택한 환자에 대해서만 로컬로 예약합니다(`src/lib/reminders.js`). 푸시 서버는 사용하지 않으며 앞으로 7일분을 예약하므로 앱을 가끔 열어 갱신해야 합니다. 기본값은 잠금 화면에 건강정보를 표시하지 않습니다. Android 13+ 알림 권한(POST_NOTIFICATIONS)과 iOS 알림 동작은 실기기 검증이 필요합니다.
- 내보내기 파일은 모바일에서 공유 시트(Web Share)로 저장합니다. 실기기 확인 필요.
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
