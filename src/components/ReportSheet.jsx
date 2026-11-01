import React, {useState} from 'react';
import {Sheet, Field} from './ui.jsx';
import {useApp} from '../state.js';
import {selectReportData, buildReportHtml, buildReportText, openReportWindow} from '../lib/report.js';
import {todayStr, addDays} from '../lib/format.js';
import {Printer, Copy, Share2} from 'lucide-react';

export default function ReportSheet({patient, onClose}) {
  const {data, me, toast, api, act, family} = useApp();
  const [from, setFrom] = useState(addDays(todayStr(), -365)), [to, setTo] = useState('');
  if (!patient) return null;
  const build = () => { const d = selectReportData({patient, appointments: data.appointments, records: data.medical_records, medications: data.medications, from, to}); return {patient, ...d, from, to, requester: me?.display_name}; };
  const logIt = () => api.rpc('log_audit_event', {p_family: family.id, p_action: 'report', p_label: patient.name}).catch(() => {});
  const text = () => buildReportText(build());
  return <Sheet title="의료진 제출용 리포트" onClose={onClose}>
    <p className="muted">진료 시 의료진에게 보여줄 수 있도록 복용 약, 진료 기록, 예정 진료를 한 장으로 정리합니다. 생성 사실은 활동 기록에 남습니다.</p>
    <div className="row2"><Field label="기록 시작일"><input type="date" value={from} onChange={e => setFrom(e.target.value)}/></Field><Field label="기록 종료일"><input type="date" value={to} onChange={e => setTo(e.target.value)}/></Field></div>
    <div className="stack">
      <button type="button" className="primary" onClick={() => { logIt(); if (!openReportWindow(buildReportHtml(build()))) toast('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도하십시오.', {kind: 'error'}); }}><Printer size={18}/> 인쇄 / PDF로 저장</button>
      <button type="button" onClick={() => act(async () => { await navigator.clipboard.writeText(text()); logIt(); toast('리포트 내용을 복사했습니다.'); })}><Copy size={18}/> 텍스트 복사</button>
      {navigator.share && <button type="button" onClick={() => { logIt(); navigator.share({title: patient.name + ' 진료 참고 자료', text: text()}).catch(() => {}); }}><Share2 size={18}/> 공유(카카오톡 등)</button>}
    </div>
  </Sheet>;
}
