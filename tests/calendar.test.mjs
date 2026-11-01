import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const {buildIcs, googleCalendarUrl, fold, esc} = await import('../supabase/functions/_shared/ics.js');
const {handleFeedRequest, tokenFromUrl} = await import('../supabase/functions/_shared/feed.js');
const {apptShareText, medShareText, clipLines} = await import('../src/lib/share.js');

const patients = [{id: 'p1', name: '김영희'}, {id: 'p2', name: '김철수'}];
const appointments = [
  {id: 'a1', patient_id: 'p1', hospital: '서울대병원', department: '내과', doctor: '이의사', visit_date: '2026-11-05', visit_time: '10:30:00', status: '예약완료', companion_name: '김민지', note: '절대노출금지메모', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-20T03:00:00Z'},
  {id: 'a2', patient_id: 'p2', hospital: '연세정형외과, 본관; 3층', department: null, visit_date: '2026-11-06', visit_time: null, status: '예약완료'},
  {id: 'a3', patient_id: 'p1', hospital: '취소병원', visit_date: '2026-11-07', visit_time: '09:00', status: '취소'},
];
const medications = [
  {id: 'm1', patient_id: 'p1', name: '아모디핀', dosage: '5mg 1정', instructions: '식후', times: ['08:00', '20:00'], start_date: '2026-10-01', end_date: '2026-12-31', created_at: '2026-10-01T00:00:00Z'},
  {id: 'm2', patient_id: 'p2', name: '아주아주아주아주아주긴약이름'.repeat(4), times: ['12:00'], created_at: '2026-10-10T00:00:00Z'},
];
const now = new Date('2026-11-01T00:00:00Z');

test('ICS: 형식·접기·이스케이프·상태·개인정보', () => {
  const ics = buildIcs({calName: '가족, 일정', patients, appointments, medications, options: {include_meds: true, show_med_names: true}, now});
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, '75옥텟 초과: ' + line);
  assert.ok(ics.includes('X-WR-CALNAME:가족\\, 일정'));
  assert.ok(ics.includes('DTSTART;TZID=Asia/Seoul:20261105T103000') && ics.includes('DTEND;TZID=Asia/Seoul:20261105T113000'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261106') && ics.includes('DTEND;VALUE=DATE:20261107'), '시간 없는 일정은 종일');
  assert.ok(ics.includes('STATUS:CANCELLED'));
  assert.ok(!ics.includes('절대노출금지메모'), '일정 메모는 포함하지 않음');
  assert.ok(ics.replace(/\r\n /g, '').includes('연세정형외과\\, 본관\; 3층'));
  assert.ok(ics.includes('RRULE:FREQ=DAILY;UNTIL=20261231T145959Z'), '한국 시각 12/31 23:59:59 = UTC 14:59:59');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3 + 3);
  assert.ok(ics.includes('SEQUENCE:'));
  const noNames = buildIcs({patients, appointments: [], medications, options: {include_meds: true, show_med_names: false}, now});
  assert.ok(!noNames.includes('아모디핀') && noNames.includes('[복약] 김영희 · 08:00'));
  const noMeds = buildIcs({patients, appointments: [], medications, options: {include_meds: false}, now});
  assert.ok(!noMeds.includes('BEGIN:VEVENT'));
  assert.equal(esc('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  assert.equal(fold('가'.repeat(60)).split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), true);
});

const hasIcalendar = (() => { try { execFileSync('python3', ['-I', '-c', 'import icalendar']); return true; } catch { return false; } })();
test('ICS: 표준 파서(icalendar)로 읽힌다', {skip: !hasIcalendar && 'python icalendar 미설치(pip install icalendar)'}, () => {
  const ics = buildIcs({calName: '테스트', patients, appointments, medications, options: {}, now});
  const f = join(mkdtempSync(join(tmpdir(), 'fhhics-')), 't.ics'); writeFileSync(f, ics);
  const out = execFileSync('python3', ['-I', '-c', `
import sys
from icalendar import Calendar
c=Calendar.from_ical(open(sys.argv[1],'rb').read())
ev=[e for e in c.walk('VEVENT')]
print(len(ev)); print([str(e['SUMMARY']) for e in ev][0])
e=ev[0]; print(e.decoded('DTSTART').isoformat(), e.decoded('DTSTART').tzinfo is not None)
r=[e for e in ev if 'RRULE' in e][0]; print(r['RRULE']['FREQ'], r['RRULE'].get('UNTIL'))
`, f]).toString().split('\n');
  assert.equal(out[0], '6'); assert.match(out[1], /\[진료\] 김영희 · 서울대병원 내과/);
  assert.match(out[2], /2026-11-05T10:30:00\+09:00 True/); assert.match(out[3], /DAILY/);
});

test('구글 캘린더 일정 추가 링크', () => {
  const u = new URL(googleCalendarUrl(appointments[0], '김영희', '김민지'));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('dates'), '20261105T103000/20261105T113000');
  assert.equal(u.searchParams.get('ctz'), 'Asia/Seoul');
  assert.match(u.searchParams.get('text'), /김영희/); assert.match(u.searchParams.get('details'), /동행: 김민지/);
  assert.ok(!u.searchParams.get('details').includes('절대노출금지메모'));
  const allDay = new URL(googleCalendarUrl(appointments[1], '김철수'));
  assert.equal(allDay.searchParams.get('dates'), '20261106/20261107'); assert.equal(allDay.searchParams.get('ctz'), null);
});

test('공유 문구: 환자·병원 포함, 진단·메모 제외, 200자 제한', () => {
  const t = apptShareText(appointments[0], '김영희', '김민지');
  assert.match(t, /김영희님/); assert.match(t, /서울대병원 내과/); assert.match(t, /오전|10:30/); assert.match(t, /동행: 김민지/); assert.ok(!t.includes('메모'));
  const items = Array.from({length: 30}, (_, i) => ({patient: '김영희', med: '약' + i, slot: '08:00', by: i % 2 ? '김민지' : null}));
  const m = medShareText('2026-11-01', items);
  assert.ok(m.includes('✓') && m.includes('미확인'));
  const clipped = clipLines(m, 200); assert.ok(clipped.length <= 200 && /…외 \d+줄$/.test(clipped));
  assert.equal(clipLines('짧은 글', 200), '짧은 글');
  assert.match(medShareText('2026-11-01', []), /확인할 복약이 없습니다/);
});

test('구독 피드 핸들러: 토큰 검증·응답 헤더·오류', async () => {
  const token = 'a'.repeat(64), data = {calName: 'c', patients, appointments, medications, options: {}};
  assert.equal(tokenFromUrl(`https://x.test/functions/v1/calendar-feed/${token}.ics`), token);
  assert.equal(tokenFromUrl(`https://x.test/functions/v1/calendar-feed?t=${token.toUpperCase()}`), token);
  let asked = null;
  const ok = await handleFeedRequest(new Request(`https://x.test/functions/v1/calendar-feed/${token}.ics`), async t => { asked = t; return data; });
  assert.equal(ok.status, 200); assert.equal(asked, token);
  assert.match(ok.headers.get('content-type'), /text\/calendar/); assert.match(ok.headers.get('x-robots-tag'), /noindex/);
  assert.match(await ok.text(), /BEGIN:VCALENDAR/);
  assert.equal((await handleFeedRequest(new Request('https://x.test/functions/v1/calendar-feed/short.ics'), async () => data)).status, 404);
  assert.equal((await handleFeedRequest(new Request(`https://x.test/calendar-feed/${token}.ics`), async () => null)).status, 404);
  assert.equal((await handleFeedRequest(new Request(`https://x.test/calendar-feed/${token}.ics`), async () => { throw new Error('db'); })).status, 503);
  assert.equal((await handleFeedRequest(new Request(`https://x.test/calendar-feed/${token}.ics`, {method: 'POST'}), async () => data)).status, 405);
  const head = await handleFeedRequest(new Request(`https://x.test/calendar-feed/${token}.ics`, {method: 'HEAD'}), async () => data);
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
