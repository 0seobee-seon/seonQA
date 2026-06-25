/**
 * Excel → phone_directory.json 변환 스크립트
 * 사용법: node excel-to-json.js
 * 입력:  database/사내전화번호_양식.xlsx
 * 출력:  database/phone_directory.json
 */

const AdmZip = require("adm-zip");
const path = require("path");
const fs = require("fs");

const EXCEL_PATH = path.join(__dirname, "database/사내전화번호_양식.xlsx");
const JSON_PATH = path.join(__dirname, "database/phone_directory.json");

// xlsx는 ZIP 형식 — xl/worksheets/sheet1.xml 파싱
function parseXlsx(filePath) {
  const zip = new AdmZip(filePath);

  // 공유 문자열 테이블 (문자열 셀은 인덱스로 저장됨)
  const sharedEntry = zip.getEntry("xl/sharedStrings.xml");
  const sharedStrings = [];
  if (sharedEntry) {
    const xml = sharedEntry.getData().toString("utf-8");
    const matches = xml.matchAll(/<si>.*?<\/si>/gs);
    for (const m of matches) {
      const texts = [...m[0].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]);
      sharedStrings.push(texts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    }
  }

  // 시트 데이터
  const sheetEntry = zip.getEntry("xl/worksheets/sheet1.xml");
  if (!sheetEntry) throw new Error("sheet1.xml not found");
  const sheetXml = sheetEntry.getData().toString("utf-8");

  // 행 파싱
  const rows = [];
  const rowMatches = sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs);
  for (const rowM of rowMatches) {
    const rowIdx = parseInt(rowM[1]);
    const cells = {};
    const cellMatches = rowM[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*t="([^"]*)"[^>]*>.*?<v>(\d+)<\/v>.*?<\/c>/gs);
    for (const cm of cellMatches) {
      const col = cm[1];
      const type = cm[2];
      const val = cm[3];
      cells[col] = type === "s" ? sharedStrings[parseInt(val)] : val;
    }
    // 인라인 문자열
    const inlineMatches = rowM[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*t="inlineStr"[^>]*>.*?<t>([^<]*)<\/t>.*?<\/c>/gs);
    for (const im of inlineMatches) {
      cells[im[1]] = im[2];
    }
    // 숫자형 셀 (t 속성 없음)
    const numMatches = rowM[2].matchAll(/<c r="([A-Z]+)\d+"(?![^>]*t=)[^>]*>.*?<v>([^<]*)<\/v>.*?<\/c>/gs);
    for (const nm of numMatches) {
      if (!(nm[1] in cells)) cells[nm[1]] = nm[2];
    }
    rows.push({ rowIdx, cells });
  }
  return rows;
}

function convert() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error("파일을 찾을 수 없습니다:", EXCEL_PATH);
    process.exit(1);
  }

  const rows = parseXlsx(EXCEL_PATH);

  // 1행 = 헤더 (이름, 직함, 내선번호, 부서, 근무지, 외선전화, 비고)
  // A=이름 B=직함 C=내선번호 D=부서 E=근무지 F=외선전화 G=비고
  const entries = [];
  for (const { rowIdx, cells } of rows) {
    if (rowIdx === 1) continue; // 헤더 스킵
    const name = (cells["A"] || "").trim();
    if (!name) continue; // 빈 행 스킵

    const entry = {
      name,
      ext: (cells["C"] || "").trim(),
      dept: (cells["D"] || "").trim(),
      location: (cells["E"] || "").trim(),
    };
    if (cells["B"] && cells["B"].trim()) entry.title = cells["B"].trim();
    if (cells["F"] && cells["F"].trim()) entry.tel = cells["F"].trim();

    entries.push(entry);
  }

  if (entries.length === 0) {
    console.error("변환된 항목이 없습니다. Excel 파일을 확인해 주세요.");
    process.exit(1);
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(entries, null, 2), "utf-8");
  console.log(`변환 완료: ${entries.length}명 → ${JSON_PATH}`);
}

convert();
