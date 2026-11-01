// 쓰기 작업 모음. 서버 RLS가 최종 권한을 판단하며, 여기서는 오류를 던져 호출 측이 한글 안내로 변환합니다.
import {supabase} from './supabase.js';
import {todayStr} from './format.js';
import {safeFileName} from './image.js';

const must = ({error}) => { if (error) throw error; };
export const newId = () => crypto.randomUUID();

export function makeApi({familyId, userId, reload}) {
  const insert = async (table, payload) => { const id = payload.id || newId(); must(await supabase.from(table).insert({...payload, id, family_id: familyId})); reload(table); return id; };
  const update = async (table, id, patch) => {
    const {data, error} = await supabase.from(table).update(patch).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('row-level security: no rows updated');
    reload(table);
  };
  return {
    insert, update, reloadAll: () => reload(),
    trash: (table, id) => update(table, id, {deleted_at: new Date().toISOString()}),
    restore: (table, id) => update(table, id, {deleted_at: null}),
    async markTaken(med, date, slot) {
      must(await supabase.from('med_intakes').insert({family_id: familyId, patient_id: med.patient_id, medication_id: med.id, scheduled_date: date, slot, taken_by: userId, status: 'taken'}));
      reload('med_intakes');
    },
    async unmarkTaken(id) { must(await supabase.from('med_intakes').delete().eq('id', id)); reload('med_intakes'); },
    async setPermission(patientId, targetUser, perm) {
      if (perm === null) must(await supabase.from('patient_permissions').delete().eq('patient_id', patientId).eq('user_id', targetUser));
      else must(await supabase.from('patient_permissions').upsert({family_id: familyId, patient_id: patientId, user_id: targetUser, ...perm}, {onConflict: 'patient_id,user_id'}));
      reload('patient_permissions');
    },
    async uploadAttachment({patientId, file, kind, recordId, appointmentId}) {
      const path = `${familyId}/${patientId}/${newId()}-${safeFileName(file.name)}`;
      must(await supabase.storage.from('fhh-attachments').upload(path, file, {contentType: file.type || 'application/octet-stream', upsert: false}));
      const {error} = await supabase.from('attachments').insert({id: newId(), family_id: familyId, patient_id: patientId, kind, file_name: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size, created_by: userId, record_id: recordId || null, appointment_id: appointmentId || null});
      if (error) { await supabase.storage.from('fhh-attachments').remove([path]); throw error; }
      reload('attachments');
    },
    async signedUrl(path, seconds = 300) { const {data, error} = await supabase.storage.from('fhh-attachments').createSignedUrl(path, seconds); if (error) throw error; return data.signedUrl; },
    async downloadFile(path) { const {data, error} = await supabase.storage.from('fhh-attachments').download(path); if (error) throw error; return new Uint8Array(await data.arrayBuffer()); },
    async removeFiles(paths) { if (paths.length) must(await supabase.storage.from('fhh-attachments').remove(paths)); },
    async rpc(name, args) { const {data, error} = await supabase.rpc(name, args); if (error) throw error; return data; },
    /** 휴지통에 30일(기본) 이상 있던 항목을 영구 삭제합니다. 관리자만 가능하며 하루 1회만 자동 실행합니다. */
    async purgeTrash(days, attachments) {
      const cutoff = Date.now() - days * 86400000;
      const files = attachments.filter(a => a.deleted_at && new Date(a.deleted_at).getTime() <= cutoff).map(a => a.storage_path);
      await this.removeFiles(files).catch(() => {});
      const n = await this.rpc('empty_trash', {p_family: familyId, p_days: days});
      reload(); return n;
    },
  };
}
export function shouldAutoPurge(familyId) {
  try { const k = 'fhh:purged:' + familyId; if (localStorage.getItem(k) === todayStr()) return false; localStorage.setItem(k, todayStr()); return true; } catch { return false; }
}
