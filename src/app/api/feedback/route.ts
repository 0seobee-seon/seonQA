import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "../rateLimit";
import { supabaseAdmin } from "../supabaseAdmin";

const FEEDBACK_RATE_LIMIT = 30;
const FEEDBACK_RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`feedback:${ip}`, FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const { log_id, feedback } = await req.json();
  if (!log_id || ![1, -1].includes(feedback)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("query_logs")
    .update({ feedback })
    .eq("id", log_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
