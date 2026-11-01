import React, {useState} from 'react';
import {useApp} from '../state.js';
import {Section, PageHeader, Segmented} from '../components/ui.jsx';
import {MedChecklist, MedItem, live} from '../components/cards.jsx';
import {Plus} from 'lucide-react';

export default function Meds() {
  const {data, today, patients, sheet, creatable} = useApp(), [filter, setFilter] = useState('');
  const ids = filter ? [filter] : patients.map(p => p.id);
  const meds = live(data.medications).filter(m => ids.includes(m.patient_id));
  return <>
    <PageHeader title="복약" right={creatable.length > 0 && <button type="button" className="primary-soft" onClick={() => sheet.open('med', {defaultPatient: filter})}><Plus size={18}/> 약 추가</button>}/>
    {patients.length > 1 && <label className="field"><span className="field-label">환자</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">전체 환자</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    <Section title="오늘 복용 확인" id="m-today"><MedChecklist date={today} patientIds={ids} emptyText="오늘 확인할 복약이 없습니다. 아래에서 복약 계획을 등록하십시오."/></Section>
    <Section title="복약 계획" id="m-plans">{meds.length ? meds.map(m => <MedItem key={m.id} m={m}/>) : <p className="muted">등록된 복약 계획이 없습니다.</p>}</Section>
  </>;
}
