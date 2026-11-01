// RLS / 권한 / RPC 회귀 테스트. 실행: npm run test:db
// PGlite(WASM Postgres) 위에 Supabase의 auth 스키마와 역할을 흉내 내어 실제 마이그레이션 SQL을 그대로 실행합니다.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite();
const U = {
  owner: '00000000-0000-0000-0000-0000000000a1',
  edit: '00000000-0000-0000-0000-0000000000a2',
  view: '00000000-0000-0000-0000-0000000000a3',
  none: '00000000-0000-0000-0000-0000000000a4',
  stranger: '00000000-0000-0000-0000-0000000000a5',
  other: '00000000-0000-0000-0000-0000000000a6',
};
let fam, code, otherFam, pAlice, pPriv;

async function as(uid, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || '']);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function rows(uid, sql, params) { return (await as(uid, sql, params)).rows; }
async function fails(uid, sql, params, pattern = /./) {
  await assert.rejects(() => as(uid, sql, params), pattern);
}
async function asRole(role, sql, params = []) {
  await db.exec('set role ' + role);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function sudo(sql, params) { return (await db.query(sql, params)).rows; }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated;
    create role service_role nologin; grant usage on schema public to service_role; grant usage on schema auth to service_role;
    -- Supabase Vault 모사(평문 저장). 운영에서는 실제 vault 확장이 암호화합니다.
    create schema vault;
    create table vault.secrets(id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
    create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid language plpgsql as $$ declare i uuid; begin insert into vault.secrets(name,description,secret) values(new_name,new_description,new_secret) returning id into i; return i; end $$;
    create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null) returns void language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
    create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
    -- PGlite에는 pgcrypto가 없어 초기 마이그레이션이 호출하는 함수만 대체합니다(운영 DB에는 실제 pgcrypto가 있음).
    create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(substr(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), 1, n * 2), 'hex') $$;
    create function public.digest(t text, a text) returns bytea language sql as $$ select sha256(convert_to(t, 'UTF8')) $$;
  `);
  for (const [k, id] of Object.entries(U)) await db.query('insert into auth.users(id,email) values ($1,$2)', [id, k + '@example.com']);
  await db.exec(readFileSync(join(dir, '20261031000000_initial.sql'), 'utf8').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(readFileSync(join(dir, '20261101000000_collaboration.sql'), 'utf8'));
  // 재실행 안전성(idempotent)
  await db.exec(readFileSync(join(dir, '20261101000000_collaboration.sql'), 'utf8'));
  await db.exec(readFileSync(join(dir, '20261102000000_calendar_feeds.sql'), 'utf8'));
  await db.exec(readFileSync(join(dir, '20261102000000_calendar_feeds.sql'), 'utf8'));
  await db.exec(readFileSync(join(dir, '20261103000000_visit_details.sql'), 'utf8'));
  await db.exec(readFileSync(join(dir, '20261103000000_visit_details.sql'), 'utf8'));
});

test('패밀리 생성과 코드 조회는 관리자에게만 허용된다', async () => {
  const r = (await rows(U.owner, "select public.create_family('테스트 가족','관리자 김') as r"))[0].r;
  fam = r.family_id; code = r.invite_code;
  assert.match(code, /^[0-9A-F]{18}$/);
  assert.equal((await rows(U.owner, 'select public.get_family_code($1) as c', [fam]))[0].c, code);
  await fails(U.stranger, 'select public.get_family_code($1)', [fam], /Not permitted/);
  const o = (await sudo("select display_name, role, default_access from public.family_members where user_id=$1", [U.owner]))[0];
  assert.deepEqual(o, {display_name: '관리자 김', role: 'owner', default_access: 'edit'});
});

test('가입 신청은 공백·소문자 코드도 허용하며 승인 전에는 아무것도 볼 수 없다', async () => {
  const spaced = code.slice(0, 6).toLowerCase() + ' ' + code.slice(6, 12).toLowerCase() + '-' + code.slice(12);
  await rows(U.edit, 'select public.request_family_join($1,$2,$3,$4)', [spaced, '박공동', '010-1111-2222', '자녀']);
  await rows(U.view, 'select public.request_family_join($1,$2)', [code, '이열람']);
  await rows(U.none, 'select public.request_family_join($1,$2)', [code, '최지정']);
  await fails(U.stranger, 'select public.request_family_join($1,$2)', ['WRONGCODE', '낯선이'], /Invalid family code/);
  assert.equal((await rows(U.edit, 'select * from public.patients')).length, 0);
  assert.equal((await rows(U.edit, 'select * from public.my_join_requests()')).length, 1);
  // 신청자 본인은 자기 신청 상태만 읽는다
  assert.equal((await rows(U.edit, 'select * from public.family_join_requests')).length, 1);
});

test('승인은 관리자만, 접근 수준 프리셋이 반영된다', async () => {
  const reqs = await rows(U.owner, "select id, user_id from public.family_join_requests where status='pending'");
  assert.equal(reqs.length, 3);
  const idOf = u => reqs.find(r => r.user_id === u).id;
  await fails(U.edit, "select public.approve_family_join($1,'edit')", [idOf(U.edit)], /Not permitted/);
  await rows(U.owner, "select public.approve_family_join($1,'edit')", [idOf(U.edit)]);
  await rows(U.owner, "select public.approve_family_join($1,'view')", [idOf(U.view)]);
  await rows(U.owner, "select public.approve_family_join($1,'none')", [idOf(U.none)]);
  const m = await sudo('select user_id, default_access, display_name, relationship from public.family_members order by display_name');
  assert.equal(m.find(x => x.user_id === U.edit).default_access, 'edit');
  assert.equal(m.find(x => x.user_id === U.edit).relationship, '자녀');
  assert.equal(m.find(x => x.user_id === U.view).default_access, 'view');
  await fails(U.owner, "select public.approve_family_join($1,'superuser')", [idOf(U.none)]);
});

test('구성원이 직접 멤버십·신청 상태를 바꾸는 것은 차단된다', async () => {
  await fails(U.edit, "update public.family_members set role='owner' where user_id=$1 returning 1", [U.edit]).catch(() => {});
  const res = await as(U.edit, "update public.family_members set role='owner' where user_id=$1", [U.edit]);
  assert.equal(res.affectedRows, 0);
  await fails(U.stranger, "insert into public.family_members(family_id,user_id,role,status) values ($1,$2,'owner','approved')", [fam, U.stranger]);
  assert.equal((await as(U.none, "update public.family_join_requests set status='approved'")).affectedRows, 0);
});

test('공동 보호자는 환자를 등록하고, 열람 보호자는 등록할 수 없다', async () => {
  pAlice = (await rows(U.owner, "insert into public.patients(family_id,name,relationship) values ($1,'앨리스','어머니') returning id", [fam]))[0].id;
  const pBob = (await rows(U.edit, "insert into public.patients(family_id,name,relationship) values ($1,'밥','아버지') returning id", [fam]))[0].id;
  assert.ok(pBob);
  await fails(U.view, "insert into public.patients(family_id,name) values ($1,'몰래')", [fam], /row-level security/);
  await fails(U.none, "insert into public.patients(family_id,name) values ($1,'몰래')", [fam], /row-level security/);
  await fails(U.stranger, "insert into public.patients(family_id,name) values ($1,'몰래')", [fam], /row-level security/);
  // created_by 기록
  assert.equal((await sudo('select created_by from public.patients where id=$1', [pBob]))[0].created_by, U.edit);
});

test('기본 접근 수준에 따라 조회 범위가 달라진다', async () => {
  assert.equal((await rows(U.owner, 'select * from public.patients')).length, 2);
  assert.equal((await rows(U.edit, 'select * from public.patients')).length, 2);
  assert.equal((await rows(U.view, 'select * from public.patients')).length, 2);
  assert.equal((await rows(U.none, 'select * from public.patients')).length, 0);
  assert.equal((await rows(U.stranger, 'select * from public.patients')).length, 0);
});

test('편집/열람/무권한 구성원의 일정·기록·복약 쓰기 권한', async () => {
  const ins = "insert into public.appointments(family_id,patient_id,hospital,visit_date) values ($1,$2,'서울병원','2026-11-10') returning id";
  const ap = (await rows(U.edit, ins, [fam, pAlice]))[0].id;
  await fails(U.view, ins, [fam, pAlice], /row-level security/);
  await fails(U.none, ins, [fam, pAlice], /row-level security/);
  // 다른 가족 id를 끼워 넣는 위조
  await fails(U.edit, ins, [crypto.randomUUID(), pAlice], /row-level security/);
  assert.equal((await as(U.view, "update public.appointments set hospital='변조' where id=$1", [ap])).affectedRows, 0);
  assert.equal((await as(U.edit, "update public.appointments set hospital='서울대병원', companion_id=$2 where id=$1", [ap, U.edit])).affectedRows, 1);
  const a = (await sudo('select hospital, updated_by, updated_at, created_by from public.appointments where id=$1', [ap]))[0];
  assert.equal(a.hospital, '서울대병원'); assert.equal(a.updated_by, U.edit); assert.equal(a.created_by, U.edit); assert.ok(a.updated_at);
  await rows(U.edit, "insert into public.medical_records(family_id,patient_id,visit_date,diagnosis) values ($1,$2,'2026-11-01','감기')", [fam, pAlice]);
  await rows(U.edit, "insert into public.medications(family_id,patient_id,name,times) values ($1,$2,'타이레놀','{08:00,20:00}')", [fam, pAlice]);
  assert.equal((await rows(U.view, 'select * from public.medications')).length, 1);
  assert.equal((await rows(U.none, 'select * from public.medications')).length, 0);
});

test('비공개 환자는 관리자와 명시 권한자만 볼 수 있다', async () => {
  pPriv = (await rows(U.owner, "insert into public.patients(family_id,name,is_private) values ($1,'비공개',true) returning id", [fam]))[0].id;
  assert.equal((await rows(U.edit, 'select * from public.patients where id=$1', [pPriv])).length, 0);
  await fails(U.edit, "insert into public.patients(family_id,name,is_private) values ($1,'x',true)", [fam], /owner/);
  assert.equal((await as(U.edit, 'update public.patients set is_private=false where id=$1', [pPriv])).affectedRows, 0);
  await rows(U.owner, 'insert into public.patient_permissions(family_id,patient_id,user_id,can_view) values ($1,$2,$3,true)', [fam, pPriv, U.edit]);
  assert.equal((await rows(U.edit, 'select * from public.patients where id=$1', [pPriv])).length, 1);
  // 열람만 허용된 사람은 쓰지 못한다
  await fails(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date) values ($1,$2,'x','2026-11-10')", [fam, pPriv], /row-level security/);
  // 명시 권한 + 환자 쪽 가시성: 열람 보호자(view)는 여전히 못 본다
  assert.equal((await rows(U.view, 'select * from public.patients where id=$1', [pPriv])).length, 0);
});

test('명시적 권한 행은 기본 접근 수준보다 우선한다(차단/승격)', async () => {
  await rows(U.owner, 'insert into public.patient_permissions(family_id,patient_id,user_id,can_view,can_create,can_edit) values ($1,$2,$3,false,false,false)', [fam, pAlice, U.edit]);
  assert.equal((await rows(U.edit, 'select * from public.appointments where patient_id=$1', [pAlice])).length, 0);
  await rows(U.owner, 'update public.patient_permissions set can_view=true, can_create=true, can_edit=true where patient_id=$1 and user_id=$2', [pAlice, U.edit]);
  assert.equal((await rows(U.edit, 'select * from public.appointments where patient_id=$1', [pAlice])).length, 1);
  await rows(U.owner, 'insert into public.patient_permissions(family_id,patient_id,user_id,can_view,can_create,can_edit) values ($1,$2,$3,true,true,true)', [fam, pAlice, U.view]);
  await rows(U.view, "insert into public.appointments(family_id,patient_id,hospital,visit_date) values ($1,$2,'승격 병원','2026-12-01')", [fam, pAlice]);
  await rows(U.owner, 'delete from public.patient_permissions where patient_id=$1 and user_id=$2', [pAlice, U.view]);
  await fails(U.view, "insert into public.appointments(family_id,patient_id,hospital,visit_date) values ($1,$2,'x','2026-12-02')", [fam, pAlice], /row-level security/);
  // 보호자가 자기 권한을 스스로 올릴 수 없다
  await fails(U.view, 'insert into public.patient_permissions(family_id,patient_id,user_id,can_view,can_create,can_edit) values ($1,$2,$3,true,true,true)', [fam, pAlice, U.view], /row-level security/);
});

test('다른 가족의 데이터와 격리된다', async () => {
  const r = (await rows(U.other, "select public.create_family('다른 가족') as r"))[0].r;
  otherFam = r.family_id;
  await rows(U.other, "insert into public.patients(family_id,name) values ($1,'타인')", [otherFam]);
  assert.equal((await rows(U.edit, "select * from public.patients where name='타인'")).length, 0);
  assert.equal((await rows(U.other, "select * from public.patients where name='앨리스'")).length, 0);
  await fails(U.edit, "insert into public.patients(family_id,name) values ($1,'침입')", [otherFam], /row-level security/);
  await fails(U.edit, 'select public.rotate_family_code($1)', [otherFam], /Not permitted/);
});

test('코드 재발급은 관리자만 가능하고 이전 코드는 즉시 무효가 된다', async () => {
  await fails(U.edit, 'select public.rotate_family_code($1)', [fam], /Not permitted/);
  const next = (await rows(U.owner, 'select public.rotate_family_code($1) as c', [fam]))[0].c;
  assert.notEqual(next, code);
  await fails(U.stranger, 'select public.request_family_join($1,$2)', [code, '낯선이'], /Invalid family code/);
  await rows(U.stranger, 'select public.request_family_join($1,$2)', [next, '낯선이']);
  const id = (await rows(U.owner, "select id from public.family_join_requests where user_id=$1", [U.stranger]))[0].id;
  await rows(U.owner, 'select public.reject_family_join($1)', [id]);
  assert.equal((await rows(U.stranger, "select * from public.my_join_requests()"))[0].status, 'rejected');
  assert.equal((await rows(U.stranger, 'select * from public.patients')).length, 0);
});

test('복약 확인: 권한자만, 중복 불가, 위조 불가, 본인 취소', async () => {
  const med = (await sudo("select id from public.medications limit 1"))[0].id;
  const ins = "insert into public.med_intakes(family_id,patient_id,medication_id,scheduled_date,slot,taken_by) values ($1,$2,$3,'2026-11-01',$4,$5) returning id";
  const id = (await rows(U.edit, ins, [fam, pAlice, med, '08:00', U.edit]))[0].id;
  await fails(U.owner, ins, [fam, pAlice, med, '08:00', U.owner], /unique|duplicate/);
  await fails(U.edit, ins, [fam, pAlice, med, '20:00', U.owner], /row-level security/); // 타인 명의 위조
  await fails(U.none, ins, [fam, pAlice, med, '20:00', U.none], /row-level security/);
  assert.equal((await rows(U.view, 'select * from public.med_intakes')).length, 1);
  assert.equal((await as(U.view, 'delete from public.med_intakes where id=$1', [id])).affectedRows, 0);
  assert.equal((await as(U.edit, 'delete from public.med_intakes where id=$1', [id])).affectedRows, 1);
});

test('첨부 메타데이터는 경로 규칙과 권한을 강제한다', async () => {
  const path = `${fam}/${pAlice}/${crypto.randomUUID()}.pdf`;
  const ins = "insert into public.attachments(family_id,patient_id,kind,file_name,storage_path,created_by) values ($1,$2,'처방전','a.pdf',$3,$4) returning id";
  await fails(U.edit, ins, [fam, pAlice, 'evil/path.pdf', U.edit], /row-level security/);
  await fails(U.view, ins, [fam, pAlice, path, U.view], /row-level security/);
  const id = (await rows(U.edit, ins, [fam, pAlice, path, U.edit]))[0].id;
  assert.equal((await rows(U.view, 'select * from public.attachments')).length, 1);
  assert.equal((await rows(U.none, 'select * from public.attachments')).length, 0);
  assert.equal((await as(U.edit, 'update public.attachments set deleted_at=now() where id=$1', [id])).affectedRows, 1);
  const f = (n, op) => sudo('select fhh_private.storage_can($1,$2) as ok', [n, op]);
  assert.equal((await f('not-a-path', 'view'))[0].ok, false);
});

test('감사 로그: 기록되고, 위조할 수 없으며, 권한 범위만 보인다', async () => {
  const mine = await rows(U.owner, "select action, entity, label from public.audit_logs where entity in ('appointments','patients') order by created_at");
  assert.ok(mine.some(x => x.entity === 'patients' && x.action === 'create' && x.label === '앨리스'));
  assert.ok(mine.some(x => x.entity === 'appointments' && x.action === 'update'));
  const actors = await sudo("select actor_id from public.audit_logs where entity='appointments' and action='create'");
  assert.equal(actors[0].actor_id, U.edit);
  await fails(U.edit, "insert into public.audit_logs(family_id,action) values ($1,'fake')", [fam], /row-level security/);
  assert.equal((await rows(U.none, 'select * from public.audit_logs')).length, 0);
  assert.equal((await rows(U.stranger, 'select * from public.audit_logs')).length, 0);
  // 비공개 환자 이벤트는 권한 없는 보호자에게 보이지 않는다
  const v = await rows(U.view, "select * from public.audit_logs where patient_id=$1", [pPriv]);
  assert.equal(v.length, 0);
  // 휴지통 이동/복원 구분
  const ap = (await sudo("select id from public.appointments limit 1"))[0].id;
  await rows(U.edit, 'update public.appointments set deleted_at=now() where id=$1', [ap]);
  await rows(U.edit, 'update public.appointments set deleted_at=null where id=$1', [ap]);
  const acts = (await rows(U.owner, "select action from public.audit_logs where entity_id=$1 order by created_at", [ap])).map(x => x.action);
  assert.ok(acts.includes('trash') && acts.includes('restore'));
  await rows(U.edit, "select public.log_audit_event($1,'export','JSON')", [fam]);
  await fails(U.edit, "select public.log_audit_event($1,'login')", [fam], /Invalid action/);
  await fails(U.stranger, "select public.log_audit_event($1,'export')", [fam], /Not permitted/);
});

test('환자 삭제(휴지통)와 개인정보 설정 변경은 관리자 전용이다', async () => {
  await fails(U.edit, 'update public.patients set deleted_at=now() where id=$1', [pAlice], /owner/);
  assert.equal((await as(U.owner, 'update public.patients set deleted_at=now() where id=$1', [pAlice])).affectedRows, 1);
  assert.equal((await as(U.owner, 'update public.patients set deleted_at=null where id=$1', [pAlice])).affectedRows, 1);
});

test('구성원 역할: 마지막 관리자 보호, 관리자는 최대 2명', async () => {
  await fails(U.owner, "select public.update_member($1,$2,'caregiver','edit')", [fam, U.owner], /At least one owner/);
  await fails(U.edit, "select public.update_member($1,$2,'owner','edit')", [fam, U.edit], /Not permitted/);
  await rows(U.owner, "select public.update_member($1,$2,'owner','edit')", [fam, U.edit]);
  await fails(U.owner, "select public.update_member($1,$2,'owner','edit')", [fam, U.view], /Up to two owners/);
  await rows(U.owner, "select public.update_member($1,$2,'caregiver','view')", [fam, U.edit]);
  assert.equal((await sudo('select default_access from public.family_members where user_id=$1', [U.edit]))[0].default_access, 'view');
  await rows(U.owner, "select public.update_member($1,$2,'caregiver','edit')", [fam, U.edit]);
});

test('구성원 제거/탈퇴 후 데이터 접근이 즉시 사라진다', async () => {
  await fails(U.owner, 'select public.remove_member($1,$2)', [fam, U.owner], /At least one owner/);
  await fails(U.view, 'select public.remove_member($1,$2)', [fam, U.edit], /Not permitted/);
  await rows(U.view, 'select public.remove_member($1,$2)', [fam, U.view]); // 본인 탈퇴
  assert.equal((await rows(U.view, 'select * from public.patients')).length, 0);
  await rows(U.owner, 'select public.remove_member($1,$2)', [fam, U.none]);
  assert.equal((await sudo("select status from public.family_members where user_id=$1", [U.none]))[0].status, 'revoked');
  assert.equal((await sudo('select count(*)::int c from public.patient_permissions where user_id=$1', [U.none]))[0].c, 0);
});

test('내 프로필 수정과 동의 기록은 본인 범위만', async () => {
  await rows(U.edit, "select public.update_my_profile($1,'박공동2','자녀','010')", [fam]);
  assert.equal((await sudo('select display_name from public.family_members where user_id=$1', [U.edit]))[0].display_name, '박공동2');
  await fails(U.view, "select public.update_my_profile($1,'x')", [fam], /Not permitted/);
  await rows(U.edit, "insert into public.user_consents(user_id,version) values ($1,'2026-11-01')", [U.edit]);
  await fails(U.edit, "insert into public.user_consents(user_id,version) values ($1,'x')", [U.owner], /row-level security/);
  assert.equal((await rows(U.owner, 'select * from public.user_consents')).length, 0);
});

test('휴지통 정리는 관리자만, 기간 경과분만 삭제', async () => {
  const ap = (await sudo("select id from public.appointments limit 1"))[0].id;
  await rows(U.edit, 'update public.appointments set deleted_at=now() where id=$1', [ap]);
  await fails(U.edit, 'select public.empty_trash($1,0)', [fam], /Not permitted/);
  assert.equal((await rows(U.owner, 'select public.empty_trash($1,30) as n', [fam]))[0].n, 0);
  assert.ok((await rows(U.owner, 'select public.empty_trash($1,0) as n', [fam]))[0].n >= 1);
  assert.equal((await sudo('select count(*)::int c from public.appointments where id=$1', [ap]))[0].c, 0);
});

test('캘린더 구독 피드: 토큰 접근, 권한 범위, 회수', async () => {
  // 위 테스트들에서 edit 구성원은 관리자로 승격되었다가 보호자로 복귀한 상태. 시나리오용 데이터를 새로 만든다.
  const viewer = U.view, none = U.none;
  await rows(U.owner, "select public.rotate_family_code($1)", [fam]);
  const f2 = (await rows(U.owner, "select public.create_family('피드 가족','피드관리자') as r"))[0].r.family_id; // owner 소유 두 번째 가족
  const pub = (await rows(U.owner, "insert into public.patients(family_id,name) values ($1,'공개환자') returning id", [f2]))[0].id;
  const prv = (await rows(U.owner, "insert into public.patients(family_id,name,is_private) values ($1,'비공개환자',true) returning id", [f2]))[0].id;
  for (const p of [pub, prv]) {
    await rows(U.owner, "insert into public.appointments(family_id,patient_id,hospital,visit_date,visit_time,note,status) values ($1,$2,'피드병원',current_date + 3,'10:30','비밀메모','예약완료')", [f2, p]);
    await rows(U.owner, "insert into public.medications(family_id,patient_id,name,times,dosage) values ($1,$2,'피드약','{08:00}','1정')", [f2, p]);
  }
  await rows(U.owner, "insert into public.medical_records(family_id,patient_id,visit_date,diagnosis,memo) values ($1,$2,current_date,'민감진단','민감메모')", [f2, pub]);
  // 구성원 view 승인
  await rows(U.stranger, 'select public.request_family_join((select code_plain from fhh_private.family_codes where family_id=$1),$2)', [f2, '낯선이']).catch(async () => {
    const code = (await sudo('select code_plain c from fhh_private.family_codes where family_id=$1', [f2]))[0].c;
    await rows(U.stranger, 'select public.request_family_join($1,$2)', [code, '낯선이']);
  });
  const rid = (await rows(U.owner, "select id from public.family_join_requests where family_id=$1 and status='pending'", [f2]))[0].id;
  await rows(U.owner, "select public.approve_family_join($1,'view')", [rid]);

  const tok = (await rows(U.owner, 'select public.create_calendar_feed($1) as t', [f2]))[0].t;
  assert.match(tok, /^[0-9a-f]{64}$/);
  // 익명은 토큰으로 피드를 읽을 수 있고, 관리자 피드에는 비공개 환자도 포함
  const anon = async (sql, params) => { await db.exec('set role anon'); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const feed = (await anon('select public.calendar_feed_data($1) as d', [tok]))[0].d;
  assert.equal(feed.patients.length, 2); assert.equal(feed.appointments.length, 2); assert.equal(feed.medications.length, 2);
  const flat = JSON.stringify(feed);
  assert.ok(!flat.includes('비밀메모') && !flat.includes('민감진단') && !flat.includes('민감메모'), '진료 기록·메모는 피드에 없다');
  assert.ok(feed.patients.every(p => p.name) && feed.calName.includes('피드 가족'));
  // 열람 구성원 피드에는 비공개 환자가 없다
  const vtok = (await rows(U.stranger, 'select public.create_calendar_feed($1,false,false) as t', [f2]))[0].t;
  const vfeed = (await anon('select public.calendar_feed_data($1) as d', [vtok]))[0].d;
  assert.deepEqual(vfeed.patients.map(p => p.name), ['공개환자']);
  assert.equal(vfeed.appointments.length, 1); assert.equal(vfeed.medications.length, 0); assert.equal(vfeed.options.include_meds, false);
  // 잘못된/없는 토큰
  assert.equal((await anon('select public.calendar_feed_data($1) as d', ['0'.repeat(64)]))[0].d, null);
  assert.equal((await anon("select public.calendar_feed_data($1) as d", ["x' or '1'='1"]))[0].d, null);
  // 익명은 테이블·생성 함수에 접근 불가
  await assert.rejects(() => anon('select * from public.calendar_feeds'), /permission denied/);
  await assert.rejects(() => anon('select public.create_calendar_feed($1)', [f2]), /permission denied/);
  // 타인은 내 피드 행을 못 본다
  assert.equal((await rows(U.stranger, 'select * from public.calendar_feeds')).length, 1);
  assert.equal((await rows(U.owner, 'select * from public.calendar_feeds')).length, 1);
  // 비구성원은 만들 수 없다
  await fails(U.none, 'select public.create_calendar_feed($1)', [f2], /Not permitted/);
  // 옵션 변경(토큰 유지), 재발급(기존 토큰 무효), 제거 후 무효
  await rows(U.owner, 'select public.update_calendar_feed($1,false,true,$2)', [f2, [pub]]);
  const upd = (await anon('select public.calendar_feed_data($1) as d', [tok]))[0].d;
  assert.deepEqual(upd.patients.map(p => p.name), ['공개환자']); assert.equal(upd.medications.length, 0);
  const tok2 = (await rows(U.owner, 'select public.create_calendar_feed($1) as t', [f2]))[0].t;
  assert.notEqual(tok2, tok);
  assert.equal((await anon('select public.calendar_feed_data($1) as d', [tok]))[0].d, null);
  assert.ok((await anon('select public.calendar_feed_data($1) as d', [tok2]))[0].d);
  // 구성원 제거 시 피드 즉시 무효
  await rows(U.owner, 'select public.remove_member($1,$2)', [f2, U.stranger]);
  assert.equal((await anon('select public.calendar_feed_data($1) as d', [vtok]))[0].d, null);
  await rows(U.owner, 'select public.delete_calendar_feed($1)', [f2]);
  assert.equal((await anon('select public.calendar_feed_data($1) as d', [tok2]))[0].d, null);
  assert.ok((await sudo('select count(*)::int c from public.calendar_feeds'))[0].c <= 1);
});

async function visitFamily() {
  const f = (await rows(U.owner, "select public.create_family('방문가족','관리자') as r"))[0].r.family_id;
  const code = (await sudo('select code_plain c from fhh_private.family_codes where family_id=$1', [f]))[0].c;
  for (const [u, lvl] of [[U.edit, 'edit'], [U.view, 'view'], [U.none, 'none']]) {
    await rows(u, 'select public.request_family_join($1,$2)', [code, '구성원' + lvl]);
    const rid = (await rows(U.owner, "select id from public.family_join_requests where family_id=$1 and user_id=$2 and status='pending'", [f, u]))[0].id;
    await rows(U.owner, 'select public.approve_family_join($1,$2)', [rid, lvl]);
  }
  const pt = (await rows(U.owner, "insert into public.patients(family_id,name) values ($1,'방문환자') returning id", [f]))[0].id;
  const pt2 = (await rows(U.owner, "insert into public.patients(family_id,name) values ($1,'다른환자') returning id", [f]))[0].id;
  return {f, pt, pt2};
}

test('진료 공통 필드·연결·단계: 권한, 제약, 체크 권한', async () => {
  const {f, pt, pt2} = await visitFamily();
  const insA = "insert into public.appointments(family_id,patient_id,hospital,visit_date,visit_time,kind,specialty,doctor,doctor_title,place,test_name,fasting_hours,booking_source,booking_ref,hospital_phone,fee_amount,notice_text,hours_note) values ($1,$2,'심뇌혈관병원','2026-12-10','10:20','검사','신경과','서우근','교수','별관 지하 2층','진단검사',8,'본인 예약','R-1','02-000-0000',12000,'원문','평일 06:30~18:00') returning id";
  const test = (await rows(U.edit, insA, [f, pt]))[0].id;
  await fails(U.view, insA, [f, pt], /row-level security/);
  const visit = (await rows(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date,kind) values ($1,$2,'심뇌혈관병원','2026-12-10','외래진료') returning id", [f, pt]))[0].id;
  // 제약
  await fails(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date,kind) values ($1,$2,'x','2026-12-10','엉터리')", [f, pt], /check/);
  await fails(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date,fasting_hours) values ($1,$2,'x','2026-12-10',100)", [f, pt], /check/);
  await fails(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date,fee_amount) values ($1,$2,'x','2026-12-10',-1)", [f, pt], /check/);
  // 연결: 같은 환자만, 자기 자신 불가
  assert.equal((await as(U.edit, "update public.appointments set related_appointment_id=$2, relation='test_before', related_lead_minutes=120 where id=$1", [test, visit])).affectedRows, 1);
  const other = (await rows(U.edit, "insert into public.appointments(family_id,patient_id,hospital,visit_date) values ($1,$2,'다른병원','2026-12-10') returning id", [f, pt2]))[0].id;
  await fails(U.edit, 'update public.appointments set related_appointment_id=$2 where id=$1', [test, other], /same patient/);
  await fails(U.edit, 'update public.appointments set related_appointment_id=$1 where id=$1', [test], /itself/);
  // 단계
  const insS = "insert into public.appointment_steps(family_id,patient_id,appointment_id,phase,kind,title,relative_minutes,sort) values ($1,$2,$3,$4,$5,$6,$7,1) returning id";
  const s1 = (await rows(U.edit, insS, [f, pt, test, 'before', '금식', '금식 시작', -480]))[0].id;
  const s2 = (await rows(U.edit, insS, [f, pt, test, 'during', '측정', '혈압·체중·신장 측정', null]))[0].id;
  await fails(U.view, insS, [f, pt, test, 'during', '대기', '대기', null], /row-level security/);
  await fails(U.edit, insS, [f, pt2, test, 'during', '대기', '다른 환자 일정에 붙이기', null], /row-level security/);
  await fails(U.edit, insS, [f, pt, test, 'before', '금식', '범위 초과', -99999], /check/);
  assert.equal((await rows(U.view, 'select * from public.appointment_steps where appointment_id=$1', [test])).length, 2);
  assert.equal((await rows(U.none, 'select * from public.appointment_steps')).length, 0);
  // 완료 체크: 등록 권한 이상만, 기록자 저장
  await rows(U.edit, 'select public.set_step_done($1,true)', [s1]);
  const done = (await sudo('select done_by, done_at from public.appointment_steps where id=$1', [s1]))[0];
  assert.equal(done.done_by, U.edit); assert.ok(done.done_at);
  await fails(U.view, 'select public.set_step_done($1,true)', [s2], /Not permitted/);
  await fails(U.none, 'select public.set_step_done($1,true)', [s2], /Not permitted/);
  await rows(U.edit, 'select public.set_step_done($1,false)', [s1]);
  assert.equal((await sudo('select done_at from public.appointment_steps where id=$1', [s1]))[0].done_at, null);
  // 열람자는 직접 수정·삭제 불가
  assert.equal((await as(U.view, "update public.appointment_steps set title='변조' where id=$1", [s1])).affectedRows, 0);
  assert.equal((await as(U.view, 'delete from public.appointment_steps where id=$1', [s1])).affectedRows, 0);
  assert.equal((await as(U.edit, 'delete from public.appointment_steps where id=$1', [s2])).affectedRows, 1);
  // 피드: 장소·준비는 포함, 의료진·예약번호·전화·수납·안내문 원문은 제외
  const tok = (await rows(U.owner, 'select public.create_calendar_feed($1) as t', [f]))[0].t;
  const feed = (await asRole('anon', 'select public.calendar_feed_data($1) as d', [tok]))[0].d;
  const a = feed.appointments.find(x => x.id === test), flat = JSON.stringify(feed);
  assert.equal(a.place, '별관 지하 2층'); assert.equal(a.fasting_hours, 8); assert.equal(a.kind, '검사'); assert.equal(a.steps_before.length, 1);
  for (const secret of ['서우근', 'R-1', '02-000-0000', '12000', '원문']) assert.ok(!flat.includes(secret), secret + ' 노출 금지');
  // 병원 정보
  const insH = "insert into public.hospitals(family_id,name,address,phone,map_url) values ($1,$2,'서울 어딘가','02-123','https://map.example/x') returning id";
  await rows(U.edit, insH, [f, '심뇌혈관병원']);
  await fails(U.edit, insH, [f, '심뇌혈관병원'], /unique|duplicate/);
  await fails(U.view, insH, [f, '다른병원'], /row-level security/);
  await fails(U.edit, "insert into public.hospitals(family_id,name,map_url) values ($1,'위험','javascript:alert(1)')", [f], /check/);
  assert.equal((await rows(U.view, 'select * from public.hospitals')).length, 1);
  assert.equal((await rows(U.stranger, 'select * from public.hospitals')).length, 0);
  assert.equal((await rows(U.none, 'select * from public.hospitals')).length, 1);
});

test('AI 설정: 관리자만 등록, 키는 Vault에만 저장·외부 노출 없음, 서비스 전용 조회, 한도', async () => {
  const f = (await sudo("select family_id from public.family_groups g join public.family_members m on m.family_id=g.id where g.name='방문가족' limit 1"))[0].family_id;
  const KEY = 'sk-ant-TEST-1234567890abcdefghij';
  await fails(U.edit, "select public.set_ai_settings($1,'anthropic','claude-sonnet-5-5',$2)", [f, KEY], /Not permitted/);
  await fails(U.owner, "select public.set_ai_settings($1,'evil','m',$2)", [f, KEY], /Invalid provider/);
  await fails(U.owner, "select public.set_ai_settings($1,'anthropic','bad model!',$2)", [f, KEY], /Invalid model/);
  await fails(U.owner, "select public.set_ai_settings($1,'anthropic','m','short')", [f], /Invalid API key/);
  await fails(U.owner, "select public.set_ai_settings($1,'anthropic','claude-sonnet-5-5')", [f], /API key required/);
  await rows(U.owner, "select public.set_ai_settings($1,'anthropic','claude-sonnet-5-5',$2,true,3)", [f, KEY]);
  // 구성원 상태 조회: 키 없음
  const st = (await rows(U.view, 'select public.ai_status($1) as s', [f]))[0].s;
  assert.equal(st.configured, true); assert.equal(st.provider, 'anthropic'); assert.equal(st.model, 'claude-sonnet-5-5'); assert.equal(st.daily_limit, 3);
  assert.ok(!JSON.stringify(st).includes('sk-ant'));
  await fails(U.stranger, 'select public.ai_status($1)', [f], /Not permitted/);
  // 일반 사용자는 설정·사용량 테이블/볼트에 접근 불가
  for (const t of ['public.ai_settings', 'public.ai_usage']) await assert.rejects(() => as(U.owner, 'select * from ' + t), /permission denied/);
  await assert.rejects(() => as(U.owner, 'select * from vault.decrypted_secrets'), /permission denied/);
  await assert.rejects(() => asRole('anon', 'select public.ai_config_for_ocr($1,$2)', [f, U.owner]), /permission denied/);
  await assert.rejects(() => as(U.owner, 'select public.ai_config_for_ocr($1,$2)', [f, U.owner]), /permission denied/);
  // 서비스 롤: 승인 구성원은 키 수령, 비구성원 거부
  const cfg = (await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.view]))[0].c;
  assert.equal(cfg.ok, true); assert.equal(cfg.api_key, KEY); assert.equal(cfg.role, 'caregiver'); assert.equal(cfg.over_limit, false);
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.stranger]))[0].c.reason, 'not_member');
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.owner]))[0].c.role, 'owner');
  // 사용량 한도(3회)
  for (let i = 0; i < 3; i++) await asRole('service_role', "select public.log_ai_usage($1,$2,'ocr',true)", [f, U.view]);
  await asRole('service_role', "select public.log_ai_usage($1,$2,'ocr',false,'err')", [f, U.view]); // 실패는 한도에 포함되지 않음
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.view]))[0].c.over_limit, true);
  assert.equal((await rows(U.owner, 'select public.ai_status($1) as s', [f]))[0].s.used_24h, 3);
  // 모델만 변경(키 유지), 공급자 변경 시 새 키 필요, 비활성화
  await rows(U.owner, "select public.set_ai_settings($1,'anthropic','claude-haiku-5-5',null,true,50)", [f]);
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.edit]))[0].c.model, 'claude-haiku-5-5');
  await fails(U.owner, "select public.set_ai_settings($1,'openai','gpt-x',null)", [f], /API key required when provider changes/);
  await rows(U.owner, "select public.set_ai_settings($1,'anthropic','claude-haiku-5-5',null,false,50)", [f]);
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.edit]))[0].c.reason, 'disabled');
  await rows(U.owner, "select public.set_ai_settings($1,'openai','gpt-test-model',$2,true,50)", [f, 'sk-OPENAI-TEST-0987654321zyxwv']);
  assert.equal((await asRole('service_role', 'select public.ai_config_for_ocr($1,$2) as c', [f, U.edit]))[0].c.api_key, 'sk-OPENAI-TEST-0987654321zyxwv');
  // 키 삭제: Vault에서 제거, 사용 불가
  await fails(U.edit, 'select public.delete_ai_key($1)', [f], /Not permitted/);
  await rows(U.owner, 'select public.delete_ai_key($1)', [f]);
  assert.equal((await sudo('select count(*)::int c from vault.secrets'))[0].c, 0);
  assert.equal((await rows(U.owner, 'select public.ai_status($1) as s', [f]))[0].s.configured, false);
  // 가족 삭제 시 Vault 비밀도 정리
  await rows(U.owner, "select public.set_ai_settings($1,'google','gemini-test',$2)", [f, 'AIza-TEST-KEY-1234567890abcdef']);
  assert.equal((await sudo('select count(*)::int c from vault.secrets'))[0].c, 1);
  await sudo('delete from public.family_groups where id=$1', [f]);
  assert.equal((await sudo('select count(*)::int c from vault.secrets'))[0].c, 0);
});

test('계정 삭제: 유일 관리자는 소유권 이전 전까지 차단, 단독 가족은 함께 삭제', async () => {
  await fails(U.owner, 'select public.delete_my_account()', [], /Transfer ownership/);
  await rows(U.owner, "select public.update_member($1,$2,'owner','edit')", [fam, U.edit]);
  await rows(U.owner, 'select public.delete_my_account()');
  assert.equal((await sudo('select count(*)::int c from auth.users where id=$1', [U.owner]))[0].c, 0);
  assert.equal((await sudo('select count(*)::int c from public.family_groups where id=$1', [fam]))[0].c, 1);
  // 단독 가족
  await rows(U.other, 'select public.delete_my_account()');
  assert.equal((await sudo('select count(*)::int c from public.family_groups where id=$1', [otherFam]))[0].c, 0);
});
