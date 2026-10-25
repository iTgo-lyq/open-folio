import "server-only";
import { z } from "zod";
import { repositories, type Repositories } from "./repositories.ts";
import { readConfig, limitsFor } from "./config.ts";
import { AppError } from "./errors.ts";
import {
  sessionCookie,
  requestRevision,
  readPersonalBody,
  requirePersonalOrigin,
  personalJson,
  personalError,
  privateHeaders,
  renewPersonalResponse,
} from "./personal-http.ts";
import type { Limits } from "../lib/model.ts";
import { noteRepositoryActivity } from "./background-refresh.ts";
export async function repositoryResponse(
  request: Request,
  key: string,
  segments: string[],
  service: Repositories = repositories(),
  limits?: Limits,
) {
  try {
    if (["POST", "PUT", "PATCH"].includes(request.method))
      requirePersonalOrigin(request);
    const url = new URL(request.url),
      q = url.searchParams;
    const connectionId = q.get("connectionId");
    if (!connectionId || !z.string().uuid().safeParse(connectionId).success)
      throw new AppError(
        "CONNECTION_REQUIRED",
        "请选择自己的连接以读取仓库。",
        401,
      );
    const selector =
      q.has("repositoryId") && q.has("fullName")
        ? {
            repositoryId: q.get("repositoryId")!,
            fullName: q.get("fullName")!,
          }
        : undefined;
    if (
      selector &&
      (selector.repositoryId.length > 128 || selector.fullName.length > 256)
    )
      throw new AppError("INVALID_PARAMETER", "仓库参数不合法。", 400);
    const selection = await service.sessions.get(sessionCookie(request));
    const response = await service.read(
      sessionCookie(request),
      connectionId,
      key,
      async (ctx) => {
        const { store, project: p } = ctx;
        if (segments.length === 1 && segments[0] === "change-views") {
          const writing = !["GET", "HEAD"].includes(request.method);
          const body = ["PUT", "PATCH"].includes(request.method)
            ? await readPersonalBody(request, 72 * 1024)
            : undefined;
          return personalJson(
            await service.sessions.changeViews(
              sessionCookie(request),
              key,
              ctx.lease,
              request.method,
              body,
              writing ? requestRevision(request) : undefined,
            ),
          );
        }

        const snapshot = q.get("snapshot") ?? undefined;
        if (
          segments.length === 1 &&
          segments[0] === "refresh" &&
          request.method === "POST"
        ) {
          if (request.body) {
            const reader = request.body.getReader();
            const first = await reader.read();
            await reader.cancel();
            if (!first.done || first.value?.length)
              throw new AppError(
                "INVALID_PARAMETER",
                "刷新接口不接受请求体。",
                400,
              );
          }
          noteRepositoryActivity(
            service.root,
            ctx.lease.workspaceId,
            key,
            ctx.project.integrationBranch,
          );
          const snap = await ctx.refresh(
            limits ?? limitsFor(await readConfig()),
            q.get("automatic") === "1",
          );
          return personalJson({
            snapshotId: snap.id,
            capturedAt: snap.capturedAt,
          });
        }
        if (!["GET", "HEAD"].includes(request.method))
          throw new AppError("METHOD_NOT_ALLOWED", "当前接口仅支持读取。", 405);
        if (segments.length === 1 && segments[0] === "workbench")
          return personalJson({
            ...(await store.workbench(p, snapshot)),
            repository: ctx.repository,
          });
        if (segments.length === 1 && segments[0] === "prototypes")
          return personalJson(await store.prototypes(p, snapshot));
        if (
          segments[0] === "changes" &&
          segments[2] === "integration" &&
          (segments.length === 3 ||
            (segments[3] === "files" && [4, 5].includes(segments.length)))
        ) {
          if (
            !snapshot ||
            ["base", "head", "path", "revision"].some((key) => q.has(key))
          )
            throw new AppError(
              "INVALID_PARAMETER",
              "合入差异必须使用指定快照中的固定提交。",
              400,
            );
          const integration = await store.integration(p, segments[1], snapshot);
          return personalJson(
            segments.length === 3
              ? await integration.summary()
              : segments.length === 4
                ? await integration.files(q.get("cursor") ?? undefined)
                : await integration.file(segments[4]),
          );
        }
        if (segments.length === 1 && segments[0] === "current-preview")
          return personalJson(
            (
              await store.currentPreview(
                p,
                q.get("revision") ?? undefined,
                limits ?? limitsFor(await readConfig()),
                snapshot,
              )
            ).descriptor,
          );
        if (segments.length === 2 && segments[0] === "previews")
          return personalJson(
            (
              await store.preview(
                p,
                segments[1],
                q.get("revision") ?? undefined,
                limits ?? limitsFor(await readConfig()),
                snapshot,
              )
            ).descriptor,
          );
        if (
          segments.length === 2 &&
          ["documents", "assets"].includes(segments[0])
        ) {
          if (!snapshot)
            throw new AppError(
              "INVALID_PARAMETER",
              "读取正文时必须指定快照。",
              400,
            );
          const { document, body } = await store.document(
            p,
            segments[1],
            snapshot,
          );
          if (segments[0] === "assets") {
            if (document.kind !== "image" || !document.mime)
              throw new AppError(
                "ASSET_NOT_FOUND",
                "当前文档不是可预览图片。",
                404,
              );
            return new Response(new Uint8Array(body), {
              headers: {
                ...privateHeaders,
                "Content-Type":
                  document.mime === "image/svg+xml"
                    ? "image/svg+xml; charset=utf-8"
                    : document.mime,
                "Content-Security-Policy":
                  document.mime === "image/svg+xml"
                    ? "default-src 'none'; style-src 'unsafe-inline'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
                    : "default-src 'none'; sandbox",
              },
            });
          }
          if (!["markdown", "json"].includes(document.kind))
            throw new AppError(
              "DOCUMENT_UNREADABLE",
              "此格式请使用图片预览。",
              400,
            );
          return personalJson({ document, body: body.toString("utf8") });
        }
        throw new AppError("NOT_FOUND", "接口不存在。", 404);
      },
      selector,
      request.signal,
      q.get("integrationBranch") ?? undefined,
    );
    await renewPersonalResponse(request, response, service.sessions, selection);
    return request.method === "HEAD"
      ? new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      : response;
  } catch (e) {
    const response = personalError(e);
    return request.method === "HEAD"
      ? new Response(null, {
          status: response.status,
          headers: response.headers,
        })
      : response;
  }
}
