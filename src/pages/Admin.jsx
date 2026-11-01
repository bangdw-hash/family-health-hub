import React, {useState} from 'react';
import {useApp} from '../state.js';
import {Section, PageHeader, Empty, Badge, Field} from '../components/ui.jsx';
import {ActivityRow, live} from '../components/cards.jsx';
import {fmtDateTime, ENTITY_LABEL, todayStr} from '../lib/format.js';
import {toCsv} from '../lib/csv.js';
import {createZip} from '../lib/zip.js';
import {safeFileName} from '../lib/image.js';
import {Trash2, Undo2, Download, History} from 'lucide-react';

// ---------------- 활동 기록 ----------------
export function Activity() {
  const {nav, visibleLogs, patients, isOwner} = useApp(), [pid, setPid] = useState('');
  const list = visibleLogs.filter(l => !pid || l.patient_id === pid);
  return <>
    <PageHeader title="활동 기록" onBack={nav.back}/>
    <p className="muted">누가 언제 무엇을 등록·수정·삭제했는지 최근 200건을 보여줍니다.{isOwner ? '' : ' 접근 권한이 있는 환자의 활동만 표시됩니다.'}</p>
    {patients.length > 1 && <Field label="환자"><select value={pid} onChange={e => setPid(e.target.value)}><option value="">전체</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
    <section className="panel">{list.length ? list.map(l => <ActivityRow key={l.id} log={l}/>) : <Empty icon={History} title="활동 기록이 없습니다"/>}</section>
  </>;
}

// ---------------- 휴지통 ----------------
const TRASH = [['patients', '환자', p => p.name], ['appointments', '진료 일정', a => `${a.visit_date} ${a.hospital}`], ['medical_records', '진료 기록', r => `${r.visit_date} ${r.diagnosis || '진료 기록'}`], ['medications', '복약 계획', m => m.name], ['attachments', '첨부 파일', f => f.file_name]];
export function Trash() {
  const {nav, data, can, isOwner, api, act, confirm, toast, patients} = useApp();
  const items = TRASH.flatMap(([table, label, name]) => data[table].filter(x => x.deleted_at).map(x => ({table, label, title: name(x), x}))).sort((a, b) => b.x.deleted_at.localeCompare(a.x.deleted_at));
  const canRestore = ({table, x}) => table === 'patients' ? isOwner : can(x.patient_id, 'edit') && (patients.some(p => p.id === x.patient_id));
  async function purge(days) {
    if (!await confirm({title: days ? '오래된 항목 영구 삭제' : '휴지통 비우기', body: days ? `${days}일이 지난 항목을 영구 삭제합니다. 되돌릴 수 없습니다.` : '휴지통의 모든 항목을 영구 삭제합니다. 되돌릴 수 없습니다.', confirmLabel: '영구 삭제', danger: true})) return;
    act(async () => { const n = await api.purgeTrash(days, data.attachments); toast(`${n}건을 영구 삭제했습니다.`); });
  }
  return <>
    <PageHeader title="휴지통" onBack={nav.back}/>
    <p className="muted">삭제한 항목은 30일 동안 보관되며, 관리자가 접속할 때 30일이 지난 항목은 자동으로 영구 삭제됩니다.</p>
    <section className="panel">{items.length ? items.map(i => <div className="item trashrow" key={i.table + i.x.id}>
      <div><Badge>{i.label}</Badge> <b>{i.title}</b><br/><small className="muted">삭제 {fmtDateTime(i.x.deleted_at)}</small></div>
      {canRestore(i) ? <button type="button" onClick={() => act(async () => { await api.restore(i.table, i.x.id); toast('복원했습니다.'); })}><Undo2 size={16}/> 복원</button> : <small className="muted">복원 권한 없음</small>}</div>)
      : <Empty icon={Trash2} title="휴지통이 비어 있습니다"/>}</section>
    {isOwner && items.length > 0 && <div className="stack"><button type="button" onClick={() => purge(30)}>30일 지난 항목 영구 삭제</button><button type="button" className="danger" onClick={() => purge(0)}>휴지통 비우기</button></div>}
  </>;
}

// ---------------- 내보내기 ----------------
function save(blob, name) {
  const file = new File([blob], name, {type: blob.type});
  if (navigator.canShare?.({files: [file]}) && /Android|iPhone|iPad/i.test(navigator.userAgent)) return navigator.share({files: [file], title: name}).catch(() => {});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function Export() {
  const {nav, patients, data, api, act, family, toast, members, isOwner} = useApp();
  const [sel, setSel] = useState(() => patients.map(p => p.id)), [fmt, setFmt] = useState('zip'), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  async function run() {
    setBusy(true);
    try {
      const pick = arr => arr.filter(x => !x.deleted_at && sel.includes(x.patient_id));
      const P = patients.filter(p => sel.includes(p.id)), A = pick(data.appointments), R = pick(data.medical_records), M = pick(data.medications), F = pick(data.attachments);
      const nameOf = id => patients.find(p => p.id === id)?.name || '';
      const who = id => members.find(m => m.user_id === id)?.display_name || '';
      const json = {exported_at: new Date().toISOString(), family: family.name, note: '복용 확인(med_intakes)은 최근 14일만 포함됩니다.', patients: P, appointments: A, medical_records: R, medications: M, attachments: F.map(({storage_path, ...x}) => x)};
      const stamp = todayStr(), base = safeFileName(family.name) + '-' + stamp;
      await api.rpc('log_audit_event', {p_family: family.id, p_action: 'export', p_label: `${fmt} ${P.length}명`});
      if (fmt === 'json') { save(new Blob([JSON.stringify(json, null, 2)], {type: 'application/json'}), base + '.json'); }
      else {
        const files = [{name: 'README.txt', data: `Family Health Hub 내보내기\n패밀리: ${family.name}\n일시: ${json.exported_at}\n환자: ${P.map(p => p.name).join(', ')}\n\n이 파일에는 민감한 건강정보가 들어 있습니다. 안전한 곳에 보관하고 필요한 사람에게만 전달하십시오.\n복용 확인 기록은 최근 14일만 포함됩니다.\nCSV는 Excel에서 바로 열 수 있습니다.\n`},
          {name: 'data.json', data: JSON.stringify(json, null, 2)},
          {name: 'patients.csv', data: toCsv(P, [{key: 'name', label: '이름'}, {key: 'relationship', label: '관계'}, {key: 'birth_date', label: '생년월일'}, {key: 'phone', label: '연락처'}])},
          {name: 'appointments.csv', data: toCsv(A, [{label: '환자', get: r => nameOf(r.patient_id)}, {key: 'visit_date', label: '진료일'}, {key: 'visit_time', label: '시간'}, {key: 'hospital', label: '병원'}, {key: 'department', label: '진료과'}, {key: 'doctor', label: '의사'}, {key: 'status', label: '상태'}, {label: '동행', get: r => who(r.companion_id)}, {key: 'note', label: '메모'}])},
          {name: 'records.csv', data: toCsv(R, [{label: '환자', get: r => nameOf(r.patient_id)}, {key: 'visit_date', label: '진료일'}, {key: 'diagnosis', label: '진단'}, {key: 'symptoms', label: '증상'}, {key: 'tests', label: '검사'}, {key: 'treatment', label: '치료'}, {key: 'prescription', label: '처방'}, {key: 'cautions', label: '주의사항'}, {key: 'memo', label: '메모'}])},
          {name: 'medications.csv', data: toCsv(M, [{label: '환자', get: r => nameOf(r.patient_id)}, {key: 'name', label: '약품'}, {key: 'dosage', label: '용량'}, {key: 'instructions', label: '복용 방법'}, {key: 'times', label: '복용 시간'}, {key: 'start_date', label: '시작일'}, {key: 'end_date', label: '종료일'}, {label: '복용 중', get: r => r.active ? 'Y' : 'N'}])}];
        if (fmt === 'zipfiles') {
          let n = 0;
          for (const f of F) { setNote(`첨부 파일 내려받는 중 ${++n}/${F.length}`); try { files.push({name: `files/${safeFileName(nameOf(f.patient_id))}/${f.id.slice(0, 6)}-${safeFileName(f.file_name)}`, data: await api.downloadFile(f.storage_path)}); } catch { files.push({name: `files/_실패-${f.id.slice(0, 6)}.txt`, data: f.file_name + ' 파일을 내려받지 못했습니다.'}); } }
        }
        save(new Blob([createZip(files)], {type: 'application/zip'}), base + '.zip');
      }
      toast('내보내기 파일을 만들었습니다. 안전한 곳에 보관하십시오.');
    } catch (e) { throw e; } finally { setBusy(false); setNote(''); }
  }
  return <>
    <PageHeader title="내보내기·백업" onBack={nav.back}/>
    <section className="panel">
      <p className="muted">현재 계정이 볼 수 있는 환자의 데이터만 내보냅니다. 내보낸 파일에는 민감한 건강정보가 들어 있으므로 안전하게 보관하십시오. 내보내기 사실은 활동 기록에 남습니다.</p>
      <fieldset className="plain"><legend>환자 선택</legend>{patients.map(p => <label className="check" key={p.id}><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)}/> <span>{p.name}</span></label>)}{patients.length === 0 && <p className="muted">내보낼 환자가 없습니다.</p>}</fieldset>
      <Field label="형식"><select value={fmt} onChange={e => setFmt(e.target.value)}><option value="zip">ZIP — Excel용 CSV + 전체 데이터(JSON) (권장)</option><option value="zipfiles">ZIP — 첨부 파일까지 포함</option><option value="json">JSON 한 개 파일</option></select></Field>
      <button type="button" className="primary" disabled={busy || !sel.length} onClick={() => act(run)}><Download size={18}/> {busy ? '만드는 중...' : '내보내기'}</button>
      {note && <p role="status">{note}</p>}
    </section>
  </>;
}
