/**
 * 기존 documents 테이블의 모든 문서에 임베딩을 생성해서 저장
 * 실행: node scripts/embed-documents.mjs
 *
 * 필요 환경변수 (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (또는 SUPABASE_SERVICE_ROLE_KEY 권장)
 *   GOOGLE_AI_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 수동 파싱 (dotenv 없이)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) {
        process.env[key.trim()] = rest.join("=").trim();
      }
    }
  } catch {
    console.log(".env.local not found, using existing env vars");
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ SUPABASE_URL 또는 SUPABASE_KEY가 없습니다.");
  process.exit(1);
}
if (!GOOGLE_AI_API_KEY) {
  console.error("❌ GOOGLE_AI_API_KEY가 없습니다. .env.local에 추가해 주세요.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getEmbedding(text) {
  const truncated = text.slice(0, 8000);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: truncated }] },
        outputDimensionality: 768,
      }),
    }
  );
  const data = await res.json();
  if (!data.embedding?.values) throw new Error(JSON.stringify(data));
  return data.embedding.values; // 768차원
}

async function main() {
  console.log("📥 Supabase에서 문서 목록 조회...");
  // embedding이 없는 문서만 조회 (이미 있는 건 건너뜀)
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, content")
    .is("embedding", null);

  if (error) {
    console.error("❌ 문서 조회 실패:", error.message);
    process.exit(1);
  }

  console.log(`✅ 총 ${docs.length}개 문서 발견\n`);

  let success = 0;
  let skipped = 0;

  for (const doc of docs) {
    if (!doc.content?.trim()) {
      console.log(`⚠️  [${doc.id}] ${doc.filename} — content 없음, 건너뜀`);
      skipped++;
      continue;
    }

    try {
      const embedding = await getEmbedding(doc.content);

      const { error: updateError } = await supabase
        .from("documents")
        .update({ embedding })
        .eq("id", doc.id);

      if (updateError) {
        console.error(`❌ [${doc.id}] ${doc.filename} — 저장 실패:`, updateError.message);
      } else {
        console.log(`✅ [${doc.id}] ${doc.filename} — 임베딩 저장 완료 (768차원)`);
        success++;
      }

      // Rate limit 방지 (3초 대기)
      await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.error(`❌ [${doc.id}] ${doc.filename} — 임베딩 생성 실패:`, e.message);
    }
  }

  console.log(`\n🏁 완료: 성공 ${success}개, 건너뜀 ${skipped}개`);
}

main();
