import { sessionResponse } from "@/server/connection-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => sessionResponse(request);
export const DELETE = (request: Request) => sessionResponse(request);
