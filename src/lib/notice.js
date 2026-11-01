// AI를 쓰지 않을 때를 위한 규칙 기반 안내문 분해(병원 문자·앱 화면 글자 붙여넣기). 정확도에 한계가 있어 항상 확인 화면을 거칩니다.
import {redactIds} from '../../supabase/functions/_shared/ocr.js';

const pad = n => String(n).padStart(2, '0');
function parseTime(line) {
  const m = line.match(/(AM|PM|오전|오후)?\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  let h = +m[2]; const ap = (m[1] || '').toLowerCase();
  if ((ap === 'pm' || ap === '오후') && h < 12) h += 12;
  if ((ap === 'am' || ap === '오전') && h === 12) h = 0;
  return h < 24 ? pad(h) + ':' + m[3] : null;
}
function parseDate(line, year) {
  let m = line.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = line.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  return m ? `${year}-${pad(m[1])}-${pad(m[2])}` : null;
}
const TITLES = /(교수|전문의|과장|원장|의사|선생님)/;
function splitHospital(head) {
  const t = head.replace(/\s*-\s*(검사|진료|외래).*$/, '').trim();
  const words = t.split(/\s+/);
  const dept = [...words].reverse().find(w => /과$/.test(w)) || null;
  const hosp = words.filter(w => w !== dept).join(' ') || null;
  return {hospital: hosp, department: dept};
}

export function parseNotice(text, today = new Date()) {
  const year = today.getFullYear(), raw = redactIds(String(text || '')).replace(/\r/g, '');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const blocks = [];
  let cur = null, globalDate = null;
  const start = (kind, head) => { cur = {kind, head, lines: []}; blocks.push(cur); };
  for (const l of lines) {
    const h = l.match(/^(.+?)\s*-\s*(검사|진료)\s*$/);
    if (h) { start(h[2] === '검사' ? '검사' : '외래진료', h[1]); continue; }
    if (/^(외래|검사)$/.test(l)) { start(l === '검사' ? '검사' : '외래진료', ''); continue; }
    if (!cur && !blocks.length && parseDate(l, year) && !/(시간\s*[:：]|AM|PM|오전|오후|\d{1,2}:\d{2})/i.test(l)) { globalDate = parseDate(l, year); continue; }
    if (!cur) start('외래진료', '');
    cur.lines.push(l);
  }
  const warnings = [];
  const appointments = blocks.map(b => {
    const body = b.lines.join('\n'), all = [b.head, ...b.lines].join('\n');
    const a = {kind: b.kind, hospital: null, department: null, specialty: null, doctor: null, doctor_title: null, visit_date: parseDate(all, year) || globalDate, visit_time: null, arrival_time: null,
      place: null, place_note: null, hours_note: null, test_name: null, fasting_hours: null, booking_source: null, booking_ref: null, hospital_phone: null, related_lead_minutes: null, notice_text: null, steps: []};
    if (b.head) {
      const f = b.head.match(/(\d{1,2})\s*시간\s*금식/);
      if (f) a.fasting_hours = +f[1];
      if (b.kind === '검사') a.test_name = b.head.replace(/\d{1,2}\s*시간\s*금식/, '').trim() || null;
      else Object.assign(a, splitHospital(b.head));
    }
    const fastBody = all.match(/(\d{1,2})\s*시간\s*금식/); if (fastBody && a.fasting_hours == null) a.fasting_hours = +fastBody[1];
    const tl = all.match(/시간\s*[:：]\s*(.+)/); if (tl) a.visit_time = parseTime(tl[1]);
    if (!a.visit_time) for (const l of [...b.lines, b.head]) { if (/(\d{4}[.\-/]\d|\bAM\b|\bPM\b|오전|오후|시간\s*[:：])/.test(l)) { const t = parseTime(l); if (t) { a.visit_time = t; break; } } }
    const dr = all.match(/(?:의료진|담당의|담당 의사|진료의)\s*[:：]\s*(.+)/);
    if (dr) { const m = dr[1].trim().match(new RegExp('^(.*?)\\s*' + TITLES.source + '?\\s*$')); a.doctor = (m?.[1] || dr[1]).trim(); a.doctor_title = m?.[2] || null; }
    else { const d2 = all.match(/^([가-힣]{2,4})\s*\/\s*([가-힣]+과)/m); if (d2) { a.doctor = d2[1]; a.department = a.department || d2[2]; } }
    const pl = all.match(/(?:위치|장소)\s*[:：]?\s*(.+)/); if (pl) a.place = pl[1].trim().slice(0, 500);
    const go = all.match(/가셔야\s*할\s*곳\s*[-:：]?\s*\[?([^\]\n]+)\]?/); if (go) a.place = a.place || go[1].trim();
    const tn = all.match(/검사명\s*[:：]?\s*\[?([^\]\n]+)\]?/); if (tn) a.test_name = tn[1].trim();
    const fld = all.match(/분야\s*[:：]?\s*(.+)/); if (fld) a.specialty = fld[1].trim().slice(0, 300);
    const src = all.match(/(본인\s*예약|병원\s*지정|전화\s*예약)/); if (src) a.booking_source = src[1].replace(/\s+/g, ' ').replace('전화 예약', '전화');
    const lead = all.match(/진료\s*(\d{1,2})\s*시간\s*전\s*검사/); if (lead) { a.related_lead_minutes = +lead[1] * 60; a.kind = a.kind === '외래진료' && !b.head ? '검사' : a.kind; }
    const hours = b.lines.filter(l => /(평일|토요일|일요일|공휴일).*\d{1,2}:\d{2}\s*[~\-]/.test(l)); if (hours.length) a.hours_note = hours.map(l => l.replace(/^▶\s*/, '')).join(' / ').slice(0, 1000);
    if (/진료\s*전/.test(body) && b.kind === '검사') a.related_lead_minutes = a.related_lead_minutes ?? null;
    if (a.fasting_hours) a.steps.push({phase: 'before', kind: '금식', title: '금식 시작', relative_minutes: -a.fasting_hours * 60});
    const detail = body.match(/\[?진료\s*세부사항\]?\n([\s\S]*)$/);
    if (detail) for (const l of detail[1].split('\n')) {
      const t = l.replace(/^[-•·▶\s]+/, '').trim(); if (!t) continue;
      a.steps.push({phase: 'during', kind: /측정/.test(t) ? '측정' : /대기/.test(t) ? '대기' : /진료실/.test(t) ? '진료' : /검사/.test(t) ? '검사' : /수납/.test(t) ? '수납' : '기타', title: t.slice(0, 200)});
    }
    const notice = b.lines.filter(l => /^※|안내|가셔야|금식|전\s*검사/.test(l)).join('\n'); if (notice) a.notice_text = notice.slice(0, 10000);
    return a;
  }).filter(a => a.visit_date || a.visit_time || a.hospital || a.test_name);
  if (!appointments.length) warnings.push('예약 정보를 찾지 못했습니다.');
  else warnings.push('규칙 기반으로 읽은 결과입니다. 내용을 확인한 뒤 등록하십시오.');
  return {appointments, warnings};
}
