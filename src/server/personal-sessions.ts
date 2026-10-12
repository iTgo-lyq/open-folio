import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  open,
  chmod,
  stat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.ts";
import { dataDirectory } from "./config.ts";
import { providers, type ProviderRegistry } from "./providers/registry.ts";
import { SecretHandle, type ProviderContext } from "./providers/types.ts";

const identitySchema = z
  .object({
    providerId: z.string().min(1).max(80),
    instanceId: z.string().min(1).max(255),
    subjectId: z.string().min(1).max(100),
    login: z.string().min(1).max(100),
    displayName: z.string().max(500),
  })
  .strict();
const connectionSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    identity: identitySchema,
    label: z.string().min(1).max(100),
    nonce: z.string(),
    ciphertext: z.string().max(8192),
    tag: z.string(),
  })
  .strict();
const sessionSchema = z
  .object({
    id: z.string().uuid(),
    cookieHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.number().int().positive(),
    connections: z.array(connectionSchema).max(32),
  })
  .strict();
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessions: z.array(sessionSchema).max(10000),
  })
  .strict();
type Connection = z.infer<typeof connectionSchema>;
type Session = z.infer<typeof sessionSchema>;
type State = z.infer<typeof stateSchema>;
export type ConnectionSummary = Pick<
  Connection,
  "id" | "revision" | "identity" | "label"
>;
export interface SessionSummary {
  connected: boolean;
  expiresAt?: number;
  connections: ConnectionSummary[];
}
export interface ConnectionLease {
  sessionId: string;
  connection: ConnectionSummary;
  context: ProviderContext;
  assertCurrent(): Promise<void>;
  release(): void;
}
const ttl = 30 * 24 * 60 * 60 * 1000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const denied = () =>
  new AppError("SESSION_REQUIRED", "请连接自己的 GitHub 账号。", 401);
const summary = (s: Session | null): SessionSummary => ({
  connected: !!s,
  ...(s ? { expiresAt: s.expiresAt } : {}),
  connections:
    s?.connections.map(({ id, revision, identity, label }) => ({
      id,
      revision,
      identity,
      label,
    })) ?? [],
});
const globals = globalThis as typeof globalThis & {
  folioSessionLocks?: Map<string, Promise<unknown>>;
  folioSessionOperations?: Map<string, Set<AbortController>>;
  folioSessionStores?: Map<string, PersonalSessions>;
};
const locks = () => (globals.folioSessionLocks ??= new Map());
const operations = () => (globals.folioSessionOperations ??= new Map());
const opKey = (root: string, sid: string, cid: string) =>
  `${root}/${sid}/${cid}`;
async function atomic(path: string, body: string | Buffer) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, body, { flag: "wx", mode: 0o600 });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export class PersonalSessions {
  readonly root: string;
  readonly registry: ProviderRegistry;
  readonly keyPath: string;
  constructor(
    root: string,
    registry: ProviderRegistry = providers,
    keyPath = process.env.OPENFOLIO_CREDENTIAL_KEY_FILE ||
      join(root, "credential-key"),
  ) {
    this.root = root;
    this.registry = registry;
    this.keyPath = keyPath;
  }
  private async lock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = locks().get(this.root) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await chmod(this.root, 0o700);
        const path = join(this.root, "writer.lock");
        for (let n = 0; n < 2; n++)
          try {
            const file = await open(path, "wx", 0o600);
            await file.writeFile(String(process.pid));
            await file.close();
            break;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
            const pid = Number(await readFile(path, "utf8"));
            if (pid === process.pid) break;
            let alive = true;
            try {
              process.kill(pid, 0);
            } catch (error) {
              alive = (error as NodeJS.ErrnoException).code !== "ESRCH";
            }
            if (!Number.isSafeInteger(pid) || pid <= 0 || alive)
              throw new AppError(
                "SESSION_LOCKED",
                "个人数据正由其他服务使用，请保持单实例部署。",
              );
            await unlink(path);
          }
        return operation();
      });
    locks().set(this.root, next);
    try {
      return await next;
    } finally {
      if (locks().get(this.root) === next) locks().delete(this.root);
    }
  }
  private async load(): Promise<State> {
    try {
      return stateSchema.parse(
        JSON.parse(await readFile(join(this.root, "sessions.json"), "utf8")),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { schemaVersion: 1, sessions: [] };
      throw new AppError(
        "SESSION_DATA_INVALID",
        "个人连接数据不可读，请检查数据与密钥备份。",
      );
    }
  }
  private async key(state: State): Promise<Buffer> {
    try {
      let body: Buffer;
      try {
        body = await readFile(this.keyPath);
      } catch (e) {
        if (
          (e as NodeJS.ErrnoException).code !== "ENOENT" ||
          state.sessions.some((s) => s.connections.length)
        )
          throw e;
        await mkdir(dirname(this.keyPath), { recursive: true, mode: 0o700 });
        await writeFile(this.keyPath, randomBytes(32), {
          flag: "wx",
          mode: 0o600,
        }).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "EEXIST") throw error;
        });
        body = await readFile(this.keyPath);
      }
      const info = await stat(this.keyPath);
      if (body.length !== 32 || !info.isFile() || info.mode & 0o077)
        throw new Error();
      return body;
    } catch {
      throw new AppError(
        "CREDENTIAL_KEY_UNAVAILABLE",
        "无法恢复个人连接，请检查凭据密钥；原数据已保留。",
      );
    }
  }
  private async save(state: State) {
    await atomic(join(this.root, "sessions.json"), JSON.stringify(state));
  }
  private stop(s: Session, cid?: string) {
    for (const c of s.connections) {
      if (cid && c.id !== cid) continue;
      for (const op of operations().get(opKey(this.root, s.id, c.id)) ?? [])
        op.abort();
      operations().delete(opKey(this.root, s.id, c.id));
    }
  }
  private async prune(state: State) {
    const expired = state.sessions.filter((s) => s.expiresAt <= Date.now());
    if (!expired.length) return;
    expired.forEach((s) => this.stop(s));
    state.sessions = state.sessions.filter((s) => s.expiresAt > Date.now());
    await this.save(state);
  }
  private find(state: State, cookie: string) {
    return /^[A-Za-z0-9_-]{43}$/.test(cookie)
      ? (state.sessions.find(
          (s) => s.cookieHash === hash(cookie) && s.expiresAt > Date.now(),
        ) ?? null)
      : null;
  }
  private aad(sid: string, c: Pick<Connection, "id" | "revision">) {
    return Buffer.from(JSON.stringify([1, sid, c.id, c.revision]));
  }
  private encrypt(
    sid: string,
    c: Pick<Connection, "id" | "revision">,
    secret: SecretHandle,
    key: Buffer,
  ) {
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(this.aad(sid, c));
    const ciphertext = secret.use((value) =>
      Buffer.concat([cipher.update(value, "utf8"), cipher.final()]),
    );
    return {
      nonce: nonce.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    };
  }
  private decrypt(sid: string, c: Connection, key: Buffer) {
    try {
      const nonce = Buffer.from(c.nonce, "base64url"),
        tag = Buffer.from(c.tag, "base64url");
      if (nonce.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(this.aad(sid, c));
      decipher.setAuthTag(tag);
      return new SecretHandle(
        Buffer.concat([
          decipher.update(Buffer.from(c.ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8"),
      );
    } catch {
      throw new AppError(
        "CREDENTIAL_UNREADABLE",
        "连接凭据无法解密，请检查密钥或重新连接。",
      );
    }
  }
  async get(cookie: string): Promise<SessionSummary> {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie);
      if (s) {
        const key = await this.key(state);
        for (const c of s.connections) this.decrypt(s.id, c, key);
      }
      return summary(s);
    });
  }
  async connect(
    cookie: string,
    providerId: string,
    input: string,
    label: string | undefined,
    signal: AbortSignal,
    replaceId?: string,
  ) {
    // Validate ownership before sending a replacement token anywhere.
    if (replaceId) {
      const current = await this.get(cookie);
      if (!current.connections.some((c) => c.id === replaceId)) throw denied();
    }
    const secret = new SecretHandle(input);
    const provider = this.registry.get(providerId);
    const identity = await provider.authenticate(secret, signal);
    const cleanLabel = label?.trim();
    if (
      cleanLabel !== undefined &&
      (!cleanLabel ||
        cleanLabel.length > 100 ||
        /[\x00-\x1f\x7f]/.test(cleanLabel))
    )
      throw new AppError("INVALID_LABEL", "连接名称需为 1–100 个字符。", 400);
    return this.lock(async () => {
      signal.throwIfAborted();
      const state = await this.load();
      await this.prune(state);
      let s = this.find(state, cookie);
      if (cookie && !s) throw denied();
      if (!s) {
        if (replaceId) throw denied();
        if (state.sessions.length >= 10000)
          throw new AppError(
            "SESSION_LIMIT",
            "个人会话数量达到上限，请稍后再试。",
          );
        s = {
          id: randomUUID(),
          cookieHash: "",
          expiresAt: Date.now() + ttl,
          connections: [],
        };
        state.sessions.push(s);
      }
      const old = replaceId
        ? s.connections.find((c) => c.id === replaceId)
        : undefined;
      if (replaceId && !old) throw denied();
      if (
        old &&
        (old.identity.subjectId !== identity.subjectId ||
          old.identity.instanceId !== identity.instanceId ||
          old.identity.providerId !== identity.providerId)
      )
        throw new AppError(
          "IDENTITY_CHANGED",
          "此 token 属于其他账号，请添加新连接。",
          409,
        );
      if (!old && s.connections.length >= 32)
        throw new AppError(
          "CONNECTION_LIMIT",
          "连接数量达到上限，请先移除不用的连接。",
          400,
        );
      const key = await this.key(state);
      const id = old?.id ?? randomUUID();
      const revision = (old?.revision ?? 0) + 1;
      const c: Connection = {
        id,
        revision,
        identity,
        label:
          cleanLabel ??
          old?.label ??
          `${identity.login} · ${s.connections.length + 1}`,
        ...this.encrypt(s.id, { id, revision }, secret, key),
      };
      const token = randomBytes(32).toString("base64url");
      s.cookieHash = hash(token);
      if (old) {
        s.connections[s.connections.indexOf(old)] = c;
      } else s.connections.push(c);
      await this.save(state);
      if (old) this.stop(s, old.id);
      return {
        cookie: token,
        session: summary(s),
        connection: summary(s).connections.find((x) => x.id === id)!,
      };
    });
  }
  async remove(cookie: string, id?: string) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie);
      if (!s) throw denied();
      if (id && !s.connections.some((c) => c.id === id)) throw denied();
      const removed = { ...s, connections: [...s.connections] };
      if (id) s.connections = s.connections.filter((c) => c.id !== id);
      else state.sessions = state.sessions.filter((x) => x.id !== s.id);
      if (id && !s.connections.length)
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
      await this.save(state);
      this.stop(removed, id);
      return summary(state.sessions.find((x) => x.id === s.id) ?? null);
    });
  }
  async lease(
    cookie: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<ConnectionLease> {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie);
      const c = s?.connections.find((c) => c.id === id);
      if (!s || !c) throw denied();
      const secret = this.decrypt(s.id, c, await this.key(state)),
        controller = new AbortController(),
        key = opKey(this.root, s.id, c.id);
      const set = operations().get(key) ?? new Set<AbortController>();
      set.add(controller);
      operations().set(key, set);
      const connection = summary(s).connections.find((x) => x.id === id)!;
      return {
        sessionId: s.id,
        connection,
        context: {
          identity: c.identity,
          secret,
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        },
        assertCurrent: async () => {
          controller.signal.throwIfAborted();
          const latest = await this.load();
          const session = latest.sessions.find(
            (x) => x.id === s.id && x.expiresAt > Date.now(),
          );
          const current = session?.connections.find(
            (x) => x.id === id && x.revision === c.revision,
          );
          if (!current) {
            controller.abort();
            throw denied();
          }
        },
        release: () => {
          set.delete(controller);
          if (!set.size && operations().get(key) === set)
            operations().delete(key);
        },
      };
    });
  }
}
export function personalSessions() {
  const root = join(dataDirectory(), "personal-v1");
  const stores = (globals.folioSessionStores ??= new Map());
  let store = stores.get(root);
  if (!store) {
    store = new PersonalSessions(root);
    stores.set(root, store);
  }
  return store;
}
