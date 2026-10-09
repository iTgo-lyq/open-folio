import type { ProjectConfig, Limits } from "../lib/model.ts";
import { previewViewport } from "../lib/preview-viewport.ts";
import type { SnapshotStore } from "./store.ts";
import { ThumbnailCache } from "./thumbnail-cache.ts";
import { AppError } from "./errors.ts";

export async function thumbnailResponse(
  request: Request,
  project: ProjectConfig,
  store: SnapshotStore,
  cache: ThumbnailCache,
  limits: Limits,
  change: string,
  entryId: string,
  currentEntry = false,
) {
  const url = new URL(request.url);
  const snapshot = url.searchParams.get("snapshot") ?? undefined;
  const device = url.searchParams.get("device") ?? undefined;
  const resolve = () =>
    currentEntry
      ? store.currentPreview(
          project,
          url.searchParams.get("revision") ?? undefined,
          limits,
          snapshot,
          entryId,
          true,
        )
      : store.preview(
          project,
          change,
          undefined,
          limits,
          snapshot,
          entryId,
          true,
        );
  const { descriptor, html } = await resolve();
  const entry = descriptor.entries.find((e) => e.id === entryId);
  if (entry?.available && entry.artifact?.type === "hosted") {
    if (
      device &&
      !entry.devices?.includes(device as import("../lib/model.ts").Device)
    )
      throw new AppError("INVALID_PARAMETER", "截图设备未在该入口声明。", 400);
    const thumbnail = entry.thumbnails?.find(
      (t) => t.device === (device ?? entry.devices?.[0]),
    );
    if (!thumbnail)
      throw new AppError(
        "THUMBNAIL_UNAVAILABLE",
        "宿主尚未提供此视口的截图。",
        404,
      );
    return new Response(null, {
      status: 302,
      headers: {
        Location: thumbnail.url,
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  }
  if (!entry?.available || html === undefined)
    throw new AppError(
      "THUMBNAIL_UNAVAILABLE",
      descriptor.message ?? entry?.message ?? "原型入口不可用。",
      404,
    );
  if (device && !entry.devices?.some((value) => value === device))
    throw new AppError("INVALID_PARAMETER", "截图设备未在该入口声明。", 400);
  const { viewport } = previewViewport(entry, device);
  const result = await cache.get(
    JSON.stringify([project.id, project.repositoryUrl]),
    html,
    viewport,
  );
  // Generation may outlive a refresh: never serve a cached image after revocation.
  const current = await resolve();
  if (
    current.html !== html ||
    current.descriptor.revision !== descriptor.revision
  )
    throw new AppError(
      "THUMBNAIL_UNAVAILABLE",
      "原型来源已更新或停用，请刷新后重试。",
      409,
    );
  const headers = {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, no-cache, must-revalidate",
    ETag: result.etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-OpenFolio-Thumbnail-Cache": result.cached ? "hit" : "miss",
  };
  return request.headers.get("if-none-match") === result.etag
    ? new Response(null, { status: 304, headers })
    : new Response(new Uint8Array(result.body), { headers });
}
