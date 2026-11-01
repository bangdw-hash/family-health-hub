import React, {useEffect, useState} from 'react';
import {useApp} from '../state.js';
import {PageHeader, Section, Field, Badge} from '../components/ui.jsx';
import {callAi} from '../lib/api.js';
import {PROVIDERS} from '../../supabase/functions/_shared/ocr.js';
import {KeyRound, RefreshCw, PlugZap, Trash2, ShieldCheck} from 'lucide-react';

const KEY_LINKS = {anthropic: ['https://console.anthropic.com/settings/keys', 'Anthropic Console'], openai: ['https://platform.openai.com/api-keys', 'OpenAI Platform'], google: ['https://aistudio.google.com/apikey', 'Google AI Studio']};

/** 관리자 전용: AI 서비스사 / API 키 / 모델을 1회 등록하면 패밀리 전원이 OCR(예약 안내 읽기)에 사용합니다. */
export default function AiSettings() {
  const {nav, ai, family, api, act, confirm, toast, fail, isOwner} = useApp();
  const [provider, setProvider] = useState(ai?.provider || 'anthropic'), [model, setModel] = useState(ai?.model || PROVIDERS.anthropic.defaultModel);
  const [key, setKey] = useState(''), [enabled, setEnabled] = useState(ai?.enabled ?? true), [limit, setLimit] = useState(ai?.daily_limit ?? 100);
  const [models, setModels] = useState([]), [busy, setBusy] = useState('');
  useEffect(() => { if (ai) { setProvider(ai.provider || 'anthropic'); setModel(ai.model || PROVIDERS[ai.provider || 'anthropic'].defaultModel); setEnabled(ai.enabled ?? true); setLimit(ai.daily_limit ?? 100); } }, [ai?.provider, ai?.model, ai?.enabled, ai?.daily_limit]);
  if (!isOwner) return <><PageHeader title="AI 설정(OCR)" onBack={nav.back}/><p className="muted">관리자만 설정할 수 있습니다.</p></>;
  const providerChanged = ai?.has_key && ai.provider && ai.provider !== provider;
  const run = (name, fn) => async () => { setBusy(name); try { await fn(); } catch (e) { fail(e); } finally { setBusy(''); } };
  const save = run('save', async () => {
    await api.rpc('set_ai_settings', {p_family: family.id, p_provider: provider, p_model: model.trim(), p_api_key: key.trim() || null, p_enabled: enabled, p_daily_limit: Number(limit)});
    setKey(''); await ai?.refresh?.(); toast('AI 설정을 저장했습니다. 패밀리 전원이 사용할 수 있습니다.');
  });
  const loadModels = run('models', async () => { const r = await callAi({action: 'models', family_id: family.id}); setModels(r.models); toast(`모델 ${r.models.length}개를 불러왔습니다.`); });
  const test = run('test', async () => { await callAi({action: 'test', family_id: family.id}); toast('연결 테스트에 성공했습니다. 선택한 모델로 응답을 받았습니다.'); });
  async function removeKey() {
    if (!await confirm({title: 'API 키 삭제', body: '저장된 키를 삭제하고 AI 읽기를 끕니다. 구성원은 더 이상 사진을 읽을 수 없습니다.', confirmLabel: '삭제', danger: true})) return;
    act(async () => { await api.rpc('delete_ai_key', {p_family: family.id}); await ai?.refresh?.(); toast('키를 삭제했습니다.'); });
  }
  const [link, linkName] = KEY_LINKS[provider];
  return <>
    <PageHeader title="AI 설정(OCR)" onBack={nav.back}/>
    <section className="panel">
      <p className="muted">병원 앱 화면·문자·안내문 사진을 읽어 일정 항목을 자동으로 채우는 기능에 사용할 AI 서비스를 등록합니다. <b>관리자가 한 번 등록하면 모든 구성원이 같은 설정으로 사용</b>하며, 구성원에게 키는 보이지 않습니다.</p>
      <p>현재 상태: {ai?.configured ? <Badge tone={ai.enabled ? 'ok' : 'warn'}>{ai.enabled ? '사용 중' : '꺼짐'} · {PROVIDERS[ai.provider]?.label} · {ai.model}</Badge> : <Badge tone="warn">미설정</Badge>}
        {ai && <small className="muted"> · 최근 24시간 {ai.used_24h}/{ai.daily_limit}회</small>}</p>
    </section>
    <Section title="서비스·모델" id="ai-main">
      <Field label="AI 서비스사"><select value={provider} onChange={e => { setProvider(e.target.value); setModel(PROVIDERS[e.target.value].defaultModel); setModels([]); }}>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="API 키" hint={ai?.has_key && !providerChanged ? '저장된 키가 있습니다. 바꾸려면 새 키를 입력하십시오(비워 두면 유지).' : <>키는 <a href={link} target="_blank" rel="noopener noreferrer">{linkName}</a>에서 발급합니다. 저장 후에는 다시 표시되지 않습니다.</>}>
        <input type="password" autoComplete="off" spellCheck="false" value={key} onChange={e => setKey(e.target.value)} placeholder={ai?.has_key && !providerChanged ? '•••••••• (저장됨)' : '키를 붙여넣으십시오'}/></Field>
      {providerChanged && <p className="callout warn">서비스사를 바꾸면 새 API 키가 필요합니다.</p>}
      <Field label="모델" hint="이미지 입력을 지원하는 모델을 선택하십시오. 저장 후 '모델 목록 불러오기'로 키에서 쓸 수 있는 모델을 확인할 수 있습니다.">
        <input list="ai-models" value={model} onChange={e => setModel(e.target.value)} spellCheck="false"/></Field>
      <datalist id="ai-models">{models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</datalist>
      {models.length > 0 && <Field label="불러온 모델에서 선택"><select value={models.some(m => m.id === model) ? model : ''} onChange={e => e.target.value && setModel(e.target.value)}><option value="">직접 입력 값 사용</option>{models.map(m => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}</select></Field>}
      <div className="row2"><Field label="하루 사용 한도(패밀리 전체)"><input type="number" min="1" max="2000" value={limit} onChange={e => setLimit(e.target.value)}/></Field>
        <label className="check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/> <span><b>AI 읽기 사용</b><small>끄면 구성원은 글자 붙여넣기(규칙 기반)만 가능합니다.</small></span></label></div>
      <button type="button" className="primary" disabled={busy || !model.trim() || (!ai?.has_key && !key.trim()) || (providerChanged && !key.trim())} onClick={save}><KeyRound size={18}/> {busy === 'save' ? '저장 중...' : '저장'}</button>
      <div className="row2">
        <button type="button" disabled={!!busy || !ai?.configured || providerChanged} onClick={loadModels}><RefreshCw size={16}/> {busy === 'models' ? '불러오는 중...' : '모델 목록 불러오기'}</button>
        <button type="button" disabled={!!busy || !ai?.configured} onClick={test}><PlugZap size={16}/> {busy === 'test' ? '확인 중...' : '연결 테스트'}</button></div>
      {ai?.has_key && <button type="button" className="danger-link" onClick={removeKey}><Trash2 size={16}/> 저장된 API 키 삭제</button>}
    </Section>
    <Section title="알아두실 점" id="ai-notes">
      <ul className="notes muted">
        <li><ShieldCheck size={14}/> 키는 Supabase Vault에 암호화되어 저장되고, 구성원의 화면이나 브라우저로 내려오지 않습니다. 호출은 서버 함수(ai-ocr)가 대신합니다.</li>
        <li>사용 요금은 이 키를 발급한 계정에 청구됩니다. 하루 한도로 과다 사용을 막되, 서비스사 대시보드에서도 지출 한도를 설정하십시오.</li>
        <li>사진·글자는 선택한 AI 서비스로 전송됩니다. 구성원이 동의 화면에서 이 내용을 확인하며, 환자 이름·주민등록번호는 읽지 않도록 지시합니다. 읽은 결과는 사용자가 확인한 뒤에만 저장됩니다.</li>
        <li>모델 이름·지원 기능은 서비스사가 바꿀 수 있습니다. 오류가 나면 '모델 목록 불러오기'와 '연결 테스트'로 확인하십시오.</li>
      </ul>
    </Section>
  </>;
}
