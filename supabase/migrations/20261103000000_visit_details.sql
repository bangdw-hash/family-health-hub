-- Family Health Hub v0.5: 진료 전·중·후 관리(공통 예약 필드, 단계/체크리스트), 병원 정보, AI(OCR) 설정.
-- 20261102000000_calendar_feeds.sql 적용 후 적용하십시오. 재실행해도 안전하도록 작성했습니다.
-- AI API 키는 Supabase Vault에 암호화 저장되며 브라우저로 전달되지 않습니다(엣지 함수만 service_role로 읽음).

-- ============================================================
-- 1. 진료 일정 공통 필드 확장 (모두 선택 입력, 기존 데이터 유지)
-- ============================================================
alter table public.appointments
  add column if not exists kind text not null default '외래진료',
  add column if not exists booking_source text,
  add column if not exists specialty text,
  add column if not exists doctor_title text,
  add column if not exists place text,
  add column if not exists place_note text,
  add column if not exists arrival_time time,
  add column if not exists end_time time,
  add column if not exists test_name text,
  add column if not exists hours_note text,
  add column if not exists fasting_hours integer,
  add column if not exists related_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists relation text,
  add column if not exists related_lead_minutes integer,
  add column if not exists notice_text text,
  add column if not exists booking_ref text,
  add column if not exists hospital_phone text,
  add column if not exists fee_amount integer;

do $$
begin
  begin alter table public.appointments add constraint appointments_kind_chk check (kind in ('외래진료','검사','시술·수술','입원','기타')); exception when duplicate_object then null; end;
  begin alter table public.appointments add constraint appointments_relation_chk check (relation is null or relation in ('test_before','follow_up')); exception when duplicate_object then null; end;
  begin alter table public.appointments add constraint appointments_fasting_chk check (fasting_hours is null or fasting_hours between 0 and 72); exception when duplicate_object then null; end;
  begin alter table public.appointments add constraint appointments_fee_chk check (fee_amount is null or fee_amount >= 0); exception when duplicate_object then null; end;
  begin alter table public.appointments add constraint appointments_len_chk check (coalesce(length(notice_text),0) <= 10000 and coalesce(length(place),0) <= 500 and coalesce(length(place_note),0) <= 1000 and coalesce(length(hours_note),0) <= 1000); exception when duplicate_object then null; end;
end $$;

create or replace function fhh_private.guard_appointment() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;
begin
  if new.related_appointment_id is not null then
    if new.related_appointment_id = new.id then raise exception 'An appointment cannot relate to itself'; end if;
    select family_id, patient_id into r from public.appointments where id = new.related_appointment_id;
    if r.family_id is null or r.family_id <> new.family_id or r.patient_id <> new.patient_id then
      raise exception 'Related appointment must belong to the same patient';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists fhh_guard_appointment on public.appointments;
create trigger fhh_guard_appointment before insert or update on public.appointments for each row execute function fhh_private.guard_appointment();

-- ============================================================
-- 2. 진료 전(준비)·중(진행 단계)·후(할 일) 항목
-- ============================================================
create table if not exists public.appointment_steps(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  phase text not null check (phase in ('before','during','after')),
  kind text not null default '기타',
  title text not null check (length(title) between 1 and 200),
  step_time time,
  relative_minutes integer check (relative_minutes is null or relative_minutes between -4320 and 1440),
  place text check (place is null or length(place) <= 500),
  staff text check (staff is null or length(staff) <= 200),
  note text check (note is null or length(note) <= 1000),
  sort integer not null default 0,
  done_at timestamptz,
  done_by uuid,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists appointment_steps_appt_idx on public.appointment_steps(appointment_id, phase, sort);
create index if not exists appointment_steps_family_idx on public.appointment_steps(family_id);

create table if not exists public.hospitals(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  address text check (address is null or length(address) <= 500),
  phone text check (phone is null or length(phone) <= 50),
  map_url text check (map_url is null or (length(map_url) <= 500 and map_url ~* '^https?://')),
  note text check (note is null or length(note) <= 1000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (family_id, name)
);

alter table public.appointment_steps enable row level security;
alter table public.hospitals enable row level security;

drop policy if exists steps_read on public.appointment_steps;
drop policy if exists steps_insert on public.appointment_steps;
drop policy if exists steps_update on public.appointment_steps;
drop policy if exists steps_delete on public.appointment_steps;
create policy steps_read on public.appointment_steps for select to authenticated using (fhh_private.can_patient(patient_id, 'view'));
create policy steps_insert on public.appointment_steps for insert to authenticated
  with check (
    fhh_private.can_patient(patient_id, 'create')
    and family_id = (select p.family_id from public.patients p where p.id = patient_id)
    and exists (select 1 from public.appointments a where a.id = appointment_id and a.patient_id = appointment_steps.patient_id));
create policy steps_update on public.appointment_steps for update to authenticated
  using (fhh_private.can_patient(patient_id, 'edit'))
  with check (fhh_private.can_patient(patient_id, 'edit')
    and exists (select 1 from public.appointments a where a.id = appointment_id and a.patient_id = appointment_steps.patient_id));
create policy steps_delete on public.appointment_steps for delete to authenticated using (fhh_private.can_patient(patient_id, 'edit'));

drop policy if exists hospitals_read on public.hospitals;
drop policy if exists hospitals_insert on public.hospitals;
drop policy if exists hospitals_update on public.hospitals;
drop policy if exists hospitals_delete on public.hospitals;
create policy hospitals_read on public.hospitals for select to authenticated using (fhh_private.is_member(family_id));
create policy hospitals_insert on public.hospitals for insert to authenticated with check (fhh_private.can_add_patient(family_id));
create policy hospitals_update on public.hospitals for update to authenticated using (fhh_private.can_add_patient(family_id)) with check (fhh_private.can_add_patient(family_id));
create policy hospitals_delete on public.hospitals for delete to authenticated using (fhh_private.can_add_patient(family_id));

grant select, insert, update, delete on public.appointment_steps, public.hospitals to authenticated;
revoke all on public.appointment_steps, public.hospitals from anon;

-- 단계 완료 체크는 '등록' 권한만 있어도 가능(누가·언제 기록)
create or replace function public.set_step_done(p_step uuid, p_done boolean) returns void language plpgsql security definer set search_path='' as $$
declare s public.appointment_steps%rowtype;
begin
  select * into s from public.appointment_steps where id = p_step;
  if s.id is null or not fhh_private.can_patient(s.patient_id, 'create') then raise exception 'Not permitted'; end if;
  update public.appointment_steps
     set done_at = case when p_done then now() else null end, done_by = case when p_done then auth.uid() else null end
   where id = p_step;
end $$;
revoke all on function public.set_step_done(uuid, boolean) from public, anon;
grant execute on function public.set_step_done(uuid, boolean) to authenticated;

-- ============================================================
-- 3. AI(OCR) 설정 — 관리자가 1회 등록하면 패밀리 전원이 같은 채널로 사용
-- ============================================================
do $$
begin
  begin create extension if not exists supabase_vault with schema vault; exception when others then raise notice 'supabase_vault 확장을 자동으로 켜지 못했습니다. 대시보드 Database > Extensions 에서 supabase_vault 를 활성화하십시오.'; end;
end $$;

create table if not exists public.ai_settings(
  family_id uuid primary key references public.family_groups(id) on delete cascade,
  provider text check (provider in ('anthropic','openai','google')),
  model text check (model is null or model ~ '^[A-Za-z0-9._:/-]{1,100}$'),
  secret_id uuid,
  enabled boolean not null default true,
  daily_limit integer not null default 100 check (daily_limit between 1 and 2000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_usage(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  user_id uuid,
  kind text not null,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_family_created_idx on public.ai_usage(family_id, created_at desc);
alter table public.ai_settings enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_settings, public.ai_usage from anon, authenticated;

create or replace function fhh_private.ai_settings_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.secret_id is not null then delete from vault.secrets where id = old.secret_id; end if;
  return old;
end $$;
drop trigger if exists fhh_ai_cleanup on public.ai_settings;
create trigger fhh_ai_cleanup before delete on public.ai_settings for each row execute function fhh_private.ai_settings_cleanup();

-- 구성원용 상태(키는 절대 반환하지 않음)
create or replace function public.ai_status(p_family uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ai_settings%rowtype; used integer;
begin
  if not fhh_private.is_member(p_family) then raise exception 'Not permitted'; end if;
  select * into s from public.ai_settings where family_id = p_family;
  select count(*) into used from public.ai_usage where family_id = p_family and ok and created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'configured', s.family_id is not null and s.secret_id is not null and s.provider is not null and s.model is not null,
    'enabled', coalesce(s.enabled, false), 'provider', s.provider, 'model', s.model,
    'daily_limit', coalesce(s.daily_limit, 100), 'used_24h', used, 'has_key', s.secret_id is not null, 'updated_at', s.updated_at);
end $$;

create or replace function public.set_ai_settings(p_family uuid, p_provider text, p_model text, p_api_key text default null, p_enabled boolean default true, p_daily_limit integer default 100) returns void language plpgsql security definer set search_path='' as $$
declare s public.ai_settings%rowtype; sid uuid; k text := nullif(trim(coalesce(p_api_key, '')), '');
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  if p_provider not in ('anthropic','openai','google') then raise exception 'Invalid provider'; end if;
  if p_model is null or p_model !~ '^[A-Za-z0-9._:/-]{1,100}$' then raise exception 'Invalid model'; end if;
  if p_daily_limit is null or p_daily_limit not between 1 and 2000 then raise exception 'Invalid daily limit'; end if;
  if k is not null and length(k) not between 16 and 400 then raise exception 'Invalid API key'; end if;
  select * into s from public.ai_settings where family_id = p_family;
  if s.family_id is not null and s.provider is distinct from p_provider and k is null then raise exception 'API key required when provider changes'; end if;
  sid := s.secret_id;
  if k is not null then
    if sid is null then
      select vault.create_secret(k, 'fhh_ai_' || p_family::text || '_' || replace(gen_random_uuid()::text, '-', ''), 'Family Health Hub AI API key') into sid;
    else
      perform vault.update_secret(sid, k);
    end if;
  end if;
  if sid is null and coalesce(p_enabled, true) then raise exception 'API key required'; end if;
  insert into public.ai_settings(family_id, provider, model, secret_id, enabled, daily_limit, updated_by, updated_at)
  values (p_family, p_provider, p_model, sid, coalesce(p_enabled, true), p_daily_limit, auth.uid(), now())
  on conflict (family_id) do update
    set provider = excluded.provider, model = excluded.model, secret_id = excluded.secret_id, enabled = excluded.enabled,
        daily_limit = excluded.daily_limit, updated_by = excluded.updated_by, updated_at = now();
end $$;

create or replace function public.delete_ai_key(p_family uuid) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
  if not fhh_private.is_owner(p_family) then raise exception 'Not permitted'; end if;
  select secret_id into sid from public.ai_settings where family_id = p_family;
  update public.ai_settings set secret_id = null, enabled = false, updated_by = auth.uid(), updated_at = now() where family_id = p_family;
  if sid is not null then delete from vault.secrets where id = sid; end if;
end $$;

-- 엣지 함수 전용(service_role): 호출자가 승인된 구성원인지 확인하고 키를 복호화해 반환
create or replace function public.ai_config_for_ocr(p_family uuid, p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.ai_settings%rowtype; m public.family_members%rowtype; used integer; k text;
begin
  select * into m from public.family_members where family_id = p_family and user_id = p_user and status = 'approved';
  if m.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  select * into s from public.ai_settings where family_id = p_family;
  if s.family_id is null or s.secret_id is null or s.provider is null or s.model is null then return jsonb_build_object('ok', false, 'reason', 'not_configured', 'role', m.role); end if;
  if not s.enabled then return jsonb_build_object('ok', false, 'reason', 'disabled', 'role', m.role); end if;
  select count(*) into used from public.ai_usage where family_id = p_family and ok and created_at > now() - interval '24 hours';
  select ds.decrypted_secret into k from vault.decrypted_secrets ds where ds.id = s.secret_id;
  if k is null then return jsonb_build_object('ok', false, 'reason', 'not_configured', 'role', m.role); end if;
  return jsonb_build_object('ok', true, 'role', m.role, 'provider', s.provider, 'model', s.model, 'api_key', k,
    'daily_limit', s.daily_limit, 'used_24h', used, 'over_limit', used >= s.daily_limit);
end $$;

create or replace function public.log_ai_usage(p_family uuid, p_user uuid, p_kind text, p_ok boolean, p_error text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.ai_usage(family_id, user_id, kind, ok, error) values (p_family, p_user, left(p_kind, 40), p_ok, left(p_error, 300));
  delete from public.ai_usage where created_at < now() - interval '60 days';
end $$;

revoke all on function public.ai_status(uuid), public.set_ai_settings(uuid,text,text,text,boolean,integer), public.delete_ai_key(uuid),
  public.ai_config_for_ocr(uuid,uuid), public.log_ai_usage(uuid,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.ai_status(uuid), public.set_ai_settings(uuid,text,text,text,boolean,integer), public.delete_ai_key(uuid) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.ai_config_for_ocr(uuid,uuid), public.log_ai_usage(uuid,uuid,text,boolean,text) to service_role;
  end if;
end $$;

-- ============================================================
-- 4. 캘린더 구독 피드 갱신: 장소·준비사항(금식 등) 포함, 의료진·예약번호·전화·수납·안내문 원문은 제외
-- ============================================================
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'patient_id', a.patient_id, 'hospital', a.hospital, 'department', a.department,
               'kind', a.kind, 'place', a.place, 'test_name', a.test_name, 'fasting_hours', a.fasting_hours, 'hours_note', a.hours_note,
               'visit_date', a.visit_date, 'visit_time', a.visit_time, 'arrival_time', a.arrival_time, 'end_time', a.end_time,
               'status', a.status, 'created_at', a.created_at, 'updated_at', a.updated_at,
               'companion_name', (select m.display_name from public.family_members m where m.family_id = a.family_id and m.user_id = a.companion_id),
               'steps_before', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'title', s.title, 'relative_minutes', s.relative_minutes, 'done', s.done_at is not null) order by s.sort)
                                           from public.appointment_steps s where s.appointment_id = a.id and s.phase = 'before'), '[]'::jsonb)))
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

-- ============================================================
-- 5. Realtime (선택)
-- ============================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['appointment_steps','hospitals'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
