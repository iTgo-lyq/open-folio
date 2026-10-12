import { preferencesResponse } from "@/server/preferences-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const PATCH = (request: Request) => preferencesResponse(request);
