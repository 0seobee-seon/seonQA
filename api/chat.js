const { loadDocuments } = require("../utils/fileReader");

const FALLBACK_MESSAGE =
  "죄송합니다. 해당 내용은 현재 업무 가이드에서 찾을 수 없습니다.\n\n" +
  "총무팀 담당자에게 직접 문의해 주세요.\n" +
  "📧 이메일: kimm1027@seon.co.kr\n" +
  "📞 전화: 043-220-8505";

// 서버 시작 시 1회 로드 후 캐시
let cachedDocs = null;
async function getDocs() {
  if (!cachedDocs) cachedDocs = await loadDocuments();
  return cachedDocs;
}

function findMatches(question, docs) {
  const q = question.toLowerCase();
  return docs.filter((d) => {
    // 1단계: 파일명 키워드가 질문에 포함되면 바로 선택
    if (d.keywords.some((kw) => q.includes(kw.toLowerCase()))) return true;

    // 2단계: 질문 단어(이름 등)가 문서 본문에 존재하면 선택
    // hwpx 한글 글자 사이 공백 제거 후 검색
    const docKws = new Set(d.keywords.map((k) => k.toLowerCase()));
    const qWords = (q.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
      (w) => !docKws.has(w)
    );
    if (qWords.length === 0) return false;
    const normalized = d.content.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
    return qWords.some((w) => normalized.includes(w));
  });
}

// 질문 키워드가 등장하는 주변 텍스트만 발췌 (최대 5곳)
// docKeywords: 문서 파일명에서 뽑은 키워드 — 이미 문서 선택에 쓰인 단어라 발췌에선 제외
function extractSnippet(question, content, docKeywords) {
  const docKws = new Set((docKeywords || []).map((k) => k.toLowerCase()));
  // 질문 단어 중 문서 키워드에 해당하지 않는 것만 사용
  const words = (question.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
    (w) => !docKws.has(w.toLowerCase())
  );
  if (words.length === 0) return content.slice(0, 300);

  // hwpx 파싱 부산물: 한글 글자 사이 공백 제거 ("김 영 섭" → "김영섭")
  const normalized = content.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");

  const seen = new Set();
  const snippets = [];

  for (const word of words) {
    let idx = 0;
    while ((idx = normalized.indexOf(word, idx)) !== -1) {
      const start = Math.max(0, idx - 40);
      const end = Math.min(normalized.length, idx + 80);
      const snippet = normalized.slice(start, end).trim();
      if (!seen.has(snippet)) {
        seen.add(snippet);
        snippets.push(snippet);
      }
      idx += word.length;
      if (snippets.length >= 5) break;
    }
    if (snippets.length >= 5) break;
  }

  if (snippets.length === 0) return normalized.slice(0, 300);
  return snippets.join("\n...\n");
}

async function handleChat(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { question } = JSON.parse(body);

      if (!question || question.trim() === "") {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "질문을 입력해 주세요." }));
      }

      const docs = await getDocs();
      const matches = findMatches(question, docs);

      if (matches.length === 0) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(
          JSON.stringify({ answer: FALLBACK_MESSAGE, source: null, fallback: true })
        );
      }

      const sources = [...new Set(matches.map((m) => m.source))].join(", ");

      let answer;
      if (!process.env.ANTHROPIC_API_KEY) {
        // 목업 모드: 질문 키워드 주변 발췌만 반환
        answer = matches
          .map((m) => `[${m.category}]\n${extractSnippet(question, m.content, m.keywords)}`)
          .join("\n\n");
      } else {
        const context = matches
          .map((m) => `[${m.category}]\n${extractSnippet(question, m.content, m.keywords)}\n(출처: ${m.source})`)
          .join("\n\n");

        const Anthropic = require("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const message = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system:
            "당신은 회사 총무팀 업무 안내 챗봇입니다. " +
            "아래 제공된 사내 가이드 문서 내용만을 근거로 직원의 질문에 친절하고 명확하게 답변하세요. " +
            "가이드에 없는 내용은 추측하지 마세요. " +
            "답변은 2~5문장으로 핵심만 요약해 주세요.",
          messages: [
            {
              role: "user",
              content: `[사내 가이드 문서]\n${context}\n\n[직원 질문]\n${question}`,
            },
          ],
        });
        answer = message.content[0].text;
      }

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ answer, source: sources, fallback: false }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "서버 오류가 발생했습니다." }));
    }
  });
}

module.exports = handleChat;
