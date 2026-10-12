import { preparePreviewResponse } from "@/server/public-preview-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  return preparePreviewResponse(request, (await context.params).key);
}
