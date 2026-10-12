import { repositoryListResponse } from "@/server/discovery-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => repositoryListResponse(request);
