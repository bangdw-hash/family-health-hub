import React, {useState} from 'react';
import {Sheet, Field} from './ui.jsx';
import {useApp} from '../state.js';
import {shareText, appUrl, openExternal, downloadText, kakaoConfigured, isNative} from '../lib/share.js';
import {buildIcs, googleCalendarUrl} from '../lib/ics.js';
import {MessageCircle, Copy, CalendarPlus, FileDown} from 'lucide-react';

/** 진료 일정·복약 현황 공유(카카오톡) + 구글 캘린더 추가. 진단명·메모는 문구에 포함하지 않습니다. */
export default function ShareSheet({title, text: initial, appt, patientName, companionName, onClose}) {
  const {toast, fail} = useApp(), [text, setText] = useState(initial), [busy, setBusy] = useState(false);
  const ready = kakaoConfigured() || isNative();
  async function send() {
    setBusy(true);
    try { const how = await shareText({text, url: appUrl()}); if (how === 'copy') toast('공유 기능을 쓸 수 없어 문구와 링크를 복사했습니다. 카카오톡에 붙여넣으십시오.'); else if (how === 'kakao') toast('카카오톡 공유 창을 열었습니다.'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  const ics = () => buildIcs({calName: '진료 일정', patients: [{id: appt.patient_id, name: patientName}], appointments: [{...appt, companion_name: companionName}], medications: [], options: {include_meds: false}});
  return <Sheet title={title} onClose={onClose}>
    <Field label="보낼 내용 (수정할 수 있습니다)"><textarea rows={6} value={text} onChange={e => setText(e.target.value)}/></Field>
    <p className="muted">공유하면 환자 이름과 병원 이름이 카카오톡(또는 선택한 앱)과 받는 사람에게 전달됩니다. 진단명·검사 결과·메모는 포함하지 않습니다.</p>
    <div className="stack">
      <button type="button" className="primary" disabled={busy || !text.trim()} onClick={send}><MessageCircle size={18}/> {ready ? '카카오톡으로 보내기' : '공유하기 (카카오톡 선택)'}</button>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); toast('문구를 복사했습니다.'); } catch (e) { fail(e); } }}><Copy size={18}/> 문구 복사</button>
      {appt && <>
        <button type="button" onClick={() => openExternal(googleCalendarUrl(appt, patientName, companionName))}><CalendarPlus size={18}/> 구글 캘린더에 추가</button>
        {!isNative() && <button type="button" onClick={() => downloadText(`진료-${appt.visit_date}.ics`, ics())}><FileDown size={18}/> 일정 파일(.ics) 받기 — 아이폰·기타 캘린더용</button>}
      </>}
    </div>
    {!ready && <p className="muted">카카오 앱 키가 설정되지 않아 기기 공유창으로 보냅니다. 공유창에서 카카오톡을 선택하십시오.</p>}
  </Sheet>;
}
