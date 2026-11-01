// 의료진 제출용 리포트(인쇄/PDF 저장용 HTML, 공유용 텍스트)
import {fmtDate, fmtTime, ageOf, todayStr} from './format.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export function selectReportData({patient, appointments, records, medications, from, to, today = todayStr()}) {
  const live = x => !x.deleted_at && x.patient_id === patient.id;
  return {
    meds: medications.filter(m => live(m) && m.active !== false),
    records: records.filter(r => live(r) && (!from || r.visit_date >= from) && (!to || r.visit_date <= to)).sort((a, b) => b.visit_date.localeCompare(a.visit_date)),
    upcoming: appointments.filter(a => live(a) && a.status !== '취소' && a.visit_date >= today).sort((a, b) => a.visit_date.localeCompare(b.visit_date)).slice(0, 5),
  };
}

export function buildReportText({patient, meds, records, upcoming, from, to, today = todayStr()}) {
  const age = ageOf(patient.birth_date, today);
  const L = [`[진료 참고 자료] ${patient.name}${age != null ? ` (${age}세)` : ''}`, `작성일 ${today}${from || to ? ` · 기록 기간 ${from || '처음'} ~ ${to || '현재'}` : ''}`, ''];
  L.push('■ 복용 중인 약');
  if (!meds.length) L.push('- 등록된 약 없음');
  meds.forEach(m => L.push(`- ${m.name}${m.dosage ? ' ' + m.dosage : ''}${m.times?.length ? ' · ' + m.times.join(', ') : ''}${m.instructions ? ' · ' + m.instructions : ''}`));
  L.push('', '■ 진료 기록');
  if (!records.length) L.push('- 기록 없음');
  records.forEach(r => {
    L.push(`- ${r.visit_date} ${r.diagnosis || '진료'}`);
    [['증상', r.symptoms], ['검사', r.tests], ['치료', r.treatment], ['처방', r.prescription], ['주의', r.cautions], ['메모', r.memo]].forEach(([k, v]) => v && L.push(`   · ${k}: ${v}`));
  });
  if (upcoming.length) { L.push('', '■ 예정된 진료'); upcoming.forEach(a => L.push(`- ${a.visit_date} ${fmtTime(a.visit_time)} ${a.hospital}${a.department ? ' ' + a.department : ''}`)); }
  return L.join('\n');
}

export function buildReportHtml(args) {
  const {patient, meds, records, upcoming, from, to, requester, today = todayStr()} = args;
  const age = ageOf(patient.birth_date, today);
  const row = (k, v) => v ? `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>진료 참고 자료 - ${esc(patient.name)}</title>
<style>body{font-family:'Noto Sans KR',system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;border-bottom:2px solid #333;padding-bottom:4px;margin-top:22px}
.meta{color:#555;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6;width:92px}
.rec{break-inside:avoid;margin-bottom:12px}.rec h3{font-size:14px;margin:10px 0 4px}.note{margin-top:24px;font-size:11px;color:#666}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="padding:8px 14px;margin-bottom:12px">인쇄 / PDF로 저장</button>
<h1>진료 참고 자료</h1><div class="meta">환자 ${esc(patient.name)}${age != null ? ` · ${age}세` : ''}${patient.birth_date ? ` · 생년월일 ${esc(patient.birth_date)}` : ''} · 작성일 ${esc(today)}${requester ? ` · 작성 ${esc(requester)}` : ''}${from || to ? ` · 기록 기간 ${esc(from || '처음')} ~ ${esc(to || '현재')}` : ''}</div>
<h2>복용 중인 약</h2>${meds.length ? `<table><tr><th>약품</th><th>용량</th><th>시간</th><th>복용 방법</th></tr>${meds.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dosage)}</td><td>${esc((m.times || []).join(', '))}</td><td>${esc(m.instructions)}</td></tr>`).join('')}</table>` : '<p>등록된 약이 없습니다.</p>'}
<h2>진료 기록</h2>${records.length ? records.map(r => `<div class="rec"><h3>${esc(r.visit_date)} · ${esc(r.diagnosis || '진료')}</h3><table>${row('증상', r.symptoms)}${row('검사', r.tests)}${row('치료', r.treatment)}${row('처방', r.prescription)}${row('주의사항', r.cautions)}${row('메모', r.memo)}</table></div>`).join('') : '<p>해당 기간의 기록이 없습니다.</p>'}
${upcoming.length ? `<h2>예정된 진료</h2><table>${upcoming.map(a => `<tr><td>${esc(fmtDate(a.visit_date, true))} ${esc(fmtTime(a.visit_time))}</td><td>${esc(a.hospital)} ${esc(a.department || '')}</td></tr>`).join('')}</table>` : ''}
<p class="note">이 문서는 보호자가 입력한 내용을 정리한 참고 자료이며 의료진의 진단·처방을 대체하지 않습니다. 개인정보가 포함되어 있으므로 필요한 사람에게만 전달하십시오.</p></body></html>`;
}

export function openReportWindow(html) {
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!w;
}
