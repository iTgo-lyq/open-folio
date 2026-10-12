export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: "no-store" });
  } catch (e) {
    if (
      !init?.signal?.aborted &&
      typeof window !== "undefined" &&
      path.startsWith("/api/repositories/")
    )
      window.dispatchEvent(new CustomEvent("openfolio-read-denied"));
    throw e;
  }
  const data = await response.json();
  if (!response.ok) {
    if (
      typeof window !== "undefined" &&
      path.startsWith("/api/repositories/") &&
      [
        "TOKEN_INVALID",
        "SESSION_REQUIRED",
        "READ_DENIED",
        "IDENTITY_CHANGED",
        "PROVIDER_UNAVAILABLE",
        "GIT_READ_FAILED",
        "RATE_LIMITED",
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
