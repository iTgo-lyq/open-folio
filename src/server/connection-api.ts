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
const loginInput = z
  .object({
    providerId: z.string().min(1).max(80).default("github"),
    username: z.string().trim().min(1).max(255),
    token: z.string().max(4096),
    label: z.string().max(100).optional(),
  })
  .strict();
export async function sessionResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
  discover?: Discovery,
) {
  try {
    const cookie = sessionCookie(request);
    if (request.method === "POST") {
      requirePersonalOrigin(request);
      const result = loginInput.safeParse(await readPersonalBody(request));
      if (!result.success)
        throw new AppError(
          "INVALID_PARAMETER",
          "请填写 Git 用户名与 token。",
          400,
        );
      const { providerId, username, token, label } = result.data;
      const userAgent = request.headers.get("user-agent") ?? "";
      const deviceLabel = /Android/i.test(userAgent)
        ? "Android 浏览器"
        : /iPhone|iPad/i.test(userAgent)
          ? "iOS 浏览器"
          : /Windows/i.test(userAgent)
            ? "Windows 浏览器"
            : /Macintosh/i.test(userAgent)
              ? "Mac 浏览器"
              : "浏览器";
      const connected = await store.login(
        cookie,
        providerId,
        token,
        username,
        label,
        request.signal,
        deviceLabel,
      );
      let discoveryError: { code: string; message: string } | undefined;
      try {
        const service =
          discover ?? (store === personalSessions() ? discovery() : undefined);
        if (service)
          await service.ensure(connected.cookie, connected.connection.id);
      } catch (e) {
        discoveryError = {
          code: e instanceof AppError ? e.code : "DISCOVERY_UNAVAILABLE",
          message: "登录已完成，但发现未启动，请重新发现仓库。",
        };
      }
      return personalJson(
        {
          session: connected.session,
          connection: connected.connection,
          ...(discoveryError ? { discoveryError } : {}),
        },
        201,
        cookieHeader(request, connected.cookie, connected.session.expiresAt),
      );
    }
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
    if (request.method !== "GET")
      throw new AppError("METHOD_NOT_ALLOWED", "不支持此操作。", 405);
    const { renewed, ...session } = await store.get(cookie);
    return personalJson(
      { ...session, providers: store.registry.describe() },
      200,
      cookie && !session.connected
        ? cookieHeader(request, "")
        : renewed
          ? cookieHeader(request, cookie, session.expiresAt)
          : undefined,
    );
  } catch (e) {
    return personalError(e);
  }
}
export async function logoutAllResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    requirePersonalOrigin(request);
    await store.remove(sessionCookie(request), undefined, true);
    return personalJson(
      { connected: false, connections: [] },
      200,
      cookieHeader(request, ""),
    );
  } catch (e) {
    return personalError(e);
  }
}
export async function connectionResponse(
  request: Request,
  _id?: string,
  _store?: PersonalSessions,
  _discover?: Discovery,
) {
  try {
    requirePersonalOrigin(request);
    throw new AppError(
      "CONNECTIONS_RETIRED",
      "连接新增与替换已停用，请使用 Git 用户名与 token 登录或切换凭据。",
      410,
    );
  } catch (e) {
    return personalError(e);
  }
}
