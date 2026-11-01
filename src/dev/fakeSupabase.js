// 로컬 화면 검증 전용 가짜 Supabase 클라이언트(VITE_FAKE_BACKEND=1). 운영 빌드에는 포함되지 않습니다.
// 권한(RLS)은 모사하지 않으며, 권한 검증은 supabase/tests/rls.test.mjs 가 담당합니다.
const uid = () => crypto.randomUUID();
const ME = '00000000-0000-0000-0000-0000000000a1', SIS = '00000000-0000-0000-0000-0000000000a2';
const FAM = 'f0000000-0000-0000-0000-000000000001';
const P1 = 'p0000000-0000-0000-0000-000000000001', P2 = 'p0000000-0000-0000-0000-000000000002';
const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const now = () => new Date().toISOString();

export function createFakeSupabase() {
  const params = new URLSearchParams(location.search), role = params.get('as') || 'owner', empty = params.get('empty') === '1';
  const me = role === 'sis' ? SIS : ME;
  const db = {
    family_groups: [{id: FAM, name: '김씨 가족', created_by: ME}],
    family_members: [
      {family_id: FAM, user_id: ME, role: 'owner', status: 'approved', display_name: '김민수', relationship: '장남', phone: '010-1234-5678', default_access: 'edit', created_at: now()},
      {family_id: FAM, user_id: SIS, role: 'caregiver', status: 'approved', display_name: '김민지', relationship: '장녀', phone: null, default_access: 'edit', created_at: now()}],
    family_join_requests: [{id: uid(), family_id: FAM, user_id: uid(), applicant_name: '박요양', relationship: '요양보호사', phone: '010-9999-0000', status: 'pending', created_at: now()}],
    patients: empty ? [] : [
      {id: P1, family_id: FAM, name: '김영희', relationship: '어머니', birth_date: '1948-03-02', phone: null, color: '#db2777', is_private: false, created_at: '2026-01-01T00:00:00Z'},
      {id: P2, family_id: FAM, name: '김철수', relationship: '아버지', birth_date: '1945-07-19', phone: null, color: '#2563eb', is_private: false, created_at: '2026-01-02T00:00:00Z'}],
    patient_permissions: [],
    appointments: empty ? [] : [
      {id: uid(), family_id: FAM, patient_id: P1, hospital: '서울대병원', department: '내과', doctor: '이의사', visit_date: d(0), visit_time: '10:30:00', status: '예약완료', companion_id: SIS, created_at: now(), deleted_at: null},
      {id: uid(), family_id: FAM, patient_id: P2, hospital: '연세정형외과', department: '정형외과', visit_date: d(3), visit_time: '14:00:00', status: '예약완료', companion_id: null, created_at: now(), deleted_at: null},
      {id: uid(), family_id: FAM, patient_id: P1, hospital: '강남안과', department: '안과', visit_date: d(-20), visit_time: '09:00:00', status: '진료완료', companion_id: ME, created_at: now(), deleted_at: null}],
    medical_records: empty ? [] : [{id: uid(), family_id: FAM, patient_id: P1, visit_date: d(-20), diagnosis: '백내장 초기', symptoms: '시야 흐림', tests: '시력검사', treatment: '경과 관찰', prescription: '인공눈물', cautions: '3개월 뒤 재진', memo: null, created_at: now(), deleted_at: null}],
    medications: empty ? [] : [
      {id: 'm0000000-0000-0000-0000-000000000001', family_id: FAM, patient_id: P1, name: '아모디핀', dosage: '5mg 1정', instructions: '식후', times: ['08:00', '20:00'], active: true, created_at: now(), deleted_at: null},
      {id: 'm0000000-0000-0000-0000-000000000002', family_id: FAM, patient_id: P2, name: '메트포르민', dosage: '500mg', instructions: '식사 중', times: [], active: true, created_at: now(), deleted_at: null}],
    med_intakes: empty ? [] : [{id: uid(), family_id: FAM, patient_id: P1, medication_id: 'm0000000-0000-0000-0000-000000000001', scheduled_date: d(0), slot: '08:00', status: 'taken', taken_by: SIS, taken_at: now()}],
    calendar_feeds: [],
    attachments: [], audit_logs: empty ? [] : [
      {id: uid(), family_id: FAM, actor_id: SIS, action: 'update', entity: 'appointments', label: '서울대병원', patient_id: P1, created_at: now()},
      {id: uid(), family_id: FAM, actor_id: ME, action: 'create', entity: 'medications', label: '아모디핀', patient_id: P1, created_at: new Date(Date.now() - 3600e3).toISOString()}],
    user_consents: params.get('consent') === '1' ? [] : [{user_id: me, version: '2026-11-01'}],
  };
  const files = {};
  const listeners = new Set();
  let session = params.get('anon') === '1' ? null : {user: {id: me, email: role === 'sis' ? 'sis@example.com' : 'owner@example.com', user_metadata: {}}};

  class Q {
    constructor(table) { this.t = table; this.f = []; this.mode = 'select'; this.ord = null; this.lim = null; this.single = false; }
    select(cols) { if (this.mode === 'select' || this.mode === 'mut') this.returning = true; if (this.mode === 'select') this.mode = 'select'; return this; }
    eq(k, v) { this.f.push(r => r[k] === v); return this; }
    gte(k, v) { this.f.push(r => r[k] >= v); return this; }
    in(k, v) { this.f.push(r => v.includes(r[k])); return this; }
    order(k, o = {}) { this.ord = [k, o.ascending !== false]; return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.single = true; return this; }
    insert(v) { this.mode = 'insert'; this.val = v; return this; }
    upsert(v) { this.mode = 'insert'; this.val = v; return this; }
    update(v) { this.mode = 'update'; this.val = v; return this; }
    delete() { this.mode = 'delete'; return this; }
    then(res, rej) { return this.run().then(res, rej); }
    async run() {
      await new Promise(r => setTimeout(r, 15));
      const tbl = db[this.t] || (db[this.t] = []);
      if (this.mode === 'insert') { const rows = [].concat(this.val).map(r => ({created_at: now(), ...r})); tbl.push(...rows); notify(this.t); return {data: rows, error: null}; }
      let rows = tbl.filter(r => this.f.every(fn => fn(r)));
      if (this.mode === 'update') { rows.forEach(r => Object.assign(r, this.val)); notify(this.t); return {data: rows, error: null}; }
      if (this.mode === 'delete') { db[this.t] = tbl.filter(r => !rows.includes(r)); notify(this.t); return {data: rows, error: null}; }
      if (this.ord) { const [k, asc] = this.ord; rows = rows.slice().sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this.lim) rows = rows.slice(0, this.lim);
      rows = rows.map(r => ({...r}));
      if (this.t === 'family_members') rows.forEach(r => { r.family_groups = db.family_groups.find(g => g.id === r.family_id); });
      return this.single ? {data: rows[0] || null, error: null} : {data: rows, error: null};
    }
  }
  const notify = () => listeners.forEach(fn => fn());
  const rpc = {
    create_family: a => { const id = uid(); db.family_groups.push({id, name: a.p_name}); db.family_members.push({family_id: id, user_id: me, role: 'owner', status: 'approved', display_name: a.p_display_name, default_access: 'edit'}); return {family_id: id, invite_code: 'ABCDEF123456ABCDEF'}; },
    get_family_code: () => 'ABCDEF123456ABCDEF', rotate_family_code: () => 'FEDCBA654321FEDCBA',
    my_join_requests: () => [], request_family_join: () => FAM, cancel_family_join: () => null,
    approve_family_join: a => { const r = db.family_join_requests.find(x => x.id === a.p_request); if (r) { r.status = 'approved'; db.family_members.push({family_id: FAM, user_id: r.user_id, role: 'caregiver', status: 'approved', display_name: r.applicant_name, default_access: a.p_access}); } },
    reject_family_join: a => { const r = db.family_join_requests.find(x => x.id === a.p_request); if (r) r.status = 'rejected'; },
    create_calendar_feed: a => { const t = (uid() + uid()).replace(/-/g, ''); db.calendar_feeds = [{id: uid(), user_id: me, family_id: a.p_family, token: t, include_meds: a.p_include_meds, show_med_names: a.p_show_med_names, patient_ids: a.p_patient_ids, last_fetched_at: null}]; return t; },
    update_calendar_feed: a => { const f = db.calendar_feeds[0]; if (f) Object.assign(f, {include_meds: a.p_include_meds, show_med_names: a.p_show_med_names, patient_ids: a.p_patient_ids}); },
    delete_calendar_feed: () => { db.calendar_feeds = []; },
    update_member: () => null, remove_member: () => null, update_my_profile: () => null, log_audit_event: () => null, empty_trash: () => 0, delete_my_account: () => null,
  };
  return {
    auth: {
      getSession: async () => ({data: {session}}),
      onAuthStateChange: cb => { setTimeout(() => cb('INITIAL_SESSION', session), 0); return {data: {subscription: {unsubscribe() {}}}}; },
      signInWithPassword: async () => { session = {user: {id: me, email: 'owner@example.com', user_metadata: {}}}; return {error: null}; },
      signUp: async () => ({data: {session: null}, error: null}), signOut: async () => { session = null; location.reload(); },
      resetPasswordForEmail: async () => ({error: null}), updateUser: async () => ({error: null}),
    },
    from: t => new Q(t),
    rpc: async (name, args) => { await new Promise(r => setTimeout(r, 10)); const f = rpc[name]; return f ? {data: f(args || {}), error: null} : {data: null, error: {message: 'unknown rpc ' + name}}; },
    channel: () => { const ch = {on: () => ch, subscribe: () => { listeners.add(ch._cb = () => {}); return ch; }}; return ch; },
    removeChannel: () => {},
    storage: {from: () => ({
      upload: async (p, f) => { files[p] = f; return {error: null}; }, remove: async () => ({error: null}),
      createSignedUrl: async p => ({data: {signedUrl: 'data:text/plain,' + encodeURIComponent(p)}, error: null}),
      download: async p => ({data: new Blob([files[p] || 'x']), error: null}),
    })},
  };
}
