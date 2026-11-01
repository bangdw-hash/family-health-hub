// 서버·네트워크 오류를 사용자에게 보여줄 한글 안내로 변환합니다.
export function friendlyError(error) {
  const code = error?.code || '';
  const msg = String(error?.message || error || '');
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|network request failed/i.test(msg)) return '네트워크에 연결되어 있지 않습니다. 연결을 확인한 뒤 다시 시도하십시오.';
  if (/row-level security|violates row-level|42501|permission denied/i.test(code + ' ' + msg)) return '이 작업을 수행할 권한이 없습니다. 관리자에게 권한을 요청하십시오.';
  if (/Invalid family code/i.test(msg)) return '유효하지 않은 패밀리 코드입니다. 코드를 다시 확인하거나 관리자에게 새 코드를 요청하십시오.';
  if (/Already a member/i.test(msg)) return '이미 이 패밀리의 구성원입니다.';
  if (/Not permitted/i.test(msg)) return '관리자만 수행할 수 있는 작업입니다.';
  if (/At least one owner/i.test(msg)) return '관리자가 최소 1명 필요합니다. 다른 구성원을 먼저 관리자로 지정하십시오.';
  if (/Up to two owners/i.test(msg)) return '관리자는 최대 2명까지 지정할 수 있습니다.';
  if (/Transfer ownership/i.test(msg)) return '다른 구성원이 있는 패밀리의 유일한 관리자입니다. 다른 구성원을 관리자로 지정한 뒤 다시 시도하십시오.';
  if (/Only an owner may/i.test(msg)) return '환자 삭제와 비공개 설정은 관리자만 변경할 수 있습니다.';
  if (code === '23505' || /duplicate key|unique/i.test(msg)) return '이미 처리된 항목입니다. 화면을 새로고침해 최신 상태를 확인하십시오.';
  if (code === '23503') return '연결된 데이터가 없어 저장할 수 없습니다. 새로고침 후 다시 시도하십시오.';
  if (/JWT expired|invalid.*token|not authenticated|Authentication required/i.test(msg)) return '로그인이 만료되었습니다. 다시 로그인하십시오.';
  if (/Payload too large|exceeded the maximum allowed size/i.test(msg)) return '파일이 너무 큽니다(최대 10MB).';
  if (/mime type/i.test(msg)) return '지원하지 않는 파일 형식입니다. JPG, PNG, WEBP, HEIC, PDF만 올릴 수 있습니다.';
  return msg ? '요청을 처리하지 못했습니다. (' + msg.slice(0, 120) + ')' : '요청을 처리하지 못했습니다.';
}
export function isSchemaOutdated(error) {
  const code = error?.code || '', msg = String(error?.message || '');
  return code === '42703' || code === 'PGRST204' || code === 'PGRST202' || code === '42P01' || code === 'PGRST205' ||
    /column .* does not exist|Could not find the .* column|Could not find the function|relation .* does not exist|schema cache/i.test(msg);
}
export function authMessage(error) {
  const code = error?.code || '';
  const msg = error?.message || '';
  if (code === 'invalid_credentials' || /Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다. 기존 계정이라면 로그인하고, 비밀번호를 잊었다면 아래 비밀번호 재설정 기능을 이용하십시오.';
  if (code === 'email_not_confirmed' || /Email not confirmed/i.test(msg)) return '이메일 인증이 완료되지 않았습니다. 받은편지함과 스팸함에서 인증 메일을 확인하십시오.';
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) return '요청이 너무 많습니다. 잠시 후 다시 시도하십시오.';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정하십시오.';
  if (code === 'weak_password' || /Password should be/i.test(msg)) return '비밀번호가 너무 약합니다. 8자 이상으로 설정하십시오.';
  return msg ? friendlyError(error) : '요청 처리 중 오류가 발생했습니다.';
}
