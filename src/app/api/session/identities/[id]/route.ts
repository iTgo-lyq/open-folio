import { removeIdentityResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return removeIdentityResponse(request, (await context.params).id);
}
