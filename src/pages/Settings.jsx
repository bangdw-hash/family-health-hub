import React, {useState} from 'react';
import {useApp} from '../state.js';
import {PageHeader, Field, Section, Badge} from '../components/ui.jsx';
import {FONT_STEPS} from '../hooks/useUiPrefs.js';
import {hasPin, setPin, clearPin, autoLockMinutes, setAutoLockMinutes, verifyPin} from '../lib/lock.js';
import {loadPrefs, savePrefs, buildSchedule, applySchedule} from '../lib/reminders.js';
import {requestMedicationNotificationPermission, notificationPermission} from '../lib/mobileNotifications.js';
import {supabase} from '../lib/supabase.js';
import {CONSENT_VERSION, CONSENT_SUMMARY} from '../lib/consent.js';
import {isNativeApp} from '../lib/platform.js';
import {LogOut, Trash2, KeyRound} from 'lucide-react';

export function Display() {
  const {nav, ui} = useApp();
  return <>
    <PageHeader title="화면·글자 크기" onBack={nav.back}/>
    <section className="panel">
      <Field label="글자 크기"><select value={ui.font} onChange={e => ui.setFont(e.target.value)}>{FONT_STEPS.map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label={`버튼 크기 (${ui.buttonSize}px)`} hint="손가락이 큰 경우 크게 설정하십시오."><input type="range" min="40" max="72" step="2" value={ui.buttonSize} onChange={e => ui.setButtonSize(Number(e.target.value))}/></Field>
      <Field label="화면 모드"><select value={ui.theme} onChange={e => ui.setTheme(e.target.value)}>{['자동', '밝게', '어둡게'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <label className="check"><input type="checkbox" checked={ui.contrast} onChange={e => ui.setContrast(e.target.checked)}/> <span><b>고대비·굵은 글씨</b><small>글자와 테두리를 더 선명하게 표시합니다.</small></span></label>
    </section>
    <section className="panel"><h3>미리보기</h3><p>오늘 오전 8시 · 혈압약 1정</p><button type="button" className="primary">복용 확인</button></section>
  </>;
}

export function Security() {
  const {nav, lockNow, act, toast} = useApp();
  const [has, setHas] = useState(hasPin()), [pin, setP] = useState(''), [pin2, setP2] = useState(''), [mins, setMins] = useState(autoLockMinutes()), [err, setErr] = useState(''), [cur, setCur] = useState('');
  async function enable(e) {
    e.preventDefault(); setErr('');
    if (pin !== pin2) return setErr('PIN 확인이 일치하지 않습니다.');
    try { await setPin(pin, mins); setHas(true); setP(''); setP2(''); toast('앱 잠금을 설정했습니다.'); } catch (x) { setErr(x.message); }
  }
  async function disable(e) {
    e.preventDefault(); setErr('');
    if (!await verifyPin(cur)) return setErr('현재 PIN이 올바르지 않거나 잠시 대기해야 합니다.');
    clearPin(); setHas(false); setCur(''); toast('앱 잠금을 해제했습니다.');
  }
  return <>
    <PageHeader title="앱 잠금" onBack={nav.back}/>
    <section className="panel">
      <p className="muted">이 기기에서 앱을 열 때 PIN을 요구합니다. PIN은 이 기기에만 저장되며 서버로 전송되지 않습니다. PIN을 잊으면 로그아웃 후 다시 로그인해야 합니다.</p>
      {!has ? <form onSubmit={enable}>
        <Field label="PIN (숫자 4~8자리)"><input type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required value={pin} onChange={e => setP(e.target.value.replace(/\D/g, ''))}/></Field>
        <Field label="PIN 확인"><input type="password" inputMode="numeric" pattern="\d{4,8}" autoComplete="new-password" required value={pin2} onChange={e => setP2(e.target.value.replace(/\D/g, ''))}/></Field>
        <Field label="자동 잠금"><select value={mins} onChange={e => setMins(Number(e.target.value))}>{[1, 5, 15, 30].map(m => <option key={m} value={m}>앱을 벗어난 지 {m}분 후</option>)}</select></Field>
        {err && <p role="alert" className="err">{err}</p>}
        <button className="primary"><KeyRound size={18}/> 앱 잠금 켜기</button></form>
        : <>
          <Field label="자동 잠금"><select value={mins} onChange={e => { setMins(Number(e.target.value)); setAutoLockMinutes(Number(e.target.value)); }}>{[1, 5, 15, 30].map(m => <option key={m} value={m}>앱을 벗어난 지 {m}분 후</option>)}</select></Field>
          <button type="button" className="primary" onClick={lockNow}>지금 잠그기</button>
          <form onSubmit={disable}><Field label="잠금 해제하려면 현재 PIN 입력"><input type="password" inputMode="numeric" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value.replace(/\D/g, ''))}/></Field>
            {err && <p role="alert" className="err">{err}</p>}<button>앱 잠금 끄기</button></form></>}
    </section>
  </>;
}

export function Notify() {
  const {nav, patients, data, toast, fail} = useApp();
  const [prefs, setPrefs] = useState(loadPrefs), [perm, setPerm] = useState(notificationPermission());
  const update = p => { const n = {...prefs, ...p}; setPrefs(n); savePrefs(n); window.dispatchEvent(new Event('fhh-reminders')); };
  async function enable(on) {
    if (!on) return update({enabled: false});
    const r = await requestMedicationNotificationPermission();
    setPerm(notificationPermission());
    if (!r.supported) return toast('이 브라우저는 알림을 지원하지 않습니다.', {kind: 'error'});
    if (!r.granted) return toast('알림 권한이 거부되었습니다. 기기 설정에서 허용한 뒤 다시 켜십시오.', {kind: 'error'});
    update({enabled: true});
  }
  const pp = id => prefs.patients[id] || {meds: false, appts: false};
  const setP = (id, k, v) => update({patients: {...prefs.patients, [id]: {...pp(id), [k]: v}}});
  return <>
    <PageHeader title="알림" onBack={nav.back}/>
    <section className="panel">
      <p className="muted">알림은 이 기기에서만 울리며, 선택한 환자에 대해서만 예약됩니다. {isNativeApp ? '앱이 닫혀 있어도 울립니다(앞으로 7일분을 예약하므로 앱을 가끔 열어 갱신하십시오).' : '웹 브라우저에서는 앱이 열려 있는 동안만 알림이 울립니다. 확실한 알림이 필요하면 모바일 앱을 사용하십시오.'}</p>
      <label className="check"><input type="checkbox" checked={prefs.enabled} onChange={e => enable(e.target.checked)}/> <span><b>이 기기에서 알림 받기</b><small>권한 상태: {perm === 'granted' || perm === 'native' ? '허용' : perm === 'denied' ? '거부됨(기기 설정에서 변경)' : perm === 'unsupported' ? '지원 안 함' : '미요청'}</small></span></label>
    </section>
    {prefs.enabled && <>
      <Section title="알림 받을 환자" id="n-p">{patients.length === 0 && <p className="muted">환자가 없습니다.</p>}{patients.map(p => <div className="item" key={p.id}><b>{p.name}</b>
        <label className="check"><input type="checkbox" checked={pp(p.id).meds} onChange={e => setP(p.id, 'meds', e.target.checked)}/> <span>복약 시간 알림</span></label>
        <label className="check"><input type="checkbox" checked={pp(p.id).appts} onChange={e => setP(p.id, 'appts', e.target.checked)}/> <span>진료 일정 알림</span></label></div>)}</Section>
      <Section title="세부 설정" id="n-d">
        <Field label="진료 전 알림"><select value={prefs.leadMinutes} onChange={e => update({leadMinutes: Number(e.target.value)})}>{[[30, '30분 전'], [60, '1시간 전'], [120, '2시간 전'], [180, '3시간 전']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
        <label className="check"><input type="checkbox" checked={prefs.dayBefore} onChange={e => update({dayBefore: e.target.checked})}/> <span>진료 전날 오후 6시에도 알림</span></label>
        <label className="check"><input type="checkbox" checked={prefs.showDetail} onChange={e => update({showDetail: e.target.checked})}/> <span><b>알림에 환자 이름·약 이름 표시</b><small>끄면 잠금 화면에 건강정보가 보이지 않습니다(권장).</small></span></label>
        <button type="button" onClick={async () => { try { await applySchedule([{id: 1, at: new Date(Date.now() + 5000), title: '테스트 알림', body: '5초 후 표시되는 알림입니다.'}]); toast('5초 후 테스트 알림이 표시됩니다.'); } catch (e) { fail(e); } }}>테스트 알림 보내기</button></Section>
    </>}
  </>;
}

export function Privacy() {
  const {nav, user, act, confirm, toast, groups, signOut} = useApp();
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [err, setErr] = useState('');
  async function changePw(e) {
    e.preventDefault(); setErr('');
    if (pw.length < 8) return setErr('새 비밀번호는 8자 이상이어야 합니다.');
    if (pw !== pw2) return setErr('비밀번호 확인이 일치하지 않습니다.');
    act(async () => { const {error} = await supabase.auth.updateUser({password: pw}); if (error) throw error; setPw(''); setPw2(''); toast('비밀번호를 변경했습니다.'); });
  }
  async function del() {
    if (!await confirm({title: '계정 삭제', body: '계정과 로그인 정보가 영구 삭제됩니다. 다른 구성원이 없는 내 패밀리는 환자 데이터와 첨부 파일까지 함께 삭제됩니다. 다른 구성원이 있는 패밀리의 유일한 관리자라면 먼저 다른 관리자를 지정해야 합니다. 되돌릴 수 없습니다.', confirmLabel: '계정 삭제', danger: true})) return;
    if (prompt('삭제를 진행하려면 "삭제"를 입력하십시오.') !== '삭제') return toast('입력이 일치하지 않아 취소했습니다.');
    act(async () => {
      for (const g of groups.filter(x => x.role === 'owner')) {
        const {data: ms} = await supabase.from('family_members').select('user_id').eq('family_id', g.family_id).eq('status', 'approved');
        if (ms?.length === 1) { const {data: fs} = await supabase.from('attachments').select('storage_path').eq('family_id', g.family_id); if (fs?.length) await supabase.storage.from('fhh-attachments').remove(fs.map(f => f.storage_path)); }
      }
      const {error} = await supabase.rpc('delete_my_account'); if (error) throw error;
      clearPin(); try { localStorage.clear(); } catch {}
      await supabase.auth.signOut().catch(() => {}); location.reload();
    });
  }
  return <>
    <PageHeader title="개인정보·계정" onBack={nav.back}/>
    <Section title="개인정보 처리 안내" id="pv"><p className="pre">{CONSENT_SUMMARY}</p><small className="muted">동의 버전 {CONSENT_VERSION} · 전문은 저장소의 PRIVACY.md를 참고하십시오.</small></Section>
    <Section title="계정" id="ac"><p>{user.email}</p>
      <form onSubmit={changePw}><Field label="새 비밀번호(8자 이상)"><input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={e => setPw(e.target.value)}/></Field>
        <Field label="새 비밀번호 확인"><input type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={e => setPw2(e.target.value)}/></Field>
        {err && <p role="alert" className="err">{err}</p>}<button disabled={!pw}>비밀번호 변경</button></form>
      <div className="stack"><button type="button" onClick={signOut}><LogOut size={18}/> 로그아웃</button>
        <button type="button" className="danger" onClick={del}><Trash2 size={18}/> 계정 삭제</button></div></Section>
  </>;
}
