import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "../auth";
import { supabaseAdmin } from "../../supabaseAdmin";
import { generateEmbedding } from "../embedding";
import { extractText } from "../extract";
import { chunkDocument } from "../chunking";
import { DOCUMENT_CATEGORY } from "../../validation";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req, "upload-file");
  if (authError) return authError;

  const formData = await req.formData();
  const file = formData.get("file");
  const categoryRaw = formData.get("category");
  const categoryParsed =
    categoryRaw === null || categoryRaw === ""
      ? { success: true as const, data: "업무매뉴얼" as const }
      : DOCUMENT_CATEGORY.safeParse(categoryRaw);
  if (!categoryParsed.success) {
    return NextResponse.json({ error: "잘못된 카테고리입니다." }, { status: 400 });
  }
  const category = categoryParsed.data;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "빈 파일입니다." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다. (최대 15MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extracted = await extractText(file.name, buffer);
  if ("error" in extracted) {
    return NextResponse.json({ error: extracted.error }, { status: 400 });
  }
  if (!extracted.text.trim()) {
    return NextResponse.json({ error: "파일에서 텍스트를 추출하지 못했습니다. (스캔 이미지 PDF는 지원하지 않습니다)" }, { status: 400 });
  }

  const chunks = chunkDocument(extracted.text, category);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "청크를 생성하지 못했습니다." }, { status: 400 });
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
  const supabase = supabaseAdmin();

  let embedded = 0;
  const ids: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const filename = chunks.length > 1 ? `${baseName}_${String(i).padStart(3, "0")}` : baseName;
    const embedding = await generateEmbedding(chunks[i]);
    if (embedding) embedded++;

    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({ filename, category, content: chunks[i], ...(embedding ? { embedding } : {}) })
      .select("id")
      .single();

    if (insertError || !doc) {
      return NextResponse.json({
        error: `${i + 1}/${chunks.length}번째 청크 저장 실패: ${insertError?.message ?? "알 수 없는 오류"}`,
        partial: { savedChunks: ids.length, totalChunks: chunks.length },
      }, { status: 500 });
    }
    ids.push(doc.id);
  }

  return NextResponse.json({
    ok: true,
    filename: baseName,
    category,
    chunks: chunks.length,
    embedded,
  });
}
