import { sharedResponse } from "@/server/share-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handle(request: Request) {
  return sharedResponse(request, ["agent"]);
}
export const GET = handle;
export const HEAD = handle;
