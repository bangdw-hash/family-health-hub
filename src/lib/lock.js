// 기기 단위 앱 잠금(PIN). PIN은 PBKDF2(SHA-256)로 해시해 이 기기의 localStorage에만 저장합니다. 서버로 전송하지 않습니다.
const KEY = 'fhh:lock', TRY = 'fhh:lock-tries';
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
async function derive(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter}, key, 256));
}
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
export const hasPin = () => !!read()?.hash;
export const autoLockMinutes = () => read()?.minutes ?? 5;
export function setAutoLockMinutes(minutes) { const c = read(); if (c) localStorage.setItem(KEY, JSON.stringify({...c, minutes})); }
export async function setPin(pin, minutes = 5) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN은 숫자 4~8자리여야 합니다.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 150000;
  localStorage.setItem(KEY, JSON.stringify({salt: hex(salt), iter, hash: await derive(pin, salt, iter), minutes}));
  localStorage.removeItem(TRY);
}
export function clearPin() { localStorage.removeItem(KEY); localStorage.removeItem(TRY); }
export function lockedOutSeconds(now = Date.now()) {
  try { const t = JSON.parse(localStorage.getItem(TRY)); return t?.until > now ? Math.ceil((t.until - now) / 1000) : 0; } catch { return 0; }
}
/** 5회 연속 실패 시 30초씩 대기 시간이 늘어납니다. */
export async function verifyPin(pin, now = Date.now()) {
  if (lockedOutSeconds(now) > 0) return false;
  const c = read(); if (!c) return true;
  const ok = (await derive(pin, unhex(c.salt), c.iter)) === c.hash;
  if (ok) { localStorage.removeItem(TRY); return true; }
  let t = {}; try { t = JSON.parse(localStorage.getItem(TRY)) || {}; } catch {}
  const count = (t.count || 0) + 1;
  localStorage.setItem(TRY, JSON.stringify({count, until: count % 5 === 0 ? now + 30000 * (count / 5) : 0}));
  return false;
}
