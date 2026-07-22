import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "../auth";
import { supabaseAdmin } from "../../supabaseAdmin";
import { generateEmbedding } from "../embedding";

// 미응답 질문 목록 조회
export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req, "qa:view");
  if (authError) return authError;

  const supabase = supabaseAdmin();

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
  const authError = checkAdminAuth(req, "qa:answer");
  if (authError) return authError;

  const { question, answer, log_id } = await req.json();
  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: "질문과 답변을 입력해 주세요." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

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
