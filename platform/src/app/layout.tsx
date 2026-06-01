import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cutix — 商业视频批量生成",
  description: "选 IP、点生成、下载视频",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
