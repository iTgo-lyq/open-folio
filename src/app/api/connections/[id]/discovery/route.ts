import { discoveryResponse } from "@/server/discovery-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return discoveryResponse(request, (await context.params).id, "discovery");
}
export async function POST(request: Request, context: Context) {
  return discoveryResponse(request, (await context.params).id, "discovery");
}
