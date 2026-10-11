import { requireAdmin, requireSameOrigin } from "../../../server/access.ts";
import { readConfigSnapshot, saveConfig } from "../../../server/config.ts";
import { AppError, publicError } from "../../../server/errors.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const failure = (e: unknown) => {
  const error = publicError(e);
  return json(
    { error: { code: error.code, message: error.message } },
    error.status,
  );
};
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snapshot = await readConfigSnapshot();
    await requireAdmin(request);
    return json(snapshot);
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  try {
    requireSameOrigin(request);
    await requireAdmin(request);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new AppError("INVALID_PARAMETER", "保存配置需要 JSON 请求。", 415);
    const reader = request.body?.getReader();
    if (!reader)
      throw new AppError("INVALID_PARAMETER", "保存配置需要请求内容。", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new AppError(
            "CONFIG_TOO_LARGE",
            "配置内容超过 1 MiB，请减少项目或来源条目。",
            413,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AppError("INVALID_PARAMETER", "请求内容不是有效 JSON。", 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["config", "revision"].includes(key))
    )
      throw new AppError(
        "INVALID_PARAMETER",
        "请求只能包含配置内容和版本。",
        400,
      );
    const input = body as { config?: unknown; revision?: unknown };
    await requireAdmin(request);
    return json(await saveConfig(input.config, input.revision));
  } catch (e) {
    return failure(e);
  }
}
