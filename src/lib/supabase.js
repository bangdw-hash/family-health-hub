import {createClient} from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const fake = import.meta.env.VITE_FAKE_BACKEND === '1';
export const configured = fake || Boolean(url && key && !url.includes('YOUR_PROJECT_REF'));
// VITE_FAKE_BACKEND는 로컬 화면 검증 전용입니다. 운영 빌드에서는 이 분기가 제거됩니다.
export const supabase = fake
  ? (await import('../dev/fakeSupabase.js')).createFakeSupabase()
  : configured ? createClient(url, key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}}) : null;
