import React from 'react';
import {Check, Undo2, FileText, UserCheck, Share2} from 'lucide-react';
import {useApp} from '../state.js';
import {Badge, PatientChip} from './ui.jsx';
import {fmtTime, fmtDate, fmtDateTime, ACTION_LABEL, ENTITY_LABEL, timeAgo} from '../lib/format.js';
import {memberName} from '../lib/access.js';
import {daySlots, groupBySlot} from '../lib/meds.js';
import {apptShareText, medShareText} from '../lib/share.js';

export const live = arr => arr.filter(x => !x.deleted_at);
const statusTone = s => s === '진료완료' ? 'ok' : s === '취소' ? 'muted' : 'info';

export function ApptCard({a, showDate}) {
  const {patientById, colorOf, members, user, can, sheet, api, act, today} = useApp();
  const p = patientById(a.patient_id), comp = members.find(m => m.user_id === a.companion_id), mine = a.companion_id === user.id;
  const editable = can(a.patient_id, 'edit'), canRecord = can(a.patient_id, 'create');
  return <article className="card appt" style={{'--accent': colorOf(a.patient_id)}}>
    <button type="button" className="card-main" onClick={() => sheet.open('appt', {initial: a})} aria-label={`${a.hospital} 진료 일정 ${editable ? '수정' : '조회'}`}>
      <span className="card-time">{showDate ? fmtDate(a.visit_date) + ' ' : ''}{fmtTime(a.visit_time) || '시간 미정'}</span>
      <span className="card-title">{a.hospital}{a.department ? ' · ' + a.department : ''}</span>
      <span className="card-meta"><PatientChip patient={p} color={colorOf(a.patient_id)}/> <Badge tone={statusTone(a.status)}>{a.status}</Badge></span>
    </button>
    <div className="card-actions">
      <button type="button" aria-label={`${a.hospital} 일정 공유·캘린더 추가`} onClick={() => sheet.open('share', {title: '진료 일정 공유', text: apptShareText(a, p?.name || '', comp?.display_name), appt: a, patientName: p?.name || '', companionName: comp?.display_name})}><Share2 size={16}/> 공유</button>
      <span className="muted"><UserCheck size={14} aria-hidden="true"/> {comp ? '동행 ' + comp.display_name : '동행 미정'}</span>
      {editable && a.status !== '취소' && a.status !== '진료완료' && <button type="button" onClick={() => act(() => api.update('appointments', a.id, {companion_id: mine ? null : user.id}))}>{mine ? '동행 해제' : comp ? '제가 대신 동행' : '제가 동행합니다'}</button>}
      {canRecord && a.status === '예약완료' && a.visit_date <= today && <button type="button" className="primary-soft" onClick={() => sheet.open('record', {defaultPatient: a.patient_id, defaultDate: a.visit_date, linkAppointment: a.id, completeAppt: a.id})}><Check size={16}/> 진료 완료·기록</button>}
    </div>
  </article>;
}

export function MedChecklist({date, patientIds, emptyText}) {
  const {data, patientById, colorOf, members, user, can, api, act, toast, fail, reload, sheet} = useApp();
  const rows = daySlots(data.medications, date, patientIds);
  if (!rows.length) return <p className="muted">{emptyText || '확인할 복약이 없습니다.'}</p>;
  const intake = k => data.med_intakes.find(i => i.medication_id === k.med.id && i.scheduled_date === date && i.slot === k.slot);
  const taken = rows.filter(intake).length;
  async function mark(r) {
    try { await api.markTaken(r.med, date, r.slot); }
    catch (e) { if (e?.code === '23505') toast('이미 다른 보호자가 복용을 확인했습니다.'); else fail(e); reload('med_intakes'); }
  }
  return <div className="medlist">
    <div className="inline between"><p className="progress" aria-live="polite"><b>{taken}</b> / {rows.length} 확인 완료</p>
      <button type="button" aria-label="오늘 복약 현황 카카오톡 공유" onClick={() => sheet.open('share', {title: '복약 현황 공유', text: medShareText(date, rows.map(r => { const i = intake(r); return {patient: patientById(r.med.patient_id)?.name || '', med: r.med.name, slot: r.slot, by: i ? memberName(members, i.taken_by) : null}; }))})}><Share2 size={16}/> 카톡 공유</button></div>
    <div className="progressbar" role="progressbar" aria-label="복용 확인 진행률" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={taken}><span style={{width: (rows.length ? taken / rows.length * 100 : 0) + '%'}}/></div>
    {groupBySlot(rows).map(g => <div key={g.slot} className="slot">
      <h4>{g.slot === 'any' ? '시간 지정 없음' : g.slot}</h4>
      {g.rows.map(r => {
        const i = intake(r), p = patientById(r.med.patient_id);
        return <div className={'medrow' + (i ? ' done' : '')} key={r.key}>
          <div><b>{r.med.name}</b> <span className="muted">{[r.med.dosage, r.med.instructions].filter(Boolean).join(' · ')}</span><br/><PatientChip patient={p} color={colorOf(r.med.patient_id)}/></div>
          {i ? <div className="done-box"><span><Check size={16} aria-hidden="true"/> {memberName(members, i.taken_by)} {fmtDateTime(i.taken_at).split(' ')[1]}</span>
              {(i.taken_by === user.id || can(r.med.patient_id, 'edit')) && <button type="button" aria-label={`${r.med.name} 복용 확인 취소`} onClick={() => act(() => api.unmarkTaken(i.id))}><Undo2 size={16}/> 취소</button>}</div>
            : can(r.med.patient_id, 'create') ? <button type="button" className="primary" onClick={() => mark(r)} aria-label={`${p?.name} ${r.med.name} ${g.slot === 'any' ? '' : g.slot} 복용 확인`}>복용 확인</button>
            : <span className="muted">확인 권한 없음</span>}
        </div>;
      })}
    </div>)}
  </div>;
}

export function RecordItem({r}) {
  const {patientById, colorOf, sheet} = useApp();
  const snippet = [r.symptoms, r.treatment, r.memo].filter(Boolean)[0];
  return <article className="card" style={{'--accent': colorOf(r.patient_id)}}>
    <button type="button" className="card-main" onClick={() => sheet.open('record', {initial: r})}>
      <span className="card-time">{fmtDate(r.visit_date, true)}</span>
      <span className="card-title">{r.diagnosis || '진료 기록'}</span>
      {snippet && <span className="card-snippet">{snippet}</span>}
      <span className="card-meta"><PatientChip patient={patientById(r.patient_id)} color={colorOf(r.patient_id)}/></span>
    </button></article>;
}

export function MedItem({m}) {
  const {patientById, colorOf, sheet} = useApp();
  return <article className="card" style={{'--accent': colorOf(m.patient_id)}}>
    <button type="button" className="card-main" onClick={() => sheet.open('med', {initial: m})}>
      <span className="card-title">{m.name} <Badge tone={m.active ? 'ok' : 'muted'}>{m.active ? '복용 중' : '중단'}</Badge></span>
      <span className="card-snippet">{[m.dosage, m.instructions].filter(Boolean).join(' · ') || '용량 미입력'}</span>
      <span className="card-meta">{m.times?.length ? m.times.join(' · ') : '시간 지정 없음'} <PatientChip patient={patientById(m.patient_id)} color={colorOf(m.patient_id)}/></span>
    </button></article>;
}

export function ActivityRow({log}) {
  const {members, patientById} = useApp();
  const who = memberName(members, log.actor_id), p = log.patient_id && patientById(log.patient_id);
  const what = log.entity === 'patient_permissions' ? `환자별 권한 변경(${log.label || '구성원'})` : `${ENTITY_LABEL[log.entity] || log.entity} ${ACTION_LABEL[log.action] || log.action}${log.label && log.entity !== 'export' ? ` '${log.label}'` : ''}`;
  return <div className="activity"><FileText size={16} aria-hidden="true"/><div><b>{who}</b> · {what}{p ? <span className="muted"> · {p.name}</span> : null}<br/><small className="muted">{timeAgo(log.created_at)}</small></div></div>;
}
