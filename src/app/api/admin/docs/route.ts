import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "../auth";
import { supabaseAdmin as supabaseClient } from "../../supabaseAdmin";
import { generateEmbedding } from "../embedding";
import { docUpdateSchema, docDeleteSchema } from "../../validation";

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req, "docs:view");
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // 수정 화면에서 문서 하나의 전체 내용을 불러올 때 사용
  if (id) {
    const { data, error } = await supabaseClient()
      .from("documents")
      .select("id, filename, category, content")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "문서를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ doc: data });
  }

  const category = searchParams.get("category");
  const search = searchParams.get("search");

  let query = supabaseClient()
    .from("documents")
    .select("id, filename, category, created_at, embedding")
    .order("created_at", { ascending: false })
    .limit(200);

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // embedding 필드 제거하고 has_embedding 플래그만 남김
  let docs = (data ?? []).map(({ embedding, ...rest }) => ({
    ...rest,
    has_embedding: !!embedding,
  }));

  if (search) {
    const s = search.toLowerCase();
    docs = docs.filter((d) => d.filename.toLowerCase().includes(s));
  }

  return NextResponse.json({ docs });
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminAuth(req, "docs:update");
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = docUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "제목과 내용을 확인해 주세요. (제목 200자/내용 5만자 이내)" }, { status: 400 });
  }
  const { id, filename, category, content } = parsed.data;

  const embedding = await generateEmbedding(content);

  const { error } = await supabaseClient()
    .from("documents")
    .update({
      filename,
      category: category ?? "업무매뉴얼",
      content,
      ...(embedding ? { embedding } : {}),
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, embedded: !!embedding });
}

export async function DELETE(req: NextRequest) {
  const authError = checkAdminAuth(req, "docs:delete");
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = docDeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "id 필요" }, { status: 400 });

  const { error } = await supabaseClient().from("documents").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
