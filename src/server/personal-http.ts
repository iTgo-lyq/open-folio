import "server-only";
import { AppError, publicError } from "./errors.ts";
import {
  personalSessions,
  type PersonalSessions,
  type SessionSummary,
} from "./personal-sessions.ts";
export const sessionCookieName = "openfolio-account";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function sessionCookie(request: Request) {
  const parts = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${sessionCookieName}=`));
  return parts.length === 1 ? parts[0].slice(sessionCookieName.length + 1) : "";
}
export function requestRevision(request: Request) {
  const value = request.headers.get("x-openfolio-revision");
  if (value === null) return -1;
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new AppError("INVALID_PARAMETER", "身份版本参数不合法。", 400);
  return Number(value);
}
export function requirePersonalOrigin(request: Request) {
  const url = new URL(request.url);
  const secure =
    url.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  // Next.js can construct request.url from its internal listener behind a proxy.
  // Host is the browser-facing authority; never trust an arbitrary forwarded-host.
  const authority = request.headers.get("host") ?? url.host;
  let external: URL;
  try {
    if (/[\s/@?#\\]/.test(authority)) throw Error();
    external = new URL(`${secure ? "https:" : url.protocol}//${authority}`);
  } catch {
    throw new AppError("ORIGIN_DENIED", "请从本站页面提交请求。", 403);
  }
  if (
    !secure &&
    !["localhost", "127.0.0.1", "[::1]"].includes(external.hostname)
  )
    throw new AppError("HTTPS_REQUIRED", "远程连接需要 HTTPS。", 400);
  const origin = request.headers.get("origin"),
    site = request.headers.get("sec-fetch-site");
  const expected = external.origin;
  if (
    site === "cross-site" ||
    (origin ? origin !== expected : site !== "same-origin")
  )
    throw new AppError("ORIGIN_DENIED", "请从本站页面提交请求。", 403);
}
export function cookieHeader(
  request: Request,
  value: string,
  expiresAt?: number,
) {
  const secure =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${value && expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0}${secure ? "; Secure" : ""}`;
}
export const personalJson = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, {
    status,
    headers: { ...privateHeaders, ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
export function personalError(error: unknown) {
  const e = publicError(error);
  const response = personalJson(
    {
      error: {
        code: e.code,
        message: e.message,
        ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}),
      },
    },
    e.status,
  );
  if (e.retryAfter) response.headers.set("Retry-After", e.retryAfter);
  return response;
}
export async function renewPersonalResponse(
  request: Request,
  response: Response,
  store: PersonalSessions = personalSessions(),
  selection?: Pick<SessionSummary, "deviceSessionId" | "selectionRevision">,
) {
  const cookie = sessionCookie(request);
  const current = await store.get(cookie);
  if (response.ok && !current.authenticated)
    throw new AppError("SESSION_REQUIRED", "设备会话已失效，请重新登录。", 401);
  if (
    response.ok &&
    selection &&
    (current.deviceSessionId !== selection.deviceSessionId ||
      current.selectionRevision !== selection.selectionRevision)
  )
    throw new AppError("SESSION_CHANGED", "当前身份已改变，请重试。", 409);
  if (
    response.ok &&
    request.headers.has("x-openfolio-revision") &&
    current.browserRevision !== requestRevision(request)
  )
    throw new AppError("SESSION_CHANGED", "当前身份已改变，请重试。", 409);
  // The browser Cookie lives until the absolute deadline. Idle renewal stays
  // server-side so a delayed read cannot overwrite a newer login Cookie.
  return response;
}
export async function readPersonalBody(request: Request, maxBytes = 16 * 1024) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new AppError("INVALID_PARAMETER", "需要 JSON 请求。", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_PARAMETER", "请填写连接信息。", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes)
        throw new AppError("BODY_TOO_LARGE", "请求内容过长。", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError("INVALID_PARAMETER", "请求内容不是有效 JSON。", 400);
  }
}
