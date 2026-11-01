import React, {useState} from 'react';
import {useApp} from '../state.js';
import {PageHeader, Section, Sheet, Field, FormActions, Empty} from '../components/ui.jsx';
import {Hospital as HospIcon, Plus, Phone, MapPin} from 'lucide-react';

export function HospitalForm({initial, onClose}) {
  const {api, fail, toast, confirm} = useApp(), [busy, setBusy] = useState(false);
  const [f, setF] = useState({name: initial?.name || '', address: initial?.address || '', phone: initial?.phone || '', map_url: initial?.map_url || '', note: initial?.note || ''});
  const set = k => e => setF({...f, [k]: e.target.value});
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    try {
      const payload = {name: f.name.trim(), address: f.address.trim() || null, phone: f.phone.trim() || null, map_url: f.map_url.trim() || null, note: f.note.trim() || null};
      if (initial) await api.update('hospitals', initial.id, payload); else await api.insert('hospitals', payload);
      toast('병원 정보를 저장했습니다.'); onClose();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }
  async function del() { if (!await confirm({title: '병원 삭제', body: `'${initial.name}' 정보를 삭제합니다. 이미 등록한 일정은 그대로 유지됩니다.`, confirmLabel: '삭제', danger: true})) return; try { await api.remove('hospitals', initial.id); onClose(); } catch (err) { fail(err); } }
  return <Sheet title={initial ? '병원 정보 수정' : '병원 등록'} onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="병원 이름"><input required value={f.name} onChange={set('name')}/></Field>
      <Field label="주소"><input value={f.address} onChange={set('address')}/></Field>
      <Field label="대표 전화"><input type="tel" value={f.phone} onChange={set('phone')}/></Field>
      <Field label="지도 링크(https://…)"><input type="url" value={f.map_url} onChange={set('map_url')} placeholder="https://"/></Field>
      <Field label="메모(주차, 진료과 위치 등)"><textarea rows={3} value={f.note} onChange={set('note')}/></Field>
      <FormActions busy={busy} onCancel={onClose}/>
      {initial && <button type="button" className="danger-link" onClick={del}>병원 삭제</button>}
    </form></Sheet>;
}

export default function Hospitals() {
  const {nav, data, canAddPatient, sheet} = useApp();
  return <>
    <PageHeader title="자주 가는 병원" onBack={nav.back} right={canAddPatient && <button type="button" className="primary-soft" onClick={() => sheet.open('hospital', {})}><Plus size={18}/> 병원 등록</button>}/>
    <p className="muted">진료 일정을 등록할 때 병원 이름만 고르면 전화번호가 자동으로 채워집니다. 패밀리 전체가 함께 사용합니다.</p>
    <section className="panel">{data.hospitals.length ? data.hospitals.map(h => <div className="item" key={h.id}>
      <button type="button" className="rowButton" onClick={() => canAddPatient && sheet.open('hospital', {initial: h})}><span><b>{h.name}</b><br/>
        {h.address && <small className="muted"><MapPin size={12}/> {h.address}<br/></small>}{h.phone && <small className="muted"><Phone size={12}/> {h.phone}</small>}</span></button>
      {h.map_url && <a href={h.map_url} target="_blank" rel="noopener noreferrer">지도 열기</a>}</div>) : <Empty icon={HospIcon} title="등록된 병원이 없습니다">진료 일정 등록 시 "자주 가는 병원에 저장"을 선택하거나 오른쪽 위 버튼으로 등록하십시오.</Empty>}</section>
  </>;
}
