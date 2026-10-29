import "server-only";
import { validBranchName } from "../lib/collaboration.ts";
import { z } from "zod";
import { requireAdmin, requireSameOrigin } from "./access.ts";
import {
  publicPreviews,
  publicPreviewUrl,
  type PublicPreviews,
} from "./public-previews.ts";
import { repositories, type Repositories } from "./repositories.ts";
import { AppError, publicError } from "./errors.ts";
import {
  personalJson,
  personalError,
  requirePersonalOrigin,
  readPersonalBody,
  sessionCookie,
  renewPersonalResponse,
} from "./personal-http.ts";
import { readConfig, limitsFor } from "./config.ts";
import type { Limits } from "../lib/model.ts";
const inputSchema = z
  .object({
    connectionId: z.string().uuid(),
    integrationBranch: z.string().refine(validBranchName).optional(),
    entry: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    change: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .optional(),
    revision: z
      .string()
      .regex(/^[a-f0-9]{40,64}$/)
      .optional(),
    snapshot: z.string().uuid().optional(),
    repositoryId: z.string().max(128).optional(),
    fullName: z.string().max(256).optional(),
  })
  .strict();
export async function preparePreviewResponse(
  request: Request,
  key: string,
  repos: Repositories = repositories(),
  publications: PublicPreviews = publicPreviews(),
  limits?: Limits,
) {
  try {
    requirePersonalOrigin(request);
    const body = inputSchema.safeParse(await readPersonalBody(request));
    if (!body.success)
      throw new AppError("INVALID_PARAMETER", "原型准备参数不合法。", 400);
    const input = body.data;
    const selection = await repos.sessions.get(sessionCookie(request));
    const effectiveLimits = limits ?? limitsFor(await readConfig());
    const result = await repos.read(
      sessionCookie(request),
      input.connectionId,
      key,
      (ctx) => publications.prepare(ctx, input, effectiveLimits),
      input.repositoryId && input.fullName
        ? { repositoryId: input.repositoryId, fullName: input.fullName }
        : undefined,
      request.signal,
      input.integrationBranch,
    );
    return await renewPersonalResponse(
      request,
      personalJson({
        publication: result,
        url: publicPreviewUrl(result.id),
      }),
      repos.sessions,
      selection,
    );
  } catch (e) {
    return personalError(e);
  }
}
export async function publicPreviewResponse(
  request: Request,
  id: string,
  path: string,
  store: PublicPreviews = publicPreviews(),
) {
  const headers = {
    "Cache-Control": "public, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  try {
    if (path === "metadata") {
      const data = await store.get(id);
      return new Response(
        request.method === "HEAD" ? null : JSON.stringify(data),
        { headers: { ...headers, "Content-Type": "application/json" } },
      );
    }
    const result = await store.asset(id, path);
    if (result.redirect)
      return new Response(null, {
        status: 302,
        headers: { ...headers, Location: result.redirect },
      });
    return new Response(
      request.method === "HEAD" ? null : new Uint8Array(result.body!),
      {
        headers: {
          ...headers,
          "Content-Type": path.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "image/jpeg",
        },
      },
    );
  } catch (e) {
    const error = publicError(e);
    return new Response(
      request.method === "HEAD"
        ? null
        : JSON.stringify({
            error: { code: error.code, message: error.message },
          }),
      {
        status: error.status,
        headers: {
          ...headers,
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      },
    );
  }
}

export async function withdrawPreviewResponse(
  request: Request,
  id: string,
  store: PublicPreviews = publicPreviews(),
) {
  try {
    requireSameOrigin(request);
    await requireAdmin(request);
    await store.withdraw(id);
    return personalJson({ withdrawn: true });
  } catch (e) {
    return personalError(e);
  }
}
