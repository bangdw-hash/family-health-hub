import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {supabase} from '../lib/supabase.js';
import {isSchemaOutdated} from '../lib/errors.js';
import {addDays, todayStr} from '../lib/format.js';

const EMPTY = {patients: [], appointments: [], medical_records: [], medications: [], med_intakes: [], attachments: [], patient_permissions: [], audit_logs: [], family_members: [], family_join_requests: []};
const QUERY = {
  patients: q => q.order('created_at', {ascending: true}).limit(500),
  appointments: q => q.order('visit_date', {ascending: false}).limit(2000),
  medical_records: q => q.order('visit_date', {ascending: false}).limit(2000),
  medications: q => q.order('created_at', {ascending: true}).limit(1000),
  med_intakes: q => q.gte('scheduled_date', addDays(todayStr(), -14)).limit(3000),
  attachments: q => q.order('created_at', {ascending: false}).limit(1000),
  patient_permissions: q => q.limit(2000),
  audit_logs: q => q.order('created_at', {ascending: false}).limit(200),
  family_members: q => q.limit(200),
  family_join_requests: q => q.eq('status', 'pending').limit(100),
};

/** 선택한 패밀리의 모든 데이터를 불러오고 실시간 변경을 반영합니다. 권한 필터링은 서버 RLS가 수행합니다. */
export function useFamilyData(userId, familyId, {onError} = {}) {
  const [data, setData] = useState(EMPTY), [loading, setLoading] = useState(false), [outdated, setOutdated] = useState(false);
  const errRef = useRef(onError); errRef.current = onError;
  const timers = useRef({}), alive = useRef(0);

  const load = useCallback(async tables => {
    if (!familyId) return;
    const token = alive.current;
    const names = tables || Object.keys(QUERY);
    const results = await Promise.all(names.map(async n => {
      try { return [n, await QUERY[n](supabase.from(n).select('*').eq('family_id', familyId))]; }
      catch (e) { return [n, {data: null, error: e}]; }
    }));
    if (token !== alive.current) return;
    const patch = {};
    for (const [n, r] of results) {
      if (r.error) {
        if (isSchemaOutdated(r.error)) setOutdated(true);
        else if (n !== 'family_join_requests') errRef.current?.(r.error);
        continue;
      }
      patch[n] = r.data || [];
    }
    setData(d => ({...d, ...patch}));
  }, [familyId]);

  const reload = useCallback((table) => {
    if (!table) return load();
    clearTimeout(timers.current[table]);
    timers.current[table] = setTimeout(() => load([table]), 250);
    return Promise.resolve();
  }, [load]);

  useEffect(() => {
    alive.current++;
    setData(EMPTY); setOutdated(false);
    if (!familyId || !userId) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    const channel = supabase.channel('fhh-' + familyId);
    Object.keys(QUERY).forEach(table => channel.on('postgres_changes', {event: '*', schema: 'public', table, filter: 'family_id=eq.' + familyId}, () => reload(table)));
    channel.subscribe();
    const t = timers.current;
    return () => { alive.current++; Object.values(t).forEach(clearTimeout); supabase.removeChannel(channel); };
  }, [familyId, userId, load, reload]);

  const me = useMemo(() => data.family_members.find(m => m.user_id === userId && m.status === 'approved') || null, [data.family_members, userId]);
  return {data, loading, outdated, me, load, reload};
}
