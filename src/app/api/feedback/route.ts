import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "../rateLimit";
import { supabaseAdmin } from "../supabaseAdmin";
import { feedbackRequestSchema } from "../validation";

const FEEDBACK_RATE_LIMIT = 30;
const FEEDBACK_RATE_WINDOW_MS = 60_000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`feedback:${ip}`, FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const parsed = feedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { log_id, feedback } = parsed.data;

  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("query_logs")
    .update({ feedback })
    .eq("id", log_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
