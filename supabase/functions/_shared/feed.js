// 캘린더 구독(.ics) 요청 처리. 인증 대신 추측 불가능한 토큰(64자 16진수)을 사용합니다.
import {buildIcs} from './ics.js';
export const TOKEN_RE = /^[0-9a-f]{64}$/;
export function tokenFromUrl(url) {
  const u = new URL(url), seg = u.pathname.split('/').filter(Boolean).pop() || '';
  return (u.searchParams.get('t') || seg).replace(/\.ics$/i, '').toLowerCase();
}
/** fetchData(token) → feed jsonb 또는 null. 반환: Response */
export async function handleFeedRequest(req, fetchData) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', {status: 405});
  const token = tokenFromUrl(req.url);
  if (!TOKEN_RE.test(token)) return new Response('Not found', {status: 404});
  let data = null;
  try { data = await fetchData(token); } catch { return new Response('Temporarily unavailable', {status: 503}); }
  if (!data) return new Response('Not found', {status: 404});
  const body = buildIcs({calName: data.calName, patients: data.patients, appointments: data.appointments, medications: data.medications, options: data.options});
  return new Response(req.method === 'HEAD' ? null : body, {status: 200, headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="family-health-hub.ics"', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
  }});
}
