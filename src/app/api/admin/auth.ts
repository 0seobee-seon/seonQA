import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isRateLimited } from "../rateLimit";

const ADMIN_RATE_LIMIT = 10;
const ADMIN_RATE_WINDOW_MS = 60_000;

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ponytail: console logging is the audit trail for now — there's no admin-user table
// to attach a real actor to. Upgrade to a DB-backed audit log once per-account auth exists.
export function checkAdminAuth(req: NextRequest, action: string): NextResponse | null {
  const ip = getClientIp(req);

  if (isRateLimited(`admin:${ip}`, ADMIN_RATE_LIMIT, ADMIN_RATE_WINDOW_MS)) {
    console.warn(`[ADMIN AUDIT] rate_limited ip=${ip} action=${action}`);
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const provided = req.headers.get("x-admin-password") ?? "";
  const expected = process.env.ADMIN_PASSWORD ?? "";
  const ok = expected.length > 0 && safeCompare(provided, expected);

  if (!ok) {
    console.warn(`[ADMIN AUDIT] auth_failed ip=${ip} action=${action}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.info(`[ADMIN AUDIT] ${action} ip=${ip}`);
  return null;
}
