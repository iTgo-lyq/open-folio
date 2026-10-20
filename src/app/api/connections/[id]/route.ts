import { connectionsResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return connectionsResponse(request, (await context.params).id);
}
export const DELETE = PATCH;
