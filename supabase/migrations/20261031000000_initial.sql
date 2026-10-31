-- Family Health Hub initial schema. Apply only to a NEW dedicated project.
create extension if not exists pgcrypto;
create schema if not exists fhh_private;
create table public.family_groups(id uuid primary key default gen_random_uuid(),name text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.family_members(family_id uuid not null references public.family_groups(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null default 'caregiver' check(role in ('owner','caregiver','patient')),status text not null default 'pending' check(status in ('pending','approved','revoked')),created_at timestamptz not null default now(),primary key(family_id,user_id));
create table fhh_private.family_codes(family_id uuid primary key references public.family_groups(id) on delete cascade,code_hash text not null,rotated_at timestamptz not null default now());
create table public.family_join_requests(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.family_groups(id) on delete cascade,user_id uuid not null references auth.users(id),applicant_name text not null,phone text,relationship text,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now(),unique(family_id,user_id));
create table public.patients(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.family_groups(id) on delete cascade,name text not null,relationship text,birth_date date,phone text,color text,created_at timestamptz not null default now(),deleted_at timestamptz);
create table public.patient_permissions(family_id uuid not null references public.family_groups(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,can_view boolean not null default false,can_create boolean not null default false,can_edit boolean not null default false,primary key(patient_id,user_id));
create table public.appointments(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.family_groups(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,hospital text not null,department text,doctor text,visit_date date not null,visit_time time,status text not null default '예약완료',note text,created_at timestamptz not null default now(),deleted_at timestamptz);
create table public.medical_records(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.family_groups(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,appointment_id uuid references public.appointments(id) on delete set null,visit_date date not null,diagnosis text,memo text,symptoms text,tests text,treatment text,prescription text,cautions text,created_at timestamptz not null default now(),deleted_at timestamptz);
create table public.medications(id uuid primary key default gen_random_uuid(),family_id uuid not null references public.family_groups(id) on delete cascade,patient_id uuid not null references public.patients(id) on delete cascade,name text not null,dosage text,instructions text,active boolean not null default true,created_at timestamptz not null default now(),deleted_at timestamptz);
create table public.audit_logs(id uuid primary key default gen_random_uuid(),family_id uuid references public.family_groups(id) on delete cascade,actor_id uuid references auth.users(id),action text not null,entity text,entity_id uuid,created_at timestamptz not null default now());
create index on public.appointments(family_id,visit_date);
create index on public.medical_records(family_id,visit_date);
create index on public.family_join_requests(family_id,status);

create or replace function fhh_private.is_owner(g uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.family_members m where m.family_id=g and m.user_id=(select auth.uid()) and m.role='owner' and m.status='approved')$$;
create or replace function fhh_private.is_member(g uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.family_members m where m.family_id=g and m.user_id=(select auth.uid()) and m.status='approved')$$;
create or replace function fhh_private.can_patient(p uuid, op text) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.patients pt where pt.id=p and (
 fhh_private.is_owner(pt.family_id) or
 (fhh_private.is_member(pt.family_id) and exists(select 1 from public.patient_permissions x where x.patient_id=p and x.user_id=(select auth.uid()) and
 case op when 'view' then x.can_view or x.can_create or x.can_edit when 'create' then x.can_create when 'edit' then x.can_edit else false end))
))$$;
revoke all on schema fhh_private from public,anon;
grant usage on schema fhh_private to authenticated;
grant execute on function fhh_private.is_owner(uuid),fhh_private.is_member(uuid),fhh_private.can_patient(uuid,text) to authenticated;

create or replace function public.create_family(p_name text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g uuid; code text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if length(trim(p_name))<2 then raise exception 'Family name too short';end if;
 insert into public.family_groups(name,created_by) values(trim(p_name),auth.uid()) returning id into g;
 insert into public.family_members(family_id,user_id,role,status) values(g,auth.uid(),'owner','approved');
 code:=upper(encode(public.gen_random_bytes(9),'hex'));
 insert into fhh_private.family_codes(family_id,code_hash) values(g,encode(public.digest(code,'sha256'),'hex'));
 return jsonb_build_object('family_id',g,'invite_code',code);
end $$;
create or replace function public.request_family_join(p_code text,p_name text,p_phone text default null,p_relationship text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare g uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if length(trim(p_name))<2 then raise exception 'Applicant name required';end if;
 select family_id into g from fhh_private.family_codes where code_hash=encode(public.digest(upper(trim(p_code)),'sha256'),'hex');
 if g is null then raise exception 'Invalid family code';end if;
 if exists(select 1 from public.family_members where family_id=g and user_id=auth.uid() and status='approved') then raise exception 'Already a member';end if;
 insert into public.family_join_requests(family_id,user_id,applicant_name,phone,relationship,status) values(g,auth.uid(),trim(p_name),p_phone,p_relationship,'pending')
 on conflict(family_id,user_id) do update set applicant_name=excluded.applicant_name,phone=excluded.phone,relationship=excluded.relationship,status='pending',created_at=now();
 return g;
end $$;
create or replace function public.approve_family_join(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.family_join_requests%rowtype;
begin
 select * into r from public.family_join_requests where id=p_request and status='pending' for update;
 if r.id is null or not fhh_private.is_owner(r.family_id) then raise exception 'Not permitted';end if;
 insert into public.family_members(family_id,user_id,role,status) values(r.family_id,r.user_id,'caregiver','approved')
 on conflict(family_id,user_id) do update set status='approved',role='caregiver';
 update public.family_join_requests set status='approved' where id=p_request;
end $$;
create or replace function public.rotate_family_code(p_family uuid) returns text language plpgsql security definer set search_path='' as $$
declare code text;
begin
 if not fhh_private.is_member(p_family) then raise exception 'Not permitted';end if;
 code:=upper(encode(public.gen_random_bytes(9),'hex'));
 update fhh_private.family_codes set code_hash=encode(public.digest(code,'sha256'),'hex'),rotated_at=now() where family_id=p_family;
 return code;
end $$;
revoke all on function public.create_family(text),public.request_family_join(text,text,text,text),public.approve_family_join(uuid),public.rotate_family_code(uuid) from public,anon;
grant execute on function public.create_family(text),public.request_family_join(text,text,text,text),public.approve_family_join(uuid),public.rotate_family_code(uuid) to authenticated;

alter table public.family_groups enable row level security;
alter table public.family_members enable row level security;
alter table public.family_join_requests enable row level security;
alter table public.patients enable row level security;
alter table public.patient_permissions enable row level security;
alter table public.appointments enable row level security;
alter table public.medical_records enable row level security;
alter table public.medications enable row level security;
alter table public.audit_logs enable row level security;
create policy groups_read on public.family_groups for select to authenticated using(fhh_private.is_member(id));
create policy members_read on public.family_members for select to authenticated using(fhh_private.is_member(family_id));
create policy join_read on public.family_join_requests for select to authenticated using(user_id=(select auth.uid()) or fhh_private.is_owner(family_id));
create policy patients_read on public.patients for select to authenticated using(fhh_private.can_patient(id,'view'));
create policy patients_insert on public.patients for insert to authenticated with check(fhh_private.is_owner(family_id));
create policy patients_update on public.patients for update to authenticated using(fhh_private.can_patient(id,'edit')) with check(fhh_private.can_patient(id,'edit'));
create policy permissions_read on public.patient_permissions for select to authenticated using(user_id=(select auth.uid()) or fhh_private.is_owner(family_id));
create policy permissions_write on public.patient_permissions for all to authenticated using(fhh_private.is_owner(family_id)) with check(fhh_private.is_owner(family_id));
create policy appointments_read on public.appointments for select to authenticated using(fhh_private.can_patient(patient_id,'view'));
create policy appointments_insert on public.appointments for insert to authenticated with check(fhh_private.can_patient(patient_id,'create') and family_id=(select family_id from public.patients where id=patient_id));
create policy appointments_update on public.appointments for update to authenticated using(fhh_private.can_patient(patient_id,'edit')) with check(fhh_private.can_patient(patient_id,'edit') and family_id=(select family_id from public.patients where id=patient_id));
create policy records_read on public.medical_records for select to authenticated using(fhh_private.can_patient(patient_id,'view'));
create policy records_insert on public.medical_records for insert to authenticated with check(fhh_private.can_patient(patient_id,'create') and family_id=(select family_id from public.patients where id=patient_id));
create policy records_update on public.medical_records for update to authenticated using(fhh_private.can_patient(patient_id,'edit')) with check(fhh_private.can_patient(patient_id,'edit') and family_id=(select family_id from public.patients where id=patient_id));
create policy medications_read on public.medications for select to authenticated using(fhh_private.can_patient(patient_id,'view'));
create policy medications_insert on public.medications for insert to authenticated with check(fhh_private.can_patient(patient_id,'create') and family_id=(select family_id from public.patients where id=patient_id));
create policy medications_update on public.medications for update to authenticated using(fhh_private.can_patient(patient_id,'edit')) with check(fhh_private.can_patient(patient_id,'edit') and family_id=(select family_id from public.patients where id=patient_id));
create policy audit_read on public.audit_logs for select to authenticated using(fhh_private.is_owner(family_id));
-- Realtime publication is optional; enable only after testing authorization.
