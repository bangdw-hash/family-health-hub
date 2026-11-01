import React, {useEffect, useState} from 'react';
import {Sheet, Badge, PatientChip, Field} from './ui.jsx';
import {useApp} from '../state.js';
import {fmtDate, fmtTime, fmtDateTime, ageOf} from '../lib/format.js';
import {memberName} from '../lib/access.js';
import {stepsOf, progress, nextStep, stepDue, fmtDue, mapLinks, PHASE_LABEL, VISIT_STATUS, FINISHED} from '../lib/visit.js';
import {apptShareText} from '../lib/share.js';
import {Check, MapPin, Share2, Pencil, FileText, CalendarPlus, Clock, Link2, Pill} from 'lucide-react';

const TABS = [['before', '진료 전'], ['during', '진행'], ['after', '진료 후']];

function StepList({appt, phase}) {
  const {data, can, members, api, fail} = useApp(), [opt, setOpt] = useState({});
  const list = stepsOf(data.appointment_steps, appt.id, phase), pr = progress(list), next = phase === 'during' ? nextStep(list) : null, canCheck = can(appt.patient_id, 'create');
  // 서버 반영 전에도 체크가 바로 보이도록 낙관적으로 표시하고, 서버 값과 같아지면 해제합니다.
  useEffect(() => { setOpt(o => { const n = {...o}; let ch = false; for (const id of Object.keys(o)) { const st = list.find(x => x.id === id); if (!st || !!st.done_at === o[id]) { delete n[id]; ch = true; } } return ch ? n : o; }); }, [data.appointment_steps]);
  const toggle = async (st, v) => { setOpt(o => ({...o, [st.id]: v})); try { await api.setStepDone(st.id, v); } catch (e) { fail(e); setOpt(o => { const {[st.id]: _, ...r} = o; return r; }); } };
  if (!list.length) return <p className="muted">등록된 항목이 없습니다. 수정에서 템플릿이나 항목을 추가하십시오.</p>;
  return <>
    <p className="progress"><b>{pr.done}</b> / {pr.total} 완료</p>
    <div className="progressbar" role="progressbar" aria-label={PHASE_LABEL[phase] + ' 진행률'} aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.done}><span style={{width: (pr.total ? pr.done / pr.total * 100 : 0) + '%'}}/></div>
    <ul className="steplist">{list.map(s => {
      const due = stepDue(appt, s), isNext = next?.id === s.id;
      return <li key={s.id} className={((opt[s.id] ?? !!s.done_at) ? 'done ' : '') + (isNext ? 'next' : '')}>
        <label className="check">
          <input type="checkbox" checked={opt[s.id] ?? !!s.done_at} disabled={!canCheck} onChange={e => toggle(s, e.target.checked)}/>
          <span><b>{s.title}</b> <Badge>{s.kind}</Badge>{isNext && <Badge tone="info">지금 단계</Badge>}
            <small className="muted">{[due && fmtDue(due), s.place, s.staff, s.note].filter(Boolean).join(' · ')}{s.done_at ? ` · ✓ ${memberName(members, s.done_by)} ${fmtDateTime(s.done_at).split(' ')[1]}` : ''}</small></span>
        </label></li>;
    })}</ul>
  </>;
}

export default function VisitDetail({appt, onClose}) {
  const {patientById, colorOf, members, can, sheet, api, act, data, today, confirm, toast} = useApp();
  const [tab, setTab] = useState(() => (appt.status === '진료완료' ? 'after' : appt.status === '접수' || appt.status === '진행중' || appt.visit_date === today ? 'during' : 'before'));
  const [fee, setFee] = useState(appt.fee_amount ?? '');
  const p = patientById(appt.patient_id), comp = members.find(m => m.user_id === appt.companion_id), edit = can(appt.patient_id, 'edit'), create = can(appt.patient_id, 'create');
  const rel = appt.related_appointment_id ? data.appointments.find(a => a.id === appt.related_appointment_id) : null;
  const followers = data.appointments.filter(a => a.related_appointment_id === appt.id && !a.deleted_at);
  const prep = stepsOf(data.appointment_steps, appt.id, 'before').filter(s => !s.done_at).map(s => s.title);
  const setStatus = status => act(async () => { await api.update('appointments', appt.id, {status}); toast('상태를 "' + status + '"(으)로 바꿨습니다.'); onClose(); });
  const open = (type, props) => { onClose(); setTimeout(() => sheet.open(type, props), 0); };
  const age = ageOf(p?.birth_date);
  return <Sheet title={appt.test_name ? `${appt.kind} · ${appt.test_name}` : appt.kind} onClose={onClose}>
    <div className="vhead" style={{'--accent': colorOf(appt.patient_id)}}>
      <p><PatientChip patient={p} color={colorOf(appt.patient_id)}/> {age != null && <small className="muted">{age}세</small>} <Badge tone={FINISHED.includes(appt.status) ? 'ok' : 'info'}>{appt.status}</Badge></p>
      <h3>{appt.hospital}{appt.department ? ' · ' + appt.department : ''}</h3>
      <p><Clock size={14}/> {fmtDate(appt.visit_date, true)} {fmtTime(appt.visit_time) || '시간 미정'}{appt.arrival_time ? ` (도착 ${fmtTime(appt.arrival_time)})` : ''}</p>
      {(appt.place || appt.place_note) && <p><MapPin size={14}/> {[appt.place, appt.place_note].filter(Boolean).join(' · ')}</p>}
      {(appt.doctor || appt.specialty) && <p className="muted">{[appt.doctor && appt.doctor + (appt.doctor_title ? ' ' + appt.doctor_title : ''), appt.specialty].filter(Boolean).join(' · ')}</p>}
      {appt.hours_note && <p className="muted">이용 안내: {appt.hours_note}</p>}
      <p className="muted">동행: {comp?.display_name || '미정'}{appt.booking_source ? ` · ${appt.booking_source}` : ''}</p>
      {rel && <p><Link2 size={14}/> {appt.relation === 'follow_up' ? '이전 진료' : '연결된 진료'}: <button type="button" className="link inline-link" onClick={() => open('visit', {appt: rel})}>{fmtDate(rel.visit_date)} {fmtTime(rel.visit_time)} {rel.hospital}</button>{appt.relation === 'test_before' && appt.related_lead_minutes ? ` (진료 ${appt.related_lead_minutes / 60}시간 전 검사)` : ''}</p>}
      {followers.map(a => <p key={a.id}><Link2 size={14}/> {a.relation === 'test_before' ? '이 진료 전 검사' : '다음 예약'}: <button type="button" className="link inline-link" onClick={() => open('visit', {appt: a})}>{fmtDate(a.visit_date)} {fmtTime(a.visit_time)} {a.hospital} {a.kind !== '외래진료' ? a.kind : ''}</button></p>)}
    </div>
    <div className="row3">
      <button type="button" onClick={() => open('share', {title: '일정 공유', text: apptShareText(appt, p?.name || '', comp?.display_name, prep), appt, patientName: p?.name || '', companionName: comp?.display_name, prep})}><Share2 size={16}/> 공유</button>
      <button type="button" onClick={() => open('appt', {initial: appt})}><Pencil size={16}/> {edit ? '수정' : '전체 보기'}</button>
      <details className="mapmenu"><summary className="btnlike"><MapPin size={16}/> 길찾기</summary><div className="maplinks">{mapLinks(appt).map(([n, u]) => <a key={n} href={u} target="_blank" rel="noopener noreferrer">{n}</a>)}</div></details>
    </div>
    <div className="seg" role="tablist" aria-label="진료 단계">{TABS.map(([k, l]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={tab === k ? 'selected' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'before' && <>
      {appt.fasting_hours ? <p className="callout">금식 {appt.fasting_hours}시간 — {appt.visit_time ? '금식 시작 ' + fmtDue(stepDue(appt, {relative_minutes: -appt.fasting_hours * 60})) : '진료 시간 입력 시 시작 시각이 계산됩니다.'}</p> : null}
      <StepList appt={appt} phase="before"/>
      {appt.notice_text && <details><summary>안내문 원문</summary><p className="pre muted">{appt.notice_text}</p></details>}
    </>}
    {tab === 'during' && <>
      <StepList appt={appt} phase="during"/>
      {create && !FINISHED.includes(appt.status) && <div className="stack"><div className="row2">
        {['접수', '진행중'].map(s => <button type="button" key={s} disabled={appt.status === s} onClick={() => setStatus(s)}>{s === '접수' ? '접수 완료' : '진료 진행 중'}</button>)}</div></div>}
    </>}
    {tab === 'after' && <>
      {create && appt.status !== '진료완료' && <button type="button" className="primary" onClick={() => open('record', {defaultPatient: appt.patient_id, defaultDate: appt.visit_date, linkAppointment: appt.id, completeAppt: appt.id})}><Check size={18}/> 진료 완료 · 기록 작성</button>}
      <StepList appt={appt} phase="after"/>
      <div className="stack">
        {create && <button type="button" onClick={() => open('appt', {draft: {fields: {hospital: appt.hospital, department: appt.department, specialty: appt.specialty, doctor: appt.doctor, doctor_title: appt.doctor_title, kind: '외래진료', place: appt.place, hospital_phone: appt.hospital_phone, related_appointment_id: appt.id, relation: 'follow_up'}, steps: []}, defaultPatient: appt.patient_id})}><CalendarPlus size={18}/> 다음 예약 만들기</button>}
        {create && <button type="button" onClick={() => open('med', {defaultPatient: appt.patient_id})}><Pill size={18}/> 처방 약 복약 계획 등록</button>}
        {create && <form className="inline" onSubmit={e => { e.preventDefault(); act(async () => { await api.update('appointments', appt.id, {fee_amount: fee === '' ? null : Math.round(Number(fee))}); toast('수납 금액을 저장했습니다.'); }); }}>
          <input type="number" min="0" aria-label="수납 금액(원)" placeholder="수납 금액(원)" value={fee} onChange={e => setFee(e.target.value)}/><button>저장</button></form>}
        {data.medical_records.filter(r => r.appointment_id === appt.id && !r.deleted_at).map(r => <button type="button" key={r.id} onClick={() => open('record', {initial: r})}><FileText size={18}/> 연결된 진료 기록: {r.diagnosis || fmtDate(r.visit_date)}</button>)}
      </div>
    </>}
  </Sheet>;
}
