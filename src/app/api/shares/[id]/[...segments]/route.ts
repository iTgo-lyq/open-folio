import { sharedResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; segments: string[] }> };
async function handle(request: Request, context: Context) {
  const { id, segments } = await context.params;
  return sharedResponse(request, id, segments);
}
export const GET = handle;
export const HEAD = handle;
