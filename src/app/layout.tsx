import type { Metadata } from "next";
import "@open-folio/ui/styles.css";
import "./globals.css";
import { themeScript } from "@/lib/theme";
export const metadata: Metadata = {
  title: "OpenFolio",
  description: "从中心 Git 阅读 Specs 与 Changes",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
