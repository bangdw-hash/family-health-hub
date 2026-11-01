// Supabase Edge Function: 가족 진료·복약 일정을 iCalendar 구독 피드로 제공합니다.
// 배포: supabase functions deploy calendar-feed --no-verify-jwt   (구글 캘린더는 인증 헤더 없이 가져오므로 JWT 검증을 끕니다)
// 접근 권한은 DB 함수 calendar_feed_data(토큰)가 판단합니다. 서비스 롤 키는 사용하지 않습니다.
import {createClient} from 'jsr:@supabase/supabase-js@2';
import {handleFeedRequest} from '../_shared/feed.js';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {auth: {persistSession: false}});
Deno.serve(req => handleFeedRequest(req, async token => {
  const {data, error} = await supabase.rpc('calendar_feed_data', {p_token: token});
  if (error) throw error;
  return data;
}));
