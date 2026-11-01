// 날짜별 복약 항목(약 × 복용 시간) 계산과 최근 복용 현황
import {addDays} from './format.js';
export const intakeKey = (medId, date, slot) => `${medId}|${date}|${slot}`;

export function slotsFor(med) { return med.times?.length ? [...med.times].sort() : ['any']; }
export function isMedDue(med, date) {
  return !med.deleted_at && med.active !== false && !(med.start_date && date < med.start_date) && !(med.end_date && date > med.end_date);
}
/** 해당 날짜에 확인해야 하는 항목. 시간순('시간 지정 없음'은 맨 뒤). */
export function daySlots(medications, date, patientIds) {
  const rows = [];
  for (const med of medications) {
    if (patientIds && !patientIds.includes(med.patient_id)) continue;
    if (!isMedDue(med, date)) continue;
    for (const slot of slotsFor(med)) rows.push({med, slot, key: intakeKey(med.id, date, slot)});
  }
  const rank = s => s === 'any' ? '99:99' : s;
  return rows.sort((a, b) => rank(a.slot).localeCompare(rank(b.slot)) || a.med.name.localeCompare(b.med.name, 'ko'));
}
export function groupBySlot(rows) {
  const out = [];
  for (const r of rows) { const last = out[out.length - 1]; if (last && last.slot === r.slot) last.rows.push(r); else out.push({slot: r.slot, rows: [r]}); }
  return out;
}
/** 최근 n일(오늘 포함) 복용 현황. 아직 오지 않은 시간은 계산에서 제외하지 않고 일 단위로 집계합니다. */
export function recentAdherence(medications, intakes, patientId, today, n = 7) {
  const done = new Set(intakes.filter(i => i.status === 'taken').map(i => intakeKey(i.medication_id, i.scheduled_date, i.slot)));
  const meds = medications.filter(m => m.patient_id === patientId);
  return Array.from({length: n}, (_, k) => {
    const date = addDays(today, -(n - 1 - k)), rows = daySlots(meds, date);
    return {date, total: rows.length, taken: rows.filter(r => done.has(r.key)).length};
  });
}
