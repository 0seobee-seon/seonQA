import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "../auth";
import { supabaseAdmin } from "../../supabaseAdmin";
import { generateEmbedding } from "../embedding";
import { manualUploadSchema } from "../../validation";

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req, "upload");
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = manualUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "제목과 내용을 확인해 주세요. (제목 200자/내용 5만자 이내)" }, { status: 400 });
  }
  const { filename, category, content } = parsed.data;

  const supabase = supabaseAdmin();

  // 1. 문서 삽입
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({ filename, category: category ?? "업무매뉴얼", content })
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
