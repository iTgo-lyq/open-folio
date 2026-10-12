import { devicesResponse } from "@/server/credential-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => devicesResponse(request);
