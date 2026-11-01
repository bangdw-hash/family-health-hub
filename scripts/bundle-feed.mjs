// 엣지 함수를 파일 1개로 묶어 Supabase 대시보드 편집기에 붙여넣을 수 있게 합니다. (CLI 배포 시에는 필요 없음)
// 실행: npm run bundle:feed  → deploy/calendar-feed.single.ts
import {build} from 'esbuild';
await build({entryPoints: ['supabase/functions/calendar-feed/index.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', external: ['jsr:*'], outfile: 'deploy/calendar-feed.single.ts', legalComments: 'none', banner: {js: '// 자동 생성 파일 — 수정하지 마십시오. 원본: supabase/functions/calendar-feed, supabase/functions/_shared (npm run bundle:feed)'}});
console.log('deploy/calendar-feed.single.ts 생성');
