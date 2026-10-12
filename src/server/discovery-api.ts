import "server-only";
import { z } from "zod";
import { discovery, type Discovery } from "./discovery.ts";
import { AppError } from "./errors.ts";
import {
  sessionCookie,
  requirePersonalOrigin,
  personalJson,
  personalError,
  readPersonalBody,
} from "./personal-http.ts";
export async function discoveryResponse(
  request: Request,
  id: string,
  kind: "discovery" | "check",
  service: Discovery = discovery(),
) {
  try {
    if (!z.string().uuid().safeParse(id).success)
      throw new AppError("CONNECTION_NOT_FOUND", "连接不存在。", 404);
    const cookie = sessionCookie(request);
    if (kind === "discovery" && request.method === "GET")
      return personalJson({ discovery: await service.status(cookie, id) });
    requirePersonalOrigin(request);
    const body = await readPersonalBody(request);
    if (kind === "check") {
      const input = z
        .object({ url: z.string().max(2048) })
        .strict()
        .safeParse(body);
      if (!input.success)
        throw new AppError("INVALID_PARAMETER", "请填写仓库 HTTPS 地址。", 400);
      return personalJson(await service.check(cookie, id, input.data.url));
    }
    const input = z
      .object({ retry: z.boolean().optional() })
      .strict()
      .safeParse(body);
    if (!input.success)
      throw new AppError("INVALID_PARAMETER", "发现参数不合法。", 400);
    return personalJson(
      { discovery: await service.start(cookie, id, input.data.retry) },
      202,
    );
  } catch (e) {
    return personalError(e);
  }
}
export async function repositoryListResponse(
  request: Request,
  service: Discovery = discovery(),
) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get("connectionId");
    if (!id || !z.string().uuid().safeParse(id).success)
      throw new AppError("CONNECTION_REQUIRED", "请选择个人连接。", 400);
    const cursor = params.get("cursor") ?? "0";
    if (!/^\d{1,6}$/.test(cursor))
      throw new AppError("INVALID_PARAMETER", "目录页码不合法。", 400);
    return personalJson(
      await service.list(sessionCookie(request), id, Number(cursor)),
    );
  } catch (e) {
    return personalError(e);
  }
}
