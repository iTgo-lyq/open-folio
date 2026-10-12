import { connectionResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return connectionResponse(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return connectionResponse(request, (await context.params).id);
}
