import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSnippet, keywordScore, normalize, tokenize } from "./searchUtils.ts";

test("tokenize drops stopwords and short tokens", () => {
  const tokens = tokenize("명함 신청 방법 알려줘");
  assert.deepEqual(tokens, ["명함", "신청"]);
});

test("tokenize keeps meaningful multi-char tokens", () => {
  const tokens = tokenize("4대보험 관련 문의드립니다");
  assert.ok(tokens.includes("4대보험"));
});

test("normalize collapses spaces between Korean syllables", () => {
  assert.equal(normalize("명 함 신청"), "명함신청");
});

test("normalize leaves non-Korean spacing untouched", () => {
  assert.equal(normalize("IT 기기 신청"), "IT 기기신청");
});

test("keywordScore weights filename matches higher than content matches", () => {
  const filenameMatch = keywordScore(["명함"], "명함신청.txt", "본문 내용");
  const contentMatch = keywordScore(["명함"], "파일.txt", "명함 신청 절차");
  assert.ok(filenameMatch > contentMatch);
});

test("keywordScore returns 0 when no token matches", () => {
  assert.equal(keywordScore(["휴가"], "명함.txt", "명함 신청 절차"), 0);
});

test("extractSnippet returns a window around the matched token", () => {
  const content = "가".repeat(80) + "명함신청" + "나".repeat(80);
  const snippet = extractSnippet(["명함신청"], content);
  assert.ok(snippet.includes("명함신청"));
});

test("extractSnippet falls back to the normalized head of content when no token matches", () => {
  const content = "관련 없는 내용입니다.";
  assert.equal(extractSnippet(["없는토큰"], content), normalize(content));
});
