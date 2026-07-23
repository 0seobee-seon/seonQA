export type Stats = {
  summary: {
    total: number;
    today: number;
    unanswered: number;
    goodFeedback: number;
    badFeedback: number;
    docCount: number;
  };
  topQuestions: { question: string; count: number }[];
  categoryStats: { category: string; count: number }[];
  recentLogs: {
    id: string;
    question: string;
    was_answered: boolean;
    feedback: number | null;
    created_at: string;
    source_category: string | null;
    score: number | null;
    search_mode: string | null;
  }[];
  unansweredList: { id: string; question: string; created_at: string }[];
};

export type Doc = {
  id: string;
  filename: string;
  category: string;
  created_at: string;
  has_embedding: boolean;
};

export type UnansweredItem = { id: string; question: string; created_at: string };

export const CATEGORIES = ["업무매뉴얼", "규정정책", "조직연락처", "사내양식", "직접답변", "일반"];
