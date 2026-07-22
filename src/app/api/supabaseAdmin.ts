import { createClient } from "@supabase/supabase-js";

// 서버(Next.js API 라우트) 전용. service_role 키는 RLS를 우회하므로
// 절대 클라이언트 번들에 노출되면 안 된다 — NEXT_PUBLIC_ 접두사를 쓰지 않는다.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
