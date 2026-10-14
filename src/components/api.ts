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
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    path.startsWith("/api/session") &&
    personalRevision !== undefined &&
    !headers.has("X-OpenFolio-Revision")
  )
    headers.set("X-OpenFolio-Revision", String(personalRevision));
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
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
