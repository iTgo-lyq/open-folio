import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
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
  lstat,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.ts";
import { dataDirectory } from "./config.ts";
import { providers, type ProviderRegistry } from "./providers/registry.ts";
import { SecretHandle, type ProviderContext } from "./providers/types.ts";

export const identitySchema = z
  .object({
    providerId: z.string().min(1).max(80),
    instanceId: z.string().min(1).max(255),
    subjectId: z.string().min(1).max(100),
    login: z.string().min(1).max(100),
    displayName: z.string().max(500),
  })
  .strict();
export const preferencesSchema = z
  .object({
    repository: z
      .object({
        providerId: z.string().min(1).max(80),
        instanceId: z.string().min(1).max(255),
        repositoryId: z.string().min(1).max(100),
        fullName: z.string().min(1).max(255),
      })
      .strict()
      .nullable()
      .optional(),
    module: z.enum(["specs", "changes", "prototypes"]).optional(),
    railCollapsed: z.boolean().optional(),
  })
  .strict();
export const workspaceSchema = z
  .object({
    id: z.string().uuid(),
    credentialFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    providerId: z.string().min(1).max(80),
    instanceId: z.string().min(1).max(255),
    identity: identitySchema,
    gitUsername: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^\x00-\x20\x7f:]+$/),
    label: z.string().min(1).max(100),
    nonce: z.string(),
    ciphertext: z.string().max(8192),
    tag: z.string(),
    preferences: preferencesSchema,
    createdAt: z.number().int().positive(),
    legacyConnectionIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export const deviceSchema = z
  .object({
    id: z.string().uuid(),
    cookieHash: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceId: z.string().uuid(),
    createdAt: z.number().int().positive(),
    lastSeenAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    absoluteExpiresAt: z.number().int().positive(),
    displayLabel: z.string().min(1).max(100),
  })
  .strict();
export const legacySelectionSchema = z
  .object({
    cookieHash: z.string().regex(/^[a-f0-9]{64}$/),
    sessionId: z.string().uuid(),
    expiresAt: z.number().int().positive(),
    choices: z
      .array(
        z
          .object({
            connectionId: z.string().uuid(),
            workspaceId: z.string().uuid(),
          })
          .strict(),
      )
      .max(32),
  })
  .strict();
export const workspaceStateSchema = z
  .object({
    schemaVersion: z.literal(2),
    workspaces: z.array(workspaceSchema).max(10000),
    sessions: z.array(deviceSchema).max(10000),
    legacySelections: z.array(legacySelectionSchema).max(10000),
  })
  .strict();
export type Workspace = z.infer<typeof workspaceSchema>;
export type DeviceSession = z.infer<typeof deviceSchema>;
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;
export type WorkspacePreferences = z.infer<typeof preferencesSchema>;
export type WorkspaceSummary = Pick<
  Workspace,
  "id" | "identity" | "label" | "gitUsername" | "preferences"
>;
export type ConnectionSummary = Pick<
  WorkspaceSummary,
  "id" | "identity" | "label"
> & { revision: number };
export interface SessionSummary {
  connected: boolean;
  deviceSessionId?: string;
  expiresAt?: number;
  absoluteExpiresAt?: number;
  workspace?: WorkspaceSummary;
  connections: ConnectionSummary[];
  renewed?: boolean;
  legacyChoices?: ConnectionSummary[];
}
export interface ConnectionLease {
  sessionId: string;
  deviceSessionId: string;
  workspaceId: string;
  connection: ConnectionSummary;
  context: ProviderContext;
  assertCurrent(): Promise<void>;
  release(): void;
}
export const sessionIdleTtl = 30 * 24 * 60 * 60 * 1000;
export const sessionAbsoluteTtl = 90 * 24 * 60 * 60 * 1000;
const touchInterval = 24 * 60 * 60 * 1000;
export const cookieHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const denied = () =>
  new AppError("SESSION_REQUIRED", "请使用 Git 用户名与 token 登录。", 401);
const workspaceSummary = (w: Workspace): WorkspaceSummary => ({
  id: w.id,
  identity: w.identity,
  label: w.label,
  gitUsername: w.gitUsername,
  preferences: w.preferences,
});
export const connectionSummary = (w: Workspace): ConnectionSummary => ({
  id: w.id,
  revision: 1,
  identity: w.identity,
  label: w.label,
});
const summary = (
  s?: DeviceSession,
  w?: Workspace,
  renewed = false,
): SessionSummary =>
  s && w
    ? {
        connected: true,
        deviceSessionId: s.id,
        expiresAt: s.expiresAt,
        absoluteExpiresAt: s.absoluteExpiresAt,
        workspace: workspaceSummary(w),
        connections: [connectionSummary(w)],
        ...(renewed ? { renewed: true } : {}),
      }
    : { connected: false, connections: [] };
const globals = globalThis as typeof globalThis & {
  folioWorkspaceLocks?: Map<string, Promise<unknown>>;
  folioDeviceOperations?: Map<string, Set<AbortController>>;
  folioWorkspaceOperations?: Map<string, Set<AbortController>>;
  folioWorkspaceStores?: Map<string, PersonalSessions>;
};
const locks = () => (globals.folioWorkspaceLocks ??= new Map());
const operations = () => (globals.folioDeviceOperations ??= new Map());
const workspaceOperations = () =>
  (globals.folioWorkspaceOperations ??= new Map());
export async function atomicPrivate(path: string, body: string | Buffer) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, body, { flag: "wx", mode: 0o600 });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export async function privateKey(
  path: string,
  create: boolean,
): Promise<Buffer> {
  try {
    if (create) {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, randomBytes(32), { flag: "wx", mode: 0o600 }).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code !== "EEXIST") throw e;
        },
      );
    }
    const info = await lstat(path),
      body = await readFile(path);
    if (!info.isFile() || body.length !== 32 || info.mode & 0o077)
      throw Error();
    return body;
  } catch {
    throw new AppError(
      "CREDENTIAL_KEY_UNAVAILABLE",
      "凭据密钥不可用，原数据已保留，请检查配套备份。",
      503,
    );
  }
}
export function credentialFingerprint(
  key: Buffer,
  providerId: string,
  instanceId: string,
  secret: SecretHandle,
) {
  return secret.use((token) =>
    createHmac("sha256", key)
      .update(JSON.stringify([providerId, instanceId, token]))
      .digest("hex"),
  );
}
const aad = (w: Pick<Workspace, "id" | "providerId" | "instanceId">) =>
  Buffer.from(JSON.stringify([2, w.id, w.providerId, w.instanceId]));
export function encryptWorkspace(
  w: Pick<Workspace, "id" | "providerId" | "instanceId">,
  secret: SecretHandle,
  key: Buffer,
) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(w));
  const ciphertext = secret.use((value) =>
    Buffer.concat([cipher.update(value, "utf8"), cipher.final()]),
  );
  return {
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}
export function decryptWorkspace(w: Workspace, key: Buffer) {
  try {
    const nonce = Buffer.from(w.nonce, "base64url"),
      tag = Buffer.from(w.tag, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad(w));
    decipher.setAuthTag(tag);
    return new SecretHandle(
      Buffer.concat([
        decipher.update(Buffer.from(w.ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new AppError(
      "CREDENTIAL_UNREADABLE",
      "工作台凭据无法解密，请检查配套密钥备份。",
      503,
    );
  }
}

export class PersonalSessions {
  readonly root: string;
  readonly registry: ProviderRegistry;
  readonly keyPath: string;
  readonly identityKeyPath: string;
  readonly now: () => number;
  constructor(
    root: string,
    registry: ProviderRegistry = providers,
    keyPath = process.env.OPENFOLIO_CREDENTIAL_KEY_FILE ||
      join(root, "credential-key"),
    now: () => number = Date.now,
  ) {
    this.root = root;
    this.registry = registry;
    this.keyPath = keyPath;
    this.identityKeyPath = join(root, "identity-key");
    this.now = now;
  }
  private async lock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = locks().get(this.root) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await chmod(this.root, 0o700);
        const path = join(this.root, "writer.lock");
        for (let n = 0; n < 2; n++) {
          try {
            const file = await open(path, "wx", 0o600);
            await file.writeFile(String(process.pid));
            await file.close();
            break;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
            const pid = Number(await readFile(path, "utf8"));
            let alive = true;
            try {
              process.kill(pid, 0);
            } catch (error) {
              alive = (error as NodeJS.ErrnoException).code !== "ESRCH";
            }
            if (pid === process.pid) break;
            if (!Number.isSafeInteger(pid) || pid <= 0 || alive)
              throw new AppError(
                "SESSION_LOCKED",
                "个人数据由其他服务使用，请保持单实例部署。",
                503,
              );
            await unlink(path);
          }
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
  private async load(): Promise<WorkspaceState> {
    try {
      let raw: string;
      try {
        raw = await readFile(join(this.root, "state.json"), "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        const { migratePersonalV1 } = await import("./workspace-migration.ts");
        if (
          !(await migratePersonalV1(
            this.root,
            this.keyPath,
            this.identityKeyPath,
          ))
        )
          return {
            schemaVersion: 2,
            workspaces: [],
            sessions: [],
            legacySelections: [],
          };
        raw = await readFile(join(this.root, "state.json"), "utf8");
      }
      const state = workspaceStateSchema.parse(JSON.parse(raw));
      const ids = new Set(state.workspaces.map((w) => w.id));
      if (
        ids.size !== state.workspaces.length ||
        new Set(state.workspaces.map((w) => w.credentialFingerprint)).size !==
          state.workspaces.length ||
        new Set(state.sessions.map((s) => s.cookieHash)).size !==
          state.sessions.length ||
        new Set(state.sessions.map((s) => s.id)).size !==
          state.sessions.length ||
        state.sessions.some(
          (s) => !ids.has(s.workspaceId) || s.expiresAt > s.absoluteExpiresAt,
        ) ||
        state.workspaces.some(
          (w) =>
            w.providerId !== w.identity.providerId ||
            w.instanceId !== w.identity.instanceId,
        ) ||
        state.legacySelections.some((s) =>
          s.choices.some((c) => !ids.has(c.workspaceId)),
        )
      )
        throw Error();
      await this.keys(false);
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return {
          schemaVersion: 2,
          workspaces: [],
          sessions: [],
          legacySelections: [],
        };
      if (e instanceof AppError) throw e;
      throw new AppError(
        "SESSION_DATA_INVALID",
        "工作台数据不可读，原数据已保留。",
        503,
      );
    }
  }
  private async keys(create: boolean) {
    return {
      credential: await privateKey(this.keyPath, create),
      identity: await privateKey(this.identityKeyPath, create),
    };
  }
  private save(state: WorkspaceState) {
    return atomicPrivate(
      join(this.root, "state.json"),
      JSON.stringify(workspaceStateSchema.parse(state)),
    );
  }
  private stopDevice(s: DeviceSession) {
    const key = `${this.root}/${s.id}`;
    for (const controller of operations().get(key) ?? []) controller.abort();
    operations().delete(key);
  }
  private stopWorkspace(id: string) {
    const key = `${this.root}/${id}`;
    for (const controller of workspaceOperations().get(key) ?? [])
      controller.abort();
    workspaceOperations().delete(key);
  }
  private async prune(state: WorkspaceState) {
    const expired = state.sessions.filter(
      (s) => s.expiresAt <= this.now() || s.absoluteExpiresAt <= this.now(),
    );
    const choices = state.legacySelections.filter(
      (s) => s.expiresAt > this.now(),
    );
    if (!expired.length && choices.length === state.legacySelections.length)
      return;
    state.sessions = state.sessions.filter((s) => !expired.includes(s));
    state.legacySelections = choices;
    await this.save(state);
    expired.forEach((s) => this.stopDevice(s));
  }
  private find(state: WorkspaceState, cookie: string) {
    return /^[A-Za-z0-9_-]{43}$/.test(cookie)
      ? state.sessions.find(
          (s) =>
            s.cookieHash === cookieHash(cookie) &&
            s.expiresAt > this.now() &&
            s.absoluteExpiresAt > this.now(),
        )
      : undefined;
  }
  private async touch(state: WorkspaceState, s: DeviceSession) {
    if (this.now() - s.lastSeenAt < touchInterval) return false;
    s.lastSeenAt = this.now();
    s.expiresAt = Math.min(this.now() + sessionIdleTtl, s.absoluteExpiresAt);
    await this.save(state);
    return true;
  }
  async get(cookie: string): Promise<SessionSummary> {
    const result = await this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie),
        w = state.workspaces.find((w) => w.id === s?.workspaceId);
      if (!s || !w) {
        const legacy = state.legacySelections.find(
          (x) => x.cookieHash === cookieHash(cookie),
        );
        return legacy
          ? {
              ...summary(),
              legacyChoices: legacy.choices.map((c) => ({
                ...connectionSummary(
                  state.workspaces.find((w) => w.id === c.workspaceId)!,
                ),
                id: c.connectionId,
              })),
            }
          : summary();
      }
      decryptWorkspace(w, (await this.keys(false)).credential);
      return summary(s, w, await this.touch(state, s));
    });
    return result;
  }
  async login(
    cookie: string,
    providerId: string,
    input: string,
    username: string | undefined,
    label: string | undefined,
    signal: AbortSignal,
    displayLabel = "浏览器",
  ) {
    const secret = new SecretHandle(input),
      cleanName = username?.trim(),
      cleanLabel = label?.trim();
    if (
      cleanName !== undefined &&
      (!cleanName ||
        cleanName.length > 255 ||
        /[\x00-\x20\x7f:]/.test(cleanName))
    )
      throw new AppError("INVALID_USERNAME", "请输入有效的 Git 用户名。", 400);
    if (
      cleanLabel !== undefined &&
      (!cleanLabel ||
        cleanLabel.length > 100 ||
        /[\x00-\x1f\x7f]/.test(cleanLabel))
    )
      throw new AppError("INVALID_LABEL", "名称需为 1–100 个字符。", 400);
    const provider = this.registry.get(providerId),
      authenticated = await provider.authenticate(secret, signal, cleanName);
    const identity = identitySchema.parse({
      providerId: authenticated.providerId,
      instanceId: authenticated.instanceId,
      subjectId: authenticated.subjectId,
      login: authenticated.login,
      displayName: authenticated.displayName,
    });
    if (
      identity.providerId !== providerId ||
      identity.instanceId !== provider.describeConnection().instance
    )
      throw new AppError(
        "PROVIDER_MISMATCH",
        "身份与所选平台实例不匹配。",
        400,
      );
    const gitUsername = authenticated.gitUsername ?? identity.login;
    if (!workspaceSchema.shape.gitUsername.safeParse(gitUsername).success)
      throw new AppError(
        "INVALID_USERNAME",
        "平台未返回有效的 Git 用户名。",
        502,
      );
    return this.lock(async () => {
      signal.throwIfAborted();
      const state = await this.load();
      await this.prune(state);
      const old = this.find(state, cookie);
      const keys = await this.keys(
        state.workspaces.length === 0 &&
          state.sessions.length === 0 &&
          state.legacySelections.length === 0,
      );
      const fingerprint = credentialFingerprint(
        keys.identity,
        providerId,
        identity.instanceId,
        secret,
      );
      let w = state.workspaces.find(
        (w) => w.credentialFingerprint === fingerprint,
      );
      if (!w) {
        if (state.workspaces.length >= 10000)
          throw new AppError("WORKSPACE_LIMIT", "工作台数量达到上限。", 409);
        const base = {
          id: randomUUID(),
          providerId,
          instanceId: identity.instanceId,
        };
        w = {
          ...base,
          credentialFingerprint: fingerprint,
          identity,
          gitUsername,
          label: cleanLabel ?? identity.login,
          preferences: {},
          createdAt: this.now(),
          ...encryptWorkspace(base, secret, keys.credential),
        };
        state.workspaces.push(w);
      } else {
        decryptWorkspace(w, keys.credential);
        w.identity = identity;
        w.gitUsername = gitUsername;
        if (cleanLabel) w.label = cleanLabel;
      }
      if (
        state.sessions.filter((s) => s.workspaceId === w.id && s.id !== old?.id)
          .length >= 32 ||
        state.sessions.length - (old ? 1 : 0) >= 10000
      )
        throw new AppError(
          "SESSION_LIMIT",
          "设备会话数量达到上限，请先退出不用的设备。",
          409,
        );
      const token = randomBytes(32).toString("base64url"),
        now = this.now();
      const device: DeviceSession = {
        id: randomUUID(),
        cookieHash: cookieHash(token),
        workspaceId: w.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + sessionIdleTtl,
        absoluteExpiresAt: now + sessionAbsoluteTtl,
        displayLabel: displayLabel.slice(0, 100) || "浏览器",
      };
      state.sessions = state.sessions.filter((s) => s.id !== old?.id);
      state.sessions.push(device);
      state.legacySelections = state.legacySelections.filter(
        (x) => x.cookieHash !== cookieHash(cookie),
      );
      await this.save(state);
      if (old) this.stopDevice(old);
      return {
        cookie: token,
        session: summary(device, w),
        connection: connectionSummary(w),
      };
    });
  }
  async restore(cookie: string, connectionId: string, signal: AbortSignal) {
    const material = await this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const choice = state.legacySelections
        .find((x) => x.cookieHash === cookieHash(cookie))
        ?.choices.find((x) => x.connectionId === connectionId);
      const workspace = state.workspaces.find(
        (w) => w.id === choice?.workspaceId,
      );
      if (!choice || !workspace) throw denied();
      return {
        workspace,
        secret: decryptWorkspace(
          workspace,
          (await this.keys(false)).credential,
        ),
      };
    });
    const provider = this.registry.get(material.workspace.providerId);
    const authenticated = await provider.authenticate(material.secret, signal);
    const identity = identitySchema.parse({
      providerId: authenticated.providerId,
      instanceId: authenticated.instanceId,
      subjectId: authenticated.subjectId,
      login: authenticated.login,
      displayName: authenticated.displayName,
    });
    if (
      identity.providerId !== material.workspace.providerId ||
      identity.instanceId !== material.workspace.instanceId
    )
      throw new AppError("PROVIDER_MISMATCH", "旧凭据的平台实例不匹配。", 401);
    return this.lock(async () => {
      signal.throwIfAborted();
      const state = await this.load();
      await this.prune(state);
      const selection = state.legacySelections.find(
        (x) => x.cookieHash === cookieHash(cookie),
      );
      if (
        !selection?.choices.some(
          (x) =>
            x.connectionId === connectionId &&
            x.workspaceId === material.workspace.id,
        )
      )
        throw denied();
      const w = state.workspaces.find((w) => w.id === material.workspace.id)!;
      if (w.credentialFingerprint !== material.workspace.credentialFingerprint)
        throw denied();
      if (
        state.sessions.length >= 10000 ||
        state.sessions.filter((s) => s.workspaceId === w.id).length >= 32
      )
        throw new AppError("SESSION_LIMIT", "请先退出不用的设备。", 409);
      w.identity = identity;
      w.gitUsername = authenticated.gitUsername ?? identity.login;
      const token = randomBytes(32).toString("base64url"),
        now = this.now();
      const device: DeviceSession = {
        id: randomUUID(),
        cookieHash: cookieHash(token),
        workspaceId: w.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + sessionIdleTtl,
        absoluteExpiresAt: now + sessionAbsoluteTtl,
        displayLabel: "升级的浏览器",
      };
      state.legacySelections = state.legacySelections.filter(
        (x) => x !== selection,
      );
      state.sessions.push(device);
      await this.save(state);
      return {
        cookie: token,
        session: summary(device, w),
        connection: connectionSummary(w),
      };
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
    if (replaceId) {
      const current = await this.get(cookie);
      if (!current.connections.some((c) => c.id === replaceId)) throw denied();
    }
    return this.login(cookie, providerId, input, undefined, label, signal);
  }
  async remove(cookie: string, id?: string, all = false) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie),
        w = state.workspaces.find((w) => w.id === s?.workspaceId);
      if (
        !s &&
        !id &&
        !all &&
        state.legacySelections.some((x) => x.cookieHash === cookieHash(cookie))
      ) {
        state.legacySelections = state.legacySelections.filter(
          (x) => x.cookieHash !== cookieHash(cookie),
        );
        await this.save(state);
        return summary();
      }
      if (
        !s ||
        !w ||
        (id && id !== w.id && !w.legacyConnectionIds?.includes(id))
      )
        throw denied();
      const removed = state.sessions.filter((x) =>
        all ? x.workspaceId === w.id : x.id === s.id,
      );
      state.sessions = state.sessions.filter((x) => !removed.includes(x));
      await this.save(state);
      removed.forEach((x) => this.stopDevice(x));
      if (all) this.stopWorkspace(w.id);
      return summary();
    });
  }
  async lease(
    cookie: string,
    id: string | undefined,
    signal?: AbortSignal,
    workspaceOwned = false,
  ): Promise<ConnectionLease> {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const s = this.find(state, cookie),
        w = state.workspaces.find((w) => w.id === s?.workspaceId);
      if (
        !s ||
        !w ||
        (id && id !== w.id && !w.legacyConnectionIds?.includes(id))
      )
        throw denied();
      const secret = decryptWorkspace(w, (await this.keys(false)).credential),
        controller = new AbortController(),
        key = `${this.root}/${workspaceOwned ? w.id : s.id}`,
        registry = workspaceOwned ? workspaceOperations() : operations();
      const set = registry.get(key) ?? new Set<AbortController>();
      set.add(controller);
      registry.set(key, set);
      return {
        sessionId: s.id,
        deviceSessionId: s.id,
        workspaceId: w.id,
        connection: connectionSummary(w),
        context: {
          identity: w.identity,
          gitUsername: w.gitUsername,
          secret,
          signal: signal
            ? AbortSignal.any([signal, controller.signal])
            : controller.signal,
        },
        assertCurrent: async () => {
          controller.signal.throwIfAborted();
          const latest = await this.load(),
            current = latest.sessions.find(
              (x) =>
                x.id === s.id &&
                x.workspaceId === w.id &&
                x.expiresAt > this.now() &&
                x.absoluteExpiresAt > this.now(),
            );
          if (
            (!workspaceOwned && !current) ||
            !latest.workspaces.some(
              (x) =>
                x.id === w.id &&
                x.credentialFingerprint === w.credentialFingerprint,
            )
          ) {
            controller.abort();
            throw denied();
          }
        },
        release: () => {
          set.delete(controller);
          if (!set.size && registry.get(key) === set) registry.delete(key);
        },
      };
    });
  }
  workspaceLease(cookie: string, id: string) {
    return this.lease(cookie, id, undefined, true);
  }
  async updatePreferences(
    cookie: string,
    input: unknown,
    expectedWorkspaceId?: string,
  ) {
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError("INVALID_PARAMETER", "工作台偏好不合法。", 400);
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const current = this.find(state, cookie),
        workspace = state.workspaces.find((w) => w.id === current?.workspaceId);
      if (!current || !workspace) throw denied();
      if (expectedWorkspaceId && workspace.id !== expectedWorkspaceId)
        throw new AppError(
          "WORKSPACE_CHANGED",
          "凭据已切换，请在当前工作台重试。",
          409,
        );
      const repository = parsed.data.repository;
      if (
        repository &&
        (repository.providerId !== workspace.providerId ||
          repository.instanceId !== workspace.instanceId)
      )
        throw new AppError(
          "INVALID_PARAMETER",
          "最近仓库必须属于当前平台实例。",
          400,
        );
      workspace.preferences = { ...workspace.preferences, ...parsed.data };
      await this.save(state);
      return workspace.preferences;
    });
  }
  async devices(cookie: string) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const current = this.find(state, cookie);
      if (!current) throw denied();
      return state.sessions
        .filter((s) => s.workspaceId === current.workspaceId)
        .map((s) => ({
          id: s.id,
          label: s.displayLabel,
          current: s.id === current.id,
          createdAt: s.createdAt,
          lastSeenAt: s.lastSeenAt,
          expiresAt: s.expiresAt,
          absoluteExpiresAt: s.absoluteExpiresAt,
        }));
    });
  }
  async revokeDevice(cookie: string, id: string) {
    return this.lock(async () => {
      const state = await this.load();
      await this.prune(state);
      const current = this.find(state, cookie);
      if (!current) throw denied();
      const device = state.sessions.find(
        (s) => s.id === id && s.workspaceId === current.workspaceId,
      );
      if (!device)
        throw new AppError("DEVICE_NOT_FOUND", "设备会话不存在。", 404);
      state.sessions = state.sessions.filter((s) => s !== device);
      await this.save(state);
      this.stopDevice(device);
      return { revoked: true, current: device.id === current.id };
    });
  }
}
export type DeviceSummary = Awaited<
  ReturnType<PersonalSessions["devices"]>
>[number];
export function personalSessions() {
  const root = join(dataDirectory(), "personal-v2"),
    stores = (globals.folioWorkspaceStores ??= new Map());
  let store = stores.get(root);
  if (!store) {
    store = new PersonalSessions(root);
    stores.set(root, store);
  }
  return store;
}
