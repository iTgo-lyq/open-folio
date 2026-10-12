import { withdrawPreviewResponse } from "@/server/public-preview-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withdrawPreviewResponse(request, (await context.params).id);
}
