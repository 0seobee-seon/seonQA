import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse(pdfjs-dist)는 내부적으로 워커 모듈을 동적 import로 찾는데,
  // 번들러가 이를 처리하면 워커 파일 경로가 깨진다. 번들링하지 않고 node_modules에서
  // 그대로 require하도록 제외해야 Node 런타임(API 라우트)에서 정상 동작한다.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
