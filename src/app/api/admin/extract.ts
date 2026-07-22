import { PDFParse } from "pdf-parse";
import JSZip from "jszip";

export type ExtractResult = { text: string } | { error: string };

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    // result.text는 페이지 사이에 "-- N of M --" 구분자가 섞여 들어가므로,
    // 페이지별 텍스트를 직접 이어붙여 순수 본문만 남긴다.
    const text = result.pages.map((p) => p.text.trim()).filter(Boolean).join("\n\n");
    return { text };
  } catch (e) {
    return { error: `PDF 추출 실패: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    await parser.destroy();
  }
}

// HWPX = ZIP + XML. scripts/extract_text.py의 extract_hwpx()와 동일한 방식:
// Contents/section*.xml 을 순서대로 읽어 <hp:t> 텍스트 노드만 추출한다.
async function extractHwpx(buffer: Buffer): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const sectionNames = Object.keys(zip.files)
      .filter((name) => /^Contents\/section\d+\.xml$/.test(name))
      .sort();

    if (sectionNames.length === 0) {
      return { error: "HWPX 내에서 본문(Contents/section*.xml)을 찾지 못했습니다." };
    }

    const lines: string[] = [];
    for (const name of sectionNames) {
      const xml = await zip.files[name].async("string");
      const matches = xml.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g);
      for (const m of matches) {
        if (m[1]) lines.push(m[1]);
      }
    }
    return { text: lines.join("\n").trim() };
  } catch (e) {
    return { error: `HWPX 추출 실패: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function extractText(filename: string, buffer: Buffer): Promise<ExtractResult> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return extractPdf(buffer);
  if (ext === "hwpx") return extractHwpx(buffer);
  return { error: `지원하지 않는 파일 형식입니다: .${ext} (PDF, HWPX만 지원)` };
}
