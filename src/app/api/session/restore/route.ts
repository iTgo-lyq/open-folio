import { restoreSessionResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => restoreSessionResponse(request);
