import React, {useEffect, useState} from 'react';
import {Users, Clock, XCircle, LogOut} from 'lucide-react';
import {Section, Field, Badge} from '../components/ui.jsx';
import {useOverlay} from '../components/ui.jsx';
import {supabase} from '../lib/supabase.js';
import {friendlyError} from '../lib/errors.js';
import {formatCode, normalizeCode, readJoinParam} from '../lib/invite.js';
import {ROLE_LABEL, fmtDateTime} from '../lib/format.js';

const RELS = ['자녀', '배우자', '형제자매', '손자녀', '친척', '요양보호사', '기타'];
export default function FamilyStart({user, groups, onEnter, onRefresh, onSignOut, defaultName}) {
  const {toast, confirm} = useOverlay();
  const [reqs, setReqs] = useState([]), [busy, setBusy] = useState(false);
  const [code, setCode] = useState(() => formatCode(readJoinParam() || sessionStorage.getItem('fhh:join-code') || ''));
  const [jName, setJName] = useState(defaultName || ''), [rel, setRel] = useState(''), [phone, setPhone] = useState('');
  const [fName, setFName] = useState(''), [myName, setMyName] = useState(defaultName || '');
  const invited = !!code;
  const loadReqs = () => supabase.rpc('my_join_requests').then(({data}) => setReqs(data || []));
  useEffect(() => { loadReqs(); const t = setInterval(() => { loadReqs(); onRefresh(); }, 15000); return () => clearInterval(t); }, []);
  useEffect(() => { try { history.replaceState(history.state, '', location.pathname); } catch {} }, []);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(friendlyError(e), {kind: 'error'}); } finally { setBusy(false); } };

  return <main className="start">
    <h1>패밀리 시작하기</h1>
    <p className="muted">{user.email} 계정으로 로그인했습니다.</p>
    {groups.length > 0 && <Section title="내 패밀리" id="mine">{groups.map(g => <button type="button" className="rowButton" key={g.family_id} onClick={() => onEnter(g.family_groups)}><Users size={18}/> <b>{g.family_groups?.name}</b> <Badge>{ROLE_LABEL[g.role]}</Badge></button>)}</Section>}
    {reqs.length > 0 && <Section title="가입 신청 현황" id="reqs">{reqs.map(r => <div className="item" key={r.id}>
      <b>{r.family_name}</b> {r.status === 'pending' ? <Badge tone="warn"><Clock size={12}/> 승인 대기 중</Badge> : <Badge tone="muted"><XCircle size={12}/> 거절됨</Badge>}<br/>
      <small className="muted">{fmtDateTime(r.created_at)} 신청 · {r.status === 'pending' ? '관리자가 승인하면 이 화면에 패밀리가 나타납니다. 급하면 관리자에게 직접 연락해 승인을 요청하십시오.' : '관리자가 신청을 거절했습니다. 필요하면 관리자에게 문의 후 다시 신청하십시오.'}</small>
      {r.status === 'pending' && <button type="button" onClick={() => run(async () => { await supabase.rpc('cancel_family_join', {p_request: r.id}); loadReqs(); toast('신청을 취소했습니다.'); })}>신청 취소</button>}</div>)}</Section>}
    <Section title={invited ? '초대받은 패밀리에 가입 신청' : '초대 코드로 가입 신청'} id="join">
      <form onSubmit={e => { e.preventDefault(); run(async () => { const {error} = await supabase.rpc('request_family_join', {p_code: normalizeCode(code), p_name: jName.trim(), p_phone: phone || null, p_relationship: rel || null}); if (error) throw error; sessionStorage.removeItem('fhh:join-code'); setCode(''); loadReqs(); toast('가입 신청이 접수되었습니다. 관리자 승인 후 이용할 수 있습니다.'); }); }}>
        <Field label="패밀리 코드" hint="관리자가 보낸 초대 링크로 접속하면 자동 입력됩니다."><input required value={code} onChange={e => setCode(formatCode(e.target.value))} autoCapitalize="characters" autoComplete="off"/></Field>
        <Field label="이름 (다른 구성원에게 표시)"><input required minLength={2} value={jName} onChange={e => setJName(e.target.value)} autoComplete="name"/></Field>
        <Field label="환자와의 관계"><select value={rel} onChange={e => setRel(e.target.value)}><option value="">선택</option>{RELS.map(r => <option key={r}>{r}</option>)}</select></Field>
        <Field label="연락처(선택)"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel"/></Field>
        <button className="primary" disabled={busy || !code.trim() || jName.trim().length < 2}>가입 신청</button></form></Section>
    <Section title="새 패밀리 만들기" id="new">
      <p className="muted">패밀리를 만들면 관리자가 됩니다. 이후 초대 링크로 가족을 초대하고 승인할 수 있습니다.</p>
      <form onSubmit={e => { e.preventDefault(); run(async () => { const {data, error} = await supabase.rpc('create_family', {p_name: fName.trim(), p_display_name: myName.trim()}); if (error) throw error; setFName(''); await onRefresh(); const g = {id: data.family_id, name: fName.trim()}; onEnter(g); toast('패밀리를 만들었습니다. 더보기 > 가족 구성원·초대에서 가족을 초대하십시오.'); }); }}>
        <Field label="패밀리 이름"><input required minLength={2} value={fName} onChange={e => setFName(e.target.value)} placeholder="예: 우리 가족"/></Field>
        <Field label="내 이름(다른 구성원에게 표시)"><input required value={myName} onChange={e => setMyName(e.target.value)} placeholder="예: 김민수"/></Field>
        <button className="primary" disabled={busy || fName.trim().length < 2 || !myName.trim()}>새 패밀리 만들기</button></form></Section>
    <button type="button" className="link" onClick={onSignOut}><LogOut size={16}/> 로그아웃</button>
  </main>;
}
