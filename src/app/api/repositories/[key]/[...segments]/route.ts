import { repositoryResponse } from "@/server/repository-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ key: string; segments: string[] }> };
async function handle(request: Request, context: Context) {
  const { key, segments } = await context.params;
  return repositoryResponse(request, key, segments);
}
export const GET = handle;
export const HEAD = handle;
export const POST = handle;

export const PUT = handle;
export const PATCH = handle;
