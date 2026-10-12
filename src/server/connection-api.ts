import "server-only";
import { z } from "zod";
import { discovery, type Discovery } from "./discovery.ts";
import { AppError } from "./errors.ts";
import {
  personalSessions,
  type PersonalSessions,
} from "./personal-sessions.ts";
import {
  sessionCookie,
  requirePersonalOrigin,
  cookieHeader,
  personalJson,
  personalError,
  readPersonalBody,
} from "./personal-http.ts";
const connectionInput = z
  .object({
    providerId: z.string().min(1).max(80).default("github"),
    token: z.string().max(4096),
    label: z.string().max(100).optional(),
  })
  .strict();
export async function sessionResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    const cookie = sessionCookie(request);
    if (request.method === "DELETE") {
      requirePersonalOrigin(request);
      if (cookie && (await store.get(cookie)).connected)
        await store.remove(cookie);
      return personalJson(
        { connected: false, connections: [] },
        200,
        cookieHeader(request, ""),
      );
    }
    const session = await store.get(cookie);
    return personalJson(
      { ...session, providers: store.registry.describe() },
      200,
      cookie && !session.connected ? cookieHeader(request, "") : undefined,
    );
  } catch (e) {
    return personalError(e);
  }
}
export async function connectionResponse(
  request: Request,
  id?: string,
  store: PersonalSessions = personalSessions(),
  discover?: Discovery,
) {
  try {
    requirePersonalOrigin(request);
    const cookie = sessionCookie(request);
    if (id && !z.string().uuid().safeParse(id).success)
      throw new AppError("CONNECTION_NOT_FOUND", "连接不存在。", 404);
    if (request.method === "DELETE" && id) {
      const session = await store.remove(cookie, id);
      return personalJson(
        session,
        200,
        session.connected ? undefined : cookieHeader(request, ""),
      );
    }
    const result = connectionInput.safeParse(await readPersonalBody(request));
    if (!result.success)
      throw new AppError(
        "INVALID_PARAMETER",
        "请填写有效的 token 和连接名称。",
        400,
      );
    const { providerId, token, label } = result.data;
    const connected = await store.connect(
      cookie,
      providerId,
      token,
      label,
      request.signal,
      id,
    );
    let discoveryError: { code: string; message: string } | undefined;
    try {
      const service =
        discover ?? (store === personalSessions() ? discovery() : undefined);
      if (service)
        await service.start(connected.cookie, connected.connection.id);
    } catch (e) {
      discoveryError = {
        code: e instanceof AppError ? e.code : "DISCOVERY_UNAVAILABLE",
        message: "连接已保存，但发现未启动，请重新发现仓库。",
      };
    }
    return personalJson(
      {
        session: connected.session,
        connection: connected.connection,
        ...(discoveryError ? { discoveryError } : {}),
      },
      id ? 200 : 201,
      cookieHeader(request, connected.cookie, connected.session.expiresAt),
    );
  } catch (e) {
    return personalError(e);
  }
}
