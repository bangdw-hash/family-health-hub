import React, {useState} from 'react';
import {useApp} from '../state.js';
import {PageHeader, Empty, Field, Badge, PatientChip} from '../components/ui.jsx';
import {live} from '../components/cards.jsx';
import {fmtDate} from '../lib/format.js';
import {Search as SearchIcon} from 'lucide-react';

export default function Search() {
  const {nav, patients, data, patientById, colorOf, sheet} = useApp(), [q, setQ] = useState(''), [pid, setPid] = useState('');
  const term = q.trim().toLowerCase(), ids = patients.map(p => p.id);
  const ok = (p, ...fields) => ids.includes(p) && (!pid || p === pid) && fields.filter(Boolean).join(' ').toLowerCase().includes(term);
  const appts = term ? live(data.appointments).filter(a => ok(a.patient_id, a.hospital, a.department, a.doctor, a.note)).slice(0, 30) : [];
  const recs = term ? live(data.medical_records).filter(r => ok(r.patient_id, r.diagnosis, r.symptoms, r.tests, r.treatment, r.prescription, r.cautions, r.memo)).slice(0, 30) : [];
  const meds = term ? live(data.medications).filter(m => ok(m.patient_id, m.name, m.instructions, m.dosage)).slice(0, 30) : [];
  const files = term ? live(data.attachments).filter(f => ok(f.patient_id, f.file_name, f.kind)).slice(0, 30) : [];
  const total = appts.length + recs.length + meds.length + files.length;
  const row = (key, patient, title, sub, onClick, tag) => <button type="button" key={key} className="rowButton" onClick={onClick}><span><b>{title}</b> <Badge>{tag}</Badge><br/><small className="muted">{sub}</small> <PatientChip patient={patientById(patient)} color={colorOf(patient)}/></span></button>;
  return <>
    <PageHeader title="검색" onBack={nav.back}/>
    <label className="searchbox big"><SearchIcon size={18} aria-hidden="true"/><input autoFocus type="search" aria-label="검색어" placeholder="병원, 진단, 약 이름, 파일 이름" value={q} onChange={e => setQ(e.target.value)}/></label>
    {patients.length > 1 && <Field label="환자"><select value={pid} onChange={e => setPid(e.target.value)}><option value="">전체</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    {!term ? <Empty icon={SearchIcon} title="검색어를 입력하십시오">진료 일정, 진료 기록, 복약 계획, 첨부 파일 이름을 한 번에 찾습니다.</Empty>
      : total === 0 ? <Empty icon={SearchIcon} title="검색 결과가 없습니다"/> : <section className="panel" aria-live="polite">
        <p className="muted">{total}건</p>
        {appts.map(a => row(a.id, a.patient_id, a.hospital, `${fmtDate(a.visit_date, true)} ${a.department || ''}`, () => sheet.open('appt', {initial: a}), '일정'))}
        {recs.map(r => row(r.id, r.patient_id, r.diagnosis || '진료 기록', fmtDate(r.visit_date, true), () => sheet.open('record', {initial: r}), '기록'))}
        {meds.map(m => row(m.id, m.patient_id, m.name, [m.dosage, m.instructions].filter(Boolean).join(' · '), () => sheet.open('med', {initial: m}), '복약'))}
        {files.map(f => row(f.id, f.patient_id, f.file_name, f.kind, () => nav.go({tab: 'patients', patientId: f.patient_id, ptab: 'files', search: false}), '첨부'))}</section>}
  </>;
}
