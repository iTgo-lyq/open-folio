import type { SessionSummary } from "../src/server/personal-sessions.ts";

type SmokeRequest = (path: string, init?: RequestInit) => Promise<Response>;
interface SmokeOptions {
  baseURL: string;
  username: string;
  password: string;
  token?: string;
  providerId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

async function checkedJson(response: Response, operation: string) {
  if (!response.ok)
    throw new Error(`${operation} returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation} returned invalid JSON`);
  }
}

function sessionSummary(value: unknown): SessionSummary {
  const session = value as SessionSummary | undefined;
  if (
    !session ||
    typeof session.authenticated !== "boolean" ||
    typeof session.connected !== "boolean" ||
    !Array.isArray(session.connections) ||
    (session.authenticated &&
      (!session.account?.id ||
        !session.deviceSessionId ||
        !Number.isSafeInteger(session.browserRevision) ||
        session.browserRevision! < 1)) ||
    (!session.authenticated &&
      (session.connected ||
        session.connections.length > 0 ||
        session.account !== undefined))
  )
    throw new Error("Smoke session response is incomplete");
  return session;
}

/** Owns one fresh Cookie jar. Always await this wrapper and all callback work. */
export async function withSmokeSession<T>(
  {
    baseURL,
    username,
    password,
    token,
    providerId = "github",
    timeoutMs = 30_000,
    fetch: transport = globalThis.fetch,
  }: SmokeOptions,
  check: (context: {
    request: SmokeRequest;
    session: SessionSummary;
    browserCookie: {
      name: string;
      value: string;
      url: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Lax";
    };
  }) => Promise<T>,
): Promise<T> {
  const base = new URL(baseURL);
  if (
    base.username ||
    base.password ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
      ))
  )
    throw new Error("Smoke verification requires HTTPS or a loopback URL");
  if (
    !username ||
    !password ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1
  )
    throw new Error(
      "Smoke verification requires account credentials and positive timeout",
    );

  let cookie = "";
  let revision: number | undefined;
  const request: SmokeRequest = async (path, init = {}) => {
    const url = new URL(path, base);
    if (url.origin !== base.origin || url.username || url.password)
      throw new Error("Smoke requests must stay on the configured origin");
    const headers = new Headers(init.headers);
    headers.set("Origin", base.origin);
    headers.set("User-Agent", "OpenFolioSmoke/1.0");
    headers.delete("Cookie");
    if (cookie) headers.set("Cookie", cookie);
    if (revision !== undefined && !headers.has("X-OpenFolio-Revision"))
      headers.set("X-OpenFolio-Revision", String(revision));
    const timeout = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await transport(url, {
        ...init,
        headers,
        credentials: "omit",
        redirect: "error",
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
    } catch {
      // Transport diagnostics can contain request headers; do not expose them.
      throw new Error("Smoke HTTP request failed or timed out");
    }
    const setCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("openfolio-account="));
    // Capture before parsing: a bad login body must still reach cleanup.
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };

  const readSession = async () => {
    const session = sessionSummary(
      await checkedJson(await request("/api/session"), "Read smoke session"),
    );
    revision = session.browserRevision;
    return session;
  };
  const cleanup = async () => {
    if (!cookie) return;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let session = await readSession();
        if (session.authenticated) {
          await checkedJson(
            await request("/api/session", { method: "DELETE" }),
            "Logout smoke session",
          );
          session = await readSession();
        }
        if (
          session.authenticated ||
          session.connected ||
          session.connections.length
        )
          throw new Error("Smoke session is still authorized after logout");
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      "Smoke session cleanup failed after 3 attempts; verify the test device before continuing",
      { cause: lastError },
    );
  };

  const errors: unknown[] = [];
  let result!: T;
  try {
    const login = await checkedJson(
      await request("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }),
      "Login smoke session",
    );
    let session = sessionSummary(login.session);
    if (!cookie || !session.authenticated)
      throw new Error("Smoke login did not establish a session");
    revision = session.browserRevision;
    if (token) {
      const bound = await checkedJson(
        await request("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerId, token }),
        }),
        "Bind smoke Token",
      );
      session = sessionSummary(bound.session);
      if (!session.authenticated || !session.connected)
        throw new Error("Smoke Token binding did not establish a workspace");
      revision = session.browserRevision;
    }
    result = await check({
      request,
      session,
      browserCookie: {
        name: "openfolio-account",
        value: cookie.slice("openfolio-account=".length),
        url: base.origin + "/",
        httpOnly: true,
        secure: base.protocol === "https:",
        sameSite: "Lax",
      },
    });
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "Smoke check and session cleanup failed");
  return result;
}
