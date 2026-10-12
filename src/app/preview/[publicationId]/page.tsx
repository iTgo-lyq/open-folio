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
  const meta = result.value;
  return (
    <main className="public-preview-page">
      <header>
        <a href="/">OpenFolio</a>
        <h1>{meta.title}</h1>
        <span>公开原型 · 固定版本 {meta.revision.slice(0, 7)}</span>
      </header>
      <iframe
        title={meta.title}
        src={`/api/public-previews/${meta.id}/index.html`}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        style={{
          width: "100%",
          height: "calc(100dvh - 90px)",
          border: 0,
          background: "white",
        }}
      />
    </main>
  );
}
