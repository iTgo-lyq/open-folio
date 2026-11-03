import { notFound } from "next/navigation";
import SharedChangePage from "@/components/shared-change-page";
import { ShareLinks } from "@/server/share-links";
import { AppError } from "@/server/errors";
export { metadata } from "../../share/page";
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const target = await new ShareLinks()
    .read((await params).id)
    .catch((error) => {
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    });
  return <SharedChangePage initialTarget={target} />;
}
