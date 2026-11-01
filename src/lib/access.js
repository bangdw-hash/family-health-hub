// 서버 RLS(fhh_private.can_access)와 동일한 규칙을 화면 표시용으로 재현합니다. 실제 보안은 서버 RLS가 보장합니다.
export function accessFor(member, patient, perms = []) {
  const none = {view: false, create: false, edit: false};
  const all = {view: true, create: true, edit: true};
  if (!member || member.status !== 'approved') return none;
  if (member.role === 'owner') return all;
  const x = perms.find(p => p.patient_id === patient.id && p.user_id === member.user_id);
  if (x) return {view: !!(x.can_view || x.can_create || x.can_edit), create: !!x.can_create, edit: !!x.can_edit};
  if (patient.is_private) return none;
  if (member.default_access === 'edit') return all;
  if (member.default_access === 'view') return {view: true, create: false, edit: false};
  return none;
}
export function canAddPatient(member) { return !!member && member.status === 'approved' && (member.role === 'owner' || member.default_access === 'edit'); }
export function isOwner(member) { return member?.role === 'owner' && member.status === 'approved'; }
export function memberName(members, userId, fallback = '탈퇴한 사용자') {
  if (!userId) return fallback;
  const m = members.find(x => x.user_id === userId);
  return m?.display_name || fallback;
}
