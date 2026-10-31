# 가족 건강 허브(Family Health Hub) 개발 인계 문서

- 작성 기준일: 2026-10-31
- 용도: ChatGPT에 전달하여 **Supabase 연동 앱**으로 재구축하기 위한 인계 자료
- 원본 출처: Claude Code 세션 "Family Health Hub design" (`session_014skZp8nA8C43Lmze38F4UE`, 2026-06-04 ~ 06-08), 저장소 `bangdw-hash/souvenir-app` 브랜치 `claude/family-health-hub-S34bb`
- 현재 구현 DB: **Firebase(Firestore + Storage)**. Supabase는 아직 적용되지 않았으며, 본 문서의 9장이 이전 설계안입니다.

---

## 0. 복원 범위와 한계 (먼저 확인)

원본 저장소에 직접 접근하지 못하여 세션 기록(열람 가능한 구간)에서 소스를 복원했습니다.

| 구분 | 상태 |
|---|---|
| 복원된 소스 (14개) | `App.jsx`, `Navbar.jsx`, `GroupDashboard`, `CalendarPage`, `PatientPage`, `AddPage`, `MedicationsPage`, `SettingsPage`, `MedicationCard`, `RecordForm`, `RecordDetail`, `ImageParseModal`, `deploy.yml`, `README.md` → **부록 A에 전문 수록** |
| 파일명만 확인 (소스 미복원) | `LandingPage`, `RecordsPage`, `DeletedAppointmentsPage`, `Layout`, `Modal`, `StatusBadge`, `LoadingSpinner`, `ShareSheet`, `MonthlyCalendar`, `PatientCard`, `PatientForm`, `MedicalReport`, `AppointmentCard`, `AppointmentForm`, `MedicationForm`, `RecordCard`, `main.jsx` |
| 존재하나 미확인 | `src/services/*`(appointments, groups, medications, patients, records, storage), `src/hooks/*`, `src/utils/*`(dateUtils, appointmentUtils, smsParser, notifications), `src/index.css`, `tailwind.config.js`, Firestore/Storage 보안 규칙, `firebase.js` |
| 추정 표시 | 데이터 모델은 소스에서 읽은 필드 사용 흔적 기준의 **추정**이며, 실제 Firestore 문서와 대조가 필요합니다. |

**조치 권고:** ChatGPT에 넘기기 전, 위 "미확인" 파일을 원본 저장소에서 추가로 붙여 넣으시면 정확도가 올라갑니다. 원본 저장소(`souvenir-app`)를 이 세션에 추가 연결해 주시면 전체를 다시 추출해 본 문서를 보완하겠습니다.

> 보안 유의: 원본 `deploy.yml`에 Firebase 웹 설정값이 하드코딩되어 있었습니다. 본 문서에서는 모두 `<REDACTED>`로 치환했습니다. 또한 `VITE_ANTHROPIC_API_KEY`를 브라우저 번들에 넣는 구조는 키 노출 위험이 있어 9장에서 Edge Function으로 대체하도록 권고합니다.

---

## 1. 서비스 개요

가족 구성원(부모님 등)의 **병원 진료 일정·진료 기록·복약·첨부 서류**를 한 그룹에서 함께 관리하는 모바일 중심 웹앱입니다.

핵심 특징
1. **로그인 없는 그룹 링크 방식**: `/group/:slug` 주소를 아는 가족이 같은 데이터를 공유합니다.
2. **진료 일정 → 진료 기록 → 다음 예약 자동 생성**의 연결 흐름.
3. **병원 예약 화면 사진 / 문자(SMS) 붙여넣기**로 일정 자동 등록 (사진은 Claude Vision, 문자는 정규식 파서).
4. **복약 알림**(브라우저 Notification), **의료진 제출용 리포트** 생성·공유.
5. 일정 **소프트 삭제 및 복구**.

기능 현황 (세션 내 점검 결과, 2026-06-08 기준)

| 기능 | 상태 |
|---|---|
| 그룹 생성/참여(슬러그) | 완료 |
| 가족 구성원(환자) CRUD | 완료 |
| 진료 일정 CRUD + 소프트 삭제/복구 | 완료 |
| 월간 캘린더 + 탭별 목록(오늘/예정/삭제) | 완료 |
| 진료완료 처리 → 기록 작성 유도 | 완료 |
| 진료 기록 추가·**수정**·삭제 + 첨부파일 | 완료 (수정은 06-08 추가) |
| 다음 예약일 → 일정 자동 생성 | 완료 |
| 복약 관리 + 알림 | 완료 |
| 환자 페이지 **복약 탭** | 완료 (06-08 추가) |
| 일정·기록 날짜 역순 정렬 | 완료 (06-08 추가) |
| 의료진 리포트 생성/공유 | 완료 |
| 사진 OCR(Claude Vision), 문자 파싱 | 완료 |
| 알림 실제 발송(서버 푸시) | **미구현** (브라우저 로컬 알림만) |
| 검색, 건강 지표 대시보드 | 미구현 |

---

## 2. 기술 스택

| 영역 | 내용 |
|---|---|
| 프레임워크 | React 19.2, Vite 8, react-router-dom 7 (BrowserRouter) |
| 스타일 | Tailwind CSS 3.4 + PostCSS + autoprefixer |
| 아이콘 | lucide-react |
| 날짜 | date-fns 4 |
| DB/파일 | Firebase 12 (Firestore, Storage) — **Supabase로 대체 예정** |
| 이미지 호스팅 | Cloudinary (환경변수 존재, 사용처 미확인) |
| AI | Anthropic Messages API, 모델 `claude-haiku-4-5-20251001` (사진 파싱) |
| OCR 이력 | 초기 Tesseract.js → Claude Vision으로 교체(회전·촬영 사진 인식 실패 때문). `tesseract.js` 의존성은 package.json에 남아 있어 제거 대상 |
| 배포 | GitHub Actions → Firebase Hosting (`deploy.yml` 부록 참조) |
| 빌드 환경변수 | `VITE_FIREBASE_*`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_ANTHROPIC_API_KEY` |

---

## 3. 폴더 트리

```
family-health-hub/
├─ .github/workflows/deploy.yml
├─ package.json / vite.config.js / tailwind.config.js(미확인) / postcss.config.js
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx                         # 라우팅
│  ├─ index.css                       # (미확인) Tailwind 지시문, .safe-area-pb 등 추정
│  ├─ pages/
│  │  ├─ LandingPage.jsx              # 그룹 생성/입장
│  │  ├─ GroupDashboard.jsx           # 홈: 이번 주 일정, 가족 카드, 활동 로그
│  │  ├─ CalendarPage.jsx             # 월간 캘린더 + 탭 목록 + 상태 변경
│  │  ├─ DeletedAppointmentsPage.jsx  # 삭제된 일정 복구
│  │  ├─ PatientPage.jsx              # 환자 상세(탭: 일정/기록/복약), 리포트
│  │  ├─ AddPage.jsx                  # 추가 허브(5개 액션)
│  │  ├─ MedicationsPage.jsx          # 복약 목록/알림
│  │  ├─ RecordsPage.jsx              # 기록·첨부파일 탭
│  │  └─ SettingsPage.jsx             # 공유 링크, 구성원, 알림 권한
│  ├─ components/
│  │  ├─ layout/        Layout.jsx, Navbar.jsx
│  │  ├─ common/        Modal, StatusBadge, LoadingSpinner, ShareSheet, ImageParseModal
│  │  ├─ calendar/      MonthlyCalendar
│  │  ├─ patients/      PatientCard, PatientForm, MedicalReport
│  │  ├─ appointments/  AppointmentCard, AppointmentForm
│  │  ├─ medications/   MedicationCard, MedicationForm
│  │  └─ records/       RecordCard, RecordDetail, RecordForm
│  ├─ hooks/            useGroup, usePatients, useAppointments, useRecords, useMedications   (미확인)
│  ├─ services/         groups, patients, appointments, records, medications, storage         (미확인)
│  └─ utils/            dateUtils, appointmentUtils, smsParser, notifications                 (미확인)
```

---

## 4. 라우팅

| 경로 | 페이지 |
|---|---|
| `/` | LandingPage |
| `/group/:slug` | GroupDashboard (홈) |
| `/group/:slug/calendar` | CalendarPage |
| `/group/:slug/deleted-appointments` | DeletedAppointmentsPage |
| `/group/:slug/patient/:patientId` | PatientPage |
| `/group/:slug/add` | AddPage |
| `/group/:slug/medications` | MedicationsPage |
| `/group/:slug/records` | RecordsPage |
| `/group/:slug/settings` | SettingsPage |

하단 고정 탭바(Navbar): 홈 · 캘린더 · **추가(중앙 강조 원형 버튼)** · 복약 · 기록. 설정은 홈 우상단 톱니 버튼.

---

## 5. 화면별 UX 흐름

1. **홈(GroupDashboard)**: 오늘 기준 7일 내 일정(취소 제외, 날짜 오름차순, 최대 5건) → 가족 카드 목록(환자별 일정 수) → 활동 로그 → 환자 추가 모달(`PatientForm`).
2. **캘린더**: 월간 달력 + 탭(오늘의 일정 / 예정 / 삭제됨). 일정 상태 전환: `예약완료`("예약 중" 라벨) ↔ `진료완료`. 진료완료 시 **진료 기록 작성 모달을 유도**. 당일 일정은 표시상태 `진료 당일`(파생값).
3. **추가(AddPage)** 5개 액션: 가족 추가, 일정 추가, 기록 추가, **문자 붙여넣기(ClipboardPaste)**, **사진으로 추가(ImageIcon)**.
4. **사진 등록(ImageParseModal)**: 이미지 선택 → Claude Vision으로 예약 JSON 배열 추출 → 항목별 체크/편집(환자 지정) → `addAppointment` 일괄 저장 → `logActivity`.
5. **진료 기록(RecordForm)**: 환자 선택 → (선택) 연결 일정 → 진료일, 진단, 메모, 처방 목록(추가/삭제 칩), 다음 방문일·시간, 첨부(카메라/갤러리/파일). 저장 시 첨부 업로드(진행률) → 다음 방문일이 새로 입력/변경되면 `예약완료` 일정 자동 생성(`note`: "진료 기록에서 자동 등록된 예약").
6. **환자 페이지**: 탭 3종(진료 일정 / 진료 기록 / 복약), 날짜 역순 정렬, 기록 상세 모달(수정·삭제 버튼 나란히), 의료진 리포트(MedicalReport) 열기.
7. **복약**: 오늘 요일 + `active` 필터로 오늘 복용 목록, 카드의 벨 토글로 알림 on/off, 알림 권한 요청 버튼.
8. **설정**: 공유 링크 `origin/group/{slug}` 복사/ShareSheet, 구성원 추가(이름·전화·역할 기본 `기타`)/삭제, 브라우저 알림 권한 상태(unsupported/granted/denied/default).

---

## 6. UI / CSS 규칙 (Tailwind 유틸리티 기준 — 소스 집계)

레이아웃
- 모바일 우선, 본문 `max-w-lg mx-auto`, 하단 탭바 `fixed bottom-0 ... border-t border-gray-200 z-40 safe-area-pb`.
- 탭 아이템 `min-w-[52px]`, 라벨 `text-[10px] font-medium`, 아이콘 22px(활성 strokeWidth 2.5 / 비활성 1.8).
- 중앙 "추가" 버튼: `w-10 h-10 rounded-full bg-blue-500 shadow-md -mt-4`, 아이콘 흰색 20px.

색상 토큰 (사용 빈도 순)
| 용도 | 클래스 |
|---|---|
| 기본 텍스트 | `text-gray-900`(제목) / `text-gray-700` / `text-gray-600` / `text-gray-500` / `text-gray-400`(보조·비활성) |
| 경계선 | `border-gray-200`, `border-gray-100` |
| 배경 | 페이지·입력 `bg-gray-50`, 칩 `bg-gray-100`, 카드 흰색 |
| **주 강조색(파랑)** | `bg-blue-500`, `text-blue-500/600`, 포커스 `ring-blue-300`, 연한 배경 `bg-blue-50/100` |
| **복약 전용(보라)** | `bg-purple-50`, `border-purple-100`, 활성 `bg-purple-500 text-white`, 아이콘 `text-purple-500` |
| 위험/삭제(빨강) | `text-red-400/500`, `bg-red-50/100` |
| 성공(초록) | `text-green-600`, `bg-green-50/100` |
| 보조(앰버/핑크) | `bg-amber-50`, `text-pink-500` |
| 환자 구분색 | `patient.color` 필드(개별 지정) |

컴포넌트 패턴
- 카드: 흰 배경, `rounded-xl`계열, 얇은 `border-gray-100`. 비활성 복약 카드는 `opacity-60`.
- 버튼: 주 버튼 `px-4 py-2 bg-blue-500 text-white rounded-xl text-sm`, 보조 버튼 `bg-gray-100 rounded-xl`, 삭제 버튼 `text-red-500` + `hover:bg-red-50 active:bg-red-100 transition-colors`.
- 입력: `ring-blue-300` 포커스 링, 회색 테두리.
- 모달: 공용 `Modal` 컴포넌트(제목 + 닫기 X).
- 로딩: `LoadingSpinner text="..."`. 오류 화면은 중앙 정렬 + "홈으로" 버튼.
- 상태 배지: `StatusBadge` (예약완료/진료완료/취소/진료 당일 — 색 매핑 소스 미복원).
- 이펙트: `transition-colors`, 호버/액티브 색 전환, 업로드 진행률 표시, 로딩 스피너. 별도 애니메이션 라이브러리 없음.
- 아이콘(lucide-react): Home, Calendar, CalendarDays, Plus, FileText, Pill, Bell, BellOff, BellRing, Settings, User, Users, UserPlus, Activity, Camera, Image, ImageIcon, Folder, Paperclip, Hospital, Phone, Share2, Info, Edit2, Trash2, ChevronLeft, ChevronRight, Clock, Clock4, X, Loader, Sparkles, AlertCircle, CheckCircle, CheckSquare, Square, ClipboardPaste.
- 언어: UI 문구 전부 한국어.

---

## 7. 데이터 모델 (Firestore, 소스 필드 사용 흔적 기반 **추정**)

서비스 함수가 모두 `groupId`를 첫 인자로 받으므로 `groups/{groupId}` 하위 컬렉션 구조로 추정됩니다(**확인 필요**).

```
groups/{groupId}                { slug, name, createdAt }
 ├─ members/{id}                { name, phone, role('기타' 기본) }
 ├─ activity/{id}               { type('record' 등), message, createdAt }
 ├─ patients/{id}               { name, birth, color, role, bloodType, insuranceNum,
 │                                conditions, allergies, hospitals[], primaryDoctor }
 ├─ appointments/{id}           { patientId, hospital, dept, doctor, date('YYYY-MM-DD'),
 │                                time('HH:MM'), status, note, visitDate?, 삭제표식(필드명 미확인) }
 ├─ records/{id}                { patientId, apptId, visitDate, diagnosis, memo,
 │                                prescriptions[], nextVisitDate, nextVisitTime,
 │                                attachments[{name,size,path,url}], createdAt }
 └─ medications/{id}            { patientId, name, dosage, instructions, times[],
                                  daysOfWeek[], active }
```

Enum / 파생값
- `appointments.status`: `예약완료`, `진료완료`, `취소` (화면 라벨 `예약 중`/`진료완료`). 표시용 파생 상태 `진료 당일`(`getDisplayStatus`, 날짜 비교).
- 일정 삭제는 **소프트 삭제**(`softDeleteAppointment` / `restoreAppointment`).
- `daysOfWeek`: 요일 키 포맷은 미복원(`todayKey`와 비교). 확인 필요.
- 날짜는 문자열(`YYYY-MM-DD`)로 저장·정렬(`localeCompare`).

서비스 함수 시그니처 (임포트로 확인된 목록)
- groups: `logActivity(groupId,{type,message})`, `addMember(groupId,form)`, `deleteMember(groupId,id)`
- appointments: `addAppointment(groupId,data)`, `updateAppointment(groupId,id,patch)`, `softDeleteAppointment`, `restoreAppointment`
- records: `addRecord(groupId,form)→docRef`, `updateRecord(groupId,id,patch)`, `deleteRecord`
- medications: `updateMedication(groupId,id,patch)`, `deleteMedication`, (add 추정)
- patients: `deletePatient`, (add/update 추정)
- storage: `uploadRecordFile(groupId,recordId,file,onProgress)→{name,size,path,url}`, `deleteRecordFile`, `formatFileSize`
- hooks: `useGroup(slug)→{group,members,activity,loading,error}`, `usePatients(groupId)`, `useAppointments(groupId)`, `useRecords`, `useMedications` (실시간 구독 추정)
- utils: `formatDate`, `formatDateShort`, `isSameDay`, `getDisplayStatus`, `isTodayStr`, `parseHospitalSMS`, `requestNotificationPermission`, `isNotificationGranted`

---

## 8. 외부 연동 상세

1. **Claude Vision (사진→일정)**: `POST https://api.anthropic.com/v1/messages`, 헤더 `x-api-key`, `anthropic-version: 2023-06-01`. 이미지를 base64로 전송, 프롬프트는 부록 `ImageParseModal.jsx` 참조. 응답에서 `[ ... ]` JSON 배열을 정규식으로 추출 후 각 항목에 `status:'예약완료'` 부여. 현재 **키가 브라우저에 노출**됩니다.
2. **문자 파싱**: `parseHospitalSMS(text)` — 병원 예약 문자 정규식 파서(소스 미복원).
3. **파일 첨부**: Firebase Storage 업로드, 메타데이터를 `records.attachments`에 저장. CORS는 배포 워크플로에서 `gsutil cors set`으로 설정.
4. **알림**: 브라우저 `Notification` API만 사용(앱이 열려 있을 때 복약 시각 체크). 서버 푸시 없음.
5. **Cloudinary**: 환경변수만 확인, 코드 사용처 미확인.

---

## 9. Supabase 이전 설계안 (ChatGPT 구현 지시용)

### 9.1 접근 방식 결정 사항
현재는 로그인 없이 슬러그만 알면 접근하는 구조입니다. Supabase에서는 RLS를 꺼두면 전체 공개가 되므로 아래 중 선택이 필요합니다.

| 방안 | 내용 | 평가 |
|---|---|---|
| **A. 익명 로그인 + 그룹 가입 테이블 (권장)** | `signInAnonymously()` 후 `join_group(slug)` RPC로 `group_members_auth`에 등록, RLS는 멤버십 기준 | 현 UX(링크 공유) 유지 + 슬러그 무차별 조회 차단 |
| B. 가족별 이메일/구글 로그인 | 정식 계정 | 부모님 사용 편의 저하 우려 |
| C. RLS 없이 anon 전체 허용 | 가장 단순 | **의료정보 노출 위험, 비권장** |

### 9.2 DDL (방안 A 기준)

```sql
create extension if not exists pgcrypto;

create table groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz default now()
);

-- 접속 사용자(익명 포함)와 그룹 연결
create table group_access (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  primary key (group_id, user_id)
);

create table members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null, phone text, role text default '기타',
  created_at timestamptz default now()
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  type text, message text, created_at timestamptz default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null, birth date, color text, role text,
  blood_type text, insurance_num text, conditions text, allergies text,
  hospitals text[] default '{}', primary_doctor text,
  created_at timestamptz default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  hospital text, dept text, doctor text,
  date date not null, time text,
  status text not null default '예약완료' check (status in ('예약완료','진료완료','취소')),
  note text, deleted_at timestamptz,            -- 소프트 삭제
  created_at timestamptz default now()
);
create index on appointments (group_id, date);

create table records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  appt_id uuid references appointments(id) on delete set null,
  visit_date date, diagnosis text, memo text,
  prescriptions text[] default '{}',
  next_visit_date date, next_visit_time text,
  attachments jsonb default '[]',               -- [{name,size,path,url}]
  created_at timestamptz default now()
);

create table medications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  name text not null, dosage text, instructions text,
  times text[] default '{}', days_of_week text[] default '{}',
  active boolean default true,
  created_at timestamptz default now()
);

-- 슬러그로 입장: 익명 사용자 포함 인증 사용자를 그룹에 등록
create or replace function join_group(p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select id into gid from groups where slug = p_slug;
  if gid is null then raise exception 'group not found'; end if;
  insert into group_access(group_id, user_id) values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end $$;

-- RLS: 공통 헬퍼
create or replace function is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_access where group_id = gid and user_id = auth.uid())
$$;

alter table groups enable row level security;
alter table group_access enable row level security;
alter table members enable row level security;
alter table activity enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;
alter table records enable row level security;
alter table medications enable row level security;

create policy g_sel on groups for select using (is_group_member(id));
create policy ga_sel on group_access for select using (user_id = auth.uid());
-- 아래 6개 테이블 동일 패턴 (반복 적용)
create policy t_all on members      for all using (is_group_member(group_id)) with check (is_group_member(group_id));
create policy t_all on activity     for all using (is_group_member(group_id)) with check (is_group_member(group_id));
create policy t_all on patients     for all using (is_group_member(group_id)) with check (is_group_member(group_id));
create policy t_all on appointments for all using (is_group_member(group_id)) with check (is_group_member(group_id));
create policy t_all on records      for all using (is_group_member(group_id)) with check (is_group_member(group_id));
create policy t_all on medications  for all using (is_group_member(group_id)) with check (is_group_member(group_id));
```

그룹 생성은 `create_group(name, slug)` RPC(security definer)로 `groups` 삽입 + `group_access` 등록을 한 번에 처리하도록 추가 작성이 필요합니다.

### 9.3 Storage
- 버킷 `record-files` (비공개). 경로 규칙 `{group_id}/{record_id}/{timestamp}_{filename}`.
- Storage RLS: 경로 첫 폴더(`group_id`)가 `is_group_member`인 경우만 읽기/쓰기.
- 조회는 `createSignedUrl`(만료 있는 URL). `attachments`에는 `path`만 저장하고 `url`은 조회 시 생성 권장.

### 9.4 Firebase → Supabase 코드 매핑
| 현재 | Supabase |
|---|---|
| `onSnapshot` 구독 훅 | `supabase.channel().on('postgres_changes', ...)` 또는 React Query + 재조회 |
| `addDoc/updateDoc/deleteDoc` | `.insert()/.update()/.delete()` |
| `softDeleteAppointment` | `update({deleted_at: now()})`, 목록은 `is('deleted_at', null)` |
| camelCase 필드(`patientId`) | snake_case 컬럼(`patient_id`) — 서비스 계층에서 변환 매퍼 작성 |
| `uploadRecordFile` | `supabase.storage.from('record-files').upload()` (진행률은 `XMLHttpRequest` 또는 TUS 필요) |
| `Timestamp` | `timestamptz` (ISO 문자열) |

### 9.5 AI 호출 보안 개선
- 브라우저의 `VITE_ANTHROPIC_API_KEY` 제거. **Supabase Edge Function** `parse-appointment-image`를 만들어 서버에서 키 보관(`supabase secrets set`), 클라이언트는 이미지(base64)만 전송.
- 인증된(익명 포함) 사용자만 호출 가능하도록 JWT 검증, 호출 횟수 제한 권장.

### 9.6 알림
- 현재: 앱 실행 중 로컬 알림만. 실제 알림이 필요하면 `pg_cron` + Edge Function + Web Push(VAPID) 구성이 필요합니다(별도 과제).

---

## 10. ChatGPT 전달용 작업 지시문 (복사해서 사용)

```
아래 인계 문서는 React 19 + Vite + Tailwind 3 + Firebase로 만든 "가족 건강 허브" 웹앱입니다.
이를 Supabase(Postgres, Auth, Storage, Edge Functions)로 이전해 주세요.

[요구사항]
1. UI/UX, 라우팅, Tailwind 클래스, 한국어 문구는 현행 그대로 유지합니다(부록 A 소스 기준).
2. 9장 DDL을 적용하고, 변경이 필요하면 이유와 함께 수정안을 제시합니다.
3. src/services/* 와 src/hooks/* 를 Supabase 버전으로 새로 작성합니다.
   - 함수 시그니처는 7장 목록을 유지하고, camelCase↔snake_case 변환 계층을 둡니다.
   - 실시간 구독은 postgres_changes를 사용합니다.
4. 접근 제어는 9.1의 방안 A(익명 로그인 + join_group RPC + RLS)로 구현합니다.
5. 첨부파일은 비공개 버킷 + signed URL로 처리합니다.
6. ImageParseModal의 Claude 호출은 Edge Function(parse-appointment-image)으로 옮깁니다.
7. 산출물: ① SQL 마이그레이션 ② services/hooks 전체 코드 ③ Edge Function 코드 ④ .env 예시 ⑤ 배포 절차.
8. 미복원 파일(0장 표)은 인터페이스를 위 문서에서 추론해 작성하되, 추론한 부분은 주석으로 표시합니다.
```

---

## 11. 후속 점검 체크리스트

1. 원본 저장소에서 미복원 파일(0장) 확보 → 본 문서 보완
2. Firestore 실제 컬렉션 구조·필드명·삭제 표식 필드 확인 후 7장 확정
3. 운영 중인 Firestore 데이터 이관 여부 결정(이관 시 export → 변환 스크립트 필요)
4. `tesseract.js` 의존성 제거, `deploy.yml`의 하드코딩 값 Secrets 이동
5. 의료정보 특성상 RLS·백업·접근 로그 정책 확정

---

# 부록 A. 복원된 소스 전문

## src/App.jsx

~~~~jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import GroupDashboard from './pages/GroupDashboard';
import CalendarPage from './pages/CalendarPage';
import PatientPage from './pages/PatientPage';
import AddPage from './pages/AddPage';
import SettingsPage from './pages/SettingsPage';
import MedicationsPage from './pages/MedicationsPage';
import RecordsPage from './pages/RecordsPage';
import DeletedAppointmentsPage from './pages/DeletedAppointmentsPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/group/:slug" element={<GroupDashboard />} />
        <Route path="/group/:slug/calendar" element={<CalendarPage />} />
        <Route path="/group/:slug/deleted-appointments" element={<DeletedAppointmentsPage />} />
        <Route path="/group/:slug/patient/:patientId" element={<PatientPage />} />
        <Route path="/group/:slug/add" element={<AddPage />} />
        <Route path="/group/:slug/medications" element={<MedicationsPage />} />
        <Route path="/group/:slug/settings" element={<SettingsPage />} />
        <Route path="/group/:slug/records" element={<RecordsPage />} />
      </Routes>
    </Router>
  );
}

export default App;
~~~~

## .github/workflows/deploy.yml

~~~~yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches: [claude/family-health-hub-S34bb, main]
  workflow_dispatch:

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Create .env file
        run: |
          echo "VITE_FIREBASE_API_KEY=<REDACTED>" > .env
          echo "VITE_FIREBASE_AUTH_DOMAIN=<REDACTED>" >> .env
          echo "VITE_FIREBASE_PROJECT_ID=<REDACTED>" >> .env
          echo "VITE_FIREBASE_STORAGE_BUCKET=<REDACTED>" >> .env
          echo "VITE_FIREBASE_MESSAGING_SENDER_ID=<REDACTED>" >> .env
          echo "VITE_FIREBASE_APP_ID=<REDACTED>" >> .env
          echo "VITE_CLOUDINARY_CLOUD_NAME=${{ secrets.CLOUDINARY_CLOUD_NAME }}" >> .env
          echo "VITE_CLOUDINARY_UPLOAD_PRESET=${{ secrets.CLOUDINARY_UPLOAD_PRESET }}" >> .env
          echo "VITE_ANTHROPIC_API_KEY=${{ secrets.VITE_ANTHROPIC_API_KEY }}" >> .env

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
          projectId: <REDACTED>

      - name: Deploy Firebase Storage
        continue-on-error: true
        run: |
          npm install -g firebase-tools
          echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}' > /tmp/sa.json
          export GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json
          gsutil mb -p <REDACTED> -l us-central1 gs://<REDACTED> 2>/dev/null || true
          printf '[{"origin":["*"],"method":["GET","HEAD","PUT","POST","DELETE"],"responseHeader":["Content-Type","Content-Disposition","Origin","Accept","Authorization"],"maxAgeSeconds":3600}]' > /tmp/cors.json
          gsutil cors set /tmp/cors.json gs://<REDACTED> 2>/dev/null || true
          firebase deploy --only storage --project <REDACTED> 2>/dev/null || true
          rm -f /tmp/sa.json /tmp/cors.json
~~~~

## README.md

~~~~md
# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
~~~~

## src/components/common/ImageParseModal.jsx

~~~~jsx
import { useState, useRef } from 'react';
import { ImageIcon, Loader, CheckSquare, Square, Sparkles, AlertCircle } from 'lucide-react';
import { addAppointment } from '../../services/appointments';
import { logActivity } from '../../services/groups';

const STATUS_OPTIONS = ['예약완료', '진료완료'];

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractWithClaudeVision(imageFile) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. GitHub Secret에 VITE_ANTHROPIC_API_KEY를 추가해 주세요.');
  }

  const base64 = await fileToBase64(imageFile);
  const mediaType = (imageFile.type && imageFile.type.startsWith('image/')) ? imageFile.type : 'image/jpeg';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `이 이미지는 병원 예약 확인 화면입니다.
이미지가 90도 회전되어 있거나 카메라로 비스듬히 찍은 사진일 수 있습니다.
이미지 전체를 분석하여 진료 예약 정보를 모두 추출하고, 아래 JSON 배열 형식으로만 반환하세요.

[
  {
    "hospital": "병원명 (위치/장소 정보에서 파악. 예: 삼성서울병원)",
    "dept": "진료과명 (예: 비뇨의학과, 방사선종양학과)",
    "doctor": "담당의 이름만 (교수·의사·선생님 등 직함 제외. 예: 서상일)",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "note": "위치·층수 정보 등 (예: 암병원 2층 비뇨의학과)"
  }
]

추출 규칙:
- 예약 1건 = 배열 요소 1개, 여러 건이면 모두 포함
- 날짜: '2027.02.03(수)' → '2027-02-03'
- 시간: '09:00', '09:30' 24시간제
- 담당의: '서상일 교수' → '서상일', '박완 교수' → '박완'
- 병원명: 화면에 없으면 위치 필드에서 추정 (예: '암병원 2층' → '암병원')
- 없는 정보는 빈 문자열 ""
- JSON 배열만 반환, 설명 텍스트 없이`,
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API 오류 (${response.status})`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('이미지에서 예약 정보를 인식하지 못했습니다.');

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('예약 정보가 없거나 인식할 수 없는 이미지입니다.');
  }

  return parsed.map((a) => ({ ...a, status: '예약완료' }));
}

export default function ImageParseModal({ groupId, patients, defaultPatientId, onSuccess, onClose }) {
  const [images, setImages] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [parsed, setParsed] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const hasApiKey = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);

  function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImages(files);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    setParsed([]);
    setEdits({});
    setProgress('');
    setError('');
  }

  async function handleProcess() {
    if (!images.length) return;
    setProcessing(true);
    setProgress('AI가 이미지를 분석하고 있습니다...');
    setError('');

    try {
      const allAppts = [];
      for (let i = 0; i < images.length; i++) {
        if (images.length > 1) setProgress(`이미지 ${i + 1}/${images.length} 분석 중...`);
        const results = await extractWithClaudeVision(images[i]);
        allAppts.push(...results);
      }

      const withMeta = allAppts.map((a, idx) => ({
        ...a,
        patientId: defaultPatientId || patients[0]?.id || '',
        _id: idx,
        _selected: true,
      }));
      setParsed(withMeta);
      setEdits(Object.fromEntries(withMeta.map((a) => [a._id, { ...a }])));
      setProgress('');
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setProcessing(false);
    }
  }

  function update(id, field, value) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function handleSave() {
    const toSave = Object.values(edits).filter((a) => a._selected);
    if (!toSave.length) return;
    setSaving(true);
    try {
      for (const item of toSave) {
        const { _id, _selected, ...data } = item;
        const patient = patients.find((p) => p.id === data.patientId);
        await addAppointment(groupId, data);
        await logActivity(groupId, {
          type: 'appointment',
          message: `${patient?.name || ''}의 ${data.hospital} 진료 일정이 등록되었습니다.`,
        });
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = Object.values(edits).filter((a) => a._selected).length;

  return (
    <div className="space-y-4">
      {parsed.length === 0 && (
        <>
          {/* API 키 없음 경고 */}
          {!hasApiKey && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 leading-relaxed">
                <p className="font-semibold mb-0.5">AI OCR 설정 필요</p>
                <p>GitHub Settings → Secrets에 <code className="bg-amber-100 px-1 rounded">VITE_ANTHROPIC_API_KEY</code>를 추가해야 합니다.</p>
                <p className="mt-0.5 text-amber-600">console.anthropic.com에서 API 키 발급</p>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-10 border-2 border-dashed border-blue-200 rounded-2xl flex flex-col items-center gap-3 hover:bg-blue-50 transition-colors"
          >
            <div className="relative">
              <ImageIcon size={36} className="text-blue-300" />
              <Sparkles size={16} className="text-purple-400 absolute -top-1 -right-2" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">예약 화면 사진 선택</p>
              <p className="text-xs text-gray-400 mt-1">
                카메라 촬영 사진도 OK · 여러 장 동시 분석 가능
              </p>
              <p className="text-xs text-purple-500 mt-0.5 font-medium">✨ AI가 회전된 사진도 자동 인식</p>
            </div>
          </button>

          {previews.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">{previews.length}장 선택됨</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previews.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`이미지 ${i + 1}`}
                    className="w-20 h-28 object-cover rounded-xl border border-gray-200 flex-shrink-0"
                  />
                ))}
              </div>
            </div>
          )}

          {progress && (
            <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-50 rounded-xl px-3 py-2">
              <Loader size={14} className="animate-spin flex-shrink-0" />
              <span>{progress}</span>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleProcess}
            disabled={!images.length || processing || !hasApiKey}
            className="w-full py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            {processing ? (
              <><Loader size={14} className="animate-spin" /> 분석 중...</>
            ) : (
              <><Sparkles size={14} /> AI로 예약 정보 자동 추출</>
            )}
          </button>
        </>
      )}

      {parsed.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">
              {parsed.length}건 발견 — {selectedCount}건 선택됨
            </p>
            <button
              onClick={() => { setParsed([]); setImages([]); setPreviews([]); }}
              className="text-xs text-blue-500 hover:underline"
            >
              다시 선택
            </button>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {parsed.map((appt) => {
              const edit = edits[appt._id] || {};
              const selected = edit._selected !== false;
              return (
                <div
                  key={appt._id}
                  className={`rounded-2xl border overflow-hidden transition-all
                    ${selected ? 'border-blue-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}
                >
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-left"
                    onClick={() => update(appt._id, '_selected', !selected)}
                  >
                    {selected
                      ? <CheckSquare size={16} className="text-blue-500" />
                      : <Square size={16} className="text-gray-400" />}
                    <span className="text-xs font-medium text-gray-600">
                      {selected ? '저장 선택됨' : '저장 안 함'}
                    </span>
                  </button>

                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">환자 *</label>
                      <select
                        value={edit.patientId || ''}
                        onChange={(e) => update(appt._id, 'patientId', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      >
                        {patients.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">병원명</label>
                        <input
                          type="text"
                          value={edit.hospital || ''}
                          onChange={(e) => update(appt._id, 'hospital', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">진료과</label>
                        <input
                          type="text"
                          value={edit.dept || ''}
                          onChange={(e) => update(appt._id, 'dept', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">날짜</label>
                        <input
                          type="date"
                          value={edit.date || ''}
                          onChange={(e) => update(appt._id, 'date', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">시간</label>
                        <input
                          type="time"
                          value={edit.time || ''}
                          onChange={(e) => update(appt._id, 'time', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">담당의</label>
                      <input
                        type="text"
                        value={edit.doctor || ''}
                        onChange={(e) => update(appt._id, 'doctor', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">메모 (위치 등)</label>
                      <textarea
                        value={edit.note || ''}
                        onChange={(e) => update(appt._id, 'note', e.target.value)}
                        rows={2}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                      />
                    </div>

                    <div className="flex gap-1.5 flex-wrap">
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => update(appt._id, 'status', s)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                            ${edit.status === s
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-600 border-gray-200'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || selectedCount === 0}
              className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-blue-600"
            >
              {saving ? '저장 중...' : `${selectedCount}건 저장`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
~~~~

## src/components/layout/Navbar.jsx

~~~~jsx
import { Link, useLocation, useParams } from 'react-router-dom';
import { Home, Calendar, Plus, FileText, Pill } from 'lucide-react';

const navItems = [
  { to: '', icon: Home, label: '홈' },
  { to: '/calendar', icon: Calendar, label: '캘린더' },
  { to: '/add', icon: Plus, label: '추가', highlight: true },
  { to: '/medications', icon: Pill, label: '복약' },
  { to: '/records', icon: FileText, label: '기록' },
];

export default function Navbar({ group }) {
  const { slug } = useParams();
  const location = useLocation();
  const base = `/group/${slug}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
      <div className="flex items-center justify-around max-w-lg mx-auto px-2">
        {navItems.map(({ to, icon: Icon, label, highlight }) => {
          const href = `${base}${to}`;
          const isActive = location.pathname === href;
          return (
            <Link
              key={to}
              to={href}
              className={`flex flex-col items-center gap-0.5 py-2 px-3 min-w-[52px] transition-colors
                ${highlight
                  ? 'relative'
                  : isActive
                    ? 'text-blue-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              {highlight ? (
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 shadow-md -mt-4">
                  <Icon size={20} className="text-white" />
                </span>
              ) : (
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              )}
              <span className={`text-[10px] font-medium ${highlight ? 'text-blue-500' : ''}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
~~~~

## src/components/medications/MedicationCard.jsx

~~~~jsx
import { Pill, Clock, Bell, BellOff, Trash2, Edit2 } from 'lucide-react';

const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
];

export default function MedicationCard({ medication, patient, onEdit, onDelete, onToggle }) {
  const { name, dosage, times = [], daysOfWeek = [], instructions, active } = medication;
  const isAllDays = daysOfWeek.length === 7;

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
        ${active ? 'border-purple-100' : 'border-gray-100 opacity-60'}`}
    >
      <div className={`h-1 ${patient?.color?.dot || 'bg-purple-400'}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Pill size={18} className="text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{name}</h3>
              {dosage && <p className="text-xs text-gray-500 mt-0.5">{dosage}</p>}
              {patient && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full mt-1 inline-block ${patient.color?.bg} ${patient.color?.text}`}>
                  {patient.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => onToggle?.(!active)}
              className={`p-1.5 rounded-lg transition-colors
                ${active ? 'text-purple-500 bg-purple-50 hover:bg-purple-100' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'}`}
              title={active ? '알림 끄기' : '알림 켜기'}
            >
              {active ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
            <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {times.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Clock size={12} className="text-gray-400" />
              {times.map((t) => (
                <span key={t} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                  {t}
                </span>
              ))}
            </div>
          )}

          {!isAllDays && daysOfWeek.length > 0 && (
            <div className="flex gap-1">
              {DAYS.map(({ key, label }) => (
                <span
                  key={key}
                  className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-medium
                    ${daysOfWeek.includes(key) ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {isAllDays && (
            <p className="text-xs text-gray-400">매일 복용</p>
          )}

          {instructions && (
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1">{instructions}</p>
          )}
        </div>
      </div>
    </div>
  );
}
~~~~

## src/components/records/RecordDetail.jsx

~~~~jsx
import { Calendar, Paperclip, X } from 'lucide-react';
import { formatDateShort } from '../../utils/dateUtils';
import { formatFileSize } from '../../services/storage';

export default function RecordDetail({ record, patient, appointment, onEdit, onDelete, onDeleteAttachment }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-base leading-tight">
            {record.diagnosis || '진단명 없음'}
          </h3>
          {patient && (
            <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded-full mt-1 ${patient.color?.bg} ${patient.color?.text}`}>
              {patient.name}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-1">
          {formatDateShort(record.visitDate || record.createdAt)}
        </span>
      </div>

      {appointment && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <Calendar size={12} className="flex-shrink-0" />
          <span className="font-medium">{appointment.hospital}</span>
          {appointment.date && <span className="text-gray-400">· {appointment.date}</span>}
        </div>
      )}

      {record.memo && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">소견 / 메모</p>
          <p className="text-gray-700 bg-gray-50 rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {record.memo}
          </p>
        </div>
      )}

      {record.prescriptions?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">처방약</p>
          <div className="flex flex-wrap gap-1.5">
            {record.prescriptions.map((p, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {record.nextVisitDate && (
        <div className="flex items-center justify-between text-xs bg-blue-50 rounded-xl px-3 py-2.5">
          <span className="text-gray-500">다음 예약일</span>
          <span className="font-semibold text-blue-700">
            {record.nextVisitDate}{record.nextVisitTime ? ` ${record.nextVisitTime}` : ''}
          </span>
        </div>
      )}

      {record.attachments?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            첨부파일 ({record.attachments.length}개)
          </p>
          <div className="space-y-1.5">
            {record.attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 hover:bg-blue-50 hover:border-blue-100 transition-colors"
              >
                <Paperclip size={13} className="text-blue-400 flex-shrink-0" />
                <a href={att.url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 truncate text-blue-600 text-xs font-medium hover:underline">{att.name}</a>
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {att.size ? formatFileSize(att.size) : ''}
                </span>
                {onDeleteAttachment && (
                  <button
                    onClick={() => onDeleteAttachment(i)}
                    className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(onEdit || onDelete) && (
        <div className="pt-2 border-t border-gray-100 flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 py-3 border border-blue-200 text-blue-500 rounded-xl text-sm font-medium hover:bg-blue-50 active:bg-blue-100 transition-colors"
            >
              수정
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className={`py-3 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 active:bg-red-100 transition-colors ${onEdit ? 'flex-1' : 'w-full'}`}
            >
              진료 기록 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
~~~~

## src/components/records/RecordForm.jsx

~~~~jsx
import { useState, useRef } from 'react';
import { Plus, X, Paperclip, FileText, Loader, Camera, Image, Folder } from 'lucide-react';
import { addRecord, updateRecord } from '../../services/records';
import { addAppointment } from '../../services/appointments';
import { uploadRecordFile, formatFileSize } from '../../services/storage';
import { logActivity } from '../../services/groups';

export default function RecordForm({ groupId, patients, appointments, initial, onSuccess, onCancel }) {
  const isEdit = Boolean(initial?.id);
  const [form, setForm] = useState({
    patientId: initial?.patientId || patients[0]?.id || '',
    apptId: initial?.apptId || '',
    visitDate: initial?.visitDate || '',
    diagnosis: initial?.diagnosis || '',
    memo: initial?.memo || '',
    prescriptions: initial?.prescriptions || [],
    nextVisitDate: initial?.nextVisitDate || '',
    nextVisitTime: initial?.nextVisitTime || '',
  });
  const [existingAttachments] = useState(initial?.attachments || []);
  const [newFiles, setNewFiles] = useState([]);
  const [newPrescription, setNewPrescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [error, setError] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);

  const cameraRef = useRef();
  const galleryRef = useRef();
  const fileRef = useRef();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const filteredAppts = appointments.filter(
    (a) => a.patientId === form.patientId && a.status !== '취소'
  );

  function addPrescription() {
    if (!newPrescription.trim()) return;
    setForm((f) => ({ ...f, prescriptions: [...f.prescriptions, newPrescription.trim()] }));
    setNewPrescription('');
  }

  function removePrescription(i) {
    setForm((f) => ({ ...f, prescriptions: f.prescriptions.filter((_, idx) => idx !== i) }));
  }

  function handleFileAdd(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) setNewFiles((prev) => [...prev, ...files]);
    e.target.value = '';
    setShowFilePicker(false);
  }

  function removeNewFile(i) {
    setNewFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.patientId) { setError('환자를 선택해 주세요.'); return; }
    setSaving(true);
    try {
      const patient = patients.find((p) => p.id === form.patientId);
      let recordId;

      if (isEdit) {
        await updateRecord(groupId, initial.id, form);
        recordId = initial.id;
      } else {
        const docRef = await addRecord(groupId, form);
        recordId = docRef.id;
        await logActivity(groupId, {
          type: 'record',
          message: `${patient?.name || ''}의 진료 기록이 등록되었습니다.${form.diagnosis ? ` (${form.diagnosis})` : ''}`,
        });
      }

      if (newFiles.length > 0) {
        const uploaded = [];
        for (let i = 0; i < newFiles.length; i++) {
          const file = newFiles[i];
          const meta = await uploadRecordFile(groupId, recordId, file, (pct) => {
            setUploadProgress((prev) => ({ ...prev, [i]: pct }));
          });
          uploaded.push(meta);
        }
        const allAttachments = [...existingAttachments, ...uploaded];
        await updateRecord(groupId, recordId, { attachments: allAttachments });
      }

      // 다음 예약일이 새로 입력됐거나 변경된 경우 자동으로 일정 생성
      const prevNextVisitDate = initial?.nextVisitDate || '';
      if (form.nextVisitDate && form.nextVisitDate !== prevNextVisitDate) {
        const linkedAppt = appointments.find((a) => a.id === form.apptId);
        await addAppointment(groupId, {
          patientId: form.patientId,
          hospital: linkedAppt?.hospital || '',
          dept: linkedAppt?.dept || '',
          doctor: linkedAppt?.doctor || '',
          date: form.nextVisitDate,
          time: form.nextVisitTime || '',
          status: '예약완료',
          note: '진료 기록에서 자동 등록된 예약',
        });
      }

      onSuccess?.();
    } catch (err) {
      setError('저장 오류: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const isUploading = saving && newFiles.length > 0;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">환자 *</label>
          <select
            value={form.patientId}
            onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value, apptId: '' }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">진료일</label>
            <input
              type="date"
              value={form.visitDate}
              onChange={set('visitDate')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연결된 예약</label>
            <select
              value={form.apptId}
              onChange={set('apptId')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">선택 안 함</option>
              {filteredAppts.map((a) => (
                <option key={a.id} value={a.id}>{a.hospital} {a.date}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">진단명</label>
          <input
            type="text"
            value={form.diagnosis}
            onChange={set('diagnosis')}
            placeholder="예: 급성 상기도 감염"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">소견 / 메모</label>
          <textarea
            value={form.memo}
            onChange={set('memo')}
            placeholder="의사 소견, 주의사항 등"
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">처방약</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newPrescription}
              onChange={(e) => setNewPrescription(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPrescription())}
              placeholder="약품명 입력 후 추가"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              onClick={addPrescription}
              className="px-3 py-2.5 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.prescriptions.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full">
                {p}
                <button type="button" onClick={() => removePrescription(i)}><X size={12} /></button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">다음 예약일</label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.nextVisitDate}
              onChange={set('nextVisitDate')}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <input
              type="time"
              value={form.nextVisitTime}
              onChange={set('nextVisitTime')}
              disabled={!form.nextVisitDate}
              placeholder="시간 (선택)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-40 disabled:bg-gray-50"
            />
          </div>
          {form.nextVisitDate && (
            <p className="text-xs text-blue-500 mt-1.5 flex items-center gap-1">
              <span>📅</span>
              <span>
                저장 시 <strong>{form.nextVisitDate}{form.nextVisitTime ? ` ${form.nextVisitTime}` : ''}</strong> 일정이 자동 등록됩니다
              </span>
            </p>
          )}
        </div>

        {/* 첨부파일 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">첨부파일 (영수증, 처방전 등)</label>

          {/* Hidden file inputs — 3 separate inputs for different sources */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileAdd}
            className="hidden"
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileAdd}
            className="hidden"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt,image/*,application/pdf"
            multiple
            onChange={handleFileAdd}
            className="hidden"
          />

          {existingAttachments.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {existingAttachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                  <FileText size={13} className="text-blue-400 flex-shrink-0" />
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-blue-600 hover:underline">
                    {att.name}
                  </a>
                  <span className="text-gray-400 whitespace-nowrap">{formatFileSize(att.size)}</span>
                </div>
              ))}
            </div>
          )}

          {newFiles.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {newFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                  <FileText size={13} className="text-blue-400 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  {isUploading && uploadProgress[i] !== undefined ? (
                    <span className="text-blue-500 whitespace-nowrap">{uploadProgress[i]}%</span>
                  ) : (
                    <button type="button" onClick={() => removeNewFile(i)} className="text-gray-400 hover:text-red-400">
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFilePicker(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-blue-200 rounded-xl text-sm text-blue-400 hover:bg-blue-50 transition-colors"
          >
            <Paperclip size={14} />
            영수증 · 처방전 · PDF 첨부
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader size={14} className="animate-spin" /> {isUploading ? '업로드 중...' : '저장 중...'}</>
            ) : (
              isEdit ? '수정하기' : '등록하기'
            )}
          </button>
        </div>
      </form>

      {/* 파일 선택 바텀 시트 */}
      {showFilePicker && (
        <div className="fixed inset-0 z-50" onClick={() => setShowFilePicker(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 space-y-3 safe-area-pb"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <p className="text-sm font-semibold text-gray-700 mb-4 text-center">파일 첨부 방법 선택</p>

            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
            >
              <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Camera size={22} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">카메라 촬영</p>
                <p className="text-xs text-gray-400 mt-0.5">지금 바로 촬영하여 첨부</p>
              </div>
            </button>

            <button
              onClick={() => galleryRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
            >
              <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Image size={22} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">갤러리에서 선택</p>
                <p className="text-xs text-gray-400 mt-0.5">사진 및 동영상 앨범에서 선택</p>
              </div>
            </button>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 active:bg-gray-200 transition-colors text-left"
            >
              <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Folder size={22} className="text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">파일 업로드</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF, 문서, 이미지 파일 선택</p>
              </div>
            </button>

            <button
              onClick={() => setShowFilePicker(false)}
              className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 mt-1"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </>
  );
}
~~~~

## src/pages/AddPage.jsx

~~~~jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserPlus, Calendar, FileText, ClipboardPaste, ChevronRight, ImageIcon } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Modal from '../components/common/Modal';
import PatientForm from '../components/patients/PatientForm';
import AppointmentForm from '../components/appointments/AppointmentForm';
import RecordForm from '../components/records/RecordForm';
import ImageParseModal from '../components/common/ImageParseModal';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { parseHospitalSMS } from '../utils/smsParser';

export default function AddPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { group, loading: groupLoading } = useGroup(slug);
  const { patients } = usePatients(group?.id);
  const { appointments } = useAppointments(group?.id);

  const [activeModal, setActiveModal] = useState(null);
  const [smsText, setSmsText] = useState('');
  const [parsedAppt, setParsedAppt] = useState(null);
  const [parseError, setParseError] = useState('');
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [imagePatientId, setImagePatientId] = useState('');

  if (groupLoading) return <LoadingSpinner />;

  function handleParse() {
    setParseError('');
    const result = parseHospitalSMS(smsText);
    if (result) {
      setParsedAppt(result);
      setActiveModal('appointment');
      setShowSmsInput(false);
    } else {
      setParseError('문자 형식을 인식하지 못했습니다. 직접 입력해 주세요.');
    }
  }

  const actions = [
    {
      icon: UserPlus,
      label: '가족 구성원 추가',
      desc: '새로운 가족을 등록합니다',
      color: 'text-blue-500 bg-blue-50',
      onClick: () => setActiveModal('patient'),
    },
    {
      icon: Calendar,
      label: '진료 일정 추가',
      desc: '진료 예약을 수동으로 입력합니다',
      color: 'text-indigo-500 bg-indigo-50',
      onClick: () => { setParsedAppt(null); setActiveModal('appointment'); },
      disabled: patients.length === 0,
    },
    {
      icon: ImageIcon,
      label: '예약현황 사진 업로드',
      desc: '예약 확인 이미지에서 일정 자동 파싱',
      color: 'text-orange-500 bg-orange-50',
      onClick: () => {
        setImagePatientId(patients[0]?.id || '');
        setActiveModal('image');
      },
      disabled: patients.length === 0,
    },
    {
      icon: ClipboardPaste,
      label: '카카오톡 문자 파싱',
      desc: '병원 예약 문자를 붙여넣어 자동 등록',
      color: 'text-yellow-600 bg-yellow-50',
      onClick: () => setShowSmsInput(true),
      disabled: patients.length === 0,
    },
    {
      icon: FileText,
      label: '진료 기록 추가',
      desc: '진료 후 소견 및 처방을 기록합니다',
      color: 'text-green-500 bg-green-50',
      onClick: () => setActiveModal('record'),
      disabled: patients.length === 0,
    },
  ];

  return (
    <Layout group={group} title="빠른 추가">
      <div className="p-4 space-y-3">
        {patients.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
            먼저 가족 구성원을 등록해야 진료 정보를 추가할 수 있습니다.
          </div>
        )}

        {actions.map(({ icon: Icon, label, desc, color, onClick, disabled }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            className={`w-full flex items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm text-left
              hover:shadow-md transition-all
              ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-gray-200'}`}
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
          </button>
        ))}

        {showSmsInput && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="font-semibold text-gray-900 text-sm">카카오톡 문자 붙여넣기</h3>
            <textarea
              value={smsText}
              onChange={(e) => setSmsText(e.target.value)}
              placeholder="병원에서 받은 예약 안내 문자를 여기에 붙여넣으세요."
              rows={5}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
            {parseError && <p className="text-xs text-red-500">{parseError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowSmsInput(false); setParseError(''); setSmsText(''); }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleParse}
                disabled={!smsText.trim()}
                className="flex-1 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:bg-blue-600"
              >
                파싱하기
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={activeModal === 'patient'} onClose={() => setActiveModal(null)} title="가족 구성원 추가">
        <PatientForm
          groupId={group?.id}
          onSuccess={() => { setActiveModal(null); navigate(`/group/${slug}`); }}
          onCancel={() => setActiveModal(null)}
        />
      </Modal>

      <Modal
        isOpen={activeModal === 'appointment'}
        onClose={() => { setActiveModal(null); setParsedAppt(null); }}
        title="진료 일정 추가"
      >
        <AppointmentForm
          groupId={group?.id}
          patients={patients}
          initial={parsedAppt}
          onSuccess={() => { setActiveModal(null); setParsedAppt(null); navigate(`/group/${slug}/calendar`); }}
          onCancel={() => { setActiveModal(null); setParsedAppt(null); }}
        />
      </Modal>

      <Modal
        isOpen={activeModal === 'image'}
        onClose={() => setActiveModal(null)}
        title="예약현황 사진 파싱"
        size="lg"
      >
        <ImageParseModal
          groupId={group?.id}
          patients={patients}
          defaultPatientId={imagePatientId}
          onSuccess={() => { setActiveModal(null); navigate(`/group/${slug}/calendar`); }}
          onClose={() => setActiveModal(null)}
        />
      </Modal>

      <Modal isOpen={activeModal === 'record'} onClose={() => setActiveModal(null)} title="진료 기록 추가">
        <RecordForm
          groupId={group?.id}
          patients={patients}
          appointments={appointments}
          onSuccess={() => { setActiveModal(null); navigate(`/group/${slug}`); }}
          onCancel={() => setActiveModal(null)}
        />
      </Modal>
    </Layout>
  );
}
~~~~

## src/pages/CalendarPage.jsx

~~~~jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { FileText, Plus, CalendarDays, Clock4, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import MonthlyCalendar from '../components/calendar/MonthlyCalendar';
import AppointmentCard from '../components/appointments/AppointmentCard';
import StatusBadge from '../components/common/StatusBadge';
import Modal from '../components/common/Modal';
import AppointmentForm from '../components/appointments/AppointmentForm';
import RecordForm from '../components/records/RecordForm';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { isSameDay, formatDateShort } from '../utils/dateUtils';
import { softDeleteAppointment, updateAppointment } from '../services/appointments';
import { getDisplayStatus, isTodayStr } from '../utils/appointmentUtils';

const TABS = ['오늘의 일정', '다가오는 일정', '삭제된 일정'];

export default function CalendarPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { group, loading: groupLoading } = useGroup(slug);
  const { patients } = usePatients(group?.id);
  const { appointments, loading: apptLoading } = useAppointments(group?.id);

  const [selectedDate, setSelectedDate] = useState(null);
  const [activeTab, setActiveTab] = useState(1); // default: 다가오는 일정
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [patientFilter, setPatientFilter] = useState('all');
  const [recordPromptAppt, setRecordPromptAppt] = useState(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (groupLoading) return <LoadingSpinner />;

  const today = new Date().toISOString().slice(0, 10);

  const filteredAppts = patientFilter === 'all'
    ? appointments
    : appointments.filter((a) => a.patientId === patientFilter);

  const todayAppts = filteredAppts.filter((a) => isTodayStr(a.date));
  const upcomingAppts = filteredAppts.filter((a) => a.date > today).slice(0, 10);
  const dayAppts = selectedDate
    ? filteredAppts.filter((a) => a.date && isSameDay(a.date, format(selectedDate, 'yyyy-MM-dd')))
    : [];

  function getPatient(id) { return patients.find((p) => p.id === id); }

  function handleTabClick(i) {
    if (i === 2) {
      navigate(`/group/${slug}/deleted-appointments`);
      return;
    }
    setActiveTab(i);
    setSelectedDate(null);
  }

  async function handleStatusChange(apptId, status) {
    await updateAppointment(group.id, apptId, { status });
    if (status === '진료완료') {
      const appt = appointments.find((a) => a.id === apptId);
      if (appt) { setShowRecordForm(false); setRecordPromptAppt(appt); }
    }
  }

  function requestDelete(apptId) {
    setConfirmDeleteId(apptId);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    await softDeleteAppointment(group.id, confirmDeleteId);
    setConfirmDeleteId(null);
  }

  function closeRecordPrompt() {
    setRecordPromptAppt(null);
    setShowRecordForm(false);
  }

  const showList = selectedDate ? dayAppts : activeTab === 0 ? todayAppts : upcomingAppts;
  const listTitle = selectedDate
    ? `${formatDateShort(selectedDate)} 일정`
    : activeTab === 0 ? '오늘의 일정' : '다가오는 일정';

  return (
    <Layout
      group={group}
      title="캘린더"
      headerRight={
        <button
          onClick={() => { setEditingAppt(null); setShowAddForm(true); }}
          className="flex items-center gap-1.5 text-sm font-medium text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full"
        >
          <Plus size={14} /> 일정 추가
        </button>
      }
    >
      <div className="p-4 space-y-3">
        {/* 환자 필터 */}
        {patients.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setPatientFilter('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${patientFilter === 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              전체
            </button>
            {patients.map((p) => (
              <button
                key={p.id}
                onClick={() => setPatientFilter(p.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${patientFilter === p.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                style={patientFilter === p.id ? { backgroundColor: p.color?.hex } : {}}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* 월간 캘린더 */}
        <MonthlyCalendar
          appointments={filteredAppts}
          patients={patients}
          selectedDate={selectedDate}
          onDayClick={(day) => {
            setSelectedDate((prev) =>
              prev && format(prev, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') ? null : day
            );
          }}
        />

        {/* 탭 */}
        <div className="flex border-b border-gray-100">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => handleTabClick(i)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors relative
                ${i === 2
                  ? 'border-transparent text-gray-400 hover:text-gray-600'
                  : activeTab === i && !selectedDate
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab}
              {i === 0 && todayAppts.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-pink-500" />
              )}
            </button>
          ))}
        </div>

        {/* 오늘의 일정 배너 (탭 0이거나 다가오는 일정에서 오늘 일정 있을 때) */}
        {!selectedDate && todayAppts.length > 0 && activeTab === 1 && (
          <div className="bg-pink-50 border border-pink-200 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock4 size={14} className="text-pink-500" />
              <p className="text-xs font-semibold text-pink-700">오늘의 진료 일정</p>
              <span className="ml-auto text-xs text-pink-500 font-medium">{todayAppts.length}건</span>
            </div>
            <div className="space-y-2">
              {todayAppts.map((a) => (
                <div key={a.id} className="bg-white rounded-xl px-3 py-2 flex items-center gap-2">
                  <div className={`w-1 self-stretch rounded-full ${getPatient(a.patientId)?.color?.dot || 'bg-pink-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{a.hospital}</p>
                    <p className="text-xs text-gray-400">{getPatient(a.patientId)?.name}{a.time ? ` · ${a.time}` : ''}</p>
                  </div>
                  <StatusBadge status="진료 당일" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 일정 목록 */}
        <div>
          {!selectedDate && (
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              {activeTab === 0 ? <Clock4 size={14} className="text-pink-500" /> : <CalendarDays size={14} className="text-blue-500" />}
              {listTitle}
            </h3>
          )}
          {selectedDate && (
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{listTitle}</h3>
          )}

          {apptLoading ? (
            <LoadingSpinner text="" />
          ) : showList.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">
                {selectedDate ? '이 날 예약된 일정이 없습니다.' : activeTab === 0 ? '오늘 예정된 진료가 없습니다.' : '예정된 진료 일정이 없습니다.'}
              </p>
              <button
                onClick={() => { setEditingAppt(null); setShowAddForm(true); }}
                className="mt-2 text-xs text-blue-500 flex items-center gap-1 mx-auto"
              >
                <Plus size={12} /> 일정 추가
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {showList.map((a) => (
                <AppointmentDetailCard
                  key={a.id}
                  appointment={a}
                  patient={getPatient(a.patientId)}
                  onEdit={() => { setEditingAppt(a); setShowAddForm(true); }}
                  onDelete={() => requestDelete(a.id)}
                  onStatusChange={(s) => handleStatusChange(a.id, s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 일정 추가/수정 모달 */}
      <Modal
        isOpen={showAddForm}
        onClose={() => { setShowAddForm(false); setEditingAppt(null); }}
        title={editingAppt ? '진료 일정 수정' : '진료 일정 추가'}
      >
        {patients.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">먼저 가족 구성원을 등록해 주세요.</p>
            <button onClick={() => { setShowAddForm(false); navigate(`/group/${slug}`); }} className="mt-3 text-sm text-blue-500">
              구성원 등록하러 가기
            </button>
          </div>
        ) : (
          <AppointmentForm
            groupId={group?.id}
            patients={patients}
            initial={editingAppt}
            onSuccess={() => { setShowAddForm(false); setEditingAppt(null); }}
            onCancel={() => { setShowAddForm(false); setEditingAppt(null); }}
          />
        )}
      </Modal>

      {/* 진료완료 → 기록 작성 프롬프트 */}
      <Modal
        isOpen={Boolean(recordPromptAppt)}
        onClose={closeRecordPrompt}
        title={showRecordForm ? '진료 기록 작성' : '진료 완료'}
      >
        {!showRecordForm ? (
          <div className="text-center space-y-5 py-2">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto">
              <FileText size={28} className="text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-2">진료 기록을 작성하시겠어요?</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                <span className="font-medium text-gray-700">{recordPromptAppt?.hospital}</span> 진료가 완료되었습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={closeRecordPrompt} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700">나중에</button>
              <button onClick={() => setShowRecordForm(true)} className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold">지금 작성</button>
            </div>
          </div>
        ) : (
          <RecordForm
            groupId={group?.id}
            patients={patients}
            appointments={appointments}
            initial={{ patientId: recordPromptAppt?.patientId, apptId: recordPromptAppt?.id, visitDate: recordPromptAppt?.date }}
            onSuccess={closeRecordPrompt}
            onCancel={() => setShowRecordForm(false)}
          />
        )}
      </Modal>

      {/* 삭제 확인 다이얼로그 */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative w-full bg-white rounded-t-3xl px-5 pt-5 pb-8 safe-area-pb">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-2xl mx-auto mb-3">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <p className="text-center font-semibold text-gray-900 mb-1">일정 삭제</p>
            <p className="text-center text-sm text-gray-500 mb-5 leading-relaxed">
              해당 일정은 삭제하시겠습니까?<br />
              <span className="text-xs text-gray-400">삭제된 일정 탭에서 복구할 수 있습니다.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                아니오
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl text-sm font-semibold hover:bg-red-600"
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function AppointmentDetailCard({ appointment, patient, onEdit, onDelete, onStatusChange }) {
  const [showActions, setShowActions] = useState(false);
  const displayStatus = getDisplayStatus(appointment);
  const STATUS_OPTS = [
    { value: '예약완료', label: '예약 중' },
    { value: '진료완료', label: '진료완료' },
  ];

  return (
    <div className="relative">
      <AppointmentCard
        appointment={appointment}
        patient={patient}
        onClick={() => setShowActions((v) => !v)}
        showGcal={true}
      />
      {showActions && (
        <div className="mt-1 bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 mb-2">상태 변경</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {STATUS_OPTS.map((s) => (
              <button
                key={s.value}
                onClick={() => { onStatusChange(s.value); setShowActions(false); }}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors
                  ${appointment.status === s.value
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onEdit(); setShowActions(false); }}
              className="flex-1 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              수정
            </button>
            <button
              onClick={() => { onDelete(); setShowActions(false); }}
              className="flex-1 py-2 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
            >
              <Trash2 size={11} /> 일정삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
~~~~

## src/pages/GroupDashboard.jsx

~~~~jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Settings, Bell, Activity, User, Calendar } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AppointmentCard from '../components/appointments/AppointmentCard';
import PatientCard from '../components/patients/PatientCard';
import Modal from '../components/common/Modal';
import PatientForm from '../components/patients/PatientForm';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { formatDate } from '../utils/dateUtils';

export default function GroupDashboard() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { group, activity, loading: groupLoading, error } = useGroup(slug);
  const { patients, loading: patientsLoading } = usePatients(group?.id);
  const { appointments, loading: apptLoading } = useAppointments(group?.id);

  const [showPatientForm, setShowPatientForm] = useState(false);


  if (groupLoading) return <LoadingSpinner text="그룹 정보를 불러오는 중..." />;
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm"
          >
            홈으로
          </button>
        </div>
      </div>
    );
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const nextWeekStr = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const upcomingAppts = appointments
    .filter((a) => a.date >= todayStr && a.date <= nextWeekStr && a.status !== '취소')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  function getPatient(patientId) {
    return patients.find((p) => p.id === patientId);
  }

  function getApptCountForPatient(patientId) {
    return appointments.filter((a) => a.patientId === patientId).length;
  }

  return (
    <Layout
      group={group}
      title={group?.name || '가족 건강 허브'}
      headerRight={
        <button
          onClick={() => navigate(`/group/${slug}/settings`)}
          className="flex items-center justify-center w-9 h-9 bg-gray-100 rounded-xl"
        >
          <Settings size={16} className="text-gray-600" />
        </button>
      }
    >
      <div className="p-4 space-y-6">
        {/* 이번 주 진료 일정 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Bell size={14} className="text-blue-500" />
              이번 주 진료 일정
            </h2>
            <button
              onClick={() => navigate(`/group/${slug}/calendar`)}
              className="text-xs text-blue-500"
            >
              전체 보기
            </button>
          </div>

          {patientsLoading || apptLoading ? (
            <LoadingSpinner text="" />
          ) : upcomingAppts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
              <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">이번 주 예정된 진료가 없습니다.</p>
              <button
                onClick={() => navigate(`/group/${slug}/add`)}
                className="mt-3 text-xs text-blue-500 flex items-center gap-1 mx-auto"
              >
                <Plus size={12} /> 일정 추가
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingAppts.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  patient={getPatient(a.patientId)}
                  compact
                  onClick={() => navigate(`/group/${slug}/calendar`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 가족 구성원 */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <User size={14} className="text-blue-500" />
              가족 구성원
            </h2>
            <button
              onClick={() => setShowPatientForm(true)}
              className="text-xs text-blue-500 flex items-center gap-1"
            >
              <Plus size={12} /> 추가
            </button>
          </div>

          {patients.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400 mb-3">가족 구성원을 등록해 주세요.</p>
              <button
                onClick={() => setShowPatientForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-medium"
              >
                <Plus size={14} /> 구성원 추가
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {patients.map((p) => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  appointmentCount={getApptCountForPatient(p.id)}
                  onClick={() => navigate(`/group/${slug}/patient/${p.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 최근 활동 */}
        {activity.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
              <Activity size={14} className="text-blue-500" />
              최근 활동
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              {activity.slice(0, 5).map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm text-gray-700">{item.message}</p>
                  {item.createdAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDate(item.createdAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <Modal
        isOpen={showPatientForm}
        onClose={() => setShowPatientForm(false)}
        title="가족 구성원 추가"
      >
        <PatientForm
          groupId={group?.id}
          onSuccess={() => setShowPatientForm(false)}
          onCancel={() => setShowPatientForm(false)}
        />
      </Modal>
    </Layout>
  );
}
~~~~

## src/pages/MedicationsPage.jsx

~~~~jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Pill, Bell, BellOff, CheckCircle } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Modal from '../components/common/Modal';
import MedicationCard from '../components/medications/MedicationCard';
import MedicationForm from '../components/medications/MedicationForm';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { useMedications } from '../hooks/useMedications';
import { updateMedication, deleteMedication } from '../services/medications';
import {
  requestNotificationPermission,
  isNotificationGranted,
  scheduleTodayMedications,
} from '../utils/notifications';

export default function MedicationsPage() {
  const { slug } = useParams();
  const { group, loading: groupLoading } = useGroup(slug);
  const { patients } = usePatients(group?.id);
  const { medications, loading: medLoading } = useMedications(group?.id);
  const [showForm, setShowForm] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [patientFilter, setPatientFilter] = useState('all');
  const [notifGranted, setNotifGranted] = useState(isNotificationGranted());

  // Schedule today's reminders whenever medications load
  useEffect(() => {
    if (medications.length > 0 && patients.length > 0 && isNotificationGranted()) {
      scheduleTodayMedications(medications, patients);
    }
  }, [medications, patients]);

  if (groupLoading) return <LoadingSpinner />;

  const filtered = patientFilter === 'all'
    ? medications
    : medications.filter((m) => m.patientId === patientFilter);

  function getPatient(id) { return patients.find((p) => p.id === id); }

  const todayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const todayMeds = medications.filter(
    (m) => m.active && (!m.daysOfWeek || m.daysOfWeek.includes(todayKey))
  );

  async function handleToggle(med, active) {
    await updateMedication(group.id, med.id, { active });
  }

  async function handleDelete(med) {
    if (!confirm(`${med.name} 복약 정보를 삭제하시겠습니까?`)) return;
    await deleteMedication(group.id, med.id);
  }

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission();
    setNotifGranted(granted);
    if (granted) {
      scheduleTodayMedications(medications, patients);
    }
  }

  return (
    <Layout
      group={group}
      title="복약 관리"
      headerRight={
        <button
          onClick={() => { setEditingMed(null); setShowForm(true); }}
          className="flex items-center gap-1.5 text-sm font-medium text-purple-500 bg-purple-50 px-3 py-1.5 rounded-full"
        >
          <Plus size={14} /> 추가
        </button>
      }
    >
      <div className="p-4 space-y-4">
        {/* 오늘의 복약 */}
        {todayMeds.length > 0 && (
          <section className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-4 border border-purple-100">
            <h2 className="text-sm font-semibold text-purple-800 mb-3 flex items-center gap-2">
              <Pill size={14} /> 오늘의 복약 ({todayMeds.length}건)
            </h2>
            <div className="space-y-2">
              {todayMeds.map((m) => {
                const patient = getPatient(m.patientId);
                return (
                  <div key={m.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {patient?.name} · {m.times?.join(', ')}
                        {m.dosage ? ` · ${m.dosage}` : ''}
                      </p>
                    </div>
                    <CheckCircle size={18} className="text-purple-300 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 알림 허용 안내 */}
        {'Notification' in window && !notifGranted && (
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left hover:bg-amber-100 transition-colors"
          >
            <Bell size={18} className="text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">복약 알림 허용하기</p>
              <p className="text-xs text-amber-600">탭하면 복약 시간에 알림을 받을 수 있습니다</p>
            </div>
          </button>
        )}
        {notifGranted && (
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-xl px-3 py-2">
            <Bell size={13} /> 복약 알림이 활성화되어 있습니다
          </div>
        )}

        {/* 환자 필터 */}
        {patients.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setPatientFilter('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${patientFilter === 'all' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              전체
            </button>
            {patients.map((p) => (
              <button
                key={p.id}
                onClick={() => setPatientFilter(p.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${patientFilter === p.id ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                style={patientFilter === p.id ? { backgroundColor: p.color?.hex } : {}}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* 목록 */}
        {medLoading ? (
          <LoadingSpinner text="" />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <Pill size={36} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-4">등록된 복약 정보가 없습니다.</p>
            <button
              onClick={() => { setEditingMed(null); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-medium"
            >
              <Plus size={14} /> 복약 추가
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => (
              <MedicationCard
                key={m.id}
                medication={m}
                patient={getPatient(m.patientId)}
                onEdit={() => { setEditingMed(m); setShowForm(true); }}
                onDelete={() => handleDelete(m)}
                onToggle={(active) => handleToggle(m, active)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingMed(null); }}
        title={editingMed ? '복약 수정' : '복약 추가'}
      >
        <MedicationForm
          groupId={group?.id}
          patients={patients}
          initial={editingMed}
          onSuccess={() => { setShowForm(false); setEditingMed(null); }}
          onCancel={() => { setShowForm(false); setEditingMed(null); }}
        />
      </Modal>
    </Layout>
  );
}
~~~~

## src/pages/PatientPage.jsx

~~~~jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Edit2, ChevronLeft, Trash2, Plus, Hospital, Phone, FileText, Pill } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AppointmentCard from '../components/appointments/AppointmentCard';
import RecordCard from '../components/records/RecordCard';
import RecordDetail from '../components/records/RecordDetail';
import MedicationCard from '../components/medications/MedicationCard';
import MedicationForm from '../components/medications/MedicationForm';
import Modal from '../components/common/Modal';
import PatientForm from '../components/patients/PatientForm';
import AppointmentForm from '../components/appointments/AppointmentForm';
import RecordForm from '../components/records/RecordForm';
import MedicalReport from '../components/patients/MedicalReport';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { useAppointments } from '../hooks/useAppointments';
import { useRecords } from '../hooks/useRecords';
import { useMedications } from '../hooks/useMedications';
import { deletePatient } from '../services/patients';
import { deleteRecord, updateRecord } from '../services/records';
import { updateMedication, deleteMedication } from '../services/medications';
import { deleteRecordFile } from '../services/storage';
import { formatDate } from '../utils/dateUtils';

const TABS = ['진료 일정', '진료 기록', '복약'];

export default function PatientPage() {
  const { slug, patientId } = useParams();
  const navigate = useNavigate();
  const { group, loading: groupLoading } = useGroup(slug);
  const { patients, loading: patientsLoading } = usePatients(group?.id);
  const { appointments } = useAppointments(group?.id);
  const { records } = useRecords(group?.id);
  const { medications } = useMedications(group?.id);

  const [activeTab, setActiveTab] = useState(0);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [showAddAppt, setShowAddAppt] = useState(false);
  const [showAddRecord, setShowAddRecord] = useState(false);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [showAddMed, setShowAddMed] = useState(false);
  const [editingMed, setEditingMed] = useState(null);

  if (groupLoading || patientsLoading) return <LoadingSpinner />;

  const patient = patients.find((p) => p.id === patientId);
  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-3">구성원을 찾을 수 없습니다.</p>
          <button onClick={() => navigate(`/group/${slug}`)} className="text-blue-500 text-sm">돌아가기</button>
        </div>
      </div>
    );
  }

  const patientAppts = appointments
    .filter((a) => a.patientId === patientId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const patientRecords = records
    .filter((r) => r.patientId === patientId)
    .sort((a, b) => ((b.visitDate || '') > (a.visitDate || '') ? 1 : -1));

  const patientMeds = (medications || []).filter((m) => m.patientId === patientId);
  const age = patient.birth ? new Date().getFullYear() - new Date(patient.birth).getFullYear() : null;

  const hospitals = patient.hospitals?.length
    ? patient.hospitals
    : patient.primaryDoctor
      ? [{ hospital: '', doctor: patient.primaryDoctor, patientNum: patient.insuranceNum || '', coordinator: '', coordinatorPhone: '' }]
      : [];

  async function handleDeletePatient() {
    if (!confirm(`${patient.name}님을 삭제하시겠습니까? 관련 데이터는 유지됩니다.`)) return;
    await deletePatient(group.id, patientId);
    navigate(`/group/${slug}`);
  }

  async function handleDeleteRecord(record) {
    if (!confirm('이 진료 기록을 삭제하시겠습니까?')) return;
    for (const att of record.attachments || []) {
      if (att.path) await deleteRecordFile(att.path).catch(() => {});
    }
    await deleteRecord(group.id, record.id);
    setViewingRecord(null);
  }

  async function handleDeleteRecordAttachment(record, attIndex) {
    const updated = (record.attachments || []).filter((_, i) => i !== attIndex);
    await updateRecord(group.id, record.id, { attachments: updated });
    setViewingRecord((prev) => prev ? { ...prev, attachments: updated } : null);
  }

  async function handleToggleMed(med, active) {
    await updateMedication(group.id, med.id, { active });
  }

  async function handleDeleteMed(med) {
    if (!confirm(`${med.name} 복약 정보를 삭제하시겠습니까?`)) return;
    await deleteMedication(group.id, med.id);
  }

  return (
    <Layout group={group} title="">
      {/* 헤더 배너 */}
      <div className={`${patient.color?.bg || 'bg-blue-100'} px-4 pt-4 pb-6`}>
        <button onClick={() => navigate(`/group/${slug}`)} className="flex items-center gap-1 text-sm text-gray-600 mb-4">
          <ChevronLeft size={16} /> 뒤로
        </button>
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 ${patient.color?.dot || 'bg-blue-500'} rounded-2xl flex items-center justify-center`}>
            <User size={28} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{patient.name}</h1>
            <p className={`text-sm ${patient.color?.text || 'text-blue-700'} mt-0.5`}>
              {patient.role}{age !== null ? ` · 만 ${age}세` : ''}{patient.bloodType ? ` · ${patient.bloodType}형` : ''}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setShowReport(true)}
              className="p-2 bg-white/70 rounded-xl"
              title="의료진 리포트 생성"
            >
              <FileText size={16} className="text-blue-600" />
            </button>
            <button onClick={() => setShowEditPatient(true)} className="p-2 bg-white/70 rounded-xl">
              <Edit2 size={16} className="text-gray-600" />
            </button>
            <button onClick={handleDeletePatient} className="p-2 bg-white/70 rounded-xl">
              <Trash2 size={16} className="text-red-400" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {patient.conditions?.split(',').filter(Boolean).map((c, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">{c.trim()}</span>
          ))}
          {patient.allergies?.split(',').filter(Boolean).map((a, i) => (
            <span key={i} className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">⚠ {a.trim()}</span>
          ))}
        </div>

        {(patient.birth || hospitals.length > 0) && (
          <div className="mt-3 bg-white/60 rounded-xl p-3 text-xs text-gray-600 space-y-2">
            {patient.birth && (
              <div className="flex justify-between">
                <span className="text-gray-400">생년월일</span>
                <span>{formatDate(patient.birth)}</span>
              </div>
            )}
            {hospitals.map((h, i) => (
              <div key={i} className={`space-y-1 ${i > 0 ? 'border-t border-white/40 pt-2' : ''}`}>
                {h.hospital && (
                  <div className="flex items-center gap-1 font-medium text-gray-700">
                    <Hospital size={11} className="text-blue-400" />
                    <span>{h.hospital}</span>
                  </div>
                )}
                {h.doctor && <div className="flex justify-between"><span className="text-gray-400">담당의</span><span>{h.doctor} 선생님</span></div>}
                {h.patientNum && <div className="flex justify-between"><span className="text-gray-400">환자번호</span><span>{h.patientNum}</span></div>}
                {h.coordinator && <div className="flex justify-between"><span className="text-gray-400">코디네이터</span><span>{h.coordinator}</span></div>}
                {h.coordinatorPhone && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">코디 전화</span>
                    <a href={`tel:${h.coordinatorPhone}`} className="text-blue-600 flex items-center gap-0.5">
                      <Phone size={10} />{h.coordinatorPhone}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowReport(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-white/70 hover:bg-white/90 rounded-xl text-sm font-medium text-gray-700 transition-colors"
        >
          <FileText size={14} className="text-blue-500" />
          의료진 리포트 생성
        </button>
      </div>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors
                ${activeTab === i ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500'}`}
            >
              {tab}
              <span className="ml-1 text-xs text-gray-400">
                ({i === 0 ? patientAppts.length : i === 1 ? patientRecords.length : patientMeds.length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {activeTab === 0 && (
          <>
            <button
              onClick={() => setShowAddAppt(true)}
              className="w-full py-3 border-2 border-dashed border-blue-200 rounded-2xl text-sm text-blue-400 flex items-center justify-center gap-2 hover:bg-blue-50 transition-colors"
            >
              <Plus size={16} /> 진료 일정 추가
            </button>
            {patientAppts.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">등록된 진료 일정이 없습니다.</p>
            ) : (
              patientAppts.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  patient={patient}
                  onClick={() => navigate(`/group/${slug}/calendar`)}
                />
              ))
            )}
          </>
        )}

        {activeTab === 1 && (
          <>
            <button
              onClick={() => setShowAddRecord(true)}
              className="w-full py-3 border-2 border-dashed border-green-200 rounded-2xl text-sm text-green-400 flex items-center justify-center gap-2 hover:bg-green-50 transition-colors"
            >
              <Plus size={16} /> 진료 기록 추가
            </button>
            {patientRecords.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">등록된 진료 기록이 없습니다.</p>
            ) : (
              patientRecords.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  patient={patient}
                  appointment={appointments.find((a) => a.id === r.apptId)}
                  onClick={() => setViewingRecord(r)}
                />
              ))
            )}
          </>
        )}

        {activeTab === 2 && (
          <>
            <button
              onClick={() => { setEditingMed(null); setShowAddMed(true); }}
              className="w-full py-3 border-2 border-dashed border-purple-200 rounded-2xl text-sm text-purple-400 flex items-center justify-center gap-2 hover:bg-purple-50 transition-colors"
            >
              <Plus size={16} /> 복약 정보 추가
            </button>
            {patientMeds.length === 0 ? (
              <div className="text-center py-8">
                <Pill size={36} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">등록된 복약 정보가 없습니다.</p>
              </div>
            ) : (
              patientMeds.map((m) => (
                <MedicationCard
                  key={m.id}
                  medication={m}
                  patient={patient}
                  onEdit={() => { setEditingMed(m); setShowAddMed(true); }}
                  onDelete={() => handleDeleteMed(m)}
                  onToggle={(active) => handleToggleMed(m, active)}
                />
              ))
            )}
          </>
        )}
      </div>

      <Modal isOpen={showEditPatient} onClose={() => setShowEditPatient(false)} title="구성원 정보 수정">
        <PatientForm groupId={group?.id} initial={patient} onSuccess={() => setShowEditPatient(false)} onCancel={() => setShowEditPatient(false)} />
      </Modal>

      <Modal isOpen={showAddAppt} onClose={() => setShowAddAppt(false)} title="진료 일정 추가">
        <AppointmentForm groupId={group?.id} patients={patients} initial={{ patientId }} onSuccess={() => setShowAddAppt(false)} onCancel={() => setShowAddAppt(false)} />
      </Modal>

      <Modal isOpen={showAddRecord} onClose={() => setShowAddRecord(false)} title="진료 기록 추가">
        <RecordForm groupId={group?.id} patients={patients} appointments={patientAppts} initial={{ patientId }} onSuccess={() => setShowAddRecord(false)} onCancel={() => setShowAddRecord(false)} />
      </Modal>

      <Modal isOpen={Boolean(viewingRecord)} onClose={() => setViewingRecord(null)} title="진료 기록 상세">
        {viewingRecord && (
          <RecordDetail
            record={viewingRecord}
            patient={patient}
            appointment={appointments.find((a) => a.id === viewingRecord.apptId)}
            onEdit={() => { setEditingRecord(viewingRecord); setViewingRecord(null); }}
            onDelete={() => handleDeleteRecord(viewingRecord)}
            onDeleteAttachment={(i) => handleDeleteRecordAttachment(viewingRecord, i)}
          />
        )}
      </Modal>

      <Modal isOpen={Boolean(editingRecord)} onClose={() => setEditingRecord(null)} title="진료 기록 수정">
        {editingRecord && (
          <RecordForm
            groupId={group?.id}
            patients={patients}
            appointments={patientAppts}
            initial={editingRecord}
            onSuccess={() => setEditingRecord(null)}
            onCancel={() => setEditingRecord(null)}
          />
        )}
      </Modal>

      <Modal
        isOpen={showAddMed}
        onClose={() => { setShowAddMed(false); setEditingMed(null); }}
        title={editingMed ? '복약 수정' : '복약 추가'}
      >
        <MedicationForm
          groupId={group?.id}
          patients={patients}
          initial={editingMed ? editingMed : { patientId }}
          onSuccess={() => { setShowAddMed(false); setEditingMed(null); }}
          onCancel={() => { setShowAddMed(false); setEditingMed(null); }}
        />
      </Modal>

      {showReport && (
        <MedicalReport
          patient={patient}
          appointments={patientAppts}
          records={patientRecords}
          medications={patientMeds}
          onClose={() => setShowReport(false)}
        />
      )}
    </Layout>
  );
}
~~~~

## src/pages/SettingsPage.jsx

~~~~jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Users, Bell, Share2, Info, BellOff, BellRing, ChevronRight } from 'lucide-react';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Modal from '../components/common/Modal';
import ShareSheet from '../components/common/ShareSheet';
import { useGroup } from '../hooks/useGroup';
import { usePatients } from '../hooks/usePatients';
import { addMember, deleteMember } from '../services/groups';

const ROLES = ['부모', '자녀', '조부모', '기타'];

export default function SettingsPage() {
  const { slug } = useParams();
  const { group, members, loading: groupLoading } = useGroup(slug);
  const { patients } = usePatients(group?.id);

  const [showAddMember, setShowAddMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', phone: '', role: '기타' });
  const [saving, setSaving] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [shareTarget, setShareTarget] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }
  }, []);

  async function requestNotifications() {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      new Notification('가족 건강 허브', { body: '알림이 활성화되었습니다.' });
    }
  }

  if (groupLoading) return <LoadingSpinner />;

  async function handleAddMember(e) {
    e.preventDefault();
    if (!memberForm.name.trim()) { setMemberError('이름을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      await addMember(group.id, memberForm);
      setMemberForm({ name: '', phone: '', role: '기타' });
      setShowAddMember(false);
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMember(memberId, name) {
    if (!confirm(`${name}님을 멤버에서 제거하시겠습니까?`)) return;
    await deleteMember(group.id, memberId);
  }

  function shareLink() {
    const url = `${window.location.origin}/group/${slug}`;
    const shareData = {
      title: `${group?.name} 가족 건강 허브`,
      text: `${group?.name} 그룹에 참여해서 건강 정보를 함께 관리해요!`,
      url,
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => setShareTarget(shareData));
    } else {
      setShareTarget(shareData);
    }
  }

  return (
    <Layout group={group} title="설정">
      <div className="p-4 space-y-5">
        {/* 그룹 정보 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Info size={14} className="text-blue-500" /> 그룹 정보
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">그룹명</span>
              <span className="text-sm font-medium text-gray-900">{group?.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">가족 구성원</span>
              <span className="text-sm font-medium text-gray-900">{patients.length}명</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">그룹 슬러그</span>
              <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">{slug}</span>
            </div>
          </div>
        </section>

        {/* 링크 공유 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Share2 size={14} className="text-blue-500" /> 링크 공유
            </h3>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-400 mb-3">
              아래 링크를 가족과 공유하면 로그인 없이 바로 접속할 수 있습니다.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 mb-3">
              <p className="flex-1 text-xs text-gray-600 break-all font-mono">
                {window.location.origin}/group/{slug}
              </p>
            </div>
            <button
              onClick={shareLink}
              className="w-full py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors"
            >
              공유하기
            </button>
          </div>
        </section>

        {/* 알림 설정 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Bell size={14} className="text-blue-500" /> 알림 설정
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {notifPermission === 'unsupported' ? (
              <p className="text-sm text-gray-400">이 브라우저는 알림을 지원하지 않습니다.</p>
            ) : notifPermission === 'granted' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BellRing size={18} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">알림 활성화됨</p>
                  <p className="text-xs text-gray-400 mt-0.5">브라우저 알림이 허용되어 있습니다.</p>
                </div>
              </div>
            ) : notifPermission === 'denied' ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BellOff size={18} className="text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">알림이 차단됨</p>
                  <p className="text-xs text-gray-400 mt-0.5">브라우저 설정에서 알림을 허용해 주세요.</p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-400 mb-3">
                  진료 일정 알림을 받으려면 브라우저 알림을 허용해 주세요.
                </p>
                <button
                  onClick={requestNotifications}
                  className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Bell size={15} /> 알림 허용하기
                  </span>
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 알림 수신자 관리 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users size={14} className="text-blue-500" /> 알림 수신자
            </h3>
            <button
              onClick={() => setShowAddMember(true)}
              className="text-xs text-blue-500 flex items-center gap-1"
            >
              <Plus size={12} /> 추가
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {members.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">
                등록된 알림 수신자가 없습니다.
              </div>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {m.role} {m.phone ? `· ${m.phone}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteMember(m.id, m.name)}
                    className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

      </div>

      <ShareSheet
        isOpen={Boolean(shareTarget)}
        onClose={() => setShareTarget(null)}
        title={shareTarget?.title}
        text={shareTarget?.text}
        url={shareTarget?.url}
      />

      <Modal isOpen={showAddMember} onClose={() => setShowAddMember(false)} title="알림 수신자 추가">
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={memberForm.name}
              onChange={(e) => setMemberForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="홍길동"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">연락처 (문자 알림용)</label>
            <input
              type="tel"
              value={memberForm.phone}
              onChange={(e) => setMemberForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
            <div className="flex gap-2 flex-wrap">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setMemberForm((f) => ({ ...f, role: r }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                    ${memberForm.role === r
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          {memberError && <p className="text-sm text-red-500">{memberError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddMember(false)}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-sm font-semibold disabled:opacity-60"
            >
              {saving ? '저장 중...' : '추가하기'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
~~~~
