import { discoveryResponse } from "@/server/discovery-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return discoveryResponse(request, (await context.params).id, "check");
}
