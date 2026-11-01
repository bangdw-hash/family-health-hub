import React from 'react';
import {useApp} from '../state.js';
import {PageHeader, Badge} from '../components/ui.jsx';
import Members from './Members.jsx';
import {Activity, Trash, Export} from './Admin.jsx';
import {Display, Security, Notify, Privacy} from './Settings.jsx';
import {Users, History, Trash2, Download, Type, Lock, BellRing, ShieldCheck, Repeat, ChevronRight, Search} from 'lucide-react';

const SUBS = {members: Members, activity: Activity, trash: Trash, export: Export, display: Display, security: Security, notify: Notify, privacy: Privacy};
export default function More() {
  const {nav, family, groups, setFamily, me, isOwner, data, lockable, data: {family_join_requests}} = useApp();
  const Sub = SUBS[nav.state.sub];
  if (Sub) return <Sub/>;
  const pending = isOwner ? family_join_requests.filter(r => r.status === 'pending').length : 0;
  const trashCount = ['patients', 'appointments', 'medical_records', 'medications', 'attachments'].reduce((n, t) => n + data[t].filter(x => x.deleted_at).length, 0);
  const item = (sub, Icon, label, desc, badge) => <button type="button" className="menuitem" key={sub} onClick={() => nav.go({sub})}>
    <Icon size={22} aria-hidden="true"/><span><b>{label}</b><small>{desc}</small></span>{badge ? <Badge tone="warn">{badge}</Badge> : null}<ChevronRight size={18} aria-hidden="true"/></button>;
  return <>
    <PageHeader title="더보기"/>
    <section className="panel who"><b>{me?.display_name || '구성원'}</b><small className="muted">{family.name} · {me?.role === 'owner' ? '관리자' : '보호자'}</small></section>
    <section className="panel menu">
      {item('members', Users, '가족 구성원·초대', isOwner ? '초대 링크, 가입 승인, 권한 관리' : '구성원 확인, 내 정보 수정', pending ? pending + '건 대기' : '')}
      {item('activity', History, '활동 기록', '누가 무엇을 변경했는지 확인')}
      {item('trash', Trash2, '휴지통', '삭제한 항목 복원', trashCount ? trashCount + '건' : '')}
      {item('export', Download, '내보내기·백업', 'Excel(CSV)·JSON·첨부 포함 ZIP')}
    </section>
    <section className="panel menu">
      {item('display', Type, '화면·글자 크기', '글자·버튼 크기, 어두운 화면, 고대비')}
      {item('notify', BellRing, '알림', '복약·진료 알림 (이 기기)')}
      {item('security', Lock, '앱 잠금', 'PIN으로 앱 보호')}
      {item('privacy', ShieldCheck, '개인정보·계정', '비밀번호, 로그아웃, 계정 삭제')}
    </section>
    <section className="panel menu">
      <button type="button" className="menuitem" onClick={() => setFamily(null)}><Repeat size={22} aria-hidden="true"/><span><b>패밀리 전환</b><small>{groups.length > 1 ? `참여 중인 패밀리 ${groups.length}개` : '새 패밀리 만들기·가입'}</small></span><ChevronRight size={18} aria-hidden="true"/></button>
    </section>
    <p className="muted center">Family Health Hub v{__APP_VERSION__}</p>
  </>;
}
