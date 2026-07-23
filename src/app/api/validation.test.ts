import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchRequestSchema,
  feedbackRequestSchema,
  manualUploadSchema,
  docUpdateSchema,
  docDeleteSchema,
  qaAnswerSchema,
  DOCUMENT_CATEGORY,
} from "./validation.ts";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

test("searchRequestSchema는 정상 질문을 통과시킨다", () => {
  const parsed = searchRequestSchema.safeParse({ question: "명함 신청 방법 알려줘" });
  assert.ok(parsed.success);
  assert.equal(parsed.data.question, "명함 신청 방법 알려줘");
});

test("searchRequestSchema는 빈 질문을 거부한다", () => {
  assert.equal(searchRequestSchema.safeParse({ question: "   " }).success, false);
});

test("searchRequestSchema는 500자를 초과하는 질문을 거부한다", () => {
  const tooLong = "가".repeat(501);
  assert.equal(searchRequestSchema.safeParse({ question: tooLong }).success, false);
});

test("searchRequestSchema는 history 20개 초과를 거부한다", () => {
  const history = Array.from({ length: 21 }, () => ({ role: "user" as const, text: "안녕" }));
  assert.equal(searchRequestSchema.safeParse({ question: "안녕", history }).success, false);
});

test("searchRequestSchema는 잘못된 role의 history를 거부한다", () => {
  const parsed = searchRequestSchema.safeParse({
    question: "안녕",
    history: [{ role: "admin", text: "안녕" }],
  });
  assert.equal(parsed.success, false);
});

test("feedbackRequestSchema는 1/-1만 허용한다", () => {
  assert.equal(feedbackRequestSchema.safeParse({ log_id: UUID, feedback: 1 }).success, true);
  assert.equal(feedbackRequestSchema.safeParse({ log_id: UUID, feedback: -1 }).success, true);
  assert.equal(feedbackRequestSchema.safeParse({ log_id: UUID, feedback: 0 }).success, false);
  assert.equal(feedbackRequestSchema.safeParse({ log_id: UUID, feedback: 2 }).success, false);
});

test("feedbackRequestSchema는 UUID가 아닌 log_id를 거부한다", () => {
  assert.equal(feedbackRequestSchema.safeParse({ log_id: "not-a-uuid", feedback: 1 }).success, false);
});

test("manualUploadSchema는 알려진 카테고리만 허용한다", () => {
  assert.equal(
    manualUploadSchema.safeParse({ filename: "제목", category: "업무매뉴얼", content: "내용" }).success,
    true
  );
  assert.equal(
    manualUploadSchema.safeParse({ filename: "제목", category: "존재하지않음", content: "내용" }).success,
    false
  );
});

test("manualUploadSchema는 5만자 초과 내용을 거부한다", () => {
  const parsed = manualUploadSchema.safeParse({
    filename: "제목",
    content: "가".repeat(50_001),
  });
  assert.equal(parsed.success, false);
});

test("manualUploadSchema는 category 생략을 허용한다 (라우트에서 기본값 처리)", () => {
  const parsed = manualUploadSchema.safeParse({ filename: "제목", content: "내용" });
  assert.equal(parsed.success, true);
});

test("docUpdateSchema는 id가 UUID가 아니면 거부한다", () => {
  const parsed = docUpdateSchema.safeParse({
    id: "not-a-uuid",
    filename: "제목",
    content: "내용",
  });
  assert.equal(parsed.success, false);
});

test("docDeleteSchema는 UUID id만 통과시킨다", () => {
  assert.equal(docDeleteSchema.safeParse({ id: UUID }).success, true);
  assert.equal(docDeleteSchema.safeParse({ id: "abc" }).success, false);
});

test("qaAnswerSchema는 답변 5000자 초과를 거부한다", () => {
  const parsed = qaAnswerSchema.safeParse({
    question: "질문",
    answer: "가".repeat(5001),
  });
  assert.equal(parsed.success, false);
});

test("DOCUMENT_CATEGORY는 직접답변을 포함하지 않는다 (서버 내부 전용 카테고리)", () => {
  assert.equal(DOCUMENT_CATEGORY.safeParse("직접답변").success, false);
});
