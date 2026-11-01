import React, {useState} from 'react';
import {supabase} from '../lib/supabase.js';
import {authMessage} from '../lib/errors.js';
import {readJoinParam} from '../lib/invite.js';

export const AUTH_REDIRECT = 'https://bangdw-hash.github.io/family-health-hub/';
export function isRecoveryLink() {
  const values = new URLSearchParams(window.location.hash.slice(1)), query = new URLSearchParams(window.location.search);
  return values.get('type') === 'recovery' || query.get('type') === 'recovery';
}
function mailProviderUrl(email) {
  const d = (email.split('@')[1] || '').toLowerCase();
  if (d === 'gmail.com' || d === 'googlemail.com') return 'https://mail.google.com/';
  if (d === 'naver.com') return 'https://mail.naver.com/';
  if (['daum.net', 'hanmail.net', 'kakao.com'].includes(d)) return 'https://mail.daum.net/';
  if (['outlook.com', 'hotmail.com', 'live.com'].includes(d)) return 'https://outlook.live.com/mail/';
  if (['icloud.com', 'me.com', 'mac.com'].includes(d)) return 'https://www.icloud.com/mail/';
  if (['yahoo.com', 'yahoo.co.kr'].includes(d)) return 'https://mail.yahoo.com/';
  return null;
}

export function PasswordRecovery({onComplete}) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return setError('새 비밀번호는 8자 이상이어야 합니다.');
    if (password !== confirm) return setError('비밀번호 확인이 일치하지 않습니다.');
    setBusy(true); setError('');
    const {error: err} = await supabase.auth.updateUser({password});
    setBusy(false);
    if (err) return setError(authMessage(err));
    try { history.replaceState(null, '', window.location.pathname); } catch {}
    onComplete();
  }
  return <main className="auth"><div className="panel"><h1>새 비밀번호 설정</h1><p>복구 링크를 확인했습니다. 새로운 비밀번호를 입력하십시오.</p>
    <form onSubmit={submit}>
      <label className="field"><span className="field-label">새 비밀번호</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required/></label>
      <label className="field"><span className="field-label">새 비밀번호 확인</span><input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} required/></label>
      <button className="primary" disabled={busy}>{busy ? '변경 중...' : '비밀번호 변경'}</button></form>
    {error && <p role="alert" className="err">{error}</p>}</div></main>;
}

const rememberKeys = (remember, email) => { try { if (remember) { localStorage.setItem('fhh:remember-email', 'yes'); localStorage.setItem('fhh:remembered-email', email); } else { localStorage.removeItem('fhh:remember-email'); localStorage.removeItem('fhh:remembered-email'); } } catch {} };
export function Login() {
  const [mode, setMode] = useState('로그인'), [email, setEmail] = useState(() => { try { return localStorage.getItem('fhh:remembered-email') || ''; } catch { return ''; } }), [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('fhh:remember-email') === 'yes'; } catch { return false; } });
  const [verificationEmail, setVerificationEmail] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const invited = !!readJoinParam() || !!sessionStorage.getItem('fhh:join-code');
  const change = next => { setMode(next); setError(''); setNotice(''); setPassword(''); };
  async function submit(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const normalized = email.trim().toLowerCase();
      if (mode === '비밀번호 재설정') {
        const {error: err} = await supabase.auth.resetPasswordForEmail(normalized, {redirectTo: AUTH_REDIRECT}); if (err) throw err;
        setVerificationEmail(normalized); setNotice('비밀번호 재설정 메일을 요청했습니다. 받은편지함과 스팸함을 확인하십시오.'); return;
      }
      if (mode === '회원가입') {
        const {data, error: err} = await supabase.auth.signUp({email: normalized, password}); if (err) throw err;
        if (!data.session) { setError('서버에서 이메일 확인을 요구하고 있습니다. 관리자에게 문의하십시오(Supabase Authentication → Email → Confirm email 설정).'); return; }
        rememberKeys(remember, normalized); setPassword(''); return;
      }
      const {error: err} = await supabase.auth.signInWithPassword({email: normalized, password}); if (err) throw err;
      rememberKeys(remember, normalized); setPassword('');
    } catch (err) { setError(authMessage(err)); } finally { setBusy(false); }
  }
  return <main className="auth"><div className="panel">
    <h1>Family Health Hub</h1><p>가족의 진료·복약·기록을 안전하게 함께 관리합니다.</p>
    {invited && <div className="banner static" role="status"><span><b>초대 링크로 접속하셨습니다.</b><small>로그인 또는 회원가입 후 가입 신청 화면으로 이동합니다.</small></span></div>}
    <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={mode === '로그인'} className={mode === '로그인' ? 'selected' : ''} onClick={() => change('로그인')}>로그인</button><button type="button" role="tab" aria-selected={mode === '회원가입'} className={mode === '회원가입' ? 'selected' : ''} onClick={() => change('회원가입')}>회원가입</button></div>
    <form onSubmit={submit}>
      <label className="field"><span className="field-label">이메일</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none"/></label>
      {mode !== '비밀번호 재설정' && <label className="field"><span className="field-label">비밀번호{mode === '회원가입' ? ' (8자 이상)' : ''}</span><input type="password" minLength={mode === '회원가입' ? 8 : 6} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === '회원가입' ? 'new-password' : 'current-password'}/></label>}
      {mode === '로그인' && <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}/> <span>이메일 저장하기</span></label>}
      <button className="primary" disabled={busy}>{busy ? '처리 중...' : mode === '비밀번호 재설정' ? '재설정 메일 보내기' : mode}</button></form>
    {mode === '로그인' && <button type="button" className="link" onClick={() => change('비밀번호 재설정')}>비밀번호를 잊으셨습니까?</button>}
    {mode === '비밀번호 재설정' && <button type="button" className="link" onClick={() => change('로그인')}>로그인으로 돌아가기</button>}
    {mode === '회원가입' && <p className="muted">이메일 인증 없이 계정을 생성하고 바로 로그인합니다. 로그인 후 새 패밀리를 만들거나 기존 패밀리에 가입할 수 있습니다.</p>}
    {mode === '로그인' && <p className="muted">로그인 상태는 기기에 유지됩니다. 보안을 위해 비밀번호는 저장하지 않습니다.</p>}
    {verificationEmail && <section className="mail-verification" aria-label="메일 확인 안내"><h2>메일 확인 안내</h2><p>{verificationEmail} 주소의 받은편지함과 스팸함을 확인하십시오.</p>
      {mailProviderUrl(verificationEmail) && <a className="primary mail-link" href={mailProviderUrl(verificationEmail)} target="_blank" rel="noopener noreferrer">내 메일함 열기</a>}
      <button type="button" onClick={() => change('로그인')}>로그인으로 돌아가기</button></section>}
    {error && <p role="alert" className="err">{error}</p>}{notice && <p role="status" className="ok-text">{notice}</p>}
  </div></main>;
}
