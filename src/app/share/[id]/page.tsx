import type { Metadata } from "next";
import SharedChangePage from "@/components/shared-change-page";
export const metadata: Metadata = {
  title: "Change 分享 · OpenFolio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <SharedChangePage id={(await params).id} />;
}
