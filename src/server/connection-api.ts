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
  .object({ username: z.string().max(256), password: z.string().max(512) })
  .strict();
function deviceLabel(request: Request) {
  const agent = request.headers.get("user-agent") ?? "";
  return /Android/i.test(agent)
    ? "Android 浏览器"
    : /iPhone|iPad/i.test(agent)
      ? "iOS 浏览器"
      : /Windows/i.test(agent)
        ? "Windows 浏览器"
        : /Macintosh/i.test(agent)
          ? "Mac 浏览器"
          : "浏览器";
}
async function authenticateResponse(
  request: Request,
  store: PersonalSessions,
  register: boolean,
) {
  requirePersonalOrigin(request);
  const input = loginInput.safeParse(await readPersonalBody(request));
  if (!input.success)
    throw new AppError("INVALID_PARAMETER", "请填写账号和密码。", 400);
  const result = await store[register ? "register" : "login"](
    sessionCookie(request),
    input.data.username,
    input.data.password,
    request.signal,
    deviceLabel(request),
    requestRevision(request),
  );
  const current = await store.get(result.cookie);
  if (
    !current.authenticated ||
    current.deviceSessionId !== result.session.deviceSessionId ||
    current.browserRevision !== result.session.browserRevision
  )
    throw new AppError("SESSION_CHANGED", "登录状态已改变，请重试。", 409);
  return personalJson(
    { session: result.session },
    201,
    cookieHeader(request, result.cookie, result.cookieExpiresAt),
  );
}
export async function registrationResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    return await authenticateResponse(request, store, true);
  } catch (e) {
    return personalError(e);
  }
}
export async function sessionResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    const cookie = sessionCookie(request);
    if (request.method === "POST")
      return await authenticateResponse(request, store, false);
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
export async function connectionsResponse(
  request: Request,
  id?: string,
  store: PersonalSessions = personalSessions(),
  discover?: Discovery,
) {
  try {
    requirePersonalOrigin(request);
    const cookie = sessionCookie(request),
      revision = requestRevision(request);
    if (id && !z.string().uuid().safeParse(id).success)
      throw new AppError("INVALID_PARAMETER", "Token 参数不合法。", 400);
    if (request.method === "POST" && !id) {
      const input = z
        .object({
          providerId: z.string().min(1).max(80),
          token: z.string().min(1).max(4096),
          label: z.string().max(100).optional(),
        })
        .strict()
        .safeParse(await readPersonalBody(request));
      if (!input.success)
        throw new AppError("INVALID_PARAMETER", "请填写平台和 Token。", 400);
      const result = await store.bind(
        cookie,
        input.data.providerId,
        input.data.token,
        input.data.label,
        request.signal,
        revision,
      );
      let discoveryError: { code: string; message: string } | undefined;
      try {
        const service =
          discover ?? (store === personalSessions() ? discovery() : undefined);
        if (service) await service.ensure(cookie, result.connection.id);
      } catch (e) {
        discoveryError = {
          code: e instanceof AppError ? e.code : "DISCOVERY_UNAVAILABLE",
          message: "Token 已绑定，请重试仓库发现。",
        };
      }
      const current = await store.get(cookie);
      if (
        !current.authenticated ||
        current.deviceSessionId !== result.session.deviceSessionId ||
        current.selectionRevision !== result.session.selectionRevision ||
        current.browserRevision !== result.session.browserRevision
      )
        throw new AppError(
          "SESSION_CHANGED",
          "当前 Token 已改变，请重试。",
          409,
        );
      return personalJson(
        { ...result, ...(discoveryError ? { discoveryError } : {}) },
        201,
      );
    }
    if (request.method === "PATCH" && id) {
      const input = z
        .object({ label: z.string().min(1).max(100) })
        .strict()
        .safeParse(await readPersonalBody(request));
      if (!input.success)
        throw new AppError("INVALID_PARAMETER", "请填写名称。", 400);
      return personalJson({
        session: await store.renameConnection(
          cookie,
          id,
          input.data.label,
          revision,
        ),
      });
    }
    if (request.method === "DELETE" && id)
      return personalJson({
        session: await store.unbind(cookie, id, revision),
      });
    throw new AppError("METHOD_NOT_ALLOWED", "不支持此操作。", 405);
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
export async function switchConnectionResponse(
  request: Request,
  store: PersonalSessions = personalSessions(),
) {
  try {
    requirePersonalOrigin(request);
    const input = z
      .object({ connectionId: z.string().uuid() })
      .strict()
      .safeParse(await readPersonalBody(request));
    if (!input.success)
      throw new AppError("INVALID_PARAMETER", "请选择 Token。", 400);
    return personalJson(
      await store.switchConnection(
        sessionCookie(request),
        input.data.connectionId,
        request.signal,
        requestRevision(request),
      ),
    );
  } catch (e) {
    return personalError(e);
  }
}
