import "server-only";
import { join } from "node:path";
import { z } from "zod";
import { repositories, type Repositories } from "./repositories.ts";
import {
  shares,
  type Shares,
  type ShareRecord,
  type ShareScope,
} from "./shares.ts";
import { projectChange } from "./shared-change.ts";
import { dataDirectory, readConfig, limitsFor } from "./config.ts";
import { AppError, publicError } from "./errors.ts";
import { repositoryKey } from "./providers/types.ts";
import {
  sessionCookie,
  requirePersonalOrigin,
  requestRevision,
  personalJson,
  personalError,
  renewPersonalResponse,
} from "./personal-http.ts";
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
const result = (record: ShareRecord | null) =>
  record
    ? {
        id: record.id,
        path: `/share/${record.id}`,
        createdAt: record.createdAt,
      }
    : null;
const versionChanged = () =>
  new AppError("SHARE_VERSION_CHANGED", "内容已更新，正在重新读取。", 409);

export async function manageShareResponse(
  request: Request,
  key: string,
  changeId: string,
  repos: Repositories = repositories(),
  store: Shares = shares(),
  limits?: Limits,
) {
  let created: ShareRecord | undefined;
  try {
    if (!["GET", "POST"].includes(request.method))
      throw new AppError("METHOD_NOT_ALLOWED", "不支持此操作。", 405);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(changeId))
      throw new AppError("INVALID_PARAMETER", "Change 标识不合法。", 400);
    const writing = request.method === "POST";
    if (writing) requirePersonalOrigin(request);
    const q = new URL(request.url).searchParams,
      cookie = sessionCookie(request);
    const connectionId = z.string().uuid().safeParse(q.get("connectionId"));
    if (!connectionId.success)
      throw new AppError("CONNECTION_REQUIRED", "请选择仓库连接。", 401);
    const selection = await repos.sessions.get(cookie);
    const lease = await repos.sessions.lease(
      cookie,
      connectionId.data,
      request.signal,
      false,
      writing ? requestRevision(request) : undefined,
    );
    try {
      const response = await repos.read(
        cookie,
        connectionId.data,
        key,
        async (ctx) => {
          if (writing) {
            await ctx.assertRead(true);
            const snapshot = await ctx.refresh(
              limits ?? limitsFor(await readConfig()),
              true,
            );
            projectChange(snapshot, changeId, ctx.project.name);
          }
          const { providerId, instanceId, repositoryId, fullName } =
            ctx.repository;
          const scope: ShareScope = {
            accountId: lease.accountId,
            workspaceId: lease.workspaceId,
            repository: { providerId, instanceId, repositoryId, fullName },
            collaborationBranch: ctx.project.collaborationBranch,
            changeId,
          };
          const assertCurrent = async () => {
            await lease.assertCurrent();
            await renewPersonalResponse(
              request,
              personalJson(null),
              repos.sessions,
              selection,
            );
          };
          if (!writing)
            return personalJson({ share: result(await store.find(scope)) });
          const saved = await store.create(scope, assertCurrent);
          if (saved.created) created = saved.record;
          await assertCurrent();
          return personalJson({ share: result(saved.record) });
        },
        q.has("repositoryId") && q.has("fullName")
          ? {
              repositoryId: q.get("repositoryId")!,
              fullName: q.get("fullName")!,
            }
          : undefined,
        request.signal,
        q.get("collaborationBranch") ?? undefined,
      );
      await renewPersonalResponse(request, response, repos.sessions, selection);
      return response;
    } finally {
      lease.release();
    }
  } catch (e) {
    if (created) await store.revoke(created.id, created.accountId);
    return personalError(e);
  }
}

export async function revokeShareResponse(
  request: Request,
  id: string,
  repos: Repositories = repositories(),
  store: Shares = shares(),
) {
  try {
    requirePersonalOrigin(request);
    const cookie = sessionCookie(request),
      revision = requestRevision(request);
    const current = await repos.sessions.get(cookie);
    if (!current.authenticated || !current.account)
      throw new AppError("SESSION_REQUIRED", "请先登录账号。", 401);
    const assertCurrent = async () => {
      const next = await repos.sessions.get(cookie);
      if (
        next.account?.id !== current.account!.id ||
        next.deviceSessionId !== current.deviceSessionId ||
        next.browserRevision !== revision
      )
        throw new AppError("SESSION_CHANGED", "当前身份已改变，请重试。", 409);
    };
    await store.revoke(id, current.account.id, assertCurrent);
    return personalJson({ revoked: true });
  } catch (e) {
    return personalError(e);
  }
}

function previewLinks(
  id: string,
  snapshot: string,
  descriptor: PreviewDescriptor,
) {
  return {
    ...descriptor,
    entries: descriptor.entries.map((entry) => {
      if (entry.artifact?.type === "hosted" || !entry.available) return entry;
      const base = `/api/shares/${id}/previews/${encodeURIComponent(entry.id)}`;
      const query = `?snapshot=${encodeURIComponent(snapshot)}`;
      return {
        ...entry,
        url: `${base}/index.html${query}`,
        thumbnails: (entry.kind === "page"
          ? (entry.devices ?? [])
          : [undefined]
        ).map((device) => ({
          device,
          url: `${base}/${device ?? "component"}.jpg${query}`,
        })),
      };
    }),
  };
}
export async function sharedResponse(
  request: Request,
  id: string,
  segments: string[],
  repos: Repositories = repositories(),
  store: Shares = shares(),
  limits?: Limits,
  screenshots?: ThumbnailCache,
) {
  let response: Response;
  let record: ShareRecord | undefined;
  try {
    if (!["GET", "HEAD"].includes(request.method))
      throw new AppError("METHOD_NOT_ALLOWED", "分享仅支持读取。", 405);
    const q = new URL(request.url).searchParams;
    if ([...q.keys()].some((k) => !["snapshot", "cursor", "load"].includes(k)))
      throw new AppError("INVALID_PARAMETER", "分享读取参数不合法。", 400);
    record = await store.get(id);
    const scope = record;
    response = await repos.readShared(
      scope.accountId,
      scope.workspaceId,
      repositoryKey(scope.repository),
      scope.repository,
      scope.collaborationBranch,
      async (ctx) => {
        const effectiveLimits = limits ?? limitsFor(await readConfig());
        const isDetail = segments.length === 1 && segments[0] === "change";
        const snapshot = isDetail
          ? await ctx.refresh(effectiveLimits, true)
          : await ctx.store.snapshot(ctx.project);
        if (
          (!isDetail || q.has("snapshot")) &&
          q.get("snapshot") !== snapshot.id
        )
          throw versionChanged();
        const data = projectChange(snapshot, scope.changeId, ctx.project.name);
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
            scope.changeId,
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
            scope.changeId,
            undefined,
            effectiveLimits,
            snapshot.id,
            segments[1],
            segments.length === 3,
          );
          if (segments.length === 1)
            value = Response.json(previewLinks(id, snapshot.id, descriptor));
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
                `${scope.workspaceId}/${scope.changeId}/${entry.id}`,
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
        // Revocation is local to this link; never cancel another reader's shared refresh.
        await store.get(id);
        await ctx.assertRead();
        if ((await ctx.store.snapshot(ctx.project)).id !== snapshot.id)
          throw versionChanged();
        return value;
      },
      request.signal,
    );
    await store.get(id);
  } catch (e) {
    if (record) {
      try {
        await store.get(id);
        const lease = await repos.sessions.credentialLease(
          record.accountId,
          record.workspaceId,
        );
        try {
          await lease.assertCurrent();
        } finally {
          lease.release();
        }
      } catch (current) {
        e = current;
      }
    }
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
            ? "分享来源授权已失效，请联系分享者。"
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
