import { uploadPublication } from "../../../../server/prototype-hosting.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  return uploadPublication(request, (await context.params).key);
}
