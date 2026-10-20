import { manageShareResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string; changeId: string }> };
async function handle(request: Request, context: Context) {
  const { key, changeId } = await context.params;
  return manageShareResponse(request, key, changeId);
}
export const GET = handle;
export const POST = handle;
