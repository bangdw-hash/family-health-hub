import React, {useMemo, useState} from 'react';
import {useApp} from '../state.js';
import {Section, Empty, Badge, Segmented, PageHeader, Dot} from '../components/ui.jsx';
import {ApptCard, MedChecklist, RecordItem, MedItem, live} from '../components/cards.jsx';
import {ageOf, fmtDate, fmtDateTime, addDays, ATTACH_KINDS} from '../lib/format.js';
import {memberName} from '../lib/access.js';
import {recentAdherence} from '../lib/meds.js';
import {Users, Plus, Pencil, FileText, Lock, ShieldCheck, Paperclip, Search, Trash2} from 'lucide-react';

export default function Patients() {
  const {nav} = useApp();
  return nav.state.patientId ? <PatientDetail id={nav.state.patientId}/> : <PatientList/>;
}

function PatientList() {
  const {patients, data, today, colorOf, nav, sheet, canAddPatient} = useApp();
  return <>
    <PageHeader title="환자" right={canAddPatient && <button type="button" className="primary-soft" onClick={() => sheet.open('patient', {})}><Plus size={18}/> 환자 등록</button>}/>
    {patients.length === 0 && <Empty icon={Users} title="등록된 환자가 없습니다">{canAddPatient ? '오른쪽 위 버튼으로 환자를 등록하십시오.' : '관리자에게 환자 등록 또는 접근 권한을 요청하십시오.'}</Empty>}
    <div className="grid">{patients.map(p => {
      const next = live(data.appointments).filter(a => a.patient_id === p.id && a.visit_date >= today && a.status === '예약완료').sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0];
      const meds = live(data.medications).filter(m => m.patient_id === p.id && m.active).length;
      const age = ageOf(p.birth_date, today);
      return <button type="button" key={p.id} className="pcard" style={{'--accent': colorOf(p.id)}} onClick={() => nav.go({patientId: p.id, ptab: 'appts'})}>
        <span className="pname"><Dot color={colorOf(p.id)}/> <b>{p.name}</b> {p.is_private && <Lock size={14} aria-label="비공개"/>}</span>
        <span className="muted">{[p.relationship, age != null && age + '세'].filter(Boolean).join(' · ') || '정보 미입력'}</span>
        <span className="pmeta">{next ? <>다음 진료 {fmtDate(next.visit_date)} · {next.hospital}</> : '예정된 진료 없음'}</span>
        <span className="pmeta">복용 중인 약 {meds}종</span>
      </button>;
    })}</div>
  </>;
}

function PatientDetail({id}) {
  const {patients, nav, sheet, can, isOwner, colorOf, today, data} = useApp();
  const p = patients.find(x => x.id === id);
  const ptab = nav.state.ptab || 'appts';
  if (!p) return <><PageHeader title="환자" onBack={nav.back}/><Empty icon={Users} title="환자를 찾을 수 없습니다">삭제되었거나 접근 권한이 없습니다.</Empty></>;
  const age = ageOf(p.birth_date, today), edit = can(id, 'edit'), create = can(id, 'create');
  return <>
    <PageHeader title={p.name} onBack={nav.back} right={<div className="head-actions">
      {isOwner && <button type="button" onClick={() => sheet.open('perm', {patientId: id})} aria-label="접근 권한"><ShieldCheck size={18}/> 권한</button>}
      <button type="button" onClick={() => sheet.open('report', {patientId: id})}><FileText size={18}/> 리포트</button>
      <button type="button" onClick={() => sheet.open('patient', {initial: p})} aria-label={edit ? '환자 정보 수정' : '환자 정보 보기'}><Pencil size={18}/> {edit ? '수정' : '정보'}</button></div>}/>
    <div className="pinfo" style={{'--accent': colorOf(id)}}><Dot color={colorOf(id)}/> {[p.relationship, age != null && `${age}세`, p.birth_date && fmtDate(p.birth_date, true), p.phone].filter(Boolean).join(' · ') || '기본 정보 미입력'} {p.is_private && <Badge tone="warn">비공개</Badge>}</div>
    <Segmented label="환자 정보 구분" value={ptab} onChange={t => nav.go({ptab: t}, {replace: true})} options={[['appts', '일정'], ['records', '기록'], ['meds', '복약'], ['files', '첨부']]}/>
    {ptab === 'appts' && <ApptTab id={id} create={create}/>}
    {ptab === 'records' && <RecordTab id={id} create={create}/>}
    {ptab === 'meds' && <MedTab id={id} create={create}/>}
    {ptab === 'files' && <FileTab id={id} create={create} edit={edit}/>}
  </>;
}

const AddBtn = ({onClick, children}) => <button type="button" className="primary-soft" onClick={onClick}><Plus size={18}/> {children}</button>;

function ApptTab({id, create}) {
  const {data, today, sheet} = useApp(), [view, setView] = useState('next');
  const list = live(data.appointments).filter(a => a.patient_id === id);
  const next = list.filter(a => a.visit_date >= today && a.status !== '취소').sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  const past = list.filter(a => a.visit_date < today || a.status === '취소').sort((a, b) => b.visit_date.localeCompare(a.visit_date));
  const shown = view === 'next' ? next : past;
  return <Section title="진료 일정" id="pa" action={create && <AddBtn onClick={() => sheet.open('appt', {defaultPatient: id})}>일정 추가</AddBtn>}>
    <Segmented label="일정 구분" value={view} onChange={setView} options={[['next', `예정 ${next.length}`], ['past', `지난 ${past.length}`]]}/>
    {shown.length ? shown.map(a => <ApptCard key={a.id} a={a} showDate/>) : <p className="muted">{view === 'next' ? '예정된 진료가 없습니다.' : '지난 진료가 없습니다.'}</p>}</Section>;
}

function RecordTab({id, create}) {
  const {data, sheet} = useApp(), [q, setQ] = useState(''), [year, setYear] = useState('');
  const all = live(data.medical_records).filter(r => r.patient_id === id);
  const years = [...new Set(all.map(r => r.visit_date.slice(0, 4)))].sort().reverse();
  const hay = r => [r.diagnosis, r.symptoms, r.tests, r.treatment, r.prescription, r.cautions, r.memo].filter(Boolean).join(' ').toLowerCase();
  const list = all.filter(r => (!year || r.visit_date.startsWith(year)) && (!q.trim() || hay(r).includes(q.trim().toLowerCase())));
  return <Section title="진료 기록" id="pr" action={create && <AddBtn onClick={() => sheet.open('record', {defaultPatient: id})}>기록 작성</AddBtn>}>
    <div className="filters"><label className="searchbox"><Search size={16} aria-hidden="true"/><input type="search" aria-label="기록 검색" placeholder="진단·증상·처방 검색" value={q} onChange={e => setQ(e.target.value)}/></label>
      {years.length > 1 && <select aria-label="연도" value={year} onChange={e => setYear(e.target.value)}><option value="">전체 연도</option>{years.map(y => <option key={y} value={y}>{y}년</option>)}</select>}</div>
    {list.length ? list.map(r => <RecordItem key={r.id} r={r}/>) : <p className="muted">{all.length ? '검색 결과가 없습니다.' : '등록된 진료 기록이 없습니다.'}</p>}</Section>;
}

function MedTab({id, create}) {
  const {data, today, sheet} = useApp();
  const meds = live(data.medications).filter(m => m.patient_id === id);
  const adh = useMemo(() => recentAdherence(live(data.medications), data.med_intakes, id, today, 7), [data.medications, data.med_intakes, id, today]);
  return <>
    <Section title="오늘 복약" id="pm1"><MedChecklist date={today} patientIds={[id]} emptyText="오늘 확인할 복약이 없습니다."/></Section>
    <Section title="최근 7일 복용 현황" id="pm2"><div className="adh" role="list">{adh.map(d => <div role="listitem" key={d.date} className={'adh-day' + (d.total && d.taken === d.total ? ' full' : d.taken ? ' part' : '')} aria-label={`${fmtDate(d.date)} ${d.total ? `${d.total}회 중 ${d.taken}회` : '복약 없음'}`}><small>{fmtDate(d.date).replace(/^\d+월 /, '').replace(/ \(.\)/, '')}</small><b>{d.total ? `${d.taken}/${d.total}` : '–'}</b></div>)}</div></Section>
    <Section title="복약 계획" id="pm3" action={create && <AddBtn onClick={() => sheet.open('med', {defaultPatient: id})}>약 추가</AddBtn>}>
      {meds.length ? meds.map(m => <MedItem key={m.id} m={m}/>) : <p className="muted">등록된 복약 계획이 없습니다.</p>}</Section>
  </>;
}

function FileTab({id, create, edit}) {
  const {data, members, sheet, api, act, trashItem, toast, fail} = useApp();
  const list = live(data.attachments).filter(a => a.patient_id === id);
  async function open(a) { try { const w = window.open('', '_blank'); const url = await api.signedUrl(a.storage_path); if (w) w.location.href = url; else location.href = url; } catch (e) { fail(e); } }
  return <Section title="첨부 파일" id="pf" action={create && <AddBtn onClick={() => sheet.open('attach', {defaultPatient: id})}>파일 추가</AddBtn>}>
    <p className="muted">처방전·검사 결과·영수증 사진 또는 PDF를 보관합니다. 파일은 비공개 저장소에 보관되며 이 환자의 접근 권한이 있는 구성원만 열 수 있습니다.</p>
    {list.length ? list.map(a => <div className="item filerow" key={a.id}>
      <button type="button" className="filebtn" onClick={() => open(a)}><Paperclip size={18}/> <span><b>{a.file_name}</b><small className="muted">{a.kind} · {fmtDateTime(a.created_at)} · {memberName(members, a.created_by)} · {a.size_bytes ? Math.round(a.size_bytes / 1024) + 'KB' : ''}</small></span></button>
      {edit && <button type="button" className="icon-btn" aria-label={a.file_name + ' 삭제'} onClick={() => trashItem('attachments', a.id, a.file_name)}><Trash2 size={18}/></button>}</div>) : <p className="muted">첨부된 파일이 없습니다.</p>}</Section>;
}
