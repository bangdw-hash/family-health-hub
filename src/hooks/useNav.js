import {useCallback, useEffect, useRef, useState} from 'react';

const ROOT = {tab: 'today', patientId: null, ptab: 'appts', sub: null, search: false};
/** 라우터 없이 History API로 뒤로가기(브라우저/안드로이드)를 지원하는 가벼운 화면 이동 상태. */
export function useNav() {
  const init = (() => { try { return {...ROOT, ...(history.state?.fhh || {})}; } catch { return ROOT; } })();
  const [state, setState] = useState(init), ref = useRef(init);
  useEffect(() => { try { history.replaceState({...history.state, fhh: ref.current}, ''); } catch {} }, []);
  useEffect(() => {
    const pop = e => { const n = {...ROOT, ...(e.state?.fhh || {})}; ref.current = n; setState(n); window.scrollTo(0, 0); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const go = useCallback((patch, opts = {}) => {
    const n = {...ref.current, ...patch};
    ref.current = n;
    try { opts.replace ? history.replaceState({...history.state, fhh: n}, '') : history.pushState({fhh: n}, ''); } catch {}
    setState(n); window.scrollTo(0, 0);
  }, []);
  const tab = useCallback(t => go({...ROOT, tab: t}, {replace: true}), [go]);
  const back = useCallback(() => { history.back(); }, []);
  const atRoot = !state.patientId && !state.sub && !state.search;
  return {state, go, tab, back, atRoot};
}
