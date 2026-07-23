import { test } from "node:test";
import assert from "node:assert/strict";
import { getCachedAnswer, setCachedAnswer } from "./answerCache.ts";

// TTL 만료(10분)는 실시간 대기 없이 검증할 방법이 없어(모듈이 시계 주입을 받지 않음)
// 이 테스트 파일에서는 다루지 않는다 — 캐시 적중/미스/키 정규화만 검증한다.

function sampleAnswer(overrides: Partial<Parameters<typeof setCachedAnswer>[1]> = {}) {
  return {
    source: "명함신청.txt",
    category: "업무매뉴얼",
    score: 0.8,
    searchMode: "hybrid" as const,
    wasAnswered: true,
    answer: "명함은 총무팀에 신청하세요.",
    ...overrides,
  };
}

test("캐시 미스는 null을 반환한다", () => {
  assert.equal(getCachedAnswer("한 번도 캐싱된 적 없는 질문 " + Math.random()), null);
});

test("캐싱한 질문은 그대로 다시 조회된다", () => {
  const q = "명함 신청 방법 알려줘 (unique-1)";
  setCachedAnswer(q, sampleAnswer());
  const hit = getCachedAnswer(q);
  assert.ok(hit);
  assert.equal(hit.answer, "명함은 총무팀에 신청하세요.");
  assert.equal(hit.source, "명함신청.txt");
});

test("한글 음절 사이 공백 차이는 같은 캐시 항목으로 취급된다", () => {
  // normalize()는 한글 음절 사이 공백만 제거하므로, 공백 유무가 다른 두 질문이
  // 정규화 후 동일한 캐시 키로 수렴하는지 확인한다.
  const base = "명함신청방법유니크넷";
  const spaced = base.split("").join(" "); // "명 함 신 청 방 법 유 니 크 넷"
  setCachedAnswer(base, sampleAnswer({ answer: "answer-for-base" }));
  const hit = getCachedAnswer(spaced);
  assert.ok(hit);
  assert.equal(hit.answer, "answer-for-base");
});

test("다른 질문은 서로 다른 캐시 항목을 갖는다", () => {
  setCachedAnswer("질문 A (unique-3)", sampleAnswer({ answer: "answer-A" }));
  setCachedAnswer("질문 B (unique-3)", sampleAnswer({ answer: "answer-B" }));
  assert.equal(getCachedAnswer("질문 A (unique-3)")?.answer, "answer-A");
  assert.equal(getCachedAnswer("질문 B (unique-3)")?.answer, "answer-B");
});
