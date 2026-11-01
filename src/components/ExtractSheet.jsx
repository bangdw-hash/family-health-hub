import React, {useState} from 'react';
import {Sheet, Field, Badge} from './ui.jsx';
import {useApp} from '../state.js';
import {callAi} from '../lib/api.js';
import {compressImage} from '../lib/image.js';
import {parseNotice} from '../lib/notice.js';
import {draftFromExtraction, detectLinks, leadTime, visitSummary} from '../lib/visit.js';
import {fmtDate} from '../lib/format.js';
import {ScanText, Image as ImageIcon, FileText, TriangleAlert} from 'lucide-react';

function toB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }

/** 안내문 사진·캡처·문자 → 예약 정보 후보. AI가 설정되어 있으면 AI로, 없으면 규칙 기반으로 텍스트만 분해합니다. */
export default function ExtractSheet({defaultPatient, onClose}) {
  const {ai, isOwner, creatable, nav, fail, toast, sheet, api, today} = useApp();
  const [patient, setPatient] = useState(defaultPatient || (creatable.length === 1 ? creatable[0].id : ''));
  const [file, setFile] = useState(null), [text, setText] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const aiReady = ai?.configured && ai?.enabled;
  async function run() {
    setBusy(true); setResult(null);
    try {
      if (aiReady) {
        let image = null;
        if (file) {
          if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error('HEIC 사진은 지원되지 않습니다. 사진 앱에서 JPG로 저장하거나 화면 캡처를 사용하십시오.');
          const img = await compressImage(file, 2000, 0.85);
          image = {mime: ['image/jpeg', 'image/png', 'image/webp'].includes(img.type) ? img.type : 'image/jpeg', data: await toB64(img)};
        }
        const r = await callAi({action: 'extract', family_id: ai.familyId, image, text: text.trim() || undefined});
        setResult({...r, by: 'ai'}); await ai.refresh?.();
      } else {
        if (!text.trim()) throw new Error('AI가 설정되지 않아 사진은 읽을 수 없습니다. 안내문 글자를 붙여넣거나 관리자에게 AI 설정을 요청하십시오.');
        setResult({...parseNotice(text, new Date(today + 'T00:00:00')), by: 'rule'});
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const items = result?.appointments || [];
  const open = (i) => { const x = items[i], d = draftFromExtraction(x); onClose(); setTimeout(() => sheet.open('appt', {draft: d, defaultPatient: patient}), 0); };
  async function registerAll() {
    if (!patient) return fail(new Error('환자를 선택하십시오.'));
    setBusy(true);
    try {
      const ids = [];
      for (const x of items) {
        const {fields, steps} = draftFromExtraction(x);
        if (!fields.hospital) fields.hospital = '병원 미입력';
        if (!fields.visit_date) fields.visit_date = today;
        const id = await api.insert('appointments', {patient_id: patient, status: '예약완료', kind: '외래진료', ...fields});
        if (steps.length) await api.saveSteps(id, patient, steps, []);
        ids.push(id);
      }
      for (const l of detectLinks(items)) {
        const patch = {related_appointment_id: ids[l.visitIndex], relation: 'test_before', related_lead_minutes: l.lead};
        const t = items[l.testIndex], v = items[l.visitIndex];
        if (!t.visit_time && v.visit_time) patch.visit_time = leadTime(v.visit_time, l.lead);
        await api.update('appointments', ids[l.testIndex], patch);
      }
      toast(`${ids.length}건을 등록했습니다. 내용을 한 번 더 확인하십시오.`); onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  return <Sheet title="안내문·캡처로 예약 등록" onClose={onClose}>
    {aiReady ? <p className="muted">병원 앱 화면 캡처, 예약 문자, 안내문 사진을 올리면 <Badge tone="ok">{ai.provider} · {ai.model}</Badge> 로 읽어 공통 항목으로 채웁니다. 읽은 결과는 확인 후에만 저장됩니다.</p>
      : <p className="callout warn"><TriangleAlert size={16}/> AI 읽기가 설정되지 않았습니다. {isOwner ? <><button type="button" className="link inline-link" onClick={() => { onClose(); nav.go({tab: 'more', sub: 'ai'}); }}>더보기 &gt; AI 설정(OCR)</button>에서 서비스·API 키·모델을 등록하면 사진도 읽을 수 있습니다.</> : '관리자가 AI 설정을 등록하면 사진도 읽을 수 있습니다.'} 지금은 글자를 붙여넣어 규칙 기반으로만 분해합니다.</p>}
    <Field label="환자"><select value={patient} onChange={e => setPatient(e.target.value)}><option value="">환자를 선택하십시오</option>{creatable.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    {aiReady && <Field label="사진 또는 캡처 (JPG·PNG·WEBP)"><input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)}/></Field>}
    <Field label={aiReady ? '또는 안내문 글자 붙여넣기' : '안내문 글자 붙여넣기'} hint="환자 이름·주민등록번호가 보이는 부분은 가리거나 잘라서 올리십시오."><textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="병원 문자·앱 화면의 글자를 그대로 붙여넣으십시오."/></Field>
    {aiReady && <p className="muted">전송 안내: 선택한 사진·글자는 설정된 AI 서비스로 전송됩니다. 최근 24시간 사용 {ai.used_24h}/{ai.daily_limit}회(패밀리 전체).</p>}
    <div className="form-actions"><button type="button" onClick={onClose}>닫기</button><button type="button" className="primary" disabled={busy || (!file && !text.trim())} onClick={run}><ScanText size={18}/> {busy ? '읽는 중...' : '읽기'}</button></div>
    {result && <section className="extract-result" aria-live="polite">
      <h3>읽은 결과 {items.length}건 <Badge>{result.by === 'ai' ? 'AI' : '규칙 기반'}</Badge></h3>
      {result.warnings?.map((w, i) => <p key={i} className="callout warn">{w}</p>)}
      {items.map((x, i) => <article className="card" key={i}>
        <div className="card-main"><span className="card-time">{x.visit_date ? fmtDate(x.visit_date, true) : '날짜 미확인'} {x.visit_time || ''}</span>
          <span className="card-title">{visitSummary(x) || '병원 미확인'}</span>
          <span className="card-snippet">{[x.place && '장소 ' + x.place, x.fasting_hours && `금식 ${x.fasting_hours}시간`, x.doctor && '의료진 ' + x.doctor, x.steps.length && `단계 ${x.steps.length}개`].filter(Boolean).join(' · ') || '세부 정보 없음'}</span></div>
        <div className="card-actions"><button type="button" onClick={() => open(i)}>확인·수정 후 등록</button></div></article>)}
      {items.length > 0 && <button type="button" className="primary" disabled={busy || !patient} onClick={registerAll}>{items.length > 1 ? '모두 바로 등록(검사↔진료 자동 연결)' : '이대로 바로 등록'}</button>}
    </section>}
  </Sheet>;
}
