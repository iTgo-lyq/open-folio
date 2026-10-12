import { tokenResponse } from "@/server/credential-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => tokenResponse(request);
