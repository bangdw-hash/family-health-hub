// 날짜·문자열 유틸. 모든 날짜 문자열은 로컬 시간대 기준 YYYY-MM-DD 입니다.
const pad = n => String(n).padStart(2, '0');
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function todayStr(now = new Date()) { return toDateStr(now); }
export function parseDate(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
export function diffDays(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
export function fmtDate(s, withYear = false) {
  if (!s) return '';
  const d = parseDate(s);
  return (withYear ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + WEEKDAYS[d.getDay()] + ')';
}
export function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
export function relativeDay(s, today = todayStr()) {
  const n = diffDays(s, today);
  if (n === 0) return '오늘';
  if (n === 1) return '내일';
  if (n === -1) return '어제';
  if (n > 1 && n <= 30) return 'D-' + n;
  return fmtDate(s);
}
export function timeAgo(iso, now = Date.now()) {
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return '방금 전';
  if (sec < 3600) return Math.floor(sec / 60) + '분 전';
  if (sec < 86400) return Math.floor(sec / 3600) + '시간 전';
  if (sec < 86400 * 7) return Math.floor(sec / 86400) + '일 전';
  return fmtDateTime(iso);
}
export function ageOf(birth, today = todayStr()) {
  if (!birth) return null;
  const b = parseDate(birth), t = parseDate(today);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
/** year, month(0-11) 의 달력 격자. 앞뒤 빈 칸은 null. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let d = 1; d <= last; d++) cells.push(year + '-' + pad(month + 1) + '-' + pad(d));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export function apptDateTime(a) {
  const t = a.visit_time ? String(a.visit_time).slice(0, 5) : '09:00';
  const [h, m] = t.split(':').map(Number);
  const d = parseDate(a.visit_date); d.setHours(h, m, 0, 0);
  return d;
}

export const PATIENT_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];
export function patientColor(p, index = 0) { return p?.color || PATIENT_COLORS[index % PATIENT_COLORS.length]; }

export const ENTITY_LABEL = {
  patients: '환자', appointments: '진료 일정', medical_records: '진료 기록', medications: '복약 계획',
  attachments: '첨부 파일', family_members: '구성원', patient_permissions: '환자별 권한', export: '내보내기', report: '리포트',
};
export const ACTION_LABEL = { create: '등록', update: '수정', trash: '휴지통 이동', restore: '복원', export: '내보내기', report: '리포트 생성' };
export const ROLE_LABEL = { owner: '관리자', caregiver: '보호자', patient: '환자 본인' };
export const ACCESS_LABEL = { edit: '공동 편집', view: '열람만', none: '환자별 지정만' };
export const ATTACH_KINDS = ['처방전', '검사 결과', '영수증', '진단서', '기타'];
export const APPT_STATUS = ['예약완료', '진료완료', '취소'];

/** 한글 단어 뒤에 올 조사(을/를) 선택 */
export function eul(word) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return word + '(을)를';
  return word + ((c - 0xac00) % 28 ? '을' : '를');
}
