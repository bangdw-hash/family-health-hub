import React from 'react';
import {useApp} from '../state.js';
import {Section, Empty, Badge} from '../components/ui.jsx';
import {ApptCard, MedChecklist, ActivityRow, live} from '../components/cards.jsx';
import {fmtDate, addDays} from '../lib/format.js';
import {Users, BellRing, ChevronRight, UserPlus} from 'lucide-react';

export default function Today() {
  const {me, today, patients, data, isOwner, nav, sheet, canAddPatient, visibleLogs} = useApp();
  const ids = patients.map(p => p.id);
  const appts = live(data.appointments).filter(a => ids.includes(a.patient_id) && a.status !== '취소');
  const todays = appts.filter(a => a.visit_date === today).sort((a, b) => (a.visit_time || '').localeCompare(b.visit_time || ''));
  const soon = appts.filter(a => a.visit_date > today && a.visit_date <= addDays(today, 7)).sort((a, b) => a.visit_date.localeCompare(b.visit_date) || (a.visit_time || '').localeCompare(b.visit_time || ''));
  const pending = data.family_join_requests.filter(r => r.status === 'pending');
  return <>
    <div className="hello"><h2>{me?.display_name ? me.display_name + '님, 안녕하세요' : '안녕하세요'}</h2><p>{fmtDate(today, true)}</p></div>
    {isOwner && pending.length > 0 && <button type="button" className="banner" onClick={() => nav.go({tab: 'more', sub: 'members'})}><UserPlus size={20}/><span><b>가입 승인 대기 {pending.length}건</b><small>탭하여 신청자를 확인하고 승인하십시오.</small></span><ChevronRight size={18}/></button>}
    {patients.length === 0 ? <Section title="시작하기" id="start"><Empty icon={Users} title="표시할 환자가 없습니다">
      {canAddPatient ? '환자를 등록하면 진료·복약·기록을 가족이 함께 관리할 수 있습니다.' : '관리자가 환자를 등록하거나 이 계정에 접근 권한을 부여하면 표시됩니다. 관리자에게 문의하십시오.'}</Empty>
      {canAddPatient && <button type="button" className="primary" onClick={() => sheet.open('patient', {})}>환자 등록</button>}</Section> : <>
      <Section title="오늘 진료" id="t-appt" action={<Badge>{todays.length}건</Badge>}>
        {todays.length ? todays.map(a => <ApptCard key={a.id} a={a}/>) : <p className="muted">오늘 예정된 진료가 없습니다.</p>}</Section>
      <Section title="오늘 복약" id="t-med" action={<button type="button" className="link" onClick={() => nav.tab('meds')}>전체 보기</button>}>
        <MedChecklist date={today} patientIds={ids} emptyText="오늘 확인할 복약이 없습니다. 복약 계획에 복용 시간을 등록하면 여기에 표시됩니다."/></Section>
      {soon.length > 0 && <Section title="앞으로 7일" id="t-soon">{soon.map(a => <ApptCard key={a.id} a={a} showDate/>)}</Section>}
      <Section title="최근 활동" id="t-act" action={visibleLogs.length > 0 && <button type="button" className="link" onClick={() => nav.go({tab: 'more', sub: 'activity'})}>전체 보기</button>}>
        {visibleLogs.length ? visibleLogs.slice(0, 5).map(l => <ActivityRow key={l.id} log={l}/>) : <p className="muted">아직 활동이 없습니다.</p>}</Section>
    </>}
  </>;
}
