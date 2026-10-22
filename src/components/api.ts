export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
let personalRevision: number | undefined;
export function setPersonalRevision(revision?: number) {
  personalRevision = revision;
}
// Native image/iframe loads do not pass through api(). Diagnose a failed scoped
// resource without cookies so version changes and lost sources reach the reader.
export async function reportSharedResourceFailure(path: string) {
  if (!path.startsWith("/api/shared-changes/")) return;
  try {
    const response = await fetch(path, {
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    const data = await response.json();
    window.dispatchEvent(
      new CustomEvent("openfolio-share-error", {
        detail: { path, code: data.error?.code, message: data.error?.message },
      }),
    );
  } catch {
    /* Keep the resource's normal failure display for transport errors. */
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    (path.startsWith("/api/session") ||
      path.startsWith("/api/connections") ||
      path.startsWith("/api/accounts") ||
      (init?.method &&
        !["GET", "HEAD"].includes(init.method) &&
        path.startsWith("/api/repositories/"))) &&
    personalRevision !== undefined &&
    !headers.has("X-OpenFolio-Revision")
  )
    headers.set("X-OpenFolio-Revision", String(personalRevision));
  const sharedRead =
    path.startsWith("/api/shared-changes/") &&
    (!init?.method || ["GET", "HEAD"].includes(init.method));
  const response = await fetch(path, {
    ...init,
    ...(sharedRead ? { credentials: "omit" as const } : {}),
    headers,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    if (typeof window !== "undefined" && sharedRead && !init?.signal?.aborted)
      window.dispatchEvent(
        new CustomEvent("openfolio-share-error", {
          detail: {
            path,
            code: data.error?.code,
            message: data.error?.message,
          },
        }),
      );
    if (
      typeof window !== "undefined" &&
      path.startsWith("/api/repositories/") &&
      [
        "TOKEN_INVALID",
        "SESSION_REQUIRED",
        "READ_DENIED",
        "IDENTITY_CHANGED",
        "REPOSITORY_MISMATCH",
        "CONNECTION_CHANGED",
      ].includes(data.error?.code)
    )
      window.dispatchEvent(new CustomEvent("openfolio-read-denied"));
    throw new ApiError(
      data.error?.code ?? "FAILED",
      data.error?.message ?? "读取失败，请重试。",
    );
  }
  return data;
}
