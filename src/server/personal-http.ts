import "server-only";
import { AppError, publicError } from "./errors.ts";
import { ProviderError } from "./providers/types.ts";
import {
  personalSessions,
  type PersonalSessions,
} from "./personal-sessions.ts";
export const sessionCookieName = "openfolio-session";
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
  return personalJson(
    {
      error: {
        code: e.code,
        message: e.message,
        ...(e instanceof ProviderError && e.retryAfter
          ? { retryAfter: e.retryAfter }
          : {}),
      },
    },
    e.status,
  );
}
export async function renewPersonalResponse(
  request: Request,
  response: Response,
  store: PersonalSessions = personalSessions(),
) {
  const cookie = sessionCookie(request);
  const current = await store.get(cookie);
  if (response.ok && !current.connected)
    throw new AppError("SESSION_REQUIRED", "设备会话已失效，请重新登录。", 401);
  // The browser Cookie lives until the absolute deadline. Idle renewal stays
  // server-side so a delayed read cannot overwrite a newer login Cookie.
  return response;
}
export async function readPersonalBody(request: Request) {
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
      if (size > 16 * 1024)
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
