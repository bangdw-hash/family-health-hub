import React, {useState} from 'react';
import {Sheet, Field, FormActions, Segmented} from './ui.jsx';
import {APPT_STATUS, PATIENT_COLORS, ATTACH_KINDS, todayStr} from '../lib/format.js';
import {useApp} from '../state.js';
import {Trash2, Plus, X} from 'lucide-react';

function useSaver(onSave, onClose) {
  const [busy, setBusy] = useState(false), {fail} = useApp();
  return {busy, submit: fn => async e => { e.preventDefault(); if (busy) return; setBusy(true); try { await onSave(fn()); onClose(); } catch (err) { fail(err); } finally { setBusy(false); } }};
}

function PatientSelect({value, onChange, patients, disabled}) {
  return <Field label="환자"><select required value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    <option value="">환자를 선택하십시오</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>;
}
const FormSheet = ({title, onClose, onSubmit, children, busy, onDelete, deleteLabel = '휴지통으로 이동', submitLabel, readOnly}) =>
  <Sheet title={readOnly ? title.replace(/수정|작성|등록/, '조회') : title} onClose={onClose}>
    <form onSubmit={readOnly ? e => e.preventDefault() : onSubmit}>
      <fieldset disabled={!!readOnly} className="plain">{children}</fieldset>
      {readOnly ? <><p className="muted">수정 권한이 없어 조회만 가능합니다.</p><div className="form-actions"><button type="button" className="primary" onClick={onClose}>닫기</button></div></>
        : <><FormActions busy={busy} onCancel={onClose} submitLabel={submitLabel}/>
          {onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={16}/> {deleteLabel}</button>}</>}
    </form></Sheet>;

// ---- 환자 ----
export function PatientForm({readOnly, initial, onSave, onClose, isOwner, onDelete}) {
  const {busy, submit} = useSaver(onSave, onClose);
  const [f, setF] = useState({name: initial?.name || '', relationship: initial?.relationship || '', birth_date: initial?.birth_date || '', phone: initial?.phone || '', color: initial?.color || PATIENT_COLORS[0], is_private: !!initial?.is_private});
  const set = k => e => setF({...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value});
  return <FormSheet readOnly={readOnly} title={initial ? '환자 정보 수정' : '환자 등록'} onClose={onClose} busy={busy} onDelete={onDelete}
    onSubmit={submit(() => ({name: f.name.trim(), relationship: f.relationship.trim() || null, birth_date: f.birth_date || null, phone: f.phone.trim() || null, color: f.color, ...(isOwner ? {is_private: f.is_private} : {})}))}>
    <Field label="이름"><input required value={f.name} onChange={set('name')} autoComplete="off"/></Field>
    <Field label="관계" hint="예: 어머니, 아버지, 배우자, 본인"><input list="rel-list" value={f.relationship} onChange={set('relationship')}/></Field>
    <datalist id="rel-list">{['본인', '어머니', '아버지', '배우자', '자녀', '조부모', '형제자매'].map(x => <option key={x} value={x}/>)}</datalist>
    <Field label="생년월일"><input type="date" max={todayStr()} value={f.birth_date} onChange={set('birth_date')}/></Field>
    <Field label="연락처"><input type="tel" value={f.phone} onChange={set('phone')} autoComplete="off"/></Field>
    <fieldset className="swatches"><legend>표시 색상</legend>{PATIENT_COLORS.map(c => <button type="button" key={c} className={'swatch' + (f.color === c ? ' on' : '')} style={{background: c}} aria-label={'색상 ' + c} aria-pressed={f.color === c} onClick={() => setF({...f, color: c})}/>)}</fieldset>
    {isOwner && <label className="check"><input type="checkbox" checked={f.is_private} onChange={set('is_private')}/> <span><b>비공개 환자</b><small>관리자와, 환자별 권한을 받은 구성원만 볼 수 있습니다. 기본 권한(공동 편집/열람)이 적용되지 않습니다.</small></span></label>}
  </FormSheet>;
}

// ---- 진료 일정 ----
export function AppointmentForm({readOnly, initial, patients, members, defaultPatient, defaultDate, onSave, onClose, onDelete}) {
  const {busy, submit} = useSaver(onSave, onClose);
  const [f, setF] = useState({patient_id: initial?.patient_id || defaultPatient || (patients.length === 1 ? patients[0].id : ''), hospital: initial?.hospital || '', department: initial?.department || '', doctor: initial?.doctor || '', visit_date: initial?.visit_date || defaultDate || todayStr(), visit_time: initial?.visit_time?.slice(0, 5) || '', status: initial?.status || '예약완료', companion_id: initial?.companion_id || '', note: initial?.note || ''});
  const set = k => e => setF({...f, [k]: e.target.value});
  return <FormSheet readOnly={readOnly} title={initial ? '진료 일정 수정' : '진료 일정 등록'} onClose={onClose} busy={busy} onDelete={onDelete}
    onSubmit={submit(() => ({patient_id: f.patient_id, hospital: f.hospital.trim(), department: f.department.trim() || null, doctor: f.doctor.trim() || null, visit_date: f.visit_date, visit_time: f.visit_time || null, status: f.status, companion_id: f.companion_id || null, note: f.note.trim() || null}))}>
    <PatientSelect value={f.patient_id} onChange={v => setF({...f, patient_id: v})} patients={patients} disabled={!!initial}/>
    <Field label="병원"><input required value={f.hospital} onChange={set('hospital')}/></Field>
    <div className="row2"><Field label="진료과"><input value={f.department} onChange={set('department')}/></Field><Field label="담당 의사"><input value={f.doctor} onChange={set('doctor')}/></Field></div>
    <div className="row2"><Field label="진료일"><input type="date" required value={f.visit_date} onChange={set('visit_date')}/></Field><Field label="시간"><input type="time" value={f.visit_time} onChange={set('visit_time')}/></Field></div>
    <Field label="상태"><select value={f.status} onChange={set('status')}>{APPT_STATUS.map(s => <option key={s}>{s}</option>)}</select></Field>
    <Field label="동행 담당 보호자" hint="병원에 함께 가는 가족을 지정하면 다른 보호자가 중복 확인하지 않아도 됩니다."><select value={f.companion_id} onChange={set('companion_id')}><option value="">미정</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || '이름 없음'}</option>)}</select></Field>
    <Field label="메모"><textarea rows={3} value={f.note} onChange={set('note')}/></Field>
  </FormSheet>;
}

// ---- 진료 기록 ----
export function RecordForm({readOnly, initial, patients, appointments, defaultPatient, defaultDate, linkAppointment, onSave, onClose, onDelete}) {
  const {busy, submit} = useSaver(onSave, onClose);
  const [f, setF] = useState({patient_id: initial?.patient_id || defaultPatient || (patients.length === 1 ? patients[0].id : ''), visit_date: initial?.visit_date || defaultDate || todayStr(), diagnosis: initial?.diagnosis || '', symptoms: initial?.symptoms || '', tests: initial?.tests || '', treatment: initial?.treatment || '', prescription: initial?.prescription || '', cautions: initial?.cautions || '', memo: initial?.memo || '', appointment_id: initial?.appointment_id || linkAppointment || ''});
  const set = k => e => setF({...f, [k]: e.target.value});
  const appts = appointments.filter(a => a.patient_id === f.patient_id && !a.deleted_at);
  const nul = v => v.trim() || null;
  return <FormSheet readOnly={readOnly} title={initial ? '진료 기록 수정' : '진료 기록 작성'} onClose={onClose} busy={busy} onDelete={onDelete}
    onSubmit={submit(() => ({patient_id: f.patient_id, visit_date: f.visit_date, diagnosis: nul(f.diagnosis), symptoms: nul(f.symptoms), tests: nul(f.tests), treatment: nul(f.treatment), prescription: nul(f.prescription), cautions: nul(f.cautions), memo: nul(f.memo), appointment_id: f.appointment_id || null}))}>
    <PatientSelect value={f.patient_id} onChange={v => setF({...f, patient_id: v, appointment_id: ''})} patients={patients} disabled={!!initial}/>
    <Field label="진료일"><input type="date" required value={f.visit_date} onChange={set('visit_date')}/></Field>
    <Field label="진단 / 병명"><input value={f.diagnosis} onChange={set('diagnosis')}/></Field>
    <Field label="증상"><textarea rows={2} value={f.symptoms} onChange={set('symptoms')}/></Field>
    <Field label="검사 결과"><textarea rows={2} value={f.tests} onChange={set('tests')}/></Field>
    <Field label="치료 내용"><textarea rows={2} value={f.treatment} onChange={set('treatment')}/></Field>
    <Field label="처방"><textarea rows={2} value={f.prescription} onChange={set('prescription')}/></Field>
    <Field label="주의사항 / 다음 진료 안내"><textarea rows={2} value={f.cautions} onChange={set('cautions')}/></Field>
    <Field label="메모"><textarea rows={2} value={f.memo} onChange={set('memo')}/></Field>
    {appts.length > 0 && <Field label="연결할 진료 일정(선택)"><select value={f.appointment_id} onChange={set('appointment_id')}><option value="">연결 안 함</option>{appts.slice(0, 40).map(a => <option key={a.id} value={a.id}>{a.visit_date} {a.hospital}</option>)}</select></Field>}
  </FormSheet>;
}

// ---- 복약 계획 ----
const PRESETS = [['아침', '08:00'], ['점심', '12:00'], ['저녁', '18:00'], ['취침 전', '22:00']];
export function MedicationForm({readOnly, initial, patients, defaultPatient, onSave, onClose, onDelete}) {
  const {busy, submit} = useSaver(onSave, onClose);
  const [f, setF] = useState({patient_id: initial?.patient_id || defaultPatient || (patients.length === 1 ? patients[0].id : ''), name: initial?.name || '', dosage: initial?.dosage || '', instructions: initial?.instructions || '', times: initial?.times || [], start_date: initial?.start_date || '', end_date: initial?.end_date || '', active: initial?.active ?? true});
  const [custom, setCustom] = useState('');
  const set = k => e => setF({...f, [k]: e.target.value});
  const toggle = t => setF({...f, times: f.times.includes(t) ? f.times.filter(x => x !== t) : [...f.times, t].sort()});
  return <FormSheet readOnly={readOnly} title={initial ? '복약 계획 수정' : '복약 계획 등록'} onClose={onClose} busy={busy} onDelete={onDelete} deleteLabel="삭제(휴지통)"
    onSubmit={submit(() => ({patient_id: f.patient_id, name: f.name.trim(), dosage: f.dosage.trim() || null, instructions: f.instructions.trim() || null, times: f.times, start_date: f.start_date || null, end_date: f.end_date || null, active: f.active}))}>
    <PatientSelect value={f.patient_id} onChange={v => setF({...f, patient_id: v})} patients={patients} disabled={!!initial}/>
    <Field label="약품명"><input required value={f.name} onChange={set('name')}/></Field>
    <div className="row2"><Field label="1회 용량"><input value={f.dosage} onChange={set('dosage')} placeholder="예: 1정"/></Field><Field label="복용 방법"><input value={f.instructions} onChange={set('instructions')} placeholder="예: 식후 30분"/></Field></div>
    <fieldset className="times"><legend>복용 시간</legend>
      <div className="chips">{PRESETS.map(([l, t]) => <button type="button" key={t} aria-pressed={f.times.includes(t)} className={'chip' + (f.times.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>{l} {t}</button>)}</div>
      <div className="chips">{f.times.filter(t => !PRESETS.some(p => p[1] === t)).map(t => <button type="button" key={t} className="chip on" onClick={() => toggle(t)}>{t} <X size={14}/></button>)}</div>
      <div className="inline"><input type="time" aria-label="직접 시간 추가" value={custom} onChange={e => setCustom(e.target.value)}/><button type="button" disabled={!custom} onClick={() => { if (custom) { setF({...f, times: f.times.includes(custom) ? f.times : [...f.times, custom].sort()}); setCustom(''); } }}><Plus size={16}/> 추가</button></div>
      <small className="hint">시간을 지정하지 않으면 하루 1회 확인 항목으로 표시됩니다.</small></fieldset>
    <div className="row2"><Field label="시작일(선택)"><input type="date" value={f.start_date} onChange={set('start_date')}/></Field><Field label="종료일(선택)"><input type="date" value={f.end_date} min={f.start_date} onChange={set('end_date')}/></Field></div>
    <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({...f, active: e.target.checked})}/> <span><b>복용 중</b><small>끄면 오늘 복약 목록과 알림에서 제외됩니다(기록은 보존).</small></span></label>
  </FormSheet>;
}

// ---- 첨부 ----
export function AttachmentForm({patients, defaultPatient, onSave, onClose}) {
  const {fail} = useApp(), [busy, setBusy] = useState(false), [patient, setPatient] = useState(defaultPatient || (patients.length === 1 ? patients[0].id : '')), [kind, setKind] = useState('처방전'), [file, setFile] = useState(null);
  return <Sheet title="파일 첨부" onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave({patient, kind, file}); onClose(); } catch (err) { fail(err); } finally { setBusy(false); } }}>
      <PatientSelect value={patient} onChange={setPatient} patients={patients}/>
      <Field label="종류"><select value={kind} onChange={e => setKind(e.target.value)}>{ATTACH_KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
      <Field label="파일 (사진 또는 PDF, 최대 10MB)" hint="사진은 업로드 전에 자동으로 용량을 줄입니다."><input type="file" required accept="image/*,application/pdf" capture={undefined} onChange={e => setFile(e.target.files?.[0] || null)}/></Field>
      <FormActions busy={busy} onCancel={onClose} submitLabel="업로드"/>
    </form></Sheet>;
}

export function PermissionSheet({patient, members, perms, onSet, onClose}) {
  const others = members.filter(m => m.status === 'approved' && m.role !== 'owner');
  const current = uid => { const x = perms.find(p => p.patient_id === patient.id && p.user_id === uid); return !x ? 'default' : x.can_edit ? 'edit' : x.can_create ? 'create' : x.can_view ? 'view' : 'none'; };
  const MAP = {edit: {can_view: true, can_create: true, can_edit: true}, create: {can_view: true, can_create: true, can_edit: false}, view: {can_view: true, can_create: false, can_edit: false}, none: {can_view: false, can_create: false, can_edit: false}};
  return <Sheet title={patient.name + ' 접근 권한'} onClose={onClose}>
    <p className="muted">{patient.is_private ? '비공개 환자입니다. 아래에서 허용한 구성원만 볼 수 있습니다.' : '기본값은 각 구성원의 기본 접근 수준을 따릅니다. 이 환자에게만 다른 권한을 주려면 변경하십시오.'}</p>
    {others.length === 0 && <p>다른 구성원이 없습니다.</p>}
    {others.map(m => <div className="item" key={m.user_id}>
      <b>{m.display_name || '이름 없음'}</b><small className="muted"> 기본: {{edit: '공동 편집', view: '열람만', none: '지정 없음'}[m.default_access]}</small>
      <select aria-label={(m.display_name || '구성원') + ' 권한'} value={current(m.user_id)} onChange={e => onSet(m.user_id, e.target.value === 'default' ? null : MAP[e.target.value])}>
        <option value="default">기본값 따름</option><option value="edit">편집 가능</option><option value="create">조회 + 등록</option><option value="view">조회만</option><option value="none">접근 차단</option></select></div>)}
  </Sheet>;
}
