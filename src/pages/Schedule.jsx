import React, {useMemo, useState} from 'react';
import {useApp} from '../state.js';
import {Section, Segmented, PageHeader, Dot} from '../components/ui.jsx';
import {ApptCard, live} from '../components/cards.jsx';
import {monthGrid, fmtDate, WEEKDAYS} from '../lib/format.js';
import {ChevronLeft, ChevronRight, Plus} from 'lucide-react';

export default function Schedule() {
  const {data, today, patients, colorOf, sheet, creatable, features} = useApp();
  const t = new Date(today + 'T00:00:00');
  const [cur, setCur] = useState({y: t.getFullYear(), m: t.getMonth()}), [sel, setSel] = useState(today), [filter, setFilter] = useState(''), [view, setView] = useState('cal');
  const ids = patients.map(p => p.id);
  const appts = live(data.appointments).filter(a => ids.includes(a.patient_id) && (!filter || a.patient_id === filter));
  const byDate = useMemo(() => { const m = {}; appts.forEach(a => (m[a.visit_date] ||= []).push(a)); return m; }, [data.appointments, filter, patients]);
  const shift = n => { const d = new Date(cur.y, cur.m + n, 1); setCur({y: d.getFullYear(), m: d.getMonth()}); };
  const day = (byDate[sel] || []).slice().sort((a, b) => (a.visit_time || '').localeCompare(b.visit_time || ''));
  const upcoming = appts.filter(a => a.visit_date >= today && a.status !== '취소').sort((a, b) => a.visit_date.localeCompare(b.visit_date) || (a.visit_time || '').localeCompare(b.visit_time || ''));
  const past = appts.filter(a => a.visit_date < today || a.status === '취소').sort((a, b) => b.visit_date.localeCompare(a.visit_date)).slice(0, 50);
  return <>
    <PageHeader title="진료 일정" right={creatable.length > 0 && <div className="head-actions">{features.visits && <button type="button" onClick={() => sheet.open('extract', {defaultPatient: filter})}>캡처로 등록</button>}<button type="button" className="primary-soft" onClick={() => sheet.open('appt', {defaultDate: sel, defaultPatient: filter})}><Plus size={18}/> 일정 추가</button></div>}/>
    <div className="filters"><Segmented label="보기 방식" value={view} onChange={setView} options={[['cal', '달력'], ['list', '목록']]}/>
      {patients.length > 1 && <select aria-label="환자 필터" value={filter} onChange={e => setFilter(e.target.value)}><option value="">전체 환자</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
    {view === 'cal' ? <>
      <section className="panel cal">
        <div className="cal-head"><button type="button" className="icon-btn" aria-label="이전 달" onClick={() => shift(-1)}><ChevronLeft size={20}/></button>
          <h3 aria-live="polite">{cur.y}년 {cur.m + 1}월</h3>
          <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => shift(1)}><ChevronRight size={20}/></button>
          <button type="button" onClick={() => { setCur({y: t.getFullYear(), m: t.getMonth()}); setSel(today); }}>오늘</button></div>
        <div className="cal-grid" role="grid" aria-label={`${cur.y}년 ${cur.m + 1}월 달력`}>
          {WEEKDAYS.map(w => <div key={w} className="cal-w" role="columnheader">{w}</div>)}
          {monthGrid(cur.y, cur.m).map((d, i) => d ? <button type="button" role="gridcell" key={d} className={'cal-d' + (d === today ? ' today' : '') + (d === sel ? ' sel' : '')} aria-selected={d === sel} aria-label={`${fmtDate(d)} ${byDate[d]?.length ? `일정 ${byDate[d].length}건` : '일정 없음'}`} onClick={() => setSel(d)}>
            <span>{Number(d.slice(8))}</span><span className="dots">{[...new Set((byDate[d] || []).map(a => a.patient_id))].slice(0, 4).map(pid => <Dot key={pid} color={colorOf(pid)}/>)}</span></button> : <div key={'e' + i} role="gridcell" className="cal-d empty-d"/>)}
        </div>
      </section>
      <Section title={fmtDate(sel, true)} id="cal-day">{day.length ? day.map(a => <ApptCard key={a.id} a={a}/>) : <p className="muted">이 날짜에는 일정이 없습니다.</p>}</Section>
    </> : <>
      <Section title="예정" id="l-up">{upcoming.length ? upcoming.map(a => <ApptCard key={a.id} a={a} showDate/>) : <p className="muted">예정된 일정이 없습니다.</p>}</Section>
      <Section title="지난 일정" id="l-past">{past.length ? past.map(a => <ApptCard key={a.id} a={a} showDate/>) : <p className="muted">지난 일정이 없습니다.</p>}</Section>
    </>}
  </>;
}
