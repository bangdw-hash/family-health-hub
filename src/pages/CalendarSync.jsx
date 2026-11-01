import React, {useEffect, useState} from 'react';
import {useApp} from '../state.js';
import {PageHeader, Section, Field, Badge} from '../components/ui.jsx';
import {supabase} from '../lib/supabase.js';
import {isSchemaOutdated} from '../lib/errors.js';
import {openExternal, kakaoConfigured, isNative} from '../lib/share.js';
import {fmtDateTime} from '../lib/format.js';
import {Copy, CalendarPlus, RefreshCw, Unlink, Smartphone} from 'lucide-react';

export const feedUrl = token => (import.meta.env.VITE_SUPABASE_URL || 'https://example.supabase.co').replace(/\/$/, '') + '/functions/v1/calendar-feed/' + token + '.ics';
export const googleSubscribeUrl = token => 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(feedUrl(token).replace(/^https:/, 'webcal:'));

export default function CalendarSync() {
  const {nav, family, patients, act, confirm, toast, api} = useApp();
  const [feed, setFeed] = useState(undefined), [outdated, setOutdated] = useState(false);
  const [meds, setMeds] = useState(true), [names, setNames] = useState(true), [sel, setSel] = useState(null);
  const load = async () => {
    const {data, error} = await supabase.from('calendar_feeds').select('*').eq('family_id', family.id).maybeSingle();
    if (error) { if (isSchemaOutdated(error)) setOutdated(true); setFeed(null); return; }
    setFeed(data || null);
    if (data) { setMeds(data.include_meds); setNames(data.show_med_names); setSel(data.patient_ids); }
  };
  useEffect(() => { load(); }, [family.id]);
  const chosen = sel ?? patients.map(p => p.id);
  const toggle = id => { const cur = new Set(chosen); cur.has(id) ? cur.delete(id) : cur.add(id); setSel([...cur]); };
  const payload = () => ({p_family: family.id, p_include_meds: meds, p_show_med_names: names, p_patient_ids: sel && sel.length !== patients.length ? sel : null});
  const create = () => act(async () => { await api.rpc('create_calendar_feed', payload()); await load(); toast('구독 링크를 만들었습니다.'); });
  const save = () => act(async () => { await api.rpc('update_calendar_feed', payload()); await load(); toast('설정을 저장했습니다.'); });
  async function rotate() {
    if (!await confirm({title: '링크 새로 만들기', body: '기존 링크는 즉시 사용할 수 없게 됩니다. 이미 구독 중인 캘린더는 새 링크로 다시 구독해야 합니다.', confirmLabel: '새로 만들기', danger: true})) return;
    create();
  }
  async function remove() {
    if (!await confirm({title: '연동 해제', body: '구독 링크를 삭제합니다. 구독 중인 캘린더에는 더 이상 일정이 갱신되지 않습니다(이미 표시된 일정은 캘린더에서 직접 구독 취소해야 합니다).', confirmLabel: '해제', danger: true})) return;
    act(async () => { await api.rpc('delete_calendar_feed', {p_family: family.id}); setFeed(null); toast('연동을 해제했습니다.'); });
  }
  const url = feed ? feedUrl(feed.token) : '';
  const options = <>
    <fieldset className="plain"><legend>일정에 포함할 환자</legend>{patients.map(p => <label className="check" key={p.id}><input type="checkbox" checked={chosen.includes(p.id)} onChange={() => toggle(p.id)}/> <span>{p.name}</span></label>)}{patients.length === 0 && <p className="muted">환자가 없습니다.</p>}</fieldset>
    <label className="check"><input type="checkbox" checked={meds} onChange={e => setMeds(e.target.checked)}/> <span><b>복약 시간 포함</b><small>매일 반복 일정으로 표시됩니다.</small></span></label>
    {meds && <label className="check"><input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)}/> <span><b>약 이름 표시</b><small>끄면 "복약 · 환자 · 08:00"처럼 약 이름 없이 표시합니다.</small></span></label>}
  </>;
  return <>
    <PageHeader title="캘린더·카카오톡 연동" onBack={nav.back}/>
    <Section title="구글·아이폰 캘린더에 가족 일정 구독" id="cal-feed">
      <p className="muted">진료 일정과 복약 시간이 내 캘린더에 자동으로 나타나고, 앱에서 수정하면 구독 캘린더에도 반영됩니다. 반영에는 구글 캘린더 기준 수 시간~하루 정도 걸릴 수 있습니다(구글이 정하는 갱신 주기이며 앱에서 바꿀 수 없습니다).</p>
      <p className="muted"><b>보안 안내:</b> 링크를 아는 사람은 로그인 없이 이 일정을 볼 수 있습니다(환자 이름, 병원, 시간 포함 / 진단명·메모 제외). 다른 사람에게 보내지 말고, 유출이 의심되면 "링크 새로 만들기"를 누르십시오. 내가 볼 수 있는 환자의 일정만 포함되며, 패밀리에서 제거되면 즉시 중단됩니다.</p>
      {outdated && <p role="alert" className="err">서버 업데이트가 필요합니다(20261102000000_calendar_feeds.sql 및 calendar-feed 엣지 함수 적용). 관리자에게 문의하십시오.</p>}
      {feed === undefined && <p role="status">불러오는 중...</p>}
      {feed === null && !outdated && <>{options}<button type="button" className="primary" onClick={create} disabled={!chosen.length}><CalendarPlus size={18}/> 구독 링크 만들기</button></>}
      {feed && <>
        <Field label="내 구독 링크"><input readOnly value={url} onFocus={e => e.target.select()} aria-label="구독 링크"/></Field>
        <div className="stack">
          <button type="button" className="primary" onClick={() => openExternal(googleSubscribeUrl(feed.token))}><CalendarPlus size={18}/> 구글 캘린더에 추가</button>
          <div className="row2">
            <button type="button" onClick={() => act(async () => { await navigator.clipboard.writeText(url); toast('링크를 복사했습니다.'); })}><Copy size={18}/> 링크 복사</button>
            <button type="button" onClick={() => openExternal(url.replace(/^https:/, 'webcal:'))}><Smartphone size={18}/> 아이폰·맥 캘린더</button></div>
        </div>
        <p className="muted">{feed.last_fetched_at ? <>마지막 갱신 요청 <Badge tone="ok">{fmtDateTime(feed.last_fetched_at)}</Badge></> : '아직 캘린더가 이 링크를 가져가지 않았습니다. 구독을 추가한 뒤 수 분~수 시간 후 표시됩니다.'}</p>
        <details><summary>구글 캘린더에서 직접 추가하는 방법</summary><ol className="muted"><li>컴퓨터에서 구글 캘린더 → 왼쪽 "다른 캘린더 +" → "URL로 추가"</li><li>위 링크를 붙여넣고 "캘린더 추가"</li><li>휴대전화 구글 캘린더 앱에도 같은 계정이면 자동으로 보입니다.</li></ol></details>
        <hr/>{options}
        <div className="row2"><button type="button" onClick={save} disabled={!chosen.length}>설정 저장</button><button type="button" onClick={rotate}><RefreshCw size={16}/> 링크 새로 만들기</button></div>
        <button type="button" className="danger-link" onClick={remove}><Unlink size={16}/> 연동 해제</button>
      </>}
    </Section>
    <Section title="카카오톡 공유" id="kakao">
      <p className="muted">진료 일정 카드의 <b>공유</b> 버튼과 복약 화면의 <b>카카오톡 공유</b> 버튼으로 환자 이름·병원(또는 복약 현황)을 가족 단톡방에 보낼 수 있습니다. 공유 전에 문구를 수정할 수 있고, 진단명·메모는 포함되지 않습니다.</p>
      <p>상태: {isNative() ? <Badge tone="ok">기기 공유창 사용 (카카오톡 선택)</Badge> : kakaoConfigured() ? <Badge tone="ok">카카오톡 공유 사용 가능</Badge> : <Badge tone="warn">카카오 앱 키 미설정 — 기기 공유창으로 대체</Badge>}</p>
    </Section>
  </>;
}
