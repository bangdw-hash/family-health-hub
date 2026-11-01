// iCalendar(RFC 5545) 생성기. Deno(엣지 함수)와 브라우저/Node(앱·테스트)에서 동일하게 사용하는 순수 ESM 파일입니다.
// 한국 표준시(Asia/Seoul, UTC+9, 서머타임 없음) 기준으로 작성합니다.
const pad = n => String(n).padStart(2, '0');
const enc = new TextEncoder();
export const TZ = 'Asia/Seoul';

const BS = String.fromCharCode(92); // 역슬래시
export function esc(s) { return String(s ?? '').replace(/\\/g, BS + BS).replace(/\r?\n/g, BS + 'n').replace(/;/g, BS + ';').replace(/,/g, BS + ','); }
/** 75 옥텟 접기. 멀티바이트 문자를 쪼개지 않습니다. */
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = ' ' + ch; bytes = 1 + b; limit = 75; } else { cur += ch; bytes += b; }
  }
  out.push(cur);
  return out.join('\r\n');
}
const ymd = s => String(s).slice(0, 10).replace(/-/g, '');
const hm = t => String(t || '09:00').slice(0, 5).replace(':', '') + '00';
function addDaysStr(s, n) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
function localDateTime(date, time, plusMin = 0) {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number), [h, mi] = String(time || '09:00').slice(0, 5).split(':').map(Number);
  const x = new Date(Date.UTC(y, mo - 1, d, h, mi + plusMin));
  return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + 'T' + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + '00';
}
const utcStamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
/** 한국 시각 날짜의 23:59:59 를 UTC 문자열로(UNTIL 용) */
function untilUtc(date) { const [y, m, d] = date.slice(0, 10).split('-').map(Number); return utcStamp(new Date(Date.UTC(y, m - 1, d, 23 - 9, 59, 59))); }
const seq = iso => iso ? Math.floor(new Date(iso).getTime() / 60000) : 0;

const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:' + TZ, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE'];

export function apptTimes(a) {
  if (!a.visit_time) return {allDay: true, start: ymd(a.visit_date), end: ymd(addDaysStr(a.visit_date, 1))};
  return {allDay: false, start: localDateTime(a.visit_date, a.visit_time), end: localDateTime(a.visit_date, a.visit_time, 60)};
}
export function apptTitle(a, patientName) { return `[진료] ${patientName ? patientName + ' · ' : ''}${a.hospital}${a.department ? ' ' + a.department : ''}`; }
export function apptDetails(a, patientName, companionName) {
  return [patientName && `환자: ${patientName}`, a.department && `진료과: ${a.department}`, a.doctor && `담당 의사: ${a.doctor}`, `동행: ${companionName || '미정'}`, a.status && `상태: ${a.status}`, 'Family Health Hub에서 만든 일정입니다.'].filter(Boolean).join('\n');
}

/**
 * data: {calName, patients:[{id,name}], appointments:[…], medications:[…], companions?:{id:name}, options:{include_meds, show_med_names}, now?: Date}
 * 진단명·메모·증상 등 진료 기록 내용은 포함하지 않습니다.
 */
export function buildIcs({calName = 'Family Health Hub', patients = [], appointments = [], medications = [], options = {}, now = new Date(), refreshHours = 1}) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Health Hub//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(calName), 'X-WR-TIMEZONE:' + TZ, `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`, `X-PUBLISHED-TTL:PT${refreshHours}H`, ...VTIMEZONE];
  const name = id => patients.find(p => p.id === id)?.name || '';
  const stamp = utcStamp(now);
  for (const a of appointments) {
    const t = apptTimes(a), cancelled = a.status === '취소';
    L.push('BEGIN:VEVENT', `UID:appt-${a.id}@family-health-hub`, 'DTSTAMP:' + stamp);
    if (a.updated_at || a.created_at) L.push('LAST-MODIFIED:' + utcStamp(new Date(a.updated_at || a.created_at)), 'SEQUENCE:' + seq(a.updated_at || a.created_at));
    L.push(t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART;TZID=${TZ}:${t.start}`, t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND;TZID=${TZ}:${t.end}`,
      'SUMMARY:' + esc(apptTitle(a, name(a.patient_id))), 'LOCATION:' + esc(a.hospital),
      'DESCRIPTION:' + esc(apptDetails(a, name(a.patient_id), a.companion_name)), 'STATUS:' + (cancelled ? 'CANCELLED' : 'CONFIRMED'), 'TRANSP:OPAQUE');
    if (!cancelled) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('진료 일정 알림'), 'TRIGGER:-PT120M', 'END:VALARM');
    L.push('END:VEVENT');
  }
  if (options.include_meds !== false) {
    for (const m of medications) {
      for (const t of (m.times || [])) {
        const first = (m.start_date || String(m.created_at || now.toISOString()).slice(0, 10)).slice(0, 10), p = name(m.patient_id);
        const label = options.show_med_names === false ? `[복약] ${p ? p + ' · ' : ''}${t}` : `[복약] ${p ? p + ' · ' : ''}${t} ${m.name}${m.dosage ? ' ' + m.dosage : ''}`;
        L.push('BEGIN:VEVENT', `UID:med-${m.id}-${t.replace(':', '')}@family-health-hub`, 'DTSTAMP:' + stamp);
        if (m.updated_at || m.created_at) L.push('LAST-MODIFIED:' + utcStamp(new Date(m.updated_at || m.created_at)), 'SEQUENCE:' + seq(m.updated_at || m.created_at));
        L.push(`DTSTART;TZID=${TZ}:${localDateTime(first, t)}`, 'DURATION:PT10M',
          'RRULE:FREQ=DAILY' + (m.end_date ? ';UNTIL=' + untilUtc(m.end_date) : ''), 'SUMMARY:' + esc(label),
          'DESCRIPTION:' + esc(`복약 시간입니다. 복용 확인은 Family Health Hub 앱에서 합니다.${m.instructions && options.show_med_names !== false ? '\n복용 방법: ' + m.instructions : ''}`),
          'TRANSP:TRANSPARENT', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('복약 시간'), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
      }
    }
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/** 구글 캘린더 '일정 추가' 화면 링크(로그인·API 키 불필요) */
export function googleCalendarUrl(a, patientName, companionName) {
  const t = apptTimes(a), q = new URLSearchParams({action: 'TEMPLATE', text: apptTitle(a, patientName), details: apptDetails(a, patientName, companionName), location: a.hospital || ''});
  q.set('dates', t.start + '/' + t.end); if (!t.allDay) q.set('ctz', TZ);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}
