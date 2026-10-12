import { legacyResolveResponse } from "@/server/legacy-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return legacyResolveResponse(request, (await context.params).id);
}
