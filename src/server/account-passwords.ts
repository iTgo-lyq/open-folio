import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors.ts";

export function accountInput(username: string, password: string) {
  const name = username.trim();
  if (!name || [...name].length > 64 || /\p{Cc}/u.test(name))
    throw new AppError(
      "INVALID_USERNAME",
      "账号为 1–64 个字符，不能包含控制字符。",
      400,
    );
  if ([...password].length < 8 || [...password].length > 128)
    throw new AppError("INVALID_PASSWORD", "密码为 8–128 个字符。", 400);
  return { username: name, usernameKey: name.normalize("NFKC").toLowerCase() };
}
const globals = globalThis as typeof globalThis & {
  folioPasswordGate?: {
    active: number;
    waiting: (() => void)[];
    failures: Map<string, { count: number; until: number }>;
  };
};
const gate = () =>
  (globals.folioPasswordGate ??= {
    active: 0,
    waiting: [] as (() => void)[],
    failures: new Map<string, { count: number; until: number }>(),
  });
function throttled(seconds = 300) {
  const error = new AppError(
    "AUTH_RATE_LIMITED",
    "尝试过于频繁，请稍后再试。",
    429,
  );
  error.retryAfter = String(seconds);
  return error;
}
export async function withPasswordGate<T>(
  key: string,
  now: () => number,
  operation: () => Promise<T>,
) {
  const g = gate();
  for (const [id, entry] of g.failures)
    if (entry.until <= now()) g.failures.delete(id);
  const entry = g.failures.get(key);
  if (entry && entry.count >= 5)
    throw throttled(Math.max(1, Math.ceil((entry.until - now()) / 1000)));
  if (g.active >= 2) {
    if (g.waiting.length >= 8) throw throttled(1);
    await new Promise<void>((resolve) => g.waiting.push(resolve));
  } else g.active++;
  try {
    // Queued requests must observe failures recorded while they waited.
    const latest = g.failures.get(key);
    if (latest && latest.until > now() && latest.count >= 5)
      throw throttled(Math.max(1, Math.ceil((latest.until - now()) / 1000)));
    const value = await operation();
    g.failures.delete(key);
    return value;
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_CREDENTIALS") {
      const previous = g.failures.get(key);
      if (!previous && g.failures.size >= 10000) throw throttled();
      g.failures.set(key, {
        count: (previous?.count ?? 0) + 1,
        until: previous?.until ?? now() + 300000,
      });
    }
    throw error;
  } finally {
    const next = g.waiting.shift();
    if (next) next();
    else g.active--;
  }
}
export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex"),
) {
  const hash = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
  return { passwordSalt: salt, passwordHash: hash.toString("hex") };
}
export async function verifyPassword(
  password: string,
  account?: { passwordSalt: string; passwordHash: string },
) {
  const result = await hashPassword(
    password,
    account?.passwordSalt ?? "00".repeat(16),
  );
  return (
    timingSafeEqual(
      Buffer.from(result.passwordHash, "hex"),
      Buffer.from(account?.passwordHash ?? "00".repeat(64), "hex"),
    ) && !!account
  );
}
