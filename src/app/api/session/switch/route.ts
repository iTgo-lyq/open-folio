import { switchIdentityResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const POST = (request: Request) => switchIdentityResponse(request);
