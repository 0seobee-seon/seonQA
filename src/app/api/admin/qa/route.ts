import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.ADMIN_GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: text.slice(0, 8000) }] },
          outputDimensionality: 768,
        }),
      }
    );
    const data = await res.json();
    return data.embedding?.values ?? null;
  } catch {
    return null;
  }
}

// 미응답 질문 목록 조회
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("query_logs")
    .select("id, question, created_at")
    .eq("was_answered", false)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// 미응답 질문에 답변 등록 → documents 테이블에 삽입 후 임베딩 생성
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, answer, log_id } = await req.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: "질문과 답변을 입력해 주세요." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const content = `[자주 묻는 질문]\n질문: ${question.trim()}\n\n답변: ${answer.trim()}`;

  // documents 테이블에 삽입
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      filename: question.trim().slice(0, 80),
      category: "직접답변",
      content,
    })
    .select()
    .single();

  if (insertError || !doc) {
    return NextResponse.json({ error: insertError?.message ?? "삽입 실패" }, { status: 500 });
  }

  // 임베딩 생성
  const embedding = await generateEmbedding(content);
  if (embedding) {
    await supabase.from("documents").update({ embedding }).eq("id", doc.id);
  }

  // 해당 query_log 를 answered 로 표시
  if (log_id) {
    await supabase
      .from("query_logs")
      .update({ was_answered: true, answer })
      .eq("id", log_id);
  }

  return NextResponse.json({ ok: true, id: doc.id, embedded: !!embedding });
}
