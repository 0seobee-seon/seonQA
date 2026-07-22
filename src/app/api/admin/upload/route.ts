import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "../auth";
import { supabaseAdmin } from "../../supabaseAdmin";

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

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req, "upload");
  if (authError) return authError;

  const { filename, category, content } = await req.json();
  if (!filename?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // 1. 문서 삽입
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({ filename: filename.trim(), category: category ?? "업무매뉴얼", content: content.trim() })
    .select()
    .single();

  if (insertError || !doc) {
    return NextResponse.json({ error: insertError?.message ?? "삽입 실패" }, { status: 500 });
  }

  // 2. 임베딩 생성 및 저장
  const embedding = await generateEmbedding(content);
  if (embedding) {
    await supabase.from("documents").update({ embedding }).eq("id", doc.id);
  }

  return NextResponse.json({ ok: true, id: doc.id, embedded: !!embedding });
}
