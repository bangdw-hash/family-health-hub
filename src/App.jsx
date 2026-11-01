import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Home, Users, CalendarDays, Pill, Menu, Plus, Search as SearchIcon, RefreshCw, Lock as LockIcon, WifiOff, DatabaseZap} from 'lucide-react';
import {supabase, configured} from './lib/supabase.js';
import {installNativeLifecycle, isNativeApp, exitApp} from './lib/platform.js';
import {cancelMedicationNotifications} from './lib/mobileNotifications.js';
import {friendlyError} from './lib/errors.js';
import {accessFor, canAddPatient as canAdd} from './lib/access.js';
import {patientColor, todayStr} from './lib/format.js';
import {hasPin, clearPin, autoLockMinutes} from './lib/lock.js';
import {loadPrefs, buildSchedule, applySchedule, stopReminders} from './lib/reminders.js';
import {CONSENT_VERSION} from './lib/consent.js';
import {makeApi, shouldAutoPurge} from './lib/api.js';
import {readJoinParam} from './lib/invite.js';
import {OverlayProvider, useOverlay, closeTopSheet} from './components/ui.jsx';
import Sheets from './components/Sheets.jsx';
import {live} from './components/cards.jsx';
import {AppCtx} from './state.js';
import {useNav} from './hooks/useNav.js';
import {useUiPrefs, fontClass} from './hooks/useUiPrefs.js';
import {useFamilyData} from './hooks/useFamilyData.js';
import {Login, PasswordRecovery, isRecoveryLink} from './pages/Auth.jsx';
import {Welcome, Consent, LockScreen} from './pages/Gates.jsx';
import FamilyStart from './pages/FamilyStart.jsx';
import Today from './pages/Today.jsx';
import Patients from './pages/Patients.jsx';
import Schedule from './pages/Schedule.jsx';
import Meds from './pages/Meds.jsx';
import More from './pages/More.jsx';
import Search from './pages/Search.jsx';

const TABS = [['today', '오늘', Home], ['patients', '환자', Users], ['schedule', '일정', CalendarDays], ['meds', '복약', Pill], ['more', '더보기', Menu]];
const FONT_PX = {'작게': 14, '보통': 16, '크게': 19, '매우 크게': 22};

export default function App() { return <OverlayProvider><Root/></OverlayProvider>; }

function Root() {
  const {toast} = useOverlay(), ui = useUiPrefs();
  const [recovery, setRecovery] = useState(isRecoveryLink), [session, setSession] = useState(null), [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(hasPin), [consent, setConsent] = useState(undefined), [busy, setBusy] = useState(false);
  const hiddenAt = useRef(0);

  // 화면 설정을 문서 전체에 적용(로그인 화면 포함)
  useEffect(() => {
    const r = document.documentElement;
    r.style.fontSize = (FONT_PX[ui.font] || 16) + 'px'; r.style.setProperty('--fhh-button-size', ui.buttonSize + 'px');
    r.dataset.theme = ui.theme === '밝게' ? 'light' : ui.theme === '어둡게' ? 'dark' : 'auto'; r.dataset.contrast = ui.contrast ? 'high' : '';
  }, [ui.font, ui.buttonSize, ui.theme, ui.contrast]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    if (readJoinParam()) { try { sessionStorage.setItem('fhh:join-code', readJoinParam()); } catch {} }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setLoading(false); });
    const {data: {subscription}} = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      if (!s) { cancelMedicationNotifications().catch(() => {}); stopReminders(); setConsent(undefined); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 개인정보 동의 여부 확인(서버 미적용·오프라인이면 차단하지 않음)
  useEffect(() => {
    if (!session) return;
    let off = false;
    supabase.from('user_consents').select('version').eq('user_id', session.user.id).eq('version', CONSENT_VERSION).maybeSingle()
      .then(({data, error}) => { if (!off) setConsent(error ? true : !!data); });
    return () => { off = true; };
  }, [session?.user.id]);

  // 앱 잠금: 백그라운드에 오래 머물면 잠급니다
  useEffect(() => {
    const away = () => { hiddenAt.current = Date.now(); };
    const back = () => { if (hasPin() && hiddenAt.current && Date.now() - hiddenAt.current > autoLockMinutes() * 60000) setLocked(true); hiddenAt.current = 0; };
    const vis = () => document.hidden ? away() : back();
    document.addEventListener('visibilitychange', vis);
    const off = installNativeLifecycle({onPause: away, onResume: back});
    return () => { document.removeEventListener('visibilitychange', vis); off(); };
  }, []);

  const signOut = useCallback(async () => {
    clearPin(); setLocked(false); stopReminders();
    try { localStorage.removeItem('fhh:reminders'); localStorage.removeItem('fhh:last-family'); } catch {}
    await cancelMedicationNotifications().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  if (!configured) return <main className="auth"><div className="panel"><h1>Family Health Hub</h1><p>Supabase 연결 설정이 필요합니다.</p><p>호스팅 환경변수 VITE_SUPABASE_URL 및 VITE_SUPABASE_PUBLISHABLE_KEY를 설정하십시오. 사용자에게 서버 키 입력을 요구하지 않습니다.</p></div></main>;
  if (loading) return <main className="auth"><p role="status">로그인 확인 중...</p></main>;
  if (recovery) return <PasswordRecovery onComplete={() => { setRecovery(false); toast('비밀번호가 변경되었습니다.'); }}/>;
  if (!session) return <Login/>;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} onSignOut={signOut}/>;
  if (consent === undefined) return <main className="auth"><p role="status">확인 중...</p></main>;
  if (consent === false) return <Consent busy={busy} onSignOut={signOut} onAccept={async () => {
    setBusy(true);
    const {error} = await supabase.from('user_consents').insert({user_id: session.user.id, version: CONSENT_VERSION});
    setBusy(false);
    if (error) toast(friendlyError(error), {kind: 'error'}); else setConsent(true);
  }}/>;
  if (!ui.onboarded) return <Welcome ui={ui} onDone={() => ui.setOnboarded(true)}/>;
  return <Authed session={session} ui={ui} signOut={signOut} lockNow={() => setLocked(true)}/>;
}

function Authed({session, ui, signOut, lockNow}) {
  const {toast} = useOverlay(), uid = session.user.id;
  const [groups, setGroups] = useState(null), [family, setFamilyState] = useState(null), didAuto = useRef(false);
  const refreshGroups = useCallback(async () => {
    const {data, error} = await supabase.from('family_members').select('family_id,role,status,family_groups(id,name)').eq('user_id', uid).eq('status', 'approved');
    if (error) { toast(friendlyError(error), {kind: 'error'}); setGroups(g => g || []); return; }
    setGroups(data || []);
  }, [uid]);
  useEffect(() => { refreshGroups(); }, [refreshGroups]);
  const setFamily = useCallback(g => { setFamilyState(g); try { g ? localStorage.setItem('fhh:last-family', g.id) : null; } catch {} }, []);
  useEffect(() => {
    if (!groups) return;
    if (!didAuto.current) {
      didAuto.current = true;
      const joining = !!sessionStorage.getItem('fhh:join-code');
      let last = null; try { last = localStorage.getItem('fhh:last-family'); } catch {}
      const pick = groups.find(g => g.family_id === last) || (groups.length === 1 && !joining ? groups[0] : null);
      if (pick) setFamily(pick.family_groups);
    }
    if (family && !groups.some(g => g.family_id === family.id)) setFamilyState(null);
  }, [groups]);
  if (!groups) return <main className="auth"><p role="status">불러오는 중...</p></main>;
  if (!family) return <FamilyStart user={session.user} groups={groups} onEnter={setFamily} onRefresh={refreshGroups} onSignOut={signOut} defaultName={session.user.user_metadata?.name || ''}/>;
  return <FamilyApp key={family.id} session={session} family={family} groups={groups} ui={ui} signOut={signOut} lockNow={lockNow} setFamily={setFamily} refreshGroups={refreshGroups}/>;
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => { const a = () => setOn(true), b = () => setOn(false); addEventListener('online', a); addEventListener('offline', b); return () => { removeEventListener('online', a); removeEventListener('offline', b); }; }, []);
  return on;
}
function useToday() {
  const [t, setT] = useState(todayStr);
  useEffect(() => { const i = setInterval(() => setT(todayStr()), 60000); return () => clearInterval(i); }, []);
  return t;
}

function FamilyApp({session, family, groups, ui, signOut, lockNow, setFamily, refreshGroups}) {
  const {toast, confirm} = useOverlay(), user = session.user;
  const fail = useCallback(e => toast(friendlyError(e), {kind: 'error'}), [toast]);
  const {data, loading, outdated, visitsReady, me, load, reload} = useFamilyData(user.id, family.id, {onError: fail});
  const [aiStatus, setAiStatus] = useState(null);
  const refreshAi = useCallback(async () => { const {data: d, error} = await supabase.rpc('ai_status', {p_family: family.id}); setAiStatus(error ? null : {...d, familyId: family.id}); }, [family.id]);
  useEffect(() => { refreshAi(); }, [refreshAi]);
  const nav = useNav(), online = useOnline(), today = useToday();
  const [sheetState, setSheetState] = useState(null);
  const sheet = useMemo(() => ({current: sheetState, open: (type, props = {}) => setSheetState({type, ...props}), close: () => setSheetState(null)}), [sheetState]);
  const api = useMemo(() => makeApi({familyId: family.id, userId: user.id, reload}), [family.id, user.id, reload]);
  const isOwner = me?.role === 'owner';
  const patients = useMemo(() => live(data.patients), [data.patients]);
  const can = useCallback((pid, op) => { const p = data.patients.find(x => x.id === pid); return !!p && accessFor(me, p, data.patient_permissions)[op]; }, [me, data.patients, data.patient_permissions]);
  const creatable = useMemo(() => patients.filter(p => can(p.id, 'create')), [patients, can]);
  const colorOf = useCallback(pid => { const i = data.patients.findIndex(p => p.id === pid); return patientColor(data.patients[i], Math.max(i, 0)); }, [data.patients]);
  const act = useCallback(async fn => { try { return await fn(); } catch (e) { fail(e); } }, [fail]);
  const trashItem = useCallback(async (table, id, label) => {
    try { await api.trash(table, id); toast(`'${label}' 항목을 휴지통으로 이동했습니다.`, {action: {label: '되돌리기', onClick: () => api.restore(table, id).catch(fail)}}); } catch (e) { fail(e); }
  }, [api, toast, fail]);

  // 알림 일정 갱신(이 기기에서만, 사용자가 선택한 환자만)
  useEffect(() => {
    const run = () => applySchedule(buildSchedule({appointments: data.appointments, medications: data.medications, steps: data.appointment_steps, patients, prefs: loadPrefs()})).catch(() => {});
    run(); addEventListener('fhh-reminders', run);
    return () => removeEventListener('fhh-reminders', run);
  }, [data.appointments, data.medications, data.appointment_steps, patients]);

  // 관리자 접속 시 30일 경과 휴지통 항목 자동 정리(하루 1회)
  useEffect(() => { if (isOwner && !loading && !outdated && shouldAutoPurge(family.id)) api.purgeTrash(30, data.attachments).catch(() => {}); }, [isOwner, loading, outdated]);

  // 네이티브 뒤로가기 / 재진입 시 갱신
  const navRef = useRef(nav); navRef.current = nav;
  useEffect(() => installNativeLifecycle({
    onResume: () => { refreshGroups(); load(); },
    onBack: () => { if (closeTopSheet()) return; const n = navRef.current; if (!n.atRoot) n.back(); else if (n.state.tab !== 'today') n.tab('today'); else exitApp(); },
  }), [load, refreshGroups]);

  const pendingCount = isOwner ? data.family_join_requests.filter(r => r.status === 'pending').length : 0;
  const ctx = {user, family, groups, setFamily, me, isOwner, members: data.family_members, data, patients, creatable, canAddPatient: canAdd(me), can, colorOf,
    patientById: id => data.patients.find(p => p.id === id), api, act, fail, toast, confirm, nav, sheet, today, ui, reload, lockNow, signOut,
    visibleLogs: data.audit_logs, trashItem, features: {visits: visitsReady}, ai: aiStatus && {...aiStatus, refresh: refreshAi}, refreshAi, signOutAfterLeave: () => { setFamily(null); refreshGroups(); }};

  const {tab, search, sub, patientId} = nav.state;
  if (outdated) return <main className="start"><div className="panel"><h1><DatabaseZap size={24}/> 서버 업데이트가 필요합니다</h1>
    <p>이 앱 버전은 새 데이터베이스 구조를 사용합니다. 서버 관리자가 <code>supabase/migrations/20261101000000_collaboration.sql</code> 을 Supabase SQL Editor에서 실행한 뒤 새로고침하십시오.</p>
    <button type="button" className="primary" onClick={() => location.reload()}>새로고침</button><button type="button" onClick={() => setFamily(null)}>패밀리 전환</button></div></main>;

  const Page = search ? Search : tab === 'patients' ? Patients : tab === 'schedule' ? Schedule : tab === 'meds' ? Meds : tab === 'more' ? More : Today;
  const showFab = !search && !sub && tab !== 'more';
  return <AppCtx.Provider value={ctx}>
    <div className="app">
      <a className="skip" href="#main">본문으로 건너뛰기</a>
      <header>
        <div className="brand"><strong>{family.name}</strong><small>{isNativeApp ? '모바일 앱 · ' : ''}{me ? (isOwner ? '관리자' : '보호자') + ' · ' + (me.display_name || '') : '확인 중...'}</small></div>
        <div className="actions">
          <button type="button" className="icon-btn" aria-label="검색" onClick={() => nav.go({search: true})}><SearchIcon size={20}/></button>
          <button type="button" className="icon-btn" aria-label="새로고침" onClick={() => { refreshGroups(); load(); toast('최신 상태로 갱신했습니다.'); }}><RefreshCw size={20}/></button>
          {hasPin() && <button type="button" className="icon-btn" aria-label="앱 잠그기" onClick={lockNow}><LockIcon size={20}/></button>}
        </div>
      </header>
      {!online && <div className="offline" role="status"><WifiOff size={16}/> 오프라인입니다. 저장은 연결된 뒤에 가능합니다.</div>}
      <main id="main" tabIndex={-1}>
        {loading && !data.patients.length && <p role="status" className="muted">불러오는 중...</p>}
        <Page/>
      </main>
      {showFab && <button type="button" className="fab" aria-label="새 항목 추가" onClick={() => sheet.open('quick', {defaultPatient: patientId || ''})}><Plus size={28}/></button>}
      <nav aria-label="주 메뉴">{TABS.map(([id, label, Icon]) => <button type="button" key={id} className={tab === id && !search ? 'active' : ''} aria-current={tab === id && !search ? 'page' : undefined} onClick={() => nav.tab(id)}>
        <Icon size={22} aria-hidden="true"/><span>{label}</span>{id === 'more' && pendingCount > 0 && <i className="nbadge" aria-label={`승인 대기 ${pendingCount}건`}>{pendingCount}</i>}</button>)}</nav>
      <Sheets/>
    </div>
  </AppCtx.Provider>;
}
