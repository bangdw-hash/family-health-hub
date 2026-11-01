import React, {useEffect, useRef, useState} from 'react';
import {Lock, ShieldCheck} from 'lucide-react';
import {verifyPin, lockedOutSeconds} from '../lib/lock.js';
import {CONSENT_SUMMARY, CONSENT_VERSION} from '../lib/consent.js';

export function Welcome({ui, onDone}) {
  const opts = [['보통', 44, '기본 크기'], ['크게', 56, '글자와 버튼을 크게'], ['매우 크게', 68, '가장 크게']];
  return <main className="auth"><div className="panel">
    <h1>환영합니다</h1><p>먼저 보기 편한 글자 크기를 선택하십시오. 나중에 더보기 &gt; 화면·글자 크기에서 바꿀 수 있습니다.</p>
    <div className="sizes" role="radiogroup" aria-label="글자 크기">{opts.map(([f, b, d]) => <button type="button" role="radio" aria-checked={ui.font === f} key={f} className={'sizeopt' + (ui.font === f ? ' on' : '')} onClick={() => { ui.setFont(f); ui.setButtonSize(b); }}><b>{f}</b><small>{d}</small></button>)}</div>
    <button className="primary" onClick={onDone}>이 크기로 시작</button></div></main>;
}

export function Consent({onAccept, onSignOut, busy}) {
  const [ok, setOk] = useState(false);
  return <main className="auth"><div className="panel">
    <h1><ShieldCheck size={22}/> 개인정보 처리 동의</h1>
    <p className="muted">건강 관련 정보는 민감정보입니다. 아래 내용을 확인하고 동의하셔야 이용할 수 있습니다.</p>
    <div className="consent-box" tabIndex={0} aria-label="개인정보 처리 안내"><p className="pre">{CONSENT_SUMMARY}</p></div>
    <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)}/> <span><b>위 내용을 확인했으며 동의합니다.</b><small>동의 버전 {CONSENT_VERSION}</small></span></label>
    <button className="primary" disabled={!ok || busy} onClick={onAccept}>동의하고 시작</button>
    <button type="button" className="link" onClick={onSignOut}>동의하지 않음 (로그아웃)</button></div></main>;
}

export function LockScreen({onUnlock, onSignOut}) {
  const [pin, setPin] = useState(''), [err, setErr] = useState(''), [wait, setWait] = useState(lockedOutSeconds()), ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(lockedOutSeconds()), 1000); return () => clearTimeout(t); }, [wait]);
  async function submit(e) {
    e.preventDefault();
    if (await verifyPin(pin)) return onUnlock();
    setPin(''); const w = lockedOutSeconds(); setWait(w);
    setErr(w > 0 ? `PIN을 여러 번 잘못 입력했습니다. ${w}초 후 다시 시도하십시오.` : 'PIN이 올바르지 않습니다.');
  }
  return <main className="auth lock"><form className="panel" onSubmit={submit}>
    <h1><Lock size={22}/> 앱이 잠겨 있습니다</h1><p className="muted">PIN을 입력하십시오.</p>
    <input ref={ref} type="password" inputMode="numeric" autoComplete="current-password" aria-label="PIN" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} disabled={wait > 0}/>
    {err && <p role="alert" className="err">{wait > 0 ? `PIN을 여러 번 잘못 입력했습니다. ${wait}초 후 다시 시도하십시오.` : err}</p>}
    <button className="primary" disabled={wait > 0 || pin.length < 4}>잠금 해제</button>
    <button type="button" className="link" onClick={onSignOut}>PIN을 잊었습니다 (로그아웃)</button></form></main>;
}
