-- Family Health Hub v0.3: 다수 보호자 협업, 권한 프리셋, 감사 로그, 복약 확인, 첨부, 계정 관리.
-- 증분 마이그레이션입니다. 20261031000000_initial.sql 적용 후 적용하십시오. 재실행해도 안전하도록 작성했습니다.
-- 이 파일은 Family Health Hub 전용 Supabase 프로젝트에만 적용하십시오.

-- ============================================================
-- 1. 구성원 프로필 / 기본 접근 수준 / 비공개 환자
-- ============================================================
alter table public.family_members
  add column if not exists display_name text,
  add column if not exists relationship text,
  add column if not exists phone text,
  add column if not exists default_access text not null default 'edit' check (default_access in ('edit','view','none')),
  add column if not exists updated_at timestamptz not null default now();

update public.family_members m
   set display_name = coalesce(
         m.display_name,
         (select r.applicant_name from public.family_join_requests r where r.family_id = m.family_id and r.user_id = m.user_id),
         (select split_part(u.email, '@', 1) from auth.users u where u.id = m.user_id))
 where m.display_name is null;

-- 생성자·수정자는 FK를 두지 않습니다(계정 삭제 시 연쇄 갱신/트리거 충돌 방지). 화면에서는 미확인 사용자를 "탈퇴한 사용자"로 표시합니다.
alter table public.patients
  add column if not exists is_private boolean not null default false,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;
alter table public.appointments
  add column if not exists companion_id uuid,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;
alter table public.medical_records
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;
alter table public.medications
  add column if not exists times text[] not null default '{}',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists created_by uuid default auth.uid(),
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

alter table public.family_groups alter column created_by drop not null;
alter table public.family_groups drop constraint if exists family_groups_created_by_fkey;
alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs add column if not exists patient_id uuid, add column if not exists label text;
alter table public.family_join_requests drop constraint if exists family_join_requests_user_id_fkey;
alter table public.family_join_requests add constraint family_join_requests_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
alter table fhh_private.family_codes add column if not exists code_plain text;

-- ============================================================
-- 2. 신규 테이블
-- ============================================================
create table if not exists public.med_intakes(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_date date not null,
  slot text not null default 'any',
  status text not null default 'taken' check (status in ('taken','skipped')),
  taken_by uuid default auth.uid(),
  taken_at timestamptz not null default now(),
  unique (medication_id, scheduled_date, slot)
);
create index if not exists med_intakes_family_date_idx on public.med_intakes(family_id, scheduled_date);

create table if not exists public.attachments(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  record_id uuid references public.medical_records(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind text not null default '기타',
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists attachments_patient_idx on public.attachments(patient_id);

create table if not exists public.user_consents(
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

create index if not exists audit_logs_family_created_idx on public.audit_logs(family_id, created_at desc);

-- ============================================================
-- 3. 권한 함수
--    우선순위: 관리자(owner) → 환자별 명시 권한 → (비공개 환자는 차단) → 구성원 기본 접근 수준
-- ============================================================
-- 핵심 판정 함수: 환자 행의 값(id, family_id, is_private)을 인자로 받아 patients 테이블을 다시 조회하지 않습니다.
-- (INSERT ... RETURNING 시 같은 문장에서 삽입된 행을 정책 함수가 조회하지 못하는 문제를 피하기 위함)
create or replace function fhh_private.can_access(pid uuid, fid uuid, priv boolean, op text) returns boolean language sql stable security definer set search_path='' as $$
select exists(
  select 1
    from public.family_members m
    left join public.patient_permissions x on x.patient_id = pid and x.user_id = m.user_id
   where m.family_id = fid and m.user_id = (select auth.uid()) and m.status = 'approved' and (
     m.role = 'owner'
     or (x.patient_id is not null and case op
           when 'view' then (x.can_view or x.can_create or x.can_edit)
           when 'create' then x.can_create
           when 'edit' then x.can_edit
           else false end)
     or (x.patient_id is null and not priv and case m.default_access
           when 'edit' then op in ('view','create','edit')
           when 'view' then op = 'view'
           else false end)
   ))
$$;

create or replace function fhh_private.can_patient(p uuid, op text) returns boolean language sql stable security definer set search_path='' as $$
select coalesce((select fhh_private.can_access(pt.id, pt.family_id, pt.is_private, op) from public.patients pt where pt.id = p), false)
$$;

create or replace function fhh_private.can_add_patient(g uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.family_members m
  where m.family_id = g and m.user_id = (select auth.uid()) and m.status = 'approved' and (m.role = 'owner' or m.default_access = 'edit'))
$$;

create or replace function fhh_private.storage_can(object_name text, op text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare seg text := split_part(object_name, '/', 2);
begin
  if seg !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  return fhh_private.can_patient(seg::uuid, op);
end $$;

grant execute on function fhh_private.can_access(uuid,uuid,boolean,text), fhh_private.can_patient(uuid,text), fhh_private.can_add_patient(uuid), fhh_private.storage_can(text,text) to authenticated;

-- ============================================================
-- 4. 트리거: 수정자 기록, 환자 보호, 감사 로그
-- ============================================================
create or replace function fhh_private.stamp_update() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;

create or replace function fhh_private.guard_patient() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'UPDATE' then
    if new.family_id <> old.family_id then raise exception 'family_id is immutable'; end if;
    if (new.is_private is distinct from old.is_private or new.deleted_at is distinct from old.deleted_at)
       and not fhh_private.is_owner(old.family_id) then
      raise exception 'Only an owner may change privacy or trash a patient';
    end if;
  elsif tg_op = 'INSERT' then
    if new.is_private and not fhh_private.is_owner(new.family_id) then
      raise exception 'Only an owner may create a private patient';
    end if;
  end if;
  return new;
end $$;

create or replace function fhh_private.audit_row() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb; o jsonb; src jsonb; act text; lbl text; pid uuid; fid uuid; eid text;
begin
  n := to_jsonb(new);
  o := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_op = 'UPDATE' and (n - 'updated_at' - 'updated_by') = (o - 'updated_at' - 'updated_by') then return null; end if;
  src := n;
  fid := (src->>'family_id')::uuid;
  pid := case tg_table_name
           when 'patients' then (src->>'id')::uuid
           when 'family_members' then null
           else (src->>'patient_id')::uuid end;
  eid := coalesce(src->>'id', src->>'user_id');
  lbl := case tg_table_name
           when 'patients' then src->>'name'
           when 'appointments' then src->>'hospital'
           when 'medical_records' then coalesce(nullif(src->>'diagnosis',''), src->>'visit_date')
           when 'medications' then src->>'name'
           when 'attachments' then src->>'file_name'
           when 'family_members' then src->>'display_name'
           when 'patient_permissions' then (select m.display_name from public.family_members m where m.family_id = fid and m.user_id = (src->>'user_id')::uuid)
           else null end;
  if tg_op = 'INSERT' then act := 'create';
  elsif (o->>'deleted_at') is null and (n->>'deleted_at') is not null then act := 'trash';
  elsif (o->>'deleted_at') is not null and (n->>'deleted_at') is null then act := 'restore';
  else act := 'update'; end if;
  insert into public.audit_logs(family_id, actor_id, action, entity, entity_id, patient_id, label)
  values (fid, (select auth.uid()), act, tg_table_name, eid::uuid, pid, lbl);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['patients','appointments','medical_records','medications'] loop
    execute format('drop trigger if exists fhh_stamp on public.%I', t);
    execute format('create trigger fhh_stamp before update on public.%I for each row execute function fhh_private.stamp_update()', t);
  end loop;
  foreach t in array array['patients','appointments','medical_records','medications','attachments','family_members','patient_permissions'] loop
    execute format('drop trigger if exists fhh_audit on public.%I', t);
    execute format('create trigger fhh_audit after insert or update on public.%I for each row execute function fhh_private.audit_row()', t);
  end loop;
end $$;

drop trigger if exists fhh_guard_patient on public.patients;
create trigger fhh_guard_patient before insert or update on public.patients for each row execute function fhh_private.guard_patient();

-- ============================================================
-- 5. RLS 정책
-- ============================================================
alter table public.med_intakes enable row level security;
alter table public.attachments enable row level security;
alter table public.user_consents enable row level security;

drop policy if exists patients_read on public.patients;
drop policy if exists patients_update on public.patients;
create policy patients_read on public.patients for select to authenticated
  using (fhh_private.can_access(id, family_id, is_private, 'view'));
create policy patients_update on public.patients for update to authenticated
  using (fhh_private.can_access(id, family_id, is_private, 'edit'))
  with check (fhh_private.can_access(id, family_id, is_private, 'edit'));

drop policy if exists patients_insert on public.patients;
create policy patients_insert on public.patients for insert to authenticated
  with check (fhh_private.can_add_patient(family_id));

drop policy if exists intakes_read on public.med_intakes;
drop policy if exists intakes_insert on public.med_intakes;
drop policy if exists intakes_delete on public.med_intakes;
create policy intakes_read on public.med_intakes for select to authenticated using (fhh_private.can_patient(patient_id,'view'));
create policy intakes_insert on public.med_intakes for insert to authenticated
  with check (
    fhh_private.can_patient(patient_id,'create')
    and taken_by = (select auth.uid())
    and family_id = (select p.family_id from public.patients p where p.id = patient_id)
    and exists (select 1 from public.medications md where md.id = medication_id and md.patient_id = med_intakes.patient_id));
create policy intakes_delete on public.med_intakes for delete to authenticated
  using ((fhh_private.can_patient(patient_id,'create') and taken_by = (select auth.uid())) or fhh_private.can_patient(patient_id,'edit'));

drop policy if exists attachments_read on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
create policy attachments_read on public.attachments for select to authenticated using (fhh_private.can_patient(patient_id,'view'));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    fhh_private.can_patient(patient_id,'create')
    and created_by = (select auth.uid())
    and family_id = (select p.family_id from public.patients p where p.id = patient_id)
    and storage_path like family_id::text || '/' || patient_id::text || '/%');
create policy attachments_update on public.attachments for update to authenticated
  using (fhh_private.can_patient(patient_id,'edit'))
  with check (fhh_private.can_patient(patient_id,'edit') and family_id = (select p.family_id from public.patients p where p.id = patient_id));

drop policy if exists consents_read on public.user_consents;
drop policy if exists consents_insert on public.user_consents;
create policy consents_read on public.user_consents for select to authenticated using (user_id = (select auth.uid()));
create policy consents_insert on public.user_consents for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using (fhh_private.is_owner(family_id) or (patient_id is not null and fhh_private.can_patient(patient_id,'view')));

grant select, insert, update, delete on public.med_intakes, public.attachments, public.user_consents to authenticated;
revoke all on public.med_intakes, public.attachments, public.user_consents from anon;

-- ============================================================
-- 6. RPC (보안 정의자 함수)
-- ============================================================
drop function if exists public.create_family(text);
drop function if exists public.approve_family_join(uuid);

create or replace function public.create_family(p_name text, p_display_name text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid; code text; nm text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Family name too short'; end if;
  nm := coalesce(nullif(trim(p_display_name), ''), (select split_part(u.email, '@', 1) from auth.users u where u.id = auth.uid()), '관리자');
  insert into public.family_groups(name, created_by) values (trim(p_name), auth.uid()) returning id into g;
  insert into public.family_members(family_id, user_id, role, status, display_name, default_access) values (g, auth.uid(), 'owner', 'approved', nm, 'edit');
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18));
  insert into fhh_private.family_codes(family_id, code_hash, code_plain)
  values (g, encode(sha256(convert_to(code, 'UTF8')), 'hex'), code);
  return jsonb_build_object('family_id', g, 'invite_code', code);
end $$;

create or replace function public.get_family_code(p_family uuid) returns text language plpgsql security definer set search_path='' as $$
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  return (select c.code_plain from fhh_private.family_codes c where c.family_id = p_family);
end $$;

create or replace function public.rotate_family_code(p_family uuid) returns text language plpgsql security definer set search_path='' as $$
declare code text;
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18));
  insert into fhh_private.family_codes(family_id, code_hash, code_plain, rotated_at)
  values (p_family, encode(sha256(convert_to(code, 'UTF8')), 'hex'), code, now())
  on conflict (family_id) do update set code_hash = excluded.code_hash, code_plain = excluded.code_plain, rotated_at = now();
  return code;
end $$;

create or replace function public.request_family_join(p_code text, p_name text, p_phone text default null, p_relationship text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid; norm text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Applicant name required'; end if;
  norm := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  select family_id into g from fhh_private.family_codes where code_hash = encode(sha256(convert_to(norm, 'UTF8')), 'hex');
  if g is null then raise exception 'Invalid family code'; end if;
  if exists (select 1 from public.family_members where family_id = g and user_id = auth.uid() and status = 'approved') then raise exception 'Already a member'; end if;
  insert into public.family_join_requests(family_id, user_id, applicant_name, phone, relationship, status)
  values (g, auth.uid(), trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_relationship), ''), 'pending')
  on conflict (family_id, user_id) do update
    set applicant_name = excluded.applicant_name, phone = excluded.phone, relationship = excluded.relationship, status = 'pending', created_at = now();
  return g;
end $$;

create or replace function public.approve_family_join(p_request uuid, p_access text default 'edit') returns void language plpgsql security definer set search_path='' as $$
declare r public.family_join_requests%rowtype;
begin
  if p_access not in ('edit','view','none') then raise exception 'Invalid access level'; end if;
  select * into r from public.family_join_requests where id = p_request and status = 'pending' for update;
  if r.id is null or not fhh_private.is_owner(r.family_id) then raise exception 'Not permitted'; end if;
  insert into public.family_members(family_id, user_id, role, status, display_name, relationship, phone, default_access)
  values (r.family_id, r.user_id, 'caregiver', 'approved', r.applicant_name, r.relationship, r.phone, p_access)
  on conflict (family_id, user_id) do update
    set status = 'approved', role = 'caregiver', display_name = excluded.display_name, relationship = excluded.relationship,
        phone = excluded.phone, default_access = excluded.default_access, updated_at = now();
  update public.family_join_requests set status = 'approved' where id = p_request;
end $$;

create or replace function public.reject_family_join(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.family_join_requests%rowtype;
begin
  select * into r from public.family_join_requests where id = p_request and status = 'pending' for update;
  if r.id is null or not fhh_private.is_owner(r.family_id) then raise exception 'Not permitted'; end if;
  update public.family_join_requests set status = 'rejected' where id = p_request;
end $$;

create or replace function public.cancel_family_join(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.family_join_requests where id = p_request and user_id = auth.uid() and status = 'pending';
end $$;

create or replace function public.my_join_requests() returns table(id uuid, family_id uuid, family_name text, status text, created_at timestamptz) language sql stable security definer set search_path='' as $$
  select r.id, r.family_id, g.name, r.status, r.created_at
    from public.family_join_requests r join public.family_groups g on g.id = r.family_id
   where r.user_id = auth.uid() and r.status in ('pending','rejected')
   order by r.created_at desc
$$;

create or replace function public.update_member(p_family uuid, p_user uuid, p_role text, p_access text) returns void language plpgsql security definer set search_path='' as $$
declare m public.family_members%rowtype;
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  if p_role not in ('owner','caregiver','patient') or p_access not in ('edit','view','none') then raise exception 'Invalid value'; end if;
  select * into m from public.family_members where family_id = p_family and user_id = p_user and status = 'approved';
  if m.user_id is null then raise exception 'Member not found'; end if;
  if m.role = 'owner' and p_role <> 'owner'
     and not exists (select 1 from public.family_members x where x.family_id = p_family and x.user_id <> p_user and x.role = 'owner' and x.status = 'approved') then
    raise exception 'At least one owner is required';
  end if;
  if p_role = 'owner' and m.role <> 'owner'
     and (select count(*) from public.family_members x where x.family_id = p_family and x.role = 'owner' and x.status = 'approved') >= 2 then
    raise exception 'Up to two owners are allowed';
  end if;
  update public.family_members
     set role = p_role, default_access = case when p_role = 'owner' then 'edit' else p_access end, updated_at = now()
   where family_id = p_family and user_id = p_user;
end $$;

create or replace function public.remove_member(p_family uuid, p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.family_members%rowtype;
begin
  if not (fhh_private.is_owner(p_family) or p_user = auth.uid()) then raise exception 'Not permitted'; end if;
  select * into m from public.family_members where family_id = p_family and user_id = p_user and status = 'approved';
  if m.user_id is null then raise exception 'Member not found'; end if;
  if m.role = 'owner'
     and not exists (select 1 from public.family_members x where x.family_id = p_family and x.user_id <> p_user and x.role = 'owner' and x.status = 'approved') then
    raise exception 'At least one owner is required';
  end if;
  delete from public.patient_permissions where family_id = p_family and user_id = p_user;
  update public.family_members set status = 'revoked', updated_at = now() where family_id = p_family and user_id = p_user;
  delete from public.family_join_requests where family_id = p_family and user_id = p_user;
end $$;

create or replace function public.update_my_profile(p_family uuid, p_display_name text, p_relationship text default null, p_phone text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if length(trim(coalesce(p_display_name, ''))) < 1 then raise exception 'Name required'; end if;
  update public.family_members
     set display_name = trim(p_display_name), relationship = nullif(trim(p_relationship), ''), phone = nullif(trim(p_phone), ''), updated_at = now()
   where family_id = p_family and user_id = auth.uid() and status = 'approved';
  if not found then raise exception 'Not permitted'; end if;
end $$;

create or replace function public.log_audit_event(p_family uuid, p_action text, p_label text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if not fhh_private.is_member(p_family) then raise exception 'Not permitted'; end if;
  if p_action not in ('export','report') then raise exception 'Invalid action'; end if;
  insert into public.audit_logs(family_id, actor_id, action, entity, label) values (p_family, auth.uid(), p_action, p_action, left(p_label, 200));
end $$;

create or replace function public.empty_trash(p_family uuid, p_days integer default 30) returns integer language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; c integer := 0; k integer;
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  cutoff := now() - make_interval(days => greatest(coalesce(p_days, 30), 0));
  delete from public.attachments where family_id = p_family and deleted_at is not null and deleted_at <= cutoff; get diagnostics k = row_count; c := c + k;
  delete from public.medical_records where family_id = p_family and deleted_at is not null and deleted_at <= cutoff; get diagnostics k = row_count; c := c + k;
  delete from public.appointments where family_id = p_family and deleted_at is not null and deleted_at <= cutoff; get diagnostics k = row_count; c := c + k;
  delete from public.medications where family_id = p_family and deleted_at is not null and deleted_at <= cutoff; get diagnostics k = row_count; c := c + k;
  delete from public.patients where family_id = p_family and deleted_at is not null and deleted_at <= cutoff; get diagnostics k = row_count; c := c + k;
  return c;
end $$;

create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); f record;
begin
  if u is null then raise exception 'Authentication required'; end if;
  for f in select family_id from public.family_members where user_id = u and status = 'approved' and role = 'owner' loop
    if not exists (select 1 from public.family_members x where x.family_id = f.family_id and x.user_id <> u and x.role = 'owner' and x.status = 'approved') then
      if exists (select 1 from public.family_members x where x.family_id = f.family_id and x.user_id <> u and x.status = 'approved') then
        raise exception 'Transfer ownership before deleting account';
      else
        delete from public.family_groups where id = f.family_id;
      end if;
    end if;
  end loop;
  delete from auth.users where id = u;
end $$;

revoke all on function
  public.create_family(text,text), public.get_family_code(uuid), public.rotate_family_code(uuid),
  public.request_family_join(text,text,text,text), public.approve_family_join(uuid,text), public.reject_family_join(uuid),
  public.cancel_family_join(uuid), public.my_join_requests(), public.update_member(uuid,uuid,text,text),
  public.remove_member(uuid,uuid), public.update_my_profile(uuid,text,text,text), public.log_audit_event(uuid,text,text),
  public.empty_trash(uuid,integer), public.delete_my_account()
  from public, anon;
grant execute on function
  public.create_family(text,text), public.get_family_code(uuid), public.rotate_family_code(uuid),
  public.request_family_join(text,text,text,text), public.approve_family_join(uuid,text), public.reject_family_join(uuid),
  public.cancel_family_join(uuid), public.my_join_requests(), public.update_member(uuid,uuid,text,text),
  public.remove_member(uuid,uuid), public.update_my_profile(uuid,text,text,text), public.log_audit_event(uuid,text,text),
  public.empty_trash(uuid,integer), public.delete_my_account()
  to authenticated;

-- ============================================================
-- 7. Storage (비공개 버킷) — Supabase 환경에서만 적용
-- ============================================================
do $$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('fhh-attachments', 'fhh-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = 10485760;

    execute 'drop policy if exists fhh_attach_read on storage.objects';
    execute 'drop policy if exists fhh_attach_insert on storage.objects';
    execute 'drop policy if exists fhh_attach_delete on storage.objects';
    execute $p$create policy fhh_attach_read on storage.objects for select to authenticated
      using (bucket_id = 'fhh-attachments' and fhh_private.storage_can(name, 'view'))$p$;
    execute $p$create policy fhh_attach_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'fhh-attachments' and fhh_private.storage_can(name, 'create'))$p$;
    execute $p$create policy fhh_attach_delete on storage.objects for delete to authenticated
      using (bucket_id = 'fhh-attachments' and fhh_private.storage_can(name, 'edit'))$p$;
  end if;
end $$;

-- ============================================================
-- 8. Realtime (선택) — 권한은 RLS를 따릅니다
-- ============================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['patients','appointments','medical_records','medications','med_intakes','attachments','family_members','family_join_requests','audit_logs','patient_permissions'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- 선택: pg_cron 확장을 사용하는 경우 서버에서 휴지통을 자동 정리할 수 있습니다.
-- (앱은 관리자가 접속할 때 30일 경과 항목을 하루 1회 자동 정리합니다.)
