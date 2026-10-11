import { readConfig } from "../../../server/config.ts";
import { login, requireSameOrigin } from "../../../server/access.ts";
import { AppError, publicError } from "../../../server/errors.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    requireSameOrigin(request);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new AppError("INVALID_PARAMETER", "验证需要 JSON 请求。", 415);
    const reader = request.body?.getReader();
    if (!reader)
      throw new AppError("INVALID_PARAMETER", "请填写访问凭据。", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          throw new AppError("INVALID_PARAMETER", "访问凭据过长。", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AppError("INVALID_PARAMETER", "请求内容不是有效 JSON。", 400);
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.secret !== "string" ||
      !input.secret ||
      Object.keys(input).some((key) => !["secret", "project"].includes(key)) ||
      (input.project !== undefined && typeof input.project !== "string")
    )
      throw new AppError("INVALID_PARAMETER", "请填写有效的访问凭据。", 400);
    const project =
      input.project === undefined
        ? undefined
        : (await readConfig()).projects.find((p) => p.id === input.project);
    if (input.project !== undefined && !project)
      throw new AppError("PROJECT_NOT_FOUND", "项目未登记或已移除。", 404);
    const credential = await login(request, input.secret, project);
    return Response.json(
      { ok: true },
      { headers: { ...headers, "Set-Cookie": credential } },
    );
  } catch (e) {
    const error = publicError(e);
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers },
    );
  }
}
