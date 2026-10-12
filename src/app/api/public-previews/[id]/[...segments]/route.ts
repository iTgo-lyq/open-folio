import { publicPreviewResponse } from "@/server/public-preview-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; segments: string[] }> },
) {
  const { id, segments } = await context.params;
  return publicPreviewResponse(request, id, segments.join("/"));
}
export const HEAD = GET;
