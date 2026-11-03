import { sharedResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return sharedResponse(request, ["agent", (await context.params).id]);
}
export const GET = handle;
export const HEAD = handle;
