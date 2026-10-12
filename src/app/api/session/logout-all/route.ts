import { logoutAllResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => logoutAllResponse(request);
