import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

globalThis.localStorage ??= (() => { const m = new Map(); return {getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; })();

const F = await import('../src/lib/format.js');
const A = await import('../src/lib/access.js');
const E = await import('../src/lib/errors.js');
const I = await import('../src/lib/invite.js');
const Z = await import('../src/lib/zip.js');
const C = await import('../src/lib/csv.js');
const R = await import('../src/lib/report.js');
const L = await import('../src/lib/lock.js');
const M = await import('../src/lib/reminders.js');

test('날짜 유틸', () => {
  assert.equal(F.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(F.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(F.diffDays('2026-11-05', '2026-11-01'), 4);
  assert.equal(F.relativeDay('2026-11-02', '2026-11-01'), '내일');
  assert.equal(F.relativeDay('2026-11-04', '2026-11-01'), 'D-3');
  assert.equal(F.fmtDate('2026-11-01'), '11월 1일 (일)');
  assert.equal(F.ageOf('1950-11-02', '2026-11-01'), 75);
  assert.equal(F.ageOf('1950-11-01', '2026-11-01'), 76);
  const g = F.monthGrid(2026, 10);
  assert.equal(g.length % 7, 0);
  assert.equal(g.filter(Boolean).length, 30);
  assert.equal(g[0], '2026-11-01'); // 2026-11-01은 일요일
  assert.equal(F.timeAgo(new Date(Date.now() - 5 * 60000).toISOString()), '5분 전');
});

test('접근 규칙이 서버 RLS와 같은 우선순위를 따른다', () => {
  const p = {id: 'p1', is_private: false}, priv = {id: 'p2', is_private: true};
  const owner = {user_id: 'u1', role: 'owner', status: 'approved', default_access: 'edit'};
  const edit = {user_id: 'u2', role: 'caregiver', status: 'approved', default_access: 'edit'};
  const view = {...edit, user_id: 'u3', default_access: 'view'};
  const none = {...edit, user_id: 'u4', default_access: 'none'};
  const pending = {...edit, status: 'pending'};
  assert.deepEqual(A.accessFor(owner, priv), {view: true, create: true, edit: true});
  assert.equal(A.accessFor(edit, p).edit, true);
  assert.equal(A.accessFor(edit, priv).view, false);
  assert.deepEqual(A.accessFor(view, p), {view: true, create: false, edit: false});
  assert.equal(A.accessFor(none, p).view, false);
  assert.equal(A.accessFor(pending, p).view, false);
  const perms = [{patient_id: 'p1', user_id: 'u2', can_view: false, can_create: false, can_edit: false}, {patient_id: 'p2', user_id: 'u3', can_view: true, can_create: false, can_edit: false}];
  assert.equal(A.accessFor(edit, p, perms).view, false);
  assert.deepEqual(A.accessFor(view, priv, perms), {view: true, create: false, edit: false});
  assert.equal(A.canAddPatient(edit), true); assert.equal(A.canAddPatient(view), false);
  assert.equal(A.memberName([{user_id: 'u1', display_name: '김'}], 'zzz'), '탈퇴한 사용자');
});

test('오류 문구 한글화', () => {
  assert.match(E.friendlyError({message: 'new row violates row-level security policy for table "patients"'}), /권한/);
  assert.match(E.friendlyError({message: 'Invalid family code'}), /코드/);
  assert.match(E.friendlyError({code: '23505', message: 'duplicate key'}), /이미 처리/);
  assert.equal(E.isSchemaOutdated({code: '42703', message: 'column family_members.default_access does not exist'}), true);
  assert.equal(E.isSchemaOutdated({code: '42501', message: 'x'}), false);
  assert.match(E.authMessage({code: 'invalid_credentials'}), /올바르지/);
});

test('초대 코드·링크', () => {
  assert.equal(I.formatCode('abc123def456ghi789'), 'ABC123-DEF456-GHI789');
  assert.equal(I.normalizeCode(' abc-123 def '), 'ABC123DEF');
  assert.equal(I.inviteLink('ABC 123', 'https://x.test/app/'), 'https://x.test/app/?join=ABC123');
  assert.equal(I.readJoinParam('?join=abc-123'), 'ABC123');
  assert.match(I.inviteMessage('우리 가족', 'AAAAAAAAAAAAAAAAAA', 'https://x.test/'), /우리 가족.*\n[\s\S]*join=A+/);
});

test('ZIP: 표준 도구로 열리고 CRC·한글 파일명이 유지된다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fhhzip-'));
  const bin = new Uint8Array(70000).map((_, i) => (i * 31) & 255);
  const zip = Z.createZip([{name: '요약/기록.csv', data: '﻿이름,값\r\n가,1\r\n'}, {name: 'files/a.bin', data: bin}, {name: 'empty.txt', data: ''}]);
  const path = join(dir, 'x.zip'); writeFileSync(path, zip);
  const out = execFileSync('python3', ['-I', '-c', `
import zipfile,sys
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(sorted(z.namelist())); print(len(z.read('files/a.bin')))
print(z.read('요약/기록.csv').decode('utf-8-sig').splitlines()[1])`, path]).toString();
  assert.match(out, /요약\/기록\.csv/); assert.match(out, /70000/); assert.match(out, /가,1/);
  assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('CSV: 따옴표/줄바꿈/수식 주입 방지', () => {
  assert.equal(C.csvCell('a,b'), '"a,b"');
  assert.equal(C.csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(C.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(C.csvCell(['08:00', '20:00']), '08:00 20:00');
  const out = C.toCsv([{a: 1, b: '줄\n바꿈'}], [{key: 'a', label: 'A'}, {key: 'b', label: 'B'}]);
  assert.ok(out.startsWith('﻿A,B\r\n1,"줄\n바꿈"'));
});

test('리포트: 기간·삭제 항목 제외, HTML 이스케이프', () => {
  const patient = {id: 'p', name: '<b>홍</b>', birth_date: '1950-01-01'};
  const d = R.selectReportData({patient, from: '2026-01-01', today: '2026-11-01',
    medications: [{patient_id: 'p', name: '약A', active: true}, {patient_id: 'p', name: '중단약', active: false}, {patient_id: 'p', name: '삭제약', deleted_at: 'x'}],
    records: [{patient_id: 'p', visit_date: '2026-05-01', diagnosis: '감기'}, {patient_id: 'p', visit_date: '2025-05-01', diagnosis: '옛날'}],
    appointments: [{patient_id: 'p', visit_date: '2026-12-01', hospital: 'H', status: '예약완료'}, {patient_id: 'p', visit_date: '2026-12-02', hospital: 'X', status: '취소'}]});
  assert.equal(d.meds.length, 1); assert.equal(d.records.length, 1); assert.equal(d.upcoming.length, 1);
  const html = R.buildReportHtml({patient, ...d, today: '2026-11-01'});
  assert.ok(!html.includes('<b>홍</b>')); assert.match(html, /&lt;b&gt;홍/); assert.match(html, /감기/);
  assert.match(R.buildReportText({patient, ...d, today: '2026-11-01'}), /약A/);
});

test('앱 잠금: PIN 검증, 오입력 지연, 해제', async () => {
  assert.equal(L.hasPin(), false);
  await assert.rejects(L.setPin('12'), /4~8/);
  await L.setPin('4321', 10);
  assert.equal(L.hasPin(), true); assert.equal(L.autoLockMinutes(), 10);
  assert.equal(await L.verifyPin('4321'), true);
  const t = Date.now();
  for (let i = 0; i < 5; i++) assert.equal(await L.verifyPin('0000', t), false);
  assert.ok(L.lockedOutSeconds(t) > 0);
  assert.equal(await L.verifyPin('4321', t), false); // 대기 중에는 정답도 거부
  assert.equal(await L.verifyPin('4321', t + 60000), true);
  assert.ok(!localStorage.getItem('fhh:lock').includes('4321'));
  L.clearPin(); assert.equal(L.hasPin(), false);
});

test('알림 일정 계산', () => {
  const now = new Date(2026, 10, 1, 9, 0, 0);
  const patients = [{id: 'p', name: '홍길동'}];
  const base = {appointments: [{id: 'a1', patient_id: 'p', visit_date: '2026-11-02', visit_time: '10:00:00', hospital: '서울병원', status: '예약완료'}],
    medications: [{id: 'm1', patient_id: 'p', name: '약', dosage: '1정', times: ['08:00', '20:00'], active: true}], patients, now};
  assert.deepEqual(M.buildSchedule({...base, prefs: {...M.DEFAULT_PREFS}}), []); // 꺼짐
  const prefs = {...M.DEFAULT_PREFS, enabled: true, patients: {p: {meds: true, appts: true}}};
  const s = M.buildSchedule({...base, prefs});
  assert.ok(s.every(x => x.at > now));
  assert.ok(s.every((x, i) => i === 0 || s[i - 1].at <= x.at));
  assert.ok(s.some(x => /진료/.test(x.title)));
  assert.ok(!s.some(x => x.body.includes('서울병원')), '기본값은 잠금 화면에 상세 내용을 노출하지 않음');
  assert.ok(s.filter(x => /복약/.test(x.title)).length >= 8);
  const d = M.buildSchedule({...base, prefs: {...prefs, showDetail: true}});
  assert.ok(d.some(x => x.body.includes('서울병원')) && d.some(x => x.title.includes('홍길동')));
  const only = M.buildSchedule({...base, prefs: {...prefs, patients: {p: {meds: false, appts: true}}}});
  assert.ok(!only.some(x => /복약/.test(x.title)));
  assert.equal(M.hashId('abc'), M.hashId('abc'));
  assert.ok(M.buildSchedule({...base, prefs, max: 3}).length === 3);
  const done = M.buildSchedule({...base, appointments: [{...base.appointments[0], status: '진료완료'}], prefs});
  assert.ok(!done.some(x => /진료/.test(x.title)));
});

test('복약 항목 계산: 기간·중단·시간 정렬·복용 현황', async () => {
  const {daySlots, groupBySlot, recentAdherence, intakeKey} = await import('../src/lib/meds.js');
  const meds = [
    {id: 'a', patient_id: 'p', name: '아침약', times: ['20:00', '08:00'], active: true},
    {id: 'b', patient_id: 'p', name: '시간없음', times: [], active: true},
    {id: 'c', patient_id: 'p', name: '중단', times: ['08:00'], active: false},
    {id: 'd', patient_id: 'p', name: '종료됨', times: ['09:00'], active: true, end_date: '2026-10-31'},
    {id: 'e', patient_id: 'q', name: '타인', times: ['07:00'], active: true},
    {id: 'f', patient_id: 'p', name: '삭제', times: ['07:30'], active: true, deleted_at: 'x'},
  ];
  const rows = daySlots(meds, '2026-11-01', ['p']);
  assert.deepEqual(rows.map(r => r.slot), ['08:00', '20:00', 'any']);
  assert.equal(groupBySlot(rows).length, 3);
  const adh = recentAdherence(meds, [{medication_id: 'a', scheduled_date: '2026-11-01', slot: '08:00', status: 'taken'}], 'p', '2026-11-01', 3);
  assert.equal(adh.length, 3); assert.equal(adh[2].taken, 1); assert.equal(adh[2].total, 3);
  assert.equal(intakeKey('a', '2026-11-01', 'any'), 'a|2026-11-01|any');
});

test('조사 선택(을/를)', () => {
  assert.equal(F.eul('진료 일정'), '진료 일정을'); assert.equal(F.eul('진료 기록'), '진료 기록을');
  assert.equal(F.eul('복약 계획'), '복약 계획을'); assert.equal(F.eul('환자'), '환자를');
});
