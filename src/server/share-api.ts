import "server-only";
import { join } from "node:path";
import { repositories, type Repositories } from "./repositories.ts";
import { readSharedTarget } from "./shared-source.ts";
import { sharedReadUrl, type ShareTarget } from "../lib/share-link.ts";
import { projectChange } from "./shared-change.ts";
import { dataDirectory, readConfig, limitsFor } from "./config.ts";
import { AppError, publicError } from "./errors.ts";
import { diagnosticHtml } from "./public-previews.ts";
import { ThumbnailCache } from "./thumbnail-cache.ts";
import { previewViewport } from "../lib/preview-viewport.ts";
import type { Device, Limits, PreviewDescriptor } from "../lib/model.ts";
import { sandboxCsp } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Frame-Options": "SAMEORIGIN",
};
const state = globalThis as typeof globalThis & {
  folioShareThumbnails?: ThumbnailCache;
};
const thumbnailCache = () =>
  (state.folioShareThumbnails ??= new ThumbnailCache(
    join(dataDirectory(), "share-thumbnails"),
  ));
const versionChanged = () =>
  new AppError("SHARE_VERSION_CHANGED", "内容已更新，正在重新读取。", 409);

function previewLinks(
  target: ShareTarget,
  snapshot: string,
  descriptor: PreviewDescriptor,
) {
  return {
    ...descriptor,
    entries: descriptor.entries.map((entry) => {
      if (entry.artifact?.type === "hosted" || !entry.available) return entry;
      const base = `previews/${encodeURIComponent(entry.id)}`;
      const query = `?snapshot=${encodeURIComponent(snapshot)}`;
      return {
        ...entry,
        url: sharedReadUrl(target, `${base}/index.html${query}`),
        thumbnails: (entry.kind === "page"
          ? (entry.devices ?? [])
          : [undefined]
        ).map((device) => ({
          device,
          url: sharedReadUrl(
            target,
            `${base}/${device ?? "component"}.jpg${query}`,
          ),
        })),
      };
    }),
  };
}
export async function sharedResponse(
  request: Request,
  segments: string[],
  repos: Repositories = repositories(),
  limits?: Limits,
  screenshots?: ThumbnailCache,
) {
  let response: Response;
  try {
    if (!["GET", "HEAD"].includes(request.method))
      throw new AppError("METHOD_NOT_ALLOWED", "分享仅支持读取。", 405);
    const q = new URL(request.url).searchParams;
    if (
      [...q.keys()].some(
        (k) =>
          ![
            "repository",
            "change",
            "integrationBranch",
            "snapshot",
            "cursor",
            "load",
          ].includes(k) || q.getAll(k).length !== 1,
      )
    )
      throw new AppError("INVALID_PARAMETER", "分享读取参数不合法。", 400);
    const target: ShareTarget = {
      repository: q.get("repository") ?? "",
      change: q.get("change") ?? "",
      ...(q.has("integrationBranch")
        ? { integrationBranch: q.get("integrationBranch")! }
        : {}),
    };
    response = await readSharedTarget(
      repos,
      target,
      request.signal,
      async (ctx) => {
        const effectiveLimits = limits ?? limitsFor(await readConfig());
        const isDetail = segments.length === 1 && segments[0] === "change";
        const snapshot = isDetail
          ? await ctx.refresh(effectiveLimits, true)
          : await ctx.store.snapshot(ctx.project).catch(async (error) => {
              if (error instanceof AppError && error.code === "NO_SNAPSHOT")
                return ctx.refresh(effectiveLimits, true);
              throw error;
            });
        if (
          (!isDetail || q.has("snapshot")) &&
          q.get("snapshot") !== snapshot.id
        )
          throw versionChanged();
        const data = projectChange(snapshot, target.change, ctx.project.name);
        let value: Response;
        if (isDetail) value = Response.json(data);
        else if (
          segments.length === 2 &&
          ["documents", "assets"].includes(segments[0])
        ) {
          if (!data.documents.some((d) => d.id === segments[1]))
            throw new AppError(
              "DOCUMENT_NOT_FOUND",
              "文档未包含在此分享中。",
              404,
            );
          const { document, body } = await ctx.store.document(
            ctx.project,
            segments[1],
            snapshot.id,
          );
          if (segments[0] === "assets") {
            if (document.kind !== "image" || !document.mime)
              throw new AppError("ASSET_NOT_FOUND", "图片不存在。", 404);
            value = new Response(new Uint8Array(body), {
              headers: {
                "Content-Type": document.mime,
                "Content-Security-Policy":
                  "default-src 'none'; style-src 'unsafe-inline'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
              },
            });
          } else {
            if (!["markdown", "json"].includes(document.kind))
              throw new AppError(
                "DOCUMENT_UNREADABLE",
                "此格式不支持正文阅读。",
                400,
              );
            value = Response.json({ document, body: body.toString("utf8") });
          }
        } else if (
          segments[0] === "integration" &&
          (segments.length === 1 ||
            (segments[1] === "files" && [2, 3].includes(segments.length)))
        ) {
          const integration = await ctx.store.integration(
            ctx.project,
            target.change,
            snapshot.id,
          );
          value = Response.json(
            segments.length === 1
              ? await integration.summary()
              : segments.length === 2
                ? await integration.files(q.get("cursor") ?? undefined)
                : await integration.file(segments[2]),
          );
        } else if (
          segments[0] === "previews" &&
          [1, 3].includes(segments.length)
        ) {
          const { descriptor, html } = await ctx.store.preview(
            ctx.project,
            target.change,
            undefined,
            effectiveLimits,
            snapshot.id,
            segments[1],
            segments.length === 3,
          );
          if (segments.length === 1)
            value = Response.json(
              previewLinks(target, snapshot.id, descriptor),
            );
          else {
            const entry = descriptor.entries.find((e) => e.id === segments[1]);
            if (!entry?.available || entry.artifact?.type === "hosted" || !html)
              throw new AppError(
                "PREVIEW_UNAVAILABLE",
                "原型内容不可用。",
                404,
              );
            const asset = segments[2];
            if (asset === "index.html")
              value = new Response(diagnosticHtml(html), {
                headers: {
                  "Content-Type": "text/html; charset=utf-8",
                  "Content-Security-Policy": sandboxCsp,
                },
              });
            else {
              const device = asset.replace(/\.jpg$/, "");
              if (
                asset !== `${device}.jpg` ||
                (entry.kind === "component"
                  ? device !== "component"
                  : !entry.devices?.includes(device as Device))
              )
                throw new AppError(
                  "PREVIEW_UNAVAILABLE",
                  "原型截图不存在。",
                  404,
                );
              const { viewport } = previewViewport(
                entry,
                device === "component" ? undefined : (device as Device),
              );
              const image = await (screenshots ?? thumbnailCache()).get(
                `${ctx.lease.workspaceId}/${target.change}/${entry.id}`,
                html,
                viewport,
              );
              value = new Response(new Uint8Array(image.body), {
                headers: {
                  "Content-Type": "image/jpeg",
                  "Content-Security-Policy": "default-src 'none'; sandbox",
                },
              });
            }
          }
        } else throw new AppError("NOT_FOUND", "接口不存在。", 404);
        await ctx.assertRead();
        if ((await ctx.store.snapshot(ctx.project)).id !== snapshot.id)
          throw versionChanged();
        return value;
      },
    );
  } catch (e) {
    const error = publicError(e);
    const denied = [
      "SESSION_REQUIRED",
      "TOKEN_INVALID",
      "IDENTITY_CHANGED",
      "READ_DENIED",
      "REPOSITORY_MISMATCH",
      "PROVIDER_MISMATCH",
    ].includes(error.code);
    response = Response.json(
      {
        error: {
          code: denied ? "SHARE_UNAVAILABLE" : error.code,
          message: denied
            ? "内容不存在或暂不可读。"
            : error.status >= 500
              ? "内容暂时读取失败，请稍后重试。"
              : error.message,
        },
      },
      { status: denied ? 403 : error.status },
    );
  }
  for (const [key, value] of Object.entries(headers))
    response.headers.set(key, value);
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}
