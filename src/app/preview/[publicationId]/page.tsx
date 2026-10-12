import { PublicPreviewView } from "@/components/public-preview";
import { publicPreviews } from "@/server/public-previews";
import { publicError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PublicPreviewPage({
  params,
}: {
  params: Promise<{ publicationId: string }>;
}) {
  const { publicationId } = await params;
  const result = await publicPreviews()
    .get(publicationId)
    .then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: publicError(error).message }),
    );
  if (!result.value)
    return (
      <main className="public-preview-page">
        <h1>原型暂不可用</h1>
        <p>{result.error}</p>
        <a href="/">返回 OpenFolio</a>
      </main>
    );
  return <PublicPreviewView meta={result.value} />;
}
