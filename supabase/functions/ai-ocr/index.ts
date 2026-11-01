// Supabase Edge Function: 병원 예약 안내(이미지·텍스트) → 구조화 데이터(AI OCR).
// 관리자가 앱에서 등록한 AI 공급자/키/모델을 패밀리 전원이 같은 채널로 사용합니다. 키는 Vault에 암호화 저장되며 이 함수만 읽습니다.
// 배포: supabase functions deploy ai-ocr --no-verify-jwt   (호출자 인증은 코드에서 getUser 로 직접 검증)
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {handleAiRequest} from '../_shared/ocr.js';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
Deno.serve(req => handleAiRequest(req, {
  getUser: async (token: string) => { const {data, error} = await admin.auth.getUser(token); return error || !data.user ? null : {id: data.user.id}; },
  getConfig: async (family: string, user: string) => { const {data, error} = await admin.rpc('ai_config_for_ocr', {p_family: family, p_user: user}); if (error) throw error; return data; },
  logUsage: async (family: string, user: string, kind: string, ok: boolean, err: string | null) => { await admin.rpc('log_ai_usage', {p_family: family, p_user: user, p_kind: kind, p_ok: ok, p_error: err}); },
}));
