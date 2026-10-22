import { sharedResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: Request, context: Context) {
  return sharedResponse(request, (await context.params).segments);
}
export const GET = handle;
export const HEAD = handle;
