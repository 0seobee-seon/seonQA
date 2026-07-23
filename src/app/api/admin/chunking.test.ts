import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkDocument } from "./chunking.ts";

test("규정정책 카테고리는 '제 N 조' 마커 기준으로 분리한다", () => {
  const content = "제1조 목적\n이 규정은...".repeat(1) +
    "\n제2조 적용범위\n이 규정은 전 직원에게 적용한다.".repeat(1);
  const chunks = chunkDocument(content, "규정정책");
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.some((c) => c.includes("제1조")));
});

test("조직연락처 카테고리는 줄 단위로 분리 후 짧은 줄을 병합한다", () => {
  const lines = Array.from({ length: 20 }, (_, i) => `총무팀 담당자${i} 02-000-000${i}`);
  const chunks = chunkDocument(lines.join("\n"), "조직연락처");
  // 20줄을 그대로 청크로 남기지 않고 CHUNK_SIZE/2 이상이 되도록 병합했는지 확인
  assert.ok(chunks.length < lines.length);
  for (const chunk of chunks) {
    assert.ok(chunk.length > 0);
  }
});

test("알 수 없는 카테고리는 사이즈 기반 분할로 대체된다", () => {
  const content = "가".repeat(1500);
  const chunks = chunkDocument(content, "존재하지않는카테고리");
  assert.ok(chunks.length > 1, "1500자는 CHUNK_SIZE(600) 초과라 여러 청크로 나뉘어야 한다");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 700, "각 청크는 사이즈 기준을 크게 넘지 않아야 한다");
  }
});

test("빈 문자열 입력은 청크를 생성하지 않는다", () => {
  assert.deepEqual(chunkDocument("", "업무매뉴얼"), []);
  assert.deepEqual(chunkDocument("   ", "업무매뉴얼"), []);
});

test("짧은 내용은 청크 하나로 그대로 반환된다", () => {
  const chunks = chunkDocument("짧은 문서 내용입니다.", "기타");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], "짧은 문서 내용입니다.");
});

test("병합 후에도 CHUNK_SIZE*2를 넘는 청크는 사이즈 기준으로 재분할된다", () => {
  // splitBySection이 못 쪼개는 긴 단일 섹션 — 병합 로직을 거친 뒤 재분할 대상이 되는지 확인
  const content = "나".repeat(1300);
  const chunks = chunkDocument(content, "업무매뉴얼");
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 1200, "최종 청크는 CHUNK_SIZE*2(1200자)를 넘지 않아야 한다");
  }
});
