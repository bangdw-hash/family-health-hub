// 진료 전·중·후 관리: 공통 상수, 단계 계산, 템플릿, AI/문자 추출 결과 → 입력 초안 변환
import {apptDateTime, fmtTime, toDateStr} from './format.js';

export const VISIT_KINDS = ['외래진료', '검사', '시술·수술', '입원', '기타'];
export const BOOKING_SOURCES = ['본인 예약', '병원 지정', '전화', '기타'];
export const VISIT_STATUS = ['예약완료', '접수', '진행중', '진료완료', '취소', '변경됨'];
export const PHASE_LABEL = {before: '진료 전', during: '진행', after: '진료 후'};
export const STEP_KINDS = {
  before: ['금식', '지참물', '서류', '약 조정', '기타'],
  during: ['접수', '검사', '측정', '대기', '진료', '수납', '기타'],
  after: ['약국', '예약', '결과 확인', '기타'],
};
export const FINISHED = ['진료완료', '취소'];

/** 단계의 기준 시각: 진료 시작 시각 + relative_minutes, 없으면 같은 날짜의 step_time */
export function stepDue(appt, step) {
  if (step.relative_minutes != null && appt.visit_time) return new Date(apptDateTime(appt).getTime() + step.relative_minutes * 60000);
  if (step.step_time) { const [h, m] = String(step.step_time).slice(0, 5).split(':').map(Number); const d = new Date(appt.visit_date + 'T00:00:00'); d.setHours(h, m, 0, 0); return d; }
  return null;
}
export function fmtDue(d, now = new Date()) {
  if (!d) return '';
  const same = toDateStr(d) === toDateStr(now), t = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return same ? '오늘 ' + t : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + t;
}
export const stepsOf = (steps, apptId, phase) => steps.filter(s => s.appointment_id === apptId && (!phase || s.phase === phase)).sort((a, b) => a.sort - b.sort || a.created_at?.localeCompare(b.created_at || '') || 0);
export function progress(list) { return {done: list.filter(s => s.done_at).length, total: list.length}; }
export const nextStep = list => list.find(s => !s.done_at) || null;

export function mapLinks(a) {
  const q = encodeURIComponent([a.hospital, a.place].filter(Boolean).join(' '));
  return [['네이버 지도', 'https://map.naver.com/p/search/' + q], ['카카오맵', 'https://map.kakao.com/?q=' + q], ['구글 지도', 'https://www.google.com/maps/search/?api=1&query=' + q]];
}

export const TEMPLATES = {
  blood: {label: '채혈 후 진료', kind: '외래진료', fasting_hours: 8, steps: [
    {phase: 'before', kind: '금식', title: '금식 시작', relative_minutes: -480}, {phase: 'before', kind: '지참물', title: '진료카드·신분증 지참'},
    {phase: 'during', kind: '접수', title: '접수'}, {phase: 'during', kind: '검사', title: '채혈'}, {phase: 'during', kind: '측정', title: '혈압·체중·신장 측정'},
    {phase: 'during', kind: '대기', title: '대기실 대기'}, {phase: 'during', kind: '진료', title: '진료'}, {phase: 'during', kind: '수납', title: '수납'},
    {phase: 'after', kind: '약국', title: '처방약 수령'}, {phase: 'after', kind: '예약', title: '다음 예약 확인'}]},
  imaging: {label: '영상검사 후 진료', kind: '외래진료', steps: [
    {phase: 'before', kind: '서류', title: '검사 안내문 확인(금식·금속 제거)'}, {phase: 'before', kind: '지참물', title: '진료카드·신분증 지참'},
    {phase: 'during', kind: '접수', title: '접수'}, {phase: 'during', kind: '검사', title: '영상검사'}, {phase: 'during', kind: '대기', title: '대기'}, {phase: 'during', kind: '진료', title: '진료'}, {phase: 'during', kind: '수납', title: '수납'},
    {phase: 'after', kind: '결과 확인', title: '검사 결과 확인'}, {phase: 'after', kind: '약국', title: '처방약 수령'}]},
  general: {label: '일반 진료', kind: '외래진료', steps: [
    {phase: 'before', kind: '지참물', title: '진료카드·복용 중인 약 목록 지참'},
    {phase: 'during', kind: '접수', title: '접수'}, {phase: 'during', kind: '대기', title: '대기'}, {phase: 'during', kind: '진료', title: '진료'}, {phase: 'during', kind: '수납', title: '수납'},
    {phase: 'after', kind: '약국', title: '처방약 수령'}]},
};
export function templateSteps(key) { return (TEMPLATES[key]?.steps || []).map((s, i) => ({...s, sort: i})); }

/** AI/문자 추출 결과 1건 → 입력 폼 초안 */
export function draftFromExtraction(x) {
  const {steps = [], ...rest} = x;
  const fields = {};
  for (const [k, v] of Object.entries(rest)) if (v !== null && v !== undefined && v !== '') fields[k] = v;
  const list = steps.map((s, i) => ({phase: s.phase, kind: s.kind || '기타', title: s.title, relative_minutes: s.relative_minutes ?? null, step_time: s.step_time || null, place: s.place || null, staff: s.staff || null, note: s.note || null, sort: i}));
  if (fields.fasting_hours && !list.some(s => s.kind === '금식')) list.unshift({phase: 'before', kind: '금식', title: '금식 시작', relative_minutes: -fields.fasting_hours * 60, sort: -1});
  return {fields, steps: list.map((s, i) => ({...s, sort: i}))};
}
/** 같은 날 '진료 N시간 전 검사'가 있으면 그 검사 → 진료 연결 정보를 만든다. 반환: [{testIndex, visitIndex, lead}] */
export function detectLinks(items) {
  const out = [];
  items.forEach((t, ti) => {
    if (t.kind !== '검사') return;
    const vi = items.findIndex((v, i) => i !== ti && v.kind === '외래진료' && (!t.visit_date || !v.visit_date || t.visit_date === v.visit_date));
    if (vi >= 0 && (t.related_lead_minutes != null || (items[vi].visit_time && t.visit_time))) out.push({testIndex: ti, visitIndex: vi, lead: t.related_lead_minutes ?? null});
  });
  return out;
}
/** 연결된 진료 N분 전 검사 → 검사 시간이 비어 있으면 계산해 채운다 */
export function leadTime(visitTime, lead) {
  if (!visitTime || lead == null) return null;
  const [h, m] = String(visitTime).slice(0, 5).split(':').map(Number), t = h * 60 + m - lead;
  if (t < 0) return null;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
export function visitSummary(a) {
  return [a.kind && a.kind !== '외래진료' ? a.kind : null, a.hospital, a.department, a.test_name].filter(Boolean).join(' · ') + (a.visit_time ? ' ' + fmtTime(a.visit_time) : '');
}
