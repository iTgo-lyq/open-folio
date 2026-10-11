import { hostedAsset } from "../../../../server/prototype-hosting.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ version: string; path: string[] }> },
) {
  const { version, path } = await context.params;
  return hostedAsset(request, version, path.join("/"));
}
export const HEAD = GET;
