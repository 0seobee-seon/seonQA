# 선엔지니어링 총무팀 업무 안내 챗봇

## 프로젝트 개요
선엔지니어링 청주 총무팀 직원들이 사내 업무 절차(연차, 급여, 규정, 사내전화 등)를 질문하면 관련 문서를 찾아 답변해주는 챗봇 MVP.

## 기술 스택
- **런타임**: Node.js (vanilla HTTP 서버, 프레임워크 없음)
- **진입점**: `server.js` → `api/chat.js` (POST /api/chat)
- **문서 파싱**: PDF (`pdf-parse@1.1.1`), hwpx (`adm-zip`)
- **AI 답변**: Anthropic Claude API (선택적, 없으면 키워드 스니펫 반환)
- **프론트엔드**: `index.html` + `style.css` (순수 HTML/JS)

## 서버 실행
```
# 포트 3027로 실행 (preview_start 사용 권장)
PORT=3027 node server.js
```
`.claude/launch.json`에 preview 서버 설정 포함 (포트 3027).

## 핵심 파일
| 파일 | 역할 |
|------|------|
| `server.js` | HTTP 서버, 정적 파일 서빙 |
| `api/chat.js` | 질문 처리, 문서 검색, 스니펫 추출 |
| `utils/fileReader.js` | PDF/hwpx 파싱, 키워드 추출 |
| `data/guide.json` | 빠른 답변 가이드 데이터 |
| `database/` | 사내 문서 원본 (gitignore — 직원 개인정보 포함) |

## 중요 주의사항

### database/ 폴더 — 절대 외부 공개 금지
`database/` 폴더에는 직원 전화번호, 급여규정, 인사규정 등 민감한 개인정보가 포함됩니다.
- `.gitignore`에 등록되어 있음
- Vercel 배포 시 포함되어서는 안 됨
- 이 폴더 내용을 외부 서비스에 업로드하는 작업은 반드시 사용자 확인 후 진행

### hwpx 파싱 특성
hwpx 파일은 `adm-zip`으로 ZIP 압축을 풀어 XML에서 `<hp:t>` 태그를 추출합니다.
- **한글 글자 사이에 공백이 삽입됨**: "김 영 섭" → 정규화 필요
- 정규화: `content.replace(/([가-힣])\s+(?=[가-힣])/g, "$1")`
- 표 구조가 사라지고 텍스트가 연속으로 이어짐 (사내전화번호 파일 등)

### 검색 로직 (api/chat.js)
1. **findMatches()**: 질문 키워드와 문서 파일명 키워드 점수 매칭
   - 파일명 키워드 일치: +10점
   - 본문 포함: +1점
   - 최고점 문서 1개만 반환
2. **extractSnippet()**: 키워드 주변 텍스트 발췌
   - 범위: 키워드 앞 8자 / 뒤 8자 (좁은 창 — 사내전화 파일의 표 구조 미지원 대응)
   - 겹치는 스니펫 제거 (50자 이상 overlap 시 건너뜀)
   - 최대 2개 스니펫

## 환경변수 (.env)
```
ANTHROPIC_API_KEY=  # 없으면 키워드 스니펫 모드로 동작
PORT=3027
```

## 관련 프로젝트
- **seonQA** (Next.js 배포버전): `C:\Users\LG\Desktop\AX 코드 학습\seonQA`
  - GitHub: https://github.com/0seobee-seon/seonQA
  - Vercel: https://seon-qa.vercel.app
  - Supabase `documents` 테이블에 21개 문서 업로드 완료

## 백업 위치
- `D:\노트북 작업`
- `G:\내 드라이브\AI 영섭 작업기록\질문 챗봇`
