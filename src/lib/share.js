// 카카오톡·시스템 공유, 외부 링크 열기, 파일 내려받기. 앱 키가 없으면 시스템 공유창 → 클립보드 순으로 대체합니다.
import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
import {Browser} from '@capacitor/browser';
import {fmtDate, fmtTime} from './format.js';

const KAKAO_KEY = import.meta.env?.VITE_KAKAO_JS_KEY || '';
const KAKAO_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
const KAKAO_SRI = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka';
export const isNative = () => Capacitor.isNativePlatform();
export const kakaoConfigured = () => !!KAKAO_KEY;

let loading = null;
function loadKakao() {
  if (window.Kakao?.isInitialized?.()) return Promise.resolve(window.Kakao);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = KAKAO_SRC; s.integrity = KAKAO_SRI; s.crossOrigin = 'anonymous';
    s.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY); resolve(window.Kakao); } catch (e) { loading = null; reject(e); } };
    s.onerror = () => { loading = null; reject(new Error('Kakao SDK load failed')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** 카카오톡 텍스트 템플릿은 200자 제한이 있어 줄 단위로 줄이고 생략 건수를 표시합니다. */
export function clipLines(text, max = 200) {
  if (text.length <= max) return text;
  const lines = text.split('\n'); const out = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const rest = lines.length - i, tail = `\n…외 ${rest}줄`;
    if (len + lines[i].length + 1 + tail.length > max) return out.join('\n') + tail;
    out.push(lines[i]); len += lines[i].length + 1;
  }
  return out.join('\n');
}

export function apptShareText(a, patientName, companionName) {
  return [`[진료 일정] ${patientName}님`, `${fmtDate(a.visit_date, true)} ${fmtTime(a.visit_time) || '시간 미정'}`, `${a.hospital}${a.department ? ' ' + a.department : ''}`, `동행: ${companionName || '미정'}`].join('\n');
}
/** items: [{patient, med, slot, by}] — by가 있으면 복용 확인됨 */
export function medShareText(date, items) {
  const L = [`[복약 현황] ${fmtDate(date, true)}`], byPatient = new Map();
  for (const i of items) { if (!byPatient.has(i.patient)) byPatient.set(i.patient, []); byPatient.get(i.patient).push(i); }
  for (const [p, list] of byPatient) {
    L.push(p + '님');
    for (const i of list) L.push(`${i.by ? '✓' : '·'} ${i.slot === 'any' ? '하루' : i.slot} ${i.med}${i.by ? ` (${i.by})` : ' — 미확인'}`);
  }
  if (!items.length) L.push('오늘 확인할 복약이 없습니다.');
  return L.join('\n');
}

/** 반환: 'kakao' | 'system' | 'copy' */
export async function shareText({text, url}) {
  if (isNative()) { await Share.share({text, url, dialogTitle: '공유'}); return 'system'; }
  if (kakaoConfigured()) {
    try {
      const K = await loadKakao();
      K.Share.sendDefault({objectType: 'text', text: clipLines(text, 200), link: {mobileWebUrl: url, webUrl: url}, buttonTitle: '앱에서 보기'});
      return 'kakao';
    } catch { /* 아래 대체 경로 */ }
  }
  if (navigator.share) { try { await navigator.share({text, url}); return 'system'; } catch (e) { if (e?.name === 'AbortError') return 'system'; } }
  await navigator.clipboard.writeText(text + '\n' + url);
  return 'copy';
}

export async function openExternal(url) {
  if (isNative()) return Browser.open({url});
  // noopener 로 연 창은 window.open 이 항상 null 을 돌려주므로 앵커 클릭으로 새 탭을 엽니다(현재 화면은 유지).
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}
export function downloadText(filename, text, mime = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type: mime})), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const appUrl = () => location.origin + location.pathname;
