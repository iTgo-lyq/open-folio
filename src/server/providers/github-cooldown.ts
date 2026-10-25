import "server-only";
import { ProviderError, type ProviderIdentity } from "./types.ts";

const globals = globalThis as typeof globalThis & {
  folioGitHubCooldowns?: Map<string, number>;
};
export type CooldownOptions = {
  now?: () => number;
  deadlines?: Map<string, number>;
};
const key = (identity: ProviderIdentity) =>
  JSON.stringify([identity.instanceId, identity.subjectId]);
const limited = (seconds: number) =>
  new ProviderError(
    "RATE_LIMITED",
    `GitHub 暂时限制了请求，至少 ${seconds} 秒后再试；恢复时间以 GitHub 为准。`,
    429,
    String(seconds),
  );
async function errorMessage(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64 * 1024) return "";
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof body?.message === "string" ? body.message : "";
  } catch {
    return "";
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Record actual rejections only; no budgets, retries, timers or token data. */
export class GitHubCooldown {
  private now: () => number;
  private deadlines: Map<string, number>;
  constructor(options: CooldownOptions = {}) {
    this.now = options.now ?? Date.now;
    this.deadlines =
      options.deadlines ?? (globals.folioGitHubCooldowns ??= new Map());
  }
  check(identity?: ProviderIdentity) {
    if (!identity) return;
    const id = key(identity),
      until = this.deadlines.get(id);
    if (until === undefined) return;
    const remaining = until - this.now();
    if (remaining > 0) throw limited(Math.ceil(remaining / 1000));
    this.deadlines.delete(id);
  }
  async reject(response: Response, identity?: ProviderIdentity) {
    if (![403, 429].includes(response.status)) {
      await response.body?.cancel();
      return;
    }
    const message = await errorMessage(response);
    const retry = response.headers.get("retry-after");
    const primary = response.headers.get("x-ratelimit-remaining") === "0";
    if (
      response.status !== 429 &&
      !retry &&
      !primary &&
      !/\b(?:secondary rate limit|rate limit exceeded|abuse detection)\b/i.test(
        message,
      )
    )
      return;
    const now = this.now();
    const retryTime =
      retry && /^\d{1,10}$/.test(retry)
        ? now + Number(retry) * 1000
        : retry &&
            /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
              retry,
            )
          ? Date.parse(retry)
          : NaN;
    const reset = response.headers.get("x-ratelimit-reset");
    const resetTime =
      primary && reset && /^\d{1,12}$/.test(reset) ? Number(reset) * 1000 : NaN;
    const deadlines = [retryTime, resetTime].filter(Number.isFinite);
    // GitHub documents at least one minute when a secondary limit gives no deadline.
    let until = deadlines.length ? Math.max(now, ...deadlines) : now + 60_000;
    if (identity) {
      const id = key(identity);
      until = Math.max(until, this.deadlines.get(id) ?? 0);
      this.deadlines.set(id, until);
    }
    throw limited(Math.ceil((until - now) / 1000));
  }
}
