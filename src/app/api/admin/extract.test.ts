import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractText } from "./extract.ts";

// 실제 PDF 바이너리 픽스처 없이도 검증 가능한 경로만 다룬다:
// 확장자 분기, HWPX(ZIP+XML) 파싱, 손상된 입력에 대한 에러 처리.

test("지원하지 않는 확장자는 에러를 반환한다", async () => {
  const result = await extractText("문서.txt", Buffer.from("아무 내용"));
  assert.ok("error" in result);
  assert.ok(result.error.includes(".txt"));
});

test("정상 HWPX(ZIP+XML)에서 본문 텍스트를 추출한다", async () => {
  const zip = new JSZip();
  zip.file(
    "Contents/section0.xml",
    `<?xml version="1.0"?><hp:p><hp:run><hp:t>안녕하세요</hp:t></hp:run></hp:p>`
  );
  zip.file(
    "Contents/section1.xml",
    `<?xml version="1.0"?><hp:p><hp:run><hp:t>두번째 섹션입니다</hp:t></hp:run></hp:p>`
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await extractText("문서.hwpx", buffer);
  assert.ok("text" in result, `추출 실패: ${"error" in result ? result.error : ""}`);
  assert.ok(result.text.includes("안녕하세요"));
  assert.ok(result.text.includes("두번째 섹션입니다"));
  // section0이 section1보다 먼저 오도록 순서가 유지되는지 확인
  assert.ok(result.text.indexOf("안녕하세요") < result.text.indexOf("두번째 섹션입니다"));
});

test("Contents/section*.xml이 없는 HWPX는 에러를 반환한다", async () => {
  const zip = new JSZip();
  zip.file("Preview/PrvText.txt", "미리보기만 있고 본문은 없음");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await extractText("빈문서.hwpx", buffer);
  assert.ok("error" in result);
  assert.ok(result.error.includes("section"));
});

test("깨진 PDF 버퍼는 예외 없이 에러 결과를 반환한다", async () => {
  const result = await extractText("깨진문서.pdf", Buffer.from("이건 PDF가 아님"));
  assert.ok("error" in result);
  assert.ok(result.error.includes("PDF"));
});
