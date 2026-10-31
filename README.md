# Family Health Hub

기준: 2026-10-31 · 초기 Supabase 전환 개발 브랜치 · 웹앱 v0.1.0 (기능 개발 중)

## 구성
- React + Vite 반응형 웹앱 (PC/모바일 브라우저)
- Supabase Auth, PostgreSQL, RLS
- 환자·진료 일정·진료 기록·복약 계획의 **기본 등록/목록**
- 다중 패밀리 생성 및 코드 가입 신청 (SQL RPC)
- 회원가입/로그인, 사용자별 기본 화면 설정

## 실행
1. 별도의 **Family Health Hub 전용 Supabase 프로젝트**를 준비합니다. 다른 서비스 운영 DB에 설치하지 마십시오.
2. `supabase/migrations/20261031000000_initial.sql`을 신규 프로젝트에 검토 후 적용합니다.
3. `.env.example`을 `.env.local`로 복사하고 Supabase URL과 **publishable key**를 입력합니다. service_role/secret key는 브라우저에 넣지 마십시오.
4. Node 20+에서 `npm install && npm run dev`; 배포 전 `npm run build`.
5. Supabase Auth에서 이메일 로그인·리디렉션 URL을 실제 배포 주소에 맞게 설정합니다.

## 현재 구현 범위 및 제한
- **초기 개발본**입니다. 1~8차 전체 145개 요구사항 구현 완료가 아닙니다.
- 패밀리 생성·가입 신청의 서버 함수는 제공하나 **관리자 승인 UI, 환자별 권한 배정 UI는 미완성**입니다. 승인 전 의료정보 접근은 차단합니다.
- 의료문서 OCR/AI, 사진 압축·첨부, 음성, PDF/ZIP, 푸시 알림, 복약 복용확인, 캘린더 월간 뷰, 수정 이력, 휴지통 자동 삭제, 모바일 네이티브 앱은 아직 미구현입니다.
- 현재 RLS는 초기 안전 기준으로 승인된 회원의 기본 데이터 접근을 허용합니다. 환자별 세부 접근을 적용하기 전에는 **실제 환자 정보를 입력하지 마십시오.**
- 브라우저 빌드/기기 테스트, Supabase 마이그레이션 실제 적용, 웹 호스팅 배포는 아직 검증되지 않았습니다.
- 기존 Firebase Hosting URL은 인수인계 문서에 확정되어 있지 않습니다. 기존 주소를 유지하려면 Firebase Hosting 사이트 ID 및 배포 설정 확인이 필요합니다.

## 이전 소스
원본은 `bangdw-hash/souvenir-app`의 `claude/family-health-hub-S34bb` 브랜치에 있었던 것으로 인수인계 문서에 기록되어 있습니다. 현재 저장소에는 `FAMILY_HEALTH_HUB_HANDOFF.md`가 있습니다. 이전 앱과 데이터의 자동 마이그레이션은 수행하지 않았습니다.

## 보안
패밀리 코드는 초대 신청용으로만 사용합니다. 관리자 승인 없는 사용자에게 의료정보를 보여주지 않습니다. 실제 의료정보 운영 전 환자별 RLS, Storage 정책, 감사 로그, 내보내기 접근 검증을 완료해야 합니다.
