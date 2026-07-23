import { z } from "zod";

// chunking.ts의 SPLIT_STRATEGY 키와 일치해야 한다. "직접답변"은 qa/route.ts가
// 서버 내부에서만 지정하는 카테고리라 사용자 입력 스키마에는 포함하지 않는다.
export const DOCUMENT_CATEGORY = z.enum(["규정정책", "업무매뉴얼", "조직연락처", "사내양식", "기타"]);

const historyItemSchema = z.object({
  role: z.enum(["user", "bot"]),
  text: z.string().max(2000),
});

export const searchRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(historyItemSchema).max(20).optional(),
});

export const feedbackRequestSchema = z.object({
  log_id: z.string().uuid(),
  feedback: z.union([z.literal(1), z.literal(-1)]),
});

export const manualUploadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  category: DOCUMENT_CATEGORY.optional(),
  content: z.string().trim().min(1).max(50_000),
});

export const docUpdateSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().trim().min(1).max(200),
  category: DOCUMENT_CATEGORY.optional(),
  content: z.string().trim().min(1).max(50_000),
});

export const docDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const qaAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(5_000),
  log_id: z.string().uuid().optional(),
});
