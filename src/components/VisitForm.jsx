import React, {useMemo, useState} from 'react';
import {Sheet, Field, FormActions} from './ui.jsx';
import {useApp} from '../state.js';
import {todayStr, fmtDate, fmtTime} from '../lib/format.js';
import {VISIT_KINDS, BOOKING_SOURCES, VISIT_STATUS, STEP_KINDS, PHASE_LABEL, TEMPLATES, templateSteps} from '../lib/visit.js';
import {Trash2, Plus, ArrowUp, ArrowDown, ScanText} from 'lucide-react';

const blank = v => (v === '' || v === undefined ? null : v);
const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
let seq = 0;
const withKey = s => ({...s, _key: s.id || 'n' + ++seq});

function Group({title, hint, open, children}) {
  return <details className="vgroup" open={open}><summary>{title}{hint && <small className="muted"> {hint}</small>}</summary><div className="vgroup-body">{children}</div></details>;
}

function StepsEditor({phase, steps, setSteps}) {
  const mine = steps.filter(s => s.phase === phase);
  const update = (key, patch) => setSteps(steps.map(s => s._key === key ? {...s, ...patch} : s));
  const move = (key, d) => {
    const i = mine.findIndex(s => s._key === key), j = i + d;
    if (j < 0 || j >= mine.length) return;
    const order = [...mine]; [order[i], order[j]] = [order[j], order[i]];
    setSteps([...steps.filter(s => s.phase !== phase), ...order]);
  };
  const add = () => setSteps([...steps, withKey({phase, kind: STEP_KINDS[phase][0], title: '', relative_minutes: null, step_time: null})]);
  return <div className="steps-edit">
    {mine.map(s => <div className="step-row" key={s._key}>
      <select aria-label="종류" value={s.kind} onChange={e => update(s._key, {kind: e.target.value})}>{[...new Set([...STEP_KINDS[phase], s.kind])].map(k => <option key={k}>{k}</option>)}</select>
      <input aria-label="내용" placeholder="예: 금식 시작, 혈압·체중 측정" value={s.title} onChange={e => update(s._key, {title: e.target.value})}/>
      {phase === 'before'
        ? <label className="mini">진료 <input type="number" min="0" max="72" step="0.5" aria-label="진료 몇 시간 전" value={s.relative_minutes == null ? '' : -s.relative_minutes / 60} onChange={e => update(s._key, {relative_minutes: e.target.value === '' ? null : -Math.round(Number(e.target.value) * 60)})}/> 시간 전</label>
        : <input type="time" aria-label="시간(선택)" value={s.step_time ? String(s.step_time).slice(0, 5) : ''} onChange={e => update(s._key, {step_time: e.target.value || null})}/>}
      <span className="step-ctl"><button type="button" className="icon-btn" aria-label="위로" onClick={() => move(s._key, -1)}><ArrowUp size={16}/></button>
        <button type="button" className="icon-btn" aria-label="아래로" onClick={() => move(s._key, 1)}><ArrowDown size={16}/></button>
        <button type="button" className="icon-btn" aria-label="삭제" onClick={() => setSteps(steps.filter(x => x._key !== s._key))}><Trash2 size={16}/></button></span>
    </div>)}
    <button type="button" onClick={add}><Plus size={16}/> {PHASE_LABEL[phase]} 항목 추가</button>
  </div>;
}

export default function VisitForm({initial, existingSteps = [], draft, patients, members, hospitals, appointments, defaultPatient, defaultDate, onSave, onClose, onDelete, onExtract, readOnly}) {
  const {fail, confirm} = useApp(), [busy, setBusy] = useState(false);
  const d = draft?.fields || {}, src = {...d, ...(initial || {})};
  const [f, setF] = useState({
    patient_id: src.patient_id || defaultPatient || (patients.length === 1 ? patients[0].id : ''), kind: src.kind || '외래진료', hospital: src.hospital || '', department: src.department || '', specialty: src.specialty || '',
    doctor: src.doctor || '', doctor_title: src.doctor_title || '', visit_date: src.visit_date || defaultDate || todayStr(), visit_time: src.visit_time?.slice(0, 5) || '', arrival_time: src.arrival_time?.slice(0, 5) || '',
    end_time: src.end_time?.slice(0, 5) || '', status: src.status || '예약완료', booking_source: src.booking_source || '', place: src.place || '', place_note: src.place_note || '', hours_note: src.hours_note || '',
    test_name: src.test_name || '', fasting_hours: src.fasting_hours ?? '', related_appointment_id: src.related_appointment_id || '', relation: src.relation || 'test_before', related_lead_minutes: src.related_lead_minutes ?? '',
    companion_id: src.companion_id || '', booking_ref: src.booking_ref || '', hospital_phone: src.hospital_phone || '', fee_amount: src.fee_amount ?? '', notice_text: src.notice_text || '', note: src.note || ''});
  const [steps, setSteps] = useState(() => (initial ? existingSteps : draft?.steps || []).map(withKey));
  const [saveHospital, setSaveHospital] = useState(false);
  const set = k => e => setF({...f, [k]: e.target.value});
  const related = useMemo(() => appointments.filter(a => !a.deleted_at && a.patient_id === f.patient_id && a.id !== initial?.id), [appointments, f.patient_id, initial?.id]);
  const known = hospitals.find(h => h.name === f.hospital.trim());

  function pickHospital(e) {
    const name = e.target.value, h = hospitals.find(x => x.name === name.trim());
    setF(cur => ({...cur, hospital: name, hospital_phone: h && !cur.hospital_phone ? h.phone || '' : cur.hospital_phone}));
  }
  async function applyTemplate(key) {
    if (!key) return;
    if (steps.length && !await confirm({title: '템플릿 적용', body: '현재 입력한 준비·진행·후 항목이 템플릿 내용으로 바뀝니다. 계속하시겠습니까?', confirmLabel: '적용'})) return;
    setSteps(templateSteps(key).map(withKey));
    setF(cur => ({...cur, kind: TEMPLATES[key].kind, fasting_hours: TEMPLATES[key].fasting_hours ?? cur.fasting_hours}));
  }
  async function submit(e) {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      let list = steps.map(({_key, ...s}) => s);
      const fh = num(f.fasting_hours);
      if (fh && !list.some(s => s.phase === 'before' && s.kind === '금식')) list = [{phase: 'before', kind: '금식', title: '금식 시작', relative_minutes: -fh * 60}, ...list];
      const rel = f.related_appointment_id ? f.related_appointment_id : null;
      const payload = {patient_id: f.patient_id, kind: f.kind, hospital: f.hospital.trim(), department: blank(f.department.trim()), specialty: blank(f.specialty.trim()), doctor: blank(f.doctor.trim()), doctor_title: blank(f.doctor_title.trim()),
        visit_date: f.visit_date, visit_time: blank(f.visit_time), arrival_time: blank(f.arrival_time), end_time: blank(f.end_time), status: f.status, booking_source: blank(f.booking_source), place: blank(f.place.trim()),
        place_note: blank(f.place_note.trim()), hours_note: blank(f.hours_note.trim()), test_name: blank(f.test_name.trim()), fasting_hours: fh, related_appointment_id: rel, relation: rel ? f.relation : null,
        related_lead_minutes: rel && f.relation === 'test_before' ? num(f.related_lead_minutes) : null, companion_id: blank(f.companion_id), booking_ref: blank(f.booking_ref.trim()), hospital_phone: blank(f.hospital_phone.trim()),
        fee_amount: num(f.fee_amount), notice_text: blank(f.notice_text.trim()), note: blank(f.note.trim())};
      await onSave(payload, list, saveHospital && !known ? {name: payload.hospital, phone: payload.hospital_phone} : null);
      onClose();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  return <Sheet title={readOnly ? '진료 일정 조회' : initial ? '진료 일정 수정' : '진료 일정 등록'} onClose={onClose}>
    <form onSubmit={readOnly ? e => e.preventDefault() : submit}>
      {!readOnly && <div className="stack tight">
        {onExtract && <button type="button" className="primary-soft" onClick={onExtract}><ScanText size={18}/> 안내문·캡처에서 자동으로 채우기</button>}
        <label className="field"><span className="field-label">템플릿으로 준비·진행·후 항목 채우기</span>
          <select value="" onChange={e => applyTemplate(e.target.value)}><option value="">템플릿 선택(선택 사항)</option>{Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select></label>
      </div>}
      <fieldset disabled={!!readOnly} className="plain">
        <Group title="기본 정보" open>
          <Field label="환자"><select required value={f.patient_id} disabled={!!initial} onChange={set('patient_id')}><option value="">환자를 선택하십시오</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="row2"><Field label="구분"><select value={f.kind} onChange={set('kind')}>{VISIT_KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
            <Field label="상태"><select value={f.status} onChange={set('status')}>{[...new Set([...VISIT_STATUS, f.status])].map(k => <option key={k}>{k}</option>)}</select></Field></div>
          <Field label="병원"><input required list="vf-hospitals" value={f.hospital} onChange={pickHospital}/></Field>
          <datalist id="vf-hospitals">{hospitals.map(h => <option key={h.id} value={h.name}/>)}</datalist>
          <div className="row2"><Field label="진료과"><input value={f.department} onChange={set('department')}/></Field><Field label="진료 분야"><input value={f.specialty} onChange={set('specialty')} placeholder="예: 협심증, 뇌졸중"/></Field></div>
          <div className="row2"><Field label="의료진"><input value={f.doctor} onChange={set('doctor')}/></Field><Field label="직함"><input value={f.doctor_title} onChange={set('doctor_title')} placeholder="교수, 전문의"/></Field></div>
          <div className="row2"><Field label="날짜"><input type="date" required value={f.visit_date} onChange={set('visit_date')}/></Field><Field label="시간"><input type="time" value={f.visit_time} onChange={set('visit_time')}/></Field></div>
          <div className="row2"><Field label="도착·접수 권장 시각"><input type="time" value={f.arrival_time} onChange={set('arrival_time')}/></Field><Field label="종료 예정(선택)"><input type="time" value={f.end_time} onChange={set('end_time')}/></Field></div>
          <Field label="예약 경로"><select value={f.booking_source} onChange={set('booking_source')}><option value="">미입력</option>{BOOKING_SOURCES.map(k => <option key={k}>{k}</option>)}</select></Field>
          <Field label="동행 담당 보호자"><select value={f.companion_id} onChange={set('companion_id')}><option value="">미정</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name || '이름 없음'}</option>)}</select></Field>
        </Group>
        <Group title="장소·이용 안내" hint="건물·층, 운영 시간">
          <Field label="장소(건물·층·호실)"><input value={f.place} onChange={set('place')} placeholder="예: 별관 지하 2층 신경과"/></Field>
          <Field label="위치 메모"><textarea rows={2} value={f.place_note} onChange={set('place_note')} placeholder="찾아가는 방법, 엘리베이터 위치 등"/></Field>
          <Field label="이용 가능 시간 안내"><textarea rows={2} value={f.hours_note} onChange={set('hours_note')} placeholder="예: 평일 06:30~18:00, 토요일 07:00~12:00"/></Field>
        </Group>
        <Group title="검사·연결된 일정" hint="검사 후 진료 등" open={!!(f.test_name || f.related_appointment_id)}>
          <Field label="검사명"><input value={f.test_name} onChange={set('test_name')} placeholder="예: 진단검사, 채혈, MRI"/></Field>
          <Field label="금식 시간(시간)" hint="입력하면 진료 전 항목에 '금식 시작'이 자동으로 들어가고, 캘린더·알림에 표시됩니다."><input type="number" min="0" max="72" value={f.fasting_hours} onChange={set('fasting_hours')}/></Field>
          <Field label="연결할 일정"><select value={f.related_appointment_id} onChange={set('related_appointment_id')}><option value="">연결 안 함</option>{related.map(a => <option key={a.id} value={a.id}>{fmtDate(a.visit_date)} {fmtTime(a.visit_time)} {a.hospital} {a.kind !== '외래진료' ? '· ' + a.kind : ''}</option>)}</select></Field>
          {f.related_appointment_id && <div className="row2">
            <Field label="관계"><select value={f.relation} onChange={set('relation')}><option value="test_before">이 일정이 선택한 진료보다 먼저 받는 검사</option><option value="follow_up">이 일정이 선택한 진료의 다음 예약</option></select></Field>
            {f.relation === 'test_before' && <Field label="진료 몇 분 전"><input type="number" min="0" max="1440" step="10" value={f.related_lead_minutes} onChange={set('related_lead_minutes')}/></Field>}</div>}
        </Group>
        <Group title="진료 전 준비" hint="금식·지참물·서류·약 조정" open={steps.some(s => s.phase === 'before')}><StepsEditor phase="before" steps={steps} setSteps={setSteps}/></Group>
        <Group title="당일 진행 단계" hint="접수·검사·측정·대기·진료·수납" open={steps.some(s => s.phase === 'during')}><StepsEditor phase="during" steps={steps} setSteps={setSteps}/></Group>
        <Group title="진료 후 할 일" hint="약국·다음 예약·결과 확인" open={steps.some(s => s.phase === 'after')}><StepsEditor phase="after" steps={steps} setSteps={setSteps}/></Group>
        <Group title="예약·병원 정보" hint="캘린더·카카오톡으로 내보내지 않음">
          <div className="row2"><Field label="병원 예약번호"><input value={f.booking_ref} onChange={set('booking_ref')}/></Field><Field label="병원 전화"><input type="tel" value={f.hospital_phone} onChange={set('hospital_phone')}/></Field></div>
          <Field label="수납 금액(원)"><input type="number" min="0" value={f.fee_amount} onChange={set('fee_amount')}/></Field>
          {!initial && f.hospital.trim() && !known && <label className="check"><input type="checkbox" checked={saveHospital} onChange={e => setSaveHospital(e.target.checked)}/> <span><b>이 병원을 자주 가는 병원에 저장</b><small>다음에 이름만 고르면 전화번호가 자동으로 채워집니다.</small></span></label>}
        </Group>
        <Group title="안내문 원문·메모" hint="병원 안내 문구를 그대로 보관" open={!!f.notice_text}>
          <Field label="안내문 원문" hint="주민등록번호·환자번호는 붙여넣지 마십시오. 외부로 내보내지 않습니다."><textarea rows={5} value={f.notice_text} onChange={set('notice_text')}/></Field>
          <Field label="메모"><textarea rows={2} value={f.note} onChange={set('note')}/></Field>
        </Group>
      </fieldset>
      {readOnly ? <><p className="muted">수정 권한이 없어 조회만 가능합니다.</p><div className="form-actions"><button type="button" className="primary" onClick={onClose}>닫기</button></div></>
        : <><FormActions busy={busy} onCancel={onClose}/>{onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={16}/> 휴지통으로 이동</button>}</>}
    </form>
  </Sheet>;
}
