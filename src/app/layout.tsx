import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cafe24Ssurround = localFont({
  src: [
    { path: "./fonts/Cafe24Ssurround-v2.0.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Cafe24Ssurround-v2.0.woff", weight: "400", style: "normal" },
  ],
  variable: "--font-cafe24",
});

export const metadata: Metadata = {
  title: "선엔지니어링 Q&A",
  description: "청주 총무팀 업무 도우미",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${cafe24Ssurround.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
