import { switchConnectionResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const POST = (request: Request) => switchConnectionResponse(request);
