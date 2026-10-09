import { handlePreview } from "@/server/preview-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (
  request: Request,
  context: { params: Promise<{ segments: string[] }> },
) => handlePreview(request, context, true);
export const HEAD = GET;
