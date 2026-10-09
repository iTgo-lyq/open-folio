import { readConfig, checkRequest, limitsFor } from "@/server/config";
import { service, thumbnails } from "@/server/service";
import { thumbnailResponse } from "@/server/thumbnails";
import { AppError, publicError } from "@/server/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });
type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const config = await readConfig();
    checkRequest(request, config, request.method === "POST");
    const { segments: s } = await context.params,
      url = new URL(request.url),
      store = service();
    if (request.method === "GET" && s.length === 1 && s[0] === "projects")
      return json({
        projects: await Promise.all(
          config.projects.map((p) => store.summary(p)),
        ),
      });
    if (s[0] !== "projects" || s.length < 3)
      throw new AppError("NOT_FOUND", "接口不存在。", 404);
    const p = config.projects.find((p) => p.id === s[1]);
    if (!p)
      throw new AppError("PROJECT_NOT_FOUND", "项目未登记或已移除。", 404);
    if (request.method === "POST" && s.length === 3 && s[2] === "refresh") {
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
      const snap = await store.refresh(p, limitsFor(config));
      return json({ snapshotId: snap.id, capturedAt: snap.capturedAt });
    }
    if (request.method !== "GET")
      throw new AppError("METHOD_NOT_ALLOWED", "当前接口仅支持读取。", 405);
    const snapshot = url.searchParams.get("snapshot") ?? undefined,
      branch = url.searchParams.get("branch") ?? undefined;
    if (s.length === 3 && s[2] === "workbench")
      return json(await store.workbench(p, snapshot, branch));
    if (s.length === 3 && s[2] === "prototypes")
      return json(await store.prototypes(p, snapshot));
    if (s.length === 3 && s[2] === "current-preview")
      return json(
        (
          await store.currentPreview(
            p,
            url.searchParams.get("revision") ?? undefined,
            limitsFor(config),
            snapshot,
          )
        ).descriptor,
      );
    if (s.length === 4 && s[2] === "current-thumbnails")
      return await thumbnailResponse(
        request,
        p,
        store,
        thumbnails(),
        limitsFor(config),
        "",
        s[3],
        true,
      );
    if (s.length === 5 && s[2] === "thumbnails")
      return await thumbnailResponse(
        request,
        p,
        store,
        thumbnails(),
        limitsFor(config),
        s[3],
        s[4],
      );
    if (s.length === 4 && s[2] === "previews")
      return json(
        (
          await store.preview(
            p,
            s[3],
            url.searchParams.get("revision") ?? undefined,
            limitsFor(config),
            snapshot,
          )
        ).descriptor,
      );
    if (!snapshot)
      throw new AppError(
        "INVALID_PARAMETER",
        "读取正文和搜索时必须指定快照。",
        400,
      );
    if (s.length === 3 && s[2] === "search") {
      const kind = url.searchParams.get("kind") ?? "specs";
      if (!["specs", "changes"].includes(kind))
        throw new AppError("INVALID_PARAMETER", "搜索类型不合法。", 400);
      return json({
        results: await store.search(
          p,
          snapshot,
          branch,
          url.searchParams.get("q") ?? "",
          kind,
        ),
      });
    }
    if (s.length === 4 && ["documents", "assets"].includes(s[2])) {
      const { document, body } = await store.document(p, s[3], snapshot);
      if (s[2] === "assets") {
        if (document.kind !== "image" || !document.mime)
          throw new AppError(
            "ASSET_NOT_FOUND",
            "当前文档不是可预览图片。",
            404,
          );
        return new Response(new Uint8Array(body), {
          headers: {
            ...headers,
            "Content-Type": document.mime,
            "Content-Security-Policy": "default-src 'none'; sandbox",
          },
        });
      }
      if (!["markdown", "json"].includes(document.kind))
        throw new AppError(
          "DOCUMENT_UNREADABLE",
          "此格式请使用图片预览。",
          400,
        );
      return json({ document, body: body.toString("utf8") });
    }
    throw new AppError("NOT_FOUND", "接口不存在。", 404);
  } catch (e) {
    const error = publicError(e);
    return json(
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
}
export const GET = handle;
export const POST = handle;
