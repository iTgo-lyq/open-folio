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
  requestRevision,
} from "./personal-http.ts";
const loginInput = z
  .object({
    providerId: z.string().min(1).max(80).default("github"),
    username: z.string().trim().max(100).optional(),
    token: z.string().max(4096),
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
          "请填写有效的 token，用户名可选且最多 100 个字符。",
          400,
        );
      const { providerId, username, token } = result.data;
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
        request.signal,
        deviceLabel,
        requestRevision(request),
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
        cookieHeader(request, connected.cookie, connected.cookieExpiresAt),
      );
    }
    if (request.method === "DELETE") {
      requirePersonalOrigin(request);
      if (cookie) {
        try {
          await store.remove(
            cookie,
            undefined,
            false,
            requestRevision(request),
          );
        } catch (e) {
          if (!(e instanceof AppError) || e.code !== "SESSION_REQUIRED")
            throw e;
        }
      }
      return personalJson(await store.get(cookie));
    }
    if (request.method !== "GET")
      throw new AppError("METHOD_NOT_ALLOWED", "不支持此操作。", 405);
    const { renewed: _renewed, ...session } = await store.get(cookie);
    return personalJson({ ...session, providers: store.registry.describe() });
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
    const cookie = sessionCookie(request);
    await store.remove(cookie, undefined, true, requestRevision(request));
    return personalJson(await store.get(cookie));
  } catch (e) {
    return personalError(e);
  }
}
export async function switchIdentityResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    requirePersonalOrigin(request);
    const input = z
      .object({ identityId: z.string().uuid() })
      .strict()
      .safeParse(await readPersonalBody(request));
    if (!input.success)
      throw new AppError("INVALID_PARAMETER", "请选择有效的身份。", 400);
    const result = await store.switchIdentity(
      sessionCookie(request),
      input.data.identityId,
      request.signal,
      requestRevision(request),
    );
    return personalJson(result);
  } catch (e) {
    return personalError(e);
  }
}
