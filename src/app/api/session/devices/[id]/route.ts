import { devicesResponse } from "@/server/credential-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const DELETE = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => devicesResponse(request, (await context.params).id);
