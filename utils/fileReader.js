const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const AdmZip = require("adm-zip");

const DB_PATH = path.join(__dirname, "../database");

// 파일명에서 키워드 추출
// 예: "복무규정20년.hwpx" → ["복무규정20년", "복무규정", "년"]
function extractKeywords(filename) {
  const name = path.basename(filename, path.extname(filename));
  // 공백·괄호·특수문자로 분리
  const parts = name.split(/[\s\(\)\[\]_\-\.]+/).filter((w) => w.length > 1);
  // 숫자 기준으로도 분리 (복무규정20년 → 복무규정, 년)
  const byDigit = name.split(/[\s\(\)\[\]_\-\.\d]+/).filter((w) => w.length > 1);
  return [...new Set([...parts, ...byDigit])];
}

// hwpx → 텍스트 (zip 안의 section XML에서 <hp:t> 태그 추출)
function parseHwpx(filePath) {
  try {
    const zip = new AdmZip(filePath);
    let text = "";
    zip.getEntries().forEach((entry) => {
      if (/Contents\/section\d+\.xml$/i.test(entry.entryName)) {
        const xml = entry.getData().toString("utf-8");
        const matches = xml.match(/<hp:t[^>]*>([^<]*)<\/hp:t>/g) || [];
        text += matches.map((m) => m.replace(/<[^>]+>/g, "")).join(" ");
      }
    });
    return text.trim();
  } catch {
    return "";
  }
}

// PDF → 텍스트
async function parsePdf(filePath) {
  try {
    const data = await pdf(fs.readFileSync(filePath));
    return data.text.trim();
  } catch {
    return "";
  }
}

// database/ 하위 폴더 포함 전체 파일 목록
function getAllFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if ([".pdf", ".hwpx"].includes(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

// 전체 문서 로드 (서버 시작 시 1회)
async function loadDocuments() {
  const files = getAllFiles(DB_PATH);
  const docs = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);
    const nameWithoutExt = path.basename(filePath, ext);

    const content =
      ext === ".pdf" ? await parsePdf(filePath) : parseHwpx(filePath);

    if (content.length > 50) {
      docs.push({
        id: nameWithoutExt,
        category: nameWithoutExt,
        keywords: extractKeywords(filename),
        content: content.slice(0, 3000),
        source: filename,
      });
      console.log(`[로드] ${filename} (${content.length}자)`);
    } else {
      console.log(`[건너뜀] ${filename} — 텍스트 추출 실패 또는 내용 없음`);
    }
  }

  console.log(`\n총 ${docs.length}개 문서 로드 완료`);
  return docs;
}

module.exports = { loadDocuments };
