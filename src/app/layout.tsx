import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OpenFolio · 工程工作台', description: '从中心 Git 阅读 Specs 与 Changes' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-CN"><body>{children}</body></html>; }
