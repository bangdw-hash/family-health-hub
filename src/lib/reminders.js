// 알림 일정 계산(순수 함수)과 적용. 푸시 서버 없이 이 기기에서 로컬로만 동작합니다.
import {apptDateTime, addDays, todayStr, parseDate, fmtTime} from './format.js';
import {Capacitor} from '@capacitor/core';
import {scheduleNativeNotifications} from './mobileNotifications.js';

const KEY = 'fhh:reminders';
export const DEFAULT_PREFS = {enabled: false, patients: {}, leadMinutes: 120, dayBefore: true, showDetail: false};
export function loadPrefs() { try { return {...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY))}; } catch { return {...DEFAULT_PREFS}; } }
export function savePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export function hashId(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (Math.abs(h) % 2147483000) + 1; }

/** prefs.patients[id] = {meds:boolean, appts:boolean}. 반환: 시각순, 최대 max개(iOS 대기 알림 한도 64 고려). */
export function buildSchedule({appointments, medications, patients, prefs, now = new Date(), days = 7, max = 60}) {
  if (!prefs.enabled) return [];
  const out = [], name = id => patients.find(p => p.id === id)?.name || '';
  const detail = prefs.showDetail;
  const today = todayStr(now), endDate = addDays(today, days);
  const push = (key, at, title, body) => { if (at > now) out.push({id: hashId(key), at, title, body}); };
  for (const a of appointments) {
    if (a.deleted_at || a.status === '취소' || a.status === '진료완료') continue;
    if (!prefs.patients[a.patient_id]?.appts) continue;
    if (a.visit_date < today || a.visit_date > addDays(endDate, 1)) continue;
    const at = apptDateTime(a);
    const t = detail ? `${name(a.patient_id)} 진료 ${fmtTime(a.visit_time) || ''}` : '진료 일정이 있습니다';
    const b = detail ? `${a.hospital}${a.department ? ' ' + a.department : ''}` : '앱에서 확인하십시오.';
    push('a-lead-' + a.id, new Date(at.getTime() - prefs.leadMinutes * 60000), t, b);
    if (prefs.dayBefore) { const d = parseDate(a.visit_date); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); push('a-day-' + a.id, d, detail ? `내일 ${name(a.patient_id)} 진료` : '내일 진료 일정이 있습니다', b); }
  }
  for (const m of medications) {
    if (m.deleted_at || m.active === false || !m.times?.length) continue;
    if (!prefs.patients[m.patient_id]?.meds) continue;
    for (let i = 0; i <= days; i++) {
      const date = addDays(today, i);
      if ((m.start_date && date < m.start_date) || (m.end_date && date > m.end_date)) continue;
      for (const t of m.times) {
        const [h, mi] = t.split(':').map(Number), d = parseDate(date); d.setHours(h, mi, 0, 0);
        push(`m-${m.id}-${date}-${t}`, d, detail ? `${name(m.patient_id)} 복약 시간` : '복약 시간입니다', detail ? `${m.name} ${m.dosage || ''}`.trim() : '앱에서 확인하십시오.');
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}

let timers = [];
/** 웹: 앱이 열려 있는 동안 24시간 이내 알림만 타이머로 처리합니다(닫혀 있으면 전달되지 않음). */
export async function applySchedule(items) {
  timers.forEach(clearTimeout); timers = [];
  if (Capacitor.isNativePlatform()) return scheduleNativeNotifications(items);
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const limit = Date.now() + 86400000;
  for (const x of items) {
    const wait = x.at.getTime() - Date.now();
    if (wait > 0 && x.at.getTime() < limit) timers.push(setTimeout(() => { try { new Notification(x.title, {body: x.body, tag: String(x.id)}); } catch {} }, wait));
  }
  return true;
}
export function stopReminders() { timers.forEach(clearTimeout); timers = []; }
