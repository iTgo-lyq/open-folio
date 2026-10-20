import { revokeShareResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return revokeShareResponse(request, (await context.params).id);
}
