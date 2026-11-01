-- Family Health Hub v0.4: 캘린더 구독(.ics) 피드. 20261101000000_collaboration.sql 적용 후 적용하십시오. 재실행해도 안전합니다.
-- 구글/아이폰 캘린더가 인증 없이 가져갈 수 있도록 추측 불가능한 토큰 URL(엣지 함수 calendar-feed)로 일정을 제공합니다.
-- 토큰을 아는 사람은 해당 구성원이 볼 수 있는 진료·복약 일정을 읽을 수 있으므로 앱에서 언제든 재발급·해제할 수 있습니다.

-- 1. 권한 판정을 사용자 지정 가능하게 분리(RLS용 can_access는 auth.uid()를 그대로 사용)
create or replace function fhh_private.can_access_as(u uuid, pid uuid, fid uuid, priv boolean, op text) returns boolean language sql stable security definer set search_path='' as $$
select exists(
  select 1
    from public.family_members m
    left join public.patient_permissions x on x.patient_id = pid and x.user_id = m.user_id
   where m.family_id = fid and m.user_id = u and m.status = 'approved' and (
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
create or replace function fhh_private.can_access(pid uuid, fid uuid, priv boolean, op text) returns boolean language sql stable security definer set search_path='' as $$
select fhh_private.can_access_as((select auth.uid()), pid, fid, priv, op)
$$;
revoke all on function fhh_private.can_access_as(uuid,uuid,uuid,boolean,text) from public, anon, authenticated;

-- 2. 구독 피드 테이블 (구성원 1명 × 패밀리 1개당 1행)
create table if not exists public.calendar_feeds(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.family_groups(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  include_meds boolean not null default true,
  show_med_names boolean not null default true,
  patient_ids uuid[],
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  unique (user_id, family_id)
);
alter table public.calendar_feeds enable row level security;
drop policy if exists feeds_read on public.calendar_feeds;
create policy feeds_read on public.calendar_feeds for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.calendar_feeds from anon;
grant select on public.calendar_feeds to authenticated;

-- 3. RPC
create or replace function public.create_calendar_feed(p_family uuid, p_include_meds boolean default true, p_show_med_names boolean default true, p_patient_ids uuid[] default null) returns text language plpgsql security definer set search_path='' as $$
declare t text;
begin
  if auth.uid() is null or not fhh_private.is_member(p_family) then raise exception 'Not permitted'; end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.calendar_feeds(user_id, family_id, token, include_meds, show_med_names, patient_ids)
  values (auth.uid(), p_family, t, coalesce(p_include_meds, true), coalesce(p_show_med_names, true), p_patient_ids)
  on conflict (user_id, family_id) do update
    set token = excluded.token, include_meds = excluded.include_meds, show_med_names = excluded.show_med_names,
        patient_ids = excluded.patient_ids, created_at = now(), last_fetched_at = null;
  return t;
end $$;

create or replace function public.update_calendar_feed(p_family uuid, p_include_meds boolean, p_show_med_names boolean, p_patient_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.calendar_feeds set include_meds = coalesce(p_include_meds, true), show_med_names = coalesce(p_show_med_names, true), patient_ids = p_patient_ids
   where user_id = auth.uid() and family_id = p_family;
  if not found then raise exception 'Not permitted'; end if;
end $$;

create or replace function public.delete_calendar_feed(p_family uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  delete from public.calendar_feeds where user_id = auth.uid() and family_id = p_family;
end $$;

-- 엣지 함수(anon 키)가 호출합니다. 토큰이 곧 자격 증명이며, 해당 사용자가 현재도 승인된 구성원이고 볼 수 있는 환자의 일정만 반환합니다.
-- 진단명·증상·메모 등 진료 기록 본문과 일정 메모는 포함하지 않습니다.
create or replace function public.calendar_feed_data(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.calendar_feeds%rowtype; fam text; result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into f from public.calendar_feeds where token = p_token;
  if f.id is null then return null; end if;
  if not exists (select 1 from public.family_members m where m.family_id = f.family_id and m.user_id = f.user_id and m.status = 'approved') then return null; end if;
  select g.name into fam from public.family_groups g where g.id = f.family_id;
  update public.calendar_feeds set last_fetched_at = now() where id = f.id;
  with pts as (
    select p.id, p.name from public.patients p
     where p.family_id = f.family_id and p.deleted_at is null
       and (f.patient_ids is null or p.id = any(f.patient_ids))
       and fhh_private.can_access_as(f.user_id, p.id, p.family_id, p.is_private, 'view')
  )
  select jsonb_build_object(
    'calName', '가족 건강 일정 · ' || coalesce(fam, ''),
    'patients', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from pts), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'hospital', a.hospital, 'department', a.department, 'doctor', a.doctor,
               'visit_date', a.visit_date, 'visit_time', a.visit_time, 'status', a.status, 'created_at', a.created_at, 'updated_at', a.updated_at,
               'companion_name', (select m.display_name from public.family_members m where m.family_id = a.family_id and m.user_id = a.companion_id)))
        from public.appointments a
       where a.patient_id in (select id from pts) and a.deleted_at is null and a.visit_date between current_date - 90 and current_date + 365), '[]'::jsonb),
    'medications', case when f.include_meds then coalesce((
      select jsonb_agg(jsonb_build_object('id', md.id, 'patient_id', md.patient_id, 'name', md.name, 'dosage', md.dosage, 'instructions', md.instructions,
               'times', md.times, 'start_date', md.start_date, 'end_date', md.end_date, 'created_at', md.created_at, 'updated_at', md.updated_at))
        from public.medications md
       where md.patient_id in (select id from pts) and md.deleted_at is null and md.active and cardinality(md.times) > 0
         and (md.end_date is null or md.end_date >= current_date)), '[]'::jsonb) else '[]'::jsonb end,
    'options', jsonb_build_object('include_meds', f.include_meds, 'show_med_names', f.show_med_names)
  ) into result;
  return result;
end $$;

revoke all on function public.create_calendar_feed(uuid,boolean,boolean,uuid[]), public.update_calendar_feed(uuid,boolean,boolean,uuid[]), public.delete_calendar_feed(uuid), public.calendar_feed_data(text) from public, anon;
grant execute on function public.create_calendar_feed(uuid,boolean,boolean,uuid[]), public.update_calendar_feed(uuid,boolean,boolean,uuid[]), public.delete_calendar_feed(uuid) to authenticated;
grant execute on function public.calendar_feed_data(text) to anon, authenticated;
