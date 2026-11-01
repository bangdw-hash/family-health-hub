import React, {useEffect, useState} from 'react';
import qrcode from 'qrcode-generator';
import {useApp} from '../state.js';
import {Section, PageHeader, Badge, Sheet, Field, FormActions} from '../components/ui.jsx';
import {formatCode, inviteLink, inviteMessage} from '../lib/invite.js';
import {ROLE_LABEL, ACCESS_LABEL, fmtDateTime} from '../lib/format.js';
import {Copy, Share2, QrCode, RefreshCw, Link2, MessageSquareText} from 'lucide-react';

export default function Members() {
  const {nav, isOwner, members, data, family, me, api, act, toast, confirm, sheet, user} = useApp();
  const [code, setCode] = useState(undefined), [qr, setQr] = useState(false), [access, setAccess] = useState({}), [edit, setEdit] = useState(null);
  useEffect(() => { if (isOwner) api.rpc('get_family_code', {p_family: family.id}).then(c => setCode(c || null)).catch(() => setCode(null)); }, [isOwner, family.id]);
  const approved = members.filter(m => m.status === 'approved');
  const pending = data.family_join_requests.filter(r => r.status === 'pending');
  const link = code ? inviteLink(code) : '';
  const msg = code ? inviteMessage(family.name, code) : '';
  const copy = (text, ok) => act(async () => { await navigator.clipboard.writeText(text); toast(ok); });
  async function rotate() {
    if (!await confirm({title: '코드 재발급', body: '기존 코드와 초대 링크가 즉시 무효가 됩니다. 이미 승인된 구성원에게는 영향이 없습니다. 재발급하시겠습니까?', confirmLabel: '재발급'})) return;
    act(async () => { setCode(await api.rpc('rotate_family_code', {p_family: family.id})); toast('새 코드를 발급했습니다.'); });
  }
  let svg = '';
  if (qr && link) { const q = qrcode(0, 'M'); q.addData(link); q.make(); svg = q.createSvgTag({cellSize: 5, margin: 2, scalable: true}); }
  return <>
    <PageHeader title="가족 구성원" onBack={nav.back}/>
    {isOwner && <Section title="가족 초대" id="inv">
      <p className="muted">초대 링크를 카카오톡 등으로 보내면 상대방이 가입 신청을 하고, 관리자가 승인해야 접근할 수 있습니다.</p>
      {code === undefined ? <p>불러오는 중...</p> : code ? <>
        <div className="codebox" aria-label="패밀리 코드">{formatCode(code)}</div>
        <div className="stack">
          <button type="button" className="primary" onClick={() => copy(msg, '초대 문구를 복사했습니다. 카카오톡에 붙여넣어 전달하십시오.')}><MessageSquareText size={18}/> 초대 문구 복사 (카카오톡용)</button>
          <div className="row2"><button type="button" onClick={() => copy(link, '초대 링크를 복사했습니다.')}><Link2 size={18}/> 링크 복사</button><button type="button" onClick={() => copy(code, '코드를 복사했습니다.')}><Copy size={18}/> 코드 복사</button></div>
          <div className="row2">{navigator.share && <button type="button" onClick={() => navigator.share({title: '가족 건강 관리 초대', text: msg}).catch(() => {})}><Share2 size={18}/> 공유</button>}
            <button type="button" aria-expanded={qr} onClick={() => setQr(!qr)}><QrCode size={18}/> QR 코드 {qr ? '숨기기' : '보기'}</button></div>
        </div>
        {qr && svg && <div className="qr" aria-label="초대 QR 코드" dangerouslySetInnerHTML={{__html: svg}}/>}
      </> : <p>코드를 표시할 수 없습니다(이전 버전에서 만든 패밀리). 재발급하면 표시됩니다.</p>}
      <button type="button" onClick={rotate}><RefreshCw size={16}/> 코드 재발급</button>
    </Section>}
    {isOwner && <Section title={`가입 승인 대기 ${pending.length}건`} id="pend">
      {pending.length === 0 && <p className="muted">대기 중인 신청이 없습니다.</p>}
      {pending.map(r => <div className="item" key={r.id}>
        <b>{r.applicant_name}</b> <small className="muted">{[r.relationship, r.phone].filter(Boolean).join(' · ') || '관계·연락처 미입력'} · {fmtDateTime(r.created_at)}</small>
        <Field label="승인 후 기본 접근 수준"><select value={access[r.id] || 'edit'} onChange={e => setAccess({...access, [r.id]: e.target.value})}>
          <option value="edit">공동 편집 — 모든 환자 조회·등록·수정 (권장)</option><option value="view">열람만 — 모든 환자 조회</option><option value="none">환자별 지정 — 지정한 환자만</option></select></Field>
        <div className="row2"><button type="button" className="primary" onClick={() => act(async () => { await api.rpc('approve_family_join', {p_request: r.id, p_access: access[r.id] || 'edit'}); api.reloadAll(); toast(r.applicant_name + '님을 승인했습니다.'); })}>승인</button>
          <button type="button" onClick={async () => { if (await confirm({title: '신청 거절', body: r.applicant_name + '님의 가입 신청을 거절하시겠습니까?', confirmLabel: '거절', danger: true})) act(async () => { await api.rpc('reject_family_join', {p_request: r.id}); api.reloadAll(); }); }}>거절</button></div>
      </div>)}
    </Section>}
    <Section title={`구성원 ${approved.length}명`} id="mem">
      {approved.map(m => <button type="button" className="rowButton" key={m.user_id} onClick={() => setEdit(m)}>
        <span><b>{m.display_name || '이름 없음'}</b>{m.user_id === user.id && <Badge>나</Badge>} <Badge tone={m.role === 'owner' ? 'warn' : ''}>{ROLE_LABEL[m.role]}</Badge><br/>
          <small className="muted">{m.role === 'owner' ? '모든 환자 관리' : ACCESS_LABEL[m.default_access]}{m.relationship ? ' · ' + m.relationship : ''}</small></span></button>)}
    </Section>
    {edit && <MemberSheet m={edit} onClose={() => setEdit(null)}/>}
  </>;
}

function MemberSheet({m, onClose}) {
  const {isOwner, user, api, act, confirm, toast, family, members, signOutAfterLeave} = useApp();
  const self = m.user_id === user.id, canManage = isOwner && !self;
  const [role, setRole] = useState(m.role), [accessLv, setAccessLv] = useState(m.default_access), [name, setName] = useState(m.display_name || ''), [rel, setRel] = useState(m.relationship || ''), [phone, setPhone] = useState(m.phone || '');
  const owners = members.filter(x => x.role === 'owner' && x.status === 'approved').length;
  async function remove() {
    const body = self ? '이 패밀리에서 탈퇴하면 모든 데이터에 접근할 수 없게 됩니다. 다시 참여하려면 관리자의 승인이 필요합니다.' : (m.display_name || '구성원') + '님을 패밀리에서 제거합니다. 이 구성원은 즉시 모든 데이터에 접근할 수 없습니다.';
    if (!await confirm({title: self ? '패밀리 탈퇴' : '구성원 제거', body, confirmLabel: self ? '탈퇴' : '제거', danger: true})) return;
    act(async () => { await api.rpc('remove_member', {p_family: family.id, p_user: m.user_id}); onClose(); self ? signOutAfterLeave() : (api.reloadAll(), toast('구성원을 제거했습니다.')); });
  }
  return <Sheet title={self ? '내 정보' : (m.display_name || '구성원')} onClose={onClose}>
    {self && <form onSubmit={e => { e.preventDefault(); act(async () => { await api.rpc('update_my_profile', {p_family: family.id, p_display_name: name, p_relationship: rel, p_phone: phone}); api.reloadAll(); toast('내 정보를 저장했습니다.'); onClose(); }); }}>
      <Field label="이름(다른 구성원에게 표시)"><input required value={name} onChange={e => setName(e.target.value)}/></Field>
      <Field label="관계"><input value={rel} onChange={e => setRel(e.target.value)} placeholder="예: 장녀, 배우자, 요양보호사"/></Field>
      <Field label="연락처"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)}/></Field>
      <FormActions onCancel={onClose}/></form>}
    {!self && <p className="muted">{[m.relationship, m.phone].filter(Boolean).join(' · ') || '관계·연락처 미입력'}</p>}
    {canManage && <form onSubmit={e => { e.preventDefault(); act(async () => { await api.rpc('update_member', {p_family: family.id, p_user: m.user_id, p_role: role, p_access: accessLv}); api.reloadAll(); toast('권한을 변경했습니다.'); onClose(); }); }}>
      <Field label="역할"><select value={role} onChange={e => setRole(e.target.value)}><option value="caregiver">보호자</option><option value="patient">환자 본인</option><option value="owner" disabled={owners >= 2 && m.role !== 'owner'}>관리자 (최대 2명)</option></select></Field>
      {role !== 'owner' && <Field label="기본 접근 수준" hint="환자별 예외는 환자 화면의 '권한' 버튼에서 설정합니다."><select value={accessLv} onChange={e => setAccessLv(e.target.value)}><option value="edit">공동 편집</option><option value="view">열람만</option><option value="none">환자별 지정만</option></select></Field>}
      <FormActions onCancel={onClose} submitLabel="권한 저장"/></form>}
    {(canManage || self) && <button type="button" className="danger-link" onClick={remove}>{self ? '이 패밀리에서 탈퇴' : '구성원 제거'}</button>}
  </Sheet>;
}
