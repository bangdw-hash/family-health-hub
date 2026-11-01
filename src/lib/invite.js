// 패밀리 초대 코드·링크·공유 문구
export function formatCode(code) { return String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/(.{6})(?=.)/g, '$1-'); }
export function normalizeCode(code) { return String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
export function inviteLink(code, base) {
  const origin = base || (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return origin + '?join=' + encodeURIComponent(normalizeCode(code));
}
export function inviteMessage(familyName, code, base) {
  return `[Family Health Hub] '${familyName}' 가족 건강 관리에 초대합니다.\n\n1) 아래 링크를 열고 회원가입 또는 로그인합니다.\n${inviteLink(code, base)}\n\n2) 이름과 관계를 입력해 가입을 신청하면 관리자가 승인합니다.\n(링크가 열리지 않으면 코드 ${formatCode(code)} 를 직접 입력하십시오.)`;
}
export function readJoinParam(search = typeof location !== 'undefined' ? location.search : '') {
  const v = new URLSearchParams(search).get('join');
  return v ? normalizeCode(v) : '';
}
